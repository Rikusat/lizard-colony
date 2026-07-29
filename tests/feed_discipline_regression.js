"use strict";
// ============================================================
// 給餌規律+球残留 回帰テスト (Ric裁定 2026-07-24・HANDOFF §5nnn)
// 実行: node tests/feed_discipline_regression.js  (repoルートから)
//
// 恒久設計方針の固定(再混入防止):
//  1) 給餌の自動化は「クランク経路(state.dial.auto→feedAll)」のみ。
//     巣・施設・その他いかなる経路にも自動給餌を作らない(無操作tickで給餌0を恒久監視)。
//     ※旧「§8.12 巣の自動給餌」は523be66でnestLv常時ON化し想定外発火→裁定で機構ごと撤廃。
//  2) +10xpポップは手動/クランクauto OFFのみ表示。クランクauto ONは抑制(3.11-6)。
//  3) 惑星切替時のルーレット球残留対策: 旧惑星遺伝子の球を排出しつつ、
//     報酬機会(未発射remaining+飛翔中球数)は新コロニー代表遺伝で全数返却(損失感ゼロ)。
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
    CrankSkins: noopProxy(), Slit: noopProxy(), Motion: noopProxy(),
    // Roulette: 記録型モック(球残留対策の検証用。物理・確率=聖域には触れない)
    Roulette: {
      reward: null, balls: [],
      calls: [],
      endReward() { this.calls.push(["endReward"]); this.reward = null; this.balls.length = 0; },
      startReward(count, gene, mode) { this.calls.push(["startReward", count, gene, mode]); this.reward = { remaining: count, gene, jackpotMode: mode }; },
    },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/render.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__exp = { Game, CFG, Roulette };";
  vm.runInContext(code, sandbox, { filename: "concat.js" });
  return sandbox.__exp;
}

const { Game, CFG, Roulette } = loadGame();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}

// 給餌とポップの計測フック
let feedN = 0, xpPopupN = 0;
const oFeed = Game.feed.bind(Game);
Game.feed = function (lz, silent, cricketOnly) { feedN++; return oFeed(lz, silent, cricketOnly); };
const oPopup = Game.popup ? Game.popup.bind(Game) : null;
Game.popup = function (x, y, txt) { if (String(txt).includes("xp")) xpPopupN++; if (oPopup) return oPopup.apply(Game, arguments); };

console.log("== 1) 自動給餌はクランクのみ: 無操作tickで給餌0(恒久監視) ==");
{
  Game.newGame();
  feedN = 0; xpPopupN = 0;
  const xp0 = Game.state.lizards.reduce((a, l) => a + l.xp, 0);
  const rk0 = Game.state.rankXp || 0;
  for (let t = 0; t < 120; t++) Game.tick(1);
  const xp1 = Game.state.lizards.reduce((a, l) => a + l.xp, 0);
  check("無操作120秒: 給餌0回・+xpポップ0件", feedN === 0 && xpPopupN === 0, `feed=${feedN} popup=${xpPopupN}`);
  check("無操作120秒: ΣXP増0・rankXp増0", xp1 - xp0 === 0 && (Game.state.rankXp || 0) - rk0 === 0, `xp+${xp1 - xp0} rank+${(Game.state.rankXp || 0) - rk0}`);
}

console.log("== 2) 手動/クランク経路は健在・ポップ表示条件 ==");
{
  // 手動給餌: 動く+表示
  Game.newGame(); Game.raid = null; Game.state.crickets = 50;
  feedN = 0; xpPopupN = 0;
  const ok = Game.feed(Game.state.lizards[0]);
  check("手動給餌: 成功+10xpポップ表示", ok === true && feedN === 1 && xpPopupN === 1, `ok=${ok} feed=${feedN} popup=${xpPopupN}`);
  // クランクauto ON: 給餌される+ポップ抑制
  Game.newGame(); Game.raid = null; Game.state.crickets = 50; Game.ensureDial().auto = true;
  feedN = 0; xpPopupN = 0;
  Game.feedAll();
  check("クランクauto ON: 全数給餌+ポップ抑制", feedN === Game.state.lizards.length && xpPopupN === 0, `feed=${feedN}/${Game.state.lizards.length} popup=${xpPopupN}`);
  // クランクauto OFF(手動クランク): 給餌+表示
  Game.newGame(); Game.raid = null; Game.state.crickets = 50; Game.ensureDial().auto = false;
  feedN = 0; xpPopupN = 0;
  Game.feedAll();
  check("クランクauto OFF: 全数給餌+ポップ表示", feedN === Game.state.lizards.length && xpPopupN === Game.state.lizards.length, `feed=${feedN} popup=${xpPopupN}`);
}

