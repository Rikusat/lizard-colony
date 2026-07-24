"use strict";
// ============================================================
// ルーレット景品テーブル 純血監査テスト (再監査アーク② 2026-07-24)
// 実行: node tests/roulette_prize_regression.js  (repoルートから)
//
// 目的(純血の再発防止・景品解決の全経路を惑星10×モード4で全数掃引):
//  1) breedablePool が全惑星で「ちょうど2種の固有種」= kanahebi フォールバック(3箇所)が到達不能である根拠
//  2) pickUnownedDexEntry の候補が固有種のみ / 全所持で null(レジェンダリーフォールバックへの正しい入口)
//  3) spawnRouletteEgg の4経路(虹=新種 / 虹=コンプ後レジェンダリー / レア中央 / 卵帯)が
//     どの惑星でも他惑星種・不正モーフを生成しない
//  4) 虹はスロット満杯でも必ず付与(レア保護) / レア・通常は段階変換で捨てない
//  5) 静的: kanahebi フォールバックの箇所数を監視(増えたら新たな混入ハザードとして検知)
//
// 聖域(確率・幾何・#spin-proof)には触れない: 本テストは景品「解決」層のみを検査し、
// roulette.js の物理・確率には一切依存しない(outcome を直接渡す)。
// data.js + game.js を vm sandbox に実コードのまま読み込む(再実装せず本番経路を通す)。
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

// ---- ブラウザ global を no-op でスタブ ----
function noopProxy() {
  const fn = function () {};
  return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : noopProxy(); }, apply() {} });
}
function loadGame() {
  const store = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: new Proxy({}, { get() { return noopProxy(); } }),
    navigator: { userAgent: "node" },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 },
    Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    UI: noopProxy(), Render: noopProxy(), Icon: noopProxy(),
    Roulette: noopProxy(), CrankSkins: noopProxy(), Slit: noopProxy(), Motion: noopProxy(),
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let code = "";
  for (const f of ["js/data.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__exp = { Game, CFG, SPECIES, MORPHS, STAGES };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  return sandbox.__exp;
}

const { Game, CFG, SPECIES, MORPHS, STAGES } = loadGame();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}

// 惑星をセットアップ(newGame→明示選択+ランク解放。個体は空=フォールバック経路も固有種側を通す)
function setupPlanet(stageId, opt) {
  Game.newGame();
  Game.state.stageSel = stageId;
  Game.state.rank = 999;
  Game.state.lizards = [];
  Game.state.eggs = [];
  Game.state.dex = {};
  if (opt && opt.fullDex) {
    for (const sp of SPECIES) for (const mo of MORPHS) Game.state.dex[sp.id + ":" + mo.id] = 1;
  }
}
const nonLegMorphs = MORPHS.filter((m) => !m.legendary).map((m) => m.id);

// ------------------------------------------------------------
console.log("== 1) breedablePool: 全惑星でちょうど2固有種(フォールバック到達不能の根拠) ==");
{
  const bad = [];
  for (const st of STAGES) {
    setupPlanet(st.id);
    const pool = Game.breedablePool();
    const endemic = Game.endemicSpecies(st.id);
    if (pool.length !== 2 || !pool.every((sp) => endemic.includes(sp.id))) {
      bad.push(`stage${st.id}: [${pool.map((s) => s.id)}]`);
    }
  }
  check("全" + STAGES.length + "惑星: pool=2種かつ全て固有種", bad.length === 0, bad.join(" / "));
}

console.log("== 2) pickUnownedDexEntry: 候補=固有種のみ / 全所持=null ==");
{
  const foreign = [];
  for (const st of STAGES) {
    setupPlanet(st.id);
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 300; i++) {
      const p = Game.pickUnownedDexEntry(st.id);
      if (p && !endemic.includes(p[0].id)) foreign.push(`stage${st.id}:${p[0].id}`);
      if (p && p[1].legendary) foreign.push(`stage${st.id}:legendary混入`);
    }
  }
  check("空dex 300抽選×全惑星: 固有種のみ・レジェ非混入", foreign.length === 0, foreign.slice(0, 5).join(" / "));
  const nn = [];
  for (const st of STAGES) {
    setupPlanet(st.id, { fullDex: true });
    if (Game.pickUnownedDexEntry(st.id) !== null) nn.push("stage" + st.id);
  }
  check("全所持dex×全惑星: null(レジェンダリーフォールバックの入口)", nn.length === 0, nn.join(","));
}

