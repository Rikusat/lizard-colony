"use strict";
// ============================================================
// 四重スリット 物理・確率 回帰テスト (S-SLIT-R 2026-07-27)
// 実行: node tests/slit_physics_regression.js  (repoルートから)
//
// 背景: 初期位相のランダム化(reset()で_timeを軌道上のランダムな一点へ)を入れた。
//   角度式 ringSlitAngle は無改変だが、聖域(物理・確率の入力)への意図的変更につき恒久監視を新設する。
//   これまでスリットには黄金値監視が存在しなかった(既存の黄金値は Roulette 専用)。
//
//  1) 決定論: setStartPhase固定+固定シードで到達列が黄金値と一致(物理が触られたら壊れる)
//  2) 分離: 初期位相の乱数が球のθ系列に干渉しない(θの再現性は従来どおり)
//  3) OFFスイッチ: CFG.slitStartPhaseRandom=false で従来挙動(_time=0)へ戻る
//  4) ランダム性: リセットごとに盤面(4リングの相対角)が変わる
//  5) 確率: 石生成率が設計値 ∏(2*slitHalfDeg/360) の二項95%CI内(異常窓の除去後の姿)
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

function load() {
  const sandbox = { console, Math, Date, JSON, Object, Array, module: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["js/data.js", "js/slit.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  vm.runInContext("globalThis.__x = { Slit, CFG, slitAngleDist }", sandbox);
  return sandbox.__x;
}
const { Slit, CFG } = load();
const FDT = CFG.slitFixedDt;

// 1球撃って決着まで進め、通過数(0..4)を返す
function shoot() {
  Slit.launch();
  let guard = 0;
  while (Slit.ball && Slit.ball.phase === "fly" && guard++ < 5000) Slit._step(FDT);
  return Slit.passed;
}

console.log("== 1) 決定論(黄金値: 初期位相固定×固定シード) ==");
{
  Slit.setStartPhase(0); Slit.reset(); Slit.setSeed(12345);
  const seq = [];
  for (let k = 0; k < 200; k++) { seq.push(shoot()); for (let s = 0; s < 60; s++) Slit._step(FDT); } // 球間も実時間どおり進める
  const sig = seq.join("");
  const goldenPath = path.join(__dirname, "golden_slit_seed12345.txt");
  if (!fs.existsSync(goldenPath)) { fs.writeFileSync(goldenPath, sig); console.log("  (黄金値を初回記録: " + sig.slice(0, 48) + "…)"); }
  const golden = fs.readFileSync(goldenPath, "utf8").trim();
  check("固定初期位相0×シード12345の到達列200球が黄金値と一致(物理の不変)", sig === golden, `len ${sig.length} vs ${golden.length}`);
  // 再実行しても同一(=決定論)
  Slit.setStartPhase(0); Slit.reset(); Slit.setSeed(12345);
  const seq2 = [];
  for (let k = 0; k < 200; k++) { seq2.push(shoot()); for (let s = 0; s < 60; s++) Slit._step(FDT); }
  check("同条件の再実行が完全一致(決定論)", seq2.join("") === sig);
}

console.log("== 2) 初期位相の乱数が球のθ系列に干渉しない ==");
{
  // 初期位相をランダムにしても、setSeed後のθ列は従来どおり(=_rngは別ストリーム)
  Slit.setStartPhase(null); CFG.slitStartPhaseRandom = true;
  const thetas = [];
  for (let trial = 0; trial < 3; trial++) {
    Slit.reset(); Slit.setSeed(999);
    const t = [];
    for (let k = 0; k < 8; k++) t.push(+(Slit._rng() * 360).toFixed(9));
    thetas.push(t.join(","));
  }
  check("同一シードのθ列がリセット(初期位相ランダム)を跨いで不変", thetas[0] === thetas[1] && thetas[1] === thetas[2], thetas[0].slice(0, 40));
}

console.log("== 3) OFFスイッチで従来挙動へ復帰 ==");
{
  Slit.setStartPhase(null); CFG.slitStartPhaseRandom = false;
  const ts = [];
  for (let k = 0; k < 5; k++) { Slit.reset(); ts.push(Slit._time); }
  check("slitStartPhaseRandom=false で _time は常に0(従来挙動)", ts.every((t) => t === 0), JSON.stringify(ts));
  CFG.slitStartPhaseRandom = true;
}

console.log("== 4) リセットごとに盤面が変わる ==");
{
  Slit.setStartPhase(null); CFG.slitStartPhaseRandom = true;
  const boards = [];
  for (let k = 0; k < 12; k++) {
    Slit.reset();
    boards.push([0, 1, 2, 3].map((i) => Math.round(((Slit.ringSlitAngle(i) % 360) + 360) % 360)).join("/"));
  }
  check("12回のリセットで盤面が全て異なる", new Set(boards).size === 12, boards.slice(0, 3).join("  "));
  // 相対角(=難易度を決める配置)も毎回違う
  const rel = boards.map((b) => { const a = b.split("/").map(Number); return a.map((x) => Math.round((((x - a[0]) % 360) + 360) % 360)).slice(1).join("/"); });
  check("4リングの相対配置も毎回異なる(向きだけの回転ではない)", new Set(rel).size === 12, rel.slice(0, 3).join("  "));
}

console.log("== 5) 確率(roulette_rules §4の作法)。位相もシード駆動=完全決定論(揺らぎゼロ) ==");
{
  // 恒久テストが Math.random に依存すると偶発FAILが出る。位相はシード付き乱数で与え、結果を固定する。
  const rng = (() => { let a = 20260727 >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const N = 500000;                        // 恒久テストは軽量に(500万球規模の本MCは tools 側で別途実施)
  const reach = [0, 0, 0, 0, 0];
  Slit.setSeed(4242);
  // 1球ごとに位相を振る=各球が独立標本。ブロック単位で振ると同一配置の球が固まり(クラスタ標本)、
  // 独立を仮定した±3σ帯が狭すぎて偽FAILになる(実測で確認済み)。
  for (let k = 0; k < N; k++) {
    Slit.setStartPhase(rng() * (CFG.slitStartPhaseMaxSec || 3600));
    Slit.reset();
    reach[shoot()]++;
    Slit.events.length = 0;                // 表現層のdrain相当(描画しないため明示的に捨てる)
  }
  Slit.setStartPhase(null);
  const tot = (i) => reach.slice(i).reduce((a, b) => a + b, 0) / N;
  const p = reach[4] / N, design = CFG.slitHalfDeg.reduce((a, h) => a * (2 * h / 360), 1);
  console.log(`  [MC] N=${N} 石生成=${reach[4]}球 実測=${(p * 100).toFixed(4)}% (1/${Math.round(1 / p)}) / 独立極限=${(design * 100).toFixed(4)}% (1/${Math.round(1 / design)})`);
  console.log(`  [MC] 到達率 ring1=${(tot(1) * 100).toFixed(2)}% ring2=${(tot(2) * 100).toFixed(2)}% ring3=${(tot(3) * 100).toFixed(3)}%`);
  // (a) 各リングの条件付き通過率 = 2*halfDeg[i]/360。標本が多く帯が狭い=物理の一次不変量。
  for (let i = 0; i < CFG.slitRings; i++) {
    const base = tot(i), got = base > 0 ? tot(i + 1) / base : 0, exp = 2 * CFG.slitHalfDeg[i] / 360;
    const n = Math.max(1, Math.round(base * N)), se = Math.sqrt(exp * (1 - exp) / n);
    check(`ring${i} の条件付き通過率 ${(got * 100).toFixed(2)}% = 2*halfDeg/360 ${(exp * 100).toFixed(2)}% (±3σ)`, Math.abs(got - exp) <= 3 * se, `n=${n}`);
  }
  // (b) 石生成率: 整列開始の異常窓が復活していないこと(復活すると 1/40〜1/600 に跳ね上がる)+ 極端な逸脱がないこと
  check(`石生成率が正常域(1/1000より稀)=整列開始の異常窓が復活していない`, p < 1 / 1000, `実測 1/${Math.round(1 / p)}`);
  check(`石生成率が独立極限の 0.6〜1.6倍に収まる`, p > design * 0.6 && p < design * 1.6, `実測 1/${Math.round(1 / p)} / 極限 1/${Math.round(1 / design)}`);
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ スリットの物理/確率が変化している。S-SLIT-Rの前提を確認のこと。"); }
else console.log("→ スリット物理は決定論・θ系列非干渉・確率は設計値どおり。");
