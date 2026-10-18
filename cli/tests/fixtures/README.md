# Fixtures

- `core-web-vitals.html` and `core-web-vitals-interactions.json`: seeded page and click step used by `npm run capture:examples` to record real return objects for the Core Web Vitals category. The capture command requires Playwright Chromium (`npx playwright install chromium`).
- `dm-sans-regular.woff2`: DM Sans Regular, copyright The DM Sans Project Authors, licensed under the SIL Open Font License 1.1 (https://openfontlicense.org). Used by the Webfont-Usage-Analyzer e2e test as a real font file.
- `clip.webm`: half a second of the FFmpeg `testsrc2` pattern, generated with `ffmpeg -f lavfi -i "testsrc2=s=320x180:d=0.5:r=10" -c:v libvpx -b:v 200k -an clip.webm`. VP8, since the Chromium of Playwright does not decode H.264. A video of one flat color would not do: Chrome ignores low-entropy frames as LCP candidates. Used by the LCP-Video-Candidate e2e tests.
