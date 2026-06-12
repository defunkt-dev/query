// JS server entry. Importing the .marko page from here (rather than ssrLoadModule-ing the
// .marko directly) is what makes @marko/vite treat it as an entry: the generated server
// entry runs addAssets, injecting the browser <script> tags so the page resumes on the
// client. This mirrors @marko/vite's own isomorphic dev-server fixtures.

import page from "./page.marko";

export async function handler(req, res, next) {
  if (req.url === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Marko 6's render(input) is an async iterable that must be consumed. The
    // render(input, res) form does not drive the stream in this setup, so the response
    // never ends and the request hangs (which is what made the webServer time out). The
    // @marko/vite client asset tags are part of these chunks.
    for await (const chunk of page.render({})) {
      res.write(chunk);
    }
    res.end();
  } else if (next) {
    next();
  }
}