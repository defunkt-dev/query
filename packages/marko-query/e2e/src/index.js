// JS server entry. Importing each .marko page from here (rather than ssrLoadModule-ing the
// .marko directly) is what makes @marko/vite treat it as an entry: the generated server entry
// runs addAssets, injecting the browser <script> tags so each page resumes on the client. This
// mirrors @marko/vite's own isomorphic dev-server fixtures.
//
// Multi-route dev server for the e2e suite. Each route maps to a page; routes with a prefetch
// hook run a server-side QueryClient, prefetch, dehydrate to JSON, and hand the page that
// dehydrated state (plus the live client for the server cache-read) on $global -- the
// route-handler recipe the adapter documents. Marko 6's render(input) is an async iterable that
// must be consumed (the render(input, res) form does not drive the stream here and the request
// hangs, which is what made the webServer time out before).

import { QueryClient, dehydrate } from "@tanstack/query-core";

import queryLive from "./page.marko";
import queryPrefetch from "./query-prefetch.marko";
import mutation from "./mutation.marko";
import infinite from "./infinite.marko";
import aggregates from "./aggregates.marko";
import queryClient from "./query-client.marko";
import invalidate from "./invalidate.marko";
import errorPage from "./error.marko";
import queries from "./queries.marko";
import devtools from "./devtools.marko";

const routes = {
  "/": { page: queryLive },
  "/query-prefetch": {
    page: queryPrefetch,
    prefetch: (qc) =>
      qc.prefetchQuery({ queryKey: ["noflash"], queryFn: () => Promise.resolve("server-data") }),
  },
  "/mutation": { page: mutation },
  "/infinite": { page: infinite },
  "/aggregates": { page: aggregates },
  "/query-client": { page: queryClient },
  "/invalidate": { page: invalidate },
  "/error": { page: errorPage },
  "/queries": { page: queries },
  "/devtools": { page: devtools },
};

export async function handler(req, res, next) {
  const url = (req.url || "/").split("?")[0];
  const route = routes[url];
  if (!route) {
    if (next) next();
    return;
  }

  const $global = { serializedGlobals: {} };
  if (route.prefetch) {
    const qc = new QueryClient();
    qc.mount();
    await route.prefetch(qc);
    $global.__tanstack_dehydrated = dehydrate(qc);
    $global.serializedGlobals.__tanstack_dehydrated = true;
    $global.__tanstack_queryClient = qc;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  for await (const chunk of route.page.render({ $global })) {
    res.write(chunk);
  }
  res.end();
}