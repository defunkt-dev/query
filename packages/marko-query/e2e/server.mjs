// Dev SSR server for the e2e suite, mirroring @marko/vite's own isomorphic dev-server
// fixtures. The important detail learned the hard way: it loads the JS entry (src/index.js),
// which imports the pages, rather than ssrLoadModule-ing the .marko pages directly. Only the
// JS-entry path gets @marko/vite's server-entry treatment that injects the browser <script>
// tags -- without it a page renders but never resumes (no client JS).
//
// Config is passed inline with configFile:false (so vite.config.mjs is not needed; you can
// delete it). @marko/vite is required via createRequire and .default, the interop form its
// own fixtures use.
//
// query-core resolution: src/index.js imports QueryClient/dehydrate on the server for the
// prefetch route. In the monorepo query-core resolves to its TypeScript source via the
// "@tanstack/custom-condition" export, but in Vite 6 that condition belongs to the client
// environment and does not reach the SSR resolver, so the SSR graph fails to find an entry
// (the built dist is not present in a dev checkout). A resolve.alias to the source entry is
// deterministic and applies to both environments, so it is used instead of fighting
// conditions. Adjust the path if query-core's source entry is not packages/query-core/src/
// index.ts. ssr.noExternal keeps Vite (not Node) transforming it.

import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import { createServer as createViteServer } from "vite";

const require = createRequire(import.meta.url);
const marko = require("@marko/vite").default;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = 5188;

const devServer = await createViteServer({
  root: __dirname,
  configFile: false,
  appType: "custom",
  logLevel: "warn",
  plugins: [marko()],
  resolve: {
    alias: {
      "@tanstack/query-core": path.join(__dirname, "../../query-core/src/index.ts"),
    },
  },
  ssr: { noExternal: ["@tanstack/query-core"] },
  optimizeDeps: { force: true },
  server: { ws: false, hmr: false, middlewareMode: true },
  build: { assetsInlineLimit: 0 },
});

devServer.middlewares.use(async (req, res, next) => {
  try {
    const { handler } = await devServer.ssrLoadModule(
      path.join(__dirname, "./src/index.js"),
    );
    await handler(req, res, next);
  } catch (err) {
    devServer.ssrFixStacktrace(err);
    next(err);
  }
});

createHttpServer(devServer.middlewares).listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`e2e server on http://localhost:${PORT}`);
});
