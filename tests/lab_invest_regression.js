"use strict";
// ============================================================
// 本部=デスク群の鉱石投資(hq_lab v2.0 §5.3 案B) 回帰テスト
// 実行: node tests/lab_invest_regression.js
//
// 仕様(Ric承認): labInvest={desks:n} を additive 保存(未定義=0=後方互換・SAVE_VERSION bump不要)。
//  rank(hqLevel)には一切触れない(禁じ手)。投資=鉱石消費のみ。tier=1+n(派生)。
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
  code += "globalThis.__e = { Game, CFG, SAVE_VERSION };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, CFG, SAVE_VERSION } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// === 後方互換: labInvest無しの既存セーブが正常load(未定義={}=Lv0) ===
{
  Game.newGame(); Game.state.coins = 12345;
  // toWorldから旧worldを作り、labInvestキーを消して「既存セーブ」を再現(実キー名に依存しない)
  const w = Game.toWorld();
  ok("toWorld: labInvestが含まれる(additive)", "labInvest" in w);
  delete w.labInvest; // 旧セーブ=キー無し
  Game.applyWorld(w);
  ok("旧セーブ(labInvest無し)load: 既定{}=Lv0・エラーなし", Game.labInvestLv("desks") === 0);
  ok("旧セーブload: 資産保全(coins)", Game.state.coins === 12345, "=" + Game.state.coins);
  ok("SAVE_VERSION据え置き(bump不要)", SAVE_VERSION === 15, "=" + SAVE_VERSION);
}
// === 投資: 鉱石消費・Lv+1・tier派生・rank非接触(禁じ手) ===
{
  Game.newGame();
  const rank0 = Game.state.rank;
  ok("投資: 鉱石不足では不発", Game.labInvestPay("desks", true) === false && Game.labInvestLv("desks") === 0);
  Game.addOre("titaniumOre", 10); Game.addOre("amber", 10); Game.addOre("orichalcum", 10); Game.addOre("amethyst", 10);
  ok("投資1: T1→T2(titanium2+amber2消費)", Game.labInvestPay("desks", true) && Game.labInvestLv("desks") === 1 && Game.ore("titaniumOre") === 8 && Game.ore("amber") === 8);
  ok("投資2: T2→T3", Game.labInvestPay("desks", true) && Game.labInvestLv("desks") === 2);
  ok("投資3: T3→T4", Game.labInvestPay("desks", true) && Game.labInvestLv("desks") === 3);
  ok("投資4: 最大到達=これ以上不可(cost=null)", Game.labInvestCost("desks") === null && Game.labInvestPay("desks", true) === false);
  ok("投資: rank(hqLevel)に一切触れない(禁じ手の遵守)", Game.state.rank === rank0 && Game.hqLevel() === rank0);
}
// === 保存往復: labInvestが保全される ===
{
  const w = Game.toWorld();
  ok("toWorld: labInvest.desks=3を保存", w.labInvest && w.labInvest.desks === 3);
  Game.newGame();
  Game.applyWorld(w);
  ok("applyWorld: labInvest復元(desks=3)", Game.labInvestLv("desks") === 3);
  // 冪等: 再往復で不変
  const w2 = Game.toWorld();
  ok("冪等: 再往復で不変", w2.labInvest.desks === 3);
}

console.log(`\n=== 本部投資(labInvest) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(additive後方互換/鉱石消費/tier派生/rank非接触=禁じ手遵守/保存往復/冪等/bump不要)");
