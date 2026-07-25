"use strict";
// モーション回帰テスト(恒久): 居場所スポットの割当と姿勢(§8.5 モーション C1〜C4)。
//   C1 spotFor=決定論割当(capacity比例・状態非干渉・皆無時null) / C2 moveLizards配線(歩いて到達しspot確定・ワープなし・戦闘/帰巣/負傷/ロードで解除・数値非干渉) /
//   C3 _poseBob=姿勢の整数bob(posture別・移動/reduced-motion/非スポットでnull・決定論)。
//   純装飾=生産/戦闘/繁殖の数値には無影響(Fable1)・魂ピクセル不変(配置トランスフォームのみ)。
// 実行: node tests/motion_regression.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
const store = {};
const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 }, Math: Object.create(Math), JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np() };
sb.Motion = { reduced: false };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
code += "globalThis.__t = { Game, Render, CFG };\n";
vm.runInContext(code, sb, { filename: "combined.js" });
const { Game, Render, CFG } = sb.__t;
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// ===== C1: spotFor 決定論割当 =====
Game.newGame();
Game.state.facilities = { water: 20, heat: 20, observatory: 10, watchtower: 10 };
Game.state.nest = { lv: 8 };
const spots = Render.facilitySpots();
ok("C1: 全設備で複数スポット(>=6)", spots.length >= 6, "n=" + spots.length);
const before = JSON.stringify(Game.state.lizards.map((l) => [l.x, l.y]));
const a1 = Game.spotFor({ id: 12345 }), a2 = Game.spotFor({ id: 12345 });
ok("C1: 決定論(同id→同スポット)", a1 && a2 && a1.id === a2.id);
ok("C1: 状態非干渉(純関数)", JSON.stringify(Game.state.lizards.map((l) => [l.x, l.y])) === before);
const hist = {};
for (let id = 0; id < 4000; id++) { const s = Game.spotFor({ id }); hist[s.id] = (hist[s.id] || 0) + 1; }
ok("C1: 全スポットに配分", Object.keys(hist).length === spots.length);
const bask = spots.find((s) => s.id === "heat-bask"), pt = spots.find((s) => s.capacity === 1);
if (bask && pt) ok("C1: capacity比例(広い面>点)", hist[bask.id] > hist[pt.id], hist[bask.id] + " vs " + hist[pt.id]);
const savedFS = Render.facilitySpots; Render.facilitySpots = () => [];
ok("C1: スポット皆無→null", Game.spotFor({ id: 7 }) === null);
Render.facilitySpots = savedFS;

// ===== C2: moveLizards 配線 =====
Game.state.rank = 90;
const lz = { id: 501, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0 };
Game.state.lizards = [lz]; Game.ensureRuntime(lz); lz.x = 700; lz.y = 400; lz.resting = false;
sb.Math.random = () => 0; lz.wanderT = 0;
CFG.motDashOn = false; // V5M第1バッチ: 本節は従来歩行の不変条件を検査(ダッシュの連続性は下のV5M節で別検査)
const coins0 = Game.state.coins;
let maxStep = 0, prevX = lz.x, prevY = lz.y;
for (let i = 0; i < 400; i++) { Game.moveLizards(0.1); const st = Math.hypot(lz.x - prevX, lz.y - prevY); if (st > maxStep) maxStep = st; prevX = lz.x; prevY = lz.y; }
ok("C2: 歩いて到達しspot確定", !!lz.spot && lz.spot === lz._toSpot, "spot=" + lz.spot);
ok("C2: ワープなし(1step<=8.5px)", maxStep <= 8.5, "maxStep=" + maxStep.toFixed(2));
ok("C2: 数値非干渉(coins不変)", Game.state.coins === coins0);
CFG.motDashOn = true;
Game.raid = { snake: { x: 850, y: 430, arrived: true }, type: {}, typeId: "snake", webs: [] };
Game.moveLizards(0.1);
ok("C2: 戦闘中はspot解除", lz.spot === null && lz._toSpot === null);
Game.raid = null;
lz.spot = "heat-bask"; lz.returning = true; Game.moveLizards(0.1);
ok("C2: 帰巣中はspot解除", lz.spot === null); lz.returning = false;
lz.spot = "heat-bask"; lz.injuredT = 5; lz.wanderT = 1; Game.moveLizards(0.1);
ok("C2: 負傷中はspot解除", lz.spot === null); lz.injuredT = 0;
lz.spot = "obs-lookup"; lz._toSpot = "obs-lookup"; Game.settleDisplay();
ok("C2: settleDisplay(ロード相当)でspotクリア", lz.spot === null && lz._toSpot === null);

