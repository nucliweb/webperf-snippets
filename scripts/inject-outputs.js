const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT, "pages");
const SNIPPETS_DIR = path.join(ROOT, "snippets");
const OUTPUT_FILE = path.join(SNIPPETS_DIR, "outputs.json");

if (!fs.existsSync(OUTPUT_FILE)) {
  console.error(
    "snippets/outputs.json not found. Run capture-outputs.js first.",
  );
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));

function getMdxFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getMdxFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".mdx")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function extractKeyFromImport(importLine) {
  const match = importLine.match(/snippets\/(.+?)\.js\?raw/);
  return match ? match[1] : null;
}

function getSnippetImports(content) {
  const map = {};
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.includes("snippets/") || !line.includes("?raw")) continue;
    const varMatch = line.match(/import\s+(\w+)\s+from/);
    const key = extractKeyFromImport(line);
    if (varMatch && key) {
      map[varMatch[1]] = key;
    }
  }
  return map;
}

function processFile(mdxPath) {
  let content = fs.readFileSync(mdxPath, "utf-8");
  const rel = path.relative(ROOT, mdxPath);

  const snippetImports = getSnippetImports(content);
  if (Object.keys(snippetImports).length === 0) return false;

  let changed = false;

  for (const [varName, outputKey] of Object.entries(snippetImports)) {
    const outputData = outputs[outputKey];
    if (!outputData || !outputData.output) continue;

    const outputText = outputData.output;

    const withoutOutput = new RegExp(
      `<Snippet\\s+code=\\{${varName}\\}\\s*/>`,
      "g",
    );
    const withOutput = new RegExp(
      `<Snippet\\s+code=\\{${varName}\\}\\s+output=\\{[^}]+\\}\\s*/>`,
      "g",
    );

    const escaped = outputText
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");

    const replacement = `<Snippet code={${varName}} output={\`${escaped}\`} />`;

    if (withoutOutput.test(content)) {
      content = content.replace(withoutOutput, replacement);
      changed = true;
    } else if (withOutput.test(content)) {
      content = content.replace(withOutput, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(mdxPath, content);
    console.log(`  updated: ${rel}`);
  }

  return changed;
}

const mdxFiles = getMdxFiles(PAGES_DIR);
console.log(`Processing ${mdxFiles.length} MDX files...\n`);

let updatedCount = 0;
for (const file of mdxFiles) {
  if (processFile(file)) updatedCount++;
}

console.log(`\nDone. Updated ${updatedCount} files.`);
