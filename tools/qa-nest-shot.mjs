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
  "const samp=[];const seen={};" + // v2-V2: リング素材の標本(色ごとに1ノード・ページ自身が素材ファイル名を知る=単一の真実)
  "for(const e of document.querySelectorAll('#nest-web .wnode[data-ring]')){" +
  "if(seen[e.dataset.ring])continue;seen[e.dataset.ring]=1;const b=e.getBoundingClientRect();" +
  "samp.push({ring:e.dataset.ring,on:e.classList.contains('on'),file:NEST_RING_ASSETS[e.dataset.ring],b:[b.left,b.top,b.width,b.height]});}" +
  "return JSON.stringify({core:[Math.round(cx),Math.round(cy)]," +
  "assetsMode:document.getElementById('nest-web').classList.contains('assets')," +
  "assetRect:[Math.round(cx-w*ax), Math.round(cy-h*ay), w, h]," +
  "samples:samp," +
  "v3:(()=>{const q=(sel)=>{const e=document.querySelector(sel);if(!e)return null;const b2=e.getBoundingClientRect();return [b2.left,b2.top,b2.width,b2.height]};return {rank:q('#nest-side .np-frame-rank'),rate:q('#nest-openrate'),cta:q('#nest-side .np-cta')}})()," +
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
// B3ノード帯(モック統計)は素材モードでは測る意味を失う(V1コアと同じ論理=素材は別作画・無改変)ため
// **フォールバック経路(--noassets)の恒久回帰**としてのみ実行。素材モードのメダリオンはV2ゲートが担う。
if (NOASSETS && !T.pendingRecalP2_3) {
  row("B3 ノード帯(環状200-330・実コア中心) 平均輝度", f1(N.ref.avgL), f1(P.avgL), `±${N.avgLTol}L`, Math.abs(P.avgL - N.ref.avgL) <= N.avgLTol);
  row("B3 ノード帯 amber率%", f1(N.ref.amber), f1(P.amber), `${N.amberMin}〜${N.amberMax}%`, P.amber >= N.amberMin && P.amber <= N.amberMax);
  row("B3 ノード帯 暖色率%", f1(N.ref.warm), f1(P.warm), `< ${N.warmMax}%`, P.warm < N.warmMax);
}
// B4パネル列(モック統計)も素材モードでは枠素材で統計が変わる=**--noassetsの恒久回帰へ**(B3と同じ論理・4例目)。
// 素材モードのパネルはV3自己アンカー型ゲートが担う。
const PN = T.panel;
if (NOASSETS && T.pendingRecalP2_3) console.log("SKIP B3/B4 モック統計帯(P2-3ロスター統合の再較正待ち=ステップ3で復帰)");
if (NOASSETS && !T.pendingRecalP2_3) {
  row("B4 パネル列 平均輝度", f1(PN.ref.avgL), f1(PP.avgL), `±${PN.avgLTol}L`, Math.abs(PP.avgL - PN.ref.avgL) <= PN.avgLTol);
  row("B4 パネル列 明部率%(数値/見出しの存在)", f1(PN.ref.hi), f1(PP.hi), `${PN.hiMin}〜${PN.hiMax}%`, PP.hi >= PN.hiMin && PP.hi <= PN.hiMax);
  row("B4 パネル列 amber率%", f1(PN.ref.amber), f1(PP.amber), `< ${PN.amberMax}%`, PP.amber < PN.amberMax);
  row("B4 パネル列 暖色率%", f1(PN.ref.warm), f1(PP.warm), `< ${PN.warmMax}%`, PP.warm < PN.warmMax);
}
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
  // v2-V2: メダリオン素材の自己アンカー型ゲート。CSS contain縮小(≈3.4×縮小)のため、
  //   期待値=ソースのボックス平均(縮小の正しいモデル)でスクショ画素と比較。ゾーン=リング環
  //   (on: 中心のDOMグリフ覆いを除外 rN 0.55〜0.92 / lock: rN≦0.92)。
  row("V2 メダリオン素材モード(.assets)有効", "true", String(geo.assetsMode), "=true", geo.assetsMode === true);
  const rings = {};
  for (const s of geo.samples || []) {
    if (!rings[s.file]) rings[s.file] = decodePNG(fs.readFileSync(path.join(ROOT, "image/nest", s.file + ".png")));
    const A = rings[s.file];
    const [bx2, by2, bw2, bh2] = s.b;
    const sc = Math.min(bw2 / A.w, bh2 / A.h);
    const dw2 = A.w * sc, dh2 = A.h * sc, ox = bx2 + (bw2 - dw2) / 2, oy = by2 + (bh2 - dh2) / 2;
    // ゾーン平均色一致(チャンネル別): 3.4×縮小の細リングでは画素単位比較が縮小フィルタ差で壊れる
    //   (実測ΔL12〜17)ため、ゾーン平均で比較=フィルタ雑音は集計で相殺。正素材/正状態/正配置を検出する
    //   構造検査(微細な無改変検知は等倍要素=V1コアが担う分担)。
    const half = Math.min(A.w, A.h) / 2;
    if (!s.on) {
      // lock=不透明メダリオン: ゾーン平均色の画素一致(構造+階調)。
      let n2 = 0; const se = [0, 0, 0], sg = [0, 0, 0];
      for (let py = Math.ceil(oy); py < oy + dh2; py++) for (let px = Math.ceil(ox); px < ox + dw2; px++) {
        const sxc = (px - ox) / sc, syc = (py - oy) / sc;
        if (Math.hypot(sxc - A.w / 2, syc - A.h / 2) / half > 0.92) continue;
        const ii = (Math.min(A.h - 1, syc | 0) * A.w + Math.min(A.w - 1, sxc | 0)) * 4;
        if (A.data[ii + 3] < 250) continue;
        const is2 = (py * img.w + px) * img.bpp;
        se[0] += A.data[ii]; se[1] += A.data[ii + 1]; se[2] += A.data[ii + 2];
        sg[0] += img.data[is2]; sg[1] += img.data[is2 + 1]; sg[2] += img.data[is2 + 2];
        n2++;
      }
      const dCh = n2 ? Math.max(Math.abs(se[0] - sg[0]), Math.abs(se[1] - sg[1]), Math.abs(se[2] - sg[2])) / n2 : 1e9;
      row(`V2 メダリオン(lock) ゾーン平均色Δ(max ch)`, "0(素材=正解)", f1(dCh) + " (n=" + n2 + ")",
        `≦${T.medallion.maxChanDelta} & n≧${T.medallion.minSamples}`, dCh <= T.medallion.maxChanDelta && n2 >= T.medallion.minSamples);
    } else {
      // on=発光リング(素材の環は半透過=不透明画素がほぼ無い・実測n1〜5)→**色相の構造検査**:
      //   環状帯(rN0.62〜0.95)の平均色の色相が、リング色の期待レンジに入るか=正素材色/正状態の検出。
      //   微細な無改変検知は等倍要素(V1コア)が担う(閾値ファイルの分担注記)。
      let n2 = 0, sr = 0, sg2 = 0, sb = 0;
      for (let py = Math.ceil(oy); py < oy + dh2; py++) for (let px = Math.ceil(ox); px < ox + dw2; px++) {
        const sxc = (px - ox) / sc, syc = (py - oy) / sc;
        const rN = Math.hypot(sxc - A.w / 2, syc - A.h / 2) / half;
        if (rN < 0.62 || rN > 0.95) continue;
        const is2 = (py * img.w + px) * img.bpp;
        sr += img.data[is2]; sg2 += img.data[is2 + 1]; sb += img.data[is2 + 2]; n2++;
      }
      const r3 = sr / n2, g3 = sg2 / n2, b3 = sb / n2;
      const mx = Math.max(r3, g3, b3), mn = Math.min(r3, g3, b3);
      let hue = 0;
      if (mx > mn) {
        if (mx === r3) hue = 60 * (((g3 - b3) / (mx - mn)) % 6);
        else if (mx === g3) hue = 60 * ((b3 - r3) / (mx - mn) + 2);
        else hue = 60 * ((r3 - g3) / (mx - mn) + 4);
        if (hue < 0) hue += 360;
      }
      const RANGE = { amber: [20, 60], red: [345, 30], green: [80, 160], teal: [160, 215], purple: [235, 310] }; // red=0°境界跨ぎ(巻き戻り対応)
      const [h0, h1] = RANGE[s.ring];
      const inR = h0 <= h1 ? (hue >= h0 && hue <= h1) : (hue >= h0 || hue <= h1);
      row(`V2 メダリオン(${s.ring}・on) 環の色相`, `${h0}〜${h1}°`, hue.toFixed(0) + "° (n=" + n2 + ")",
        "期待レンジ内", n2 >= T.medallion.minSamples && inR);
    }
  }
  // v2-V3: パネル枠/ボタンの自己アンカー型(ゾーン平均色一致・素材=正解)。
  //   rank=枠帯のみ(内部は実データDOMで覆う設計) / rate=左34%(金の分子アイコン・非覆い) / cta=全面。
  const v3defs = [
    { key: "rank", file: "panel-rank", zone: "border", stretch: true },
    { key: "rate", file: "panel-rate", zone: "left34", stretch: true },
    { key: "cta", file: "btn-effects", zone: "full", stretch: false },
  ];
  for (const d of v3defs) {
    const bb = geo.v3 && geo.v3[d.key];
    if (!bb) { row(`V3 ${d.key} 要素が存在`, "あり", "なし", "存在", false); continue; }
    const A = rings[d.file] || (rings[d.file] = decodePNG(fs.readFileSync(path.join(ROOT, "image/nest", d.file + ".png"))));
    const [bx3, by3, bw3, bh3] = bb;
    let sxk3, syk3, ox3, oy3;
    if (d.stretch) { sxk3 = bw3 / A.w; syk3 = bh3 / A.h; ox3 = bx3; oy3 = by3; }
    else { const sc3 = Math.min(bw3 / A.w, bh3 / A.h); sxk3 = syk3 = sc3; ox3 = bx3 + (bw3 - A.w * sc3) / 2; oy3 = by3 + (bh3 - A.h * sc3) / 2; }
    let n3 = 0; const se3 = [0, 0, 0], sg3 = [0, 0, 0];
    for (let ya = 0; ya < A.h; ya += 2) for (let xa = 0; xa < A.w; xa += 2) {
      const u = xa / A.w, v = ya / A.h;
      if (d.zone === "border" && u > 0.06 && u < 0.94 && v > 0.09 && v < 0.90) continue; // 内部=DOM覆い領域を除外
      if (d.zone === "left34" && u > 0.34) continue;                                     // 数値覆い領域を除外
      const ia = (ya * A.w + xa) * 4;
      if (A.data[ia + 3] < 250) continue;
      const px3 = Math.round(ox3 + xa * sxk3), py3 = Math.round(oy3 + ya * syk3);
      if (px3 < 0 || py3 < 0 || px3 >= img.w || py3 >= img.h) continue;
      const is3 = (py3 * img.w + px3) * img.bpp;
      se3[0] += A.data[ia]; se3[1] += A.data[ia + 1]; se3[2] += A.data[ia + 2];
      sg3[0] += img.data[is3]; sg3[1] += img.data[is3 + 1]; sg3[2] += img.data[is3 + 2];
      n3++;
    }
    const dC3 = n3 ? Math.max(Math.abs(se3[0] - sg3[0]), Math.abs(se3[1] - sg3[1]), Math.abs(se3[2] - sg3[2])) / n3 : 1e9;
    row(`V3 ${d.file}(${d.zone}) ゾーン平均色Δ(max ch)`, "0(素材=正解)", f1(dC3) + " (n=" + n3 + ")",
      `≦${T.panelAsset.maxChanDelta} & n≧${T.panelAsset.minSamples}`, dC3 <= T.panelAsset.maxChanDelta && n3 >= T.panelAsset.minSamples);
  }
}
console.log(`\n=== qa-nest-shot: ${pass} PASS / ${fail} FAIL(実寸=実コード経路 DOM+canvas)===`);
process.exit(fail ? 1 : 0);
