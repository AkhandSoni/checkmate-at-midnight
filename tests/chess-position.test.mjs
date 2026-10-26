import test from "node:test";
import assert from "node:assert/strict";
import { famousPosition, parseFen } from "../src/chess-position.ts";
const board = (index) =>
  new Map(
    parseFen(famousPosition.frames[index].fen).map((square) => [
      String.fromCharCode(97 + square.file) + square.rank,
      square.piece,
    ]),
  );
test("historical study uses complete valid positions and preserves the known rook-sacrifice sequence", () => {
  for (const frame of famousPosition.frames) {
    const pieces = parseFen(frame.fen);
    assert.equal(pieces.filter((p) => p.piece === "K").length, 1);
    assert.equal(pieces.filter((p) => p.piece === "k").length, 1);
    assert(
      pieces.every(
        (p) => p.file >= 0 && p.file < 8 && p.rank >= 1 && p.rank <= 8,
      ),
    );
  }
  assert.equal(board(0).get("d1"), "R");
  assert.equal(board(0).get("d4"), "p");
  assert.equal(board(0).get("c5"), "p");
  assert.equal(board(1).get("d1"), undefined);
  assert.equal(board(1).get("d4"), "R");
  assert.equal(board(2).get("c5"), undefined);
  assert.equal(board(2).get("d4"), "p");
  assert.equal(board(2).get("e1"), "R");
  assert.equal(board(3).get("e1"), undefined);
  assert.equal(board(3).get("e7"), "R");
  for (let i = 0; i < 4; i++) {
    assert.equal(board(i).get("a7"), "k");
    assert.equal(board(i).get("b1"), "K");
  }
  assert.deepEqual(
    famousPosition.frames.map((f) => parseFen(f.fen).length),
    [26, 25, 24, 24],
  );
  assert.throws(() => parseFen("8/8/8"));
  assert.throws(() => parseFen("9/8/8/8/8/8/8/8"));
});
