import { sha256Hex } from "../engine.js";
export const MONAD = {
  id: "0x279f",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadexplorer.com",
};
export const PUBLIC_APP =
  "https://mia03ther.github.io/project-genesis/play.html";
export const word = (n) => BigInt(n).toString(16).padStart(64, "0");
export function encodeAction(a) {
  if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell > 80)
    throw Error("无效地块");
  if (a.type === "remove") return "0xf06730e0" + word(a.cell);
  if (
    a.type !== "build" ||
    !Number.isInteger(a.kind) ||
    a.kind < 1 ||
    a.kind > 7 ||
    !Number.isInteger(a.rotation) ||
    a.rotation < 0 ||
    a.rotation > 3
  )
    throw Error("无效建造操作");
  return "0x50548d40" + word(a.cell) + word(a.kind) + word(a.rotation);
}
export function words(raw, length) {
  if (
    typeof raw !== "string" ||
    !/^0x[0-9a-f]+$/i.test(raw) ||
    raw.length !== 2 + length * 64
  )
    throw Error("合约响应格式不符");
  return Array.from({ length }, (_, i) =>
    BigInt("0x" + raw.slice(2 + i * 64, 66 + i * 64)),
  );
}
function integer(n) {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("合约数值超出支持范围");
  return Number(n);
}
export class CommunityGateway {
  constructor(request, contract, chainId, expectedHash) {
    this.request = request;
    this.contract = contract;
    this.chainId = chainId;
    this.expectedHash = expectedHash;
  }
  async check() {
    if (!/^0x[0-9a-f]{40}$/i.test(this.contract))
      throw Error("房间地址格式不正确");
    if ((await this.request("eth_chainId", [])) !== this.chainId)
      throw Error("连接的网络不符");
    const raw = await this.request("eth_getCode", [this.contract, "latest"]);
    if (
      !/^0x(?:[a-f0-9]{2})+$/i.test(raw) ||
      sha256Hex(
        Uint8Array.from(raw.slice(2).match(/../g), (v) => parseInt(v, 16)),
      ) !== this.expectedHash
    )
      throw Error("房间合约不是本版本的共建合约");
  }
  async read(actor = "") {
    const block = await this.request("eth_blockNumber", []),
      call = (data) =>
        this.request("eth_call", [{ to: this.contract, data }, block]);
    const [raw, revision, participants, status, round, balance] =
      await Promise.all([
        call("0x7cd3229a"),
        call("0x7cc96380"),
        call("0x6c4470fb"),
        call("0x200d2ed2"),
        call("0xe0ba8cea"),
        actor
          ? call("0x3e5beab9" + actor.slice(2).padStart(64, "0"))
          : Promise.resolve(null),
      ]);
    const roundWords = words(round, 3);
    if (roundWords[0] > 3n) throw Error("挑战状态无效");
    const b = words(raw, 243),
      p = words(status, 87),
      kinds = b.slice(0, 81).map(integer),
      rotations = b.slice(81, 162).map(integer);
    if (
      kinds.some((k) => k > 8) ||
      rotations.some((r) => r > 3) ||
      b.slice(162).some((v) => v >= 1n << 160n) ||
      p.slice(0, 81).some((v) => v > 1n) ||
      p[86] > 1n
    )
      throw Error("房间状态无效");
    const owners = b
      .slice(162)
      .map((v) => "0x" + v.toString(16).padStart(40, "0"));
    return {
      block,
      kinds,
      rotations,
      owners,
      revision: integer(words(revision, 1)[0]),
      participants: integer(words(participants, 1)[0]),
      active: new Set(p.slice(0, 81).flatMap((v, i) => (v === 1n ? [i] : []))),
      supply: integer(p[81]),
      used: integer(p[82]),
      homes: integer(p[83]),
      gardens: integer(p[84]),
      beacons: integer(p[85]),
      restored: p[86] === 1n,
      balance: balance ? integer(words(balance, 1)[0]) : null,
      phase: integer(roundWords[0]),
      endsAt: integer(roundWords[1]),
      chainTime: integer(roundWords[2]),
    };
  }
  async submit(actor, action) {
    if ((await this.request("eth_chainId", [])) !== this.chainId)
      throw Error("钱包网络已改变，请切回房间网络");
    return this.request("eth_sendTransaction", [
      {
        from: actor,
        to: this.contract,
        value: "0x0",
        data: encodeAction(action),
      },
    ]);
  }
  async receipt(hash) {
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error("交易哈希无效");
    const r = await this.request("eth_getTransactionReceipt", [hash]);
    if (r && r.to?.toLowerCase() !== this.contract.toLowerCase())
      throw Error("交易目标与房间不符");
    return r;
  }
  async events(from, to) {
    const logs = await this.request("eth_getLogs", [
      { address: this.contract, fromBlock: from, toBlock: to },
    ]);
    const built =
        "0xb3d2e4d61bb575c08ba72a05402ca5e7fe2a7cad7de944cc62a690f93a018f2c",
      removed =
        "0xda244a6edcf3b2d9aaa0c059acf24728801b72aa79f9fbe8af36699ffb1222e8";
    return logs
      .filter(
        (l) =>
          !l.removed &&
          l.address?.toLowerCase() === this.contract.toLowerCase() &&
          [built, removed].includes(l.topics?.[0]),
      )
      .map((l) => {
        const isBuild = l.topics[0] === built,
          v = words(l.data, isBuild ? 3 : 1);
        if (
          l.topics.length !== 3 ||
          !/^0x[0-9a-f]{64}$/i.test(l.transactionHash)
        )
          throw Error("事件格式无效");
        return {
          type: isBuild ? "build" : "remove",
          actor: "0x" + l.topics[1].slice(-40),
          cell: Number(BigInt(l.topics[2])),
          kind: isBuild ? Number(v[0]) : 0,
          revision: integer(v[isBuild ? 2 : 0]),
          tx: l.transactionHash,
        };
      });
  }
}
export async function publicRpc(method, params) {
  const r = await fetch(MONAD.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw Error("测试网读取失败，请重试");
  const data = await r.json();
  if (data.error) throw Error(data.error.message);
  return data.result;
}
export async function localPost(path, body, id, instance) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(id ? { "Idempotency-Key": id } : {}),
      ...(instance ? { "X-Room-Instance": instance } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "本地房间请求失败");
  return data;
}
