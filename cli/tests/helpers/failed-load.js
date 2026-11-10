import { createServer } from "node:net";

// A load that fails the same way in the headless shell and in the full Chromium. A connection the server
// closes is not enough: the full Chromium sends the request again, once, and that second load succeeds.
// A redirect to a port nobody listens on fails with ERR_CONNECTION_REFUSED, which it does not retry.
const closedPort = await new Promise((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

export const CLOSED_ORIGIN = `http://127.0.0.1:${closedPort}/`;

export const failLoad = (res) => res.writeHead(302, { Location: CLOSED_ORIGIN }).end();
