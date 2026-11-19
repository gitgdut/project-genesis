import test from "node:test";
import assert from "node:assert/strict";
import {
  CREWS,
  Practice,
  power,
  validateAction,
  sceneView,
  cellFor,
  nextContribution,
} from "./domain.js";
import { encodeAction, words } from "./gateway.js";
test("three roles restore the island; removing the source changes the actual goal", () => {
  const w = new Practice();
  for (const [actor, cell, kind] of [
    ["A", 41, 2],
    ["B", 49, 3],
    ["C", 39, 4],
    ["B", 50, 3],
    ["C", 31, 7],
  ])
    w.apply(actor, { type: "build", cell, kind, rotation: 0 });
  assert.equal(w.snapshot().restored, true);
  assert.deepEqual(w.balances, { A: 7, B: 6, C: 3 });
  w.apply("A", { type: "remove", cell: 41 });
  assert.equal(w.snapshot().restored, false);
  assert.equal(w.balances.A, 12);
  assert.deepEqual(Practice.restore(w.export()).snapshot(), w.snapshot());
});
test("invalid, occupied and foreign-owned actions are atomic", () => {
  const w = new Practice();
  w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 0 });
  const before = w.export();
  for (const a of [
    { type: "build", cell: 41, kind: 3, rotation: 0 },
    { type: "remove", cell: 41 },
    { type: "build", cell: 0, kind: 3, rotation: 0 },
    { type: "build", cell: 4, kind: 3, rotation: 0 },
    { type: "build", cell: 40, kind: 3, rotation: 0 },
  ]) {
    assert.throws(() => w.apply("B", a));
    assert.equal(w.export(), before);
  }
  assert.throws(() => w.apply("D", { type: "remove", cell: 41 }));
});
test("refunds do not duplicate allowance and zero supply routes cannot power disconnected modules", () => {
  const w = new Practice();
  for (let i = 0; i < 100; i++) {
    w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 0 });
    w.apply("A", { type: "remove", cell: 41 });
  }
  assert.equal(w.balances.A, 12);
  const kinds = Array(81).fill(0);
  kinds[40] = 8;
  kinds[42] = 2;
  assert.equal(power(kinds, 1).supply, 1);
  assert.equal(power(kinds, 1).active.has(42), false);
});
test("scene adapter and ABI encoding preserve cell identity and validate sizes", () => {
  const w = new Practice();
  w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 3 });
  const view = sceneView(w.snapshot());
  assert.equal(view.modules.find((m) => m.kind === "generator").rotation, 3);
  assert.ok(view.network().active.has("1,0"));
  assert.equal(cellFor(1, 0), 41);
  assert.equal(
    encodeAction({ type: "build", cell: 41, kind: 2, rotation: 3 }),
    "0x50548d40" +
      [41, 2, 3].map((n) => n.toString(16).padStart(64, "0")).join(""),
  );
  assert.throws(() =>
    encodeAction({ type: "build", cell: -1, kind: 1, rotation: 0 }),
  );
  assert.throws(() => words("0x00", 1));
  assert.deepEqual(words("0x" + "0".repeat(63) + "1", 1), [1n]);
});
test("malformed practice imports cannot change balances or inject snapshots", () => {
  assert.throws(() =>
    Practice.restore(
      '{"format":"genesis.community.practice","version":2,"actions":[]}',
    ),
  );
  const w = new Practice();
  const body = JSON.parse(w.export());
  body.balance = 999;
  assert.throws(() => Practice.restore(JSON.stringify(body)));
  assert.throws(() => Practice.restore("x".repeat(40001)));
  assert.throws(() =>
    validateAction(w, "A", 0, {
      type: "build",
      cell: 41,
      kind: 1,
      rotation: 0,
    }),
  );
});

test("crowd crews produce deterministic one-tap contributions", () => {
  const world = new Practice();
  const expected = [
    ["A", "power", 2],
    ["B", "habitat", 3],
    ["C", "lifeline", 4],
    ["B", "habitat", 3],
    ["C", "lifeline", 7],
  ];
  for (const [actor, crew, kind] of expected) {
    const action = nextContribution(world.snapshot(), crew);
    assert.equal(action.kind, kind);
    world.apply(actor, action);
  }
  assert.equal(world.snapshot().restored, true);
  assert.equal(CREWS.every((crew) => nextContribution(world.snapshot(), crew.id) === null), true);
});
