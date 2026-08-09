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

// ===== S5-b: 固定化(fix) =====
ok("stoneFixCost = base + tier×perTier", Game.stoneFixCost(3) === CFG.stoneFixBase + 3 * CFG.stoneFixPerTier, "=" + Game.stoneFixCost(3));
// クリア前は解禁されない
{
  Game.newGame(); Game.state.stones = 100; Game.state.rocket = { done: false };
  const lz = mk(["mimikakushi"]);
  ok("固定: クリア前は不可(fixUnlocked=false)", Game.fixUnlocked() === false && Game.fixTrait(lz, "mimikakushi", true) === false);
}
// クリア後: 固定できる・石消費・持たない特性は固定不可(genesis限定)
{
  Game.state.rocket = { done: true }; Game.state.stones = 100;
  const lz = mk(["mimikakushi"]); const before = Game.stones();
  ok("固定: クリア後は解禁(fixUnlocked=true)", Game.fixUnlocked() === true);
  ok("固定: 持たない特性は固定できない(genesis限定)", Game.fixTrait(lz, "zt1", true) === false);
  const okf = Game.fixTrait(lz, "mimikakushi", true);
  ok("固定: 持つ特性を固定できる", okf && Game.isFixed(lz, "mimikakushi"));
  ok("固定: 石を消費(cost分)", Game.stones() === before - Game.stoneFixCost(TRAITS.mimikakushi.tier), `stones=${Game.stones()}`);
  ok("固定: 二重固定は不可", Game.fixTrait(lz, "mimikakushi", true) === false);
}
// 石不足=不発&非消費
{
  Game.state.rocket = { done: true }; Game.state.stones = 0;
  const lz = mk(["mimikakushi"]);
  ok("固定: 石不足は不発&非消費", Game.fixTrait(lz, "mimikakushi", true) === false && Game.stones() === 0 && !Game.isFixed(lz, "mimikakushi"));
}
// === 固定特性は100%継承(決定論・p迂回) ===
{
  const a = { morphId: "normal", traits: [{ key: "mimikakushi" }], fixedTraits: ["mimikakushi"] };
  const b = mk([]); // 片親のみ固定
  let miss = 0; const rng = lcg(99);
  for (let i = 0; i < 5000; i++) if (!Game.inheritTraits(a, b, rng).some((t) => t.key === "mimikakushi")) miss++;
  ok("固定: 片親固定→子は必ず継承(100%・p迂回)", miss === 0, "miss=" + miss);
}
// === 両親固定→2枚持ちが確定 ===
{
  const a = { morphId: "normal", traits: [{ key: "zt1" }], fixedTraits: ["zt1"] };
  const b = { morphId: "normal", traits: [{ key: "zt5" }], fixedTraits: ["zt5"] };
  let bothN = 0; const rng = lcg(7);
  for (let i = 0; i < 5000; i++) { const ks = Game.inheritTraits(a, b, rng).map((t) => t.key); if (ks.includes("zt1") && ks.includes("zt5")) bothN++; }
  ok("固定: 両親固定→2枚持ちが100%確定(601回の錬金ショートカット)", bothN === 5000, "both=" + bothN);
}
// === 固定は上限3・レジェンダリー除外と矛盾しない ===
{
  // 固定4つ(親A3+親B1)でも子は上限3(固定優先で切り詰め)
  const a = { morphId: "normal", traits: [{ key: "zt1" }, { key: "zt5" }, { key: "mimikakushi" }], fixedTraits: ["zt1", "zt5", "mimikakushi"] };
  const b = { morphId: "normal", traits: [{ key: "zt2" }], fixedTraits: ["zt2"] };
  TRAITS.zt2 = { key: "zt2", tier: 2, draw: "traitMimikakushi" };
  let over = 0; const rng = lcg(3);
  for (let i = 0; i < 2000; i++) if (Game.inheritTraits(a, b, rng).length > CFG.traitMaxPerLizard) over++;
  ok("固定: 固定が多くても上限3を超えない", over === 0, "over=" + over);
  // レジェンダリー親の固定は無効(伝播元にならない)
  const leg = { morphId: "legendary", traits: [{ key: "zt1" }], fixedTraits: ["zt1"] };
  let fromLeg = 0; const rng2 = lcg(5);
  for (let i = 0; i < 3000; i++) if (Game.inheritTraits(leg, mk([]), rng2).some((t) => t.key === "zt1")) fromLeg++;
  ok("固定: レジェンダリー親の固定は無効(伝播元にならない)", fromLeg === 0, "fromLeg=" + fromLeg);
}
// === 固定印は個体ごと・子には伝播しない(石の道が合成へ到達する必須条件・Ric §5vv) ===
{
  const a = { id: 1, morphId: "normal", speciesId: "kanahebi", hue: 100, sat: 50, light: 50, pattern: "stripe", traits: [{ key: "mimikakushi" }], fixedTraits: ["mimikakushi"] };
  const b = { id: 2, morphId: "normal", speciesId: "kanahebi", hue: 100, sat: 50, light: 50, pattern: "stripe", traits: [{ key: "zt1" }], fixedTraits: ["zt1"] };
  Game.newGame();
  let anyFixed = 0, both = 0, nonLegendary = 0;
  for (let i = 0; i < 500; i++) {
    const genes = Game.inherit(a, b);
    const child = Game.makeLizard(genes.speciesId, genes.morphId, genes, "baby");
    if (child.fixedTraits !== undefined) anyFixed++;
    if (child.morphId !== "legendary") { nonLegendary++; const ks = child.traits.map((t) => t.key); if (ks.includes("mimikakushi") && ks.includes("zt1")) both++; }
  }
  ok("固定印は子に伝播しない(fixedTraits未定義=そのまま合成素材にできる)", anyFixed === 0, "any=" + anyFixed);
  ok("両親固定→非レジェンダリーの子は全て2枚持ち(石の道の到達)", both === nonLegendary, `${both}/${nonLegendary}`);
}