// ===== C3: _poseBob 姿勢 =====
Render.time = 3.14159;
const posed = (posture, extra) => Object.assign({ id: 7, spot: "x", moving: false, _spotPosture: posture }, extra || {});
ok("C3: 非スポット→null", Render._poseBob({ id: 1, spot: null, moving: false }) === null);
ok("C3: 移動中→null", Render._poseBob(posed("bask", { moving: true })) === null);
sb.Motion.reduced = true; ok("C3: reduced-motion→null(静止)", Render._poseBob(posed("bask")) === null); sb.Motion.reduced = false;
const amp = CFG.poseBobPx || 3;
let allInt = true, allRange = true, wadeDx = false, drinkDy = false;
for (const p of ["drink", "bask", "wade", "lookup", "lookout", "emerge", "unknown"]) {
  for (let i = 0; i < 200; i++) {
    Render.time = i * 0.1; const b = Render._poseBob(posed(p, { id: i }));
    if (!b || !Number.isInteger(b.dx) || !Number.isInteger(b.dy)) allInt = false;
    if (b && (Math.abs(b.dx) > amp + 1 || Math.abs(b.dy) > amp + 1)) allRange = false;
    if (b && p === "wade" && b.dx !== 0) wadeDx = true;
    if (b && p === "drink" && b.dy !== 0) drinkDy = true;
  }
}
ok("C3: 全posture整数bob", allInt);
ok("C3: 振幅内(<=poseBobPx±1)", allRange);
ok("C3: wade=左右(dx)の揺れ", wadeDx);
ok("C3: drink=上下(dy)の揺れ", drinkDy);
Render.time = 5.5;
ok("C3: 決定論(同入力→同出力)", JSON.stringify(Render._poseBob(posed("bask", { id: 42 }))) === JSON.stringify(Render._poseBob(posed("bask", { id: 42 }))));
let s1 = "", s2 = "";
for (let i = 0; i < 40; i++) { Render.time = i * 0.15; s1 += Render._poseBob(posed("bask", { id: 1 })).dy + ","; s2 += Render._poseBob(posed("bask", { id: 50 })).dy + ","; }
ok("C3: id位相ずれ(個体で揺れが違う)", s1 !== s2);

