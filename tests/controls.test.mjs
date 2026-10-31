import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultControls,
  restoreControls,
  rebind,
  bindingError,
  actionForKey,
  actionHeld,
  controlRect,
  controlSize,
  touchNames,
} from "../src/controls.ts";

test("bindings replace their old keys, preserve independent movement aliases, and reject conflicts", () => {
  const original = defaultControls().bindings;
  const changed = rebind(original, "up", 0, "I");
  assert.equal(actionForKey(changed, "i"), "up");
  assert.equal(actionForKey(changed, "w"), undefined);
  assert.equal(actionForKey(original, "w"), "up");
  const held = new Set(["i", "arrowup"]);
  held.delete("i");
  assert.equal(actionHeld(changed, held, "up"), true);
  held.delete("arrowup");
  assert.equal(actionHeld(changed, held, "up"), false);
  assert.throws(() => rebind(changed, "interact", 0, "i"), /already assigned/);
  assert.throws(() => rebind(changed, "up", 1, "i"), /already assigned/);
  for (const key of ["escape", "enter", "tab", "control", "f5", "f11", ""])
    assert(bindingError(changed, "interact", key));
  assert(bindingError(changed, "choice1", "arrowleft"));
  assert.throws(() => rebind(changed, "mute", 1, "v"), /slot/);
});

test("custom preferences round-trip without sharing mutable defaults", () => {
  const prefs = defaultControls();
  prefs.bindings = rebind(prefs.bindings, "interact", 0, "k");
  prefs.bindings = rebind(prefs.bindings, "pause", 0, "p");
  prefs.bindings.up.splice(1, 1);
  prefs.mobile.joystick = { x: 0.38, y: 0.65, scale: 1.35 };
  assert.deepEqual(restoreControls(JSON.parse(JSON.stringify(prefs))), prefs);
  assert.deepEqual(defaultControls().bindings.interact, ["e"]);
  assert.equal(defaultControls().mobile.joystick.x, null);
});

test("damaged or incompatible preferences cannot remove recovery controls or move buttons offscreen", () => {
  assert.deepEqual(restoreControls(null), defaultControls());
  assert.deepEqual(restoreControls({ version: 9 }), defaultControls());
  const bad = defaultControls();
  bad.bindings.interact = ["w"];
  assert.deepEqual(restoreControls(bad).bindings, defaultControls().bindings);
  const forged = defaultControls();
  forged.bindings.up = ["enter"];
  assert.deepEqual(
    restoreControls(forged).bindings,
    defaultControls().bindings,
  );
  for (const item of [
    { x: Infinity, y: 0.5, scale: 1 },
    { x: 1.4, y: 0.5, scale: 1 },
    { x: null, y: 0.5, scale: 1 },
    { x: 0.5, y: 0.5, scale: 8 },
  ]) {
    const prefs = defaultControls();
    prefs.mobile.joystick = item;
    assert.deepEqual(
      restoreControls(prefs).mobile.joystick,
      defaultControls().mobile.joystick,
    );
  }
});

test("the larger default joystick sits inward; every resized control remains reachable across phone sizes", () => {
  const layout = defaultControls().mobile;
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    const joy = controlRect(layout, "joystick", width, height);
    assert.equal(joy.width, 140);
    assert.equal(joy.height, 140);
    assert(joy.left >= 20);
    assert(height - joy.top - joy.height >= 32);
    const note = controlRect(layout, "notebook", width, height),
      map = controlRect(layout, "map", width, height);
    assert(note.left + note.width <= map.left - 7);
    for (const id of Object.keys(touchNames))
      for (const scale of [0.7, 1, 1.7])
        for (const point of [0, 0.5, 1]) {
          const custom = structuredClone(layout);
          custom[id] = { x: point, y: point, scale };
          const r = controlRect(custom, id, width, height);
          assert(r.left >= 12 && r.top >= 10);
          assert(
            r.left + r.width <= width - 12 && r.top + r.height <= height - 16,
          );
          assert(r.width >= 44 && r.height >= 44);
        }
  }
  assert.equal(controlSize("joystick", 1.5).width, 210);
});
