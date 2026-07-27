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
  const body = src.slice(start, end + 1);
  // 全階層のオブジェクトスコープを字句解析して重複キーを検出。
  //   旧版は深さ1のキーのみ見ており、ネストの重複(例: slitSkinByStage内で 6: を二重定義)を素通りさせた。
  //   重複キーは「後勝ち」で実行時に無症状=テストでしか捕まえられないため、全階層に一般化する(§5ttt/§5uuuの教訓)。
  const dup = [];
  {
    const stack = [];                       // {arr:bool, path:string, keys:Set}
    let expectKey = false, pendingKey = null, lastKey = null;
    const isIdent = (c) => /[A-Za-z0-9_$"'.\-]/.test(c);
    for (let i = 0; i < body.length; i++) {
      const c = body[i], n = body[i + 1];
      if (c === "/" && n === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }
      if (c === "/" && n === "*") { i = body.indexOf("*/", i) + 1; continue; }
      if (c === '"' || c === "'" || c === "`") {  // 文字列は丸ごと読み飛ばす(キー文字列はpendingKeyで拾う)
        const q = c; let s = i + 1;
        while (s < body.length && body[s] !== q) { if (body[s] === "\\") s++; s++; }
        if (expectKey) pendingKey = body.slice(i + 1, s);
        i = s; continue;
      }
      if (c === "{" || c === "[") {
        const top = stack[stack.length - 1];
        stack.push({ arr: c === "[", path: (top ? top.path + "." : "") + (lastKey || "CFG"), keys: new Set() });
        expectKey = c === "{"; pendingKey = null; continue;
      }
      if (c === "}" || c === "]") { stack.pop(); expectKey = false; pendingKey = null; continue; }
      const top = stack[stack.length - 1];
      if (!top) continue;
      if (c === ",") { expectKey = !top.arr; pendingKey = null; continue; }
      if (!expectKey || top.arr) continue;
      if (c === ":") {
        if (pendingKey != null) {
          if (top.keys.has(pendingKey)) dup.push(top.path + " → " + pendingKey);
          top.keys.add(pendingKey); lastKey = pendingKey;
        }
        expectKey = false; pendingKey = null; continue;
      }
      if (isIdent(c)) { let s = i; while (s < body.length && isIdent(body[s])) s++; pendingKey = body.slice(i, s); i = s - 1; }
    }
  }
  // 深さ1のキー数(規模の健全性=スキャナが空振りしていないことの担保)
  const top1 = (body.match(/^\s{2}[A-Za-z_$][\w$]*\s*:/gm) || []).length;
  check(`CFG全階層のキーに重複なし(直下${top1}個+ネスト全て)`, top1 > 100 && dup.length === 0, "重複=[" + dup.join(" / ") + "]");
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
  code += "globalThis.__exp = { Game, CFG, UI, STAGES };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  const { Game, CFG, UI, STAGES } = sandbox.__exp;

  // R4-1(2026-07-25): dockStages写像はロケット構想撤廃で退役(git記録)。宇宙港rocketStagesの無傷監視は継続。
  check("dockStagesは退役済(未定義)", CFG.dockStages === undefined, JSON.stringify(CFG.dockStages));
  check("宇宙港rocketStages=5段の必要イリジウム(無傷)", Array.isArray(CFG.rocketStages) && CFG.rocketStages.length === 5 && CFG.rocketStages[0] === 20, JSON.stringify(CFG.rocketStages));
  Game.newGame();
  check("労RoomTier写像: labInvest 0/1/2 → T1/T2/T3(投資→部屋の成長へ回帰)", (() => {
    const got = [];
    for (const inv of [0, 1, 2]) { Game.state.labInvest = { desks: inv }; got.push(UI.labRoomTier()); }
    return got[0] === 1 && got[1] === 2 && got[2] === 3;
  })());
  check("宇宙港の建造ロジック(rocketStageNeed)が従来値", Game.rocketStageNeed() === 20, String(Game.rocketStageNeed()));

  // 5) セーブ・サニタイズ(Ric承認 2026-07-25): 財布の負値/非有限を読込境界で0へクランプ(非破壊・冪等)
  {
    const w = Game.toWorld();
    w.wallet.coins = -12708; w.wallet.gems = NaN; w.wallet.stones = -3;
    if (!w.rareWallet) w.rareWallet = {};
    w.rareWallet.amethyst = -5;
    Game.applyWorld(w);
    const okv = Game.state.coins === 0 && Game.state.gems === 0 && Game.stones() === 0 && Game.ore("amethyst") === 0;
    check("sanitize: 負値/NaNの財布が読込時に0へ(個体・構造は非接触)", okv, `coins=${Game.state.coins} gems=${Game.state.gems} st=${Game.stones()} am=${Game.ore("amethyst")}`);
    const w2 = Game.toWorld();
    Game.applyWorld(w2);
    check("sanitize: 冪等(正常値は変えない)", Game.state.coins === 0 && Game.state.gems === 0);
  }

  // 4) researchBonus: effを持たない研究(レシピ解読)を購入済みでも落ちない(建造計画モックで露出したクラッシュの再発防止)
  Game.state.research.recipe1 = true;
  let bonusOk = true, bonusV = null;
  try { bonusV = Game.researchBonus("hatch"); } catch (e) { bonusOk = false; }
  check("researchBonus: レシピ購入済みでもTypeErrorなし(eff無し研究=0)", bonusOk && typeof bonusV === "number", `ok=${bonusOk} v=${bonusV}`);

  // 6) S-SLIT 四重スリット惑星別意匠(姿形+色)のデータ健全性。見た目の実測はtest-slitshape-qa.html(ピクセル走査)が担当。
  {
    const by = CFG.slitSkinByStage || {};
    const missing = STAGES.map((s) => s.id).filter((id) => !(id in by));
    check("slitSkin: 全10惑星の意匠が定義済み", missing.length === 0, `未定義=[${missing}]`);
    // リング別指定(rings[i])まで解決してから検査する(惑星単位のshapeしか見ないと⑤⑦⑨⑩を素通りする)
    const resolved = [];
    for (const [id, v] of Object.entries(by)) for (let i = 0; i < CFG.slitRings; i++) resolved.push([id, i, Object.assign({}, v, (v.rings && v.rings[i]) || {})]);
    // 却下語彙(輪郭が真円のまま)は撤去済み。復活すると意匠の合格条件1を破るため、データ側でも恒久的に禁止する。
    const SHAPES = ["ring", "poly", "organic", "star", "gear", "reuleaux"];
    const REJECTED = ["segment", "double", "sign", "trefoil"];
    const bad = resolved.filter(([, , s]) => s.shape && !SHAPES.includes(s.shape)).map(([id, i, s]) => `${id}#${i}:${s.shape}`);
    check("slitSkin: shapeは実装済み語彙のみ(円/多角/有機/星形/歯車/ルーロー)", bad.length === 0, `未実装shape=[${bad}]`);
    const revived = resolved.filter(([, , s]) => REJECTED.includes(s.shape)).map(([id, i]) => `${id}#${i}`);
    check("slitSkin: 却下語彙(分節/二重/破線標識/重なる円の三葉)が復活していない", revived.length === 0, `復活=[${revived}]`);
    const noPoly = resolved.filter(([, , s]) => s.shape === "poly" && !(s.sides >= 3)).map(([id, i]) => `${id}#${i}`);
    check("slitSkin: 多角形は sides>=3 を持つ", noPoly.length === 0, `sides欠落=[${noPoly}]`);
    const noStar = resolved.filter(([, , s]) => s.shape === "star" && !(s.points >= 3 && s.innerF > 0)).map(([id, i]) => `${id}#${i}`);
    check("slitSkin: 星形は points>=3 と innerF>0 を持つ", noStar.length === 0, `不備=[${noStar}]`);
    // 合格条件4(着地点の可読性): 各リングの最小半径が中心の確保余白を侵さない。ピクセル実測はtest-slitshape-qa.htmlが担当。
    const clear = (CFG.slitCenterCoreF || 0.028) * (CFG.slitCenterClearF || 2.5);
    const rMinOf = (s) => s.shape === "poly" ? Math.cos(Math.PI / s.sides) : s.shape === "star" ? s.innerF
      : s.shape === "gear" ? 1 - (s.toothDepth != null ? s.toothDepth : 0.16) : s.shape === "reuleaux" ? Math.sqrt(3) - 1
        : s.shape === "organic" ? 1 - (s.wobAmp || 0) - (s.wobAmp2 || 0) : 1;
    const intrude = resolved.filter(([, i, s]) => CFG.slitRadiif[i] * rMinOf(s) < clear).map(([id, i]) => `${id}#${i}`);
    check("slitSkin: 全リングが中心の確保余白を侵さない(着地点の可読性)", intrude.length === 0, `侵入=[${intrude}]`);
  }
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ CFGキー衝突または写像の破れ。§5tttの教訓を確認のこと。"); }
else console.log("→ CFGキー健全・ドック6段写像と宇宙港建造は共存。");
