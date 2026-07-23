"use strict";
// ============================================================
// 合成=トランスミュート(§8) 回帰テスト
// 実行: node tests/trait_synth_regression.js  (repoルートから)
//
// 仕様(trait_system §8 / Ric確定):
//  案B=同一個体上で traits:[A,B]→[C] へ昇華(個体は残る)。100%確定(乱数なし)。触媒=石(order連動)。
//  固定印付き素材は禁止 / レジェンダリー除外 / 解読済みレシピのみ / 合成専用はgenesis不可 /
//  完全マッチング=基本12特性が各ちょうど1回(恒久制約§8.1) / 合成特性の遺伝はfloor 3%。
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
  code += "globalThis.__e = { Game, TRAITS, RECIPES, RESEARCH, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, TRAITS, RECIPES, RESEARCH, CFG } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const mk = (ks, m) => ({ morphId: m || "normal", traits: (ks || []).map((k) => ({ key: k })), x: 0, y: 0 });
const keysOf = (lz) => lz.traits.map((t) => t.key).sort().join(",");

// === RECIPES 整合 ===
ok("RECIPES=6本", Array.isArray(RECIPES) && RECIPES.length === 6);
{
  const mats = [], results = [];
  for (const r of RECIPES) {
    ok(`recipe[${r.result}]: 素材a/bがTRAITSに実在し非synth`, TRAITS[r.a] && TRAITS[r.b] && !TRAITS[r.a].synth && !TRAITS[r.b].synth);
    ok(`recipe[${r.result}]: 結果がTRAITSに実在しsynth(tier6)`, TRAITS[r.result] && TRAITS[r.result].synth === true && TRAITS[r.result].tier === 6);
    mats.push(r.a, r.b); results.push(r.result);
  }
  const basics = Object.keys(TRAITS).filter((k) => !TRAITS[k].synth);
  ok("完全マッチング(§8.1): 基本12特性が素材として各ちょうど1回", basics.length === 12 && basics.every((k) => mats.filter((m) => m === k).length === 1), mats.sort().join(","));
  ok("orderが1..6で一意(解読順)", RECIPES.map((r) => r.order).sort().join(",") === "1,2,3,4,5,6");
  ok("解読研究recipe1..6がRESEARCHに存在(前提チェーン)", [1, 2, 3, 4, 5, 6].every((i) => RESEARCH.some((x) => x.id === "recipe" + i)));
}

