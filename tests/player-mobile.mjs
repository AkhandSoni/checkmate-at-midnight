/** Real touch gestures, phone layouts, and a complete case without keyboard input. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const output = "test-results/player-mobile";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { checks: [], screens: [], errors: [] };
let page;
const check = (message) => {
  report.checks.push(message);
  console.log("PASS", message);
};
try {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
    });
    const snap = () => page.evaluate(() => window.__CHECKMATE__.snapshot);
    const tap = async (name) => {
      await page.getByRole("button", { name, exact: true }).tap();
    };
    const capture = async (name) => {
      await page.waitForTimeout(260);
      const faults = await page.evaluate(() => {
        const faults = [];
        for (const node of document.querySelectorAll(
          ".panel,.bound-notebook,.dialogue-wrap,.ending,.model-viewer,.hud-top,.objective,#touch-controls",
        )) {
          if (!node.getClientRects().length || node.hidden) continue;
          const r = node.getBoundingClientRect();
          if (
            r.left < -1 ||
            r.top < -1 ||
            r.right > innerWidth + 1 ||
            r.bottom > innerHeight + 1 ||
            node.scrollWidth > node.clientWidth + 2
          )
            faults.push(node.className || node.id);
        }
        return faults;
      });
      assert.deepEqual(
        faults,
        [],
        name + " at " + viewport.width + "x" + viewport.height,
      );
      await page.screenshot({
        path: `${output}/${name}-${viewport.width}.png`,
      });
      report.screens.push({ name, ...viewport });
    };
    const approach = async (id) => {
      await page.evaluate((id) => {
        const w = window.__CHECKMATE__.world,
          t = w.targets.find((t) => t.id === id);
        for (let r = 0.7; r < 1.65; r += 0.1)
          for (let a = 0; a < Math.PI * 2; a += 0.15) {
            const x = t.x + Math.cos(a) * r,
              z = t.z + Math.sin(a) * r;
            if (w.blocked(x, z)) continue;
            w.teleport(x, z);
            if (w.nearestTarget()?.id === id) return;
          }
        throw Error("Cannot approach " + id);
      }, id);
      await page.waitForFunction(
        (id) => window.__CHECKMATE__.world.nearest?.id === id,
        id,
      );
    };
    const interact = async (id) => {
      await approach(id);
      await page.locator(".touch-investigate").tap();
      assert.equal(await page.locator("#touch-controls").isVisible(), false);
    };
    const question = async (id, bit) => {
      await interact(id);
      await page.locator(".choices button").nth(bit).tap();
      await tap("Continue investigation");
    };
    await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
    await page.waitForFunction(
      () => window.__CHECKMATE__?.snapshot.view === "title",
    );
    assert.equal((await snap()).settings.shadows, false);
    await capture("title");
    await page.getByRole("button", { name: /New investigation/ }).tap();
    await capture("letter");
    await page.getByRole("button", { name: /Accept the request/ }).tap();
    await capture("arrival");
    // Consecutive taps intentionally have no delay: touch click counts must not block progress.
    for (let i = 0; i < 4; i++) await tap("Continue");
    await tap("Enter the investigation");
    assert.equal((await snap()).view, "world");
    assert.equal(await page.locator("#touch-controls").isVisible(), true);
    await capture("world");
    check(
      `Touch start, successive dialogue taps, and joystick/Menu/Investigate UI at ${viewport.width}×${viewport.height}`,
    );

    const cdp = await context.newCDPSession(page);
    const stick = await page.locator(".joystick").boundingBox();
    const x = stick.x + stick.width / 2,
      y = stick.y + stick.height / 2;
    const before = await page.evaluate(() =>
      window.__CHECKMATE__.world.position.toArray(),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 38, y, id: 1 }],
    });
    await page.waitForTimeout(450);
    const moved = await page.evaluate(() =>
      window.__CHECKMATE__.world.position.toArray(),
    );
    assert(
      moved[0] > before[0] + 0.2 && moved[2] < before[2] - 0.2,
      "Joystick moves in screen direction",
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await page.waitForTimeout(300);
    const stopped = await page.evaluate(() =>
      window.__CHECKMATE__.world.position.toArray(),
    );
    await page.waitForTimeout(200);
    const after = await page.evaluate(() =>
      window.__CHECKMATE__.world.position.toArray(),
    );
    assert(
      Math.hypot(after[0] - stopped[0], after[2] - stopped[2]) < 0.03,
      "Cancelled joystick stops",
    );
    assert.equal(
      await page.evaluate(() => window.__CHECKMATE__.world.touchMove.length()),
      0,
    );

    await page.evaluate(() => window.__CHECKMATE__.world.teleport(3, 2));
    const menu = await page
      .getByRole("button", { name: "Menu", exact: true })
      .boundingBox();
    const mx = menu.x + menu.width / 2,
      my = menu.y + menu.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 30, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x + 30, y, id: 1 },
        { x: mx, y: my, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ x: mx, y: my, id: 2 }],
    });
    await page.waitForTimeout(100);
    assert.equal((await snap()).view, "pause");
    assert.equal(
      await page.evaluate(() => window.__CHECKMATE__.world.touchMove.length()),
      0,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await capture("menu");
    await tap("Settings");
    await capture("settings");
    await tap("Done");
    await tap("Resume investigation");
    check(
      `Joystick drag, cancellation, and a second finger opening Menu stop movement at ${viewport.width}×${viewport.height}`,
    );

    await tap("Notebook");
    for (const name of ["Evidence", "Statements", "Deductions", "Floor plan"]) {
      await page
        .getByRole("navigation", { name: "Notebook bookmarks" })
        .getByRole("button", { name, exact: true })
        .tap();
      await capture("notebook-" + name.toLowerCase().replaceAll(" ", "-"));
    }
    await page.locator(".floor-plan-room[data-room=study]").tap();
    assert.equal((await snap()).view, "world");
    await interact("king");
    await capture("question");
    await tap("Back");
    assert.equal((await snap()).state.path.length, 0);
    await interact("king");
    await page.locator(".choices button").nth(1).tap();
    await capture("response");
    await tap("Continue investigation");
    assert.deepEqual((await snap()).state.path, [1]);
    await tap("Menu");
    await tap("Save & return to title");
    await page.reload();
    await page.waitForFunction(
      () => window.__CHECKMATE__?.snapshot.view === "title",
    );
    await page.getByRole("button", { name: /Continue case/ }).tap();
    assert.deepEqual((await snap()).state.path, [1]);
    assert.equal(await page.locator("#touch-controls").isVisible(), true);
    check(
      `Notebook, map selection, touch investigation, Back and save/resume at ${viewport.width}×${viewport.height}`,
    );

    if (viewport.width === 390) {
      for (const id of ["mara", "ash", "flint", "scarlet", "voss"])
        await question(id, 1);
      assert.equal((await snap()).view, "review");
      await tap("Keep investigating");
      for (const id of ["poison_flask", "medicine_register", "study_ledger"]) {
        await interact(id);
        await page
          .getByRole("button", {
            name: /Record in notebook|Return to the room/,
          })
          .tap();
      }
      assert.equal((await snap()).proof.complete, true);
      await tap("Case review");
    } else {
      await tap("Menu");
      await tap("DSA presentation");
      await tap("Correct-case preset");
    }
    await capture("review");
    await page.getByRole("button", { name: /Make an accusation/ }).tap();
    await tap("Back");
    assert.equal((await snap()).view, "review");
    await page.getByRole("button", { name: /Make an accusation/ }).tap();
    await page.locator(".choices button").nth(1).tap();
    await page.locator(".choices button").nth(1).tap();
    assert.equal((await snap()).ending, "checkmate");
    await capture("ending");
    await page.getByRole("button", { name: /Next scene/ }).tap();
    await tap("Review your path");
    await capture("recap");
    await tap("Explore the binary tree");
    await capture("tree");
    await tap("Step");
    assert.deepEqual((await snap()).traversal.visited, ["root"]);
    await page.getByRole("button", { name: /Close/ }).first().tap();
    await tap("Return to ending");
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 844, height: 390 });
      await capture("rotated-ending");
      await page.setViewportSize(viewport);
    }
    await tap("New investigation");
    await tap("Return to title");
    await tap("DSA presentation");
    await tap("Photographic model viewer");
    await capture("model-viewer");
    await page.getByRole("button", { name: "Next model", exact: true }).tap();
    assert.equal((await snap()).modelView.asset, "CHR_scarlet");
    await tap("Close [Esc]");
    check(
      `Touch verdicts, ending, recap, tree, model viewer and orientation at ${viewport.width}×${viewport.height}`,
    );
    await context.close();
  }
  assert.deepEqual(report.errors, []);
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
