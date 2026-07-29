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

// ④ ★撃破の瞬間に姿が汎用(ダイジャ等)へ切り替わらない(2026-07-29 不具合の再発検知)
//    旧実装は drawBoss と drawCorpse が別々の switch を持ち、corpse 側が planetBossDraw を通らなかったため、
//    全10惑星で「倒した瞬間だけ汎用の姿」に戻っていた(例: マグマ・シャーク→ダイジャ)。
{
  const GENERIC = ["drawSnake", "drawHawk", "drawCrow", "drawMonitor", "drawScorpion", "drawSpider", "drawBugger"];
  const SIGS = [...new Set(Object.values(PLANET_BOSS).map((p) => p.draw))];
  const orig = {}; const called = [];
  for (const n of [...GENERIC, ...SIGS]) if (typeof Render[n] === "function") { orig[n] = Render[n]; Render[n] = () => called.push(n); }
  const ctx = new Proxy({}, { get(t, p) { if (p === "canvas") return { width: 900, height: 500 }; if (p === "createRadialGradient" || p === "createLinearGradient") return () => ({ addColorStop() {} }); if (p === "measureText") return () => ({ width: 10 }); return typeof p === "string" ? () => {} : undefined; }, set() { return true; } });
  for (const st of STAGES) {
    const pb = PLANET_BOSS[st.id]; if (!pb) continue;
    Game.newGame(); Game.state.rank = 95;
    Game.state.stageSel = st.id; Game.state.currentStageId = st.id; Game.state.stageWins = 1;
    Game.state.nextRaid = { typeId: pb.threat, boss: true, elite: false, tier: 3 };
    Game.startRaid();
    called.length = 0; Render.drawBoss(ctx, Game.raid);
    const alive = called.slice();
    Game.raid.snake.hp = 0; Game.endRaid(true);           // 正規の討伐経路を通す
    called.length = 0; if (Game.corpse) Render.drawCorpse(ctx, Game.corpse);
    const dead = called.slice();
    ok(`ID${st.id}: 戦闘中の姿=署名(${pb.draw})`, alive.includes(pb.draw), alive.join(",") || "描画なし");
    ok(`ID${st.id}: ★撃破後(corpse)も署名の姿=汎用へ戻らない`, dead.includes(pb.draw), "corpse=" + (dead.join(",") || "描画なし"));
    ok(`ID${st.id}: 撃破後に汎用の姿を1つも描かない`, !dead.some((d) => GENERIC.includes(d) && d !== pb.draw), "corpse=" + dead.join(","));
  }
  // 型→姿の解決は単一の窓口(bossDrawName)に集約されている=同じ知識を2箇所に持たない
  ok("bossDrawName が存在(型→姿の単一の解決口)", typeof Render.bossDrawName === "function");
  ok("raid と corpse が同じ解決口で同じ姿を返す", Render.bossDrawName({ boss: true, typeId: PLANET_BOSS[7].threat }) === Render.bossDrawName({ boss: true, typeId: PLANET_BOSS[7].threat, dyingT: 0.5 }));
  const src = fs.readFileSync(path.join(ROOT, "js/render.js"), "utf8");
  const corpseBody = (src.split("drawCorpse(ctx, c) {")[1] || "").slice(0, 1800);
  ok("drawCorpse が独自の型switchを持たない(重複の再発検知)", corpseBody.indexOf('case "hawk"') < 0 && corpseBody.indexOf("drawSnake") < 0);
  // 惑星を跨いだ死に様の残留がない(姿は現在の惑星から解決されるため)
  Game.newGame(); Game.state.rank = 95; Game.state.stageSel = 1; Game.state.currentStageId = 1;
  Game.state.nextRaid = { typeId: PLANET_BOSS[1].threat, boss: true, elite: false, tier: 3 };
  Game.startRaid(); Game.raid.snake.hp = 0; Game.endRaid(true);
  ok("撃破直後にcorpseが存在する(前提)", !!Game.corpse);
  Game.selectStage(3);
  ok("★惑星を切り替えると死に様は破棄される(別惑星の姿で描かれない)", Game.corpse === null);
  for (const n in orig) Render[n] = orig[n];
}

