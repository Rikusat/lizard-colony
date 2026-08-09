"use strict";
// ============================================================
// V6-P1-1 味方廃止 回帰テスト(恒久) — 旧 phase7_regression.js を置き換える
//   Phase7(味方のボスLv連動 自動強化)は味方ごと廃止されたため、旧スイートは役目を終えた。
//
// 本スイートは**両方向**を監視する(片方だけだと事故る):
//   A) 味方は存在しない  … 資産・API・描画・UI・CFG が復活していないこと(再実装の抑止)
//   B) 削除しすぎていない … 戦闘・報酬・図鑑・称号/ミッション・セーブが壊れていないこと
//   C) 難度は据置        … tier相殺の数値が入っていること(β直前に難度を動かさない)
// 実行: node tests/ally_removal_regression.js
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false },
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = "";
  for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__e = { Game, Render, CFG, STAGES, SPECIES, TITLES, MISSIONS, BOSS_TIERS, PLANET_BOSS, SIG_PAL, bossTierFor };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return { api: sb.__e, sb };
}
const L = load();
const { Game, Render, CFG, STAGES, TITLES, MISSIONS, BOSS_TIERS, PLANET_BOSS, SIG_PAL } = L.api;
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-4);
const SRC = {};
for (const f of ["js/data.js", "js/game.js", "js/render.js", "js/ui/screens/meta.js", "js/ui/core.js"]) SRC[f] = fs.readFileSync(path.join(ROOT, f), "utf8");

