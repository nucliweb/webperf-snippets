import globals from "globals";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  require: "readonly",
  module: "readonly",
  exports: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  fetch: "readonly",
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  performance: "readonly",
  PerformanceObserver: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  fetch: "readonly",
  Blob: "readonly",
  FormData: "readonly",
  XMLHttpRequest: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  location: "readonly",
  history: "readonly",
  screen: "readonly",
  MutationObserver: "readonly",
  IntersectionObserver: "readonly",
  ResizeObserver: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  getComputedStyle: "readonly",
  matchMedia: "readonly",
  Node: "readonly",
  Element: "readonly",
  HTMLElement: "readonly",
  Image: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  AbortController: "readonly",
  Promise: "readonly",
  Map: "readonly",
  Set: "readonly",
  WeakMap: "readonly",
  Symbol: "readonly",
  JSON: "readonly",
  Math: "readonly",
  Date: "readonly",
  Array: "readonly",
  Object: "readonly",
  String: "readonly",
  Number: "readonly",
  Boolean: "readonly",
  RegExp: "readonly",
  Error: "readonly",
  parseInt: "readonly",
  parseFloat: "readonly",
  isNaN: "readonly",
  isFinite: "readonly",
  decodeURIComponent: "readonly",
  encodeURIComponent: "readonly",
  caches: "readonly",
  CSSRule: "readonly",
  CSSStyleDeclaration: "readonly",
  NodeFilter: "readonly",
  EventTarget: "readonly",
  DOMTokenList: "readonly",
};

// Chrome only exposes these entry types through a PerformanceObserver, so
// getEntriesByType() returns [] for them. Collect them with a buffered observer.
const observerOnlyEntryTypes = {
  selector:
    "CallExpression[callee.property.name='getEntriesByType'][arguments.0.value=/^(largest-contentful-paint|layout-shift|longtask|event|first-input)$/]",
  message: "getEntriesByType() returns [] for observer-only entry types. Use a PerformanceObserver with buffered: true.",
};

// A snippet is pasted into the console of any page: what it declares outside its IIFE becomes
// a global of that page, and a second paste fails on a const that is declared already
const insideAnIife = {
  selector: "Program > :not(ExpressionStatement)",
  message: "A snippet is one or more IIFEs: declare functions and variables inside them.",
};

// Every file is linted: a folder without a block here gets no rules, and `eslint .` passes whatever it holds
const rules = {
  // const { id, ...rest } = result is how a field is left out: id is not used on purpose
  "no-unused-vars": ["warn", { ignoreRestSiblings: true }],
  "no-undef": "error",
  "no-console": "off",
};

export default [
  {
    ignores: ["node_modules/**", ".next/**", "dist/**", ".claude/**", "skills/**", "public/**", "workspace/**", "cli/snippets/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    rules,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // Node, with the CommonJS names: some scripts use require and others import
      globals: { ...globals.node, ...globals.commonjs },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ["components/**/*.{js,jsx}", "content/**/*.js", "app/**/*.{js,jsx}", "mdx-components.js"],
    languageOptions: {
      globals: { ...browserGlobals, ...nodeGlobals, React: "readonly" },
    },
  },
  // The panel runs in DevTools; its tests and the scripts of the CLI tests run in Node
  {
    files: ["extension/**/*.js"],
    ignores: ["extension/**/*.test.js", "extension/tests/**"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  // Code that drives a page with Playwright: the callbacks of page.evaluate run in the browser
  {
    files: ["cli/src/**/*.js", "cli/tests/**/*.js", "extension/tests/**/*.js", "scripts/**/*.{js,mjs}", "lib/analytics.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.commonjs, ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["snippets/**/*.js"],
    languageOptions: {
      globals: browserGlobals,
    },
    rules: {
      "no-restricted-syntax": ["error", observerOnlyEntryTypes],
    },
  },
  // The snippets themselves, not the modules they are built with (_shared) or shown with (_view)
  {
    files: ["snippets/**/*.js"],
    ignores: [
      "snippets/_shared/**",
      "snippets/_view/**",
      // They declare their functions outside an IIFE. Remove them from here when they are fixed
      "snippets/Loading/Content-Visibility.js",
      "snippets/Loading/CSS-Media-Queries-Analysis.js",
    ],
    rules: {
      "no-restricted-syntax": ["error", observerOnlyEntryTypes, insideAnIife],
    },
  },
];
