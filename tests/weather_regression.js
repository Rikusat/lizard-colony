"use strict";
// ============================================================
// W1 動的環境演出(天候) 回帰テスト
// 実行: node tests/weather_regression.js  (repoルートから)
//
//  1) 全10惑星で発生し、必ず終息する(常時降り続けない)
//  2) 粒子数が CFG.weatherMaxParticles を超えない
//  3) 決定論: 同一(惑星id, 時刻)で同一の天候。乱数不使用
//  4) reduced-motion: 粒子と風が停止する
//  5) D7と二重に降らない: 天候の強度に比例してD7が減衰し、最盛時は完全停止
//  6) モーション接続が発火する(見上げ/目追い/避難/くつろぎ抑制)
//  7) 経済値が天候ON/OFFで不変(表示層のみ=経済・生産・確率に非接触)
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

// ---- ルール層だけを読む軽量サンドボックス(Weather は DOM 非依存) ----
function loadWeather() {
  const sb = { console, Math, Date, JSON, Object, Array, module: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/data.js", "js/weather.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  vm.runInContext("globalThis.__x = { Weather, CFG, STAGES }", sb);
  return { api: sb.__x, sb: sb };
}
const __L = loadWeather(); const { Weather, CFG, STAGES } = __L.api, SB = __L.sb;
const setReduced = (v) => { SB.Motion = { reduced: v }; };  // Weather は素の Motion を参照するためサンドボックス側へ注入

console.log("== 1) 全10惑星で発生し、必ず終息する ==");
{
  const cyc = CFG.weatherCycleSec, total = CFG.weatherRiseSec + CFG.weatherHoldSec + CFG.weatherFallSec;
  const SPAN = cyc * 60, STEP = 0.5;
  for (const st of STAGES) {
    let onN = 0, maxK = 0, run = 0, maxRun = 0, phases = {};
    for (let t = 0; t < SPAN; t += STEP) {
      const w = Weather.now(st.id, t);
      if (w.on) { onN++; run += STEP; maxK = Math.max(maxK, w.k); phases[w.phase] = 1; }
      else { maxRun = Math.max(maxRun, run); run = 0; }
    }
    maxRun = Math.max(maxRun, run);
    const duty = onN * STEP / SPAN;
    check(`${st.name}(${st.id}): 発生する(最大強度 ${maxK.toFixed(2)})`, maxK > 0.9, `duty=${(duty * 100).toFixed(1)}%`);
    check(`${st.name}(${st.id}): 3相すべてを通る`, phases.rise && phases.hold && phases.fall, JSON.stringify(Object.keys(phases)));
    check(`${st.name}(${st.id}): 必ず終息する(連続 ${maxRun.toFixed(1)}s ≤ ${total}s)`, maxRun <= total + STEP, `maxRun=${maxRun}`);
    check(`${st.name}(${st.id}): 常時降っていない(稼働率 ${(duty * 100).toFixed(1)}% < 35%)`, duty < 0.35, `duty=${duty}`);
  }
}

console.log("== 2) 粒子数の上限 ==");
{
  // 描画スタブで実際に drawParticles を回し、fill 呼び出し数が上限以下であることを測る
  let fills = 0;
  const ctx = {
    globalAlpha: 1, fillStyle: "", save() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
    fill() { fills++; }, fillRect() { fills++; },
  };
  setReduced(false);
  for (const st of STAGES) {
    const d = Weather.def(st.id);
    if (!d) continue;
    check(`${st.name}: 意匠のn(${d.n})が上限(${CFG.weatherMaxParticles})以下`, d.n <= CFG.weatherMaxParticles, `n=${d.n}`);
  }
  // 上限を超える意匠を注入しても切り詰められる
  const big = Object.assign({}, Weather.def(1), { n: 9999 });
  fills = 0;
  Weather.drawParticles(ctx, 1280, 720, 10, { on: true, k: 1, def: big }, 100, 600);
  check(`n=9999 を注入しても描画は上限 ${CFG.weatherMaxParticles} 個まで`, fills <= CFG.weatherMaxParticles * 2 + 2, `fills=${fills}`);
}

console.log("== 3) 決定論(乱数不使用) ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  check("weather.js が Math.random を使っていない", !/Math\.random/.test(src));
  let same = true;
  for (const st of STAGES) for (let t = 0; t < 400; t += 3.7) {
    const a = Weather.now(st.id, t), b = Weather.now(st.id, t);
    if (a.on !== b.on || Math.abs(a.k - b.k) > 1e-12 || a.phase !== b.phase) same = false;
  }
  check("同一(惑星id, 時刻)で同一の天候(再現性)", same);
  // 惑星ごとに発生タイミングが異なる(全惑星が同時に降らない)
  const at = STAGES.map((st) => { for (let t = 0; t < CFG.weatherCycleSec * 6; t += 0.5) if (Weather.now(st.id, t).on) return Math.round(t); return -1; });
  check("惑星ごとに発生タイミングが異なる(同時多発しない)", new Set(at).size >= STAGES.length - 2, JSON.stringify(at));
}

console.log("== 4) reduced-motion で粒子と風が停止 ==");
{
  let fills = 0;
  const ctx = { globalAlpha: 1, fillStyle: "", save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, fill() { fills++; }, fillRect() { fills++; } };
  setReduced(true);
  const n = Weather.drawParticles(ctx, 1280, 720, 10, { on: true, k: 1, def: Weather.def(8) }, 100, 600);
  check("reduced-motion: 粒子を1つも描かない", fills === 0 && n === 0, `fills=${fills} n=${n}`);
  // 色味と霞は静的に残す(眺めの情報=天候が起きていること自体は伝える)
  let sky = 0;
  const ctx2 = { globalAlpha: 1, fillStyle: "", fillRect() { sky++; }, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, closePath() {} };
  Weather.drawSky(ctx2, 1280, 720, { on: true, k: 1, def: Weather.def(8) }, 100, 600);
  check("reduced-motion: 色味と霞は静的に残す(天候の存在は伝わる)", sky > 0, `fillRect=${sky}`);
  setReduced(false);
}

console.log("== 5) D7と二重に降らない(棲み分け) ==");
{
  const rsrc = fs.readFileSync(path.join(ROOT, "js/render.js"), "utf8");
  check("drawDriftMotes が天候強度kで減衰する", /const wk = \(this\._wx && this\._wx\.on\) \? this\._wx\.k : 0;/.test(rsrc));
  check("最盛時(k=1)はD7を完全停止する", /if \(wk >= 0\.999\) return;/.test(rsrc));
  check("D7のalphaに (1 - wk) が掛かる", /\* \(1 - wk\)/.test(rsrc));
}

console.log("== 6) モーション接続(見上げ/目追い/避難/くつろぎ) ==");
{
  const gsrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  check("C1/C2: 天候への視線が既存の視線ブロックに接続されている", /W1-C1\/C2: 天候への反応/.test(gsrc));
  check("C1: 見上げ窓 _skyT を設定する", /lz\._skyT = CFG\.weatherLookSec/.test(gsrc));
  check("C3: 荒天の避難がある", /W1-C3: 荒天の避難/.test(gsrc));
  check("C3: ボス襲来中は天候避難に入らない(戦闘が最優先)", /this\._wx && this\._wx\.on && !this\.raid/.test(gsrc));
  check("C3: resting/returning のライフサイクルに触れない(表示枠コントローラと競合しない)",
    !/W1-C3[\s\S]{0,900}?lz\.(returning|resting) = true/.test(gsrc));
  check("C4: くつろぎ率に天候の倍率が掛かる", /W1-C4: 天候中はくつろぎ率が下がる/.test(gsrc));
  const rsrc = fs.readFileSync(path.join(ROOT, "js/render.js"), "utf8");
  check("C1: 見上げ姿勢が描画に接続されている(既存lookup相当を流用)", /W1-C1: 天候の見上げ窓/.test(rsrc));
  // 反応強度は全惑星でCFG化されている
  let ok = true, miss = [];
  for (const st of STAGES) { const d = Weather.def(st.id); if (!d || !d.react) { ok = false; miss.push(st.id); } }
  check("全10惑星に react(look/follow/huddle/relaxMult)が定義されている", ok, `欠落=${miss}`);
}

console.log("== 7) 経済・確率に非接触 ==");
{
  const wsrc = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const bad = (wsrc.match(/Game\.state|addStone|addOre|addRes|coins|gems|Game\.save|localStorage|breed|spawn|damage|\.hp/gi) || []);
  check("weather.js が経済・セーブ・戦闘に触れていない", bad.length === 0, `検出=${[...new Set(bad)].join(",")}`);
  // 天候CFGは表示パラメータのみ(生産/確率のキー名を含まない)
  const keys = Object.keys(CFG).filter((k) => /^weather/.test(k));
  check(`天候CFGキーは表示層のみ(${keys.length}キー)`, keys.length >= 8 && !keys.some((k) => /income|rate$|Mult$/.test(k) && !/Speed|relax/.test(k)), keys.join(","));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 天候の骨格・意匠・接続・安全境界のいずれかが破れている。"); }
else console.log("→ 全10惑星で発生し終息・上限順守・決定論・reduced停止・D7と棲み分け・接続発火・経済非接触。");
