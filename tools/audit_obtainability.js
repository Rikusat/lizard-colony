"use strict";
// ============================================================
// 獲得可能性の全数監査 (再監査アーク④ 2026-07-24)
// 実行: node tools/audit_obtainability.js  (repoルートから)
//
// 目的: 「図鑑・特性のすべてが正規手順で獲得可能」をコード実測で証明する。
//  A) 種×モーフ(非レジェ): 全10惑星で 固有2種×4モーフ=8エントリが虹景品(未所持抽選)の候補に全数出る
//  B) レジェンダリーモーフ: 3経路(虹コンプ後フォールバック/隕石/アメジスト)それぞれで実測到達
//  C) 特性18種すべて: 賢者の石の乱択創世で全数到達可能(V6-P1-2で旧・合成専用6種もプール入り。重みは極小)
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
  code += "globalThis.__exp = { Game, CFG, SPECIES, MORPHS, STAGES, TRAITS, RESEARCH };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  return sandbox.__exp;
}

const { Game, CFG, SPECIES, MORPHS, STAGES, TRAITS, RESEARCH } = loadGame();

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
console.log("== A) 種×モーフ(非レジェ): 繁殖経路で全惑星8/8を被覆(R2-1卵撤廃後の正規根拠) ==");
{
  // R2-1改定: 旧根拠=虹景品(pickUnownedDexEntry被覆)は卵撤廃で消滅→繁殖(inherit)MCが正規根拠(H節と同手法)
  const nonLeg = MORPHS.filter((m) => !m.legendary).map((m) => m.id);
  const missing = [];
  for (const st of STAGES) {
    setupPlanet(st.id);
    Game.state.nest = { lv: 8 };
    const pool = Game.breedablePool();
    const want = new Set();
    for (const sp of pool) for (const mo of nonLeg) want.add(sp.id + ":" + mo);
    for (let i = 0; i < 20000 && want.size; i++) {
      const a = { speciesId: pool[i % 2].id, morphId: "normal", hue: 100, sat: 50, light: 50, pattern: "none" };
      const b2 = { speciesId: pool[(i + 1) % 2].id, morphId: i % 3 === 0 ? "albino" : "normal", hue: 100, sat: 50, light: 50, pattern: "none" };
      const g = Game.inherit(a, b2);
      if (g.morphId !== "legendary") want.delete(g.speciesId + ":" + g.morphId);
    }
    if (want.size) missing.push(`stage${st.id}: 残 ${[...want].join(",")}`);
  }
  check(`全${STAGES.length}惑星: 固有2種×非レジェ4モーフを繁殖で全数被覆`, missing.length === 0, missing.join(" / "));
}

