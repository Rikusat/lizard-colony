"use strict";
// ============================================================
// 獲得可能性の全数監査 (再監査アーク④ 2026-07-24)
// 実行: node tools/audit_obtainability.js  (repoルートから)
//
// 目的: 「図鑑・特性のすべてが正規手順で獲得可能」をコード実測で証明する。
//  A) 種×モーフ(非レジェ): 全10惑星で 固有2種×4モーフ=8エントリが虹景品(未所持抽選)の候補に全数出る
//  B) レジェンダリーモーフ: 3経路(虹コンプ後フォールバック/隕石/アメジスト)それぞれで実測到達
//  C) 特性12基本: 賢者の石の創世(genesisTrait)で全数獲得可能 / 6合成専用: 創世では全数不可(=設計どおり)
//  D) レシピ解読I〜VI: 正規API(buyResearch)で資源を満たせば順に解読可能(前提チェーン込み)
//  E) 6合成: 正規手順(創世A→創世B→解読済みレシピ→synthesize)で全数到達・昇華後は成果のみ残る
//  F) ガード(負系): 未解読は不可/固定素材は不可/上限3で創世不可/レジェンダリーに創世不可
//  G) 石の獲得経路: Slit.onSuccess→addStone(1) の配線がboot.jsに存在する(静的)。
//     ※聖域: スリット/ルーレットの確率・幾何には一切触れない(読み取りのみ。MCも景品「解決」層のみ)
//
// 本スクリプトは読み取り専用(リポジトリのファイルを書き換えない)。セーブはvm内メモリのみ。
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

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
  code += "globalThis.__exp = { Game, CFG, SPECIES, MORPHS, STAGES, TRAITS, RECIPES, RESEARCH };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  return sandbox.__exp;
}

const { Game, CFG, SPECIES, MORPHS, STAGES, TRAITS, RECIPES, RESEARCH } = loadGame();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}
function setupPlanet(stageId) {
  Game.newGame();
  Game.state.stageSel = stageId;
  Game.state.rank = 999;
  Game.state.lizards = [];
  Game.state.eggs = [];
  Game.state.dex = {};
}
function freshLizard() {
  const sp = Game.breedablePool()[0];
  const lz = Game.makeLizard(sp.id, "normal", { hue: sp.hue, sat: sp.sat, light: sp.light, pattern: "none", traits: [] }, "adult");
  Game.state.lizards.push(lz);
  return lz;
}

// ------------------------------------------------------------
console.log("== A) 種×モーフ(非レジェ): 虹景品の候補が全惑星で8/8を被覆 ==");
{
  const nonLeg = MORPHS.filter((m) => !m.legendary);
  const missing = [];
  for (const st of STAGES) {
    setupPlanet(st.id);
    const want = new Set();
    for (const spId of Game.endemicSpecies(st.id)) for (const mo of nonLeg) want.add(spId + ":" + mo.id);
    // pickUnownedDexEntryの候補全列挙と等価: 未所持を1つずつ潰して全数到達を確認(決定論)
    for (let guard = 0; guard < 100 && want.size; guard++) {
      const p = Game.pickUnownedDexEntry(st.id);
      if (!p) break;
      const key = p[0].id + ":" + p[1].id;
      want.delete(key);
      Game.state.dex[key] = 1; // 所持化→次の未所持へ
    }
    if (want.size) missing.push(`stage${st.id}: 残 ${[...want].join(",")}`);
  }
  check(`全${STAGES.length}惑星: 固有2種×非レジェ${MORPHS.filter((m) => !m.legendary).length}モーフを虹景品で全数被覆`, missing.length === 0, missing.join(" / "));
}

