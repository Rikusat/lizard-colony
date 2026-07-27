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
console.log("== 5) 主役が居る/層が3段以上/手前ほど暗い(描画の実行検証) ==");
{
  // 最小のCanvas 2Dスタブで実際に描かせ、切り絵の原則が守られているかを測る。
  let calls = [], cur = null;
  const mkCtx = () => ({
    fillStyle: "", globalAlpha: 1, font: "", textAlign: "",
    beginPath() { cur = { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity }; },
    moveTo(x, y) { this._p(x, y); }, lineTo(x, y) { this._p(x, y); },
    _p(x, y) { if (!cur) return; cur.minY = Math.min(cur.minY, y); cur.maxY = Math.max(cur.maxY, y); cur.minX = Math.min(cur.minX, x); cur.maxX = Math.max(cur.maxX, x); },
    arc(x, y, r) { this._p(x - r, y - r); this._p(x + r, y + r); },
    closePath() {}, clip() {}, save() {}, restore() {},
    fill() { if (cur) calls.push(Object.assign({ col: this.fillStyle }, cur)); cur = null; },
    fillRect(x, y, w, h) { calls.push({ minX: x, maxX: x + w, minY: y, maxY: y + h, col: this.fillStyle }); },
    clearRect() {}, fillText() {}, createPattern: () => "pattern",
  });
  const sandbox = { console, Math, module: {}, performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
  sandbox.globalThis = sandbox; sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8"), sandbox, { filename: "data.js" });
  vm.runInContext(SRC, sandbox, { filename: "opening.js" });
  vm.runInContext("globalThis.__op = Opening; globalThis.__cfg = CFG;", sandbox);
  const Opening = sandbox.__op, CFG = sandbox.__cfg;
  check("Opening モジュールが読み込める", !!Opening && typeof Opening.drawAt === "function");

  const lum = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c || ""); if (!m) return null; const v = parseInt(m[1], 16); return ((v >> 16 & 255) * 0.3 + (v >> 8 & 255) * 0.59 + (v & 255) * 0.11); };
  const W = 960, H = 540, D = Opening.durs();
  check(`尺は6カット・計${Opening.total().toFixed(1)}秒(仕様=10秒前後±2)`, D.length === 6 && Opening.total() >= 8 && Opening.total() <= 12, `${Opening.total()}`);

  let acc = 0;
  for (let c = 0; c < 6; c++) {
    const t = acc + D[c] * 0.5; acc += D[c];
    calls = [];
    Opening.drawAt(mkCtx(), W, H, t);
    check(`cut${c + 1}: 描画が実行される`, calls.length > 8, `n=${calls.length}`);
    const inner = calls.filter((x) => isFinite(x.minY) && (x.maxX - x.minX) < W * 0.98);
    let best = null;
    for (const x of inner) { const a = (x.maxX - x.minX) * (x.maxY - x.minY); if (!best || a > best.a) best = { a, x }; }
    const frac = best ? (best.x.maxY - best.x.minY) / H : 0;
    check(`cut${c + 1}: 主役の塊が画面高の45%以上(主役の不在=失格の防止)`, frac >= 0.45, `実測 ${(frac * 100).toFixed(0)}%`);
    const cols = [...new Set(calls.map((x) => x.col).filter((x) => typeof x === "string" && x[0] === "#"))];
    check(`cut${c + 1}: 層が3段以上(異なるベタ色 ${cols.length}種)`, cols.length >= 3);
    const P = Opening.pal(c), fgL = lum(P[3]), bgL = lum(P[0]);
    check(`cut${c + 1}: 前景(${P[3]})が背景(${P[0]})より暗い`, fgL !== null && bgL !== null && fgL < bgL, `${fgL} < ${bgL}`);
    check(`cut${c + 1}: パレットは3〜5色`, P.length >= 3 && P.length <= 5, `${P.length}色`);
  }
  const sig = (t) => { calls = []; Opening.drawAt(mkCtx(), W, H, t); return calls.map((x) => `${x.col}:${x.minX.toFixed(2)},${x.minY.toFixed(2)}`).join("|"); };
  check("同じ t なら完全に同じ画(決定論)", sig(3.7) === sig(3.7));
  check("t が違えば画も違う(アニメーションしている)", sig(1.0) !== sig(7.0));

  const cv = { width: W, height: H, getContext: mkCtx, addEventListener() {}, removeEventListener() {} };
  let ended = null;
  const stR = Opening.play(cv, { reduced: true, bind: false, onEnd: (s) => { ended = s; } });
  check("reduced-motion: 即座に完了し最終画を静止表示(rAFを回さない)", stR.done === true && !!ended && ended.skipped === false);
  ended = null;
  const stS = Opening.play(cv, { reduced: false, bind: false, now: () => 0, onEnd: (s) => { ended = s; } });
  stS.skip();
  check("スキップ: 即時中断(確認を挟まない)+最終画を残す", stS.done === true && stS.skipped === true && !!ended);
  const store = {};
  check("再生済みフラグ: 既定は未再生", Opening.isPlayed(store) === false);
  Opening.markPlayed(store);
  check("再生済みフラグ: markPlayed で単調追加(既存キーを壊さない)", Opening.isPlayed(store) === true && Object.keys(store).length === 1);
  check("再生済みフラグ: CFGで自動再生を無効にできる(本編組込はRic判定後)", CFG.openingAutoPlay === false);
}
console.log("\n============================================");
console.log(`結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { process.exitCode = 1; console.log("→ 仕様書§3-1の失格条件、または決定論/非干渉が破れている。"); }
else console.log("→ 線を引かず・グラデを使わず・主役が居る。決定論と本編非干渉も維持。");
