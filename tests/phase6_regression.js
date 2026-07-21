"use strict";
// ============================================================
// Phase6 回帰テスト — 本番実機で出た3症状の再発防止(fable2: テスト経路と本番経路の乖離を是正)
// 実行: node tests/phase6_regression.js  (repoルートから)
//
// 症状1(署名ボスが出ない): 署名ボス出現率 >= 期待値 / ②方式ゲート(署名脅威型のみ固有描画・非署名は漏れない)
// 症状2(引き連れUI復活):   planet-map.jsに引き連れ選択UIが存在しない / selectStage(未開拓)は固有2種のみ(founderIds無視)
// PLANET_BOSSはdata.jsの単一の真実 / sigBossChanceがCFGで効く
//
// ※症状3(報酬ルーレット)は実UI/DOM経路のため test-integration.html(headless Chrome)でカバー。
//   本nodeテストはロジック層(data.js+game.js+render.js を vm で実コード読込)を対象。
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = {
    console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    UI: np(), Render: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: np(),
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/render.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__e = { Game, STAGES, BOSS_TYPES, PLANET_BOSS, Render, CFG, speciesById };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, STAGES, BOSS_TYPES, PLANET_BOSS, Render, CFG } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// === PLANET_BOSS = data.js の単一の真実 ===
ok("PLANET_BOSS が data.js で定義(全10惑星)", PLANET_BOSS && Object.keys(PLANET_BOSS).length === 10);
ok("CFG.sigBossChance が定義", typeof CFG.sigBossChance === "number", "=" + CFG.sigBossChance);

// === 症状1: 署名ボス出現率(高rank) — sigBossChance相当以上 ===
const bossRate = (S) => {
  Game.newGame(); Game.state.stageSel = S; Game.state.rank = 320; Game.state.stageWins = 4;
  const sig = PLANET_BOSS[S].threat; let bossN = 0, sigN = 0;
  for (let i = 0; i < 4000; i++) { Game.rollNextRaid(); const nr = Game.state.nextRaid; if (nr.boss) { bossN++; if (nr.typeId === sig) sigN++; } }
  return sigN / bossN;
};
for (let S = 1; S <= 10; S++) {
  const rate = bossRate(S);
  ok(`ID${S}: 署名ボス出現率 >= 0.80 (症状1根治)`, rate >= 0.80, `率=${(rate * 100).toFixed(0)}%`);
}

// === 症状1: ②方式ゲート(署名脅威型のみ固有描画・非署名は null=漏れなし・非bossもnull) ===
for (let S = 1; S <= 10; S++) {
  Game.newGame(); Game.state.stageSel = S; Game.state.rank = 320;
  const pb = PLANET_BOSS[S];
  ok(`ID${S}: ゲート 署名脅威型=固有描画(${pb.draw})`, Render.planetBossDraw({ boss: true, typeId: pb.threat }) === pb.draw);
  const other = BOSS_TYPES.find((b) => b.id !== pb.threat).id;
  ok(`ID${S}: ゲート 非署名脅威型(${other})=null(漏れなし)`, Render.planetBossDraw({ boss: true, typeId: other }) === null);
  ok(`ID${S}: ゲート 非boss(署名型でも)=null(通常襲来は汎用)`, Render.planetBossDraw({ boss: false, typeId: pb.threat }) === null);
}

// === 症状1: sigBossChance が効く(0=従来の低率 / 1=ほぼ署名) ===
{
  const saved = CFG.sigBossChance;
  CFG.sigBossChance = 0; const lo = bossRate(6);
  CFG.sigBossChance = 1; const hi = bossRate(6);
  CFG.sigBossChance = saved;
  ok("sigBossChance=1 で署名率がほぼ100%", hi >= 0.95, `hi=${(hi * 100).toFixed(0)}%`);
  ok("sigBossChance=0 で署名率が大きく下がる(CFG連動)", lo < hi - 0.3, `lo=${(lo * 100).toFixed(0)}% hi=${(hi * 100).toFixed(0)}%`);
}

// === 症状2: planet-map.js に引き連れ選択UIが存在しない(ソース走査) ===
{
  const src = fs.readFileSync(path.join(ROOT, "js/ui/screens/planet-map.js"), "utf8");
  for (const bad of ["創始者の卵", "連れて行ける", "連れて開拓", "連れずに開拓", "founder-list", "founderPicks", "canFound"]) {
    ok(`症状2: 引き連れUIの痕跡なし "${bad}"`, !src.includes(bad), "残存");
  }
  ok("症状2: 開拓ボタンは残る(開拓する)", src.includes("開拓する"));
}

// === 症状2: 未開拓ステージ開拓=固有2種のみ(founderIds を渡しても無視・純血) ===
for (const S of [6, 8, 10]) {
  Game.newGame(); Game.state.rank = 320; Game.state.stageSel = 1; // 現stage=1に固定(でないとcurrentStage=最高解放stageで自己切替が無効化)
  Game.selectStage(S, [111, 222, 333]); // ★引き連れIDを渡す→無視されるべき
  const endemic = Game.endemicSpecies(S);
  const liz = Game.state.lizards;
  const allEndemic = liz.length > 0 && liz.every((l) => endemic.includes(l.speciesId));
  ok(`症状2: ID${S}開拓は固有種のみ根付く(founderIds無視・他惑星種混入なし)`, allEndemic, "種=" + [...new Set(liz.map((l) => l.speciesId))].join(","));
}

console.log(`\n=== Phase6 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(署名ボス率>=80%/②方式ゲート漏れなし/sigBossChance連動/引き連れUI撤去/開拓=固有2種のみ)");
