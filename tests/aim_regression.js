"use strict";
// UPD-1(2026-09-05 Ric指示): ロックオン迎撃(照準ウィンドウ) 回帰テスト(恒久)
//
//  設計: 鷹の威嚇タップ・クモの巣ほつしと同系の「raid中ギミック」を地上敵全体へ一般化。
//  規律: 無操作=従来の自動戦闘と完全同一(加点設計) / タイミング=到着からの経過秒の純関数(決定論・
//        Math.random不使用) / 効果=既存stunT機構+DPS×秒の追撃(新しい強さの式を作らない) /
//        セーブ非接触(照準の状態はランタイムのraidオブジェクトのみ) / 聖域(slit/繁殖/保存)非接触。
//  ★カナリア先行(⑳): 検査が「開閉」と「効果」を本当に観測できることを実証してから本判定。
// 実行: node tests/aim_regression.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) { pass++; console.log("  PASS " + n); } else { fail++; fails.push(n); console.log("  FAIL " + n + (e ? " :: " + e : "")); } };

function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} }, document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date, UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__t = { Game, CFG, SNAKE_HOME };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__t;
}

// 地上敵の襲撃を実経路(startRaid→到着)で立てる
function raidUp(Game, CFG, SNAKE_HOME) {
  Game.newGame();
  const s = Game.state;
  s.raidTimer = 0.01;
  Game.tick(0.05);                     // startRaid(実経路)
  const r = Game.raid;
  r.cutinT = 0;
  r.snake.x = SNAKE_HOME.x + 4;        // 到着直前へ寄せる(移動も実経路で踏む)
  Game.tick(0.1);                      // arrived=true
  return r;
}

const { Game, CFG, SNAKE_HOME } = load();
ok("① CFG: aim系キーが存在し既定ON(★Ric調整枠)", CFG.aimOn === true && CFG.aimCycleSec > 0 && CFG.aimWindowSec > 0 && CFG.aimStunSec > 0 && CFG.aimDmgSec > 0);

let r = raidUp(Game, CFG, SNAKE_HOME);
ok("② 実経路で地上敵が到着(snake型・非飛翔)", !!r && r.snake.arrived && !(r.type && r.type.flying), "typeId=" + r.typeId);
ok("③ 到着直後(aimFirstSec前)はウィンドウが閉じている", Game.aimWindow(r) === null, "aimT=" + r.aimT);

// ---- ★カナリア1: 検査は開閉を本当に観測できる(窓幅0にすると永遠に開かない) ----
{
  const keep = CFG.aimWindowSec; CFG.aimWindowSec = 0;
  Game.tick(CFG.aimFirstSec + 0.05);
  ok("★カナリア: 窓幅0なら開かない(開閉の実測である証拠)", Game.aimWindow(r) === null);
  CFG.aimWindowSec = keep;
}
ok("④ aimFirstSec経過でウィンドウが開く(決定論=経過秒の純関数)", !!Game.aimWindow(r), "aimT=" + r.aimT.toFixed(2));
const w1 = Game.aimWindow(r);
ok("⑤ 同一状態で同じ答え(判定の単一窓口・純関数)", JSON.stringify(Game.aimWindow(r)) === JSON.stringify(w1));