console.log("== B) レジェンダリーモーフ: 3経路の実測到達 ==");
{
  // B1: 虹コンプ後フォールバック(決定論=100%)
  setupPlanet(STAGES[0].id);
  for (const sp of SPECIES) for (const mo of MORPHS) Game.state.dex[sp.id + ":" + mo.id] = 1;
  Game.spawnRouletteEgg({ rainbow: true, mode: "rainbow" });
  const egg1 = Game.state.eggs[Game.state.eggs.length - 1];
  check("虹コンプ後: レジェンダリー卵(決定論)", !!egg1 && egg1.morphId === "legendary", egg1 && egg1.morphId);

  // B2: 隕石(meteoriteLegendChance>0 → MC上限内に出現)
  let seen = false;
  const cap = Math.ceil(200 / Math.max(CFG.meteoriteLegendChance, 0.001));
  for (let i = 0; i < cap && !seen; i++) {
    setupPlanet(STAGES[0].id);
    Game.addOre("meteorite", 1);
    Game.crackMeteorite();
    const e = Game.state.eggs[Game.state.eggs.length - 1];
    if (e && e.morphId === "legendary") seen = true;
  }
  check(`隕石: レジェンダリー出現(chance=${CFG.meteoriteLegendChance}・MC上限${cap})`, seen);

  // B3: アメジスト(決定論=確定)
  setupPlanet(STAGES[0].id);
  Game.addOre("amethyst", CFG.amethystLegendCost);
  const okAm = Game.amethystEgg();
  const eAm = Game.state.eggs[Game.state.eggs.length - 1];
  check("アメジスト(amethystEgg): レジェンダリー卵(確定)", okAm === true && !!eAm && eAm.morphId === "legendary", `ret=${okAm} morph=${eAm && eAm.morphId}`);
}

console.log("== C) 創世: 12基本=全数可 / 6合成専用=全数不可 ==");
{
  const basic = Object.keys(TRAITS).filter((k) => !TRAITS[k].synth);
  const synth = Object.keys(TRAITS).filter((k) => TRAITS[k].synth);
  const ngB = [], ngS = [];
  for (const key of basic) {
    setupPlanet(STAGES[0].id);
    const lz = freshLizard();
    Game.addStone(999);
    if (!(Game.genesisTrait(lz, key, true) && Game.hasTrait(lz, key))) ngB.push(key);
  }
  check(`12基本: 創世で全数獲得可 (実測${basic.length}種)`, basic.length === 12 && ngB.length === 0, `basic=${basic.length} NG=[${ngB}]`);
  for (const key of synth) {
    setupPlanet(STAGES[0].id);
    const lz = freshLizard();
    Game.addStone(999);
    if (Game.genesisTrait(lz, key, true)) ngS.push(key);
  }
  check(`6合成専用: 創世では全数不可 (実測${synth.length}種)`, synth.length === 6 && ngS.length === 0, `synth=${synth.length} 創世できてしまった=[${ngS}]`);
}

console.log("== D) レシピ解読I〜VI: 正規API(buyResearch)で順に解読可能 ==");
{
  setupPlanet(STAGES[0].id);
  Game.state.coins = 99999999;
  Game.addRes("science", 9999);
  Game.addStone(99);
  const ng = [];
  for (let o = 1; o <= 6; o++) if (!Game.buyResearch("recipe" + o)) ng.push("recipe" + o);
  check("recipe1→6 順に解読成功(前提チェーン・石コスト込み)", ng.length === 0, ng.join(","));
  // 前提スキップの負系: recipe3をいきなり(未解読状態で)
  setupPlanet(STAGES[0].id);
  Game.state.coins = 99999999; Game.addRes("science", 9999); Game.addStone(99);
  check("前提スキップ(いきなりrecipe3)は不可", !Game.buyResearch("recipe3"));
}

console.log("== E) 6合成: 正規手順(創世A→創世B→解読→synthesize)で全数到達 ==");
{
  const ng = [];
  for (const rec of RECIPES) {
    setupPlanet(STAGES[0].id);
    Game.state.coins = 99999999;
    Game.addRes("science", 9999);
    Game.addStone(999);
    for (let o = 1; o <= rec.order; o++) Game.buyResearch("recipe" + o);
    const lz = freshLizard();
    const g1 = Game.genesisTrait(lz, rec.a, true), g2 = Game.genesisTrait(lz, rec.b, true);
    const ok = Game.synthesize(lz, rec.result, true);
    const traits = (lz.traits || []).map((t) => t.key);
    if (!(g1 && g2 && ok && traits.length === 1 && traits[0] === rec.result)) {
      ng.push(`${rec.result}(g1=${g1} g2=${g2} ok=${ok} traits=[${traits}])`);
    }
  }
  check("6レシピ: 全数到達・昇華後は成果のみ(素材消滅・個体不変)", ng.length === 0, ng.join(" / "));
}

