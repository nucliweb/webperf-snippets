const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { parseGitLog, pageFile, pageLastModified, readGitDates } = require("./page-dates");

// `git log --format=%x00%cI --name-only`: the newest commit first, each one a NUL, its date and its files
const LOG = [
  "\x002026-11-10T09:00:00+01:00",
  "",
  "content/Loading/TTFB.mdx",
  "\x002026-11-08T12:00:00+01:00",
  "",
  "snippets/Loading/TTFB.js",
  "content/index.mdx",
  "\x002026-10-01T08:00:00+02:00",
  "",
  "content/Loading/TTFB.mdx",
  "snippets/Loading/TTFB-Sub-Parts.js",
  "",
].join("\n");

test("parseGitLog keeps the date of the last commit that changed each file", () => {
  const dates = parseGitLog(LOG);
  assert.equal(dates.get("content/Loading/TTFB.mdx"), "2026-11-10T09:00:00+01:00");
  assert.equal(dates.get("snippets/Loading/TTFB.js"), "2026-11-08T12:00:00+01:00");
  assert.equal(dates.get("snippets/Loading/TTFB-Sub-Parts.js"), "2026-10-01T08:00:00+02:00");
  assert.equal(dates.size, 4);
});

test("pageFile finds the MDX of a route, the index of a folder too", () => {
  const exists = (file) => ["content/index.mdx", "content/Loading/TTFB.mdx", "content/DevTools-Overrides/index.mdx"].includes(file);
  assert.equal(pageFile("/", exists), "content/index.mdx");
  assert.equal(pageFile("/Loading/TTFB", exists), "content/Loading/TTFB.mdx");
  assert.equal(pageFile("/DevTools-Overrides", exists), "content/DevTools-Overrides/index.mdx");
  assert.equal(pageFile("/Nope", exists), null);
});

test("pageLastModified is the newest date of the page and of the snippets it shows", () => {
  const dates = parseGitLog(LOG);
  // The page changed last
  assert.equal(pageLastModified("content/Loading/TTFB.mdx", ["Loading/TTFB", "Loading/TTFB-Sub-Parts"], dates), "2026-11-10T09:00:00+01:00");
  // A snippet changed after the page
  const older = new Map([...dates, ["content/Loading/TTFB.mdx", "2026-09-01T00:00:00Z"]]);
  assert.equal(pageLastModified("content/Loading/TTFB.mdx", ["Loading/TTFB"], older), "2026-11-08T12:00:00+01:00");
  // Nothing known: no date rather than a wrong one
  assert.equal(pageLastModified("content/CLI.mdx", [], dates), undefined);
});

// A repository of two commits, cloned whole and with one commit only
test("readGitDates reads the dates of a whole history, and none from a shallow clone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "page-dates-"));
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-02T03:04:05Z", GIT_COMMITTER_DATE: "2026-01-02T03:04:05Z" } });
  try {
    const repo = path.join(dir, "repo");
    fs.mkdirSync(path.join(repo, "content"), { recursive: true });
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    fs.writeFileSync(path.join(repo, "content", "a.mdx"), "a");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "a");
    fs.writeFileSync(path.join(repo, "content", "b.mdx"), "b");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "b");

    const dates = readGitDates(repo);
    assert.equal(dates.get("content/a.mdx"), "2026-01-02T03:04:05Z");

    const shallow = path.join(dir, "shallow");
    git(dir, "clone", "-q", "--depth=1", `file://${repo}`, shallow);
    assert.equal(readGitDates(shallow), null);

    assert.equal(readGitDates(path.join(dir, "not-a-repo")), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
