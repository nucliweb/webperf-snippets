// AFTER ENTERING SEARCH QUERY CLICK FIRST RESULT

document
  .querySelectorAll('[jsaction="click:.CLIENT;mouseover:.CLIENT"]')[0]
  .click();

// SAVE RETURN VALUE FROM JS FOR PRODUCT URL

function getUrl(site) {
  const selectors = [
    ...document.querySelectorAll(".pla-hovercard-content-ellip"),
  ];

  let url = "";

  for (let i = 0; i < selectors.length; i++) {
    const href = selectors[i].children[1].href;

    if (href.includes(site)) {
      url = href;
      break;
    }
  }

  return url;
}

/* 
EX:
const selectors = [
  ...document.querySelectorAll(".pla-hovercard-content-ellip"),
];

let url = "";

for (let i = 0; i < selectors.length; i++) {
  if (selectors[i].children[1].href.includes("coach.com") || selectors[i].children[1].href.includes("coachoutlet.com")) {
    url = selectors[i].children[1].href;
    break;
  }
}

return url

IN NEXT STEP USE

{{custom.url}}

*/
