import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { checks: [], errors: [] };
const output = "test-results/phone-display";
fs.mkdirSync(output, { recursive: true });
const base = process.env.GAME_URL || "http://127.0.0.1:5173";
let page;
const tap = async (name) => {
  await page.getByRole("button", { name, exact: true }).tap();
};
const open = async (init) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  if (init) await context.addInitScript(init);
  page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
  await page.goto(base);
  await page.waitForFunction(
    () => window.__CHECKMATE__?.snapshot.view === "title",
  );
  return context;
};
const enterHouse = async () => {
  await page.getByRole("button", { name: /New investigation/ }).tap();
  await page.getByRole("button", { name: /Accept the request/ }).tap();
  for (let i = 0; i < 4; i++) await tap("Continue");
  await tap("Enter the investigation");
};
try {
  let context = await open();
  assert.equal(await page.locator(".rotate-screen").isVisible(), true);
  assert.equal(await page.locator("#ui").evaluate((n) => n.inert), true);
  assert.equal(await page.locator("#touch-controls").isVisible(), false);
  await page.screenshot({ path: output + "/portrait.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.locator(".rotate-screen").isVisible(), false);
  // Rotation may enter fullscreen immediately while activation is still available.
  // Otherwise the first landscape tap must enter it.
  await enterHouse();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.locator(".phone-fullscreen-cta").isVisible(), false);
  const state = await page.evaluate(() => window.__CHECKMATE__.snapshot.state);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".rotate-screen").isVisible(), true);
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.modal),
    true,
  );
  assert.equal(await page.locator("#touch-controls").isVisible(), false);
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.modal),
    false,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__CHECKMATE__.snapshot.state),
    state,
  );
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await tap("Notebook");
  assert.equal(
    await page.evaluate(() => !!document.fullscreenElement),
    false,
    "Explicitly exiting fullscreen must be respected",
  );
  await tap("Return to investigation");
  await tap("Enter fullscreen");
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.screenshot({ path: output + "/landscape-fullscreen.png" });
  report.checks.push(
    "Portrait gate; automatic fullscreen from first landscape gesture; native fullscreen re-entry; exit respected; rotation preserves and freezes the investigation",
  );
  await context.close();
  context = await open(() => {
    HTMLElement.prototype.requestFullscreen = () =>
      Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await enterHouse();
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  assert.equal(await page.locator(".phone-fullscreen-cta").isVisible(), true);
  assert.equal(await page.locator("#touch-controls").isVisible(), true);
  await tap("Enter fullscreen");
  assert.equal(await page.locator("#touch-controls").isVisible(), true);
  report.checks.push(
    "Rejected fullscreen requests retain a working one-tap fallback and landscape controls without a request loop",
  );
  await context.close();
  context = await open(() => {
    HTMLElement.prototype.requestFullscreen = undefined;
    HTMLElement.prototype.webkitRequestFullscreen = undefined;
  });
  assert.match(
    await page.locator(".rotate-screen").innerText(),
    /navigation controls visible/,
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await enterHouse();
  assert.equal(await page.locator("#touch-controls").isVisible(), true);
  assert.equal(await page.locator(".phone-fullscreen-cta").isVisible(), false);
  report.checks.push(
    "Browsers without element fullscreen can still play horizontally with clear portrait instructions",
  );
  await context.close();
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error.stack || error);
  console.error(report.failure);
  if (page && !page.isClosed())
    await page.screenshot({ path: output + "/failure.png" });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
