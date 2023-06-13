// Is x present?

{
  console.clear();

  const should = ["header", "nav", "footer", "main"];

  let shouldFound = 0;

  console.log(`%cStuff that probably should be present:`, `font-size: 13px`);

  for (el of should) {
    if (!document.getElementsByTagName(el).length) {
      shouldFound++;
      console.warn(`${shouldFound}. There’s no <${el}>`);
    }
  }

  if (!shouldFound) {
    console.info("Nothing found, looks good!");
  }

  console.log("-----");

  const shouldnt = [
    "a:not([href])",
    'a[href="#"]',
    "a[tabindex]",
    '[role="menuitem"]',
    '[role="button"]',
    '[role="link"]',
    "div[onclick]",
    "img[onclick]",
    "label[aria-label]",
    "label a",
    "button a",
    "a button",
    "section > section",
    "article > section",
    "[style]",
    'table[role="grid"]',
  ];

  let shouldntFound = 0;

  console.log(`%cStuff that probably shouldn’t be present:`, `font-size: 13px`);

  for (el of shouldnt) {
    if (document.querySelector(el)) {
      shouldntFound++;
      console.warn(`${shouldntFound}. Found “${el}”. Please check!`);
      console.log(document.querySelector(el));
    }
  }

  if (!shouldntFound) {
    console.info("Nothing found, looks good!");
  }

  var done = "Finished running “Is x present?”";
  done;
}
