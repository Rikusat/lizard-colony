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
    createLinearGradient: (...a) => { if (log) log.push("grad(" + a.map((v) => v.toFixed(3)).join(",") + ")"); return { addColorStop: (o, c) => { if (log) log.push("stop(" + o + "," + c + ")"); } }; },
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
  vm.runInContext("globalThis.__x = { Holo, CFG, STAGES, SPECIES, PLANET_BOSS, BOSS_TYPES, PLANET_NAMES, stageById }", sb);
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

console.log("== 10) CFGで完全OFFにできる(可逆) ==");
{
  check("holoTravelOn が存在し既定ON", CFG.holoTravelOn === true);
  const pm = fs.readFileSync(path.join(ROOT, "js/ui/screens/planet-map.js"), "utf8");
  check("holoTravelOn=false で従来の宇宙船トランジションへ復帰する分岐がある", /CFG\.holoTravelOn === false[\s\S]{0,80}travelToLegacy\(id\)/.test(pm));
  check("従来トランジション(travelToLegacy)が残っている", /travelToLegacy\(id\)\s*\{/.test(pm) && /planetTravelSec/.test(pm));
  check("Holo 未読込でも移動が壊れない(フォールバックあり)", /typeof Holo === "undefined"/.test(pm));
  check("holoSkippable でスキップ束縛を切れる", /CFG\.holoSkippable === false/.test(fs.readFileSync(path.join(ROOT, "js/holo.js"), "utf8")));
}

console.log(`\n==== holo_regression: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
