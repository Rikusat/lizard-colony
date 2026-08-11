"use strict";
// ============================================================
// P2-3 巣ロスター統合(80→20・案A) 回帰テスト(恒久・2026-08-11 Ric承認)
//   ①グループ局所 2^4×20=320通り全数(解放写像/付与額/冪等)
//   ②代表3順序×81状態の掃引(率の非減少+鉱石種別ごとの総量保存の等式)
//   ④二重実行=無変化 ⑤legacy保全 ⑥load実チェーン
//   +解放ペースの掃引(旧80 vs 新20の解放間隔・報告用の実測値を出力)
// 実行: node tests/nest_roster_migration_regression.js
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
const store = {};
const sb = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} },
  document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
  UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
code += "globalThis.__t = { Game, buildNestWeb, buildNestWebLegacy, nestRewardList };\n";
vm.runInContext(code, sb, { filename: "combined.js" });
const { Game, buildNestWeb, buildNestWebLegacy, nestRewardList, NEST_CONDS } = sb.__t;
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]])); // キー順非依存の正規化比較

const LEG = buildNestWebLegacy().filter((n) => n.id !== "core");
const V2 = buildNestWeb().filter((n) => n.id !== "core");
ok("ロスター: 旧80 / 新20", LEG.length === 80 && V2.length === 20, `${LEG.length}/${V2.length}`);
// P2-3追補1(undefined再発防止): 全ノードの短名が定義済み・≤5文字・条件型がNEST_CONDSに存在(増減しても検知)
ok("短名: 全ノード定義済み・≤5文字・undefined無し・型が実在", V2.every((n) => n.name && !/undefined/.test(n.name) && n.name.length <= 5 && n.conds.every((c) => NEST_CONDS.some((d) => d.type === c.type))), V2.map((n) => n.name).join(","));
ok("写像: 新20が旧80を重複なく被覆", (() => {
  const all = V2.flatMap((n) => n.legacyIds);
  return all.length === 80 && new Set(all).size === 80;
})());
// 総量保存(ロスター定義レベル): Σ新報酬 ≡ Σ旧報酬(鉱石種別ごと)
const sumOres = (list, get) => { const s = {}; for (const n of list) for (const x of get(n)) s[x.ore] = (s[x.ore] || 0) + x.n; return s; };
const oldTotal = sumOres(LEG, (n) => [n.reward]);
const newTotal = sumOres(V2, (n) => nestRewardList(n));
ok("保存則(定義): Σ新20 ≡ Σ旧80(全鉱石種別)", canon(oldTotal) === canon(newTotal), JSON.stringify({ oldTotal, newTotal }));

const mkW = (openedIds) => {
  const nodes = {}; for (const id of openedIds) nodes[id] = true;
  return { nestWeb: { nodes, surprises: 3 }, rareWallet: {} };
};
const grantOf = (w) => w._nestRosterGrant || {};

// ---- ① グループ局所 2^4×20 = 320通り全数 ----
{
  let bad = 0;
  for (let g = 0; g < 20; g++) {
    const ids = V2[g].legacyIds;
    for (let mask = 0; mask < 16; mask++) {
      const opened = ids.filter((_, k) => mask & (1 << k));
      const w = mkW(opened);
      Game.migrateNestRosterV2(w);
      const unlocked = !!w.nestWeb.nodes[V2[g].id];
      const expUnlocked = mask !== 0;
      // 付与=グループ内の未解放旧報酬(解放時のみ)
      const expGrant = {};
      if (expUnlocked) for (const oldN of LEG) {
        if (!ids.includes(oldN.id) || opened.includes(oldN.id)) continue;
        expGrant[oldN.reward.ore] = (expGrant[oldN.reward.ore] || 0) + oldN.reward.n;
      }
      const wallet = {}; for (const k of Object.keys(w.rareWallet)) if (w.rareWallet[k]) wallet[k] = w.rareWallet[k];
      if (unlocked !== expUnlocked || JSON.stringify(wallet) !== JSON.stringify(expGrant)) { bad++; continue; }
      // 冪等: 2回目は無変化
      const snap = JSON.stringify([w.nestWeb, w.rareWallet]);
      delete w._nestRosterGrant;
      Game.migrateNestRosterV2(w);
      if (JSON.stringify([w.nestWeb, w.rosterV2, w.rareWallet]) !== JSON.stringify([JSON.parse(snap)[0], undefined, JSON.parse(snap)[1]])) bad++;
    }
  }
  ok("① グループ局所 320通り全数(解放写像/付与額/冪等)", bad === 0, "bad=" + bad);
}

