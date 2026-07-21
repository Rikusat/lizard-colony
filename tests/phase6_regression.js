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

// === 症状B(重大): クランク非稼働時にGoldが減らない(巣の自動給餌はコオロギ切れでGold消費せず停止) ===
{
  Game.newGame(); Game.ensureDial().auto = false; // クランク非稼働(オートOFF)
  let goldSpends = 0; const origAcq = Game.acquireFeedUnit.bind(Game);
  Game.acquireFeedUnit = function (s, c) { const b = Game.state.coins; const r = origAcq(s, c); if (Game.state.coins < b) goldSpends++; return r; };
  const startCoins = Game.state.coins;
  for (let i = 0; i < 300; i++) Game.tick(1); // 5分間・給餌操作は一切しない(コオロギは途中で枯渇)
  Game.acquireFeedUnit = origAcq;
  ok("症状B: クランク非稼働で300秒 Gold消費0回(自動給餌はGoldを引かない)", goldSpends === 0, "Gold消費回数=" + goldSpends);
  ok("症状B: クランク非稼働でcoinsが減少しない(純増のみ)", Game.state.coins >= startCoins, `${startCoins}->${Math.floor(Game.state.coins)}`);
  // 対照: クランク相当(cricketOnly=false)+コオロギ0+切れ時トグルOFF ならGold消費する(=クランク稼働時の正しい挙動)
  Game.newGame(); Game.state.crickets = 0; Game.ensureDial().stopOnEmpty = false; const c0 = Game.state.coins;
  Game.acquireFeedUnit(true, false); // クランク経路(cricketOnly無し)
  ok("対照: クランク経路(切れ時OFF)はコオロギ0でGold消費する(仕様)", Game.state.coins < c0);
  Game.newGame(); Game.state.crickets = 0; const c1 = Game.state.coins;
  Game.acquireFeedUnit(true, true); // 自動給餌経路(cricketOnly)
  ok("症状B: 自動給餌経路(cricketOnly)はコオロギ0でもGold消費しない", Game.state.coins === c1);
}

// === 症状A要件: 全10惑星でボス討伐→報酬ルーレットが起動する(beginBossReward=true・アリド含む・低tierも) ===
for (let S = 1; S <= 10; S++) {
  Game.newGame(); Game.state.stageSel = S; Game.state.rank = 320;
  ok(`症状A: ID${S} ボス討伐で報酬ルーレット起動(beginBossReward=true)`, Game.beginBossReward(6, false) === true);
}
{
  Game.newGame(); Game.state.stageSel = 1; Game.state.rank = 1; // アリド最弱・tier0
  ok("症状A: アリド tier0(低rank)でも報酬ルーレット起動", Game.beginBossReward(0, false) === true);
}

// === Phase10: 惑星独立・自動移行なし・引き継ぎなし(currentStageが自動ジャンプしない) ===
{
  Game.newGame();
  ok("Phase10: newGameでstageSel=1(アリド明示・null廃止)", Game.state.stageSel === 1);
  Game.state.rank = 50; // 複数惑星の解放ランク
  ok("Phase10: rank上昇でcurrentStageが自動ジャンプしない(アリドのまま)", Game.currentStage().id === 1, "id=" + Game.currentStage().id);
  ok("Phase10: 引き継ぎ汚染なし(個体はアリド固有のまま)", Game.state.lizards.every((l) => Game.endemicSpecies(1).includes(l.speciesId)));
  // 手動selectStageは固有種のみで正しく入替(引き継ぎなし)
  Game.selectStage(6);
  ok("Phase10: 手動selectStage(6)=固有種emeraldのみ(引き継ぎなし)", Game.currentStage().id === 6 && Game.state.lizards.every((l) => Game.endemicSpecies(6).includes(l.speciesId)));
  // toWorldで他惑星に混入が焼き付かない
  Game.newGame(); Game.state.rank = 90;
  const w = Game.toWorld();
  const dirty = (w.stages || []).filter((s) => (s.lizards || []).some((l) => !Game.endemicSpecies(s.stageId).includes(l.speciesId)));
  ok("Phase10: toWorldで全惑星に混入の焼き付きなし(汚染セーブを生まない)", dirty.length === 0, "混入stage=" + dirty.map((s) => s.stageId));
  // マップ新着バッジ(未開拓の解放済み惑星)
  Game.newGame(); Game.state.rank = 50;
  ok("Phase10: hasUnvisitedPlanet=true(未開拓の解放済み惑星あり=マップ新着)", Game.hasUnvisitedPlanet() === true);
  Game.newGame(); Game.state.rank = 1;
  ok("Phase10: rank1(アリドのみ解放・開拓済)ではバッジなし", Game.hasUnvisitedPlanet() === false);
}

