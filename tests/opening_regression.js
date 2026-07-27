"use strict";
// ============================================================
// オープニング(V5C C1) 回帰テスト
// 実行: node tests/opening_regression.js  (repoルートから)
//
// 仕様書§3-1の禁止事項3点は「判定以前の失格条件」。人の目でなくコードで守る。
//  1) 線画表現の禁止: stroke/strokeStyle/lineWidth を使わない(塗りの塊のみ)
//  2) 陰影グラデ・光彩ぼかしの禁止: createLinearGradient/createRadialGradient/shadowBlur/filter を使わない
//  3) 主役の不在の禁止: 主役(トカゲ)の描画があり、頭部が画面高の相当割合を占める
//  4) 決定論(§1): Math.random を使わない(ハッシュ+時刻の純関数)
//  5) 本編非干渉(§5): 本編の状態・セーブ・確率に触れない(Game/Slit/Roulette への書き込みがない)
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/screens/opening.js"), "utf8");
// コメントを除いたコード本体で判定する(コメント内の禁止語は説明であり違反ではない)
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}

console.log("== 1) 線画表現の禁止(塗りの塊のみで構成) ==");
{
  const hits = (CODE.match(/\.stroke\s*\(|strokeStyle|lineWidth|setLineDash/g) || []);
  check("stroke/strokeStyle/lineWidth を使っていない", hits.length === 0, `検出: ${[...new Set(hits)].join(",")}`);
}
console.log("== 2) 陰影グラデーション・光彩ぼかしの禁止 ==");
{
  const hits = (CODE.match(/createLinearGradient|createRadialGradient|createConicGradient|shadowBlur|shadowColor|ctx\.filter/g) || []);
  check("グラデーション/影ぼかし/filter を使っていない", hits.length === 0, `検出: ${[...new Set(hits)].join(",")}`);
}
console.log("== 3) 決定論(乱数不使用) ==");
{
  check("Math.random を使っていない", !/Math\.random/.test(CODE));
  check("決定論ハッシュ h() を備える", /\bh\s*\(a,\s*b\)/.test(CODE) || /h\(a, b\)/.test(SRC));
}
console.log("== 4) 本編非干渉(状態・セーブ・確率に触れない) ==");
{
  const bad = (CODE.match(/Game\.[A-Za-z_]+\s*=|Game\.state|Slit\.|Roulette\.|localStorage|toWorld|applyWorld|addStone|spawn/g) || []);
  check("Game/Slit/Roulette/localStorage に触れていない", bad.length === 0, `検出: ${[...new Set(bad)].join(",")}`);
}
console.log("== 5) 主役が居る(描画の実行検証) ==");
{
  // 最小のCanvas 2Dスタブで実際に描かせ、「主役の描画が呼ばれ、頭部が画面高の相当割合を占める」ことを測る。
  const calls = [];
  let cur = null;
  const mkCtx = () => ({
    fillStyle: "", globalAlpha: 1, font: "", textAlign: "",
    beginPath() { cur = { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity }; },
    moveTo(x, y) { this._p(x, y); }, lineTo(x, y) { this._p(x, y); },
    _p(x, y) { if (!cur) return; cur.minY = Math.min(cur.minY, y); cur.maxY = Math.max(cur.maxY, y); cur.minX = Math.min(cur.minX, x); cur.maxX = Math.max(cur.maxX, x); },
    arc(x, y, r) { this._p(x - r, y - r); this._p(x + r, y + r); },
    closePath() {}, clip() {}, save() {}, restore() {},
    fill() { if (cur) calls.push({ ...cur, col: this.fillStyle }); cur = null; },
    fillRect(x, y, w, h) { calls.push({ minX: x, maxX: x + w, minY: y, maxY: y + h, col: this.fillStyle }); },
    clearRect() {}, fillText() {}, createPattern: () => "pattern",
  });
  const sandbox = { console, Math, module: {}, document: { createElement: () => ({ getContext: mkCtx, width: 0, height: 0 }) } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "opening.js" });
  vm.runInContext("globalThis.__op = Opening;", sandbox); // constはsandboxのプロパティにならないため明示的に取り出す
  const Opening = sandbox.__op;
  check("Opening モジュールが読み込める", !!Opening && typeof Opening.drawCut2 === "function");

  const W = 640, H = 360;
  for (const style of ["dither", "poly", "silhouette"]) {
    calls.length = 0;
    Opening.drawCut2(mkCtx(), W, H, 0.5, style);
    check(`${style}: 描画が実行される`, calls.length > 20, `n=${calls.length}`);
    // 主役の頭部=最大面積の塗り(枠・空を除く)。画面高に対する高さの割合を測る
    const inner = calls.filter((c) => c.maxX - c.minX < W * 0.98 && c.maxY - c.minY < H * 0.98 && isFinite(c.minY));
    let best = null;
    for (const c of inner) { const a = (c.maxX - c.minX) * (c.maxY - c.minY); if (!best || a > best.a) best = { a, c }; }
    const frac = best ? (best.c.maxY - best.c.minY) / H : 0;
    check(`${style}: 主役の塊が画面高の45%以上を占める(主役の不在=失格の防止)`, frac >= 0.45, `実測 ${(frac * 100).toFixed(0)}%`);
  }
  // 決定論: 同じ u なら完全に同じ描画列
  const sig = (u) => { calls.length = 0; Opening.drawCut2(mkCtx(), W, H, u, "dither"); return calls.map((c) => `${c.col}:${c.minX.toFixed(2)},${c.minY.toFixed(2)}`).join("|"); };
  check("同じ u なら完全に同じ画(決定論)", sig(0.37) === sig(0.37));
  check("u が違えば画も違う(アニメーションしている)", sig(0.20) !== sig(0.80));
}

console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 仕様書§3-1の失格条件、または決定論/非干渉が破れている。"); }
else console.log("→ 線を引かず・グラデを使わず・主役が居る。決定論と本編非干渉も維持。");