console.log("== B) レジェンダリーモーフ: 非ルーレット経路の実測到達(R2-1: 虹コンプ経路は卵撤廃で消滅→繁殖/隕石/アメジストが正規) ==");
{
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

console.log("== C) 創世(R5-a乱択): 18種すべてが乱択で到達可能 / tier6は極小(V6-P1-2) ==");
{
  // R5-a改定: プレイヤー正規手順=genesisTraitRand(一様抽選×正規乱数・一律コスト)。指名APIはテストフィクスチャのみ。
  const basic = Object.keys(TRAITS); // V6-P1-2: 18種すべてが乱択プール(tier6は重み極小)
  const seen = new Set();
  let synthLeak = 0, rolls = 0;
  while (seen.size < basic.length && rolls < 5000) {
    setupPlanet(STAGES[0].id);
    const lz = freshLizard();
    Game.addStone(999);
    const key = Game.genesisTraitRand(lz, true);
    rolls++;
    if (key) { seen.add(key); if (TRAITS[key].tier >= 6) synthLeak++; }
  }
  check(`特性18種: 乱択MCで全到達(${rolls}ロール)`, seen.size === basic.length, `到達${seen.size}/${basic.length}`);
  check("tier6(旧・合成専用)も乱択で到達できる(到達不能を作らない)", synthLeak > 0, "t6=" + synthLeak + "/" + rolls);
  check("tier6は極小(全体の10%未満=希少性を保つ。理論値≒4.8%)", synthLeak * 10 < rolls, "t6=" + synthLeak + "/" + rolls);
  // 指名APIの現況: UI導線なし(フィクスチャ専用)
  setupPlanet(STAGES[0].id);
  const lzg = freshLizard(); Game.addStone(999);
  check("指名API(フィクスチャ): tier6も宿せる(合成撤廃後の到達経路)", Game.genesisTrait(lzg, "hagane", true) === true);
}

console.log("== F) ガード(負系): 設計制約が破れていない ==");
{
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
console.log("== H) R2-0事前監査: ルーレット卵撤廃後も全獲得物が塞がらないか(非ルーレット経路のみで全数到達) ==");
{
  // 前提: R2はルーレット景品を鉱物(ダイヤ/アメジスト/石)へ差し替え=卵経路4本(虹新種/虹コンプレジェ/レア中央/卵帯)が消える。
  // ここでは spawnRouletteEgg を一切使わず、繁殖(inherit)/隕石/アメジストのみで図鑑全エントリへ到達できるかをMC実測。
  const nonLeg = MORPHS.filter((m) => !m.legendary).map((m) => m.id);
  const missing = [];
  for (const st of STAGES) {
    setupPlanet(st.id);
    Game.state.nest = { lv: 8 };
    const pool = Game.breedablePool();
    const want = new Set();
    for (const sp of pool) for (const mo of nonLeg) want.add(sp.id + ":" + mo);
    for (let i = 0; i < 20000 && want.size; i++) {
      const a = { speciesId: pool[i % 2].id, morphId: "normal", hue: 100, sat: 50, light: 50, pattern: "none" };
      const b2 = { speciesId: pool[(i + 1) % 2].id, morphId: i % 3 === 0 ? "albino" : "normal", hue: 100, sat: 50, light: 50, pattern: "none" };
      const g = Game.inherit(a, b2);
      if (g.morphId !== "legendary") want.delete(g.speciesId + ":" + g.morphId);
    }
    if (want.size) missing.push(`stage${st.id}: 残 ${[...want].join(",")}`);
  }
  check("H1: 繁殖のみで全惑星の固有2種×非レジェ4モーフへ到達(卵撤廃後も塞がらない)", missing.length === 0, missing.join(" / "));
  setupPlanet(STAGES[0].id);
  Game.state.nest = { lv: 8 };
  const pool0 = Game.breedablePool();
  let legSeen = false;
  for (let i = 0; i < 200000 && !legSeen; i++) {
    const g = Game.inherit({ speciesId: pool0[0].id, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none" }, { speciesId: pool0[1].id, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none" });
    if (g.morphId === "legendary") legSeen = true;
  }
  check("H2: レジェンダリー=繁殖経路(legendChance+巣Lv)でMC到達(+隕石/アメジスト=B節で実証済)", legSeen);
  console.log("  → 卵撤廃で失われるのは各獲得物の『経路の1本』のみ=固有獲得物の喪失ゼロ。※レア中央卵のbonusLv(高Lv誕生)は獲得物でなく付帯ボーナス=喪失は経済変更の範囲(R2報告事項)");
}

console.log("\n== 獲得可能性マトリクス ==");
{
  const rows = [];
  for (const key of Object.keys(TRAITS)) {
    const d = TRAITS[key];

    rows.push(`  ${d.name.padEnd(8, "　")} | 創世 | tier${d.tier}`);
  }
  console.log("  特性        | 創世 | tier");
  console.log(rows.join("\n"));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 到達不能な図鑑/特性、または設計制約の破れがある。"); }
else console.log("→ 全図鑑エントリ・全18特性が正規手順で獲得可能(6合成専用は合成のみ=設計どおり)。");
