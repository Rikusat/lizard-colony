"use strict";
// REL-3 件1(Ric裁定 2026-08-29): 全襲来=固定300秒周期 回帰テスト(恒久)
//
//  裁定: 襲来イベント全体の周期を固定300秒(CFG.raidInterval・★・決定論)へ統一。
//        「その回に何が来るか」(rollNextRaid=選択則)・敵の中身・報酬式は本件で一切不変。
//  意味論(現行維持): 実時間dtで減る/オフライン(離席Stage)中は進めない=据え置き/惑星移動はStage別に継続。
//  移行: 保存済みの進行中タイマーは据え置き(延長しない=プレイヤー不利にしない)。
//  ★カナリア内蔵: 「発火を観測できる」「間隔を本当に測っている」を先に実証してから本判定に入る
//    (観測できない計測は「問題なし」を偽造する=§5x-OPS ⑬系)。
// 実行: node tests/raid_cadence_regression.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) { pass++; console.log("  PASS " + n); } else { fail++; fails.push(n); console.log("  FAIL " + n + (e ? " :: " + e : "")); } };

// UIスタブ(idle_economy_regression と同型): 内部フラグ(_始まり)は必ず falsy
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} }, document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date, UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__t = { Game, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__t;
}
const { Game, CFG } = load();
Game.newGame();
const s = Game.state;

// ---- ★カナリア1: 計測器は発火を観測できる ----
s.raidTimer = 2;
Game.tick(2.1);
ok("★カナリア: 発火を観測できる(raidTimer=2→tickで襲来が立つ)", !!Game.raid);
Game.raid = null; s.raidTimer = CFG.raidInterval; // 終了経路と同じ形(this.raid=null→次周期はCFG.raidInterval)

// ---- ① 裁定値 ----
ok("① CFG.raidInterval=300(REL-3件1・全襲来の固定周期・★)", CFG.raidInterval === 300);

// ---- ②③ 偽クロック: 300秒ごとに発火(1秒刻み・決定論) ----
function measureFire() {
  let t = 0;
  for (let i = 0; i < 4000 && !Game.raid; i++) { Game.tick(1); t += 1; }
  const fired = !!Game.raid;
  Game.raid = null; s.raidTimer = CFG.raidInterval;
  return fired ? t : -1;
}
s.raidTimer = CFG.raidInterval;
const t1 = measureFire();
ok("② 初回=300秒で発火(±1秒)", t1 >= 300 && t1 <= 301, "t=" + t1);
const t2 = measureFire();
ok("③ 2回目も+300秒(リセット→再カウント)", t2 >= 300 && t2 <= 301, "t=" + t2);

// ---- ★カナリア2: 検査は間隔を本当に測っている(値を120へ変えると120で発火する) ----
const keep = CFG.raidInterval;
CFG.raidInterval = 120; s.raidTimer = CFG.raidInterval;
const t3 = measureFire();
CFG.raidInterval = keep; s.raidTimer = CFG.raidInterval;
ok("★カナリア: 間隔の実測である(120に変えると120で発火=300検査は偽値を見抜ける)", t3 >= 120 && t3 <= 121, "t=" + t3);

// ---- ⑤ 惑星移動を跨いでもタイマーは継続(Stage別保存・リセットされない) ----
s.rank = 10; // Stage2解放帯
const founder = s.lizards.filter((l) => l.stage === "adult")[0];
s.raidTimer = 200;
Game.selectStage(2, founder ? [founder.id] : undefined);
const fresh2 = Game.state.raidTimer;
ok("⑤ 新規惑星の初期タイマーもCFG参照(≦300で妥当)", fresh2 > 0 && fresh2 <= CFG.raidInterval + 0.01, "t2初期=" + fresh2);
Game.state.raidTimer = 222;
Game.selectStage(1);
ok("⑤b 惑星移動を跨いで継続(惑星1の200が保たれる=リセットしない)", Math.abs(Game.state.raidTimer - 200) < 0.01, "t=" + Game.state.raidTimer);
Game.selectStage(2);
ok("⑤c 逆側も継続(惑星2の222)", Math.abs(Game.state.raidTimer - 222) < 0.01, "t=" + Game.state.raidTimer);

// ---- ⑥ 離席(オフライン)中は進まない=据え置き(発火もしない) ----
//   惑星2のタイマーを50にして1時間離席→惑星1へ→戻る。進んでいれば50-3600で発火/負値になるはず。
Game.state.raidTimer = 50;
Game.selectStage(1);
const w = Game.toWorld();
const st2 = (w.stages || []).find((x) => x.id === 2);
if (st2) st2.lastTickAt = Date.now() - 3600 * 1000; // 1時間の離席を偽装
Game.applyWorld(w);
Game.selectStage(2);
ok("⑥ 離席中はタイマーが進まない(1時間後も50のまま=帰還後に通常カウント)",
  Game.state.raidTimer >= 3 && Game.state.raidTimer <= 50.01, "t=" + Game.state.raidTimer);

// ---- ⑦ 選択則(rollNextRaid)は本件で不変(スモーク。分布の深い検査は boss_roster が担う) ----
Game.selectStage(1);
const s1 = Game.state;
s1.rank = 1; s1.stageWins = 4; Game.rollNextRaid();
ok("⑦ pre-R30: 5勝目はボス(bossEvery=勝利数基準のまま・時間基準にしない)", s1.nextRaid.boss === true && s1.nextRaid.typeId === "snake");
s1.stageWins = 1; Game.rollNextRaid();
ok("⑦b pre-R30: 通常回は非ボス", s1.nextRaid.boss === false);
s1.rank = 30; Game.rollNextRaid();
ok("⑦c R30+: 常にボス(帯・署名の選択則に非接触)", s1.nextRaid.boss === true && s1.nextRaid.tier >= 1);

// ---- ⑧ タイマーと選択則の分離(timer値がロール結果に影響しない) ----
s1.rank = 1; s1.stageWins = 4;
s1.raidTimer = 1; Game.rollNextRaid(); const rollA = s1.nextRaid.boss;
s1.raidTimer = 299; Game.rollNextRaid(); const rollB = s1.nextRaid.boss;
ok("⑧ タイマーと選択則は分離(timer=1でも299でもロールは同じ)", rollA === true && rollB === true);

// ---- ⑨ 保存往復で据え置き(進行中タイマーの移行=延長しない) ----
s1.raidTimer = 234.5;
const w2 = Game.toWorld();
Game.applyWorld(w2);
ok("⑨ 保存往復で値が保たれる(据え置き=移行の丸めはプレイヤー不利にしない)",
  Math.abs(Game.state.raidTimer - 234.5) < 0.01, "t=" + Game.state.raidTimer);

console.log(`\n=== 襲来周期(REL-3件1) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILS: " + fails.join(" / ")); process.exit(1); }
console.log("すべてPASS(300秒固定・選択則分離・惑星継続・離席据え置き・保存往復)");
process.exit(0);
