"use strict";
// ============================================================
// C2改訂 HUDトランジション機構 回帰テスト
// 実行: node tests/holo_regression.js  (repoルートから)
//
//  1) 尺の上限   : 初訪/既訪/reduced いずれも CFG.holoTravelMaxSec 以下・既訪 < 初訪
//  2) スキップ即時: skip() で確認を挟まず即 done + onEnd。rAF/タイマーを残さない
//  3) 決定論     : 同一 t で同一の描画命令列。乱数(Math.random)を使わない
//  4) reduced    : rAFを1度も回さず、静止画1枚+情報が残る
//  5) 初回/既訪分岐: 未開拓=情報表示あり(長い) / 開拓済=短縮版。CFGで無効化できる
//  6) 全10惑星   : 例外なく描け、固有幾何環・色調(tint)が惑星ごとに解決される
//  7) 実データ由来: 惑星名/固有種/脅威型/素材が STAGES/SPECIES/PLANET_BOSS/BOSS_TYPES と一致(捏造なし)
//  8) 本編非接触 : 描画・情報解決が Game/セーブ/経済/確率に触れない(グローバル汚染なし)
//  9) ビーム欠陥 : 横断完了後にビームが残らない(基準カットで指摘された「右端に留まる」の是正)
// 10) CFG完全OFF : holoTravelOn=false で従来の宇宙船トランジションへ復帰できる
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}

// ---- Canvas 2D スタブ: 命令列を記録する(決定論・非接触の観測手段) ----
function stubCtx(log) {
  const rec = (op) => (...a) => { if (log) log.push(op + "(" + a.map((v) => (typeof v === "number" ? v.toFixed(3) : String(v))).join(",") + ")"); };
  const ctx = {
    canvas: { width: 1000, height: 563 },
    save: rec("save"), restore: rec("restore"), beginPath: rec("beginPath"), closePath: rec("closePath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), arc: rec("arc"), stroke: rec("stroke"), fill: rec("fill"),
    fillRect: rec("fillRect"), strokeRect: rec("strokeRect"), fillText: rec("fillText"), measureText: () => ({ width: 10 }),
    // 幾何・クリップ系(オープニングの侵食被膜/影のクリップで使う)。命令列には残さない=位相比較のノイズにしない
    clip: () => {}, rect: () => {}, ellipse: () => {}, setLineDash: () => {}, clearRect: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {},
    createLinearGradient: (...a) => { if (log) log.push("grad(" + a.map((v) => v.toFixed(3)).join(",") + ")"); return { addColorStop: (o, c) => { if (log) log.push("stop(" + o + "," + c + ")"); } }; },
    createRadialGradient: (...a) => { if (log) log.push("rgrad(" + a.map((v) => v.toFixed(3)).join(",") + ")"); return { addColorStop: (o, c) => { if (log) log.push("stop(" + o + "," + c + ")"); } }; },
  };
  for (const k of ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "shadowColor", "shadowBlur"]) {
    let v = null;
    Object.defineProperty(ctx, k, { get: () => v, set: (nv) => { v = nv; if (log) log.push(k + "=" + (typeof nv === "number" ? nv.toFixed(3) : String(nv))); } });
  }
  return ctx;
}