// === 昇華(案B): [A,B]→[C]・個体は残る・石消費 ===
{
  Game.newGame(); Game.state.stones = 100; Game.state.research.recipe4 = true; // ハガネ解読済
  const lz = mk(["yougan", "hyoga", "neon"]); lz.id = 7; lz.level = 5; Game.state.lizards = [lz];
  const before = Game.stones(), cost = Game.stoneSynthCost(Game.recipeByResult("hagane"));
  const oks = Game.synthesize(lz, "hagane", true);
  ok("合成: 成功=[yougan,hyoga,neon]→[neon,hagane](2つが1つへ昇華・無関係は残す)", oks && keysOf(lz) === "hagane,neon", keysOf(lz));
  ok("合成: 個体は残る(id/levelそのまま)", lz.id === 7 && lz.level === 5);
  ok("合成: 石を消費(order4=cost" + cost + ")", Game.stones() === before - cost);
  ok("合成: fxを積む", Array.isArray(Game._genesisFx) && Game._genesisFx.length >= 1);
  ok("合成: 特性数は減る(3→2)=上限3と矛盾しない", lz.traits.length === 2);
}
// === ガード群 ===
{
  Game.newGame(); Game.state.stones = 100;
  const lz = mk(["yougan", "hyoga"]);
  ok("合成: 未解読は不発", Game.synthesize(lz, "hagane", true) === false && keysOf(lz) === "hyoga,yougan");
  Game.state.research.recipe4 = true;
  const lz2 = mk(["yougan"]);
  ok("合成: 素材不足(片方のみ)は不発", Game.synthesize(lz2, "hagane", true) === false);
  const lz3 = mk(["yougan", "hyoga"]); lz3.fixedTraits = ["yougan"];
  ok("合成: 固定印付き素材は禁止(石投資の保護)", Game.synthesize(lz3, "hagane", true) === false && keysOf(lz3) === "hyoga,yougan");
  const leg = mk(["yougan", "hyoga"], "legendary");
  ok("合成: レジェンダリーは不可", Game.synthesize(leg, "hagane", true) === false);
  Game.state.stones = 0;
  const lz4 = mk(["yougan", "hyoga"]);
  ok("合成: 石不足は不発&非消費", Game.synthesize(lz4, "hagane", true) === false && Game.stones() === 0 && keysOf(lz4) === "hyoga,yougan");
  Game.state.stones = 100;
  const lz5 = mk(["yougan", "hyoga", "hagane"]);
  ok("合成: 既に結果を持つ個体は不可", Game.synthesize(lz5, "hagane", true) === false);
}
// === synthesizableRecipes(素材が揃うレシピの列挙・解読状態は問わない) ===
{
  const lz = mk(["yougan", "hyoga", "shinkai"]);
  const rs = Game.synthesizableRecipes(lz).map((r) => r.result);
  ok("列挙: 素材2つ揃い=hagane のみ(shinkaiは相方neonなし)", rs.join(",") === "hagane", rs.join(","));
  const fx = mk(["yougan", "hyoga"]); fx.fixedTraits = ["hyoga"];
  ok("列挙: 固定印付きは候補から外れる", Game.synthesizableRecipes(fx).length === 0);
  ok("列挙: レジェンダリーは空", Game.synthesizableRecipes(mk(["yougan", "hyoga"], "legendary")).length === 0);
}
// === 合成専用は genesis 不可(到達の証) ===
{
  const lz = mk([]);
  const c = Game.createableTraits(lz);
  ok("genesis候補に合成専用(synth)が出ない", !c.some((k) => TRAITS[k].synth), c.join(","));
  ok("genesis候補は基本12特性すべて", c.length === 12);
  Game.state.stones = 100;
  ok("genesisTraitでも合成専用は付与不可(候補外=検証で弾く)", (() => { const r = Game.genesisTrait(lz, "hagane", true); return r === false || !Game.hasTrait(lz, "hagane"); })());
}
// === 合成特性の遺伝 = floor 3%(tier6) ===
{
  const a = mk(["hagane"]), b = mk(["hagane"]);
  const N = 30000; let m = 0; const rng = lcg(11);
  for (let i = 0; i < N; i++) if (Game.inheritTraits(a, b, rng).length) m++;
  ok("合成特性の継承率 ≈ floor 3%(tier6)", Math.abs(m / N - CFG.traitInheritFloor) < 0.01, (100 * m / N).toFixed(2) + "%");
}
// === buyResearch の石コスト(解読V/VI) ===
{
  Game.newGame(); Game.state.stones = 1; Game.state.coins = 99999999; Game.state.res = Game.state.res || {};
  Game.addRes("science", 1000);
  for (const i of [1, 2, 3, 4]) Game.state.research["recipe" + i] = true;
  ok("解読V: 石不足でブロック", Game.buyResearch("recipe5") === false && !Game.state.research.recipe5);
  Game.state.stones = 10;
  const before = Game.stones();
  ok("解読V: 石2を消費して解読", Game.buyResearch("recipe5") === true && Game.stones() === before - 2 && Game.state.research.recipe5 === true);
}
// === 決定論(乱数なし=同条件同結果・100%確定) ===
{
  Game.newGame(); Game.state.research.recipe1 = true;
  for (let i = 0; i < 50; i++) {
    Game.state.stones = 100; // 毎回補充(石不足で失敗させない=確定性のみを見る)
    const lz = mk(["shinkai", "neon"]);
    if (!Game.synthesize(lz, "shizumimachi", true) || keysOf(lz) !== "shizumimachi") { ok("合成: 100%確定(50/50)", false, "i=" + i); break; }
    if (i === 49) ok("合成: 100%確定(50/50)・失敗RNGなし", true);
  }
}

console.log(`\n=== 合成(§8) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(RECIPES整合/完全マッチング/案B昇華=個体残る/固定印禁止/レジェンダリー除外/未解読・石不足ガード/genesis不可/floor3%遺伝/石コスト解読/100%確定)");
