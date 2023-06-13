let scriptad = document.querySelectorAll("script");
let scriptsLoading = [...scriptad].map((obj) => {
  let newObj = {};
  newObj = {
    src: obj.src,
    async: obj.async,
    defer: obj.defer,
  };
  return newObj;
});
console.table(scriptsLoading);