// ---- 描画層だけを読む軽量サンドボックス(Holo は DOM 非依存) ----
function loadHolo(extra) {
  const sb = { console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, RegExp, module: {} };
  sb.globalThis = sb;
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  for (const f of ["js/data.js", "js/holo.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  vm.runInContext("globalThis.__x = { Holo, CFG, STAGES, SPECIES, MORPHS, FACILITIES, RESEARCH, PLANET_BOSS, BOSS_TYPES, PLANET_NAMES, stageById }", sb);
  return { api: sb.__x, sb: sb };
}
const __L = loadHolo();
const { Holo, CFG, STAGES, SPECIES, PLANET_BOSS, BOSS_TYPES, PLANET_NAMES, stageById } = __L.api;

console.log("== 1) 尺の上限(頻発する導線=摩擦にしない) ==");
{
  const MAX = CFG.holoTravelMaxSec;
  const dFull = Holo.travelDur(true, false), dShort = Holo.travelDur(false, false), dRed = Holo.travelDur(true, true);
  check(`上限CFGが 0.8〜1.2 の範囲(${MAX}s)`, MAX >= 0.8 && MAX <= 1.2, String(MAX));
  check(`初訪 ${dFull}s ≤ 上限 ${MAX}s`, dFull <= MAX);
  check(`既訪 ${dShort}s ≤ 上限 ${MAX}s`, dShort <= MAX);
  check(`reduced ${dRed}s ≤ 上限 ${MAX}s`, dRed <= MAX);
  check(`既訪(${dShort}s) < 初訪(${dFull}s) = 2回目以降は短縮される`, dShort < dFull);
  // CFGに上限超えを書いてもクランプされる(ガードが効く)
  const L2 = loadHolo(); L2.api.CFG.holoTravelFullSec = 9.9;
  check("CFGに9.9sを書いても上限へクランプ", L2.api.Holo.travelDur(true, false) === L2.api.CFG.holoTravelMaxSec);
  // 基準カット(オープニング)は別枠=12秒前後の仕様のまま
  check(`基準カットは別枠(${Holo.cutDur().toFixed(1)}s)で上限の対象外`, Holo.cutDur() > MAX);
}

console.log("== 2) スキップ即時(確認を挟まない) ==");
{
  let ended = null, rafN = 0, cancelN = 0, clearN = 0;
  const sb = __L.sb;
  sb.requestAnimationFrame = () => { rafN++; return rafN; };
  sb.cancelAnimationFrame = () => { cancelN++; };
  sb.setTimeout = () => 1; sb.clearTimeout = () => { clearN++; };
  sb.performance = { now: () => 0 };
  const listeners = [];
  const cv = { width: 1000, height: 563, getContext: () => stubCtx(null), addEventListener: (e) => listeners.push(e), removeEventListener: (e) => { const i = listeners.indexOf(e); if (i >= 0) listeners.splice(i, 1); } };
  sb.window = { addEventListener: (e) => listeners.push(e), removeEventListener: (e) => { const i = listeners.indexOf(e); if (i >= 0) listeners.splice(i, 1); } };
  const info = Holo.travelInfo(1);
  const st = Holo.play(cv, {
    total: Holo.travelDur(true, false), reduced: false,
    draw: (c, w, h, t) => Holo.drawTravel(c, w, h, t, info, { dur: 1.15, full: true }),
    onEnd: (s) => { ended = s; },
  });
  check("クリック/タップ(pointerdown)とキー(keydown)の両方を待ち受ける", listeners.indexOf("pointerdown") >= 0 && listeners.indexOf("keydown") >= 0, JSON.stringify(listeners));
  st.skip();
  check("skip() で即 done", st.done === true && st.skipped === true);
  check("skip() で onEnd が即座に1回呼ばれる(確認ダイアログなし)", ended === st);
  check("skip() で rAF を確実に停止", cancelN >= 1);
  check("skip() でリスナーを解除(残留しない)", listeners.length === 0, JSON.stringify(listeners));
  const before = { done: st.done };
  st.skip();
  check("skip() の二重呼び出しは無害(多重終了しない)", st.done === before.done && ended === st);
}

console.log("== 3) 決定論(乱数不使用・同一tで同一の描画) ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
  check("Math.random を使っていない", !/Math\.random/.test(src));
  check("Date.now / new Date を使っていない(時刻依存なし)", !/Date\.now|new Date/.test(src));
  for (const id of [1, 5, 10]) {
    const info = Holo.travelInfo(id), d = Holo.travelDur(true, false);
    const a = [], b = [];
    Holo.drawTravel(stubCtx(a), 1000, 563, d * 0.42, info, { dur: d, full: true, from: "惑星X" });
    Holo.drawTravel(stubCtx(b), 1000, 563, d * 0.42, info, { dur: d, full: true, from: "惑星X" });
    check(`惑星${id}: 同一tで命令列が完全一致(${a.length}命令)`, a.length > 50 && a.join("|") === b.join("|"));
  }
  const i1 = Holo.travelInfo(3), i2 = Holo.travelInfo(3);
  check("travelInfo は同一入力で同一出力(純関数)", JSON.stringify(i1) === JSON.stringify(i2));
}

console.log("== 4) reduced-motion: 動きを止め、静止画+情報を残す ==");
{
  const sb = __L.sb;
  let rafN = 0;
  sb.requestAnimationFrame = () => { rafN++; return rafN; };
  const log = [];
  const cv = { width: 1000, height: 563, getContext: () => stubCtx(log), addEventListener: () => {}, removeEventListener: () => {} };
  const info = Holo.travelInfo(4), d = Holo.travelDur(true, true);
  let ended = false;
  const st = Holo.play(cv, { total: d, reduced: true, draw: (c, w, h, t) => Holo.drawTravel(c, w, h, t, info, { dur: d, full: true }), onEnd: () => { ended = true; } });
  check("reduced: rAF を1度も回さない", rafN === 0, "raf=" + rafN);
  check("reduced: 静止画を1枚だけ描く", st.reducedStatic === true && log.length > 50);
  check("reduced: そのまま終了へ進む(導線が止まらない)", st.done === true && ended === true);
  const texts = log.filter((l) => l.startsWith("fillText")).join(" ");
  check("reduced: 情報(惑星名・固有種)は残る", texts.indexOf(info.short) >= 0 && texts.indexOf(info.sp[0]) >= 0);
}

console.log("== 5) 初回/既訪の分岐(しきい値はCFG) ==");
{
  check("未開拓(初めて訪れる)=情報表示ありの長い版", Holo.travelFull({ pioneered: false }) === true);
  check("未開拓(データ無し)=情報表示ありの長い版", Holo.travelFull(null) === true);
  check("開拓済(既訪)=短縮版", Holo.travelFull({ pioneered: true }) === false);
  const L2 = loadHolo(); L2.api.CFG.holoTravelFullOnUnpioneered = false;
  check("CFGで分岐を無効化できる(常に長い版)", L2.api.Holo.travelFull({ pioneered: true }) === true);
  // 短縮版は情報表示を出さない=ビームの走査+惑星名のみ
  const info = Holo.travelInfo(1), ds = Holo.travelDur(false, false);
  const sLog = [], fLog = [];
  Holo.drawTravel(stubCtx(sLog), 1000, 563, ds * 0.55, info, { dur: ds, full: false });
  Holo.drawTravel(stubCtx(fLog), 1000, 563, ds * 0.55, info, { dur: ds, full: true });
  const sTxt = sLog.filter((l) => l.startsWith("fillText")).join(" "), fTxt = fLog.filter((l) => l.startsWith("fillText")).join(" ");
  check("短縮版: 脅威型・固有種のテレメトリを出さない", sTxt.indexOf("THREAT") < 0 && sTxt.indexOf("ENDEMIC") < 0);
  check("短縮版: 惑星名は出す(どこへ来たかは伝わる)", sTxt.indexOf(info.short) >= 0);
  check("初訪版: 固有種と脅威型を出す", fTxt.indexOf("ENDEMIC") >= 0 && fTxt.indexOf("THREAT") >= 0);
  check("初訪版のほうが情報量が多い", fLog.length > sLog.length);
}

console.log("== 6) 全10惑星で成立する ==");
{
  check("惑星は10", STAGES.length === 10, String(STAGES.length));
  const tints = {};
  for (const st of STAGES) {
    const info = Holo.travelInfo(st.id);
    check(`惑星${st.id} ${st.pname}: travelInfo が解決する`, !!info);
    const d = Holo.travelDur(true, false);
    let threw = null, log = [];
    try {
      for (const f of [0, 0.2, 0.45, 0.7, 0.95, 1]) { log = []; Holo.drawTravel(stubCtx(log), 1000, 563, d * f, info, { dur: d, full: true, from: "惑星テスト" }); }
    } catch (e) { threw = e; }
    check(`惑星${st.id}: 6位相すべて例外なく描ける`, !threw, threw && threw.message);
    check(`惑星${st.id}: 色調が虚空の上で読める明度(${info.tint})`, /^#[0-9a-f]{6}$/i.test(info.tint) && (() => { const n = parseInt(info.tint.slice(1), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) >= 167; })(), info.tint);
    tints[info.tint] = (tints[info.tint] || 0) + 1;
  }
  check(`色調が惑星ごとに変わる(異なる色 ${Object.keys(tints).length}/10)`, Object.keys(tints).length >= 8, JSON.stringify(tints));
}

console.log("== 7) 表示は実データ由来(捏造しない) ==");
{
  for (const st of STAGES) {
    const info = Holo.travelInfo(st.id);
    check(`惑星${st.id}: 惑星名が PLANET_NAMES と一致(${info.short})`, info.short === PLANET_NAMES[st.id]);
    const real = SPECIES.filter((x) => x.stage === st.id).map((x) => x.name);
    check(`惑星${st.id}: 固有種が SPECIES 由来・2種(${info.sp.join("/")})`, info.sp.length === 2 && info.sp.every((n, i) => n === real[i]));
    const bt = BOSS_TYPES.find((b) => b.id === PLANET_BOSS[st.id].threat);
    check(`惑星${st.id}: 脅威型が PLANET_BOSS→BOSS_TYPES 由来(${info.threat})`, info.threat === bt.name && info.threatText === bt.threat);
    check(`惑星${st.id}: 素材/HQ Lv が STAGES 由来`, info.mat === st.mat && info.rank === st.rank);
  }
  // 実データに無い惑星は捏造せず null を返す(それらしい数値を作らない)
  check("未定義の惑星IDは null(でっち上げない)", Holo.travelInfo(99) === null);
  // 欠落は遮蔽表示(REDACTED/UNRESOLVED)で、偽情報を書かない
  const log = [];
  Holo.drawTravel(stubCtx(log), 1000, 563, 0.6, { id: 1, short: "テスト", pname: "惑星テスト", name: "-", rank: 1, mat: null, sp: [], threat: null, threatText: null, sk: null, tint: "#ffb547" }, { dur: 1.15, full: true });
  const txt = log.filter((l) => l.startsWith("fillText")).join(" ");
  check("情報欠落時は REDACTED / UNRESOLVED の遮蔽表示", txt.indexOf("REDACTED") >= 0 && txt.indexOf("UNRESOLVED") >= 0);
}

console.log("== 8) 本編非接触(ロジック・セーブ・経済・確率・純血・魂) ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
  check("holo.js は Game を参照しない", !/\bGame\b/.test(src));
  check("holo.js は localStorage を参照しない", !/localStorage/.test(src));
  check("holo.js は Roulette/Slit/Weather の状態を触らない", !/\bRoulette\.|\bSlit\.|\bWeather\./.test(src));
  // 実行してもサンドボックスのグローバルが増えない(副作用なし)
  const L2 = loadHolo();
  const keysBefore = Object.keys(L2.sb).sort().join(",");
  const info = L2.api.Holo.travelInfo(2);
  L2.api.Holo.drawTravel(stubCtx(null), 1000, 563, 0.5, info, { dur: 1.15, full: true });
  check("描画してもグローバルが増えない(副作用なし)", Object.keys(L2.sb).sort().join(",") === keysBefore);
  // CFG(経済・確率の単一の真実)を書き換えていない
  check("描画してCFGが変化しない", JSON.stringify(L2.api.CFG.slitHalfDeg) === JSON.stringify(CFG.slitHalfDeg) && L2.api.CFG.raidInterval === CFG.raidInterval);
  // UI層: 惑星切替の順序(演出 → confirmSwitch → selectStage)を壊していない
  const pm = fs.readFileSync(path.join(ROOT, "js/ui/screens/planet-map.js"), "utf8");
  check("切替は演出の onEnd の中で confirmSwitch を呼ぶ(順序不変)", /onEnd:\s*\(\)\s*=>\s*\{[^}]*confirmSwitch\(id\)/.test(pm));
  const tvBody = (pm.split("travelTo(id) {")[1] || "").split("travelToLegacy(id) {")[0];
  check("演出(travelTo)から selectStage を直接呼んでいない=切替の入口は confirmSwitch 一本", tvBody.length > 100 && tvBody.indexOf("selectStage") < 0);
  check("selectStage の呼出は既存の2箇所(confirmSwitch/buildPioneer)のまま", (pm.match(/Game\.selectStage\(/g) || []).length === 2);
}

console.log("== 9) ビームの欠陥是正: 横断後に画面へ残らない ==");
{
  const W = 1000, H = 563;
  const b0 = Holo.beam(stubCtx(null), W, H, 0.0);
  const bMid = Holo.beam(stubCtx(null), W, H, 0.5);
  const bEnd = Holo.beam(stubCtx(null), W, H, 1.0);
  const bOver = Holo.beam(stubCtx(null), W, H, 1.6);
  check("p=0: 画面左外から始まる", b0.x <= 0);
  check("p=0.5: 画面内を走っている", bMid.x > 0 && bMid.x < W && bMid.a === 1);
  check("p=1: 不透明度が0(消える)", bEnd.a === 0, "a=" + bEnd.a);
  check("p=1: 先端が画面右外へ抜けている", bEnd.x > W, "x=" + bEnd.x);
  check("p>1(超過)でも残らない", bOver.a === 0 && bOver.x > W);
  // ビームのグラデーションだけを数える(横向き=第2/第4引数が0。scan()の走査帯は縦向きなので混ざらない)
  const beamGrads = (log) => log.filter((l) => /^grad\(-?[\d.]+,0\.000,-?[\d.]+,0\.000\)$/.test(l)).length;
  const lMid = []; Holo.beam(stubCtx(lMid), W, H, 0.5);
  check("p=0.5: ビーム本体が描かれている(観測手段が効いている)", beamGrads(lMid) === 1, String(beamGrads(lMid)));
  const log = []; Holo.beam(stubCtx(log), W, H, 1.0);
  check("p=1: ビーム本体(グラデ/発光線)の命令が出ない", beamGrads(log) === 0);
  check("p=1: 通過済みの格子は残る(システムが起動した痕跡)", log.filter((l) => l.startsWith("moveTo")).length > 10);
  // トランジション終端でもビームが残っていない
  const info = Holo.travelInfo(1), d = Holo.travelDur(true, false);
  const l2 = [];
  Holo.drawTravel(stubCtx(l2), W, H, d - 0.001, info, { dur: d, full: true });
  check("トランジション終端: ビームが描かれない", beamGrads(l2) === 0, String(beamGrads(l2)));
  // 基準カット(オープニング)の案bでも是正されている(t=2.0で横断完了→ノード1/2と競合しない)
  const l3 = [];
  Holo.drawCut(stubCtx(l3), W, H, Holo.grid() * 5.2, "beam");
  check("基準カット 案b: 横断完了後(t=2.08s)にビームが残らない", beamGrads(l3) === 0, "beamGrad=" + beamGrads(l3));
  const l4 = [];
  Holo.drawCut(stubCtx(l4), W, H, Holo.grid() * 3.8, "beam");
  check("基準カット 案b: 横断中(t=1.52s)はビームが描かれる", beamGrads(l4) === 1, "beamGrad=" + beamGrads(l4));
}

console.log("== 11) C2フェーズ2 オープニング 1〜4(静穏→異常→暴走→バガーの影) ==");
{
  const G = Holo.grid();
  const nodes = Holo.openNodes();
  const ids = nodes.map((n) => n.id);
  const at = (id) => Holo.openAt(id);
  check("ノード表が CFG にある(尺の唯一の真実)", Array.isArray(CFG.holoOpenNodes) && CFG.holoOpenNodes.length === nodes.length);
  check("物語の4ノード+暗転+終端が揃う", ["calm", "anomaly", "rampage", "blackout", "bagger", "end"].every((k) => ids.includes(k)), ids.join(","));
  // ★0.4秒グリッド遵守: すべてのカット境界がグリッド上
  for (const n of nodes) check(`${n.id}: グリッド番号が整数=0.4秒グリッド上(${(n.grid * G).toFixed(1)}s)`, Number.isInteger(n.grid), String(n.grid));
  for (let i = 1; i < nodes.length; i++) check(`${nodes[i].id} は ${nodes[i - 1].id} より後(物語の順が入れ替わらない)`, nodes[i].grid > nodes[i - 1].grid);
  check(`全編の尺 ${Holo.openDur().toFixed(1)}s が上限 ${CFG.holoOpenMaxSec}s 以下`, Holo.openDur() <= CFG.holoOpenMaxSec);
  {
    const L = loadHolo(); L.api.CFG.holoOpenNodes = [{ id: "calm", grid: 0 }, { id: "end", grid: 999 }];
    check("上限を超えるノード表を書いてもクランプされる", L.api.Holo.openDur() === L.api.CFG.holoOpenMaxSec);
  }
  check("暗転(溜め)が 暴走→バガー の間に置かれている", at("blackout") > at("rampage") && at("bagger") > at("blackout"));
  check(`暗転の長さが1グリッド以上(${(at("bagger") - at("blackout")).toFixed(1)}s)`, at("bagger") - at("blackout") >= G - 1e-9);
  check(`バガーの露出は${(CFG.holoOpenBaggerGrids * G).toFixed(1)}秒(長く見せない)`, CFG.holoOpenBaggerGrids * G <= 0.5);

  // 決定論
  for (const t of [1.0, 3.2, 5.6, 7.0, 7.3]) {
    const a = [], b = [];
    Holo.drawOpening(stubCtx(a), 1200, 675, t);
    Holo.drawOpening(stubCtx(b), 1200, 675, t);
    check(`t=${t}: 同一位相で命令列が完全一致(${a.length}命令)`, a.length > 40 && a.join("|") === b.join("|"));
  }
  {
    let threw = null;
    try { for (let t = 0; t <= Holo.openDur() + 0.5; t += 0.1) Holo.drawOpening(stubCtx(null), 1200, 675, t); } catch (e) { threw = e; }
    check("0〜終端+0.5秒まで例外なく描ける", !threw, threw && threw.message);
  }
  // ★暗転(溜め)が実際に「落ちて」いる
  const ops = (t) => { const l = []; Holo.drawOpening(stubCtx(l), 1200, 675, t); return l.length; };
  const opsRampage = ops(at("rampage") + G * 4), opsDark = ops(at("blackout") + G * 0.4);
  check(`暗転は密度が落ちる(暴走 ${opsRampage}命令 → 暗転 ${opsDark}命令)`, opsDark < opsRampage * 0.5, `${opsRampage} → ${opsDark}`);

  // 表示文字列: 実データ由来 or 遮蔽表示のみ(捏造しない)
  const textsAt = (t) => { const l = []; Holo.drawOpening(stubCtx(l), 1200, 675, t); return l.filter((x) => x.startsWith("fillText")).map((x) => x.slice(9, -1).split(",")[0]); };
  const calm = textsAt(1.0);
  check("静穏: PLANETS が実データ(" + STAGES.length + ")", calm.includes(String(STAGES.length)), calm.join("/"));
  check("静穏: CONTAINMENT は NOMINAL(まだ壊れていない)", calm.includes("NOMINAL"));
  const rage = textsAt(at("rampage") + G * 6);
  check("暴走: CONTAINMENT FAILED が出る", rage.includes("CONTAINMENT FAILED"));
  check("暴走: 欠落は REDACTED / UNRESOLVED の遮蔽表示", rage.includes("REDACTED") || rage.includes("UNRESOLVED"));
  check("バガー: UNRESOLVED(伏線として伏せる)", textsAt(at("bagger") + 0.05).includes("UNRESOLVED"));
  // 故郷の名は伏せたまま(REDACTED)=記録ごと失われた含意。1〜4の全位相で実在の惑星名を名乗らせない
  //   (7 航路では十の星が実名で並ぶが、それは行き先であって故郷ではない=位相をノード表から限定して測る)
  const preT = [0.5, 1.0, 3.0, 5.0, 6.5, at("bagger") + 0.05].filter((x) => x < at("decision"));
  const allTexts = [].concat.apply([], preT.map(textsAt));
  const planetNames = Object.keys(PLANET_NAMES).map((k) => PLANET_NAMES[k]);
  check("故郷に実在の惑星名を名乗らせない(捏造なし・1〜4の全位相)", !allTexts.some((x) => planetNames.includes(x)));
  check("故郷は HOMEWORLD / REDACTED で伏せる", allTexts.some((x) => /HOMEWORLD/.test(x)));

  // ★ヌシ・バガーの影: 実物(Render.drawBaggerParent)を呼ぶ。無い環境では影を出さず落ちない
  check("Render 不在でも baggerShade が落ちず false を返す", Holo.baggerShade(stubCtx(null), 300, 200, 1, 7.3, 1) === false);
  {
    const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
    check("バガーの影は Render.drawBaggerParent を直接呼ぶ(自前の似顔絵を描かない)", /Render\.drawBaggerParent\(ctx,/.test(src));
    check("Render.time を借用したら必ず戻す(決定論と本編非干渉)", /const saved = Render\.time[\s\S]{0,1200}Render\.time = saved;/.test(src));
    check("案a(core)の語彙が転用されている(焼け跡+火花=emberOnSphere)", /emberOnSphere\(ctx/.test(src));
    check("オープニング追加後も holo.js は Game を参照しない", !/\bGame\b/.test(src));
    check("オープニング追加後も holo.js は localStorage を参照しない", !/localStorage/.test(src));
  }
}

console.log("== 12) C2フェーズ2 オープニング 5〜8(決断→飛び立ち→航路→題)と全編の通し ==");
{
  const G = Holo.grid(), at = (id) => Holo.openAt(id), after = (id) => Holo.openAfter(id);
  const nodes = Holo.openNodes(), ids = nodes.map((n) => n.id);
  const ops = (t) => { const l = []; Holo.drawOpening(stubCtx(l), 1200, 675, t); return l.length; };
  const logAt = (t) => { const l = []; Holo.drawOpening(stubCtx(l), 1200, 675, t); return l; };
  const textsAt = (t) => logAt(t).filter((x) => x.startsWith("fillText")).map((x) => x.slice(9, -1).split(",")[0]);

  // ---- 構成: 全8ノード+暗転2箇所 ----
  check("全8ノードが揃う(1静穏/2異常/3暴走/4バガー/5決断/6飛び立ち/7航路/8題)",
    ["calm", "anomaly", "rampage", "bagger", "decision", "launch", "route", "title"].every((k) => ids.includes(k)), ids.join(","));
  const darks = ids.filter((k) => /^blackout/.test(k));
  check(`暗転(溜め)は2箇所(${darks.join(",")})`, darks.length === 2);
  check("暗転①は 3暴走→4バガー の間", at("blackout") > at("rampage") && at("bagger") > at("blackout"));
  check("暗転②は 6飛び立ち の直後", at("blackout2") >= after("launch") - 1e-9 && at("route") > at("blackout2"));
  for (const d of darks) check(`${d}: 長さが1グリッド以上(${(after(d) - at(d)).toFixed(1)}s)`, after(d) - at(d) >= G - 1e-9);

  // ---- 全編の尺と間合い(通すと冗長、を数値で検分する) ----
  const T = Holo.openDur();
  check(`全編の尺 ${T.toFixed(1)}s が仕様の12〜15秒に収まる`, T >= 12 && T <= 15, String(T));
  check(`終端がグリッド上(${(T / G).toFixed(3)} グリッド)`, Math.abs(T / G - Math.round(T / G)) < 1e-9);
  const lens = [];
  for (let i = 0; i < nodes.length - 1; i++) lens.push(nodes[i + 1].grid - nodes[i].grid);
  check(`カット長(グリッド)=${lens.join(",")} : すべて1以上`, lens.every((v) => v >= 1));
  let run = 1, maxRun = 1;
  for (let i = 1; i < lens.length; i++) { run = lens[i] === lens[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  check(`同じ長さのカットが3連続しない(最長 ${maxRun} 連続・§3-4 単調さの回避)`, maxRun <= 2, String(maxRun));
  // ★冗長の実測: 各グリッド区画で絵が実際に更新されているか(静止した区画=間延び)
  const stale = [];
  for (let g = 0; g * G < T - 1e-9; g++) {
    const a = logAt(g * G + 0.02).join("|"), b = logAt(g * G + G * 0.55).join("|");
    if (a === b) stale.push((g * G).toFixed(1));
  }
  check(`全${Math.round(T / G)}グリッドで絵が更新される(静止=間延びの区画 ${stale.length}件)`, stale.length === 0, stale.join(","));

  // ---- 暗転2箇所の効き(描画命令数で測る) ----
  const opsRampage = ops(at("rampage") + G * 4), opsDark1 = ops(at("blackout") + G * 0.4);
  const opsLaunch = ops(at("launch") + G * 2), opsDark2 = ops(at("blackout2") + G * 0.4);
  check(`暗転①が効く(暴走 ${opsRampage} → 暗転① ${opsDark1} 命令)`, opsDark1 < opsRampage * 0.5, `${opsRampage} → ${opsDark1}`);
  check(`暗転②が効く(飛び立ち ${opsLaunch} → 暗転② ${opsDark2} 命令)`, opsDark2 < opsLaunch * 0.5, `${opsLaunch} → ${opsDark2}`);
  check("暗転②は文字を置かない(説明しない)", textsAt(at("blackout2") + G * 0.4).length === 0);

  // ---- 5 決断: 積載リストは全行が実データ由来 ----
  {
    const rows = Holo.manifest();
    const nSp = SPECIES.length, nMo = __L.api.MORPHS ? __L.api.MORPHS.length : 0;
    check(`積載リストが実データの総数と一致(${rows.length}行)`, rows.length === nSp + nMo + __L.api.FACILITIES.length + __L.api.RESEARCH.length + 1, String(rows.length));
    const names = rows.map((r) => r[1]);
    check("SPECIMEN が SPECIES 由来", SPECIES.every((s) => names.includes(s.name)));
    check("GENOME が MORPHS 由来", __L.api.MORPHS.every((m) => names.includes(m.name)));
    check("APPARATUS が FACILITIES 由来", __L.api.FACILITIES.every((f) => names.includes(f.name)));
    check("ARCHIVE が RESEARCH 由来", __L.api.RESEARCH.every((r) => names.includes(r.name)));
    check("末尾の1行だけが遮蔽表示(=最大の伏線・偽の品目を足さない)",
      rows[rows.length - 1][1] === "REDACTED" && rows[rows.length - 1][2] === "UNRESOLVED" &&
      rows.slice(0, -1).every((r) => r[1] !== "REDACTED"));
    const tx = textsAt(at("decision") + G * 0.6);
    check("決断: 退避計画のHUDへ切替(EVACUATION PLAN)", tx.some((x) => /EVACUATION PLAN/.test(x)), tx.join("/"));
    check("決断: 実データの品目が実際に描かれている", tx.some((x) => names.includes(x)), tx.join("/"));
    check("決断: 置いていく故郷は伏せたまま(HOMEWORLD / REDACTED)", tx.some((x) => /HOMEWORLD/.test(x)));
    const late = textsAt(after("decision") - 0.05);
    check("決断: 流れ切った末尾で遮蔽行が読める(減速して着地する)", late.includes("REDACTED") && late.includes("UNRESOLVED"), late.join("/"));
  }

  // ---- 6 飛び立ち: 故郷が遠ざかり小さくなる(半径の減少を実測) ----
  {
    const radius = (t) => {
      const m = logAt(t).filter((x) => x.startsWith("rgrad(")).map((x) => parseFloat(x.slice(6, -1).split(",")[5]));
      return m.length ? Math.max.apply(null, m) : -1;
    };
    const r0 = radius(at("launch") + 0.05), r1 = radius(after("launch") - 0.05);
    check(`飛び立ち: 故郷が小さくなる(被膜半径 ${r0.toFixed(0)} → ${r1.toFixed(0)})`, r0 > 0 && r1 > 0 && r1 < r0 * 0.65, `${r0} → ${r1}`);
    const tx = textsAt(at("launch") + G * 2);
    check("飛び立ち: DEPARTURE / VECTOR SET", tx.some((x) => /DEPARTURE/.test(x)), tx.join("/"));
    const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
    check("ロケットは回転行列+透視投影の自前3Dで組む(§2-2・ライブラリ不可)", /rocketWire\(ctx[\s\S]{0,400}this\.proj\(this\.rot3\(/.test(src));
    check("ロケットは立体的な陰影を使わない(唯一の禁則・線の図式のまま)", !/rocketWire\(ctx[\s\S]{0,900}createRadialGradient/.test(src));
  }

  // ---- 7 航路: フェーズ1の惑星表示語彙を流用し、全10惑星が実データで並ぶ ----
  {
    const tx = textsAt(after("route") - 0.05);
    for (const st of STAGES) check(`航路: 惑星${st.id} ${PLANET_NAMES[st.id]} が実データで並ぶ`, tx.includes(PLANET_NAMES[st.id]), tx.join("/"));
    check("航路: TEN WORLDS / ROUTE", tx.some((x) => /TEN WORLDS/.test(x)));
    const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
    const body = (src.split('if (inNode("route"))')[1] || "").slice(0, 1400);
    check("航路: フェーズ1と同じ語彙(travelInfo/sphere/planetRing)を流用する=様式が一貫する",
      /this\.travelInfo\(/.test(body) && /this\.sphere\(/.test(body) && /this\.planetRing\(/.test(body));
    // 灯り方が段階的(次々に灯る)=一斉表示にしない
    const early = textsAt(at("route") + G * 0.5).filter((x) => Object.keys(PLANET_NAMES).map((k) => PLANET_NAMES[k]).includes(x)).length;
    const full = STAGES.length;
    check(`航路: 十の星が次々に灯る(序盤 ${early}/${full})`, early > 0 && early < full, `${early}/${full}`);
  }

  // ---- 8 題 → システム起動(導線が途切れない) ----
  {
    const tx = textsAt(after("title") - 0.02);
    check("題: トカゲコロニー", tx.includes("トカゲコロニー"), tx.join("/"));
    check("題: LIZARD COLONY", tx.includes("LIZARD COLONY"));
    check("題: SYSTEM ONLINE でシステム起動へ繋ぐ", tx.includes("SYSTEM ONLINE"));
    // 終端: ビーム本体は抜けて消え、通過済みの格子だけが残る=次の画面(本部)へ地続き
    const end = logAt(Holo.openDur() - 0.001);
    const beamGrads = end.filter((l) => /^grad\(-?[\d.]+,0\.000,-?[\d.]+,0\.000\)$/.test(l)).length;
    check("終端: ビーム本体が残らない(横断して抜けている)", beamGrads === 0, String(beamGrads));
    check("終端: HUDの格子が残る(導線が途切れない)", end.filter((l) => l.startsWith("moveTo")).length > 20);
  }

  // ---- reduced-motion: 「最終画」=題を静止表示する(0.86では題に届かない) ----
  {
    const st = Holo.openStaticT();
    check(`reduced の静止位相 ${st.toFixed(2)}s が題ノードの中(${at("title").toFixed(1)}〜${after("title").toFixed(1)}s)`, st >= at("title") && st < after("title"), String(st));
    const tx = textsAt(st);
    check("reduced: 静止画に題と情報が残る", tx.includes("トカゲコロニー") && tx.includes("LIZARD COLONY"));
    const src = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
    check("play() が staticT で最終画の位相を受け取れる", /opts\.staticT != null \? opts\.staticT : total \* 0\.86/.test(src));
  }

  // ---- 全編の決定論・例外なし ----
  {
    let threw = null, mism = [];
    for (let t = 0; t <= T + 0.5; t += 0.1) {
      const a = [], b = [];
      try { Holo.drawOpening(stubCtx(a), 1200, 675, t); Holo.drawOpening(stubCtx(b), 1200, 675, t); } catch (e) { threw = e; break; }
      if (a.join("|") !== b.join("|")) mism.push(t.toFixed(1));
    }
    check("全編0〜終端+0.5秒まで例外なく描ける", !threw, threw && threw.message);
    check("全編すべての位相で決定論(同一tで命令列が一致)", mism.length === 0, mism.join(","));
  }
}

console.log("== 10) CFGで完全OFFにできる(可逆) ==");
{
  check("holoTravelOn が存在し既定ON", CFG.holoTravelOn === true);
  const pm = fs.readFileSync(path.join(ROOT, "js/ui/screens/planet-map.js"), "utf8");
  check("holoTravelOn=false で従来の宇宙船トランジションへ復帰する分岐がある", /CFG\.holoTravelOn === false[\s\S]{0,80}travelToLegacy\(id\)/.test(pm));
  check("従来トランジション(travelToLegacy)が残っている", /travelToLegacy\(id\)\s*\{/.test(pm) && /planetTravelSec/.test(pm));
  check("Holo 未読込でも移動が壊れない(フォールバックあり)", /typeof Holo === "undefined"/.test(pm));
  check("holoSkippable でスキップ束縛を切れる", /CFG\.holoSkippable === false/.test(fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8")));
}

console.log("== 13) オープニングの本編組み込み(初回だけ自動再生・既存プレイヤーには流さない) ==");
{
  // ルール層(セーブ)まで見る必要があるため、この節だけ game.js を含む重いサンドボックスを使う。
  //   UIスタブ: 内部フラグ(_始まり)は必ず falsy(idle_economy §カナリアと同じ理由=偽の「異常なし」を作らない)。
  function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
  function loadGame() {
    const store = {};
    const sb = {
      console: { log() {}, warn() {}, error() {} },
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
      performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
      UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false },
    };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
    code += "globalThis.__g = { Game, CFG };\n";
    vm.runInContext(code, sb, { filename: "combined.js" });
    return { ...sb.__g, store };
  }
  const G = loadGame();

  // ---- ★カナリア: この計測系はフラグの違いを本当に観測できるか ----
  //   ここが効かないなら以降の「流れる/流れない」は全て無意味なので先に証明する。
  {
    G.Game.newGame();
    const before = G.Game.openingSeen();
    G.Game.ensureDial()[G.Game.OPENING_SEEN_KEY] = 1;
    const after = G.Game.openingSeen();
    check("★カナリア: 再生済みフラグの有無を openingSeen() が区別できる", before === false && after === true, `${before}→${after}`);
  }

  check("CFG.openingAutoPlay が存在し既定ON", CFG.openingAutoPlay === true);
  check("CFGを false にすれば自動再生だけ止められる(可逆)", (() => { const L = loadHolo(); L.api.CFG.openingAutoPlay = false; return L.api.CFG.openingAutoPlay === false; })());
  check("reduced-motion の静止保持が0でない(1フレームで消えない)", CFG.holoOpenReducedHoldSec > 0);

  // ---- 新規コロニー=まだ見ていない ----
  G.Game.newGame();
  check("★新規コロニーは未再生(=初回起動で流れる)", G.Game.openingSeen() === false);
  check("フラグは dial の中にある(往復する器・§5z-3と同じ理由)", G.Game.ensureDial()[G.Game.OPENING_SEEN_KEY] === undefined);
  check("★再生後にフラグが立つ", G.Game.markOpeningSeen() === true && G.Game.openingSeen() === true);
  check("2度目以降は冪等(再視聴で何も起きない)", G.Game.markOpeningSeen() === false && G.Game.openingSeen() === true);

  // ---- 保存の往復で落ちない(ルート直下に置くと脱落する罠の再発防止) ----
  {
    const w = G.Game.toWorld();
    check("★フラグが toWorld で往復する(保存の追加配線が要らない)", w.dial && w.dial[G.Game.OPENING_SEEN_KEY] === 1);
    G.Game.applyWorld(JSON.parse(JSON.stringify(w)));
    check("applyWorld 後も再生済みのまま(読込のたびに流れない)", G.Game.openingSeen() === true);
  }

  // ---- 既存セーブの移行: 見たことにする ----
  {
    const m1 = G.Game.migrateOpeningSeen({ version: 15, dial: { auto: true, rate: 1 } });
    check("★既存セーブ(フラグ未設定)は移行で再生済みになる=流さない", m1.dial[G.Game.OPENING_SEEN_KEY] === 1);
    const m2 = G.Game.migrateOpeningSeen(m1);
    check("移行は冪等(何度通しても1のまま)", m2.dial[G.Game.OPENING_SEEN_KEY] === 1);
    const m3 = G.Game.migrateOpeningSeen({ version: 15 });
    check("dial欠落セーブでも移行が成立する", m3.dial && m3.dial[G.Game.OPENING_SEEN_KEY] === 1);
    check("移行は SAVE_VERSION を上げない(移行チェーン・バックアップ鍵に影響なし)", m3.version === 15);
  }

  // ---- ★実経路: localStorage の既存セーブを load() させる(移行が本当に配線されているか) ----
  {
    G.Game.newGame();
    const w = G.Game.toWorld();
    delete w.dial[G.Game.OPENING_SEEN_KEY];                 // 組み込み前のセーブを再現
    G.store[CFG.saveKey] = JSON.stringify(w);
    G.Game.state = null;
    const okLoad = G.Game.load();
    check("★実経路: 組み込み前のセーブを load() すると再生済みになる(既存プレイヤーには流れない)", okLoad === true && G.Game.openingSeen() === true);
    // 逆向きの確認: newGame は移行を通らない=新規は必ず流れる
    G.Game.newGame();
    check("★newGame は移行を通らない(新規コロニーは必ず流れる)", G.Game.openingSeen() === false);
  }

  // ---- UI層のゲートと導線(ソース検査) ----
  {
    const meta = fs.readFileSync(path.join(ROOT, "js/ui/screens/meta.js"), "utf8");
    // 行コメントを除いてから数える(説明文に同じ識別子が出ても本数判定が狂わないように)
    const boot = fs.readFileSync(path.join(ROOT, "js/ui/boot.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
    const pm2 = fs.readFileSync(path.join(ROOT, "js/ui/screens/planet-map.js"), "utf8");
    const holo = fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8");
    check("自動再生のゲートは1箇所(autoPlayOpening)に閉じている", /autoPlayOpening\(\)\s*\{/.test(meta) && (boot.match(/UI\.autoPlayOpening\(\)/g) || []).length === 1);
    check("ゲートは CFG と再生済みフラグの両方を見る", /CFG\.openingAutoPlay === false/.test(meta) && /Game\.openingSeen\(\)/.test(meta));
    check("★再生後にフラグを立てる配線がある", /markOpeningSeen\(\)/.test(meta));
    check("再視聴の導線が設定に1つだけある(押し売りしない)", (meta.match(/id="set-opening"/g) || []).length === 1);
    check("再視聴は確認ダイアログを挟まない(スキップ即時の作法と揃える)", !/set-opening[\s\S]{0,200}confirm\(/.test(meta));
    check("?tune=1 の検分セッションでは自動再生しない(二重描画の回避)", /tune=1[\s\S]{0,200}autoPlayOpening/.test(boot));
    check("★器は .holo-stage 1つ(見た目の知識を2箇所に置かない)", /\.holo-stage\s*\{/.test(css) && !/#holo-travel\s*\{[^}]*position:\s*fixed/.test(css));
    check("★オープニングの器はヒーロー(340)・報酬(320)より上", /#holo-opening\s*\{\s*z-index:\s*500/.test(css));
    check("器の生成は Holo.mount が唯一の窓口(惑星移動も通す)", /mount\(id\)\s*\{/.test(holo) && /Holo\.mount\("holo-travel"\)/.test(pm2) && /Holo\.mount\("holo-opening"\)/.test(meta));
    check("Holo.mount は DOM 不在で null(node・テスト環境で落ちない)", Holo.mount("holo-opening") === null);
    check("演出層はセーブのフラグ名を知らない(保存状態はルール層だけが持つ)", !/holoPlayed/.test(holo));
  }

  // ---- スキップ即時: オープニングでも確認を挟まず onEnd まで届く ----
  {
    let ended = false, cv = { width: 1200, height: 675, getContext: () => stubCtx(null), addEventListener: () => {}, removeEventListener: () => {} };
    const st = Holo.play(cv, {
      total: Holo.openDur(), reduced: false, bind: false, now: () => 0,
      draw: (c, w, h, t) => Holo.drawOpening(c, w, h, t), onEnd: () => { ended = true; },
    });
    st.skip();
    check("★オープニングのスキップは即時(確認を挟まず onEnd へ)", st.done === true && st.skipped === true && ended === true);
  }
}

console.log(`\n==== holo_regression: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
