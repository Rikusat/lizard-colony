"use strict";
// ② 無操作時の経済 回帰テスト(恒久) — 2026-07-29「バッタ(コオロギ)が勝手に減る」調査で新設。
//
//  ★このテストは「計測系が本当に給餌を観測できる」ことを先に証明してから本判定に入る(カナリア内蔵)。
//    理由: 調査時、UIスタブを「全プロパティがtruthyなProxy」にしていたため dialTick が
//    `UI._bossRewardOpen` で常に早期returnし、**自動給餌経路を1度も踏まないまま「減らない」と
//    誤結論しかけた**。観測できないテストは「異常なし」を偽造する。
//
//  ① 無操作(オートOFF)では、いかなる構成でもコオロギは減らない(=意図しない常時発火が無い)
//  ② 減る経路はオート給餌(state.dial.auto)ただ1つ。それ以外の自動給餌機構を作らない(§5nnn Ric裁定)
//  ③ 無操作でコイン・ジェム・石・希少鉱石が勝手に減らない
//  ④ 長押し連続給餌の停止に「window側の保険」がある(クランクにイベントが届かなくても止まる)
//  ⑤ initFeeder が冪等(クランクが増殖して給餌が多重化しない)
// 実行: node tests/idle_economy_regression.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) { pass++; } else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// UIスタブ: メソッド呼出は無害に飲むが、**内部フラグ(_で始まる)は必ず falsy** にする。
//   ここを truthy にすると UI._bossRewardOpen 等のゲートで本番経路を踏めなくなる(=偽の「異常なし」)。
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} }, document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__t = { Game, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__t;
}
const { Game, CFG } = load();

const snap = () => {
  const s = Game.state;
  const o = { crickets: s.crickets || 0, coins: s.coins || 0, gems: s.gems || 0, stones: s.stones || 0, fed: (s.stats && s.stats.fed) || 0 };
  for (const k of ["bio", "food", "energy", "science"]) o[k] = (s.res && s.res[k]) || 0;
  for (const k in (s.rareWallet || {})) o["rare_" + k] = s.rareWallet[k];
  return o;
};
// 無操作でメインループ相当を回す(UI側の入力は一切与えない)
const idle = (sec) => { for (let i = 0; i < sec * 60; i++) Game.tick(1 / 60); };
const setup = (fn) => { Game.newGame(); if (fn) fn(); return snap(); };

// ---- カナリア: この計測系は「給餌が起きたこと」を観測できるか ----
// 観測できないなら以降の「減らない」は無意味なので、ここで止める。
{
  const a = setup(() => { const d = Game.ensureDial(); d.auto = true; d.rate = 2; Game.state.crickets = 5000; });
  idle(20);
  const b = snap();
  ok("★カナリア: オートON時に給餌を観測できる(計測系が生きている)", b.fed > a.fed, "fed " + a.fed + "→" + b.fed);
  ok("★カナリア: オートON時はコオロギが実際に減る(消費経路が生きている)", b.crickets < a.crickets, "cri " + a.crickets + "→" + b.crickets);
  if (b.fed === a.fed) { console.log("\n計測系が給餌を観測できていない。以降の判定は信用できないため中断する。"); process.exit(1); }
}

// ---- ① 無操作(オートOFF): どの構成でもコオロギは減らない ----
const CASES = [
  ["新規コロニー", null],
  ["個体10匹", () => { for (let i = 0; i < 8; i++) { const c = JSON.parse(JSON.stringify(Game.state.lizards[0])); c.id = 900 + i; Game.state.lizards.push(c); } }],
  ["高ランク", () => { Game.state.rank = 95; }],
  ["巣が高Lv", () => { if (Game.state.nest) Game.state.nest.lv = 9; }],
  ["在庫僅少(切れ時トグルOFF)", () => { Game.state.crickets = 2; Game.ensureDial().stopOnEmpty = false; }],
  ["在庫ゼロ", () => { Game.state.crickets = 0; }],
];
for (const [label, fn] of CASES) {
  const a = setup(fn);
  ok(`${label}: 前提=オートOFF`, Game.ensureDial().auto === false);
  idle(120);
  const b = snap();
  ok(`${label}: 無操作120秒でコオロギが減らない`, b.crickets >= a.crickets - 1e-9, `${a.crickets} → ${b.crickets}`);
  ok(`${label}: 無操作120秒で給餌が1度も起きない`, b.fed === a.fed, `fed ${a.fed} → ${b.fed}`);
  ok(`${label}: 無操作120秒でコインが減らない`, b.coins >= a.coins - 1e-9, `${a.coins} → ${b.coins}`);
  for (const k of ["gems", "stones", "bio", "food", "energy", "science"]) {
    ok(`${label}: 無操作で ${k} が減らない`, b[k] >= a[k] - 1e-9, `${a[k]} → ${b[k]}`);
  }
  for (const k in a) if (k.startsWith("rare_")) ok(`${label}: 無操作で ${k} が減らない`, b[k] >= a[k] - 1e-9);
}

