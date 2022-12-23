// Document Info

{
  console.clear();

  const getAttr = (elem, attr) => {
    if (
      document.querySelector(elem) &&
      document.querySelector(elem).getAttribute(attr)
    )
      return document.querySelector(elem).getAttribute(attr);

    return "🛑 No information available";
  };

  console.log("---------");
  console.log(`%cTitle: ${document.title}`, `font-size: 14px`);
  console.log(`Description: ${getAttr('meta[name="description"]', "content")}`);

  console.log(`Language: ${getAttr("html", "lang")}`);
  console.log(`Charset: ${getAttr("meta[charset]", "charset")}`);
  console.log(
    `DOM nodes in <head>: ${document.head.querySelectorAll("*").length}`
  );
  console.log(
    `DOM nodes in <body>: ${document.body.querySelectorAll("*").length}`
  );

  console.log(`Document structure:`);

  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const level = parseInt(heading.nodeName.replace("H", ""));

    console.log(
      `%c<${heading.nodeName}> ${heading.textContent
        .replace(/\s\s+/g, " ")
        .trim()}`,
      `padding-left: ${level * 30}px; font-size: ${27 - level * 3}px`
    );
  }

  console.log("---------");

  var done = "Finished running “Doc Info”";
  done;
}
