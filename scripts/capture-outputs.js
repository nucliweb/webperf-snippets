#!/usr/bin/env node
// Runs each snippet in a headless browser and captures console output.
// Writes results to snippets/outputs.json

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SNIPPETS_DIR = path.join(ROOT, "snippets");
const OUTPUT_FILE = path.join(SNIPPETS_DIR, "outputs.json");

// Collect all .js files recursively from snippets/
function getSnippetFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getSnippetFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

// Convert absolute path to a relative key like "CoreWebVitals/LCP"
function fileToKey(filePath) {
  const rel = path.relative(SNIPPETS_DIR, filePath);
  return rel.replace(/\.js$/, "");
}

async function captureOutput(browser, code) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];

  // Capture all console messages
  page.on("console", (msg) => {
    const type = msg.type(); // log, warn, error, info, etc.
    const text = msg.text();
    logs.push({ type, text });
  });

  // Navigate to a blank page (snippets use browser APIs like performance)
  await page.goto("about:blank");

  try {
    // Execute the snippet code in the page context
    await page.evaluate(code);
    // Give async snippets time to finish
    await page.waitForTimeout(200);
  } catch (err) {
    logs.push({ type: "error", text: `Execution error: ${err.message}` });
  }

  await context.close();
  return logs;
}

// Remove %c directives and their associated CSS style arguments
// e.g. "%cLCP Active font-weight: bold" → "LCP Active"
function cleanConsoleText(text) {
  // Split on CSS style args that follow %c (they look like CSS property strings)
  // Strategy: remove %c, then remove the CSS strings that follow as separate tokens
  let result = text;

  // Remove %c placeholders
  result = result.replace(/%c/g, "");

  // Remove CSS style strings — they appear as standalone segments containing
  // CSS properties like "font-weight: bold; font-size: 14px;"
  result = result
    .split("\n")
    .map((line) =>
      // A line is a CSS style arg if it matches "prop: value;" pattern and
      // has no normal words/sentences (no spaces before the first colon)
      /^[\w-]+\s*:/.test(line.trim()) && !/^(https?|file):/.test(line.trim())
        ? null
        : line,
    )
    .filter((line) => line !== null)
    .join("\n");

  // Also remove inline CSS blobs that ended up on same line after %c removal
  // e.g. "LCP Active font-weight: bold; font-size: 14px;"
  result = result.replace(/\s+([\w-]+\s*:[^;]+;(\s*[\w-]+\s*:[^;]+;)*)/g, "");

  return result.trim();
}

function formatLogs(logs) {
  return logs
    .filter((l) => l.text && l.text.trim() !== "")
    .map((l) => cleanConsoleText(l.text))
    .filter((t) => t !== "")
    .join("\n");
}

async function main() {
  const snippetFiles = getSnippetFiles(SNIPPETS_DIR);
  console.log(`Found ${snippetFiles.length} snippets\n`);

  const browser = await chromium.launch();
  const results = {};

  for (const file of snippetFiles) {
    const key = fileToKey(file);
    const code = fs.readFileSync(file, "utf-8");

    process.stdout.write(`  Running: ${key} ... `);

    try {
      const logs = await captureOutput(browser, code);
      const output = formatLogs(logs);
      results[key] = { output: output || "(no output)", error: null };
      console.log("✓");
    } catch (err) {
      results[key] = { output: null, error: err.message };
      console.log(`✗ ${err.message}`);
    }
  }

  await browser.close();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nOutputs saved to snippets/outputs.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
