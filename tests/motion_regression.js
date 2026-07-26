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
    // M2-EX パートC: 多段化で水飲み(頭下げ深め)/見上げ(個体別浮き)は意図的に深くなる=上限を poseBobPx*1.7+1 へ更新。
    if (b && (Math.abs(b.dx) > amp + 1 || Math.abs(b.dy) > amp * 1.7 + 1)) allRange = false;
    if (b && p === "wade" && b.dx !== 0) wadeDx = true;
    if (b && p === "drink" && b.dy !== 0) drinkDy = true;
  }
}
ok("C3: 全posture整数bob", allInt);
ok("C3: 振幅内(多段化=<=poseBobPx*1.7±1)", allRange);
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

// ===== V5M-EX パートB(2026-07-26): ③まばたき/⑨伸び(C)/⑪首かしげ/⑭勝利の集い/⑯目線/⑲波紋 =====
{
  // ③ まばたき: OFF/移動/reduced→false・時々true・決定論
  CFG.motBlinkOn = true; CFG.motBlinkWin = 9; CFG.motBlinkDur = 0.12;
  let blinked = false;
  for (let tq = 0; tq < 2000 && !blinked; tq++) { Render.time = tq * 0.02; if (Render._motBlinkClosed({ id: 3, moving: false })) blinked = true; }
  ok("V5M-EX③: まばたきが発生する", blinked);
  ok("V5M-EX③: 移動中は閉じない", Render._motBlinkClosed({ id: 3, moving: true }) === false);
  CFG.motBlinkOn = false;
  ok("V5M-EX③: OFFで常にfalse(従来ピクセル一致)", Render._motBlinkClosed({ id: 3, moving: false }) === false);
  CFG.motBlinkOn = true;
  sb.Motion.reduced = true;
  ok("V5M-EX③: reduced-motionで閉じない", Render._motBlinkClosed({ id: 3, moving: false }) === false);
  sb.Motion.reduced = false;
  // ⑪ 首かしげ: OFF/移動/reduced→0・|角|<=deg・時々非0・決定論
  CFG.motTiltOn = true;
  let tilted = false, tiltRangeOk = true;
  const maxRad = (CFG.motTiltDeg || 4) * Math.PI / 180 + 1e-9;
  for (let id = 0; id < 20 && !tilted; id++) {
    for (let tq = 0; tq < 1000; tq++) {
      Render.time = tq * 0.05;
      const a = Render._motTilt({ id, moving: false, injuredT: 0, angle: 0 });
      if (Math.abs(a) > maxRad) tiltRangeOk = false;
      if (Math.abs(a) > 0.01) tilted = true;
    }
  }
  ok("V5M-EX⑪: 傾きが発生・範囲|deg|以内", tilted && tiltRangeOk);
  ok("V5M-EX⑪: 移動中は0", Render._motTilt({ id: 3, moving: true, injuredT: 0, angle: 0 }) === 0);
  CFG.motTiltOn = false;
  ok("V5M-EX⑪: OFFで0(回転なし=従来配置)", Render._motTilt({ id: 3, moving: false, injuredT: 0, angle: 0 }) === 0);
  CFG.motTiltOn = true;
  Render.time = 5.1;
  ok("V5M-EX⑪: 決定論", Render._motTilt({ id: 5, moving: false, injuredT: 0, angle: 0 }) === Render._motTilt({ id: 5, moving: false, injuredT: 0, angle: 0 }));
  // ⑨ 伸び(C): OFF/移動/スポット→0・時々>0.9・範囲[0,1]・決定論
  CFG.motStretchOn = true;
  let stretched = false, sRange = true;
  for (let id = 0; id < 30 && !stretched; id++) {
    for (let tq = 0; tq < 1200; tq++) {
      Render.time = tq * 0.05;
      const k = Render._motStretchK({ id, moving: false, spot: null, injuredT: 0 });
      if (k < 0 || k > 1) sRange = false;
      if (k > 0.9) stretched = true;
    }
  }
  ok("V5M-EX⑨: 伸びが発生・範囲[0,1]", stretched && sRange);
  ok("V5M-EX⑨: スポット中は0(⑥と排他)", Render._motStretchK({ id: 3, moving: false, spot: "heat-bask", injuredT: 0 }) === 0);
  CFG.motStretchOn = false;
  ok("V5M-EX⑨: OFFで0(加算恒等=ピクセル一致)", Render._motStretchK({ id: 3, moving: false, spot: null, injuredT: 0 }) === 0);
  CFG.motStretchOn = true;
  // ⑭ 勝利の集い: 近くのアダルトがtx/ty/wanderTを得る・上限・遠方は不変
  Game.newGame(); Game.state.rank = 5; Game.raid = null;
  const gx = 700, gy = 450;
  const near = [], far = [];
  for (let i = 0; i < 6; i++) {
    const l = { id: 800 + i, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
    Game.ensureRuntime(l); l.x = gx + (i - 2) * 30; l.y = gy + 10; l.resting = false; l.tx = l.x; l.ty = l.y; near.push(l);
  }
  const farL = { id: 900, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.ensureRuntime(farL); farL.x = 100; farL.y = 100; farL.tx = 100; farL.ty = 100; farL.resting = false; far.push(farL);
  Game.state.lizards = [...near, farL];
  CFG.motGatherMax = 4;
  Game.motVictoryGather(gx, gy);
  const gathered = near.filter((l) => l.wanderT === (CFG.motGatherSec || 4)).length;
  ok("V5M-EX⑭: 近傍アダルトが集う(上限motGatherMax)", gathered === 4, "gathered=" + gathered);
  ok("V5M-EX⑭: 遠方個体は不変", farL.wanderT === undefined || farL.tx === 100);
  // ⑯ 目線: UI._bossRewardOpen中は下中央へ向く
  sb.UI = { _bossRewardOpen: true };
  const gz = { id: 950, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.ensureRuntime(gz); gz.x = 700; gz.y = 300; gz.tx = 700; gz.ty = 300; gz.moving = false; gz.spot = null; gz.angle = Math.PI; gz.wanderT = 999; gz.resting = false;
  Game.state.lizards = [gz];
  Game.moveLizards(0.05);
  ok("V5M-EX⑯: 報酬盤中は下向き(sin(angle)>0=下)", Math.sin(gz.angle) > 0, "ang=" + gz.angle.toFixed(2));
  sb.UI = np();
  // ⑲ 波紋: 飲む隣人を一瞥
  CFG.motRippleRate = 1; CFG.motGazeOn = false;
  const watcher = { id: 960, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  const drinker = { id: 961, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.ensureRuntime(watcher); Game.ensureRuntime(drinker);
  watcher.x = 600; watcher.y = 400; watcher.tx = 600; watcher.ty = 400; watcher.moving = false; watcher.spot = null; watcher.angle = Math.PI; watcher.wanderT = 999; watcher.resting = false; watcher._rippleBk = undefined;
  drinker.x = 660; drinker.y = 410; drinker.spot = "water-drink"; drinker._spotPosture = "drink"; drinker.moving = false; drinker.wanderT = 999; drinker.resting = false;
  Game.state.lizards = [watcher, drinker];
  Game._motClock = 30;
  Game.moveLizards(0.05);
  ok("V5M-EX⑲: 飲む隣人の方を向く(cos(angle)>0=右の隣人)", Math.cos(watcher.angle) > 0, "ang=" + watcher.angle.toFixed(2));
  CFG.motGazeOn = true;
}

// ===== V5M-EX パートC(2026-07-26): 既存行動の多段化(水飲み/巣出入り) =====
{
  // C1 水飲み多段: drink位相で「頭下げ(下)」と「見上げ(上)」の両方が出る
  Game._motClock = 0;
  const dl = { id: 5, spot: "water-drink", moving: false, _spotPosture: "drink", _spotT: 0 };
  let sawDown = false, sawUp = false;
  for (let tq = 0; tq < 200; tq++) {
    Render.time = tq * 0.05; Game._motClock = tq * 0.05;
    const b = Render._poseBob(dl);
    if (b && b.dy > 0) sawDown = true;
    if (b && b.dy < 0) sawUp = true;
  }
  ok("V5M-EX C1: 水飲みが頭下げ(下)と見上げ(上)の両段を持つ", sawDown && sawUp);
  // C3 出巣の見回し: emergeFromNestが⑧lookを付ける(非ボス・決定論)
  Game.newGame(); Game.raid = null; Game._motClock = 0;
  CFG.motEmergeLookRate = 1;
  const em = { id: 970, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: true };
  Game.ensureRuntime(em); em.homeX = 700; em.homeY = 400;
  Game.emergeFromNest(em);
  ok("V5M-EX C3: 出巣直後に見回し(lookT>0・入口で一旦停止)", em._lookT > 0 && em.tx === em.x && em.ty === em.y);
  // ボス湧出時は見回し省略(急ぐ)
  Game.raid = { snake: { x: 0, y: 0, arrived: false }, type: {}, typeId: "snake", webs: [] };
  const em2 = { id: 971, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: true };
  Game.ensureRuntime(em2); em2.homeX = 700; em2.homeY = 400;
  Game.emergeFromNest(em2);
  ok("V5M-EX C3: ボス湧出時は見回し省略(ねぐらへ直行)", !(em2._lookT > 0) && em2.tx === em2.homeX);
  Game.raid = null;
  // C3 入巣前の振り返り: 通常帰巣で入口手前に来ると_peekTが立つ
  CFG.motPeekRate = 1; CFG.motPeekBand = 40;
  const pk = { id: 972, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: false };
  Game.ensureRuntime(pk);
  Game.state.lizards = [pk];
  Game.retreatToNest(pk);
  ok("V5M-EX C3: retreatで振り返りフラグ初期化", pk._peekedTrip === false);
  // 入口手前に配置してmoveLizards→_peekT>0を確認
  const nn = Game.nestEntryFor(pk);
  pk.x = nn.x + 30; pk.y = nn.y + 10; Game._motClock = 0;
  Game.moveLizards(0.05); // 帯内で_peekT立つ(この時点でcontinue)
  Game.moveLizards(0.05); // 次フレームで停止して外を向く
  ok("V5M-EX C3: 入口手前で一瞬振り返る(_peekT>0・その間停止)", pk._peekT > 0 && pk.moving === false);
  // settleDisplayでパートC残状態クリア
  pk._peekT = 1; pk._spotT = 5;
  Game.settleDisplay();
  ok("V5M-EX C3: settleDisplayでpeek/spotTクリア", pk._peekT === 0 && pk._spotT === null);
}

// ===== V5M-EX パートD 第2波(2026-07-26): D1あくび/D2頭bob/D3尾フリック/D4群れ警戒/D5向き替え/D6まどろみ/D8味見 =====
{
  const idle = (id) => ({ id, moving: false, spot: null, injuredT: 0, angle: 0 });
  // D1 あくび: 0..1・OFF/移動→0・時々>0.5・決定論
  CFG.motYawnOn = true; let yawned = false, yr = true;
  for (let id = 0; id < 30 && !yawned; id++) for (let tq = 0; tq < 1300; tq++) { Render.time = tq * 0.05; const y = Render._motYawn({ id, moving: false }); if (y < 0 || y > 1) yr = false; if (y > 0.5) { yawned = true; break; } }
  ok("V5M-EX D1: あくびが発生・範囲[0,1]", yawned && yr);
  ok("V5M-EX D1: 移動中は0", Render._motYawn({ id: 3, moving: true }) === 0);
  CFG.motYawnOn = false; ok("V5M-EX D1: OFFで0(口閉じ=従来一致)", Render._motYawn({ id: 3, moving: false }) === 0); CFG.motYawnOn = true;
  // D2 頭bob: 整数dy・非スポット静止のみ・時々非null
  CFG.motHeadbobOn = true; let bobbed = false, bInt = true;
  for (let id = 0; id < 30 && !bobbed; id++) for (let tq = 0; tq < 1000; tq++) { Render.time = tq * 0.05; const b = Render._motHeadbob(idle(id)); if (b) { bobbed = true; if (!Number.isInteger(b.dy)) bInt = false; break; } }
  ok("V5M-EX D2: 頭プッシュアップ発生・整数dy", bobbed && bInt);
  ok("V5M-EX D2: スポット中はnull", Render._motHeadbob({ id: 3, moving: false, spot: "heat-bask", injuredT: 0 }) === null);
  CFG.motHeadbobOn = false; ok("V5M-EX D2: OFFでnull", Render._motHeadbob(idle(3)) === null); CFG.motHeadbobOn = true;
  // D3 尾フリック: _motTailKが時々 motTailFlickAmp 近くまで跳ねる
  CFG.motTailFlickOn = true; let flicked = false;
  for (let id = 0; id < 30 && !flicked; id++) for (let tq = 0; tq < 800; tq++) { Render.time = tq * 0.05; if (Render._motTailK({ id, moving: false, injuredT: 0 }) > (CFG.motTailAmp || 2.2) + 1) { flicked = true; break; } }
  ok("V5M-EX D3: 尾フリック(ゆらぎ振幅を超える鋭い一振り)", flicked);
  CFG.motTailFlickOn = false; ok("V5M-EX D3: OFFでフリックなし(ゆらぎ上限内)", (() => { for (let tq = 0; tq < 400; tq++) { Render.time = tq * 0.05; if (Render._motTailK({ id: 7, moving: false, injuredT: 0 }) > (CFG.motTailAmp || 2.2) + 0.01) return false; } return true; })()); CFG.motTailFlickOn = true;
  // D6 まどろみ: bool・OFF→false・時々true
  CFG.motDrowsyOn = true; let drowsy = false;
  for (let id = 0; id < 30 && !drowsy; id++) for (let tq = 0; tq < 1000; tq++) { Render.time = tq * 0.05; if (Render._motDrowsy({ id, moving: false })) { drowsy = true; break; } }
  ok("V5M-EX D6: まどろみ(半閉じ)発生", drowsy);
  CFG.motDrowsyOn = false; ok("V5M-EX D6: OFFでfalse", Render._motDrowsy({ id: 3, moving: false }) === false); CFG.motDrowsyOn = true;
  // D4 群れ警戒: 近くのダッシュ個体に反応して向く+警戒タイマー
  sb.UI = { _bossRewardOpen: false }; // 目線分岐(⑯)を無効化して群れ/向き替えを単離
  Game.newGame(); Game.raid = null; Game._motClock = 0;
  CFG.motDashOn = false; CFG.motRippleOn = false; CFG.motTurnOn = false; CFG.motHerdOn = true; CFG.spotVisitChance = 0;
  const watcher2 = { id: 980, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  const dasher = { id: 981, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.ensureRuntime(watcher2); Game.ensureRuntime(dasher);
  watcher2.x = 600; watcher2.y = 400; watcher2.tx = 600; watcher2.ty = 400; watcher2.moving = false; watcher2.spot = null; watcher2.angle = Math.PI; watcher2.wanderT = 999; watcher2.resting = false;
  dasher.x = 680; dasher.y = 420; dasher._dashT = 1.5; dasher.moving = true; dasher.wanderT = 999; dasher.resting = false;
  Game.state.lizards = [watcher2, dasher];
  Game.moveLizards(0.05);
  ok("V5M-EX D4: 近くのダッシュに向く+警戒(cos>0=右のdasher, alertT>0)", Math.cos(watcher2.angle) > 0 && watcher2._alertT > 0);
  // D5 向き替え: 単発反転(決定論)
  Game.newGame(); CFG.motHerdOn = false; CFG.motTurnOn = true; CFG.motTurnRate = 1; Game._motClock = 0;
  const tn = { id: 990, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [] };
  Game.ensureRuntime(tn); tn.x = 500; tn.y = 400; tn.tx = 500; tn.ty = 400; tn.moving = false; tn.spot = null; tn.angle = 0; tn.wanderT = 999; tn.resting = false; tn._turnBk = undefined;
  Game.state.lizards = [tn];
  Game.moveLizards(0.05);
  ok("V5M-EX D5: 向き替え=単発反転(angle→π)", Math.abs(Math.cos(tn.angle) - (-1)) < 1e-9);
  CFG.motDashOn = true; CFG.motRippleOn = true; sb.UI = np();
}

// ===== V5M-EX2 パートE(2026-07-26): E1片足上げ(C)/E2真のあくび顎開口/E3脱皮後ぶるっと(C) =====
{
  // E1 片足上げ: 0..1・OFF/移動/掘り中→0・時々>0.9・熱い惑星で発生率up・決定論
  CFG.motFootLiftOn = true; Game.state.stageSel = 5; // 火山=熱い
  let lifted = false, flRange = true;
  for (let id = 0; id < 30 && !lifted; id++) for (let tq = 0; tq < 1200; tq++) { Render.time = tq * 0.05; const k = Render._motFootLift({ id, moving: false, _digT: 0, injuredT: 0, _spotPosture: null }); if (k < 0 || k > 1) flRange = false; if (k > 0.9) { lifted = true; break; } }
  ok("V5M-EX2 E1: 片足上げ発生・範囲[0,1]", lifted && flRange);
  ok("V5M-EX2 E1: 移動中は0", Render._motFootLift({ id: 3, moving: true, _digT: 0, injuredT: 0 }) === 0);
  ok("V5M-EX2 E1: 掘り中は0", Render._motFootLift({ id: 3, moving: false, _digT: 2, injuredT: 0 }) === 0);
  CFG.motFootLiftOn = false; ok("V5M-EX2 E1: OFFで0(減算恒等=ピクセル一致)", Render._motFootLift({ id: 3, moving: false, _digT: 0, injuredT: 0 }) === 0); CFG.motFootLiftOn = true;
  Game.state.stageSel = 1;
  // E3 ぶるっと: _shakeTが立っている間だけ>0・OFF/移動→0・decayで0.. 1
  CFG.motShakeOn = true;
  ok("V5M-EX2 E3: shakeT無しは0(恒等)", Render._motShakeK({ id: 3, moving: false, _shakeT: 0 }) === 0);
  const shk = Render._motShakeK({ id: 3, moving: false, _shakeT: (CFG.motShakeDur || 0.6) });
  ok("V5M-EX2 E3: shakeT有りで>0・範囲[0,1]", shk > 0 && shk <= 1);
  ok("V5M-EX2 E3: 移動中は0", Render._motShakeK({ id: 3, moving: true, _shakeT: 0.5 }) === 0);
  CFG.motShakeOn = false; ok("V5M-EX2 E3: OFFで0", Render._motShakeK({ id: 3, moving: false, _shakeT: 0.5 }) === 0); CFG.motShakeOn = true;
  // E3 発火配線: 脱皮終了の瞬間に_shakeTが立つ(ゲーム層)
  Game.newGame(); Game.raid = null;
  const sh = { id: 995, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: false };
  Game.ensureRuntime(sh); Game.state.lizards = [sh];
  sh.x = 600; sh.y = 400; sh.tx = 600; sh.ty = 400; sh._shedT = 0.05; sh.wanderT = 999;
  Game.moveLizards(0.1); // shedT 0.05→<=0 で shakeT が立つ
  ok("V5M-EX2 E3: 脱皮終了の瞬間にぶるっと発火(_shakeT>0)", sh._shakeT > 0, "shakeT=" + sh._shakeT);
  // E2 あくび: 既存_motYawnが駆動(角度はrender)。0..1・決定論(D1と同一タイミング=二重発火なし)
  let yy = false;
  for (let id = 0; id < 30 && !yy; id++) for (let tq = 0; tq < 1300; tq++) { Render.time = tq * 0.05; if (Render._motYawn({ id, moving: false }) > 0.5) { yy = true; break; } }
  ok("V5M-EX2 E2: あくび(顎開口)タイミング発生", yy);
  // settleDisplayで_shakeTクリア
  sh._shakeT = 1; Game.settleDisplay();
  ok("V5M-EX2 E3: settleDisplayで_shakeTクリア", sh._shakeT === 0);
}

// ===== V5M-EX2 パートF(2026-07-26): 巣口すり抜け(相互回避の一時無効化) =====
{
  Game.newGame(); Game.state.rank = 20; Game.raid = null;
  const mkl = (id, x, y) => { const l = { id, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: false }; Game.ensureRuntime(l); l.x = x; l.y = y; l.tx = x; l.ty = y; l.wanderT = 999; return l; };
  // 平時: 重なる2匹は押し合って離れる(すり抜けは巣出入り個体限定=平時の散らばりは不変)
  CFG.nestPassthroughOn = true;
  const w1 = mkl(1001, 600, 400), w2 = mkl(1002, 610, 400);
  Game.state.lizards = [w1, w2];
  Game.moveLizards(0.1);
  ok("V5M-EX2 F: 平時の徘徊個体は従来どおり押し合って離れる", Math.abs(w1.x - w2.x) > 10);
  // 帰巣中(returning)の2匹はすり抜ける=押し合わない(重なりを許容)
  const r1 = mkl(1003, 600, 400), r2 = mkl(1004, 604, 400);
  r1.returning = true; r2.returning = true; r1.moving = true; r2.moving = true;
  // 巣が遠い位置なら帰巣移動はするが、重なり判定(分離)はスキップされる→接近が維持される
  Game.state.lizards = [r1, r2];
  const before = Math.abs(r1.x - r2.x);
  // 分離ループのみ検証するため、帰巣移動を無効化(returning処理をスキップさせずに分離だけ見る=位置固定でmoveの分離段だけ効くよう近接配置)
  r1.tx = r1.x; r1.ty = r1.y; r2.tx = r2.x; r2.ty = r2.y;
  Game.moveLizards(0.1);
  ok("V5M-EX2 F: 帰巣中の個体は相互回避せず重なりを許容(すり抜け)", Math.abs(r1.x - r2.x) <= before + 0.5);
  // OFFにすると帰巣個体も従来どおり押し合う
  CFG.nestPassthroughOn = false;
  const q1 = mkl(1005, 600, 400), q2 = mkl(1006, 604, 400);
  q1.returning = true; q2.returning = true; q1.tx = 600; q1.ty = 400; q2.tx = 604; q2.ty = 400;
  Game.state.lizards = [q1, q2];
  Game.moveLizards(0.1);
  ok("V5M-EX2 F: OFFなら帰巣個体も従来の押し合い(退役可能=可逆)", Math.abs(q1.x - q2.x) > 8);
  CFG.nestPassthroughOn = true;
  // 出巣直後のすり抜け窓
  Game.raid = null;
  const em = { id: 1007, speciesId: "kanahebi", morphId: "normal", hue: 40, sat: 40, light: 55, pattern: "none", stage: "adult", xp: 0, level: 5, injuredT: 0, breedCd: 0, traits: [], resting: true };
  Game.ensureRuntime(em); em.homeX = 700; em.homeY = 400;
  CFG.motEmergeLookRate = 0; // 見回しは切る(すり抜け窓だけ検査)
  Game.emergeFromNest(em);
  ok("V5M-EX2 F: 出巣直後はすり抜け窓が立つ(_emergeThruT>0)", em._emergeThruT > 0);
}

// ===== V5M-EX3 パートH/I(2026-07-26): 設備tier連動の遊び + 水場の足跡波紋 =====
{
  Render.time = 2.0;
  const spotLz = (posture, tier, extra) => Object.assign({ id: 9, spot: "x", moving: false, _spotPosture: posture, _spotTier: tier, _spotT: 0 }, extra || {});
  // H 水遊び: wade+tier<閾では基本挙動・tier>=閾で遊び(振幅が拡大=沈む変種でdy深い)
  CFG.motWaterPlayOn = true; CFG.motWaterPlayTier = 4;
  Game._motClock = 0;
  let deepSeen = false;
  for (let tq = 0; tq < 400; tq++) { Render.time = tq * 0.05; Game._motClock = tq * 0.05; const b = Render._poseBob(spotLz("wade", 4)); if (b && b.dy > (CFG.poseBobPx || 3) * 1.3) { deepSeen = true; break; } }
  ok("V5M-EX3 H: 大湖tierで水遊び(深く沈む変種=基本waveより大きいdy)", deepSeen);
  const lowTier = Render._poseBob(spotLz("wade", 1));
  ok("V5M-EX3 H: 低tierでは水遊び非解禁(基本wadeのまま=浅い)", lowTier && Math.abs(lowTier.dy) <= (CFG.poseBobPx || 3) + 1);
  CFG.motWaterPlayOn = false;
  ok("V5M-EX3 H: OFFで水遊びなし", (() => { for (let tq = 0; tq < 200; tq++) { Render.time = tq * 0.05; Game._motClock = tq * 0.05; const b = Render._poseBob(spotLz("wade", 4)); if (b && Math.abs(b.dy) > (CFG.poseBobPx || 3) + 1) return false; } return true; })());
  CFG.motWaterPlayOn = true;
  // H UFO浮遊: bask+ビームtierで上へ浮く(dy負が深い)
  CFG.motBeamFloatOn = true; CFG.motBeamFloatTier = 3;
  let floatSeen = false;
  for (let id = 0; id < 20 && !floatSeen; id++) for (let tq = 0; tq < 400; tq++) { Render.time = tq * 0.05; Game._motClock = tq * 0.05; const b = Render._poseBob(spotLz("bask", 4, { id })); if (b && b.dy < -(CFG.poseBobPx || 3) * 0.9) { floatSeen = true; break; } }
  ok("V5M-EX3 H: ビームtierで浮遊(上へ・A方式translate)", floatSeen);
  ok("V5M-EX3 H: 低tier保温では浮遊なし(基本bask)", (() => { for (let tq = 0; tq < 200; tq++) { Render.time = tq * 0.05; Game._motClock = tq * 0.05; const b = Render._poseBob(spotLz("bask", 1)); if (b && b.dy < -(CFG.poseBobPx || 3) * 0.9) return false; } return true; })());
  // H 観測スキャン: lookout+tier>=閾で横首振り(dx出る)
  CFG.motObsScanOn = true; CFG.motObsScanTier = 3;
  let scanDx = false;
  for (let tq = 0; tq < 200; tq++) { Render.time = tq * 0.05; const b = Render._poseBob(spotLz("lookout", 3)); if (b && Math.abs(b.dx) > 0) { scanDx = true; break; } }
  ok("V5M-EX3 H: 観測施設群tierで空見渡し(横dx)", scanDx);
  ok("V5M-EX3 H: 低tier展望台では首振りなし(dx=0)", (() => { for (let tq = 0; tq < 100; tq++) { Render.time = tq * 0.05; const b = Render._poseBob(spotLz("lookout", 1)); if (b && Math.abs(b.dx) > 0) return false; } return true; })());
  // H 全posture整数bob維持(tier遊び込み)
  let intOk2 = true;
  for (const [pp, tt] of [["wade", 4], ["bask", 4], ["lookout", 3]]) for (let tq = 0; tq < 100; tq++) { Render.time = tq * 0.05; Game._motClock = tq * 0.05; const b = Render._poseBob(spotLz(pp, tt)); if (b && (!Number.isInteger(b.dx) || !Number.isInteger(b.dy))) intOk2 = false; }
  ok("V5M-EX3 H: 遊びモーションも整数bob(魂ピクセル不変)", intOk2);
  // I 水場判定: 水場tier0では常にfalse・建設後は楕円内でtrue
  Game.newGame();
  Game.state.facilities = { water: 0 };
  ok("V5M-EX3 I: 水場未建設は_nearWater=false", Render._nearWater({ x: 230, y: 610 }) === false);
  Game.state.facilities = { water: 20 };
  ok("V5M-EX3 I: 水場中心は_nearWater=true", Render._nearWater({ x: 230, y: 610 }) === true);
  ok("V5M-EX3 I: 遠方は_nearWater=false", Render._nearWater({ x: 1000, y: 200 }) === false);
}

// ===== reduced-motionガードの静的検査(2026-07-26・本番実証で発覚した潜在バグの再発防止) =====
//   `const Motion` はclassic scriptで window に載らない→ `window.Motion && Motion.reduced` はブラウザで常にfalse
//   =reduced-motionが効かない。正しい形は `typeof Motion !== "undefined" && Motion.reduced`。
{
  const rsrc = fs.readFileSync(path.join(ROOT, "js/render.js"), "utf8");
  const gsrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const bad = (rsrc.match(/window\.Motion\s*&&\s*Motion\.reduced/g) || []).length + (gsrc.match(/window\.Motion\s*&&\s*Motion\.reduced/g) || []).length;
  ok("reduced-motionガードに壊れた形(window.Motion)が無い", bad === 0, bad + "箇所");
  const good = (rsrc.match(/typeof Motion !== "undefined" && Motion\.reduced/g) || []).length;
  ok("reduced-motionガードが正しい形(typeof Motion)で存在", good >= 20, good + "箇所");
}

console.log(`\n=== モーション 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(C1割当:決定論/capacity比例/状態非干渉/null・C2配線:到達/ワープなし/解除/数値非干渉・C3姿勢:整数bob/null条件/決定論・V5M第1バッチ:⑦連続/⑧2反転/⑫対面/①K範囲/reduced停止/数値非干渉/クリア)");
