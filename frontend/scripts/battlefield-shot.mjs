// Drives installed Chrome at the dev-battlefield route; captures console + screenshot.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const URL = process.argv[2] ?? "http://localhost:3000/dev-battlefield";
const SHOT = process.argv[3] ?? "/tmp/wt-debug.png";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true, acceptInsecureCerts: true,
  args: ["--no-first-run", "--hide-crash-restore-bubble", "--use-angle=metal"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 15000));

// WebGL forensic: is there a canvas, is its context alive, what renderer?
const forensic = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")];
  return canvases.map((c) => {
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    let renderer = null;
    try {
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
    } catch {}
    return {
      w: c.width, h: c.height,
      clientW: c.clientWidth, clientH: c.clientHeight,
      contextLost: gl ? gl.isContextLost() : "no-gl",
      renderer,
    };
  });
});

await page.screenshot({ path: SHOT });
console.log("=== CONSOLE ===");
for (const l of logs) console.log(l);
console.log("=== CANVASES ===");
console.log(JSON.stringify(forensic, null, 2));
console.log("=== SCREENSHOT ===", SHOT);
await browser.close();