console.log("== A) 味方は存在しない(再実装の抑止) ==");
{
  // ★カナリア: このソース検査は本当に文字列を見つけられるのか(見つけられないなら「無い」は偽造)
  ok("★カナリア: ソース検査が生きている(既知の語を検出できる)", /raidDps/.test(SRC["js/game.js"]) && /BOSS_TIERS/.test(SRC["js/data.js"]));

  ok("データ定義が無い(ALLIES / PLANET_ALLIES)", !/\bconst ALLIES\b/.test(SRC["js/data.js"]) && !/\bconst PLANET_ALLIES\b/.test(SRC["js/data.js"]));
  ok("参照ヘルパが無い(allyById / planetAllyById / planetAllyOf)", !/\ballyById\b|\bplanetAllyById\b|\bplanetAllyOf\b/.test(SRC["js/data.js"] + SRC["js/game.js"] + SRC["js/render.js"]));
  ok("戦闘APIが無い(allyLv / checkAllies / raidAllyTierScale)", !/\ballyLv\s*\(|\bcheckAllies\b|\braidAllyTierScale\b/.test(SRC["js/game.js"]));
  ok("育成APIが無い(allyLvUp / allyLvUpCost)", !/\ballyLvUp\b/.test(SRC["js/game.js"]));
  ok("描画が無い(drawPlanetAllies / _allySquad / _allyBoost)", !/drawPlanetAllies|_allySquad|_allyBoost|_allyVisTier|_allyK\b/.test(SRC["js/render.js"]));
  ok("UIが無い(openAllies / 惑星味方の復元導線)", !/openAllies|set-rollbackV14|restoreV14Backup/.test(SRC["js/ui/screens/meta.js"] + SRC["js/game.js"]));
  for (const k of ["allyMaxLv", "allyLvCostPerLv", "allyLvBioCost", "allyScaleByTier", "allyScaleElite",
    "allyVisSizePerTier", "allyVisHeadsPerTier", "allyVisHeadMax", "dormouseDps", "moleAtkBuff", "anoleDps", "fireflyGrace", "fireflyGraceFloor"]) {
    ok(`CFG.${k} が無い`, CFG[k] === undefined);
  }
  ok("SIG_PAL.allyBoost が無い", !SIG_PAL || SIG_PAL.allyBoost === undefined);
  ok("Game に味方メソッドが生えていない", typeof Game.allyLv !== "function" && typeof Game.checkAllies !== "function" && typeof Game.raidAllyTierScale !== "function");
  ok("Render に味方描画が生えていない", typeof Render.drawPlanetAllies !== "function" && typeof Render._allySquad !== "function");

  // ★振る舞いの検査(ソース検査より強い): state.allies を積んでも戦闘は一切変わらない
  Game.newGame(); Game.state.rank = 95; Game.state.stageSel = 1;
  Game.raid = { typeId: "snake", tier: 6, elite: true, webs: [] };
  const before = Game.raidDps();
  Game.state.allies = { armadillo: { lv: 5 }, mole: { lv: 5 }, anole: { lv: 5 }, turtle: { lv: 5 }, ferret: { lv: 5 } };
  const after = Game.raidDps();
  ok("★state.allies に高Lvを積んでも raidDps が変わらない(もう読んでいない)", near(before, after, 1e-9), `${before} vs ${after}`);
}

console.log("== B) 削除しすぎていない(戦闘・報酬・図鑑・称号が壊れていない) ==");
{
  // 全7脅威型で襲来が成立し、与ダメが出て、撃破まで到達できる
  for (const st of STAGES) {
    const pb = PLANET_BOSS[st.id];
    Game.newGame(); Game.state.rank = 95; Game.state.stageSel = st.id; Game.state.currentStageId = st.id;
    for (let i = 0; i < 20; i++) { const c = JSON.parse(JSON.stringify(Game.state.lizards[0])); c.id = 900 + i; c.stage = "adult"; c.level = 60; c.injuredT = 0; delete c.x; delete c.y; Game.ensureRuntime(c); Game.state.lizards.push(c); }
    Game.state.nextRaid = { typeId: pb.threat, boss: true, elite: false, tier: 6 };
    let threw = null;
    try { Game.startRaid(); } catch (e) { threw = e; }
    ok(`ID${st.id}: ${pb.threat} の襲来が例外なく成立する`, !threw && !!Game.raid, threw && threw.message);
    if (Game.raid) {
      ok(`ID${st.id}: 与ダメが正(戦闘が機能している)`, Game.raidDps() > 0, "dps=" + Game.raidDps());
      const c0 = Game.state.coins, w0 = Game.state.raidsWon;
      Game.raid.snake.hp = 1;
      let t2 = null; try { for (let i = 0; i < 200 && Game.raid; i++) Game.updateRaid(0.1); } catch (e) { t2 = e; }
      ok(`ID${st.id}: 撃破処理が例外なく完走する`, !t2, t2 && t2.message);
      ok(`ID${st.id}: 撃破で報酬が入る`, Game.state.coins > c0, `${c0}→${Game.state.coins}`);
      ok(`ID${st.id}: bossPlanets にその惑星が記録される`, !!(Game.state.stats.bossPlanets || {})[st.id]);
    }
  }
  // 図鑑・個体生成
  Game.newGame();
  ok("makeLizard が壊れていない", !!Game.makeLizard("kanahebi", "normal", { hue: 100, sat: 50, light: 50, pattern: "stripe" }, "adult"));
  ok("dexRate が数値を返す", typeof Game.dexRate() === "number");
  // 称号・ミッションを全件評価(例外ゼロ=壊れた項目が無い)
  {
    let bad = [];
    for (const t of TITLES) { try { t.cond(Game.state); } catch (e) { bad.push("title:" + t.id); } }
    for (const m of MISSIONS) { try { m.check(Game.state); } catch (e) { bad.push("mission:" + m.id); } }
    ok("★称号・ミッションを全件評価しても例外ゼロ", bad.length === 0, bad.join(","));
  }
  // allies6 の差し替えが正しく効く
  {
    Game.newGame();
    const title = TITLES.find((t) => t.id === "allies6"), mis = MISSIONS.find((m) => m.id === "allies6");
    ok("称号 allies6 の名前は据置(百獣の盟主)", title.name === "百獣の盟主");
    ok("称号 allies6: 未撃退では未達成", !title.cond(Game.state));
    ok("ミッション allies6: 未撃退では未達成", !mis.check(Game.state));
    Game.state.stats.bossPlanets = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    ok("★ミッション allies6: 5惑星で達成", !!mis.check(Game.state));
    ok("称号 allies6: 5惑星ではまだ未達成(10惑星が条件)", !title.cond(Game.state));
    for (const st of STAGES) Game.state.stats.bossPlanets[st.id] = 1;
    ok("★称号 allies6: 10惑星すべてで達成", !!title.cond(Game.state));
    // 旧セーブ(bossPlanets 未定義)でも落ちない
    delete Game.state.stats.bossPlanets;
    let threw = null; try { title.cond(Game.state); mis.check(Game.state); } catch (e) { threw = e; }
    ok("★旧セーブ(bossPlanets未定義)でも落ちない", !threw, threw && threw.message);
  }
  // セーブ: state.allies は残置され往復する / 版チェーンが生きている
  {
    Game.newGame();
    Game.state.allies = { octopus: { lv: 3 } };
    const w = Game.toWorld();
    ok("★state.allies は残置され toWorld を通る(履歴を消さない)", !!(w.allies && w.allies.octopus && w.allies.octopus.lv === 3));
    Game.applyWorld(JSON.parse(JSON.stringify(w)));
    ok("applyWorld でも復元される", !!(Game.state.allies && Game.state.allies.octopus));
    ok("migrateV13to14 が残っている(版チェーンの連続性)", typeof Game.migrateV13to14 === "function");
    const m = Game.migrateV13to14({ version: 13, allies: { turtle: { lv: 4 } } });
    ok("migrateV13to14 が例外なく動く(旧セーブがv14へ上がれる)", !!m && !!m.allies);
  }
}

console.log("== C) 難度は据置(tier相殺の数値) ==");
{
  const OLD_HP = [1.5, 3.0, 3.4, 3.8, 4.2, 4.6];
  const OLD_ALLY = [1.05, 1.10, 1.14, 1.18, 1.22, 1.26];
  for (let t = 0; t < 6; t++) {
    ok(`T${t + 1}: hpMult = 旧${OLD_HP[t]} ÷ 旧allyScale${OLD_ALLY[t]}`, near(BOSS_TIERS[t].hpMult, OLD_HP[t] / OLD_ALLY[t], 5e-4), "=" + BOSS_TIERS[t].hpMult);
  }
  const B = CFG.bossHpMultByStage;
  ok("ID3 の bossHpMultByStage = 旧1.1 ÷ 1.05", near(B[3], 1.1 / 1.05, 5e-4), "=" + B[3]);
  ok("ID5 の bossHpMultByStage = 旧1.1 ÷ 1.05", near(B[5], 1.1 / 1.05, 5e-4), "=" + B[5]);
  ok("ID10 の bossHpMultByStage = 旧1.15 ÷ 1.05", near(B[10], 1.15 / 1.05, 5e-4), "=" + B[10]);
  ok("arch効果を持たない惑星は据置(ID1/2/4/6/8/9)", B[1] === 1.0 && B[2] === 1.05 && B[4] === 1.05 && B[6] === 1.15 && B[8] === 1.1 && B[9] === 1.1);
  // ID7 は turtle(噛みつき肩代わり)という**非DPS効果**を持ち、HP補正では厳密に相殺できない。
  //   実測(全10惑星×2ランク×50試行)で唯一残った差(旧98%勝利→新0%)を閉じるため 1.1→1.055 へ吸収した。
  ok("ID7 は非DPS効果の残差を吸収して 1.055", near(B[7], 1.055, 1e-9), "=" + B[7]);
}

console.log(`\n=== 味方廃止 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(味方の全資産が不在/戦闘・報酬・図鑑・称号は健在/allies6の差し替え/セーブ残置と版チェーン/tier相殺)");
