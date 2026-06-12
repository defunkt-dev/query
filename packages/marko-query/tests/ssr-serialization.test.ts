// @vitest-environment node
//
// Server-render serialization guard for the mutation tag. The node environment is deliberate:
// vitest then uses @marko/vite's HTML (server) transform, so Marko's serializer actually runs --
// the path the jsdom client-mount tests never touch, and where the original "Unable to serialize
// the QueryClient" crash occurred. The mutation's action handlers are functions; the tag attaches
// them on the client only (typeof window guard inside _makeRef), so the server-side result holds
// no functions and serializes cleanly. This test fails with "Unable to serialize ... reading
// mutate" if that gating ever regresses.
//
// ssr-mutation.marko uses an INLINE mutationFn on purpose: a function passed as a PROP cannot be
// serialized across resume (a general Marko constraint), so SSR fixtures define it inline.

import { describe, expect, it } from "vitest";
import SsrMutation from "./fixtures/ssr-mutation.marko";

async function renderToString(template: any, input: Record<string, unknown>): Promise<string> {
  let out = "";
  for await (const chunk of template.render(input)) out += String(chunk);
  return out;
}
function cell(html: string, id: string): string | null {
  const m = html.match(new RegExp(`data-testid=["']?${id}["']?>([^<]*)`));
  return m ? m[1] : null;
}

describe("SSR serialization — mutation", () => {
  it("renders server-side without a serialization crash", async () => {
    await expect(renderToString(SsrMutation, {})).resolves.toBeTypeOf("string");
    const html = await renderToString(SsrMutation, {});
    expect(cell(html, "status")).toBe("idle");
    expect(cell(html, "isIdle")).toBe("true");
  });
});
