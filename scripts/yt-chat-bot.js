// SWITCH TO IFRAME IN CONSOLE

function bot(message) {
  const el = document.querySelector("div#input");
  el.textContent = message;
  el.dispatchEvent(new Event("input", { bubles: true, cancelable: true }));
  document.querySelector('[aria-label="Send"]').click();
}
setInterval(() => {
  bot("message goes here");
}, 10000);
