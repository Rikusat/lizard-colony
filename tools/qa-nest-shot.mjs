// =============================================================
// qa-nest-shot — 巣ビジュアルの実寸シュートゲート(V6-P2-2 B3・§5x-OPS ⑮)
//
// 何をするか: test-nest-b3.html(**実コード経路そのまま**=buildNest+layoutStage の DOM+canvas)を
//   参照コンテンツ領域と同じ 1460×884 でスクショし、node側でPNGを解読して環状帯統計を計算、
//   docs/nest_visual_thresholds.js の参照実測値と比較する(乖離で exit 1)。
//   canvas内ゲート(test-nest-cut.html)が測れないDOM要素(ノードのメダリオン等)をここで測る。
//   B5でこの方式を全画面へ拡張する。
// 実行: node tools/qa-nest-shot.mjs
// =============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = new Function(fs.readFileSync(path.join(ROOT, "docs/nest_visual_thresholds.js"), "utf8") + "; return NEST_VIS_THRESHOLDS;")();

// ---- スクショ取得(qa-cdp を子プロセスで流用=手順の単一の真実) ----
const tmp = path.join(os.tmpdir(), "nest-b3-shot.png");
// ★B4: 再現側のサンプル幾何はコア相対(B2教訓の徹底)。実コア位置とパネルbboxはページから実測して受け取る。
const EVAL = "(()=>{const st=document.getElementById('nest-stage').getBoundingClientRect();" +
  "const sd=document.getElementById('nest-side').getBoundingClientRect();" +
  "return JSON.stringify({core:[Math.round(st.left+st.width*NEST_VIS.core.x),Math.round(st.top+st.height*NEST_VIS.core.y)]," +
  "side:[Math.round(sd.left),Math.round(sd.top),Math.round(sd.width),Math.round(sd.height)]})})()";
const r = spawnSync("node", [path.join(ROOT, "tools/qa-cdp.mjs"), "/test-nest-b3.html",
  "--wait-title", "b3 ready", "--timeout", "30000", "--size", "1460x884", "--eval", EVAL, "--shot", tmp], { encoding: "utf8" });
let meta = null;
try { meta = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch (e) { /* 下で検査 */ }
if (!meta || meta.title !== "b3 ready") { console.log("FAIL: ページが b3 ready に到達しない", r.stdout, r.stderr); process.exit(1); }
if ((meta.exceptions || []).length) { console.log("FAIL: ページ例外", meta.exceptions.join(" | ")); process.exit(1); }
let geo = null;
try { geo = JSON.parse(meta.eval); } catch (e) { console.log("FAIL: 幾何evalが取得できない", meta.eval); process.exit(1); }

// ---- PNGデコード(8bit RGB/RGBA・非インターレースのみ=Chromeスクショで十分) ----
function decodePNG(buf) {
  let pos = 8; const idat = []; let w, h, bpp;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported PNG (bitDepth/interlace)");
      bpp = data[9] === 6 ? 4 : data[9] === 2 ? 3 : null;
      if (!bpp) throw new Error("unsupported colorType " + data[9]);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = x >= bpp && prev ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
const img = decodePNG(fs.readFileSync(tmp));
if (img.w !== 1460 || img.h !== 884) { console.log(`FAIL: スクショ寸法 ${img.w}x${img.h} != 1460x884(DPRずれ?)`); process.exit(1); }

// ---- 統計(test-nest-cut.html と同一パイプライン)。帯中心=実コア(コア相対の原則) ----
const isAmber = (r2, g, b, L) => r2 > 96 && g > 56 && b < 64 && r2 > g && g > b * 1.6 && L > 50;
function pixStat(filter) {
  let s = 0, am = 0, warm = 0, hi = 0, n = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    if (!filter(x, y)) continue;
    const i = (y * img.w + x) * img.bpp;
    const r2 = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const L = .2126 * r2 + .7152 * g + .0722 * b;
    s += L; n++;
    if (isAmber(r2, g, b, L)) am++;
    if (r2 > g && g > b && L > 60) warm++;
    if (L > 140) hi++;
  }
  return { avgL: s / n, amber: am / n * 100, warm: warm / n * 100, hi: hi / n * 100 };
}
const [ccx, ccy] = geo.core;
const N = T.nodes;
const P = pixStat((x, y) => { const d = Math.hypot(x - ccx, y - ccy); return d >= N.band.r0 && d <= N.band.r1; });
const [sx, sy, sw2, sh2] = geo.side;
const PP = pixStat((x, y) => x >= sx && x < sx + sw2 && y >= sy && y < sy + sh2);
const f1 = (v) => v.toFixed(1);
let pass = 0, fail = 0;
const row = (name, refV, repV, thr, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}: 参照${refV} / 再現${repV} / 閾値${thr}`); };
row("B3 ノード帯(環状200-330・実コア中心) 平均輝度", f1(N.ref.avgL), f1(P.avgL), `±${N.avgLTol}L`, Math.abs(P.avgL - N.ref.avgL) <= N.avgLTol);
row("B3 ノード帯 amber率%", f1(N.ref.amber), f1(P.amber), `${N.amberMin}〜${N.amberMax}%`, P.amber >= N.amberMin && P.amber <= N.amberMax);
row("B3 ノード帯 暖色率%", f1(N.ref.warm), f1(P.warm), `< ${N.warmMax}%`, P.warm < N.warmMax);
// B4 右パネル列(密度比較=幅差にスケール頑健。再現側=実DOM #nest-side の bbox)
const PN = T.panel;
row("B4 パネル列 平均輝度", f1(PN.ref.avgL), f1(PP.avgL), `±${PN.avgLTol}L`, Math.abs(PP.avgL - PN.ref.avgL) <= PN.avgLTol);
row("B4 パネル列 明部率%(数値/見出しの存在)", f1(PN.ref.hi), f1(PP.hi), `${PN.hiMin}〜${PN.hiMax}%`, PP.hi >= PN.hiMin && PP.hi <= PN.hiMax);
row("B4 パネル列 amber率%", f1(PN.ref.amber), f1(PP.amber), `< ${PN.amberMax}%`, PP.amber < PN.amberMax);
row("B4 パネル列 暖色率%", f1(PN.ref.warm), f1(PP.warm), `< ${PN.warmMax}%`, PP.warm < PN.warmMax);
console.log(`\n=== qa-nest-shot: ${pass} PASS / ${fail} FAIL(実寸=実コード経路 DOM+canvas)===`);
process.exit(fail ? 1 : 0);