console.log("== 3) spawnRouletteEgg 4経路×全惑星の全数掃引 ==");
{
  // 3a: 虹=新種(未所持あり)
  const bad = [];
  for (const st of STAGES) {
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 20; i++) {
      setupPlanet(st.id);
      const ok = Game.spawnRouletteEgg({ rainbow: true, mode: "rainbow" });
      const egg = Game.state.eggs[Game.state.eggs.length - 1];
      if (!ok || !egg) { bad.push(`stage${st.id}: 付与なし`); continue; }
      if (!endemic.includes(egg.speciesId)) bad.push(`stage${st.id}: ${egg.speciesId}`);
      if (egg.morphId === "legendary") bad.push(`stage${st.id}: 未所持ありでレジェ`);
    }
  }
  check("虹=新種: 固有種のみ・非レジェ (20×" + STAGES.length + ")", bad.length === 0, bad.slice(0, 5).join(" / "));

  // 3b: 虹=コンプ後レジェンダリー
  const badL = [];
  for (const st of STAGES) {
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 20; i++) {
      setupPlanet(st.id, { fullDex: true });
      Game.spawnRouletteEgg({ rainbow: true, mode: "rainbow" });
      const egg = Game.state.eggs[Game.state.eggs.length - 1];
      if (!egg) { badL.push(`stage${st.id}: 付与なし`); continue; }
      if (!endemic.includes(egg.speciesId)) badL.push(`stage${st.id}: ${egg.speciesId}`);
      if (egg.morphId !== "legendary") badL.push(`stage${st.id}: morph=${egg.morphId}`);
    }
  }
  check("虹=コンプ後: 固有種のレジェンダリー (20×" + STAGES.length + ")", badL.length === 0, badL.slice(0, 5).join(" / "));

  // 3c: レア中央
  const badR = []; let rareMorphSeen = false;
  for (const st of STAGES) {
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 50; i++) {
      setupPlanet(st.id);
      Game.spawnRouletteEgg({ rainbow: true, mode: "rare" });
      const egg = Game.state.eggs[Game.state.eggs.length - 1];
      if (!egg) { badR.push(`stage${st.id}: 付与なし`); continue; }
      if (!endemic.includes(egg.speciesId)) badR.push(`stage${st.id}: ${egg.speciesId}`);
      if (!nonLegMorphs.includes(egg.morphId)) badR.push(`stage${st.id}: morph=${egg.morphId}`);
      if (egg.morphId !== "normal") rareMorphSeen = true;
    }
  }
  check("レア中央: 固有種のみ・レジェ非混入 (50×" + STAGES.length + ")", badR.length === 0, badR.slice(0, 5).join(" / "));
  check("レア中央: レアモーフ優遇が機能(1回以上出現)", rareMorphSeen);

  // 3d: 卵帯(gene無し=フォールバック経路 / gene=固有種)
  const badN = [];
  for (const st of STAGES) {
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 20; i++) {
      setupPlanet(st.id); // lizards空 → breedablePool()[0] フォールバック
      Game.spawnRouletteEgg({});
      const egg = Game.state.eggs[Game.state.eggs.length - 1];
      if (!egg || !endemic.includes(egg.speciesId)) badN.push(`stage${st.id}: ${egg && egg.speciesId}`);
    }
    const sp = Game.breedablePool()[0];
    for (let i = 0; i < 50; i++) {
      setupPlanet(st.id);
      Game.spawnRouletteEgg({ gene: { speciesId: sp.id, morphId: "normal", hue: sp.hue, sat: sp.sat, light: sp.light, pattern: "none" } });
      const egg = Game.state.eggs[Game.state.eggs.length - 1];
      if (!egg || !endemic.includes(egg.speciesId)) badN.push(`stage${st.id}(gene): ${egg && egg.speciesId}`);
    }
  }
  check("卵帯: gene無し/固有種gene(上位変異込み)とも固有種のみ (70×" + STAGES.length + ")", badN.length === 0, badN.slice(0, 5).join(" / "));
}

console.log("== 4) 付与保証: 虹=満杯でも必ず / レア・通常=段階変換で捨てない ==");
{
  const S = STAGES[0].id;
  setupPlanet(S);
  while (Game.state.eggs.length < Game.eggSlotCap()) Game.state.eggs.push({ speciesId: "kanahebi", morphId: "normal", t: 60, total: 60 });
  const n0 = Game.state.eggs.length;
  Game.spawnRouletteEgg({ rainbow: true, mode: "rainbow" });
  check("虹: スロット満杯でも卵が増える(レア保護)", Game.state.eggs.length === n0 + 1, `eggs ${n0}→${Game.state.eggs.length}`);

  setupPlanet(S);
  while (Game.state.eggs.length < Game.eggSlotCap()) Game.state.eggs.push({ speciesId: "kanahebi", morphId: "normal", t: 60, total: 60 });
  const liz0 = Game.state.lizards.length;
  Game.spawnRouletteEgg({ rainbow: true, mode: "rare" });
  const hatched = Game.state.lizards.length === liz0 + 1;
  setupPlanet(S);
  while (Game.state.eggs.length < Game.eggSlotCap()) Game.state.eggs.push({ speciesId: "kanahebi", morphId: "normal", t: 60, total: 60 });
  Game.state.lizards = new Array(Game.capacity()).fill(null).map((_, i) => ({ id: 90000 + i, speciesId: "kanahebi", morphId: "normal", stage: "adult", xp: 0, level: 1, hue: 1, sat: 1, light: 1, pattern: "none" }));
  const c0 = Game.state.coins;
  Game.spawnRouletteEgg({ rainbow: true, mode: "rare" });
  check("レア: 満杯時は即孵化→全満杯ならGold(捨てない)", hatched && Game.state.coins === c0 + CFG.roulRewardOverflowGold,
    `hatched=${hatched} coins+${Game.state.coins - c0}(期待${CFG.roulRewardOverflowGold})`);
}

console.log("== 5) 静的: kanahebi フォールバック箇所の監視 ==");
{
  // 全5箇所(隕石:469 / アメジスト伝説:521 / 純血ペア開拓:898 / 虹レジェ:1455 / レア:1462)は
  // いずれも breedablePool / endemicSpecies 非空(検査1で全惑星証明)にガードされ到達不能。
  // 箇所が増える=ガード無しの新規フォールバック混入の兆候として数を固定監視する。
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const n = (src.match(/\|\|\s*speciesById\("kanahebi"\)/g) || []).length;
  check("`|| speciesById(\"kanahebi\")` フォールバック=5箇所・全て非空ガード下(増減で要再監査)", n === 5, "実測 " + n + "箇所");
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 純血違反または景品テーブルの逸脱。混入経路を特定し修正のこと。"); }
else console.log("→ ルーレット景品テーブルは全惑星で純血(固有種のみ)を維持。");
