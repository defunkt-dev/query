// Dev SSR server for the resume-liveness probe, mirroring @marko/vite's own isomorphic
// dev-server fixtures. The important detail learned the hard way: it loads the JS entry
// (src/index.js), which imports the page, rather than ssrLoadModule-ing the .marko page
// directly. Only the JS-entry path gets @marko/vite's server-entry treatment that injects
// the browser <script> tags -- without it the page renders but never resumes (no client JS).
//
// Config is passed inline with configFile:false (so vite.config.mjs is not needed; you can
// delete it). @marko/vite is required via createRequire and .default, the interop form its
// own fixtures use. The only extra dependency to run this is @playwright/test; vite and
// @marko/vite are already devDependencies of the package.

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
  // @tanstack/query-core is a workspace package with no built output; it exposes its TS
  // source only via this custom export condition. The package's own vitest config sets the
  // same condition. Without it, the client build cannot resolve query-core.
  resolve: { conditions: ["@tanstack/custom-condition"] },
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
  console.log(`resume-liveness e2e server on http://localhost:${PORT}`);
});
