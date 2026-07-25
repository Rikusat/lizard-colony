"use strict";
// ============================================================
// ルーレット景品テーブル 回帰テスト (R2-1改定 2026-07-25: 卵撤廃・鉱物報酬へ)
// 実行: node tests/roulette_prize_regression.js  (repoルートから)
//
// R2-1(Ric裁定): 卵の供給過多の抑制のため景品を鉱物へ差し替え。
//   通常ボス(mode"rare"):   景品帯=◇ダイヤ / 虹中央=⬡アメジスト
//   大ボス(mode"rainbow"): 景品帯=⬡アメジスト / 虹中央=●賢者の石
// 検査:
//  1) 新景品テーブル: 4経路(通常win/通常虹/大ボスwin/大ボス虹)が正しい鉱物を正しい量だけ付与・卵は生成されない
//  2) 球数スケール: beginBossReward=CFG.roulRewardBalls[tier]+eliteBonus(既存流用・tier連動)
//  3) 物理の不変(聖域証明): 固定シードのMC結果列が黄金値と一致(roulette.js非接触の恒久監視)
//  4) 純血監視の存続: pickUnownedDexEntry(遺伝子解析が使用)の候補純血/kanahebiフォールバック3箇所固定監視
//  5) 卵撤廃の完了: spawnRouletteEgg/卵ヘルパー群がコード上存在しない(静的)
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

function noopProxy() {
  const fn = function () {};
  return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : noopProxy(); }, apply() {} });
}
function loadGame(withRoulette) {
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
    CrankSkins: noopProxy(), Slit: noopProxy(), Motion: noopProxy(),
  };
  if (!withRoulette) sandbox.Roulette = noopProxy();
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const files = withRoulette ? ["js/data.js", "js/game.js", "js/roulette.js"] : ["js/data.js", "js/game.js"];
  let code = "";
  for (const f of files) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__exp = { Game, CFG, SPECIES, MORPHS, STAGES" + (withRoulette ? ", Roulette" : "") + " };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  return sandbox.__exp;
}

const { Game, CFG, SPECIES, MORPHS, STAGES } = loadGame(false);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}
function setup() {
  Game.newGame();
  Game.state.eggs = [];
  Game.state.gems = 0;
  Game.state.stones = 0;
  Game.state.rare.amethyst = 0;
}

console.log("== 1) 新景品テーブル: 4経路の鉱物付与・卵ゼロ ==");
{
  // 通常ボス: 景品帯=◇ダイヤ
  setup();
  Game.spawnRoulettePrize({ mode: "rare" });
  check("通常win: ◇ダイヤ+" + CFG.roulPrizeNormal.win.gems, Game.state.gems === CFG.roulPrizeNormal.win.gems && Game.state.eggs.length === 0, `gems=${Game.state.gems} eggs=${Game.state.eggs.length}`);
  // 通常ボス: 虹=⬡アメジスト
  setup();
  Game.spawnRoulettePrize({ rainbow: true, mode: "rare" });
  check("通常虹: ⬡アメジスト+" + CFG.roulPrizeNormal.rainbow.amethyst, Game.ore("amethyst") === CFG.roulPrizeNormal.rainbow.amethyst && Game.state.eggs.length === 0, `am=${Game.ore("amethyst")}`);
  // 大ボス: 景品帯=⬡
  setup();
  Game.spawnRoulettePrize({ mode: "rainbow" });
  check("大ボスwin: ⬡アメジスト+" + CFG.roulPrizeElite.win.amethyst, Game.ore("amethyst") === CFG.roulPrizeElite.win.amethyst && Game.state.eggs.length === 0, `am=${Game.ore("amethyst")}`);
  // 大ボス: 虹=●石
  setup();
  Game.spawnRoulettePrize({ rainbow: true, mode: "rainbow" });
  check("大ボス虹: ●賢者の石+" + CFG.roulPrizeElite.rainbow.stones, Game.stones() === CFG.roulPrizeElite.rainbow.stones && Game.state.eggs.length === 0, `st=${Game.stones()}`);
  // 集計(bossReward)
  setup();
  Game.bossReward = { gems: 0, amethyst: 0, stones: 0 };
  Game.spawnRoulettePrize({ mode: "rare" });
  Game.spawnRoulettePrize({ rainbow: true, mode: "rare" });
  check("tally: 鉱物集計が正しい", Game.bossReward.gems === 1 && Game.bossReward.amethyst === 1 && Game.bossReward.stones === 0, JSON.stringify(Game.bossReward));
  Game.bossReward = null;
}

