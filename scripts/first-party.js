const allScripts = [...document.querySelectorAll("script")];

const firstParty = allScripts
  .filter((script) => script.src.includes("on/demandware.static"))
  .map((script) => {
    return {
      src: script.src,
      async: script.async,
      defer: script.defer,
    };
  });

console.table(firstParty);
