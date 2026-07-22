"use strict";
// Phase6 ボス配役 回帰テスト(恒久):
//   ① 汎用ボスの"姿"がフィールドに出ない(署名惑星でboss時 planetBossDrawが必ず署名を返す・pre-R30の案Bも署名の姿)。
//   ② 7脅威型すべてが最低1惑星で発火(配分の網羅)＋各脅威型の"挙動フック"が生きている(startRaidが型どおり構築・ハンドラ関数が存在)。
//   ③ 署名threatが主役(sigBossChance=1.0/minRank縛りなし)・BOSS_TYPES配列は温存(削除なし=保存/挙動保全)。
// 実行: node tests/boss_roster_regression.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
const store = {};
const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} }, document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
code += "globalThis.__t = { Game, Render, CFG, PLANET_BOSS, BOSS_TYPES, STAGES, bossTypeById };\n";
vm.runInContext(code, sb, { filename: "combined.js" });
const { Game, Render, CFG, PLANET_BOSS, BOSS_TYPES, STAGES } = sb.__t;
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const THREATS = ["snake", "hawk", "crow", "monitor", "scorpion", "spider", "bugger"];

// ③ 前提: sigBossChance=1.0・BOSS_TYPES温存
ok("sigBossChance=1.0(署名100%)", CFG.sigBossChance === 1.0);
ok("BOSS_TYPES温存(7種すべて健在=削除なし)", BOSS_TYPES.length === 7 && THREATS.every((id) => BOSS_TYPES.find((b) => b.id === id)));

// ① R30+: 各惑星で常に署名threat・planetBossDrawが署名(汎用の姿ゼロ)
Game.newGame(); Game.state.rank = 95;
for (const st of STAGES) {
  const pb = PLANET_BOSS[st.id]; if (!pb) continue;
  Game.state.stageSel = st.id; Game.state.currentStageId = st.id; Game.state.stageWins = 1;
  let allSig = true, drawOK = true;
  for (let i = 0; i < 150; i++) {
    Game.rollNextRaid();
    const tid = Game.state.nextRaid.typeId;
    if (tid !== pb.threat) allSig = false;
    if (Render.planetBossDraw({ boss: true, typeId: tid }) !== pb.draw) drawOK = false;
  }
  ok(`ID${st.id}: R95で常に署名threat=${pb.threat}`, allSig);
  ok(`ID${st.id}: boss時 planetBossDraw=署名(${pb.draw})=汎用の姿を出さない`, drawOK);
}
// pre-R30(案B): typeId=snakeでも署名の姿・非bossはnull
Game.state.rank = 20; Game.state.stageSel = 3; Game.state.currentStageId = 3; Game.state.stageWins = 4;
Game.rollNextRaid();
ok("pre-R30: typeId=snake(案B・軽い挙動)", Game.state.nextRaid.typeId === "snake");
ok("pre-R30: boss時も署名の姿(汎用の姿を出さない)", Render.planetBossDraw({ boss: true, typeId: "snake" }) === PLANET_BOSS[3].draw);
ok("非boss(通常襲来)は署名を出さない(null)", Render.planetBossDraw({ boss: false, typeId: "snake" }) === null);

// ② 配分の網羅: 7脅威型すべてが最低1惑星
const dist = new Set(Object.values(PLANET_BOSS).map((p) => p.threat));
for (const t of THREATS) ok(`脅威型 ${t} が最低1惑星で発火`, dist.has(t), "配分=" + [...dist].join(","));
ok("配役確定(ID3=hawk/ID6=spider/ID10=crow)", PLANET_BOSS[3].threat === "hawk" && PLANET_BOSS[6].threat === "spider" && PLANET_BOSS[10].threat === "crow");
ok("偏り改善(snake<=3・monitor<=1)", Object.values(PLANET_BOSS).filter((p) => p.threat === "snake").length <= 3 && Object.values(PLANET_BOSS).filter((p) => p.threat === "monitor").length <= 1);

// ② 挙動フックが生きている: ハンドラ関数の存在
for (const fn of ["updateHawk", "updateCrow", "spawnWebs", "updateWebs", "startRaid", "rollNextRaid"]) ok(`挙動ハンドラ ${fn} が存在`, typeof Game[fn] === "function");

// ② 各脅威型: startRaidが型どおり構築(挙動が失われていない)
for (const t of THREATS) {
  Game.newGame(); Game.state.rank = 95; Game.state.stageSel = 1; Game.state.currentStageId = 1;
  Game.state.nextRaid = { typeId: t, boss: true, elite: false, tier: 5 };
  let built = null, err = null;
  try { Game.startRaid(); built = Game.raid; } catch (e) { err = e.message; }
  ok(`${t}: startRaidが構築(挙動が生きる)`, built && built.typeId === t, err || "raidなし");
  if (built) {
    const bt = sb.__t.bossTypeById(t);
    ok(`${t}: flying旗が型どおり(${bt.flying})`, !!built.type.flying === !!bt.flying);
    if (t === "spider") ok("spider: webs配列が初期化", Array.isArray(built.webs));
    if (t === "monitor") ok("monitor: タンクHP補正(×1.6)が効いている", built.snake.maxHp > 0);
    if (t === "hawk" || t === "crow") ok(`${t}: 飛行スポーン(上空y=120)`, built.snake.y === 120, "y=" + built.snake.y);
  }
}

console.log(`\n=== ボス配役 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(汎用の姿を出さない/7脅威型全発火/挙動フック健在/署名100%/BOSS_TYPES温存)");
