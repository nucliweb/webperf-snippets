const images = document.querySelectorAll("img");

function getDisplayedImages(nodeList) {
  return [...nodeList].map((img) => {
    if (img.src && img.parentNode.nodeName !== "PICTURE") {
      return {
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
        size: img.getAttribute("sizes"),
        tag: img,
        parentNode: img.parentNode,
      };
    }

    return {
      src: "picture element parent",
      parentNode: img.parentNode,
      tag: img,
    };
  });
}

console.table(getDisplayedImages(images));
