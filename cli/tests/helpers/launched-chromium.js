// Prints the command line of the browser that launchChromium starts, as the browser itself reports it
// (CDP SystemInfo.getInfo): its first part is the path of the executable. Run in a process of its own,
// since Playwright reads PLAYWRIGHT_BROWSERS_PATH once, when it loads.
import { launchChromium } from "../../src/browser.js";

const browser = await launchChromium({ headless: true });
try {
  const session = await browser.newBrowserCDPSession();
  const { commandLine } = await session.send("SystemInfo.getInfo");
  process.stdout.write(commandLine);
} finally {
  await browser.close();
}
