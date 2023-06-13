// WPT

/* [lazy-in-viewport]
return new Promise(function (resolve) {
    let lazyImages = document.querySelectorAll("img[loading=lazy]");
    if (lazyImages.length == 0) {
        return resolve([]);
    }

    let observer = new IntersectionObserver(function (entries, observer) {
        observer.disconnect();
        const eagerLoadingCandidates = entries
            .filter(e => e.isIntersecting)
            .map(e => e.target.src);
        return resolve(JSON.stringify(eagerLoadingCandidates));
    });
    for (let img of lazyImages) {
        observer.observe(img);
    }
});
*/
function liv() {
  return new Promise(function (resolve) {
    let lazyImages = document.querySelectorAll('[data-loading="lazy"]');
    console.log(lazyImages);
    if (lazyImages.length == 0) {
      return resolve([]);
    }

    let observer = new IntersectionObserver(function (entries, observer) {
      observer.disconnect();
      const eagerLoadingCandidates = entries
        .filter((e) => e.isIntersecting)
        .map((e) => e.target.src);
      return resolve(JSON.stringify(eagerLoadingCandidates));
    });
    for (let img of lazyImages) {
      observer.observe(img);
    }
  });
}

liv().then((data) => console.log(data));