// ---- 効果: ひるみ(既存stunT)+DPS×秒の追撃・1ウィンドウ1打 ----
const hp0 = r.snake.hp, dps = Game.raidDps();
const bite0 = r.biteT;
ok("⑥ 打撃が受理される", Game.aimStrike() === true);
ok("⑦ 追撃=コロニーDPS×aimDmgSec(新しい式を作らない)", Math.abs((hp0 - r.snake.hp) - dps * CFG.aimDmgSec) < 0.001, "Δhp=" + (hp0 - r.snake.hp).toFixed(2) + " 期待=" + (dps * CFG.aimDmgSec).toFixed(2));
ok("⑧ ひるみ=stunT(既存機構)へ入る", r.stunT >= CFG.aimStunSec - 0.001, "stunT=" + r.stunT);
ok("⑨ 1ウィンドウ1打(連打をボーナス化しない)", Game.aimStrike() === false && Game.aimWindow(r) && Game.aimWindow(r).struck === true);
{
  // ひるみ中は噛みつきが進まない(=噛みつき遅延の実証)。stunT消化まで biteT は不変
  const b = r.biteT;
  Game.tick(1.0);
  ok("⑩ ひるみ中は噛みつきタイマーが進まない(負傷予防が主報酬)", Math.abs(r.biteT - b) < 0.001, "biteT " + b.toFixed(2) + "→" + r.biteT.toFixed(2) + " stunT=" + r.stunT.toFixed(2));
  ok("⑩b 打撃前の噛みつき残と同値(bite0基準)", Math.abs(r.biteT - bite0) < 0.001);
}
// 次のウィンドウでは再び打てる
Game.tick(CFG.aimCycleSec);
const w2 = Game.aimWindow(r);
ok("⑪ 次周期で再び開き(idxが進む)打てる", !!w2 && w2.idx === w1.idx + 1 && Game.aimStrike() === true, "idx " + (w1 && w1.idx) + "→" + (w2 && w2.idx));

// ---- ★カナリア2+無操作不変: aimOn ON/OFF で「打たなければ」軌跡が同一 ----
{
  const run = (on) => {
    CFG.aimOn = on;
    const rr = raidUp(Game, CFG, SNAKE_HOME);
    Game.tick(6.0);
    const out = { hp: rr.snake.hp, biteT: rr.biteT, stunT: rr.stunT || 0, timeLeft: rr.timeLeft };
    Game.raid = null; Game.state.raidTimer = CFG.raidInterval;
    return out;
  };
  const a = run(true), b = run(false);
  CFG.aimOn = true;
  ok("⑫ ★無操作なら従来挙動と完全同一(ON/OFFで hp・biteT・stunT・timeLeft が一致=加点設計)",
    Math.abs(a.hp - b.hp) < 0.001 && Math.abs(a.biteT - b.biteT) < 0.001 && a.stunT === b.stunT && Math.abs(a.timeLeft - b.timeLeft) < 0.001,
    JSON.stringify(a) + " vs " + JSON.stringify(b));
  ok("⑬ OFF時はウィンドウが開かず打撃も不受理", (function () { CFG.aimOn = false; const rr = raidUp(Game, CFG, SNAKE_HOME); Game.tick(CFG.aimFirstSec + 0.1); const res = Game.aimWindow(rr) === null && Game.aimStrike() === false; Game.raid = null; CFG.aimOn = true; return res; })());
}

// ---- 飛翔系は対象外(固有ギミックの領分) ----
{
  const rr = raidUp(Game, CFG, SNAKE_HOME);
  rr.type = { flying: true };
  Game.tick(CFG.aimFirstSec + 0.1);
  ok("⑭ 飛翔系(type.flying)はウィンドウ対象外", Game.aimWindow(rr) === null);
  Game.raid = null;
}

// ---- セーブ非接触・決定論・聖域非接触(走査) ----
{
  const w = Game.toWorld();
  ok("⑮ セーブ非接触(照準の状態はランタイムのraidのみ=toWorldに aim キーが無い)", JSON.stringify(w).indexOf('"aim') < 0);
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const block = src.split("UPD-1: ロックオン迎撃")[1];
  const upd = block ? block.split("updateRaid(dt)")[0] : "";
  ok("⑯ 新設ブロックに Math.random が無い(決定論=経過秒の純関数)", upd.length > 100 && upd.indexOf("Math.random") < 0);
  ok("⑰ 聖域非接触: slit.js に aim の参照が無い", fs.readFileSync(path.join(ROOT, "js/slit.js"), "utf8").indexOf("aim") < 0);
}

console.log(`\n=== ロックオン迎撃(UPD-1) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILS: " + fails.join(" / ")); process.exit(1); }
console.log("すべてPASS(決定論・1窓1打・無操作不変・stun遅延・DPS換算・セーブ/聖域非接触)");
process.exit(0);
