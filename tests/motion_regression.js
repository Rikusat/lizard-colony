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

// ===== V5M 第2バッチ(2026-07-25): ④岩上見張り/⑮レア引力/⑰惑星の環境反応 =====
{
  // ④ 岩上見張り: 岩レジストリ→スポット化(1匹用・OFFで消える)
  Render._stageBoulders = [
    { x: 400, y: 400, r: 30 }, { x: 700, y: 500, r: 24 }, { x: 900, y: 450, r: 20 }, { x: 500, y: 600, r: 10 },
  ];
  CFG.motPerchOn = true;
  const sp2 = Render.facilitySpots();
  const perch = sp2.filter((s) => s.id.startsWith("rock-perch-"));
  ok("V5M④: 大岩がスポット化(r>=18のみ・capacity1)", perch.length === 3 && perch.every((p) => p.capacity === 1), "n=" + perch.length);
  ok("V5M④: スポット位置=岩の上(y<岩心)", perch.every((p, i) => p.center.y < 600));
  CFG.motPerchOn = false;
  ok("V5M④: OFFで岩スポット消滅", Render.facilitySpots().every((s) => !s.id.startsWith("rock-perch-")));
  CFG.motPerchOn = true;
  // ⑮ レア引力: 無印がレアの傍へ(決定論・レア側/特性持ち側は寄らない)
  Game.newGame(); Game.state.rank = 5;
  const plain = { id: 601, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  const rare = { id: 602, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [{ key: "shinkai" }] };
  Game.state.lizards = [plain, rare];
  Game.ensureRuntime(plain); Game.ensureRuntime(rare);
  plain.x = 500; plain.y = 400; plain.tx = 500; plain.ty = 400; plain.resting = false;
  rare.x = 700; rare.y = 430; rare.tx = 700; rare.ty = 430; rare.moving = false; rare.resting = false; rare.wanderT = 999;
  sb.Math.random = () => 0.99; CFG.spotVisitChance = 0; CFG.motDashOn = false; CFG.motRareRate = 1;
  Game._motClock = 0; plain._rareBk = undefined; plain.wanderT = 0;
  Game.moveLizards(0.1);
  ok("V5M⑮: 無印がレアの傍を目的地に(±58px帯)", Math.abs(plain.tx - rare.x) <= 59 && Math.abs(plain.ty - (rare.y + 14)) < 1, `tx=${plain.tx} ty=${plain.ty}`);
  rare.wanderT = 999; rare._rareBk = undefined; rare.moving = false; rare.wanderT = 0; rare.tx = rare.x; rare.ty = rare.y;
  Game.moveLizards(0.1);
  ok("V5M⑮: 特性持ち自身は寄らない(徘徊のまま)", rare._rareBk === undefined);
  // ⑰ 環境反応: 惑星ゲート・整数オフセット・決定論・reduced停止
  CFG.motEnvOn = true;
  Game.state.stageSel = 8; // 寒冷
  let sawShiver = false, intOk = true;
  for (let id = 0; id < 30 && !sawShiver; id++) {
    for (let tq = 0; tq < 2000 && !sawShiver; tq++) {
      Render.time = tq * 0.05;
      const e = Render._motEnv({ id, injuredT: 0 });
      if (e) { sawShiver = true; if (e.dx !== Math.round(e.dx) || e.dy !== 0) intOk = false; }
    }
  }
  ok("V5M⑰: 寒冷惑星で震え発生(dx整数・dy0)", sawShiver && intOk);
  Game.state.stageSel = 5; // 高熱
  let sawLift = false;
  for (let id = 0; id < 30 && !sawLift; id++) {
    for (let tq = 0; tq < 2000 && !sawLift; tq++) {
      Render.time = tq * 0.05;
      const e = Render._motEnv({ id, injuredT: 0 });
      if (e) { sawLift = true; if (e.dy > 0 || e.dx !== 0) intOk = false; }
    }
  }
  ok("V5M⑰: 高熱惑星で頭上げ発生(dy<=0・dx0)", sawLift && intOk);
  Game.state.stageSel = 1;
  ok("V5M⑰: 対象外惑星ではnull", (() => { for (let tq = 0; tq < 500; tq++) { Render.time = tq * 0.1; if (Render._motEnv({ id: 5, injuredT: 0 })) return false; } return true; })());
  Render.time = 4.4; Game.state.stageSel = 8;
  ok("V5M⑰: 決定論(同入力→同出力)", JSON.stringify(Render._motEnv({ id: 5, injuredT: 0 })) === JSON.stringify(Render._motEnv({ id: 5, injuredT: 0 })));
}

// ===== V5M 第3バッチ(2026-07-25): ⑬ベビー追従/⑤脱皮の気配/⑩砂掘り(⑱=スキップ) =====
{
  Game.newGame(); Game.state.rank = 5; Game.raid = null;
  const baby = { id: 701, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "baby", xp: 0, level: 1, injuredT: 0, breedCd: 0, traits: [] };
  const ad = { id: 702, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.state.lizards = [baby, ad];
  Game.ensureRuntime(baby); Game.ensureRuntime(ad);
  baby.x = 500; baby.y = 400; baby.tx = 500; baby.ty = 400; baby.resting = false;
  ad.x = 640; ad.y = 430; ad.tx = 700; ad.ty = 430; ad.angle = 0; ad.wanderT = 999; ad.resting = false; ad.moving = true;
  sb.Math.random = () => 0.99; CFG.spotVisitChance = 0; CFG.motDashOn = false; CFG.motRareOn = false; CFG.motShedOn = false; CFG.motDigOn = false;
  CFG.motFollowOn = true; CFG.motFollowRate = 1;
  Game._motClock = 0; baby._folBk = undefined; baby.wanderT = 0;
  Game.moveLizards(0.1);
  ok("V5M⑬: ベビーが追従開始(対象の後方が目的地)", baby._folT > 0 && baby._folId === ad.id && baby.tx < ad.x, `folT=${baby._folT} tx=${baby.tx}`);
  ad.returning = true; Game.moveLizards(0.1);
  ok("V5M⑬: 対象が帰巣したら解除", baby._folT === 0);
  ad.returning = false;
  // ⑤ 脱皮: 岩へ寄る→到着で擦り開始→_poseBobが整数dxを返す
  CFG.motShedOn = true; CFG.motShedRate = 1; CFG.motFollowOn = false;
  Render._stageBoulders = [{ x: 700, y: 420, r: 22 }];
  const sz = ad;
  sz.x = 600; sz.y = 420; sz.tx = 600; sz.ty = 420; sz.moving = false; sz._shedBk = undefined; sz.wanderT = 0;
  Game.moveLizards(0.1);
  ok("V5M⑤: 岩の際を目的地に(±r+12)", Math.abs(Math.abs(sz.tx - 700) - 34) < 1 && sz._shedGo === true, `tx=${sz.tx}`);
  let g3 = 0; while (sz.moving !== false || sz._shedGo) { Game.moveLizards(0.1); if (++g3 > 400) break; }
  ok("V5M⑤: 到着で擦り開始(_shedT>0)", sz._shedT > 0, "shedT=" + sz._shedT);
  Render.time = 2.2;
  const rub = Render._poseBob(sz);
  ok("V5M⑤: 擦り=整数dx・dy0", rub && Number.isInteger(rub.dx) && rub.dy === 0, JSON.stringify(rub));
  // ⑩ 砂掘り: 乾燥惑星のみ・その場で静止して掻く
  CFG.motShedOn = false; CFG.motDigOn = true; CFG.motDigRate = 1;
  Game.state.stageSel = 3; // 非対象惑星
  sz._digBk = undefined; sz._shedT = 0; sz.wanderT = 0; sz.tx = sz.x; sz.ty = sz.y;
  Game.moveLizards(0.1);
  ok("V5M⑩: 非対象惑星では掘らない", (sz._digT || 0) <= 0);
  Game.state.stageSel = 1;
  sz._digBk = undefined; sz.wanderT = 0;
  Game.moveLizards(0.1);
  ok("V5M⑩: 乾燥惑星で掘り発火(その場静止)", sz._digT > 0 && sz.tx === sz.x && sz.ty === sz.y, "digT=" + sz._digT);
  // 帰巣で仕草中断
  sz._shedT = 3; sz._digT = 2; sz._folT = 1; sz.returning = true;
  Game.moveLizards(0.1);
  ok("V5M第3: 帰巣で仕草クリア", sz._shedT === 0 && sz._digT === 0 && sz._folT === 0);
  sz.returning = false;
  // settleDisplayで残状態クリア
  sz._shedT = 3; sz._digT = 2; sz._folT = 1; sz._shedGo = true;
  Game.settleDisplay();
  ok("V5M第3: settleDisplayでクリア", sz._shedT === 0 && sz._digT === 0 && sz._folT === 0 && sz._shedGo === false);
}

// ===== V5M 第4バッチ(2026-07-25): ⑥日光浴フラット化(C=形状変形の初適用・特則=bask中のw/y変調のみ) =====
{
  CFG.motFlatOn = true;
  const baskLz = (extra) => Object.assign({ id: 9, spot: "heat-bask", moving: false, _spotPosture: "bask" }, extra || {});
  ok("V5M⑥: 移動中はK=0", Render._motFlatK(baskLz({ moving: true })) === 0);
  ok("V5M⑥: 非baskはK=0(形状変形はbaskに厳しく限定)", Render._motFlatK(baskLz({ _spotPosture: "drink" })) === 0);
  ok("V5M⑥: 非スポットはK=0", Render._motFlatK({ id: 9, spot: null, moving: false, _spotPosture: "bask" }) === 0);
  sb.Motion.reduced = true;
  ok("V5M⑥: reduced-motionはK=0", Render._motFlatK(baskLz()) === 0);
  sb.Motion.reduced = false;
  CFG.motFlatOn = false;
  ok("V5M⑥: OFFはK=0(乗算恒等=ピクセル完全一致)", Render._motFlatK(baskLz()) === 0);
  CFG.motFlatOn = true;
  let sawFlat = false, rangeOk = true;
  for (let id = 0; id < 30 && !sawFlat; id++) {
    for (let tq = 0; tq < 800; tq++) {
      Render.time = tq * 0.1;
      const k = Render._motFlatK(baskLz({ id }));
      if (k < 0 || k > 1) rangeOk = false;
      if (k > 0.9) { sawFlat = true; break; }
    }
  }
  ok("V5M⑥: bask中に実際に伏せる(K→1)・範囲[0,1]", sawFlat && rangeOk);
  Render.time = 7.7;
  ok("V5M⑥: 決定論(同入力→同出力)", Render._motFlatK(baskLz({ id: 3 })) === Render._motFlatK(baskLz({ id: 3 })));
}

console.log(`\n=== モーション 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(C1割当:決定論/capacity比例/状態非干渉/null・C2配線:到達/ワープなし/解除/数値非干渉・C3姿勢:整数bob/null条件/決定論・V5M第1バッチ:⑦連続/⑧2反転/⑫対面/①K範囲/reduced停止/数値非干渉/クリア)");