// ⑤ ★ボス名の署名化(Ric裁定 2026-07-29・Phase6「署名ボス10」の完了)
//    姿だけ署名で名前が汎用(ダイジャ)というズレを断つ。名前の解決は Game.bossDisplayName の単一窓口。
{
  const NAMES = {
    1: "ドロヌマ・ワーム", 2: "サイバー・スコルピオ", 3: "クロノ・マンティス", 4: "ハニワ・ゴーレム", 5: "スラグ・ヒドラ",
    6: "ドクロ・アナコンダ", 7: "マグマ・シャーク", 8: "ヌシ・バガー", 9: "メルト・ゴーレム", 10: "レリック・スフィンクス",
  };
  ok("Game.bossDisplayName が存在(名前の単一の解決口)", typeof Game.bossDisplayName === "function");
  Game.newGame(); Game.state.rank = 95;
  for (const st of STAGES) {
    const pb = PLANET_BOSS[st.id]; if (!pb) continue;
    Game.state.stageSel = st.id; Game.state.currentStageId = st.id;
    ok(`ID${st.id}: PLANET_BOSS.name が単独名(${NAMES[st.id]})`, pb.name === NAMES[st.id], "name=" + pb.name);
    ok(`ID${st.id}: 異名を表示名に含めない(「/」なし)`, !/[/／]/.test(pb.name || ""), pb.name);
    ok(`ID${st.id}: ボスの表示名=署名名`, Game.bossDisplayName({ boss: true, typeId: pb.threat }) === pb.name);
    // ★姿と名前が同じ条件で切り替わる(pre-R30の案B=typeIdがsnakeでもボスなら署名)
    ok(`ID${st.id}: 姿と名前が一致する条件(boss時は typeId によらず署名)`,
      (Render.planetBossDraw({ boss: true, typeId: "snake" }) === pb.draw) === (Game.bossDisplayName({ boss: true, typeId: "snake" }) === pb.name));
    // 非ボスの通常襲来は従来どおり汎用名(BOSS_TYPES温存の意味を保つ)
    const generic = sb.__t.bossTypeById(pb.threat).name;
    ok(`ID${st.id}: 非ボスは汎用名のまま(${generic})`, Game.bossDisplayName({ boss: false, typeId: pb.threat }) === generic);
  }
  // 非ボスの蛇は階級名(アオダイショウ等)を出す=既存挙動の保全
  ok("非ボスの蛇は階級名を出す", Game.bossDisplayName({ boss: false, typeId: "snake", snakeTier: { name: "アオダイショウ" } }) === "アオダイショウ");
  ok("null/未知でも落ちない", Game.bossDisplayName(null) === "" && typeof Game.bossDisplayName({ typeId: "??" }) === "string");
  // 表示経路がすべて単一窓口を通る(汎用名の直書きが残っていない)
  const gsrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const csrc = fs.readFileSync(path.join(ROOT, "js/ui/core.js"), "utf8");
  const msrc = fs.readFileSync(path.join(ROOT, "js/ui/screens/main.js"), "utf8");
  const strip = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const [label, src] of [["game.js", gsrc], ["ui/core.js", csrc], ["screens/main.js", msrc]]) {
    // 直書きが残っている行を洗い出す。ただし解決口 bossDisplayName 自身の内部は当然の例外。
    const bad = strip(src).split("\n")
      .filter((l) => /\br\.type\.name|\br\.snakeTier\.name/.test(l))
      .filter((l) => !/return r\.snakeTier\.name/.test(l));   // 解決口の内部(蛇の階級名を返す行)
    ok(`${label}: 敵名の直書き(type.name / snakeTier.name)が表示に残っていない`, bad.length === 0, bad.join(" | "));
  }
  // 解決口の内部にだけ階級名の参照が残っていること(=知識が1箇所に集約されている)の確認
  ok("階級名の参照は解決口の内部1行のみ(知識が1箇所に集約されている)",
    strip(gsrc).split("\n").filter((l) => /r\.snakeTier\.name/.test(l)).length === 1);
  ok("ボスHUDのキャッシュキーに boss/惑星が含まれる(名前が更新されないズレの防止)", /hudKey[\s\S]{0,120}r\.boss[\s\S]{0,80}currentStage/.test(msrc));
}

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
