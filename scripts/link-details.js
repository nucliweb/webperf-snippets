let scriptlink = document.querySelectorAll("link");
let scriptsLoading = [...scriptlink].map((obj) => {
  let newObj = {};
  newObj = {
    rel: obj.rel,
    href: obj.href,
    type: obj.type,
    hreflang: obj.hreflang,
  };
  return newObj;
});
console.table(scriptsLoading);
