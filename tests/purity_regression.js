"use strict";
// ============================================================
// 純血設計 回帰テスト (V5.2 Phase4追補)
// 実行: node tests/purity_regression.js  (repoルートから)
//
// 目的(再発防止):
//  1) 固有種テーブルが健全 = 全10惑星×2種=20種がすべて異なり、各ステージちょうど2種
//  2) 生成プール(breedablePool)が各惑星で「その惑星の固有種のみ」
//  3) 生成経路(繁殖の種継承/上位変異・ルーレット虹景品/遺伝子解析・隕石/アメジスト/ラッキー卵)が
//     どの惑星でも他惑星種を生成しない
//  4) 再純血化 migrateV9to10 が混入個体/卵を除去し、冪等
//  5) 監査 auditWorld: 生成後の全惑星で「その惑星の固有種以外」が存在しない
//
// data.js + game.js を vm sandbox に実コードのまま読み込んで検証する(再実装せず本番経路を通す)。
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
    UI: noopProxy(), Render: noopProxy(), Icon: noopProxy(), Motion: noopProxy(),
    Roulette: noopProxy(), CrankSkins: noopProxy(),
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/slit.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__exp = { Game, SPECIES, MORPHS, CFG, STAGES, speciesById, Slit };\n";
  vm.runInContext(code, sandbox, { filename: "combined.js" });
  sandbox.__exp.localStorage = sandbox.localStorage; // load()検証用にsandboxのlocalStorageを露出
  return sandbox.__exp;
}

// ---- 監査: WorldData の各ステージで endemic 以外の個体/卵を集計 ----
function auditWorld(exp, world) {
  const { Game } = exp;
  let foreignLiz = 0, foreignEgg = 0; const detail = [];
  for (const st of (world.stages || [])) {
    const endemic = Game.endemicSpecies(st.stageId);
    const fl = (st.lizards || []).filter((l) => !endemic.includes(l.speciesId));
    const fe = (st.eggs || []).filter((e) => !endemic.includes(e.speciesId));
    foreignLiz += fl.length; foreignEgg += fe.length;
    if (fl.length || fe.length) detail.push(`stage${st.stageId}: liz[${fl.map((l) => l.speciesId)}] egg[${fe.map((e) => e.speciesId)}]`);
  }
  return { foreignLiz, foreignEgg, detail };
}

// ---- 簡易アサート ----
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; fails.push(name + (extra ? " :: " + extra : "")); } }

const exp = loadGame();
const { Game, SPECIES, MORPHS, speciesById } = exp;
const stageOf = (id) => (SPECIES.find((s) => s.id === id) || {}).stage;

// === 1) 固有種テーブルの健全性 ===
const allEndemic = [];
for (let S = 1; S <= 10; S++) {
  const e = Game.endemicSpecies(S);
  check(`stage${S}に固有種2種`, e.length === 2, `実際=${e.length} (${e})`);
  allEndemic.push(...e);
}
check("全固有種が20個", allEndemic.length === 20, `実際=${allEndemic.length}`);
check("全20種がすべて異なる(惑星間の重複なし)", new Set(allEndemic).size === allEndemic.length,
  `重複=${allEndemic.filter((v, i) => allEndemic.indexOf(v) !== i)}`);
// SPECIES全体でも「同じ種が2ステージ以上」が無いこと
const byStageCount = {};
for (const sp of SPECIES) byStageCount[sp.id] = (byStageCount[sp.id] || 0) + 1;
check("同一idが複数定義されていない", Object.values(byStageCount).every((c) => c === 1));

// === 2) breedablePool が各惑星で固有種のみ ===
Game.newGame(); Game.state.rank = 106;
for (let S = 1; S <= 10; S++) {
  Game.state.stageSel = S;
  const pool = Game.breedablePool().map((sp) => sp.id);
  const endemic = Game.endemicSpecies(S);
  check(`stage${S}: breedablePoolが固有種のみ`, pool.every((id) => endemic.includes(id)) && pool.length === endemic.length,
    `pool=${pool} endemic=${endemic}`);
}

// === 3) 生成経路が他惑星種を作らない(全惑星・多数試行) ===
for (let S = 1; S <= 10; S++) {
  Game.state.stageSel = S;
  const endemic = Game.endemicSpecies(S);
  const foreignSeen = new Set();

  // 3a) ルーレット虹景品/遺伝子解析(pickUnownedDexEntry): endemic全登録でフォールスルーを誘発
  Game.state.dex = {};
  for (const id of endemic) for (const mo of MORPHS) Game.state.dex[id + ":" + mo.id] = true;
  for (let i = 0; i < 300; i++) { const p = Game.pickUnownedDexEntry(Game.currentStage().id); if (p && !endemic.includes(p[0].id)) foreignSeen.add(p[0].id); }
  Game.state.dex = {}; // 未所持に戻す
  for (let i = 0; i < 300; i++) { const p = Game.pickUnownedDexEntry(null); if (p && !endemic.includes(p[0].id)) foreignSeen.add(p[0].id); }

  // 3b) 繁殖の種継承+上位変異(必ず変異させて経路を炙り出す)
  const savedMut = Game.state ? null : null; // no-op (CFGは共有オブジェクト)
  const CFG = exp.CFG; const origMut = CFG.mutationSpeciesChance; CFG.mutationSpeciesChance = 1;
  const a = { speciesId: endemic[0], morphId: "normal", hue: 100, sat: 60, light: 50, pattern: "none" };
  const b = { speciesId: endemic[1] || endemic[0], morphId: "normal", hue: 100, sat: 60, light: 50, pattern: "none" };
  for (let i = 0; i < 500; i++) { const c = Game.inherit(a, b); if (!endemic.includes(c.speciesId)) foreignSeen.add(c.speciesId); }
  CFG.mutationSpeciesChance = origMut;

  check(`stage${S}: 生成経路が他惑星種を作らない`, foreignSeen.size === 0,
    `混入=${[...foreignSeen].map((id) => id + "(s" + stageOf(id) + ")")}`);
}

