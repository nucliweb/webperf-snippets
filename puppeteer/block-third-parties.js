const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  const options = {
    waitUntil: "networkidle2",
    timeout: 30000,
  };

  // Before: Normal navigtation
  await page.goto("https://www.coach.com/", options);
  await page.screenshot({ path: "before.png", fullPage: true });
  const metrics = await page.metrics();
  console.info(metrics);

  // After: Navigation with some domains blocked

  // Array of third-party domains to block
  const blockedDomains = ["https://www.googletagmanager.com"];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (blockedDomains.some((d) => url.startsWith(d))) {
      request.abort();
    } else {
      request.continue();
    }
  });

  await page.goto("https://wwww.coach.com/", options);
  await page.screenshot({ path: "after.png", fullPage: true });

  const metricsAfter = await page.metrics();
  console.info(metricsAfter);

  await browser.close();
})();