// ---- ② 代表3順序×81状態(率の非減少+保存則の等式) ----
{
  const natural = LEG.map((n) => n.id);
  const worst = []; // 各グループ1つずつ先に(最悪分散)
  for (let k = 0; k < 4; k++) for (let g = 0; g < 20; g++) worst.push(V2[g].legacyIds[k]);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const shuffled = natural.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const legById = {}; for (const n of LEG) legById[n.id] = n;
  let bad = 0;
  for (const order of [natural, worst, shuffled]) {
    for (let k = 0; k <= 80; k++) {
      const opened = order.slice(0, k);
      const w = mkW(opened);
      Game.migrateNestRosterV2(w);
      const newOpen = Object.keys(w.nestWeb.nodes).length;
      if (newOpen / 20 + 1e-9 < k / 80) { bad++; continue; }                    // ⑥ 率の非減少
      // ③ 保存則の等式: 旧解放済み付与 + 移行付与 + 将来(未解放新ノード)の合算 == Σ全80
      const already = sumOres(opened.map((id) => legById[id]), (n) => [n.reward]);
      const future = sumOres(V2.filter((n) => !w.nestWeb.nodes[n.id]), (n) => nestRewardList(n));
      const g2 = grantOf(w);
      const total = {};
      for (const src of [already, future, g2]) for (const o of Object.keys(src)) total[o] = (total[o] || 0) + src[o];
      if (canon(total) !== canon(oldTotal)) bad++;
      if (canon(w.nestWeb.legacy) !== canon(mkW(opened).nestWeb.nodes)) bad++; // ⑤ legacy保全
    }
  }
  ok("② 代表3順序×81状態: 率非減少+鉱石種別ごとの保存則の等式+legacy保全", bad === 0, "bad=" + bad);
}

// ---- ⑥ load実チェーン(applyWorld経由で一度きり) ----
{
  Game.newGame();
  const w = Game.toWorld();
  w.nestWeb = { nodes: { "n0-0": true, "n2-5": true }, surprises: 1 };
  Game.applyWorld(w);
  const web = Game.state.nestWeb;
  ok("⑥ load実チェーン: rosterV2=1・新IDのみ・legacy退避", web.rosterV2 === 1 && Object.keys(web.nodes).every((id) => id[0] === "m") && web.legacy && web.legacy["n0-0"] === true,
    JSON.stringify({ rosterV2: web.rosterV2, nodes: Object.keys(web.nodes), legacy: Object.keys(web.legacy || {}) }));
  ok("⑥ 新規ゲーム(newGame)は移行不要の新ロスター", (() => { Game.newGame(); const w2 = Game.toWorld(); Game.applyWorld(w2); return Object.keys(Game.state.nestWeb.nodes).length === 0; })());
}

// ---- 解放ペースの掃引(報告用・線形成長モデル: 各指標が最大needまで一様に伸びると仮定) ----
{
  const maxNeed = {};
  for (const n of LEG.concat(V2)) for (const c of n.conds) maxNeed[c.type] = Math.max(maxNeed[c.type] || 0, c.need);
  const tOf = (n) => Math.max(...n.conds.map((c) => c.need / maxNeed[c.type]));
  const timeline = (list) => list.map(tOf).sort((a, b) => a - b);
  const tOld = timeline(LEG), tNew = timeline(V2);
  const gaps = (ts) => ts.slice(1).map((t, i) => t - ts[i]);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`[pace] 旧80: 初解放t=${tOld[0].toFixed(3)} 平均間隔=${avg(gaps(tOld)).toFixed(4)} 最大間隔=${Math.max(...gaps(tOld)).toFixed(3)}`);
  console.log(`[pace] 新20: 初解放t=${tNew[0].toFixed(3)} 平均間隔=${avg(gaps(tNew)).toFixed(4)} 最大間隔=${Math.max(...gaps(tNew)).toFixed(3)}`);
  ok("ペース: 新20の初解放が旧より極端に遅くない(≦2倍)", tNew[0] <= tOld[0] * 2 + 1e-9, `old=${tOld[0].toFixed(3)} new=${tNew[0].toFixed(3)}`);
}

console.log(`\n=== 巣ロスター統合 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(320通り全数/3順序×81状態/保存則の等式/冪等/legacy/load実チェーン)");
