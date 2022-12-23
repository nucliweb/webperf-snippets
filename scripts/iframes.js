// query for iframes within main (to exclude third party injected iframes) that don't have a lazyloading strategy yet
var iframes = document.querySelectorAll("iframe:not([loading])");
for (i = 0; i < iframes.length; i++) {
  var pos = parseInt(
      iframes[i].getBoundingClientRect().top - window.innerHeight
    ),
    src = iframes[i].getAttribute("src");

  console.log(
    "iframe with url " +
      src +
      " would " +
      (pos < 1800 ? "not really" : "certainly") +
      ' benefit from loading="lazy" attribute (' +
      pos +
      "px from scrolling position)"
  );
}
