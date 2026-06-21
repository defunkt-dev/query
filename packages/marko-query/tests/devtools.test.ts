import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@marko/testing-library";
import type { QueryClient } from "@tanstack/query-core";
import { createTestQueryClient } from "./helpers";

// The panel itself is TanStack's (a Solid app); these tests target OUR wiring, so we mock
// @tanstack/query-devtools with a recording stub. The tag dynamic-imports it, and vitest's mocker
// intercepts dynamic imports too, so the stub is what the tag constructs and mounts.
const h = vi.hoisted(() => ({
  calls: {
    constructed: [] as Array<any>,
    mountedInto: [] as Array<any>,
    unmounted: 0,
    instances: [] as Array<any>,
  },
}));

vi.mock("@tanstack/query-devtools", () => {
  class TanstackQueryDevtools {
    config: any;
    unmounted = false;
    unmountCount = 0;
    constructor(config: any) {
      this.config = config;
      h.calls.constructed.push(config);
      h.calls.instances.push(this);
    }
    mount(el: any) {
      h.calls.mountedInto.push(el);
    }
    unmount() {
      this.unmounted = true;
      this.unmountCount++;
      h.calls.unmounted++;
    }
    setButtonPosition() {}
    setPosition() {}
    setInitialIsOpen() {}
    setErrorTypes() {}
    setClient() {}
    setTheme() {}
  }
  return { TanstackQueryDevtools };
});

import Devtools from "../tags/query-devtools/index.marko";
import DevtoolsInProvider from "./fixtures/devtools-in-provider.marko";
import DevtoolsToggle from "./fixtures/devtools-toggle.marko";

describe("<query-devtools>", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    h.calls.constructed.length = 0;
    h.calls.mountedInto.length = 0;
    h.calls.unmounted = 0;
    h.calls.instances.length = 0;
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
    cleanup();
  });

  it("renders a parent container", async () => {
    const { container } = await render(Devtools, {
      $global: { __tanstack_queryClient: queryClient },
    });
    expect(container.querySelector(".tsqd-parent-container")).not.toBeNull();
  });

  it("creates the panel with the Marko Query flavor and mounts it into the container", async () => {
    const { container } = await render(Devtools, {
      $global: { __tanstack_queryClient: queryClient },
    });

    // The panel is created/mounted via an async dynamic import in onMount; allow it to settle.
    await waitFor(() => {
      expect(h.calls.constructed.length).toBe(1);
    });

    const config = h.calls.constructed[0];
    expect(config.queryFlavor).toBe("Marko Query");
    expect(config.version).toBe("5");
    expect(config.client).toBe(queryClient);
    expect(config.onlineManager).toBeDefined();
    expect(h.calls.mountedInto[0]).toBe(
      container.querySelector(".tsqd-parent-container"),
    );
  });

  it("unmounts the panel on teardown", async () => {
    // A <script>'s teardown is queued by Marko and only flushed by a reactive change; a bare
    // cleanup() never flushes it (a test-harness artifact -- verified against the Marko runtime). So
    // we exercise a real unmount the way an app does it: the devtools sits inside an <if> and we
    // toggle it off. That reactive change tears the scope down and flushes the queued teardown.
    const { getByTestId } = await render(DevtoolsToggle, {
      $global: { __tanstack_queryClient: queryClient },
    });
    await waitFor(() => {
      expect(h.calls.constructed.length).toBe(1);
    });

    // Assert on THIS panel instance, not the global unmount count: the other tests above mount panels
    // and end on a bare cleanup, leaving their teardowns queued, and this test's toggle is the first
    // reactive change in the file -- so it flushes those too, inflating the global count. Checking our
    // own instance is both correct (it is precisely what "this devtools unmounted its panel" means)
    // and immune to that accumulation.
    const panel = h.calls.instances[h.calls.instances.length - 1];
    expect(panel.unmounted).toBe(false);

    fireEvent.click(getByTestId("hide-devtools"));

    await waitFor(() => {
      expect(panel.unmounted).toBe(true);
    });

    // Exactly once -- no churn on teardown. (The other tests' queued teardowns also flush on this
    // toggle, so a global count would be inflated; this asserts THIS panel's own unmount fired a
    // single time, which the onabort guard guarantees by nulling the panel after unmounting.)
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel.unmountCount).toBe(1);
  });

  it("mounts when nested under a provider (finds the published client)", async () => {
    // Realistic wiring: the provider creates the client, puts it on the shared $global, and
    // publishes; the devtools finds it on the same $global and mounts. (The late-arrival bus wake
    // -- the devtools subscribing before the client exists -- is the resume ordering, which a
    // client-side render cannot reproduce because it mounts parent-before-child; the /devtools e2e
    // covers that path in a real browser.)
    await render(DevtoolsInProvider, {});

    await waitFor(() => {
      expect(h.calls.constructed.length).toBe(1);
    });
    expect(h.calls.constructed[0].client).toBeDefined();
  });

  it("accepts an explicit client prop over the one on $global", async () => {
    const explicit = createTestQueryClient();
    try {
      await render(Devtools, {
        client: explicit,
        $global: { __tanstack_queryClient: queryClient },
      });
      await waitFor(() => {
        expect(h.calls.constructed.length).toBe(1);
      });
      expect(h.calls.constructed[0].client).toBe(explicit);
    } finally {
      explicit.clear();
      explicit.unmount();
    }
  });
});