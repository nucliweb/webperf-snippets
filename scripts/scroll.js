window.addEventListener("load", async function () {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  let pages = document.body.scrollHeight / window.innerHeight;
  for (let page = 0; page < pages; page++) {
    window.scrollBy(0, window.innerHeight);
    await sleep(200);
  }
});