// ===== V5M 第1バッチ(2026-07-25): ⑦ダッシュ/⑧キョロキョロ/⑫見合い(ルール層)+①尾ゆらぎK(表現層) =====
{
  Game.newGame();
  Game.state.rank = 5;
  const dz = { id: 502, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0 };
  Game.state.lizards = [dz]; Game.ensureRuntime(dz);
  dz.x = 640; dz.y = 400; dz.tx = dz.x; dz.ty = dz.y; dz.resting = false;
  sb.Math.random = () => 0.99; CFG.spotVisitChance = 0; // スポット誘導を切って⑦を単離
  const coinsM = Game.state.coins;
  Game._motClock = 0; CFG.motDashRate = 1; dz.wanderT = 0;
  Game.moveLizards(0.1);
  ok("V5M⑦: ダッシュ発火(疾走窓+走った後の静止予約)", dz._dashT > 0 && dz.wanderT === (CFG.motDashRestSec || 5), `dashT=${dz._dashT} wanderT=${dz.wanderT}`);
  let mxs = 0, pxx = dz.x, pyy = dz.y;
  for (let i = 0; i < 60; i++) { Game.moveLizards(0.1); const st = Math.hypot(dz.x - pxx, dz.y - pyy); if (st > mxs) mxs = st; pxx = dz.x; pyy = dz.y; }
  ok("V5M⑦: 疾走も連続移動=ワープなし(1step<=45×mult×0.1×1.05)", mxs <= 45 * (CFG.motDashSpeedMult || 2.6) * 0.1 * 1.05, "max=" + mxs.toFixed(2));
  dz.wanderT = 0; Game.moveLizards(0.1);
  ok("V5M⑦: 同バケット内は再発しない", dz._dashT <= 0, "dashT=" + dz._dashT);
  // ⑧ キョロキョロ: 到着の瞬間に発火し、静止中に向きが2回反転して元の向きへ戻る
  CFG.motDashOn = false; CFG.motLookRate = 1; sb.Math.random = () => 0.5;
  dz.wanderT = 0; dz._lookT = 0; Game.moveLizards(0.1);
  let guard = 0; while (dz.moving && guard++ < 400) Game.moveLizards(0.1);
  ok("V5M⑧: 到着でキョロキョロ発火", dz._lookT > 0, "lookT=" + dz._lookT);
  const angA = dz.angle; let flips = 0, prevAng = dz.angle;
  for (let i = 0; i < 20; i++) { Game.moveLizards(0.1); if (dz.angle !== prevAng) { flips++; prevAng = dz.angle; } }
  ok("V5M⑧: 向きが2回反転し元へ戻る", flips === 2 && Math.abs(Math.cos(dz.angle) - Math.cos(angA)) < 1e-9, `flips=${flips}`);
  // ⑫ 見合い: 近接双方向すれ違いで両者停止・対面・クールダウン
  CFG.motMeetRate = 1;
  const ez = { id: 503, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0 };
  Game.state.lizards = [dz, ez]; Game.ensureRuntime(ez);
  dz.x = 600; dz.y = 400; dz.tx = 800; dz.ty = 400; dz.wanderT = 9; dz.moving = true; dz._lookT = 0; dz._meetCd = 0;
  ez.x = 624; ez.y = 400; ez.tx = 420; ez.ty = 400; ez.wanderT = 9; ez.moving = true; ez._meetCd = 0;
  Game.moveLizards(0.05);
  ok("V5M⑫: 見合い=両者停止+対面+CD", !dz.moving && !ez.moving && dz._meetCd > 0 && ez._meetCd > 0
    && Math.cos(dz.angle) > 0 && Math.cos(ez.angle) < 0 && dz.wanderT === (CFG.motMeetSec || 0.8), `a→${Math.cos(dz.angle).toFixed(2)} b→${Math.cos(ez.angle).toFixed(2)}`);
  ok("V5M: 数値非干渉(coins不変)", Game.state.coins === coinsM);
  // reduced-motion: 新モーションは一切発生しない
  sb.Motion.reduced = true; CFG.motDashOn = true; Game._motClock = 100; dz._motBk = undefined; dz.wanderT = 0; dz._dashT = 0; dz.moving = false; dz.spot = null;
  Game.moveLizards(0.1);
  ok("V5M: reduced-motionでダッシュ不発", dz._dashT <= 0);
  ok("V5M①: reduced-motionで尾ゆらぎK=1", Render._motTailK({ id: 1, moving: false, injuredT: 0 }) === 1);
  sb.Motion.reduced = false;
  // ①尾ゆらぎK: 決定論・範囲[1, motTailAmp]・OFF/移動中は1
  let seenHi = false, inRange = true;
  for (let id = 0; id < 40 && !seenHi; id++) {
    for (let tq = 0; tq < 80; tq++) {
      Render.time = tq * 0.1;
      const k = Render._motTailK({ id, moving: false, injuredT: 0 });
      if (k < 1 || k > (CFG.motTailAmp || 2.2) + 1e-9) inRange = false;
      if (k > 1.5) { seenHi = true; break; }
    }
  }
  ok("V5M①: 尾ゆらぎが実際に発生し振幅は[1,motTailAmp]内", seenHi && inRange);
  Render.time = 3.3;
  ok("V5M①: 決定論(同入力→同出力)", Render._motTailK({ id: 7, moving: false, injuredT: 0 }) === Render._motTailK({ id: 7, moving: false, injuredT: 0 }));
  CFG.motTailOn = false;
  ok("V5M①: OFFで常に1(従来ピクセル一致)", Render._motTailK({ id: 7, moving: false, injuredT: 0 }) === 1);
  CFG.motTailOn = true;
  ok("V5M①: 移動中は1(歩行の尾しなり0.05Lを侵さない)", Render._motTailK({ id: 7, moving: true, injuredT: 0 }) === 1);
  // settleDisplay: モーション残状態のクリア(stale姿勢なし)
  dz._dashT = 1; dz._lookT = 1; dz._meetCd = 5;
  Game.settleDisplay();
  ok("V5M: settleDisplayで残状態クリア", dz._dashT === 0 && dz._lookT === 0 && dz._meetCd === 0);
}

console.log(`\n=== モーション 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(C1割当:決定論/capacity比例/状態非干渉/null・C2配線:到達/ワープなし/解除/数値非干渉・C3姿勢:整数bob/null条件/決定論・V5M第1バッチ:⑦連続/⑧2反転/⑫対面/①K範囲/reduced停止/数値非干渉/クリア)");
