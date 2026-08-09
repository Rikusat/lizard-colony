"use strict";
// ============================================================
// 描画の非有限ガード 回帰テスト(恒久・2026-08-10 Ric裁定)
//   Canvas2D の createRadialGradient/arc/ellipse 等は NaN/Infinity で TypeError を投げ、
//   **そのフレームの描画が丸ごと止まる**(画面停止=β公開で最悪の体験)。
//   計算値を渡す箇所は71ヶ所あるため、各所ではなく **ctx を一度包む** 方式で塞いだ。
//   本テストは「非有限を渡しても落ちない」ことと「有効値は素通しされる」ことの両方を見る。
// 実行: node tests/draw_guard_regression.js
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
const store = {};
const sb = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} },
  document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
  UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false } };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
code += "globalThis.__t = { Game, Render, CFG };\n";
vm.runInContext(code, sb, { filename: "combined.js" });
const { Game, Render } = sb.__t;
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// 本物の Canvas2D と同じく「非有限で投げる」スタブ(投げないスタブでは検査にならない=偽の安全)
function realisticCtx(log) {
  const chk = (name, args) => {
    for (const v of args) if (typeof v === "number" && !Number.isFinite(v)) {
      throw new TypeError(`Failed to execute '${name}': The provided double value is non-finite.`);
    }
    if (log) log.push(name);
  };
  const ctx = {};
  for (const name of ["arc", "ellipse", "arcTo", "rect", "roundRect", "fillRect", "strokeRect", "clearRect",
    "beginPath", "closePath", "moveTo", "lineTo", "stroke", "fill", "save", "restore", "translate", "scale", "rotate",
    "quadraticCurveTo", "bezierCurveTo", "setLineDash", "clip", "fillText", "drawImage"]) {
    ctx[name] = function () { chk(name, arguments); };
  }
  ctx.measureText = () => ({ width: 10 });
  for (const name of ["createRadialGradient", "createLinearGradient"]) {
    ctx[name] = function () { chk(name, arguments); return { addColorStop() {} }; };
  }
  for (const k of ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "shadowColor", "shadowBlur", "filter", "lineDashOffset", "lineCap", "lineJoin"]) ctx[k] = null;
  return ctx;
}

console.log("== ★カナリア: 素のctxは本当に非有限で投げるのか(投げないなら検査が無意味) ==");
{
  const raw = realisticCtx();
  let threw = false;
  try { raw.createRadialGradient(NaN, 0, 1, 0, 0, 2); } catch (e) { threw = true; }
  ok("★カナリア: ガード無しの ctx は NaN で TypeError を投げる", threw);
  let threw2 = false;
  try { raw.arc(0, NaN, 5, 0, 7); } catch (e) { threw2 = true; }
  ok("★カナリア: arc も NaN で投げる", threw2);
}

console.log("== ガード適用後は落ちない ==");
{
  const g = Render.guardCtx(realisticCtx());
  const cases = [
    ["createRadialGradient(NaN)", () => g.createRadialGradient(NaN, 0, 1, 0, 0, 2)],
    ["createLinearGradient(Infinity)", () => g.createLinearGradient(0, Infinity, 10, 0)],
    ["arc(NaN)", () => g.arc(0, NaN, 5, 0, 7)],
    ["ellipse(NaN半径)", () => g.ellipse(10, 10, NaN, 5, 0, 0, 7)],
    ["fillRect(-Infinity)", () => g.fillRect(0, 0, -Infinity, 10)],
    ["roundRect(NaN)", () => g.roundRect(NaN, 0, 10, 10, 3)],
  ];
  for (const [name, fn] of cases) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    ok(`ガード後: ${name} で落ちない`, !threw, threw && threw.message);
  }
  const grad = g.createRadialGradient(NaN, 0, 1, 0, 0, 2);
  ok("非有限のグラデーションは無害な代替を返す(addColorStopできる)", grad && typeof grad.addColorStop === "function");
  let threw3 = null;
  try { grad.addColorStop(0, "#fff"); } catch (e) { threw3 = e; }
  ok("代替グラデーションに addColorStop しても落ちない", !threw3);
}

console.log("== 有効値は素通し(ガードが正常な描画を殺していない) ==");
{
  const log = [];
  const g = Render.guardCtx(realisticCtx(log));
  g.arc(10, 20, 5, 0, 7);
  g.arc(10, 20, 5, 0, 7, true);            // anticlockwise=boolean を誤って弾かないこと
  g.ellipse(1, 2, 3, 4, 0, 0, 7);
  g.createRadialGradient(0, 0, 1, 0, 0, 9);
  g.fillRect(0, 0, 10, 10);
  ok("有効値の arc/ellipse/gradient/fillRect は素通しされる", log.length === 5, "実行=" + log.join(","));
  ok("boolean 引数(anticlockwise)を弾かない", log.filter((x) => x === "arc").length === 2);
}

console.log("== drawGenesisFx: 座標が壊れた個体でも落ちない(実際に検出した経路) ==");
{
  Game.newGame();
  Render.time = 1;
  // 座標を持たない個体で創世した状況を再現(makeLizard は x/y を持たない)
  Game._genesisFx = [{ x: undefined, y: undefined, t: 1.5, max: 1.5, k: 1 }, { x: NaN, y: 10, t: 1, max: 1.5 }, { x: 100, y: 100, t: 1, max: 1.5 }];
  const g = realisticCtx();                 // ★あえて素のctx(ガード無し)で drawGenesisFx 自身の防御を見る
  let threw = null;
  try { Render.drawGenesisFx(g); } catch (e) { threw = e; }
  ok("★座標が非有限の創世エフェクトがあっても drawGenesisFx が落ちない", !threw, threw && threw.message);
  // 有効なエントリは描かれている(飛ばしすぎていない)
  const log = [];
  Game._genesisFx = [{ x: 100, y: 100, t: 1, max: 1.5 }];
  let threw2 = null;
  try { Render.drawGenesisFx(realisticCtx(log)); } catch (e) { threw2 = e; }
  ok("有効な創世エフェクトは従来どおり描かれる", !threw2 && log.length > 0, (threw2 && threw2.message) || ("cmds=" + log.length));
}

console.log("== 配線: init が実際にガードを掛けている(関数があるだけでは意味がない) ==");
{
  // ★カナリアが落ちなかった経験から追加: guardCtx が正しくても init から呼ばれていなければ本番は無防備。
  //   「動く部品がある」ことと「配線されている」ことは別物なので、ソースで配線そのものを固定する。
  const src = fs.readFileSync(path.join(ROOT, "js/render.js"), "utf8");
  ok("★Render.init が guardCtx を呼んでいる", /init\(\)\s*\{[\s\S]{0,200}?this\.guardCtx\(this\.ctx\)/.test(src));
  ok("guardCtx は二重適用しない(__finGuard で冪等)", /__finGuard/.test(src));
  const g = realisticCtx();
  Render.guardCtx(g); Render.guardCtx(g);   // 2回掛けても壊れない
  let threw = null;
  try { g.arc(0, NaN, 1, 0, 7); g.arc(1, 2, 3, 0, 7); } catch (e) { threw = e; }
  ok("二重適用しても落ちない・有効値も通る", !threw, threw && threw.message);
}

console.log(`\n=== 描画ガード 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(非有限で落ちない/有効値は素通し/drawGenesisFxの実経路)");
