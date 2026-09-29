import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../fixtures");
const SNIPPETS = resolve(HERE, "../../../snippets");

export const CATEGORIES = ["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"];
export const STATUSES = ["ok", "tracking", "error", "unsupported"];
export const MAX_ITEMS = 50;
export const MAX_BYTES = 50_000;

export function listSnippets() {
  return CATEGORIES.flatMap((category) =>
    readdirSync(join(SNIPPETS, category))
      .filter((f) => f.endsWith(".js"))
      .map((f) => `${category}/${f.replace(/\.js$/, "")}`)
  );
}

const SEEDED_PAGE = (other) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Contract fixture</title>
  <link rel="preconnect" href="${other}">
  <link rel="preload" href="/app.js" as="script">
  <link rel="stylesheet" href="/style.css">
  <style>body{margin:0}.box{width:200px;height:20px;will-change:transform}</style>
  <script src="${other}/third.js"></script>
  <script src="/async.js" async></script>
  <script src="/app.js" defer></script>
</head>
<body>
  <div id="banner" style="height:20px;background:#eee">banner</div>
  <h1>Contract fixture</h1>
  <button id="go" onclick="(function(){const b=document.getElementById('banner');b.style.height='40px';void b.offsetHeight;const t=performance.now();while(performance.now()-t<60){}})()">go</button>
  <div class="box">box</div>
  <img id="hero" src="/hero.png" width="600" height="400" alt="hero" fetchpriority="high">
  <img src="/hero.png?b" width="300" height="200" alt="lazy" loading="lazy" fetchpriority="high">
  <div style="height:1500px"></div>
  <img src="/hero.png?c" width="300" height="200" alt="below">
  <video width="300" height="150" poster="/hero.png?v"></video>
  <img src="${other}/bitmap.svg" width="20" height="20" alt="svg">
  <iframe src="/frame" width="200" height="100"></iframe>
  <script>window.addEventListener("scroll", function () {});</script>
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"items":[1,2,3],"user":{"name":"a"}}},"page":"/","buildId":"x"}</script>
  <script>
    setTimeout(() => { document.getElementById("banner").style.height = "120px"; }, 300);
    setTimeout(() => { const t = performance.now(); while (performance.now() - t < 120) {} }, 500);
  </script>
</body>
</html>`;

// A page with named work and elements to interact with, for tests of what interaction
// snippets return. `?tasks=N` adds N extra long tasks.
const BEHAVIORS_PAGE = (query) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Behaviors fixture</title>
  <style>#willy{will-change:transform;width:50px;height:50px}#ov{overscroll-behavior:contain;overflow:auto;height:50px}</style>
</head>
<body style="margin:0">
  <div id="banner" style="height:20px;background:#eee">banner</div>
  <div id="late" style="height:20px;background:#ddd">late</div>
  <button id="slow">slow</button>
  <button id="mid">mid</button>
  <button id="fsl">fsl</button>
  <div id="willy">w</div>
  <div id="ov"><div style="height:200px">o</div></div>
  <div id="box" style="width:10px;height:10px"></div>
  <div style="height:1500px"></div>
  <script>
    function heavyWork(ms) { const t = performance.now(); while (performance.now() - t < ms) {} }
    document.getElementById("slow").addEventListener("click", function slowClick() { heavyWork(260); });
    document.getElementById("mid").addEventListener("click", function midClick() { heavyWork(25); });
    document.getElementById("fsl").addEventListener("click", function forceLayouts() {
      const b = document.getElementById("box");
      for (let i = 0; i < 30; i++) { b.style.setProperty("width", (10 + i) + "px"); void b.offsetWidth; void b.getBoundingClientRect(); }
    });
    setTimeout(function startupWork() { heavyWork(150); }, 500);
    setTimeout(() => { document.getElementById("banner").style.height = "120px"; }, 300);
    setTimeout(() => { document.getElementById("late").style.height = "80px"; }, 700);
    const extra = Number(new URLSearchParams(${JSON.stringify(query)}).get("tasks") || 0);
    for (let i = 0; i < extra; i++) setTimeout(() => heavyWork(60), 1000 + i * 80);
  </script>
</body>
</html>`;

