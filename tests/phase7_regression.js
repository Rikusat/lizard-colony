"use strict";
// ============================================================
// Phase7 回帰テスト — 味方のボスLv連動 自動強化(手動育成不要)
// 実行: node tests/phase7_regression.js  (repoルートから)
//
// 仕様(§5ll / GameExpansion_V5 Phase7 / Ric承認: 加算・惑星Tier上限に常時連動):
//  効果: 味方在住惑星でのみ raidの実Tier(+elite)で raidDps を乗算(手動育成allyLvとは別枠=加算的)。
//  視覚: 惑星のTier上限(bossTierFor(rank))に常時連動して 巨大化(size)/数増(heads)。
//  詰み回避: allyScale は tier hpMult(1.5〜4.6)を"部分相殺"に留める(完全相殺=作業化/過少=詰み)。
//  非破壊: セーブ形式・確率・純血 非接触(効果=runtime/視覚=描画のみ)。
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = {
    console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    UI: np(), Render: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: np(),
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/render.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__e = { Game, STAGES, BOSS_TIERS, bossTierFor, PLANET_BOSS, planetAllyOf, Render, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, BOSS_TIERS, bossTierFor, planetAllyOf, Render, CFG } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);

// ---- 味方在住のstage1をセットアップ ----
function setup(rank) {
  Game.newGame(); Game.state.stageSel = 1; Game.state.rank = rank || 1; Game.checkAllies();
  return planetAllyOf(1);
}

// === CFG たたき台が定義されている ===
ok("CFG.allyScaleByTier = 長さ6の配列", Array.isArray(CFG.allyScaleByTier) && CFG.allyScaleByTier.length === 6);
ok("CFG.allyScaleElite が数値", typeof CFG.allyScaleElite === "number", "=" + CFG.allyScaleElite);
ok("CFG.allyVisSizePerTier が数値", typeof CFG.allyVisSizePerTier === "number");
ok("CFG.allyVisHeadsPerTier が数値", typeof CFG.allyVisHeadsPerTier === "number");
ok("CFG.allyVisHeadMax が数値", typeof CFG.allyVisHeadMax === "number");

// === raidAllyTierScale: Tier→倍率のマッピング(味方在住・非elite) ===
{
  const a = setup(320);
  ok("味方在住が前提(state.alliesにいる)", !!Game.state.allies[a.id]);
  for (let t = 1; t <= 6; t++) {
    const m = Game.raidAllyTierScale({ tier: t, elite: false });
    ok(`Tier${t}: allyScale = allyScaleByTier[${t - 1}] (${CFG.allyScaleByTier[t - 1]})`, near(m, CFG.allyScaleByTier[t - 1]), "=" + m);
  }
  // elite追加係数
  const me = Game.raidAllyTierScale({ tier: 3, elite: true });
  ok("elite: allyScale = byTier×allyScaleElite", near(me, CFG.allyScaleByTier[2] * CFG.allyScaleElite), "=" + me);
  // Tier無し(R30未満のボス)=1.0(強化なし)
  ok("Tier無し(tier:0)=1.0(強化なし)", Game.raidAllyTierScale({ tier: 0 }) === 1);
}

// === present-gate: 味方不在の惑星は強化なし(=強化するのは"味方"の働き) ===
{
  const a = setup(320);
  delete Game.state.allies[a.id]; // 味方を外す
  ok("味方不在: 高Tierでも allyScale=1(present-gated)", Game.raidAllyTierScale({ tier: 6, elite: true }) === 1);
}

// === raidDps 統合: 味方在住+高Tierで raidDps が byTier 倍される / 味方不在なら不変 ===
{
  setup(320);
  const mkRaid = (tier, elite) => ({ typeId: "snake", tier, elite: !!elite, webs: [] });
  Game.raid = mkRaid(0, false); const d0 = Game.raidDps();
  Game.raid = mkRaid(6, false); const d6 = Game.raidDps();
  ok("raidDps: Tier6 = Tier0 × allyScaleByTier[5]", near(d6, d0 * CFG.allyScaleByTier[5], 1e-6), `d0=${d0.toFixed(3)} d6=${d6.toFixed(3)}`);
  ok("raidDps: Tier6 > Tier0(味方が自動で強くなる)", d6 > d0);
  // 味方不在なら Tier に依らず不変(強化は味方の働き)
  const a = planetAllyOf(1); delete Game.state.allies[a.id];
  Game.raid = mkRaid(0, false); const n0 = Game.raidDps();
  Game.raid = mkRaid(6, true); const n6 = Game.raidDps();
  ok("raidDps: 味方不在は Tier に依らず不変", near(n0, n6, 1e-6), `n0=${n0.toFixed(3)} n6=${n6.toFixed(3)}`);
}

