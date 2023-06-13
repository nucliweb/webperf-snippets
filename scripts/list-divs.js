let divs = document.querySelectorAll("*");
let divsLoading = [...divs].map((obj) => {
  let newObj = {};
  newObj = {
    id: obj.id,
    class: obj.className,
    rel: obj.rel,
  };
  return newObj;
});
console.table(divsLoading);
