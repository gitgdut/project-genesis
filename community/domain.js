export const TYPES = [
  "",
  "cable",
  "generator",
  "home",
  "garden",
  "lumber",
  "quarry",
  "beacon",
  "core",
];
export const LABELS = [
  "",
  "Power Link",
  "Grid Turbine",
  "Habitat",
  "Bio Garden",
  "Fabricator",
  "Crystal Lab",
  "Signal Beacon",
  "Genesis Core",
];
export const COST = [0, 1, 5, 3, 3, 3, 3, 6];
export const cellFor = (x, z) => (z + 4) * 9 + x + 4;
export const position = (i) => ({ x: (i % 9) - 4, z: Math.floor(i / 9) - 4 });
export function validCell(i) {
  if (!Number.isInteger(i) || i < 0 || i >= 81) return false;
  const { x, z } = position(i);
  return x * x + z * z <= 21;
}
export function neighbors(i) {
  return [
    i % 9 > 0 ? i - 1 : -1,
    i % 9 < 8 ? i + 1 : -1,
    i >= 9 ? i - 9 : -1,
    i < 72 ? i + 9 : -1,
  ].filter((n) => n >= 0);
}
export function power(kinds, participants) {
  const connected = new Set([40]),
    queue = [40];
  let supply = 1,
    used = 0,
    homes = 0,
    gardens = 0,
    beacons = 0;
  const active = new Set();
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (kinds[i] === 2) supply += 6;
    for (const n of neighbors(i))
      if (kinds[n] && !connected.has(n)) {
        connected.add(n);
        queue.push(n);
      }
  }
  for (let i = 0; i < 81; i++) {
    if (!connected.has(i) || !kinds[i]) continue;
    const k = kinds[i],
      need = k === 7 ? 2 : k >= 3 && k <= 6 ? 1 : 0;
    if (used + need > supply) continue;
    used += need;
    active.add(i);
    if (k === 3) homes++;
    if (k === 4) gardens++;
    if (k === 7) beacons++;
  }
  return {
    active,
    supply,
    used,
    homes,
    gardens,
    beacons,
    restored: participants >= 3 && homes >= 2 && gardens >= 1 && beacons >= 1,
  };
}
export function sceneView(snapshot) {
  const colors = ["#b99aff", "#9fb9ad", "#d7b88c"];
  return {
    restored: Boolean(snapshot.restored),
    modules: snapshot.kinds.flatMap((k, i) => {
      if (!k) return [];
      const owner = snapshot.owners[i] ?? "",
        index =
          [...owner].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length;
      return [
        {
          kind: TYPES[k],
          ...position(i),
          rotation: snapshot.rotations[i],
          accent: colors[index],
        },
      ];
    }),
    network: () => ({
      active: new Set(
        [...snapshot.active].map((i) => {
          const p = position(i);
          return `${p.x},${p.z}`;
        }),
      ),
    }),
  };
}
export function validateAction(board, actor, balance, action) {
  const { cell, type, kind, rotation = 0 } = action;
  if (!validCell(cell) || cell === 40)
    throw Error("Choose an available district tile");
  if (type === "build") {
    if (
      !Number.isInteger(kind) ||
      kind < 1 ||
      kind > 7 ||
      !Number.isInteger(rotation) ||
      rotation < 0 ||
      rotation > 3
    )
      throw Error("Invalid module or orientation");
    if (board.kinds[cell])
      throw Error("This tile is occupied; refresh and choose another");
    if (!neighbors(cell).some((i) => board.kinds[i]))
      throw Error("Connect to the core or an existing module");
    if (balance < COST[kind])
      throw Error("Not enough build credits; reclaim one of your modules");
  } else if (type === "remove") {
    if (
      !board.kinds[cell] ||
      board.owners[cell]?.toLowerCase() !== actor?.toLowerCase()
    )
      throw Error("You can only reclaim modules you built");
  } else throw Error("Unknown action");
}
export class Practice {
  constructor() {
    this.kinds = Array(81).fill(0);
    this.kinds[40] = 8;
    this.rotations = Array(81).fill(0);
    this.owners = Array(81).fill("");
    this.balances = {};
    this.revision = 0;
    this.trace = [];
  }
  snapshot() {
    return {
      kinds: [...this.kinds],
      rotations: [...this.rotations],
      owners: [...this.owners],
      revision: this.revision,
      participants: Object.keys(this.balances).length,
      ...power(this.kinds, Object.keys(this.balances).length),
    };
  }
  apply(actor, action) {
    if (!["A", "B", "C"].includes(actor)) throw Error("Unknown practice role");
    if (this.trace.length >= 240)
      throw Error("Practice reached 240 actions; export and restart");
    const balance = this.balances[actor] ?? 12;
    validateAction(this, actor, balance, action);
    const { cell, type, kind, rotation = 0 } = action;
    this.balances[actor] = balance;
    if (type === "build") {
      this.balances[actor] -= COST[kind];
      this.kinds[cell] = kind;
      this.rotations[cell] = rotation;
      this.owners[cell] = actor;
    } else {
      this.balances[actor] += COST[this.kinds[cell]];
      this.kinds[cell] = 0;
      this.rotations[cell] = 0;
      this.owners[cell] = "";
    }
    this.revision++;
    this.trace.push({
      actor,
      type,
      cell,
      ...(type === "build" ? { kind, rotation } : {}),
    });
    return this.snapshot();
  }
  export() {
    return JSON.stringify({
      format: "genesis.community.practice",
      version: 1,
      actions: this.trace,
    });
  }
  static restore(text) {
    if (typeof text !== "string" || text.length > 40000)
      throw Error("Practice trace is too large");
    const d = JSON.parse(text);
    if (
      d.format !== "genesis.community.practice" ||
      d.version !== 1 ||
      !Array.isArray(d.actions) ||
      d.actions.length > 240
    )
      throw Error("Unsupported practice trace");
    const w = new Practice();
    for (const a of d.actions) w.apply(a.actor, a);
    if (w.export() !== text) throw Error("Non-canonical practice trace");
    return w;
  }
}