// === 4) migrateV9to10: 混入個体/卵を除去し冪等 ===
{
  // 混入した v9 世界を合成(newGame非依存=治具汚染を避ける)。各ステージに他惑星種を1匹+1卵、正規種も1匹。
  const stages = [];
  for (let S = 1; S <= 10; S++) {
    const endemic = Game.endemicSpecies(S);
    const foreignSp = SPECIES.find((sp) => !endemic.includes(sp.id)).id; // 何か他惑星種
    stages.push({
      stageId: S,
      lizards: [
        { id: 90000 + S, speciesId: foreignSp, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", stage: "adult", xp: 0, level: 1 },
        { id: 91000 + S, speciesId: endemic[0], morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", stage: "adult", xp: 0, level: 1 }, // 正規=残るべき
      ],
      eggs: [{ speciesId: foreignSp, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", t: 1, total: 1 }],
    });
  }
  const w = { version: 9, stages }; // v9として再純血化を通す
  const beforeAudit = auditWorld(exp, w);
  check("混入合成: 監査が混入を検出", beforeAudit.foreignLiz === 10 && beforeAudit.foreignEgg === 10,
    `liz=${beforeAudit.foreignLiz} egg=${beforeAudit.foreignEgg}`);

  const w2 = Game.migrateV9to10(JSON.parse(JSON.stringify(w)));
  const afterAudit = auditWorld(exp, w2);
  check("migrateV9to10後: 他惑星種が0", afterAudit.foreignLiz === 0 && afterAudit.foreignEgg === 0, afterAudit.detail.join(" | "));
  check("migrateV9to10: 除去数が正しい", w2._purifyV10.lizards === 10 && w2._purifyV10.eggs === 10,
    `liz=${w2._purifyV10.lizards} egg=${w2._purifyV10.eggs}`);
  check("migrateV9to10: 正規の固有種は残る", w2.stages.every((st) => (st.lizards || []).some((l) => Game.endemicSpecies(st.stageId).includes(l.speciesId)) || st.lizards.length === 0));
  check("migrateV9to10: version=10", w2.version === 10);
  // 冪等: もう一度通しても除去0
  const w3 = Game.migrateV9to10(w2);
  check("migrateV9to10: 冪等(2回目は除去0/版数維持)", w3.version === 10 && auditWorld(exp, w3).foreignLiz === 0);
}

// === 5) 実生成→監査の統合(各惑星でルーレット卵を大量生成しても混入0) ===
{
  Game.newGame(); Game.state.rank = 106;
  for (let S = 1; S <= 10; S++) {
    Game.state.stageSel = S; Game.state.lizards = []; Game.state.eggs = [];
    // 現惑星の固有種を種にしてルーレット卵を大量生成
    const endemic = Game.endemicSpecies(S);
    const gene = { speciesId: endemic[0], morphId: "normal", hue: 100, sat: 60, light: 55, pattern: "none" };
    for (let i = 0; i < 200; i++) { Game.state.eggs = []; Game.spawnRouletteEgg({ rainbow: Math.random() < 0.5, gene }); }
    const foreign = Game.state.eggs.filter((e) => !endemic.includes(e.speciesId));
    check(`stage${S}: spawnRouletteEgg量産で混入0`, foreign.length === 0, `混入=${foreign.map((e) => e.speciesId)}`);
  }
}

// === 6) load()実チェーン統合: 混入したv9セーブを読み込むと自動で再純血化+バックアップ退避 ===
{
  Game.newGame(); Game.state.rank = 106; Game.state.stageSel = 6;
  const dirty = Game.toWorld();
  // 各ステージへ他惑星種を注入
  const findStage = (id) => dirty.stages.find((s) => s.stageId === id);
  let addedForeign = 0;
  for (const st of dirty.stages) {
    const endemic = Game.endemicSpecies(st.stageId);
    const fsp = SPECIES.find((sp) => !endemic.includes(sp.id)).id;
    st.lizards = st.lizards || []; st.eggs = st.eggs || [];
    st.lizards.push({ id: 95000 + st.stageId, speciesId: fsp, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", stage: "adult", xp: 0, level: 1 });
    st.eggs.push({ speciesId: fsp, morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", t: 1, total: 1 });
    addedForeign += 2;
  }
  dirty.version = 9;
  const ls = exp.localStorage; // harness sandbox の localStorage(Game.load が読む実体)
  ls.setItem(exp.CFG.saveKey, JSON.stringify(dirty));
  const ok = Game.load(); // 実チェーン: migrate…→migrateV9to10→applyWorld
  check("load()成功", ok === true);
  const afterLoad = auditWorld(exp, Game.world);
  check("load()後: 全惑星で他惑星種0(自動再純血化)", afterLoad.foreignLiz === 0 && afterLoad.foreignEgg === 0, afterLoad.detail.join(" | "));
  check("load()後: world.version=11(賢者の石追加)", Game.world.version === 11, `version=${Game.world.version}`);
  const backup = ls.getItem(exp.CFG.saveBackupKeyV10);
  check("load()時: V10バックアップが退避されている(ロールバック可)", !!backup && JSON.parse(backup).version === 9);
}

// === 7) 二重スリット装置(§9): 本装置は種も卵も生成しない(賢者の石のみ=純血の罠を構造的に踏めない) ===
{
  const { Slit } = exp;
  const CFG = exp.CFG;
  Game.newGame();
  Game.state.rank = 106;
  const lz0 = Game.state.lizards.length, eg0 = Game.state.eggs.length, st0 = Game.state.stones || 0;
  Slit.onSuccess = () => Game.addStone(1); // boot と同一配線

  // (7a) 配線検証: 成功→賢者の石のみ(個体/卵ゼロ)。実レートは食級に稀(1/3900)なので、
  //      配線は「切れ目=全周(半角180)=常時成功」の広角に一時差替えて確実に発火させる(レートに依存しない検証)。
  const origHalf = CFG.slitHalfDeg.slice();
  CFG.slitHalfDeg = [180, 180, 180, 180];
  Slit.reset(); Slit.setSeed(12345);
  let success = 0;
  for (let i = 0; i < 40; i++) {
    Slit.launch();
    let g = 0; while (Slit.active() && g < 5000) { Slit.advance(0.008); g++; }
    if (Slit.outcome() === "success") success++;
    Slit.drainEvents();
  }
  CFG.slitHalfDeg = origHalf;
  check("スリット装置: 個体を1匹も生成しない", Game.state.lizards.length === lz0, `Δ=${Game.state.lizards.length - lz0}`);
  check("スリット装置: 卵を1個も生成しない", Game.state.eggs.length === eg0, `Δ=${Game.state.eggs.length - eg0}`);
  check("スリット装置: 成功時は賢者の石のみ付与", (Game.state.stones || 0) - st0 === success && success === 40, `stonesΔ=${(Game.state.stones || 0) - st0} success=${success}`);

  // (7b) 回転の決定論(§9.5): 同一シード+同一時間スケジュール=同一結果(時間の純関数・ウォールクロック非依存)
  const trace = () => {
    Slit.reset(); Slit.setSeed(2024);
    let s = "";
    for (let i = 0; i < 300; i++) {
      Slit.launch();
      let g = 0; while (Slit.active() && g < 5000) { Slit.advance(0.008); g++; }
      s += (Slit.ball.phase === "success" ? "S" : Slit.ball.blockRing);
      Slit.drainEvents();
      Slit.advance(1.3); // クールダウン+間隔ぶん回転を進める(位相が変わる)
    }
    return s + "|stuck=" + Slit.stuck.map((x) => x.ring + ":" + x.id).join(",");
  };
  check("スリット装置: 回転は時間の純関数=同一シードで同一結果(決定論)", trace() === trace());

  // (7c) 最外周(ring1=index0)で弾かれた球は記録に残さない=1枚以上潜った球のみ痕跡(§9.5)
  Slit.reset(); Slit.setSeed(31337);
  for (let i = 0; i < 1200; i++) {
    Slit.launch();
    let g = 0; while (Slit.active() && g < 5000) { Slit.advance(0.008); g++; }
    Slit.drainEvents();
    Slit.advance(0.8);
  }
  check("スリット装置: ring1で弾かれた球は記録しない(1枚以上潜った球のみ)", Slit.stuck.length > 0 && Slit.stuck.every((s) => s.ring >= 1), `n=${Slit.stuck.length} rings=${[...new Set(Slit.stuck.map((s) => s.ring))]}`);

  // ソースに species/breedablePool/inherit 等の生成経路が無いことを静的にも確認(将来の混入防止)
  const slitSrc = fs.readFileSync(path.join(ROOT, "js/slit.js"), "utf8");
  check("スリット装置: 種生成APIを呼ばない(静的)", !/breedablePool|inherit|makeLizard|spawn|pickUnowned|speciesId/.test(slitSrc));
}

// ---- 結果 ----
console.log(`\n=== 純血 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(全惑星で固有種以外を生成・保持しない / 20種すべて異なる / 再純血化は冪等)");
