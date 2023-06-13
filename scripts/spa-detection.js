window.addEventListener("beforeunload", (event) => {
  event.preventDefault();
  event.returnValue = "Navigation occurred";
});
