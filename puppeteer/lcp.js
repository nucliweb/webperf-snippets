const puppeteer = require("puppeteer");
const devices = require("puppeteer/DeviceDescriptors");

const phone = devices.devicesMap["Nexus 5X"];

/**
 * Measure LCP
 */
function calculateLCP() {
  window.largestContentfulPaint = 0;

  const observer = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const lastEntry = entries[entries.length - 1];
    window.largestContentfulPaint = lastEntry.renderTime || lastEntry.loadTime;
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      observer.disconnect();
      console.log("LCP:", window.largestContentfulPaint);
    }
  });
}
const networkConditions = {
  "Slow 3G": {
    download: ((500 * 1000) / 8) * 0.8,
    upload: ((500 * 1000) / 8) * 0.8,
    latency: 400 * 5,
  },
  "Fast 3G": {
    download: ((1.6 * 1000 * 1000) / 8) * 0.9,
    upload: ((750 * 1000) / 8) * 0.9,
    latency: 150 * 3.75,
  },
};

/**
 * Get LCP for a provided URL
 * @param {*} url
 * @return {Number} lcp
 */
async function getLCP(url) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox"],
    timeout: 10000,
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    await client.send("Network.enable");
    await client.send("ServiceWorker.enable");
    // await page.emulateNetworkConditions(networkConditions["Fast 3G"]);
    // await page.emulateCPUThrottling(4);
    await page.emulate(phone);

    await page.evaluateOnNewDocument(calculateLCP);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });

    const lcp = await page.evaluate(() => {
      return window.largestContentfulPaint;
    });
    browser.close();
    return lcp;
  } catch (error) {
    console.log(error);
    browser.close();
  }
}

getLCP("https://mw-production1.coach.com").then((lcp) =>
  console.log("LCP is: " + lcp)
);
