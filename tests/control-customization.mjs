import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const out = "test-results/custom-controls";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { checks: [], errors: [] };
let page;
const checked = (msg) => {
  report.checks.push(msg);
  console.log("PASS", msg);
};
const snap = () => page.evaluate(() => window.__CHECKMATE__.snapshot);
const click = (name) => page.getByRole("button", { name, exact: true }).click();
const tap = (name) => page.getByRole("button", { name, exact: true }).tap();
const ready = () =>
  page.waitForFunction(() => window.__CHECKMATE__?.snapshot.view === "title");
const key = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(230);
};
const observe = (p) => {
  p.on("pageerror", (e) => report.errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
};
async function enterHouse(touch = false) {
  await page
    .getByRole("button", { name: /New investigation/ })
    .first()
    [touch ? "tap" : "click"]();
  await page
    .getByRole("button", { name: /Accept the request/ })
    [touch ? "tap" : "click"]();
  for (let i = 0; i < 4; i++)
    await (touch ? tap("Continue") : click("Continue"));
  await (touch
    ? tap("Enter the investigation")
    : click("Enter the investigation"));
}
async function capture(name) {
  await page.waitForTimeout(280);
  const faults = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".panel,.control-layout-toolbar,.layout-compact-bar",
      ),
    ].flatMap((n) => {
      if (!n.getClientRects().length || n.hidden) return [];
      const r = n.getBoundingClientRect();
      return r.left < -1 ||
        r.top < -1 ||
        r.right > innerWidth + 1 ||
        r.bottom > innerHeight + 1 ||
        n.scrollWidth > n.clientWidth + 2
        ? [n.className]
        : [];
    }),
  );
  assert.deepEqual(faults, [], name);
  await page.screenshot({ path: out + "/" + name + ".png" });
}
try {
  let context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  page = await context.newPage();
  observe(page);
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
  await ready();
  await click("Settings");
  await click("Controls");
  await click("Keyboard bindings");
  await page
    .getByRole("button", { name: "Change Investigate primary key" })
    .click();
  await page.keyboard.press("w");
  assert.match(
    await page.locator(".binding-status").innerText(),
    /already assigned to Move up/,
  );
  await page.keyboard.press("Escape");
  assert.equal((await snap()).view, "key-bindings");
  async function bind(action, key) {
    await click("Change " + action + " primary key");
    await page.keyboard.press(key);
  }
  await bind("Investigate", "k");
  await click("Cancel");
  assert.deepEqual((await snap()).controls.bindings.interact, ["e"]);
  await click("Keyboard bindings");
  for (const [action, key] of [
    ["Investigate", "k"],
    ["Move up", "i"],
    ["Notebook", "n"],
    ["Pause / back", "p"],
    ["First choice", "z"],
    ["Second choice", "x"],
    ["Run", "r"],
    ["Floor plan", "h"],
  ])
    await bind(action, key);
  await capture("keyboard-bindings");
  await click("Save bindings");
  assert.deepEqual((await snap()).controls.bindings.interact, ["k"]);
  await click("Done");
  await click("Done");
  await page.reload();
  await ready();
  assert.deepEqual((await snap()).controls.bindings.up, ["i", "arrowup"]);
  await enterHouse();
  await page.keyboard.down("w");
  await page.waitForTimeout(220);
  await page.keyboard.up("w");
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.velocity.length()),
    0,
  );
  await page.keyboard.down("i");
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => window.__CHECKMATE__.world.velocity.length())) >
      1.8,
  );
  await page.keyboard.down("r");
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => window.__CHECKMATE__.world.velocity.length())) >
      3.5,
  );
  await key("p");
  assert.equal((await snap()).view, "pause");
  await page.keyboard.up("i");
  await page.keyboard.up("r");
  await click("Resume investigation");
  await key("n");
  assert.equal((await snap()).view, "notebook");
  await key("Escape");
  await key("h");
  assert.equal(
    await page.locator(".tabs button.active").innerText(),
    "Floor plan",
  );
  await key("Escape");
  await page.evaluate(() => {
    const w = window.__CHECKMATE__.world;
    w.teleport(11, 4.9);
  });
  await page.waitForTimeout(200);
  await key("e");
  assert.equal((await snap()).view, "world");
  await key("k");
  assert.equal((await snap()).view, "dialogue");
  assert.deepEqual(await page.locator(".choices kbd").allTextContents(), [
    "Z",
    "X",
  ]);
  await key("z");
  assert.deepEqual((await snap()).state.path, [0]);
  await key("z");
  assert.equal((await snap()).view, "world");
  assert.match(await page.locator(".controls").innerText(), /K/);
  await key("Escape");
  await click("Controls");
  await click("Reset all controls");
  assert.deepEqual((await snap()).controls.bindings.interact, ["e"]);
  checked(
    "Keyboard conflict detection, capture cancellation, save/cancel/reset, reload, remapped movement/run/pause/notebook/map/investigation/choices and live shortcut labels",
  );
  await context.close();

  context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page = await context.newPage();
  observe(page);
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
  await ready();
  await enterHouse(true);
  const initial = (await snap()).state;
  const joystick = await page.locator(".joystick").boundingBox();
  assert.equal(joystick.width, 140);
  assert(joystick.x >= 50);
  await tap("Menu");
  await tap("Controls");
  await tap("Arrange touch controls");
  await capture("layout-editor");
  const cdp = await context.newCDPSession(page);
  async function drag(id, x, y) {
    const r = await page
      .locator(".layout-control[data-control=" + id + "]")
      .boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await drag("joystick", 300, 265);
  await page.getByLabel("Selected touch control").selectOption("joystick");
  await page.getByLabel("Size", { exact: true }).evaluate((n) => {
    n.value = "1.35";
    n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(
    Math.round(
      (
        await page
          .locator(".layout-control[data-control=joystick]")
          .boundingBox()
      ).width,
    ),
    189,
  );
  await tap("Move controls");
  assert.equal(
    await page.locator(".control-layout-toolbar").isVisible(),
    false,
  );
  await drag("menu", 550, 170);
  assert.equal(await page.locator(".layout-compact-bar").isVisible(), true);
  await drag("notebook", 500, 55);
  await drag("map", 600, 55);
  await drag("review", 410, 125);
  await capture("moved-controls");
  await tap("Sizes");
  await page.getByLabel("Selected touch control").selectOption("interact");
  await page.getByLabel("Size", { exact: true }).evaluate((n) => {
    n.value = "1.2";
    n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tap("Save layout");
  const custom = (await snap()).controls.mobile;
  assert.equal(custom.joystick.scale, 1.35);
  assert(custom.joystick.x > 0.3);
  assert.deepEqual((await snap()).state, initial);
  await tap("Done");
  await tap("Resume investigation");
  let actual = await page.locator(".joystick").boundingBox();
  assert.equal(Math.round(actual.width), 189);
  assert(Math.abs(actual.x + actual.width / 2 - 300) < 2);
  const menu = await page.locator(".touch-menu").boundingBox();
  assert(Math.abs(menu.x + menu.width / 2 - 550) < 2);
  await capture("custom-gameplay");
  // The moved, enlarged stick must still move the actual player and stop on Menu.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: actual.x + actual.width / 2,
        y: actual.y + actual.height / 2,
        id: 1,
      },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: actual.x + actual.width / 2 + 55,
        y: actual.y + actual.height / 2,
        id: 1,
      },
    ],
  });
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => window.__CHECKMATE__.world.touchMove.length())) >
      0.5,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await tap("Menu");
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.touchMove.length()),
    0,
  );
  await tap("Save & return to title");
  await page.reload();
  await ready();
  await page.getByRole("button", { name: /Continue case/ }).tap();
  assert.deepEqual((await snap()).controls.mobile, custom);
  actual = await page.locator(".joystick").boundingBox();
  assert.equal(Math.round(actual.width), 189);
  await tap("Menu");
  await tap("Controls");
  await tap("Arrange touch controls");
  await tap("Reset");
  await tap("Cancel");
  assert.deepEqual((await snap()).controls.mobile, custom);
  await tap("Arrange touch controls");
  await tap("Reset");
  await tap("Save layout");
  assert.equal((await snap()).controls.mobile.joystick.scale, 1);
  assert.equal((await snap()).controls.mobile.joystick.x, null);
  await tap("Done");
  await tap("Resume investigation");
  assert.equal((await page.locator(".joystick").boundingBox()).width, 140);
  checked(
    "Larger inset default joystick; touch dragging of all control types; per-control resizing; unchanged case progress; real movement with moved controls; saved layout reload and reset/cancel",
  );
  await context.close();
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error.stack || error);
  console.error(report.failure);
  if (page && !page.isClosed())
    await page.screenshot({ path: out + "/failure.png" });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
