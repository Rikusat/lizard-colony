"use strict";
// ============================================================
// CFG健全性 回帰テスト (2026-07-24・rocketStagesキー衝突バグの再発防止)
// 実行: node tests/cfg_sanity_regression.js  (repoルートから)
//
// 経緯: 本部v4でドック建造しきい値を rocketStages と命名→既存キー(宇宙港=段階別必要イリジウム)と
// 衝突し、オブジェクトリテラルの後勝ちで dockRocketStage() が常にS1となる本番バグ(§5ttt→修正)。
//  1) data.js の CFG リテラルに重複キーがないこと(静的スキャン=このバグ類の恒久検出)
//  2) dockStages 写像: labInvest 0/1/2/3 → S1/S3/S5/S6(既定しきい値・表示のみ)
//  3) 宇宙港の rocketStages(必要イリジウム5段)が無傷であること
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

console.log("== 1) CFGリテラルの重複キー検出(静的) ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8");
  // CFG = { ... }; ブロックを抽出(トップレベルの const CFG から対応する閉じ括弧まで)
  const start = src.indexOf("const CFG = {");
  check("CFGリテラルが見つかる", start >= 0);
  let depth = 0, end = -1;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(start, end);
  // 深さ1のキーのみ収集(ネストしたオブジェクトの内側キーは除外)
  const keys = [];
  let d = 0;
  const lines = body.split("\n");
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length, closes = (line.match(/\}/g) || []).length;
    if (d === 1) {
      const m = line.match(/^\s{2}([A-Za-z_$][\w$]*)\s*:/);
      if (m) keys.push(m[1]);
    }
    d += opens - closes;
  }
  const seen = new Set(), dup = [];
  for (const k of keys) { if (seen.has(k)) dup.push(k); seen.add(k); }
  check(`CFG直下キー ${keys.length}個に重複なし`, keys.length > 100 && dup.length === 0, "重複=[" + dup.join(",") + "]");
}

console.log("== 2) dockStages写像+3) 宇宙港rocketStages無傷(実コード) ==");
{
  function noopProxy() {
    const fn = function () {};
    return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : noopProxy(); }, apply() {} });
  }
  const store = {};
  const sandbox = {
    console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return noopProxy(); } }),
    navigator: { userAgent: "node" },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 },
    Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    Render: noopProxy(), Icon: noopProxy(), Roulette: noopProxy(), CrankSkins: noopProxy(), Slit: noopProxy(), Motion: noopProxy(),
    UI: {}, // hqlab.jsがObject.assignで実装を足す(本物のdockRocketStageを検証)
    addEventListener: () => {}, removeEventListener: () => {},
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/render.js", "js/ui/screens/hqlab.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__exp = { Game, CFG, UI };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  const { Game, CFG, UI } = sandbox.__exp;

  check("dockStagesが6節(表示しきい値)", Array.isArray(CFG.dockStages) && CFG.dockStages.length === 6, JSON.stringify(CFG.dockStages));
  check("宇宙港rocketStages=5段の必要イリジウム(無傷)", Array.isArray(CFG.rocketStages) && CFG.rocketStages.length === 5 && CFG.rocketStages[0] === 20, JSON.stringify(CFG.rocketStages));

  Game.newGame();
  const expect = { 0: 1, 1: 3, 2: 5, 3: 6 }; // 既定しきい値[0,1,1,2,2,3]で通る節目
  const got = {};
  for (const inv of [0, 1, 2, 3]) {
    Game.state.labInvest = { desks: inv };
    got[inv] = UI.dockRocketStage();
  }
  check("dock写像: labInvest 0/1/2/3 → S1/S3/S5/S6", [0, 1, 2, 3].every((i) => got[i] === expect[i]), JSON.stringify(got));
  check("宇宙港の建造ロジック(rocketStageNeed)が従来値", Game.rocketStageNeed() === 20, String(Game.rocketStageNeed()));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ CFGキー衝突または写像の破れ。§5tttの教訓を確認のこと。"); }
else console.log("→ CFGキー健全・ドック6段写像と宇宙港建造は共存。");
