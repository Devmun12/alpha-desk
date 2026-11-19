// Screenshot pages for visual review: node dev/shot.mjs <baseUrl> <outDir> [width] [height]
import { chromium } from "playwright";
const [base, out, w = "1440", h = "900"] = process.argv.slice(2);
const pages = (process.env.PAGES ?? "desk,plays,impact,pipeline,read,about").split(",");
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
for (const p of pages) {
  await page.goto(`${base}${base.includes("?") ? "" : "?source=snapshot"}#${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${p}-${w}.png`, fullPage: process.env.FULL === "1" });
}
console.log(JSON.stringify({ errors }));
await browser.close();
