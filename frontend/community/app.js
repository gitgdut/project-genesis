import {
  Practice,
  TYPES,
  LABELS,
  COST,
  cellFor,
  sceneView,
  validateAction,
} from "./domain.js";
import {
  CommunityGateway,
  MONAD,
  PUBLIC_APP,
  publicRpc,
  localPost,
} from "./gateway.js";
import { mount } from "../sandbox/scene.js";
import qrcode from "../vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id),
  query = new URLSearchParams(location.search),
  wall = query.get("wall") === "1";
const STORAGE = "genesis.community.practice.v1",
  short = (s) => (s && s.length > 16 ? s.slice(0, 6) + "…" + s.slice(-4) : s);
let mode = "practice",
  world = new Practice(),
  snapshot = world.snapshot(),
  role = readSession("genesis.role") ?? "A",
  actor = "",
  gateway = null,
  info = null,
  build = null,
  scene = null,
  selected = 2,
  rotation = 0,
  choice = null,
  busy = false,
  pending = null,
  polling = false,
  timer = null,
  lastRevision = -1,
  lastBlock = null,
  feed = [],
  tourRunning = false;
function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
let practicePersistence = true;
if (!["A", "B", "C"].includes(role)) role = "A";
let clockSample = performance.now(),
  clockTimer = null;
let receiptTimer = null;
function queueReceipt() {
  if (pending?.tx && !receiptTimer)
    receiptTimer = setTimeout(() => {
      receiptTimer = null;
      poll(true);
    }, 1000);
}
function tickClock() {
  if (mode === "practice") {
    $("clock").textContent = "无计时";
    return;
  }
  if (!snapshot.block) {
    $("clock").textContent = "同步中";
    return;
  }
  if (snapshot.phase === 0) {
    $("clock").textContent = "等待开局";
    return;
  }
  if (snapshot.phase === 2) {
    $("clock").textContent = "已完成";
    return;
  }
  if (snapshot.phase === 3) {
    $("clock").textContent = "已超时";
    return;
  }
  const left = Math.max(
    0,
    Math.ceil(
      snapshot.endsAt -
        snapshot.chainTime -
        (performance.now() - clockSample) / 1000,
    ),
  );
  $("clock").textContent = left ? left + " 秒" : "确认中";
}
document.body.classList.toggle("wall", wall);
const message = (text) => ($("message").textContent = text);
const roomMessage = (text) => ($("room-result").textContent = text);
const uuid = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const localRequest = async (method, params) =>
  (await localPost("api/rpc", { method, params })).result;