// === 詰み回避: allyScale は tier hpMult を"部分相殺"に留める(完全相殺しない) ===
{
  // 各Tierで allyScale < そのTierの hpMult(味方強化が敵HP増を上回らない=作業化しない)
  for (let t = 1; t <= 6; t++) {
    ok(`Tier${t}: allyScale(${CFG.allyScaleByTier[t - 1]}) < hpMult(${BOSS_TIERS[t - 1].hpMult})=部分相殺`, CFG.allyScaleByTier[t - 1] < BOSS_TIERS[t - 1].hpMult);
  }
  // 味方の伸び率 << 敵HPの伸び率(T1→T6の比較)
  const allyRatio = CFG.allyScaleByTier[5] / CFG.allyScaleByTier[0];
  const bossRatio = BOSS_TIERS[5].hpMult / BOSS_TIERS[0].hpMult;
  ok("味方の伸び率 << 敵HPの伸び率(高Tierは歯応えを残す)", allyRatio < bossRatio, `ally=${allyRatio.toFixed(2)} boss=${bossRatio.toFixed(2)}`);
}

// === 視覚: _allyVisTier が rank→Tier上限に常時連動 ===
{
  Render.time = 0;
  const visTier = (rank) => { Game.state.rank = rank; return Render._allyVisTier(); };
  ok("_allyVisTier: R29(R30未満)=0", visTier(29) === 0);
  ok("_allyVisTier: R30=1", visTier(30) === 1);
  ok("_allyVisTier: R80=6", visTier(80) === 6);
  ok("_allyVisTier: bossTierFor と一致(R55→T3)", visTier(55) === (bossTierFor(55) ? bossTierFor(55).tier : 0));
}

// === 視覚: _allySquad の頭数が Tier で増える(数増)・上限を超えない ===
{
  Render.time = 0;
  const countHeads = (lv, rank) => {
    Game.state.rank = rank; let n = 0;
    Render._allySquad(np(), lv, () => { n++; });
    return n;
  };
  const lowTier = countHeads(1, 1);   // tier0
  const highTier = countHeads(1, 80); // tier6
  ok("_allySquad: 低Tier(R1,Lv1)=1頭", lowTier === 1, "=" + lowTier);
  ok("_allySquad: 高Tier(R80,Lv1)で頭数増(数増)", highTier > lowTier, `low=${lowTier} high=${highTier}`);
  ok("_allySquad: 頭数は allyVisHeadMax を超えない", countHeads(5, 80) <= CFG.allyVisHeadMax, "=" + countHeads(5, 80));
}

// === 非破壊: 効果は runtime・makeLizard スキーマに新フィールドを足していない(セーブ非接触) ===
{
  const lz = Game.makeLizard("kanahebi", "normal", { hue: 100, sat: 50, light: 50, pattern: "stripe" }, "adult");
  const keys = Object.keys(lz).sort().join(",");
  const expected = ["id", "speciesId", "morphId", "hue", "sat", "light", "pattern", "stage", "xp", "level", "injuredT", "breedCd"].sort().join(",");
  ok("makeLizard スキーマ不変(味方/tierフィールドを個体に足していない)", keys === expected, keys);
  // raidAllyTierScale は state を書き換えない(純粋)
  setup(320); const before = JSON.stringify(Game.state.allies);
  Game.raidAllyTierScale({ tier: 5, elite: true });
  ok("raidAllyTierScale は state を書き換えない(純粋)", JSON.stringify(Game.state.allies) === before);
}

console.log(`\n=== Phase7 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(Tier→倍率/elite/present-gate/raidDps統合/詰み回避=部分相殺/視覚の常時連動・数増/セーブ非接触)");
