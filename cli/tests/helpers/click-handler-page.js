import { createServer } from "node:http";

// A product page whose "Buy" button blocks the main thread for `?ms=` milliseconds when clicked, then
// paints: the same page with a faster or a slower click handler, for the INP of a baseline and of a
// regression. The work runs by the clock, so the time of the handler does not depend on the CPU, and a
// slower handler is slower whatever the throttling.
const page = (ms) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Product</title></head><body>
<h1>Product</h1>
<button id="buy" style="width:200px;height:60px">Buy</button>
<p id="status">Not in the cart</p>
<script>
  document.getElementById("buy").addEventListener("click", function addToCart() {
    const end = performance.now() + ${ms};
    while (performance.now() < end) {}
    document.getElementById("status").textContent = "In the cart";
  });
</script></body></html>`;

// Serves /buy?ms=N on a free port of localhost. Returns its base URL and how to close it.
export async function startClickHandlerServer() {
  const server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== "/buy") return res.writeHead(404).end();
      const ms = Math.max(0, Number(url.searchParams.get("ms") ?? 0));
      res.writeHead(200, { "Content-Type": "text/html" }).end(page(ms));
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
