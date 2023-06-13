function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}
const openHTML = document.querySelectorAll('[class*="mol-html-editor"]');

openHTML.forEach((node) => {
  console.log(node.className, isInViewport(node));
  if (isInViewport(node)) {
    node.style = "border: 2px dotted red;";
  } else {
    node.style = "border: 2px dotted blue";
  }
});