// === Phase10.3: 大ボス(elite)は出球が増える ===
{
  Game.newGame(); Game.state.stageSel = 6; Game.state.rank = 320;
  Game.beginBossReward(6, false); const normalBalls = Game.bossReward.count;
  Game.beginBossReward(6, true); const eliteBalls = Game.bossReward.count;
  ok("Phase10.3: elite討伐は出球が増える(通常<elite)", eliteBalls > normalBalls, `通常=${normalBalls} elite=${eliteBalls}`);
  ok("Phase10.3: elite加算=CFG.roulRewardEliteBonus", eliteBalls - normalBalls === CFG.roulRewardEliteBonus);
}

// === Phase10-B: migrateV14to15(再純血化)=固有種保持/非固有除去/空惑星に正しい固有ペア/資産不変/冪等 ===
{
  Game.newGame(); Game.state.rank = 90; const w0 = Game.toWorld(); w0.version = 14;
  w0.wallet = { coins: 12345, gems: 67, crickets: 8, stones: 2 };
  w0.rareWallet = { amethyst: 3, iridium: 5, amber: 7, meteorite: 2, orichalcum: 4, titanium: 6 };
  w0.allies = { armadillo: { lv: 4 } };
  let id = 81000;
  for (const st of w0.stages) {
    st.pioneered = true; st.facilities = Object.assign({}, st.facilities, { water: 9 }); st.lizards = []; st.eggs = [];
    for (let i = 0; i < 3; i++) st.lizards.push({ id: id++, speciesId: "kanahebi", morphId: "normal", hue: 1, sat: 1, light: 1, pattern: "none", stage: "adult", xp: 0, level: 1 });
    if (st.stageId === 6) st.lizards.push({ id: id++, speciesId: "emerald", morphId: "golden", hue: 100, sat: 60, light: 55, pattern: "none", stage: "adult", xp: 40, level: 7 });
  }
  w0.idSeq = id;
  const m = Game.migrateV14to15(JSON.parse(JSON.stringify(w0)));
  let foreign = 0; for (const st of m.stages) for (const l of (st.lizards || [])) if (!Game.endemicSpecies(st.stageId).includes(l.speciesId)) foreign++;
  ok("Phase10-B: 再純血化で非固有0(全惑星が固有種のみ)", foreign === 0, "残=" + foreign);
  ok("Phase10-B: 固有種は失わない(ID1 kanahebi×3・ID6 emerald×1 残る)", (m.stages.find((s) => s.stageId === 1).lizards.filter((l) => l.speciesId === "kanahebi").length === 3) && (m.stages.find((s) => s.stageId === 6).lizards.filter((l) => l.speciesId === "emerald").length === 1));
  const st2 = m.stages.find((s) => s.stageId === 2), sp2id = Game.endemicSpecies(2)[0];
  ok("Phase10-B: 空惑星ID2に固有種#1(" + sp2id + ")の純血ペア2匹を再配置", st2.lizards.length === 2 && st2.lizards.every((l) => l.speciesId === sp2id));
  ok("Phase10-B: 通貨/鉱石/味方Lv/設備Lv 不変", m.wallet.coins === 12345 && m.rareWallet.amber === 7 && m.allies.armadillo.lv === 4 && m.stages.find((s) => s.stageId === 6).facilities.water === 9);
  ok("Phase10-B: stageSel→アリド(既定)", m.stageSel === 1 && m.currentStageId === 1);
  ok("Phase10-B: version=15", m.version === 15);
  const m2 = Game.migrateV14to15(m);
  ok("Phase10-B: 冪等(2回目 stages不変)", JSON.stringify(m2.stages) === JSON.stringify(m.stages));
}

console.log(`\n=== Phase6 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(署名ボス率>=80%/②方式ゲート漏れなし/sigBossChance連動/引き連れUI撤去/開拓=固有2種のみ)");
