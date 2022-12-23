function isVideoAboveTheFold() {
  let flag = false;
  const videos = document.querySelectorAll("video");
  if (videos.length) {
    videos.forEach((video) => {
      const position = parseInt(video.getBoundingClientRect().top);
      if (position < window.innerHeight) {
        flag = true;
      }
    });
  }

  return flag;
}

isVideoAboveTheFold();

function getATFVideoDetails() {
  const videos = document.querySelectorAll("video");
  const details = [];
  if (videos.length) {
    videos.forEach((video) => {
      const position = parseInt(video.getBoundingClientRect().top);
      if (position < window.innerHeight) {
        const src =
          video.getAttribute("src") || video.children[0].getAttribute("src");
        details.push(src);
      }
    });
  }
  return details;
}

console.table(getATFVideoDetails());

function findATFLazyLoadedImages() {
  const lazy = document.querySelectorAll('[data-loading="lazy"]');
  let flag = false;
  lazy.forEach((tag) => {
    const position = parseInt(tag.getBoundingClientRect().top);
    if (position < window.innerHeight && position !== 0) {
      console.log(tag, position);
      flag = true;
    }
  });

  return flag;
}

console.log(findATFLazyLoadedImages());
