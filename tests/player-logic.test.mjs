import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  choose,
  inspect,
  startCase,
  proofStatus,
  resolveEnding,
  restore,
} from "../src/narrative.ts";
import { roomRoute } from "../src/navigation.ts";

const story = JSON.parse(
  fs.readFileSync(new URL("../src/data/case.json", import.meta.url)),
);
const layout = JSON.parse(
  fs.readFileSync(new URL("../src/data/layout.json", import.meta.url)),
);
const investigate = (route) =>
  route.reduce((s, bit) => choose(story, s, bit), startCase());
const search = (state, ids) =>
  ids.reduce((s, id) => inspect(story, s, id), state);

test("every question route can be solved by searching, without changing a committed answer", () => {
  for (let route = 0; route < 64; route++) {
    const path = route.toString(2).padStart(6, "0").split("").map(Number);
    const state = search(
      investigate(path),
      story.clues.map((c) => c.id),
    );
    assert.equal(proofStatus(story, state).complete, true);
    assert.deepEqual(state.path, path);
    assert.equal(resolveEnding(story, state, "accuse_voss"), "checkmate");
    assert.equal(resolveEnding(story, state, "final_lead"), "checkmate");
  }
});

test("a flask alone cannot establish the fatal drink; all three comparisons are required", () => {
  const state = investigate([1, 1, 1, 1, 1, 1]);
  const flask = search(state, ["poison_flask"]);
  assert.equal(proofStatus(story, flask).poison, false);
  assert.equal(resolveEnding(story, flask, "accuse_voss"), "voss_free");
  const compared = search(flask, ["medicine_register", "study_ledger"]);
  assert.equal(proofStatus(story, compared).complete, true);
  assert.equal(
    proofStatus(
      story,
      search(startCase(), ["poison_flask", "medicine_register"]),
    ).poison,
    false,
  );
});

test("ledger corroboration is necessary for motive and matching records can establish opportunity", () => {
  const hostile = investigate([0, 0, 0, 0, 0, 0]);
  const fragments = search(hostile, ["burned_accounts"]);
  assert.equal(proofStatus(story, fragments).motive, false);
  const ledger = search(fragments, ["study_ledger"]);
  assert.equal(proofStatus(story, ledger).motive, true);
  assert.equal(proofStatus(story, ledger).opportunity, false);
  assert.equal(
    proofStatus(story, search(ledger, ["duty_book"])).opportunity,
    true,
  );
});

test("physical searches commute with questioning, and restored states use current deductions", () => {
  const path = [0, 1, 0, 1, 0, 1];
  const clues = story.clues.map((c) => c.id);
  const before = path.reduce(
    (s, bit) => choose(story, s, bit),
    search(startCase(), clues),
  );
  const after = search(investigate(path), clues);
  assert.deepEqual(new Set(before.evidence), new Set(after.evidence));
  assert.deepEqual(proofStatus(story, before), proofStatus(story, after));
  assert.deepEqual(restore(story, before), before);
  assert.deepEqual(restore(story, after), after);
});

test("all room routes use real bidirectional doors and are shortest", () => {
  for (const from of layout.rooms)
    for (const to of layout.rooms) {
      const route = roomRoute(layout, from.id, to.id);
      assert.equal(route[0], from.id);
      assert.equal(route.at(-1), to.id);
      assert.equal(new Set(route).size, route.length);
      for (let i = 1; i < route.length; i++) {
        assert(
          layout.connections.some(
            (edge) =>
              (edge.a === route[i - 1] && edge.b === route[i]) ||
              (edge.b === route[i - 1] && edge.a === route[i]),
          ),
        );
      }
      const distance =
        Math.abs(from.origin[0] - to.origin[0]) / 8 +
        Math.abs(from.origin[1] - to.origin[1]) / 8;
      assert.equal(route.length - 1, distance);
    }
  assert.deepEqual(roomRoute(layout, "outside", "study"), []);
  assert.deepEqual(
    roomRoute({ rooms: layout.rooms, connections: [] }, "study", "library"),
    [],
  );
});

test("every clue and awarded fact has a valid notebook record and location", () => {
  for (const clue of story.clues) {
    assert(layout.rooms.some((room) => room.id === clue.room));
    assert.equal(story.evidence[clue.id].text, clue.text);
    assert.equal(story.evidence[clue.id].source, clue.room);
    assert.equal(story.evidence[clue.id].category, "physical");
  }
  for (const decision of [story.initial, ...story.suspects]) {
    assert.equal(decision.choices.length, 2);
    for (const choice of decision.choices)
      for (const id of choice.evidence) {
        const entry = story.evidence[id];
        assert(entry, "Unknown awarded fact " + id);
        if (entry.category === "testimony") {
          assert.equal(entry.text, choice.response);
          assert.equal(entry.source, decision.name);
        }
      }
  }
  assert.equal(story.evidence.weapon_origin.category, "physical");
  assert.equal(story.evidence.weapon_origin.source, "study");
  assert(!story.evidence.weapon_origin.text.includes("I took the new will"));
});
