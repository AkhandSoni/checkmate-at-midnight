/** Player-facing integration audit against the real WebGL application. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkSaves } from "./browser-saves.mjs";

const base = process.env.GAME_URL || "http://127.0.0.1:5173";
const executablePath =
  process.env.CHROMIUM_PATH ||
  (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const report = { checks: [], errors: [] };
const output = "test-results/player-audit";
fs.mkdirSync(output, { recursive: true });
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
});
const snap = () => page.evaluate(() => window.__CHECKMATE__.snapshot);
const click = (name) => page.getByRole("button", { name, exact: true }).click();
const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(230);
};
const checked = (message) => {
  report.checks.push(message);
  console.log("PASS", message);
};
async function ready() {
  await page.waitForFunction(
    () => window.__CHECKMATE__?.snapshot.view === "title",
  );
}
async function fresh() {
  await page
    .getByRole("button", { name: /New investigation/ })
    .first()
    .click();
  await enterHouse();
}
async function enterHouse() {
  await page.getByRole("button", { name: /Accept the request/ }).click();
  for (let i = 0; i < 4; i++) await click("Continue");
  await click("Enter the investigation");
  assert.equal((await snap()).view, "world");
}
async function approach(id) {
  await page.evaluate((id) => {
    const w = window.__CHECKMATE__.world;
    const t = w.targets.find((t) => t.id === id);
    for (let radius = 0.7; radius < 1.65; radius += 0.1)
      for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
        const x = t.x + Math.cos(angle) * radius,
          z = t.z + Math.sin(angle) * radius;
        if (w.blocked(x, z)) continue;
        w.teleport(x, z);
        if (w.nearestTarget()?.id === id) return;
      }
    throw Error("Cannot interact with " + id);
  }, id);
  await page.waitForTimeout(100);
}
async function inspectClue(id) {
  await approach(id);
  await press("e");
  assert((await snap()).state.evidence.includes(id));
  await page
    .getByRole("button", { name: /Record in notebook|Return to the room/ })
    .click();
}
async function question(id, bit) {
  const before = (await snap()).state.path.length;
  await approach(id);
  await press("e");
  assert.equal(await page.locator(".choices button").count(), 2);
  await press(String(bit + 1));
  assert.equal((await snap()).state.path.length, before + 1);
  await click("Continue investigation");
}
async function investigate(path) {
  const order = path[0]
    ? ["mara", "ash", "flint", "scarlet", "voss"]
    : ["scarlet", "ash", "mara", "flint", "voss"];
  for (const [i, id] of ["king", ...order].entries())
    await question(id, path[i]);
  assert.equal((await snap()).view, "review");
}
async function verdict(action) {
  if ((await snap()).view !== "review") await click("Case review");
  if (action === "final_lead") {
    await page.getByRole("button", { name: /Pursue one final lead/ }).click();
    await press("1");
  } else {
    await page.getByRole("button", { name: /Make an accusation/ }).click();
    await press(["accuse_scarlet", "accuse_ash"].includes(action) ? "1" : "2");
    await press(["accuse_scarlet", "accuse_mara"].includes(action) ? "1" : "2");
  }
  assert.equal((await snap()).view, "ending");
}
async function bounds(label) {
  await page.waitForTimeout(250);
  const faults = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".panel, .bound-notebook, .dialogue-wrap, .ending, .model-viewer",
      ),
    ].flatMap((node) => {
      const r = node.getBoundingClientRect();
      return r.left < -1 ||
        r.top < -1 ||
        r.right > innerWidth + 1 ||
        r.bottom > innerHeight + 1 ||
        node.scrollWidth > node.clientWidth + 2
        ? [node.className]
        : [];
    }),
  );
  assert.deepEqual(faults, [], label);
  if (label.includes("Notebook")) {
    const mapFits = await page
      .locator(".floor-plan-entries")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.scrollHeight <= node.clientHeight + 2),
      );
    assert.equal(mapFits, true, "Map route and legend fit on the reading page");
  }
}
try {
  await page.goto(base);
  await ready();
  assert.equal((await snap()).audioActive, false);
  await bounds("Title");
  await click("DSA presentation");
  assert.equal(
    await page.getByRole("button", { name: "Go to current lead" }).count(),
    0,
  );
  await click("Photographic model viewer");
  await press("ArrowRight");
  assert.equal((await snap()).modelView.asset, "CHR_scarlet");
  await press("Escape");
  await press("Escape");
  // A held Enter must not accept the letter or skip new dialogue screens.
  await page.getByRole("button", { name: /New investigation/ }).focus();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  assert.equal((await snap()).view, "letter");
  await bounds("Letter");
  await page.getByRole("button", { name: /Accept the request/ }).click();
  await click("Continue");
  await click("Continue");
  const arrivalLine = await page.locator(".dialogue p").innerText();
  await page.reload();
  await ready();
  await page.getByRole("button", { name: /Continue case/ }).click();
  assert.equal(await page.locator(".dialogue p").innerText(), arrivalLine);
  await click("Continue");
  await click("Continue");
  await click("Enter the investigation");
  checked(
    "Keyboard-only start; held Enter does not skip screens; arrival resumes on the saved line; title tools cannot start an unsaved demo",
  );

  const reachable = await page.evaluate(() => {
    const w = window.__CHECKMATE__.world,
      step = 0.2,
      cols = 121,
      rows = 81;
    const key = (x, z) => z * cols + x;
    const queue = [key(15, 10)],
      seen = new Set(queue),
      reached = new Set();
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head],
        x = current % cols,
        z = Math.floor(current / cols);
      const room =
        (x * step < 8 ? 0 : x * step < 16 ? 1 : 2) + (z * step < 8 ? 0 : 3);
      const rooms = [
        "entrance",
        "study",
        "drawing",
        "library",
        "dining",
        "servants",
      ];
      const candidates = w.targets
        .filter((t) => t.room === rooms[room])
        .map((t) => ({
          id: t.id,
          d: Math.hypot(t.x - x * step, t.z - z * step),
        }))
        .sort((a, b) => a.d - b.d);
      if (candidates[0]?.d < 1.65) reached.add(candidates[0].id);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          zz = z + dz,
          next = key(xx, zz);
        if (
          xx < 0 ||
          xx >= cols ||
          zz < 0 ||
          zz >= rows ||
          seen.has(next) ||
          w.blocked(xx * step, zz * step)
        )
          continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return {
      cells: seen.size,
      inaccessible: w.targets
        .filter((t) => !reached.has(t.id))
        .map((t) => t.id),
    };
  });
  assert.deepEqual(reachable.inaccessible, []);
  checked(
    `All 20 interaction targets reachable from the spawn through ${reachable.cells} collision-free grid positions`,
  );

  for (const [x, z, axis] of [
    [8, 4, "x"],
    [16, 4, "x"],
    [4, 8, "z"],
    [12, 8, "z"],
    [20, 8, "z"],
    [8, 12, "x"],
    [16, 12, "x"],
  ])
    for (const direction of [1, -1]) {
      await page.evaluate(
        ({ x, z, axis, direction }) => {
          window.__CHECKMATE__.world.teleport(
            x - (axis === "x" ? 0.7 * direction : 0),
            z - (axis === "z" ? 0.7 * direction : 0),
          );
        },
        { x, z, axis, direction },
      );
      const keys =
        axis === "x"
          ? direction === 1
            ? ["s", "d"]
            : ["w", "a"]
          : direction === 1
            ? ["s", "a"]
            : ["w", "d"];
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(650);
      for (const key of keys) await page.keyboard.up(key);
      const position = await page.evaluate(() => ({
        x: window.__CHECKMATE__.world.position.x,
        z: window.__CHECKMATE__.world.position.z,
      }));
      assert(
        (axis === "x" ? position.x - x : position.z - z) * direction > 0.35,
        `Door ${x},${z}, direction ${direction}`,
      );
    }
  checked(
    "Walked through all seven doors in both directions with real held movement keys",
  );

  await page.evaluate(() => window.__CHECKMATE__.world.teleport(3, 2));
  await press("j");
  for (const tab of ["Evidence", "Statements", "Deductions", "Floor plan"]) {
    await page
      .getByRole("navigation", { name: "Notebook bookmarks" })
      .getByRole("button", { name: tab, exact: true })
      .click();
    await bounds("Notebook " + tab);
  }
  assert.equal(
    await page
      .locator(".floor-plan-room.destination")
      .getAttribute("data-room"),
    "study",
  );
  await page.locator(".floor-plan-room[data-room=entrance]").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.room),
    "library",
  );
  await page.locator(".floor-plan-room[data-room=servants]").click();
  assert.equal((await snap()).navigation, "servants");
  assert.match(
    await page.locator(".objective").innerText(),
    /Entrance Hall → King’s Study → Drawing Room → Servants’ Room/,
  );
  await page.reload();
  await ready();
  await page.getByRole("button", { name: /Continue case/ }).click();
  assert.equal((await snap()).navigation, "servants");
  await page.evaluate(() => window.__CHECKMATE__.world.teleport(20, 13.8));
  assert.equal((await snap()).navigation, "");
  checked(
    "Notebook tabs fit; map arrows follow room geometry; connected routes, destination persistence and arrival clearing work",
  );

  const beforeExploration = (await snap()).state;
  await approach("scarlet");
  await press("e");
  assert.match(await page.locator(".dialogue p").innerText(), /current lead/);
  await click("Return to the room");
  for (const id of ["clock", "mule", "gates", "screen", "medicine"]) {
    await approach(id);
    await press("e");
    assert.equal((await snap()).view, "dialogue");
    await click("Return to the room");
  }
  await approach("chessboard");
  await press("e");
  assert.equal((await snap()).view, "chessboard");
  await bounds("Chess study");
  assert.equal(await page.locator(".board-piece").count(), 26);
  for (let i = 1; i <= 3; i++) {
    await press("ArrowRight");
    assert.equal((await snap()).chessStudy.frame, i);
  }
  await click("Flip board");
  assert.equal((await snap()).chessStudy.flipped, true);
  assert.equal(await page.locator(".board-piece").count(), 24);
  await press("Escape");
  assert.deepEqual((await snap()).state, beforeExploration);
  checked(
    "Out-of-order questioning, every scenery interaction and the four chess positions preserve investigation progress",
  );

  await approach("king");
  await press("e");
  await press("1");
  const chosen = (await snap()).state;
  await page.reload();
  await ready();
  await page.getByRole("button", { name: /Continue case/ }).click();
  assert.equal((await snap()).view, "dialogue");
  assert.deepEqual((await snap()).state, chosen);
  await click("Continue investigation");
  await press("j");
  assert.match(await page.locator(".entries").innerText(), /family crest/);
  assert.doesNotMatch(
    await page.locator(".entries").innerText(),
    /I took the new will/,
  );
  await click("Statements");
  assert.equal(await page.locator(".entry").count(), 0);
  await press("Escape");
  for (const id of ["scarlet", "ash", "mara", "flint", "voss"])
    await question(id, 0);
  await click("Keep investigating");
  for (const id of [
    "red_thread",
    "torn_will",
    "medicine_register",
    "duty_book",
    "poison_flask",
    "burned_accounts",
    "study_ledger",
    "goblet_residue",
  ])
    await inspectClue(id);
  const count = (await snap()).state.evidence.length;
  await inspectClue("poison_flask");
  assert.equal((await snap()).state.evidence.length, count);
  assert.equal((await snap()).proof.complete, true);
  await press("j");
  await click("Statements");
  assert.equal(await page.locator(".entry").count(), 5);
  await click("Deductions");
  await bounds("Complete deductions");
  await page.screenshot({ path: output + "/notebook-deductions.png" });
  await press("Escape");
  checked(
    "Pending statement survives reload; notebook never invents Ash testimony; five statements appear once; exploration recovers the hostile route",
  );

  await page.keyboard.down("w");
  await page.waitForTimeout(100);
  await press("j");
  const paused = await page.evaluate(() =>
    window.__CHECKMATE__.world.position.toArray(),
  );
  await page.waitForTimeout(150);
  assert.deepEqual(
    await page.evaluate(() => window.__CHECKMATE__.world.position.toArray()),
    paused,
  );
  await press("Escape");
  await page.keyboard.up("w");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await snap()).view, "pause");
  await click("Resume investigation");
  await page.keyboard.press("m");
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__CHECKMATE__.snapshot.audio.state === "running",
  );
  checked(
    "Notebook freezes held movement; blur pauses; keyboard resume restores audio",
  );

  await verdict("accuse_voss");
  assert.equal((await snap()).ending, "checkmate");
  await bounds("Checkmate ending");
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: /Next scene/ }).click();
  await click("Review your path");
  await bounds("Recap");
  await click("Ending gallery");
  await page.getByRole("button", { name: "View scene", exact: true }).click();
  await click("Return to gallery");
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.endingId),
    "checkmate",
  );
  await press("Escape");
  await click("Explore the binary tree");
  await click("Step");
  assert.deepEqual((await snap()).traversal.visited, ["root"]);
  await click("BFS");
  await click("Step");
  await click("Step");
  await click("Step");
  assert.deepEqual((await snap()).traversal.visited, [
    "root",
    "root0",
    "root1",
  ]);
  await click("Play");
  await page.waitForTimeout(300);
  await click("Pause");
  const visited = (await snap()).traversal.visited.length;
  await page.waitForTimeout(200);
  assert.equal((await snap()).traversal.visited.length, visited);
  await click("Reset");
  assert.equal((await snap()).traversal.visited.length, 0);
  await page.getByLabel("Tree artifact").selectOption("full");
  await press("Escape");
  checked(
    "Correct ending, all scenes, gallery restoration, recap and live DFS/BFS controls",
  );

  for (const [action, ending] of [
    ["accuse_scarlet", "scarlet"],
    ["accuse_ash", "ash"],
    ["accuse_mara", "mara"],
    ["accuse_voss", "voss_free"],
    ["final_lead", "fire"],
  ]) {
    await fresh();
    await investigate(
      ending === "ash" ? [1, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0],
    );
    await verdict(action);
    assert.equal((await snap()).ending, ending);
    await bounds(ending);
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: /Next scene/ }).click();
    checked(`Reached ${ending} through player dialogue and verdict controls`);
  }
  await fresh();
  await investigate([1, 1, 1, 1, 1, 1]);
  await click("Keep investigating");
  for (const id of ["poison_flask", "medicine_register", "study_ledger"])
    await inspectClue(id);
  assert.equal((await snap()).proof.complete, true);
  await verdict("final_lead");
  assert.equal((await snap()).ending, "checkmate");
  await page.reload();
  await ready();
  await page.getByRole("button", { name: /Continue case/ }).click();
  assert.equal((await snap()).ending, "checkmate");
  checked(
    "Alternate question order; complete-proof final lead succeeds and ending survives reload",
  );

  // A gallery preview must not leave smoke, relocated actors or an open gate in play.
  await fresh();
  await press("Escape");
  await click("Save & return to title");
  await click("The six verdicts");
  assert.equal(
    await page.getByRole("button", { name: "View scene", exact: true }).count(),
    6,
  );
  await page
    .locator(".gallery-item")
    .filter({ hasText: "The Burning Board" })
    .getByRole("button")
    .click();
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.endingId),
    "fire",
  );
  await click("Return to gallery");
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.endingId),
    "",
  );
  await press("Escape");
  await page.getByRole("button", { name: /Continue case/ }).click();
  assert.equal((await snap()).stage, "world");
  assert.equal(
    await page.evaluate(() => window.__CHECKMATE__.world.endingCast.length),
    0,
  );
  checked(
    "All six gallery achievements unlocked by normal play; fire preview leaves active case and cast intact",
  );

  await press("Escape");
  await click("Settings");
  await page.getByLabel("Reduced motion").check();
  await page.getByLabel("Mute all audio").check();
  await click("Done");
  await click("DSA presentation");
  await click("Correct-case preset");
  assert.equal((await snap()).proof.complete, true);
  assert.equal((await snap()).demo, true);
  await bounds("Updated complete preset");
  await verdict("final_lead");
  assert.equal((await snap()).ending, "checkmate");
  await page.reload();
  await ready();
  assert.equal((await snap()).settings.mute, true);
  assert.equal((await snap()).settings.reducedMotion, true);
  // Test browser-specific storage parsing without replacing game logic.
  const saveChecks = await page.evaluate(checkSaves);
  assert.equal(saveChecks.legacyCases, 960);
  assert.equal(saveChecks.corrupt, true);
  assert.equal(saveChecks.forged, true);
  assert.equal(saveChecks.migration, true);
  assert.deepEqual(saveChecks.gallery, ["checkmate", "fire"]);
  checked(
    "Settings persist; demonstration uses new proof rules; corrupt/forged saves rejected; legacy progress preserved; gallery IDs validated",
  );
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: output + "/final.png" });
} catch (error) {
  report.failure = String(error.stack || error);
  console.error(report.failure);
  await page.screenshot({ path: output + "/failure.png" });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