// === 決定論(固定込みでも同一seed=同一子) ===
{
  const a = { morphId: "normal", traits: [{ key: "zt1" }, { key: "mimikakushi" }], fixedTraits: ["zt1"] };
  const b = mk(["mimikakushi"]);
  const r1 = Game.inheritTraits(a, b, lcg(42)).map((t) => t.key).sort().join(",");
  const r2 = Game.inheritTraits(a, b, lcg(42)).map((t) => t.key).sort().join(",");
  ok("固定込みでも決定論(同一seed=同一子)", r1 === r2, r1 + " vs " + r2);
}

console.log("== R5-a: genesis乱択の統計帯MC(恒久・N=24000・±5σ) ==");
{
  // 正規乱数につき黄金値不可→統計帯方式(roulette_rules §4の作法: 標本数と許容帯を明記)。
  // 一様性: 各期待 N/プール数・帯=±5σ(偽陽性≈6e-7/セル)。プール数はハーネス注入特性込みで動的算出。
  const N = 24000;
  const counts = {};
  let synthLeak = 0, costNg = 0;
  for (let i = 0; i < N; i++) {
    Game.newGame();
    Game.state.lizards = [];
    const lzR = Game.makeLizard("kanahebi", "normal", { hue: 1, sat: 1, light: 1, pattern: "none", traits: [] }, "adult");
    Game.state.lizards.push(lzR);
    Game.state.stones = 10;
    const key = Game.genesisTraitRand(lzR, true);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
    if (TRAITS[key].tier >= 6) synthLeak++;
    if (Game.stones() !== 10 - (CFG.stoneGenesisRandCost || 4)) costNg++;
  }
  const basicR = Object.keys(TRAITS).filter((k) => TRAITS[k].tier < 6); // 本番12+ハーネス注入のzt*も含む=プール実数で期待値を出す
  const pR = 1 / basicR.length;
  const expR = N * pR, bandR = Math.ceil(5 * Math.sqrt(N * pR * (1 - pR)));
  const offBand = basicR.filter((k) => Math.abs((counts[k] || 0) - expR) > bandR);
  ok("乱択: 12種全到達(N=" + N + ")", basicR.every((k) => (counts[k] || 0) > 0), basicR.filter((k) => !counts[k]).join(","));
  // ★V6-P1-2: tier6は創世プールに入る(到達不能を作らない)が、重みが極小なので**滅多に出ない**。
  //   「ゼロ」ではなく「全体の数%未満」を監視する=規律(到達可能)と体感(希少)の両立を固定する。
  const totalRolls = Object.values(counts).reduce((a, b) => a + b, 0);
  ok("乱択: tier6(旧・合成専用)は出うるが極小(全体の5%未満)", synthLeak * 20 < totalRolls, `t6=${synthLeak}/${totalRolls}`);
  ok("乱択: 一様性=各" + expR + "±" + bandR + "(±5σ)", offBand.length === 0, offBand.map((k) => k + "=" + counts[k]).join(","));
  ok("乱択: 一律コスト" + (CFG.stoneGenesisRandCost || 4) + "石の消費", costNg === 0, "ng=" + costNg);
  Game.newGame(); Game.state.lizards = [];
  const lzCap = Game.makeLizard("kanahebi", "normal", { hue: 1, sat: 1, light: 1, pattern: "none", traits: [{ key: "neon" }, { key: "shinkai" }, { key: "hyoga" }] }, "adult");
  Game.state.lizards.push(lzCap); Game.state.stones = 10;
  ok("乱択ガード: 上限3で不可", Game.genesisTraitRand(lzCap, true) === false);
  const lzLeg = Game.makeLizard("kanahebi", "legendary", { hue: 1, sat: 90, light: 60, pattern: "none", traits: [] }, "adult");
  Game.state.lizards.push(lzLeg);
  ok("乱択ガード: レジェンダリーに不可", Game.genesisTraitRand(lzLeg, true) === false);
  const lzPoor = Game.makeLizard("kanahebi", "normal", { hue: 1, sat: 1, light: 1, pattern: "none", traits: [] }, "adult");
  Game.state.lizards.push(lzPoor); Game.state.stones = 1;
  ok("乱択ガード: 石不足で不可", Game.genesisTraitRand(lzPoor, true) === false);
}

console.log(`\n=== 賢者の石(S5) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(S5-a 創世 / S5-b 固定化=クリア後解禁・持つ特性のみ・100%継承・両親固定で2枚持ち確定・上限3/レジェンダリー除外/決定論と整合)");
