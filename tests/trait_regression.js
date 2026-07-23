"use strict";
// ============================================================
// 特性(Trait)システム 回帰テスト — S1(見た目試作・付与なし・セーブ非接触)
// 実行: node tests/trait_regression.js  (repoルートから)
//
// 仕様(trait_system.md §7〜16 / Ric承認 §16):
//  S1=見た目のみ・付与なし。通常個体(makeLizard)は traits を持たない=セーブ非接触。
//  TRAITS=data.js の単一の真実(データ駆動・draw=Renderメソッド名)。_paintTraits がkeyで分岐。
//  魂(骨格)は不変=顔に上乗せ描画のみ。純血/確率/物理 非接触。
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
  code += "globalThis.__e = { Game, TRAITS, Render };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, TRAITS, Render } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// 呼び出しを数える stub ctx(プロパティ代入は握りつぶす)
function recCtx() { const calls = {}; return new Proxy({}, { get(t, p) { if (p === "__calls") return calls; return (...a) => { calls[p] = (calls[p] || 0) + 1; }; }, set() { return true; } }); }
const GEO = { ex: 100, ey: 50, eyeR: 3, L: 100, col: { h: 30, s: 50, l: 50 } };

// === TRAITS = data.js の単一の真実(データ駆動) ===
ok("TRAITS が定義", TRAITS && typeof TRAITS === "object");
ok("TRAITS.mimikakushi が定義", !!TRAITS.mimikakushi);
// ロスター全件のデータ整合(§3拡張のたび自動検証): 必須フィールド+drawがRenderに実在+tier域+key一致
for (const k of Object.keys(TRAITS)) {
  const d = TRAITS[k];
  ok(`roster[${k}]: key一致・name/color/rim/icon/desc/tier/draw が揃う`,
    d.key === k && typeof d.name === "string" && typeof d.color === "string" && typeof d.rim === "string"
    && typeof d.icon === "string" && typeof d.desc === "string"
    && typeof d.tier === "number" && d.tier >= 1 && d.tier <= 5
    && typeof Render[d.draw] === "function", JSON.stringify(d));
}
{
  const d = TRAITS.mimikakushi;
  ok("mimikakushi.key='mimikakushi'", d.key === "mimikakushi");
  ok("mimikakushi.name(仮称)が文字列", typeof d.name === "string" && d.name.length > 0);
  ok("mimikakushi.tier=内部数値(非表示・1..5)", typeof d.tier === "number" && d.tier >= 1 && d.tier <= 5);
  ok("mimikakushi.draw=Renderのメソッド名", typeof d.draw === "string" && typeof Render[d.draw] === "function", d.draw);
  ok("mimikakushi.color(特性色)が定義", typeof d.color === "string");
}

// === _paintTraits: keyで分岐して描画(魂に上乗せ) ===
{
  const lz = { traits: [{ key: "mimikakushi" }] };
  const ctx = recCtx();
  Render._paintTraits(ctx, lz, GEO);
  ok("_paintTraits: mimikakushiで描画される(ellipse=仮面帯)", (ctx.__calls.ellipse || 0) >= 1, "ellipse=" + ctx.__calls.ellipse);
  ok("_paintTraits: 眼を穴から再スタンプ(arc)", (ctx.__calls.arc || 0) >= 1, "arc=" + ctx.__calls.arc);
  ok("_paintTraits: save/restoreで囲う(状態を汚さない)", (ctx.__calls.save || 0) >= 1 && (ctx.__calls.restore || 0) >= 1);
}
// 文字列key(将来のtraits:['key']形)も受ける
{
  const ctx = recCtx();
  Render._paintTraits(ctx, { traits: ["mimikakushi"] }, GEO);
  ok("_paintTraits: 文字列key形でも描画", (ctx.__calls.ellipse || 0) >= 1);
}
// 未知key=クラッシュせず何も描かない
{
  const ctx = recCtx();
  let threw = false;
  try { Render._paintTraits(ctx, { traits: [{ key: "nope_unknown" }] }, GEO); } catch (e) { threw = true; }
  ok("_paintTraits: 未知keyでcrashしない", !threw);
  ok("_paintTraits: 未知keyは何も描かない(ellipse呼ばれない)", !(ctx.__calls.ellipse));
}
// _paintTraits は個体を書き換えない(純粋)
{
  const lz = { traits: [{ key: "mimikakushi" }] };
  const before = JSON.stringify(lz);
  Render._paintTraits(recCtx(), lz, GEO);
  ok("_paintTraits: 個体を書き換えない(純粋)", JSON.stringify(lz) === before);
}

// === S2: makeLizard は additive traits[](既定=空)・後方互換 ===
{
  const lz = Game.makeLizard("kanahebi", "normal", { hue: 100, sat: 50, light: 50, pattern: "stripe" }, "adult");
  ok("makeLizard: traits フィールドを持つ(S2・additive)", Array.isArray(lz.traits));
  ok("makeLizard: 既定は空[](無印)", lz.traits.length === 0);
  const keys = Object.keys(lz).sort().join(",");
  const expected = ["id", "speciesId", "morphId", "hue", "sat", "light", "pattern", "stage", "xp", "level", "injuredT", "breedCd", "traits"].sort().join(",");
  ok("makeLizard: スキーマ=既存+traitsのみ(additive)", keys === expected, keys);
  // genes.traits を継承(繁殖経由の受け皿)
  const lz2 = Game.makeLizard("kanahebi", "normal", { hue: 100, sat: 50, light: 50, pattern: "stripe", traits: [{ key: "mimikakushi" }] }, "adult");
  ok("makeLizard: genes.traits を受け取る", lz2.traits.length === 1 && lz2.traits[0].key === "mimikakushi");
  // レジェンダリーは常に空(①・§16.4)
  const leg = Game.makeLizard("kanahebi", "legendary", { hue: 100, sat: 50, light: 50, pattern: "stripe", traits: [{ key: "mimikakushi" }] }, "adult");
  ok("makeLizard: レジェンダリーは traits を持てない(強制[])", leg.traits.length === 0);
}
// newGame後の初期個体は無印(空)=通常ゲームは付与なし=描画hookは不発
{
  Game.newGame();
  ok("newGame初期個体: 全員 無印(traits空)", Game.state.lizards.every((l) => !l.traits || l.traits.length === 0));
}
// レジェンダリーは描画対象外(①): morphId==="legendary"の個体は _paintTraits を通さない(hook側ガード)
{
  const ctx = recCtx();
  Render._paintTraits(ctx, { traits: [{ key: "mimikakushi" }] }, GEO); // _paintTraits自体は描く
  ok("_paintTraits単体は描く(hook側でlegendaryを弾く設計)", (ctx.__calls.ellipse || 0) >= 1);
}

console.log(`\n=== 特性(Trait) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(TRAITS単一真実/データ駆動draw/keyで分岐/未知key安全/純粋/付与なし=makeLizardスキーマ不変=セーブ非接触)");
