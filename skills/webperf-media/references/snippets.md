---
## Image element audit

Audits all <img> elements on the page against image performance best practices, covering loading strategy, fetch priority, format modernisation, responsive markup, and CLS prevention.

**Script:** `scripts/Image-Element-Audit.js`
---
## Oversized images

Compares the pixels of each downloaded image file with the pixels the page draws it at (rendered size × devicePixelRatio), and reports the images that are much larger than needed, which waste bytes, and the images that are smaller than needed, which look blurry.

**Script:** `scripts/Oversized-Images.js`
---
## SVG embedded bitmap analysis

Scans all SVG resources on the page, both external files and inline <svg> elements, and flags any that contain embedded bitmap images, reporting name, transfer size, compression encoding, and embedded bitmap details.

**Script:** `scripts/SVG-Embedded-Bitmap-Analysis.js`
---
## Video element audit

Audits all <video> elements on the page against video performance best practices, covering preload strategy, autoplay configuration, format modernisation, CLS prevention, and playback accessibility.

**Script:** `scripts/Video-Element-Audit.js`
