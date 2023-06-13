const allScripts = [...document.querySelectorAll("script")];

const inline = [];

allScripts.forEach((script) => {
  if (!script.src) {
    inline.push(script.innerHTML);
  }
});

console.table(inline);
