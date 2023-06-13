let links = document.querySelectorAll("div>p>span>a");
let linksLoading = [...links].map((obj) => {
  let newObj = {};
  newObj = {
    idhref: obj.href,
    txt: obj.innerHTML,
  };
  return newObj;
});
console.table(linksLoading);