// ---- ② 減る経路はオート給餌ただ1つ ----
{
  const a = setup(() => { const d = Game.ensureDial(); d.auto = true; d.rate = 1; });
  idle(60);
  const b = snap();
  ok("オートONなら給餌が起きる(唯一の自動化経路)", b.fed > a.fed);
  // §5nnn Ric裁定: 巣・施設・その他の経路に自動給餌を作らない
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const feedCalls = (src.match(/this\.feedAll\(/g) || []).length;
  ok("game.js の feedAll 呼出はクランク経路(dialTick)の1箇所のみ", feedCalls === 1, "呼出=" + feedCalls);
  ok("dialTick は dial.auto でゲートされている", /dialTick\(dt\)\s*\{[\s\S]{0,200}?if\s*\(!d\.auto\)\s*return/.test(src));
  // 毎秒ブロック(味方パッシブ等)に給餌が紛れ込んでいないこと=過去の「巣経路の自動給餌」の再発検知。
  //   コメント行(撤廃の経緯を記した注意書き)は除いて実コードだけを見る。
  const perSec = (src.split("this._allyT >= 1")[1] || "").slice(0, 1600)
    .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("毎秒ブロックに給餌呼出が無い(巣経路の自動給餌が復活していない)", perSec.length > 100 && !/\bfeedAll\(|this\.feed\(/.test(perSec));
  ok("§5nnn の再実装禁止メモがコードに残っている(意図の保存)", /再実装禁止/.test(src));
}

// ---- ⑥ 切れ時トグル: 既定ON / 移行は一度きり / OFFの選択は尊重(Ric裁定 2026-07-29) ----
{
  Game.newGame();
  ok("新規コロニーの切れ時トグルは既定ON", Game.ensureDial().stopOnEmpty === true, JSON.stringify(Game.ensureDial()));
  ok("新規コロニーには移行フラグが立っている(以後反転しない)", Game.ensureDial().emptyDefaultOnV1 === 1);

  // 旧セーブ(明示的 false)は1度だけ true へ反転する
  const oldSave = { version: 15, dial: { auto: true, rate: 1, stopOnEmpty: false } };
  const m1 = Game.migrateStopOnEmpty(JSON.parse(JSON.stringify(oldSave)));
  ok("旧セーブ(明示的OFF)は移行でONへ反転する", m1.dial.stopOnEmpty === true);
  ok("移行でフラグが立つ", m1.dial.emptyDefaultOnV1 === 1);

  // ★一度きり: 移行後にプレイヤーがOFFへ戻したら、次回以降の移行は触らない
  const afterPlayerOff = JSON.parse(JSON.stringify(m1));
  afterPlayerOff.dial.stopOnEmpty = false;             // プレイヤーが意図的にOFFへ
  const m2 = Game.migrateStopOnEmpty(afterPlayerOff);
  ok("★移行は一度きり: プレイヤーがOFFに戻した選択を尊重する", m2.dial.stopOnEmpty === false);
  const m3 = Game.migrateStopOnEmpty(m2);
  ok("何度通しても冪等(OFFのまま)", m3.dial.stopOnEmpty === false);

  // dial が無い壊れたセーブでも落ちない
  const m4 = Game.migrateStopOnEmpty({ version: 15 });
  ok("dial欠落セーブでも移行が成立する", m4.dial && m4.dial.stopOnEmpty === true && m4.dial.emptyDefaultOnV1 === 1);

  // フラグは dial に載る=toWorld/applyWorld で自動的に往復する(保存の追加配線が要らない)
  Game.newGame();
  Game.ensureDial().stopOnEmpty = false;               // プレイヤーがOFFを選ぶ
  const w = Game.toWorld();
  ok("dialごと保存される(フラグが往復する)", w.dial && w.dial.emptyDefaultOnV1 === 1 && w.dial.stopOnEmpty === false);
  const w2 = Game.migrateStopOnEmpty(w);
  ok("★保存往復後も、OFFの選択が移行で上書きされない", w2.dial.stopOnEmpty === false);

  // 経済: 在庫0+オートON のとき、ONならGoldが減らない / OFFなら減る
  const goldAfter = (stopOnEmpty) => {
    Game.newGame();
    const d = Game.ensureDial(); d.auto = true; d.rate = 2; d.stopOnEmpty = stopOnEmpty;
    Game.state.crickets = 0; Game.state.coins = 100000;
    for (let i = 0; i < 8; i++) { const c = JSON.parse(JSON.stringify(Game.state.lizards[0])); c.id = 800 + i; Game.state.lizards.push(c); }
    const c0 = Game.state.coins, f0 = (Game.state.stats && Game.state.stats.fed) || 0;
    for (let i = 0; i < 15 * 60; i++) Game.tick(1 / 60);
    return { dGold: Game.state.coins - c0, dFed: ((Game.state.stats && Game.state.stats.fed) || 0) - f0 };
  };
  const on = goldAfter(true), off = goldAfter(false);
  ok(`★切れ時ON: 在庫0でもGoldが減らない(${on.dGold.toFixed(0)}G)`, on.dGold >= 0, JSON.stringify(on));
  ok(`切れ時OFF: 在庫0だとGoldが減る(${off.dGold.toFixed(0)}G)=OFFの意味は保たれる`, off.dGold < 0, JSON.stringify(off));
  ok(`切れ時ONでも育成は止まらない(自然湧きぶんは食べる: 給餌${on.dFed}回)`, on.dFed > 0, JSON.stringify(on));
  ok("切れ時ONの給餌回数はOFFより少ない(Gold換算補充が止まっている)", on.dFed < off.dFed, `on=${on.dFed} off=${off.dFed}`);

  // 在庫僅少ランプは「あえてOFFにした人」にだけ点く(既定ONでは点かない)
  const fd = fs.readFileSync(path.join(ROOT, "js/ui/screens/feeder.js"), "utf8");
  ok("在庫僅少ランプの条件は !stopOnEmpty && auto のまま(既定ONでは点かない)",
    /const low = !d\.stopOnEmpty && d\.auto &&/.test(fd));
}

// ---- ③④⑤ UI側(feeder.js)の停止保険・冪等性のソース検査 ----
{
  const fd = fs.readFileSync(path.join(ROOT, "js/ui/screens/feeder.js"), "utf8");
  ok("④ 連続給餌の解除が window の pointerup/pointercancel にも張られている",
    /window\.addEventListener\(ev,\s*release\)/.test(fd) && /\["pointerup",\s*"pointercancel"\]/.test(fd));
  ok("④ ウィンドウの blur でも解除される", /window\.addEventListener\("blur",\s*release\)/.test(fd));
  ok("④ タブ非表示でも解除される", /visibilitychange[\s\S]{0,80}document\.hidden[\s\S]{0,40}release\(\)/.test(fd));
  ok("④ 盤から外れたクランクの連続給餌は自走しない(isConnected ガード)", /if\s*\(!crank\.isConnected\)\s*\{\s*stopHold\(\);\s*return;\s*\}/.test(fd));
  ok("④ 押下のたびに前のループを畳む(タイマーの迷子を作らない)", /pointerdown[\s\S]{0,120}stopHold\(\);/.test(fd));
  ok("⑤ initFeeder が冪等(古い器を捨ててから作り直す)", /getElementById\("feeder-dial"\)[\s\S]{0,80}stale\.remove\(\)/.test(fd));
}

console.log(`\n=== 無操作時の経済 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(無操作で資源は減らない/減る経路はオート給餌のみ/連続給餌の停止保険/クランク冪等)");