console.log("== 3) ソース静的: 自動給餌の再混入防止コメントが撤廃地点に存在 ==");
{
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  check("恒久方針コメント(給餌の自動化はクランク経路のみ)が存在", src.includes("給餌の自動化は「クランク経路"));
  check("巣の自動給餌の発火コード(nestAutoFeedPerLvでの給餌)が存在しない", !/nestAutoFeedPerLv[\s\S]{0,400}this\.feed\(/.test(src));
}

console.log("== 4) 惑星切替の球残留対策: 排出+報酬機会の全数返却(§5nnn) ==");
{
  // 報酬中(remaining 3+飛翔中2)に切替 → endRewardで排出し、5発を新コロニー代表遺伝で返却
  Game.newGame(); Game.raid = null;
  Game.state.rank = 999;
  Roulette.calls.length = 0;
  Roulette.reward = { remaining: 3, gene: { speciesId: "kanahebi" }, jackpotMode: "rare" };
  Roulette.balls = [{ id: 1, gene: { speciesId: "kanahebi" } }, { id: 2, gene: { speciesId: "kanahebi" } }];
  const ok = Game.selectStage(2);
  const started = Roulette.calls.find((c) => c[0] === "startReward");
  const ended = Roulette.calls.find((c) => c[0] === "endReward");
  check("切替成功+旧セッション排出(endReward)", ok === true && !!ended, `ok=${ok} ended=${!!ended}`);
  check("報酬機会5発(未発射3+飛翔2)を全数返却", !!started && started[1] === 5, started && `count=${started[1]}`);
  const gene = started && started[2];
  const endemic2 = Game.endemicSpecies(2);
  check("返却球の遺伝=新惑星の代表(純血)またはnull安全", !gene || endemic2.includes(gene.speciesId), gene && gene.speciesId);
  check("モード維持(rare)", !!started && started[3] === "rare", started && started[3]);

  // 報酬なし+残留球のみ(理論上ない)→念のため排出・startRewardは呼ばれない
  Game.newGame(); Game.raid = null; Game.state.rank = 999;
  Roulette.calls.length = 0; Roulette.reward = null;
  Roulette.balls = [{ id: 9, gene: { speciesId: "kanahebi" } }];
  Game.selectStage(3);
  check("報酬外の残留球: 排出のみ(返却なし)", Roulette.balls.length === 0 && !Roulette.calls.find((c) => c[0] === "startReward"), `balls=${Roulette.balls.length}`);
}

// ============================================================
// 4) 繁殖の自動化は存在しない(Ric裁定 2026-07-29・§5ddd)
//    手動での掛け合わせがゲームUXの核。クイック繁殖(自動選出)と繁殖予約(autoBreed)は機構ごと撤廃。
//    給餌の自動化がクランク経路のみに限定されているのと同じ規律を、繁殖にも恒久で敷く。
// ============================================================
{
  const gsrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const bsrc = fs.readFileSync(path.join(ROOT, "js/ui/screens/breeding.js"), "utf8");
  const dsrc = fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8");
  // コメント(撤廃の記録・行末注記とも)を落として実コードだけを見る。
  //   ※行末注記にも "Game.breed(" のような字面が出るため、行頭コメントの除去だけでは二重計上する。
  const code = (s) => s.split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  check("Game.quickBreed 系が実コードに無い", !/quickBreed(Score|Pick)?\s*[({]/.test(code(gsrc)));
  check("UIの自動選出(breedQuickPick/希少スコア)が実コードに無い",
    !/breedQuickPick|breedPairScore|breedLizardScore/.test(code(bsrc)));
  check("CFG.breedScoreW / breedScoreUpMut が実コードに無い", !/breedScoreW|breedScoreUpMut/.test(code(dsrc) + code(bsrc)));
  check("クイック繁殖ボタン(#bm-quick)が無い", !/bm-quick/.test(code(bsrc)));
  check("繁殖予約トグル(#bm-reserve)が無い", !/bm-reserve/.test(code(bsrc)));
  check("毎秒ブロックに繁殖の自動発火が無い",
    !/quickBreed|autoBreed/.test(code((gsrc.split("this._allyT >= 1")[1] || "").slice(0, 1600))));
  check("state.autoBreed はセーブ素通しのみ(挙動から読まない)",
    !/if\s*\([^)]*\bautoBreed\b/.test(code(gsrc)), "autoBreedで分岐している箇所がある");
  check("繁殖の実行経路は Game.breed のみ(UIから直接呼ぶのは確定ボタン1箇所)",
    (code(bsrc).match(/Game\.breed\(/g) || []).length === 1);
  // 維持すべきUI資産が消えていないこと(撤廃のやりすぎ検知)
  check("維持: 種×モーフタイル", /sp-tile/.test(bsrc));
  check("維持: A/Bスロット", /_bmSlotHtml|sp-slot/.test(bsrc));
  check("維持: 特性チップ(breedTraitChips)", /breedTraitChips/.test(bsrc));
  check("維持: ◀▶ 切替(data-nav)", /data-nav/.test(bsrc));
  check("維持: 同種残0のグレーアウト", /grayed/.test(bsrc));
  check("巡回は id 昇順の安定順序(希少スコア順でない)", /sort\(\(x, y\) => x\.id - y\.id\)/.test(bsrc));
  // 挙動: 旧 autoBreed が true でも tick で繁殖が起きない
  {
    Game.newGame();
    Game.state.rank = 95; Game.state.autoBreed = true;
    if (Game.state.nest) Game.state.nest.lv = 9;
    for (let i = 0; i < 6; i++) {
      const c = JSON.parse(JSON.stringify(Game.state.lizards[0]));
      c.id = 700 + i; c.stage = "adult"; c.breedCd = 0; c.injuredT = 0;
      Game.state.lizards.push(c);
    }
    const eggs0 = Game.state.eggs.length, n0 = Game.state.lizards.length;
    for (let i = 0; i < 120 * 60; i++) Game.tick(1 / 60);   // 無操作120秒
    check("旧autoBreed=true+巣Lv9でも無操作120秒で卵が増えない",
      Game.state.eggs.length === eggs0, `卵 ${eggs0} → ${Game.state.eggs.length}`);
    check("同上: 個体も勝手に増えない", Game.state.lizards.length <= n0, `個体 ${n0} → ${Game.state.lizards.length}`);
  }
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 給餌/繁殖規律の破れ、または球残留対策の回帰。§5nnn・§5ddd の裁定を確認のこと。"); }
else console.log("→ 給餌の自動化はクランクのみ・繁殖の自動化は無し・球残留は排出+全数返却を維持。");
