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
const NOASSETS = process.argv.includes("--noassets"); // フォールバック実測モード(素材ゲートは対象外)
const EVAL = "(()=>{const st=document.getElementById('nest-stage').getBoundingClientRect();" +
  "const sd=document.getElementById('nest-side').getBoundingClientRect();" +
  "const cx=st.left+st.width*NEST_VIS.core.x, cy=st.top+st.height*NEST_VIS.core.y;" +
  "const R=Math.min(st.width,st.height)*NEST_VIS.core.r;" +
  "const k=CFG.nestCoreScale, ax=CFG.nestCoreAnchorX, ay=CFG.nestCoreAnchorY;" +
  "let w=R*k, h=w*258/318;" + // 素材の縦横比(nest-core 318×258)
  "if(Math.abs(w-318)<=2){w=318;h=258;}" + // nestCoreDrawの等倍スナップと同一(単一の真実=同式)
  "return JSON.stringify({core:[Math.round(cx),Math.round(cy)]," +
  "assetRect:[Math.round(cx-w*ax), Math.round(cy-h*ay), w, h]," +
  "side:[Math.round(sd.left),Math.round(sd.top),Math.round(sd.width),Math.round(sd.height)]})})()";
const r = spawnSync("node", [path.join(ROOT, "tools/qa-cdp.mjs"), "/test-nest-b3.html" + (NOASSETS ? "?noassets=1" : ""),
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
// v2-V1: 素材コアの自己アンカー型ゲート(素材=正解・無改変+正配置)。高α画素を素材→スクショへ写像し|ΔL|平均。
if (!NOASSETS) {
  const asset = decodePNG(fs.readFileSync(path.join(ROOT, "image/nest/nest-core.png")));
  if (asset.bpp !== 4) { console.log("FAIL: 素材にαが無い"); process.exit(1); }
  const [arx, ary, arw, arh] = geo.assetRect;
  const sxk = arw / asset.w, syk = arh / asset.h;
  // 一致標本=素材中央(卵+鉢内側・半径0.40)に限定: 糸(鉢縁から)とノード(ring0=縁外)が構造的に届かず、
  //   合成による正当なΔLが混入しない。無改変+正配置の担保には中央領域で十分。
  const cxA = asset.w / 2, cyA = asset.h / 2, rLim = Math.min(asset.w, asset.h) * 0.40;
  let n = 0, sum = 0, exBx = 0, exBy = 0, exBc = 0;
  for (let ya = 0; ya < asset.h; ya += 2) for (let xa = 0; xa < asset.w; xa += 2) {
    const ia = (ya * asset.w + xa) * 4;
    const aA = asset.data[ia + 3];
    const Lr = .2126 * asset.data[ia] + .7152 * asset.data[ia + 1] + .0722 * asset.data[ia + 2];
    if (aA > 200 && Lr > 170) { exBx += arx + xa * sxk; exBy += ary + ya * syk; exBc++; }
    if (aA < 250 || Math.hypot(xa - cxA, ya - cyA) > rLim) continue;
    const sx = Math.round(arx + xa * sxk), sy = Math.round(ary + ya * syk);
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    const is = (sy * img.w + sx) * img.bpp;
    const Ls = .2126 * img.data[is] + .7152 * img.data[is + 1] + .0722 * img.data[is + 2];
    sum += Math.abs(Ls - Lr); n++;
  }
  const meanDL = n ? sum / n : 1e9;
  row("V1 素材コア 無改変+正配置(高α画素の平均|ΔL|)", "0(素材=正解)", f1(meanDL) + " (n=" + n + ")",
    `≦${T.asset.maxMeanDL} & n≧${T.asset.minSamples}`, meanDL <= T.asset.maxMeanDL && n >= T.asset.minSamples);
  // 卵の照り(高輝度)重心が素材どおりの位置に来るか
  let bx = 0, by = 0, bc = 0;
  for (let y = Math.max(0, ary | 0); y < Math.min(img.h, ary + arh); y += 2)
    for (let x = Math.max(0, arx | 0); x < Math.min(img.w, arx + arw); x += 2) {
      const i = (y * img.w + x) * img.bpp;
      const L = .2126 * img.data[i] + .7152 * img.data[i + 1] + .0722 * img.data[i + 2];
      if (L > 170) { bx += x; by += y; bc++; }
    }
  const exp = exBc ? [exBx / exBc, exBy / exBc] : null;
  const got = bc ? [bx / bc, by / bc] : null;
  const dist = exp && got ? Math.hypot(got[0] - exp[0], got[1] - exp[1]) : 1e9;
  row("V1 素材コア 高輝度重心の正配置px", exp ? exp.map(Math.round) : "-", got ? got.map(Math.round) : "-",
    `≦${T.asset.cenDist}px`, dist <= T.asset.cenDist);
}
console.log(`\n=== qa-nest-shot: ${pass} PASS / ${fail} FAIL(実寸=実コード経路 DOM+canvas)===`);
process.exit(fail ? 1 : 0);