console.log("== F) ガード(負系): 設計制約が破れていない ==");
{
  const rec = RECIPES[0];
  // F1: 未解読は不可
  setupPlanet(STAGES[0].id);
  Game.addStone(999);
  const lz1 = freshLizard();
  Game.genesisTrait(lz1, rec.a, true); Game.genesisTrait(lz1, rec.b, true);
  check("未解読レシピでは合成不可", !Game.synthesize(lz1, rec.result, true));
  // F2: 固定素材は不可(固定化=クリア後解禁→rocket.doneを正規フラグとして立てる)
  setupPlanet(STAGES[0].id);
  Game.state.coins = 99999999; Game.addRes("science", 9999); Game.addStone(999);
  Game.buyResearch("recipe1");
  Game.state.rocket = Game.state.rocket || {}; Game.state.rocket.done = true;
  const lz2 = freshLizard();
  Game.genesisTrait(lz2, rec.a, true); Game.genesisTrait(lz2, rec.b, true);
  const fx = Game.fixTrait(lz2, rec.a, true);
  check("固定印つき素材では合成不可(石投資の保護)", fx === true && !Game.synthesize(lz2, rec.result, true), `fix=${fx}`);
  // F3: 上限(traitMaxPerLizard)で創世不可
  setupPlanet(STAGES[0].id);
  Game.addStone(999);
  const lz3 = freshLizard();
  const basic = Object.keys(TRAITS).filter((k) => !TRAITS[k].synth);
  for (let i = 0; i < CFG.traitMaxPerLizard; i++) Game.genesisTrait(lz3, basic[i], true);
  check(`上限${CFG.traitMaxPerLizard}で創世不可`, (lz3.traits || []).length === CFG.traitMaxPerLizard && !Game.genesisTrait(lz3, basic[CFG.traitMaxPerLizard], true));
  // F4: レジェンダリーに創世不可
  setupPlanet(STAGES[0].id);
  Game.addStone(999);
  const sp = Game.breedablePool()[0];
  const leg = Game.makeLizard(sp.id, "legendary", { hue: sp.hue, sat: 90, light: 60, pattern: "none", traits: [] }, "adult");
  Game.state.lizards.push(leg);
  check("レジェンダリーに創世不可", !Game.genesisTrait(leg, basic[0], true));
}

console.log("== G) 石の獲得経路: Slit成功→addStone(1) の配線(静的) ==");
{
  const boot = fs.readFileSync(path.join(ROOT, "js/ui/boot.js"), "utf8");
  const wired = /Slit\.onSuccess\s*=\s*\(\)\s*=>\s*\{[^}]*Game\.addStone\(1\)/s.test(boot);
  check("boot.js: Slit.onSuccess → Game.addStone(1)", wired);
}

// ------------------------------------------------------------
console.log("\n== 獲得可能性マトリクス ==");
{
  const rows = [];
  for (const key of Object.keys(TRAITS)) {
    const d = TRAITS[key];
    const inRecipe = RECIPES.find((r) => r.a === key || r.b === key);
    const asResult = RECIPES.find((r) => r.result === key);
    rows.push(`  ${d.name.padEnd(8, "　")} | ${d.synth ? "—" : "創世"} | ${asResult ? "レシピ" + asResult.order + "の成果" : inRecipe ? "素材(レシピ" + inRecipe.order + ")" : "—"}`);
  }
  console.log("  特性        | 創世 | 合成での位置");
  console.log(rows.join("\n"));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 到達不能な図鑑/特性、または設計制約の破れがある。"); }
else console.log("→ 全図鑑エントリ・全18特性が正規手順で獲得可能(6合成専用は合成のみ=設計どおり)。");
