import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as engine from "../src/narrative.ts";
import { Traversal } from "../src/traversal.ts";

const story = JSON.parse(
  fs.readFileSync(new URL("../src/data/case.json", import.meta.url)),
);
const investigate = (bits) =>
  bits.reduce(
    (state, bit) => engine.choose(story, state, bit),
    engine.startCase(),
  );

test("all six authored endings are reachable and complete proof protects the final lead", () => {
  const incomplete = investigate([0, 0, 0, 0, 0, 0]);
  for (const [action, ending] of [
    ["accuse_scarlet", "scarlet"],
    ["accuse_ash", "ash"],
    ["accuse_mara", "mara"],
    ["accuse_voss", "voss_free"],
    ["final_lead", "fire"],
  ])
    assert.equal(engine.resolveEnding(story, incomplete, action), ending);
  let complete = investigate([0, 0, 0, 0, 1, 0]);
  for (const clue of [
    "poison_flask",
    "goblet_residue",
    "medicine_register",
    "study_ledger",
    "burned_accounts",
  ])
    complete = engine.inspect(story, complete, clue);
  assert.equal(
    engine.resolveEnding(story, complete, "accuse_voss"),
    "checkmate",
  );
  assert.equal(
    engine.resolveEnding(story, complete, "final_lead"),
    "checkmate",
  );
});

test("81,920 route/clue/action combinations preserve the canonical proof and verdict rules", () => {
  const wrong = {
    accuse_scarlet: "scarlet",
    accuse_ash: "ash",
    accuse_mara: "mara",
  };
  const endings = new Set();
  let count = 0;
  for (let route = 0; route < 64; route++) {
    const state = investigate(
      route.toString(2).padStart(6, "0").split("").map(Number),
    );
    for (let mask = 0; mask < 256; mask++) {
      let found = state;
      story.clues.forEach((clue, index) => {
        if (mask & (1 << index)) found = engine.inspect(story, found, clue.id);
      });
      const evidence = new Set(found.evidence);
      assert.equal(evidence.size, found.evidence.length);
      const complete =
        evidence.has("poison_flask") &&
        evidence.has("goblet_residue") &&
        evidence.has("medicine_register") &&
        evidence.has("study_ledger") &&
        (evidence.has("fraud") || evidence.has("burned_accounts")) &&
        (evidence.has("voss_visit") ||
          evidence.has("flint_saw_voss") ||
          evidence.has("borrowed_keys") ||
          (evidence.has("study_ledger") && evidence.has("duty_book")));
      for (const action of story.actions) {
        const expected =
          wrong[action] ||
          (complete
            ? "checkmate"
            : action === "accuse_voss"
              ? "voss_free"
              : "fire");
        const result = engine.resolveEnding(story, found, action);
        assert.equal(result, expected);
        endings.add(result);
        count++;
      }
    }
  }
  assert.equal(count, 81920);
  assert.equal(endings.size, 6);
});

test("both initial decisions select the authored interrogation orders", () => {
  for (const [first, expected] of [
    [0, ["scarlet", "ash", "mara", "flint", "voss"]],
    [1, ["mara", "ash", "flint", "scarlet", "voss"]],
  ]) {
    let state = engine.choose(story, engine.startCase(), first);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      seen.push(engine.currentDecision(story, state).id);
      state = engine.choose(story, state, i % 2);
    }
    assert.deepEqual(seen, expected);
    assert.equal(engine.currentDecision(story, state), null);
  }
});

test("binary trees have the correct nodes, leaves, depths and parent links", () => {
  const investigation = engine.compileInvestigationTree(story);
  for (const [tree, total, decisions, leaves, height] of [
    [investigation, 127, 63, 64, 6],
    [engine.compileFullTree(investigation), 639, 319, 320, 9],
  ]) {
    const index = new Map(tree.nodes.map((node) => [node.id, node]));
    assert.equal(index.size, total);
    assert.equal(
      tree.nodes.filter((node) => node.left && node.right).length,
      decisions,
    );
    assert.equal(
      tree.nodes.filter((node) => !node.left && !node.right).length,
      leaves,
    );
    assert.equal(Math.max(...tree.nodes.map((node) => node.depth)), height);
    for (const node of tree.nodes) {
      if (node.type === "decision") {
        assert(node.left && node.right && node.left !== node.right);
        assert.equal(node.choices.length, 2);
      }
      for (const child of [node.left, node.right].filter(Boolean)) {
        assert.equal(index.get(child).parent, node.id);
        assert.equal(index.get(child).depth, node.depth + 1);
      }
    }
  }
});

test("actual DFS and BFS visit every node in the correct order", () => {
  const investigation = engine.compileInvestigationTree(story);
  for (const tree of [investigation, engine.compileFullTree(investigation)]) {
    const index = new Map(tree.nodes.map((node) => [node.id, node]));
    const preorder = [];
    const walk = (id) => {
      preorder.push(id);
      const node = index.get(id);
      if (node.left) walk(node.left);
      if (node.right) walk(node.right);
    };
    walk(tree.root);
    const levelOrder = [...preorder].sort(
      (a, b) => index.get(a).depth - index.get(b).depth,
    );
    for (const [mode, expected] of [
      ["DFS", preorder],
      ["BFS", levelOrder],
    ]) {
      const traversal = new Traversal(tree, mode);
      while (!traversal.done) traversal.step();
      assert.deepEqual(traversal.visited, expected);
      assert.equal(new Set(traversal.visited).size, tree.nodes.length);
      assert.deepEqual(traversal.pending, []);
      assert.equal(traversal.step(), null);
    }
  }
  const queue = new Traversal(investigation, "BFS");
  queue.step();
  assert.deepEqual(queue.pending, ["root0", "root1"]);
  queue.step();
  assert.deepEqual(queue.pending, ["root1", "root00", "root01"]);
});

test("saves, evidence Set and parent-path reconstruction reject inconsistent inputs", () => {
  let state = investigate([1, 1, 1, 1, 1, 1]);
  state = engine.inspect(story, state, "poison_flask");
  assert.deepEqual(engine.inspect(story, state, "poison_flask"), state);
  assert.deepEqual(
    engine.restore(story, JSON.parse(JSON.stringify(state))),
    state,
  );
  assert.throws(() =>
    engine.restore(story, { version: 1, path: [0], evidence: ["fraud"] }),
  );
  assert.throws(() => engine.choose(story, state, 0));
  assert.throws(() => engine.inspect(story, state, "invented"));
  const tree = engine.compileFullTree(engine.compileInvestigationTree(story));
  const index = new Map(tree.nodes.map((node) => [node.id, node]));
  assert.deepEqual(engine.reconstructPath(index, "root101010V"), [
    "root",
    "root1",
    "root10",
    "root101",
    "root1010",
    "root10101",
    "root101010",
    "root101010A",
    "root101010H",
    "root101010V",
  ]);
  assert.throws(() => engine.reconstructPath(index, "invented"));
});