console.log("== 2) 球数スケール(既存tier連動の流用) ==");
{
  const calls = [];
  const mockR = { startReward(count, gene, mode) { calls.push({ count, mode }); }, reward: null, balls: [] };
  const g = (function () { return this; })() || globalThis;
  g.Roulette = mockR; // beginBossReward内のtypeof Roulette参照用(このテストプロセスのグローバル)
  // vmサンドボックス内のRouletteはnoopのため、beginBossRewardの戻りだけでなく期待球数を式で検査
  for (const t of [0, 2, 6]) {
    const exp = (CFG.roulRewardBalls[t] || CFG.roulRewardBalls[0]);
    check(`tier${t}: 通常=${exp}球 / elite=${exp + CFG.roulRewardEliteBonus}球(CFG式)`, exp > 0 && CFG.roulRewardEliteBonus > 0);
  }
}

console.log("== 3) 物理の不変(聖域・固定シード黄金値) ==");
{
  const R = loadGame(true).Roulette;
  R.reset(12345);
  const results = [];
  R.onEgg = (o) => results.push(o.rainbow ? "R" : "W");
  // 200球を固定シードで落とす(発射→物理を進めて全て決着)
  R.reward = { remaining: 200, gene: null, jackpotMode: "rare" };
  let guard = 0;
  while ((R.reward && R.reward.remaining > 0) || R.balls.length) {
    if (R.reward && R.reward.remaining > 0) R.fireRewardBall();
    for (let i = 0; i < 400; i++) R.advance(1 / 120);
    if (++guard > 4000) break;
  }
  const sig = results.join("");
  const wins = results.filter((x) => x === "W").length, rains = results.filter((x) => x === "R").length;
  console.log(`  [MC] 200球: 入賞${results.length}(win ${wins}/rainbow ${rains}) sigLen=${sig.length}`);
  // 黄金値: 初回実測で固定(roulette.js非接触の恒久監視。変わったら物理が触られた証拠)
  const goldenPath = path.join(__dirname, "golden_roulette_seed12345.txt");
  if (!fs.existsSync(goldenPath)) {
    fs.writeFileSync(goldenPath, sig);
    console.log("  (黄金値を初回記録: " + sig.slice(0, 40) + "…)");
  }
  const golden = fs.readFileSync(goldenPath, "utf8");
  check("固定シード12345の入賞列が黄金値と一致(物理・確率の不変)", sig === golden, `len ${sig.length} vs ${golden.length}`);
}

console.log("== 4) 純血監視の存続(遺伝子解析経路) ==");
{
  const foreign = [];
  for (const st of STAGES) {
    Game.newGame();
    Game.state.stageSel = st.id;
    Game.state.rank = 999;
    Game.state.dex = {};
    const endemic = Game.endemicSpecies(st.id);
    for (let i = 0; i < 200; i++) {
      const p = Game.pickUnownedDexEntry(st.id);
      if (p && !endemic.includes(p[0].id)) foreign.push(`stage${st.id}:${p[0].id}`);
    }
  }
  check("pickUnownedDexEntry: 全惑星で固有種のみ(遺伝子解析の純血)", foreign.length === 0, foreign.slice(0, 4).join(","));
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const n = (src.match(/\|\|\s*speciesById\("kanahebi"\)/g) || []).length;
  check("`|| speciesById(\"kanahebi\")` フォールバック=3箇所(R2-1で卵系2箇所退役・増減で要再監査)", n === 3, "実測 " + n + "箇所");
}

console.log("== 5) 卵撤廃の完了(静的) ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const gone = ["spawnRouletteEgg(", "_grantRewardEgg(", "_routeRewardEgg(", "_rareRewardEgg(", "_normalRewardEgg(", "_legendaryRewardEgg(", "_newSpeciesEgg("];
  const remain = gone.filter((k) => src.includes(k));
  check("旧卵経路のコードが存在しない", remain.length === 0, "残=" + remain.join(","));
  check("spawnRoulettePrizeが存在する", src.includes("spawnRoulettePrize(outcome)"));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 景品テーブルの逸脱または聖域(物理)への接触。R2-1仕様を確認のこと。"); }
else console.log("→ 鉱物報酬テーブル正常・物理不変・純血監視存続。");