// Many elements and requests, to expose snippets that return unbounded lists.
const HEAVY_PAGE = (other) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Heavy fixture</title>
  ${Array.from({ length: 70 }, (_, i) => `<script src="/s${i}.js" async></script>`).join("\n  ")}
  ${Array.from({ length: 12 }, (_, i) => `<script src="${other}/t${i}.js" async></script>`).join("\n  ")}
  ${Array.from({ length: 60 }, (_, i) => `<link rel="preconnect" href="http://127.0.0.${(i % 200) + 2}:9${i}">`).join("\n  ")}
  <style>${Array.from({ length: 80 }, (_, i) => `.c${i}{will-change:transform;overscroll-behavior:contain}`).join("")}</style>
</head>
<body>
  <button id="go" onclick="for(let i=0;i<120;i++){const b=document.getElementById('box');b.style.width=(10+i)+'px';void b.offsetWidth}">go</button>
  <div id="box" style="width:10px;height:10px"></div>
  ${Array.from({ length: 90 }, (_, i) => `<div class="c${i % 80}"><img src="/hero.png?i${i}" width="100" height="60" alt="i${i}" ${i % 2 ? 'loading="lazy"' : ""}></div>`).join("\n  ")}
  ${Array.from({ length: 30 }, (_, i) => `<span style="will-change:opacity">${i}</span>`).join("")}
  <script>
    for (let i = 0; i < 60; i++) window.addEventListener("wheel", function () {});
    for (let i = 0; i < 60; i++) { const s = document.createElement("script"); s.textContent = "window.__i" + i + "=" + i; document.body.appendChild(s); }
  </script>
