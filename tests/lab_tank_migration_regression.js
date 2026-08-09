// V6-P1-2 ④ 恒久テスト: 水槽tierの駆動源を解読済みレシピ数→HQ Lv へ移した際の非退行を監視。
//   証明: 移行前後で「どのプレイヤーの水槽tierも下がらない」。
//    解読数(0〜6)×ランク(1〜100)を広く振った仮想セーブで全数検証する。
import fs from "node:fs";
import vm from "node:vm";
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
const store = {};
const sb = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} },
  document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
  UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(f, "utf8") + "\n;\n";
code += "globalThis.__t = { Game, CFG };\n";
vm.runInContext(code, sb, { filename: "c.js" });
const { Game, CFG } = sb.__t;

const OLD_TH = [1, 3, 5];
const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
const oldTier = (decoded) => tierOf(decoded, OLD_TH);
const newTier = (rank, floor) => Math.max(floor || 1, tierOf(rank, CFG.labTankTiers));

console.log(`## しきい値: 旧=解読${JSON.stringify(OLD_TH)} / 新=HQ Lv${JSON.stringify(CFG.labTankTiers)}`);
let down = 0, same = 0, up = 0, n = 0, refundOk = 0;
const downCases = [];
for (let decoded = 0; decoded <= 6; decoded++) {
  for (let rank = 1; rank <= 100; rank++) {
    n++;
    const research = {};
    for (let o = 1; o <= decoded; o++) research["recipe" + o] = true;
    // 仮想セーブ(移行前)
    let w = { version: 15, headquarters: { rank, rankXp: 0, research: Object.assign({}, research) } };
    const before = oldTier(decoded);
    // 実エンジンの移行を順に通す(floor → 払い戻し。順序が逆だと解読フラグが消えて floor が壊れる)
    w = Game.migrateLabTankFloor(w);
    w = Game.migrateRecipeRefund(w);
    const after = newTier(rank, w.headquarters.labTankFloorV1);
    if (after < before) { down++; if (downCases.length < 5) downCases.push(`decoded=${decoded} rank=${rank} ${before}→${after}`); }
    else if (after === before) same++; else up++;
    // 払い戻しが解読数どおりに出ているか(floorが先に走っても払い戻しが壊れない)
    if (decoded === 0 ? !w._refundRecipe : (w._refundRecipe && w._refundRecipe.n === decoded)) refundOk++;
    // 冪等: 2度通しても floor は動かない
    const f1 = w.headquarters.labTankFloorV1;
    Game.migrateLabTankFloor(w); Game.migrateRecipeRefund(w);
    if (w.headquarters.labTankFloorV1 !== f1) { console.log("冪等でない!", decoded, rank); process.exit(1); }
  }
}
console.log(`\n## 全数検証(${n}通り = 解読0〜6 × ランク1〜100)`);
console.log(`  ★tierが下がったケース: ${down} 件 ${down ? downCases.join(" / ") : "(ゼロ)"}`);
console.log(`  据置: ${same} 件 / 上がった: ${up} 件`);
console.log(`  払い戻しが解読数どおり: ${refundOk}/${n}`);
console.log(`  移行の冪等性: 全ケースでOK`);
console.log(down === 0 && refundOk === n ? "\n★証明: どのプレイヤーの水槽tierも下がらない / 払い戻しは floor 移行の後でも正しい" : "\n!! 反例あり");

// ★実付与の検査。本番実証で「トーストは出るのに資源が返らない」欠陥を検出したため恒久化する。
//   集計(_refundRecipe)が出来ているだけでは不十分で、load() を通した後に**実際に増えている**ことを見る。
console.log("\n## 払い戻しの実付与(load経路)");
let grantNg = 0;
for (const decoded of [0, 3, 6]) {
  Game.newGame();
  const w = Game.toWorld();
  w.headquarters = w.headquarters || {};
  w.headquarters.research = {};
  for (let o = 1; o <= decoded; o++) w.headquarters.research["recipe" + o] = true;
  delete w.headquarters.recipeRefundV1; delete w.headquarters.labTankFloorV1;
  sb.localStorage.setItem(CFG.saveKey, JSON.stringify(w));
  Game.state = null;
  Game.load();
  const want = Game.RECIPE_REFUND.slice(0, decoded).reduce((a, r) => ({ sci: a.sci + r.science, coins: a.coins + r.coins, stones: a.stones + r.stones }), { sci: 0, coins: 0, stones: 0 });
  const ok = Game.res("science") >= want.sci && Game.stones() >= want.stones && Game.state.coins >= want.coins;
  if (!ok) { grantNg++; console.log(`  ✘ decoded=${decoded}: 期待 sci>=${want.sci}/石>=${want.stones}/G>=${want.coins} / 実際 sci=${Game.res("science")}/石=${Game.stones()}/G=${Math.floor(Game.state.coins)}`); }
  else console.log(`  ✔ decoded=${decoded}: 研究力+${want.sci} / ${want.coins.toLocaleString()}G / 石+${want.stones} が実際に増えた`);
}
console.log(grantNg === 0 ? "★払い戻しは実際に資源へ反映される(集計だけで終わらない)" : "!! 付与されていない");
if (grantNg) process.exit(1);
process.exit(down === 0 && refundOk === n ? 0 : 1);
