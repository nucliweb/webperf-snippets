// modified from https://github.com/addyosmani/puppeteer-webperf

const puppeteer = require("puppeteer");
const fs = require("fs");

const url = "https://mw-production1.coach.com/";

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Gather coverage for JS and CSS files
  await Promise.all([
    page.coverage.startJSCoverage(),
    page.coverage.startCSSCoverage(),
  ]);

  await page.goto(url);

  // Stops the coverage gathering
  const [jsCoverage, cssCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);

  // Calculates # bytes being used based on the coverage
  const calculateUsedBytes = (type, coverage) =>
    coverage.map(({ url, ranges, text }) => {
      let usedBytes = 0;

      ranges.forEach((range) => (usedBytes += range.end - range.start - 1));

      return {
        url,
        type,
        usedBytes,
        totalBytes: text.length,
        percentUsed: `${((usedBytes / text.length) * 100).toFixed(2)}%`,
      };
    });

  // console.info([
  //   ...calculateUsedBytes("js", jsCoverage),
  //   ...calculateUsedBytes("css", cssCoverage),
  // ]);

  const nextChunks = calculateUsedBytes("js", jsCoverage).filter(({ url }) =>
    url.includes("_next/static/chunks")
  );
  console.log(nextChunks);

  const chunks = JSON.stringify(nextChunks, null, 2);

  // const js = JSON.stringify(calculateUsedBytes("js", jsCoverage), null, 2);
  // const css = JSON.stringify(calculateUsedBytes("css", cssCoverage), null, 2);

  // fs.writeFileSync("./results/js-coverage-pdp.json", js);
  // fs.writeFileSync("./results/css-coverage.json", css);

  fs.writeFileSync("./results/chunks/hp.json", chunks);

  await browser.close();
})();