</body>
</html>`;

// Runs in the page: reports values that cannot travel as JSON and returns the JSON text.
function inspectInPage(value) {
  const violations = new Set();
  const ancestors = new Set();
  const walk = (v, depth) => {
    if (v === null || v === undefined) return;
    if (typeof v === "function") return violations.add("not-serializable");
    if (typeof v !== "object") return;
    if (ancestors.has(v)) return violations.add("not-serializable");
    if (
      v instanceof Node ||
      v instanceof Map ||
      v instanceof Set ||
      (typeof PerformanceEntry !== "undefined" && v instanceof PerformanceEntry)
    ) {
      return violations.add("not-serializable");
    }
    if (depth > 8) return;
    ancestors.add(v);
    for (const key of Object.keys(v)) walk(v[key], depth + 1);
    ancestors.delete(v);
  };
  walk(value, 0);
  let json = null;
  try {
    json = value === undefined ? null : JSON.stringify(value);
  } catch {
    violations.add("not-serializable");
  }
  return { json, inPage: [...violations], wasUndefined: value === undefined };
}

// Checks one returned value. `prefix` tells snippet results apart from getter results.
export function checkResult(name, inspected, prefix = "") {
  const found = new Set(inspected.inPage.map((v) => prefix + v));
  const add = (v) => found.add(prefix + v);
  if (inspected.wasUndefined || inspected.json === null) {
    add("undefined-return");
    return found;
  }
  const result = JSON.parse(inspected.json);
  if (typeof result !== "object" || Array.isArray(result)) {
    add("undefined-return");
    return found;
  }
  if (typeof result.script !== "string" || result.script === "") add("missing-script");
  else if (!prefix && result.script !== name.split("/").pop()) add("script-name-mismatch");
  if (!STATUSES.includes(result.status)) add("invalid-status");
  if (inspected.json.length > MAX_BYTES) add("too-large");

  const numericKey = /(Ms|Bytes|Count)$/;
  const looksNumeric = (s) => typeof s === "string" && /^-?\d[\d.,]*\s*[a-zA-Z%]*$/.test(s.trim());
  const scan = (obj, depth) => {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "value" || numericKey.test(k)) && looksNumeric(v)) add("numeric-string");
      scan(v, depth + 1);
    }
  };
  scan(result, 0);

  if (Array.isArray(result.items)) {
    if (result.items.length > MAX_ITEMS) add("items-uncapped");
    const shapes = new Set(
      result.items
        .filter((i) => i && typeof i === "object")
        .map((i) => Object.keys(i).sort().join(","))
    );
    if (shapes.size > 1) add("items-not-homogeneous");
  }
  return found;
}

export async function startContractServers() {
  const listen = (handler) =>
    new Promise((res) => {
      const s = createServer(handler);
      s.listen(0, "127.0.0.1", () => res(s));
    });
  const png = readFileSync(join(FIXTURES, "hero.png"));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image width="10" height="10" xlink:href="data:image/png;base64,${png.toString("base64").slice(0, 200)}"/></svg>`;
  const other = await listen((req, res) => {
    if (req.url.startsWith("/bitmap.svg")) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "*" });
      return res.end(svg);
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end("window.__third = true;");
  });
  const otherUrl = `http://127.0.0.1:${other.address().port}`;
  const main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const query = req.url.split("?")[1] ?? "";
    const send = (type, body) => {
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    };
    if (path === "/empty") return send("text/html", "<!DOCTYPE html><html><head><title>e</title></head><body><h1>Empty</h1></body></html>");
    if (path === "/seeded") return send("text/html", SEEDED_PAGE(otherUrl));
    if (path === "/behaviors") return send("text/html", BEHAVIORS_PAGE(query));
    if (path === "/heavy") return send("text/html", HEAVY_PAGE(otherUrl));
    if (path === "/frame") return send("text/html", "<p>frame</p>");
    if (path === "/hero.png") return send("image/png", png);
    if (path === "/style.css") return send("text/css", "h1{color:#333}");
    if (path.endsWith(".js")) return send("application/javascript", "window.__app = true;");
    res.writeHead(404);
    res.end();
  });
  const base = `http://127.0.0.1:${main.address().port}`;
  return {
    base,
    close: () => Promise.all([main, other].map((s) => new Promise((r) => s.close(r)))),
  };
}

// Runs a snippet on a page, drives some interaction, calls its getter when it tracks,
// and returns the set of contract violations found.
export async function observeSnippet(browser, base, name, pageName) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${base}/${pageName}`, { waitUntil: "load" });
    await page.waitForTimeout(pageName === "empty" ? 200 : 800);
    const source = loadSnippet(name).trim().replace(/;\s*$/, "");
    const run = (expr) =>
      page.evaluate(
        async ({ expr, inspectSrc }) => {
          const inspect = new Function(`return ${inspectSrc}`)();
          return inspect(await (0, eval)(expr));
        },
        { expr, inspectSrc: inspectInPage.toString() }
      );

    const first = await run(source);
    const found = checkResult(name, first);
    const result = first.json ? JSON.parse(first.json) : null;

    if (result?.status === "tracking") {
      if (typeof result.getDataFn !== "string" || result.getDataFn === "") {
        found.add("tracking-without-getter");
      } else {
        // getDataFn can be a path such as "loafHelpers.getData"
        const exists = await page.evaluate(
          (fn) => typeof fn.split(".").reduce((o, k) => o?.[k], window) === "function",
          result.getDataFn
        );
        if (!exists) found.add("tracking-without-getter");
        else {
          if (pageName !== "empty") {
            await page.click("#go");
            await page.keyboard.press("Tab");
            await page.mouse.wheel(0, 900);
            await page.waitForTimeout(400);
          }
          const second = await run(`window.${result.getDataFn}()`);
          for (const v of checkResult(name, second, "getter:")) found.add(v);
        }
      }
    }
    return found;
  } finally {
    await page.close();
  }
}

export const launch = () => chromium.launch();