function balance() {
  if (mode === "practice") return world.balances[role] ?? 12;
  if (!actor) return null;
  return snapshot.balance === 0 &&
    !snapshot.owners.some((o) => o.toLowerCase() === actor.toLowerCase())
    ? 12
    : snapshot.balance;
}
function roomUrl(projector = false) {
  const u = new URL(
    mode === "monad"
      ? PUBLIC_APP
      : mode === "local" && info?.shareUrl
        ? info.shareUrl
        : new URL("play.html", location.href),
  );
  if (mode === "monad") u.searchParams.set("room", gateway.contract);
  if (mode === "local") u.searchParams.set("local", "1");
  if (projector) u.searchParams.set("wall", "1");
  return u.href;
}
function svg(url) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
}
function invitations() {
  const url = roomUrl();
  $("share-url").value = url;
  $("share-note").textContent =
    mode === "practice"
      ? "这是本机练习入口，不会连接到你的私人练习存档。"
      : mode === "local"
        ? "仅同一局域网内可用；本地 Anvil 演练，不是 Monad Testnet。"
        : "同一合约，同一座岛。观看无需钱包，建造需要测试钱包与测试 MON。";
  $("qr").innerHTML = svg(url);
  $("projection").href = roomUrl(true);
  $("wall-qr").innerHTML = svg(url);
  $("wall-url").textContent = url;
  $("wall-source").textContent =
    mode === "practice"
      ? "本机练习 · 非链上"
      : mode === "local"
        ? "ANVIL LOCAL · 31337"
        : "MONAD TESTNET · 10143";
}
function showFeed() {
  const items = feed.slice(-5).reverse();
  $("feed").replaceChildren(
    ...items.map((e) => {
      const li = document.createElement("li");
      li.append(
        document.createTextNode(
          `${short(e.actor)} ${e.type === "build" ? "组装了 " + LABELS[e.kind] : "拆回一个模块"} · #${e.revision}`,
        ),
      );
      if (e.tx && mode === "monad") {
        const a = document.createElement("a");
        a.href = MONAD.explorer + "/tx/" + e.tx;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = " 查看交易";
        li.append(a);
      }
      return li;
    }),
  );
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent =
      mode === "practice" ? "从一座风塔开始。" : "等待下一位建造者的链上贡献。";
    $("feed").append(li);
  }
}
function render(force = false) {
  $("objective-copy").textContent =
    mode === "practice"
      ? "先用无计时练习学会组装，再邀请大家挑战 90 秒共建。"
      : snapshot.phase === 2
        ? "挑战已完成。现在可以自由组装，拆接电网，继续改变这座岛。"
        : snapshot.phase === 3
          ? "本局挑战结束。主持人可新开一局，再试一次配合。"
          : snapshot.phase === 0
            ? "等大家加入后再动手：第一块确认后，90 秒开始。"
            : "分工建造，在 90 秒内接通风塔、居民舱、生态园与信标。";
  if (!clockTimer) clockTimer = setInterval(tickClock, 250);
  tickClock();
  $("restart-room").hidden =
    mode !== "local" ||
    !actor ||
    actor.toLowerCase() !== info?.hostAddress?.toLowerCase();
  if (force || lastRevision !== snapshot.revision) {
    scene?.rebuild(sceneView(snapshot));
    lastRevision = snapshot.revision;
  }
  $("mode").textContent =
    mode === "practice"
      ? "本机练习 · 非链上"
      : mode === "local"
        ? "Anvil 本地链 · 现场演练"
        : "Monad Testnet · 共建房间";
  $("people-label").textContent = mode === "practice" ? "贡献角色" : "贡献地址";
  $("people").textContent = snapshot.participants;
  $("power").textContent = `${snapshot.used}/${snapshot.supply}`;
  $("homes").textContent = `${snapshot.homes}/2`;
  $("goals").replaceChildren(
    ...[
      [snapshot.supply > 1, "接通风塔"],
      [snapshot.homes >= 2, "安置两座居民舱"],
      [snapshot.gardens >= 1 && snapshot.beacons >= 1, "生态园与星际信标"],
      [
        snapshot.participants >= 3,
        mode === "practice" ? "三个练习角色协作" : "三个地址共同建造",
      ],
    ].map(([done, text]) => {
      const p = document.createElement("div");
      p.className = done ? "goal-done" : "";
      p.textContent = (done ? "● " : "○ ") + text;
      return p;
    }),
  );
  $("headline").innerHTML =
    snapshot.phase === 2 || snapshot.restored
      ? "这座岛，<br>因你们而亮。"
      : snapshot.phase === 3
        ? "这一次，<br>差一点点。"
        : "这座岛，<br>等你来点亮。";
  $("identity").textContent =
    mode === "practice"
      ? `练习角色 ${role}`
      : actor
        ? (info?.session?.name ?? short(actor))
        : "正在见证 · 尚未加入";
  $("budget").textContent =
    balance() === null ? "加入后获得 12 额度" : `${balance()} 建造额度`;
  $("provenance").textContent =
    mode === "practice"
      ? "本机练习，三个角色由本机模拟；不代表真实在线人数。"
      : !snapshot.block
        ? "正在读取房间的已确认状态，请稍候。"
        : `${mode === "local" ? "Anvil 本地链" : "Monad Testnet"} · 已确认版本 ${snapshot.revision} · 区块 ${parseInt(snapshot.block, 16)} · 建造额度不可转让，不是代币。`;
  $("role").hidden = mode !== "practice";
  $("role").textContent = `切换角色 ${role}`;
  $("tour").hidden = mode !== "practice" || wall;
  $("tour").disabled = tourRunning;
  $("confirm").disabled =
    busy ||
    tourRunning ||
    (choice?.type === "remove" &&
      snapshot.owners[choice.cell]?.toLowerCase() !==
        (mode === "practice" ? role : actor)?.toLowerCase());
  $("download").disabled = busy;
  showFeed();
  $("room-explain").textContent =
    mode === "local"
      ? "本地 Anvil 演练：无需钱包，使用主持机的临时测试账户。最多 9 位建造者，彼此操作同一份合约状态。"
      : mode === "monad"
        ? "这是 Monad Testnet 共建房间。观看不需要钱包，建造需要测试钱包授权与测试 MON 支付 gas。"
        : "先在本机练习，也可以创建或加入真实测试网房间。";
  if (mode === "practice" && practicePersistence)
    try {
      localStorage.setItem(STORAGE, world.export());
    } catch {
      message("自动保存不可用，请导出练习记录。");
    }
}
function clearChoice() {
  choice = null;
  $("action").hidden = true;
}
function selectCell({ x, z }) {
  if (wall || busy || tourRunning) return;
  if (snapshot.phase === 3) {
    message("本局已超时。主持人可新开一局，大家再次协作。");
    return;
  }
  if (mode !== "practice" && !snapshot.block) {
    message("正在等待房间的已确认状态。");
    return;
  }
  const cell = cellFor(x, z);
  if (cell === 40) {
    message("核心保留。贴着它组装风塔，再让其他人建起居民舱和生态园。");
    return;
  }
  const existing = snapshot.kinds[cell];
  choice = existing
    ? { type: "remove", cell }
    : { type: "build", cell, kind: selected, rotation };
  $("action-caption").textContent = `地块 ${x}, ${z}`;
  $("action-title").textContent = existing
    ? LABELS[existing]
    : LABELS[selected];
  const own = mode === "practice" ? role : actor;
  $("action-detail").textContent = existing
    ? `建造者：${short(snapshot.owners[cell])}。只有建造者可拆解，额度全额返还。`
    : `消耗 ${COST[selected]} 额度。必须连接已有建筑。${mode === "practice" ? "练习立即生效。" : "以链上确认结果为准。"}`;
  $("confirm").textContent = existing
    ? "拆回我的模块"
    : mode === "practice"
      ? "确认组装"
      : mode === "local"
        ? "提交本地链"
        : "钱包确认组装";
  $("action").hidden = false;
  if (existing && snapshot.owners[cell]?.toLowerCase() !== own?.toLowerCase()) {
    $("confirm").disabled = true;
    $("action-detail").textContent += " 你可以查看，不能拆走。";
  } else $("confirm").disabled = false;
}
function pendingKey() {
  return (
    "genesis.pending." +
    (mode === "local" ? info.instance : (gateway?.contract ?? "practice"))
  );
}
function savePending() {
  try {
    if (pending) sessionStorage.setItem(pendingKey(), JSON.stringify(pending));
    else sessionStorage.removeItem(pendingKey());
  } catch {
    /* tracking remains active in memory */
  }
}
async function poll(fast = false) {
  if (mode === "practice" || !gateway || polling || document.hidden) return;
  polling = true;
  const g = gateway,
    readingActor = actor;
  try {
    if (mode === "local") {
      const fresh = await fetch("api/info").then((r) => r.json());
      if (fresh.instance !== info.instance) {
        location.reload();
        return;
      }
    }
    if (pending?.tx) {
      const receipt = await g.receipt(pending.tx);
      if (g !== gateway) return;
      if (!receipt && fast) return;
      if (receipt) {
        if (receipt.status !== "0x1")
          message("这笔操作未成功，额度以链上状态为准。");
        else message("已确认。你的贡献已留在这座岛上。");
        pending = null;
        busy = false;
        savePending();
        clearChoice();
      }
    }
    const next = await g.read(readingActor);
    if (g !== gateway || readingActor !== actor) return;
    if (snapshot.block && BigInt(next.block) < BigInt(snapshot.block)) return;
    snapshot = next;
    clockSample = performance.now();
    render();
    const start =
      lastBlock === null
        ? BigInt(next.block) > 100n
          ? BigInt(next.block) - 100n
          : 0n
        : BigInt(lastBlock) + 1n;
    if (start <= BigInt(next.block)) {
      try {
        const events = await g.events("0x" + start.toString(16), next.block);
        if (g !== gateway) return;
        feed = [...feed, ...events].slice(-30);
        lastBlock = next.block;
        showFeed();
      } catch {
        message("地图已同步；共建足迹读取失败，将在下一次刷新重试。");
      }
    }
    if (pending?.tx) message("操作已广播，等待链上确认；地图暂不提前改变。");
  } catch (e) {
    message("房间同步暂不可用：" + e.message + "。已确认的画面保留。");
  } finally {
    polling = false;
    queueReceipt();
  }
}
function loop() {
  clearInterval(timer);
  timer = setInterval(poll, 5000 + Math.floor(Math.random() * 2000));
}
async function join() {
  if (snapshot.phase === 3) throw Error("本局已超时，请等待主持人新开一局。");
  if (mode === "practice") {
    actor = role;
    $("room-dialog").close();
    return;
  }
  if (mode === "local") {
    info.session = await localPost("api/join", { name: $("nickname").value });
    actor = info.session.address;
  } else {
    if (!window.ethereum)
      throw Error("请在钱包浏览器打开邀请链接；普通浏览器仍可观看。");
    if (
      (await window.ethereum.request({ method: "eth_chainId", params: [] })) !==
      MONAD.id
    )
      throw Error("请在钱包切换到 Monad Testnet（10143）");
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    });
    actor = accounts[0] ?? "";
    if (!/^0x[0-9a-f]{40}$/i.test(actor)) throw Error("未授权测试钱包");
  }
  const joinedGateway = gateway,
    joinedActor = actor;
  const joinedState = await joinedGateway.read(joinedActor);
  if (joinedGateway !== gateway || joinedActor !== actor)
    throw Error("房间或账户已变化，请重新加入。");
  snapshot = joinedState;
  clockSample = performance.now();
  render();
  $("room-dialog").close();
  message("已加入。选一个模块，把你的第一块留在岛上。");
}
async function submit() {
  if (snapshot.phase === 3) {
    message("挑战已超时，请主持人新开一局。");
    clearChoice();
    return;
  }
  if (busy || tourRunning || !choice) return;
  if (mode !== "practice" && !actor) {
    $("room-dialog").showModal();
    return;
  }
  const action = { ...choice };
  try {
    validateAction(
      snapshot,
      mode === "practice" ? role : actor,
      balance(),
      action,
    );
  } catch (e) {
    message(e.message);
    return;
  }
  if (mode === "practice") {
    try {
      world.apply(role, action);
      snapshot = world.snapshot();
      feed = world.trace.slice(-30).map((a, i) => ({
        ...a,
        revision: Math.max(
          1,
          world.revision - world.trace.slice(-30).length + 1 + i,
        ),
      }));
      clearChoice();
      render();
      message(
        snapshot.restored
          ? "浮岛已复苏！试试拆回风塔，再接通电网。"
          : "组装完成。切换角色，或邀请大家进入链上房间。",
      );
    } catch (e) {
      message(e.message);
    }
    return;
  }
  busy = true;
  render();
  message(
    mode === "local"
      ? "正在提交到本地链…"
      : "等待钱包确认。只使用测试 MON 支付 gas。",
  );
  try {
    let tx;
    if (mode === "local") {
      const id = uuid();
      const send = () => localPost("api/action", action, id, info.instance);
      let response;
      try {
        response = await send();
      } catch (e) {
        if (
          e instanceof TypeError ||
          e.name === "TimeoutError" ||
          e.name === "AbortError"
        )
          response = await send();
        else throw e;
      }
      tx = response.tx;
    } else
      tx = await new CommunityGateway(
        (method, params) => window.ethereum.request({ method, params }),
        gateway.contract,
        MONAD.id,
        build.runtimeHash,
      ).submit(actor, action);
    pending = { tx };
    savePending();
    clearChoice();
    message("已广播，等待确认。");
    await poll(true);
    queueReceipt();
  } catch (e) {
    busy = false;
    message(
      "操作未确认：" +
        e.message +
        (mode === "monad" ? "。如钱包已广播，请先检查钱包活动再重试。" : ""),
    );
    render();
  }
}
async function openMonad(address) {
  const g = new CommunityGateway(
    publicRpc,
    address,
    MONAD.id,
    build.runtimeHash,
  );
  await g.check();
  gateway = g;
  mode = "monad";
  actor = "";
  snapshot = { ...new Practice().snapshot(), block: null };
  lastBlock = null;
  lastRevision = -1;
  feed = [];
  info = null;
  pending = null;
  const url = new URL(location.href);
  url.searchParams.delete("local");
  url.searchParams.set("room", address);
  history.replaceState(null, "", url);
  try {
    pending = JSON.parse(sessionStorage.getItem(pendingKey()) ?? "null");
  } catch {}
  busy = !!pending;
  await poll();
  loop();
  invitations();
  $("room-dialog").close();
}
async function create() {
  if (!window.ethereum) throw Error("创建房间需要注入钱包的浏览器");
  if (
    (await window.ethereum.request({ method: "eth_chainId", params: [] })) !==
    MONAD.id
  )
    throw Error("请先在钱包切换到 Monad Testnet");
  const [from] = await window.ethereum.request({
    method: "eth_requestAccounts",
    params: [],
  });
  const tx = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{ from, value: "0x0", data: build.creationBytecode }],
  });
  roomMessage("部署已广播：" + tx + "。等待确认…");
  for (let i = 0; i < 60; i++) {
    const r = await window.ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [tx],
    });
    if (r) {
      if (r.status !== "0x1") throw Error("部署失败，请查看钱包活动");
      await openMonad(r.contractAddress);
      $("address").value = r.contractAddress;
      message("新房间已确认。邀请大家共建同一座岛。");
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw Error(
    "部署仍在等待确认。请在钱包交易详情中查看合约地址，确认后手动打开房间。",
  );
}
let settingUp = false;
function guarded(id, fn) {
  $(id).onclick = async () => {
    if (settingUp) return;
    if (busy) {
      message("请等待当前交易确认后再操作房间。");
      return;
    }
    settingUp = true;
    const controls = ["join", "open-room", "create-room", "restart-room"].map(
      $,
    );
    controls.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      roomMessage(e.message);
      message(e.message);
    } finally {
      settingUp = false;
      controls.forEach((b) => (b.disabled = false));
    }
  };
}
for (let k = 1; k <= 7; k++) {
  const b = document.createElement("button");
  b.dataset.kind = k;
  b.innerHTML = `${k} · ${LABELS[k]}<small>${COST[k]} 建造额度</small>`;
  b.setAttribute("aria-pressed", String(k === selected));
  b.onclick = () => {
    selected = k;
    for (const c of $("palette").children)
      c.setAttribute("aria-pressed", String(+c.dataset.kind === k));
    clearChoice();
    message("已选择" + LABELS[k] + "，点一块相邻空地。");
  };
  $("palette").append(b);
}
$("confirm").onclick = submit;
$("cancel").onclick = clearChoice;
$("rotate").onclick = () => {
  rotation = (rotation + 1) % 4;
  $("rotate").textContent = `旋转 R · ${rotation * 90}°`;
  if (choice?.type === "build") {
    choice.rotation = rotation;
    message("方向已更新为 " + rotation * 90 + "°");
  }
};
$("walk").onclick = () => {
  const walking = scene.toggleWalk();
  document.body.classList.toggle("walking", walking);
  $("walk").textContent = walking ? "返回组装" : "进入岛内";
  message(
    walking
      ? "WASD 行走，空格跳跃，拖动转向；触屏使用方向键。"
      : "选模块，点地块，确认组装。",
  );
};
for (const b of document.querySelectorAll("[data-move]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    scene?.setKey(b.dataset.move, true);
  };
  b.onpointerup =
    b.onpointercancel =
    b.onlostpointercapture =
      () => scene?.setKey(b.dataset.move, false);
}
$("role").onclick = () => {
  role = ["A", "B", "C"][(["A", "B", "C"].indexOf(role) + 1) % 3];
  try {
    sessionStorage.setItem("genesis.role", role);
  } catch {
    /* role remains usable in memory */
  }
  clearChoice();
  render();
  message("现在以练习角色 " + role + " 建造。三个角色由本机模拟。");
};
$("tour").onclick = async () => {
  if (world.trace.length || tourRunning) {
    message("演练会用到空白练习场。请先导出记录，再从房间菜单清空练习。");
    return;
  }
  tourRunning = true;
  render();
  try {
    for (const [a, cell, kind] of [
      ["A", 41, 2],
      ["B", 49, 3],
      ["C", 39, 4],
      ["B", 50, 3],
      ["C", 31, 7],
    ]) {
      world.apply(a, { type: "build", cell, kind, rotation: 0 });
      snapshot = world.snapshot();
      feed = world.trace.map((e, i) => ({ ...e, revision: i + 1 }));
      render();
      message(`练习角色 ${a} 组装了 ${LABELS[kind]}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    message("三位练习角色点亮了浮岛。现在可以自己搭建，或创建真实测试网房间。");
  } finally {
    tourRunning = false;
    render();
  }
};
$("menu").onclick = () => {
  $("room-dialog").showModal();
};
$("room-close").onclick = () => $("room-dialog").close();
$("invite-close").onclick = () => $("invite-dialog").close();
$("invite").onclick = () => {
  invitations();
  $("invite-dialog").showModal();
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("share-url").value);
    $("share-note").textContent = "链接已复制。";
  } catch {
    $("share-url").select();
    $("share-note").textContent = "请长按邀请地址复制。";
  }
};
guarded("join", join);
guarded("open-room", () => openMonad($("address").value.trim()));
guarded("create-room", create);
guarded("restart-room", async () => {
  if (
    mode !== "local" ||
    actor?.toLowerCase() !== info.hostAddress?.toLowerCase()
  )
    throw Error("只有本地演练主持人可以新开一局");
  if (
    !confirm("新开一局会切换所有人的现场地图，请先导出需要保留的记录。继续？")
  )
    return;
  await localPost("api/restart", {});
  location.reload();
});
$("practice").onclick = () => {
  const url = new URL("play.html", location.href);
  location.href = url.href;
};
$("reset-practice").onclick = () => {
  if (tourRunning) {
    roomMessage("请等待共建演练结束后再清空。");
    return;
  }
  if (mode !== "practice") {
    roomMessage("链上房间不能从浏览器清空。");
    return;
  }
  if (
    (world.trace.length || !practicePersistence) &&
    !confirm("清空本机练习？请先导出你要保留的记录。")
  )
    return;
  practicePersistence = true;
  world = new Practice();
  snapshot = world.snapshot();
  feed = [];
  lastRevision = -1;
  clearChoice();
  render();
  $("room-dialog").close();
};
$("download").onclick = () => {
  const payload =
    mode === "practice"
      ? world.export()
      : JSON.stringify(
          {
            format: "genesis.community.snapshot",
            version: 1,
            mode,
            chainId: gateway.chainId,
            contract: gateway.contract,
            block: snapshot.block,
            revision: snapshot.revision,
            kinds: snapshot.kinds,
            rotations: snapshot.rotations,
            builders: snapshot.owners,
            active: [...snapshot.active],
            restored: snapshot.restored,
            events: feed,
          },
          null,
          2,
        );
  const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "genesis-community.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.target.closest?.("input,button,a") ||
    document.querySelector("dialog[open]")
  )
    return;
  if (e.key.toLowerCase() === "r") $("rotate").click();
  if (+e.key >= 1 && +e.key <= 7) $("palette").children[+e.key - 1].click();
  if (e.key === "Escape") clearChoice();
});
window.addEventListener("storage", (e) => {
  if (mode === "practice" && e.key === STORAGE && e.newValue) {
    try {
      world = Practice.restore(e.newValue);
      snapshot = world.snapshot();
      lastRevision = -1;
      render();
    } catch {
      message("另一个练习窗口的记录无效，当前画面保留。");
    }
  }
});
window.ethereum?.on?.("accountsChanged", () => {
  actor = "";
  if (mode === "monad") {
    message("钱包账户已变化，请重新加入房间。");
    render();
  }
});
window.ethereum?.on?.("chainChanged", () => {
  if (mode === "monad") {
    actor = "";
    message("钱包网络已变化，请检查网络后重新加入。");
    render();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) poll();
});
async function boot() {
  try {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) world = Practice.restore(saved);
    } catch {
      practicePersistence = false;
      message(
        "练习记录未载入，原存储保留，自动保存暂时停用；可导出当前练习或明确清空后重开。",
      );
    }
    snapshot = world.snapshot();
    scene = mount($("scene"), selectCell);
    render();
    build = await fetch(new URL("./build.json", import.meta.url)).then((r) => {
      if (!r.ok) throw Error("房间合约资源未加载");
      return r.json();
    });
    if (query.has("room")) {
      await openMonad(query.get("room"));
      $("address").value = gateway.contract;
    } else {
      try {
        const r = await fetch("api/info", {
          signal: AbortSignal.timeout(1500),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.mode === "anvil-local") {
            info = d;
            mode = "local";
            gateway = new CommunityGateway(
              localRequest,
              d.contract,
              d.chainId,
              build.runtimeHash,
            );
            await gateway.check();
            actor = d.session?.address ?? "";
            snapshot = { ...new Practice().snapshot(), block: null };
            lastRevision = -1;
            lastBlock = null;
            await poll();
            try {
              pending = JSON.parse(
                sessionStorage.getItem(pendingKey()) ?? "null",
              );
              busy = !!pending;
            } catch {}
            loop();
          }
        }
      } catch (error) {
        if (query.has("local") || mode === "local")
          throw Error(
            "本地房间服务未运行。请让主持人启动 python -m genesis.live。",
          );
      }
    }
    invitations();
    render();
    if (wall) $("wall-invite").hidden = false;
    if (query.has("create") || (mode === "local" && !actor && !wall))
      $("room-dialog").showModal();
  } catch (e) {
    message(e.message);
    $("mode").textContent = "房间连接失败";
    roomMessage(e.message);
    $("room-dialog").showModal();
  }
}
window.addEventListener(
  "pagehide",
  () => {
    clearInterval(timer);
    clearInterval(clockTimer);
    clearTimeout(receiptTimer);
    scene?.dispose();
  },
  { once: true },
);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});
void boot();
