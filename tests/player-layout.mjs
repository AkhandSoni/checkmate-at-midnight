/** Inspect the rendered geometry of every interface at two laptop resolutions. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

const output = "test-results/player-layout";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { screens: [], checks: [], errors: [] };
let activePage;

try {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    const click = (name) =>
      page.getByRole("button", { name, exact: true }).click();
    const escape = () => page.keyboard.press("Escape");
    const check = async (name) => {
      await page.waitForTimeout(180);
      const faults = await page.evaluate(() => {
        const issues = [];
        const bounds = (node) => node.getBoundingClientRect();
        for (const root of document.querySelectorAll(
          ".panel, .bound-notebook, .dialogue-wrap, .ending, .model-viewer",
        )) {
          const r = bounds(root);
          if (
            r.left < -1 ||
            r.top < -1 ||
            r.right > innerWidth + 1 ||
            r.bottom > innerHeight + 1
          )
            issues.push("Screen outside viewport: " + root.className);
          if (root.scrollWidth > root.clientWidth + 2)
            issues.push("Unintended horizontal overflow: " + root.className);
        }
        for (const header of document.querySelectorAll(".panel-head")) {
          const close = header.querySelector("button");
          const title = header.querySelector("h2");
          if (close && Math.abs(bounds(header).right - bounds(close).right) > 2)
            issues.push("Close control not aligned to header edge");
          if (close && title && bounds(title).right > bounds(close).left - 5)
            issues.push("Heading overlaps Close control");
        }
        for (const menu of document.querySelectorAll(".title-nav")) {
          const rows = [...menu.querySelectorAll("button")].map(bounds);
          if (
            rows.some(
              (r) =>
                Math.abs(r.left - rows[0].left) > 1 ||
                Math.abs(r.width - rows[0].width) > 1,
            )
          )
            issues.push("Menu rows have inconsistent label rails or widths");
        }
        for (const card of document.querySelectorAll(".tree-card")) {
          const rectangle = card.querySelector("rect").getBBox();
          for (const label of card.querySelectorAll("text")) {
            const r = label.getBBox();
            if (
              r.x < rectangle.x + 5 ||
              r.x + r.width > rectangle.x + rectangle.width - 5
            )
              issues.push("Tree label outside its card: " + label.textContent);
          }
        }
        const page = document.querySelector(".notebook-frontispiece");
        if (page && page.scrollHeight > page.clientHeight + 2)
          issues.push("Notebook title page overflows its paper");
        const legend = document.querySelector(".map-legend");
        const records = document.querySelector(".notebook-records .entries");
        if (
          legend &&
          records &&
          bounds(legend).bottom > bounds(records).bottom + 2
        )
          issues.push("Floor-plan legend is clipped below the reading page");
        const review =
          document.body.dataset.gameView === "review"
            ? document.querySelector(".panel")
            : null;
        if (review && review.scrollHeight > review.clientHeight + 2)
          issues.push("Case review hides its actions below the fold");
        const hud = document.querySelector("#hud");
        if (
          document.body.dataset.gameView !== "world" &&
          hud.querySelector("button") &&
          !hud.inert
        )
          issues.push(
            "Background HUD controls remain focusable behind a modal",
          );
        if (document.querySelector(".demo-banner"))
          issues.push("Redundant presentation banner still present");
        return issues;
      });
      assert.deepEqual(faults, [], name + " at " + viewport.width);
      await page.screenshot({
        path: `${output}/${name}-${viewport.width}.png`,
      });
      report.screens.push({ name, ...viewport });
    };

    await page.goto(process.env.GAME_URL || "http://127.0.0.1:4173");
    await page.waitForFunction(
      () => window.__CHECKMATE__?.snapshot.view === "title",
    );
    await check("title");
    await click("Settings");
    await check("settings");
    await click("Done");
    await click("The six verdicts");
    await check("gallery-locked");
    await click("Return");
    await click("DSA presentation");
    await check("presenter");
    await escape();
    await page.getByRole("button", { name: /New investigation/ }).click();
    await check("letter");
    await page.getByRole("button", { name: /Accept the request/ }).click();
    await check("arrival");
    for (let i = 0; i < 4; i++) await click("Continue");
    await click("Enter the investigation");
    await check("world");
    await escape();
    await check("pause");
    await click("Resume investigation");
    await page.keyboard.press("j");
    for (const [label, id] of [
      ["Evidence", "evidence"],
      ["Statements", "statements"],
      ["Deductions", "deductions"],
      ["Floor plan", "map"],
    ]) {
      await page
        .getByRole("navigation", { name: "Notebook bookmarks" })
        .getByRole("button", { name: label, exact: true })
        .click();
      await check("notebook-" + id);
    }
    await escape();
    await page.evaluate(() => window.__CHECKMATE__.world.teleport(11.1, 1.1));
    await page.waitForTimeout(250);
    await page.keyboard.press("e");
    await check("chess-position");
    await escape();
    await escape();
    await click("DSA presentation");
    await click("Photographic model viewer");
    await check("model-viewer");
    await escape();
    await click("Open DSA visualizer");
    await check("dsa-investigation");
    await page.getByLabel("Tree artifact").selectOption("full");
    await check("dsa-full");
    for (let i = 0; i < 10; i++) await click("Step");
    await check("dsa-deep");
    await escape();
    await click("Correct-case preset");
    await check("case-review");
    await click("Read notebook");
    await check("notebook-proof");
    await escape();
    await click("Case review");
    await page.getByRole("button", { name: /Make an accusation/ }).click();
    await check("accusation");
    await page.keyboard.press("2");
    await check("household-verdict");
    await page.keyboard.press("2");
    await check("ending");
    await click("Review your path");
    await check("recap");
    await click("Ending gallery");
    await check("gallery-after-demo");
    await context.close();
  }
  report.checks.push(
    "All major screens, four notebook bookmarks, two verdict stages and DSA scopes captured at 1280×720 and 1440×1000",
  );
  report.checks.push(
    "Screen bounds, horizontal overflow, menu widths, right-aligned Close controls, SVG card text bounds and notebook page fit checked in the rendered application",
  );
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error.stack || error);
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: output + "/failure.png" });
  console.error(report.failure);
} finally {
  fs.writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
  if (report.failure) process.exitCode = 1;
}
