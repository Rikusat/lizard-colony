"use strict";
// ============================================================
// 賢者の石=特性の創世/固定化(S5) 回帰テスト
// 実行: node tests/trait_stone_regression.js  (repoルートから)
//
// 仕様(trait_system §16 ④ 案III / Ric承認):
//  S5-a 創世(genesis): 石を代償に血統に無い新特性を1つ付与。tier連動コスト・上限3・重複なし・レジェンダリー除外・石不足で不発。
//  S5-b 固定化(fix): クリア後解禁。個体が持つ特性を「必ず子へ(p→1.0)」。両親固定で2枚持ち確定。fixedTraits=additive。
//    inheritTraitsと整合=固定特性はp計算を迂回して100%継承(決定論)・上限3/レジェンダリー除外/genesis限定と矛盾しない。
//  セーブ非接触(traits/fixedTraits追記のみ)・確率(遺伝率以外)不変。
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
  code += "globalThis.__e = { Game, TRAITS, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, TRAITS, CFG } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const mk = (ks, m) => ({ morphId: m || "normal", traits: (ks || []).map((k) => ({ key: k })), x: 0, y: 0 });
// 合成特性(tier検証用)
TRAITS.zt1 = { key: "zt1", name: "zt1", color: "#fff", tier: 1, draw: "traitMimikakushi" };
TRAITS.zt5 = { key: "zt5", name: "zt5", color: "#fff", tier: 5, draw: "traitMimikakushi" };

// ===== S5-a: 創世(genesis) =====
ok("stoneGenesisCost = base + tier", Game.stoneGenesisCost(3) === CFG.stoneGenesisBase + 3, "=" + Game.stoneGenesisCost(3));
{
  Game.newGame(); Game.state.stones = 100;
  const lz = mk([]); Game.state.lizards = [lz];
  const before = Game.stones();
  const okg = Game.genesisTrait(lz, "mimikakushi", true);
  ok("創世: 成功=特性が付く", okg && Game.hasTrait(lz, "mimikakushi"));
  ok("創世: 石を消費(cost分)", Game.stones() === before - Game.stoneGenesisCost(TRAITS.mimikakushi.tier), `stones=${Game.stones()}`);
  ok("創世: 局所fxを積む(_genesisFx)", Array.isArray(Game._genesisFx) && Game._genesisFx.length >= 1);
}
// 重複は不可
{
  Game.state.stones = 100; const lz = mk(["mimikakushi"]);
  ok("創世: 既に持つ特性は創世できない(重複なし)", Game.genesisTrait(lz, "mimikakushi", true) === false);
}
// 上限3で不可
{
  Game.state.stones = 100; const lz = mk(["mimikakushi", "zt1", "zt5"]);
  ok("創世: 上限3を超えて創世できない", Game.genesisTrait(lz, "zt5", true) === false || lz.traits.length <= CFG.traitMaxPerLizard);
  ok("創世: 上限個体の特性数は3のまま", lz.traits.length === 3);
}
// レジェンダリー除外
{
  Game.state.stones = 100; const lz = mk([], "legendary");
  ok("創世: レジェンダリーには創世できない(①)", Game.genesisTrait(lz, "mimikakushi", true) === false && !Game.hasTrait(lz, "mimikakushi"));
  ok("createableTraits: レジェンダリーは空", Game.createableTraits(lz).length === 0);
}
// 石不足=不発・消費なし
{
  Game.state.stones = 0; const lz = mk([]); const before = Game.stones();
  ok("創世: 石不足は不発", Game.genesisTrait(lz, "mimikakushi", true) === false && !Game.hasTrait(lz, "mimikakushi"));
  ok("創世: 石不足で消費されない", Game.stones() === before);
}
// createableTraits: 未所持のみ
{
  const lz = mk(["mimikakushi"]);
  const c = Game.createableTraits(lz);
  ok("createableTraits: 既所持(mimikakushi)は候補に出ない", !c.includes("mimikakushi"));
  ok("createableTraits: 未所持(zt1)は候補に出る", c.includes("zt1"));
}

console.log(`\n=== 賢者の石(S5) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(S5-a 創世: tier連動コスト/付与/石消費/局所fx/重複なし/上限3/レジェンダリー除外/石不足で不発&非消費/候補は未所持のみ)");
