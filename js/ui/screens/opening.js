"use strict";
// =============================================================
// opening — シネマティック機構(V5C・C1)【表現層・独立モジュール】
// 本編のロジック/セーブ/経済/確率/純血/魂には一切触れない。描画も本編ループとは別(再生中だけ自前のrAF)。
//
// フェーズ1: 基準カット3案の比較用レンダラ。同一カット(カット2「脱出 — 積んだのは科学だけ」)を
//   絵作りの流儀が異なる3案で描く。?tune=1#opening のビューアから呼ばれる。
//
// 【厳守した禁止事項(仕様書§3-1・判定以前の失格条件)】
//   1. 主役の不在  → トカゲを画面の主役に据える(頭部だけで画面高の約6割)。
//   2. 陰影グラデ  → createLinearGradient/createRadialGradient/shadowBlur は一切使わない。面は塗りで割る。
//   3. 線画表現    → stroke は一切使わない。すべて塗りの塊(fill)で構成する。
//   ※ 上記3点は tests/opening_regression.js がソース走査で機械的に監視する。
//
// 決定論: 乱数を使わず fmix32(ハッシュ)+時刻の純関数。同じtなら常に同じ画。
// =============================================================

const Opening = {
  // ---- 決定論ハッシュ(乱数を使わない・0..1) ----
  h(a, b) {
    let t = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B)) >>> 0;
    t ^= t >>> 15; t = Math.imul(t, 0x2545F491); t ^= t >>> 13;
    return (t >>> 0) / 4294967296;
  },

  // ---- 塗りのみの基本形(strokeを使わない) ----
  poly(ctx, pts, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i === 0 ? ctx.moveTo(pts[0], pts[1]) : ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  },
  disc(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); },

  // ---- ディザ(PC-98流): 2色の市松パターン。グラデを使わずに中間調を作る唯一の手段 ----
  _dit: {},
  dither(ctx, a, b, level, cell) {
    const key = a + "|" + b + "|" + level + "|" + (cell || 2);
    if (this._dit[key]) return this._dit[key];
    const c = cell || 2, S = c * 4;
    const oc = document.createElement("canvas"); oc.width = oc.height = S;
    const o = oc.getContext("2d");
    o.fillStyle = a; o.fillRect(0, 0, S, S);
    // Bayer 4x4 の閾値順でbを打つ=面積比でlevel(0..1)の中間調
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    o.fillStyle = b;
    for (let i = 0; i < 16; i++) if (BAY[i] < Math.round(level * 16)) o.fillRect((i % 4) * c, ((i / 4) | 0) * c, c, c);
    return (this._dit[key] = ctx.createPattern(oc, "repeat"));
  },

  // =============================================================
  // 主役のトカゲ(ムービー専用の描き方=ゲーム内の魂とは別絵・Ric裁定§3-2)
  //   横顔の頭部+首+肩+前肢、爪でフラスコ(=科学)を抱える。すべて多角形の塗り。
  //   pts は 0..1 の正規化座標。draw時に (x,y,s) で配置。
  // =============================================================
  // 横顔・左向き(=遠ざかる故郷を振り返る)。x=0が鼻先。頭部だけで画面高の約6割を占める。
  LIZ: {
    // 鼻先(x≈0)は縦幅が狭く、頭蓋(x≈.5)で最も高い=オオトカゲの横顔のテーパー
    skull: [.015, .455, .05, .405, .14, .360, .26, .318, .37, .282, .48, .264, .585, .282, .672, .340, .730, .432, .700, .520, .520, .566, .300, .578, .140, .548, .040, .500],
    jawLo: [.035, .495, .28, .592, .55, .578, .70, .530, .722, .612, .585, .672, .285, .676, .060, .572],
    brow: [.255, .330, .375, .286, .495, .278, .530, .330, .380, .348, .272, .372],
    crest: [.470, .262, .520, .160, .566, .254, .616, .172, .656, .268, .706, .218, .740, .348, .682, .322],
    neck: [.640, .330, .845, .398, .975, .585, 1.00, 1.00, .620, 1.00, .570, .620],
    shoulder: [.735, .600, 1.00, .700, 1.00, 1.00, .715, 1.00],
    // セル影(ハードエッジの面)。グラデ禁止のため形で割る
    shadeHead: [.040, .500, .140, .548, .300, .578, .520, .566, .700, .520, .730, .432, .690, .470, .500, .512, .290, .520, .120, .490],
    shadeNeck: [.735, .600, .975, .585, 1.00, 1.00, .790, 1.00],
    // 面取り(案B用): 頭部を面で割る
    facetA: [.015, .455, .14, .360, .26, .318, .29, .430, .12, .478],
    facetB: [.26, .318, .48, .264, .585, .282, .560, .440, .290, .430],
    facetC: [.585, .282, .672, .340, .730, .432, .700, .520, .560, .440],
  },

  // フラスコ(科学の灯=琥珀)。塗りのみ
  flask(ctx, x, y, s, style, glowK) {
    const P = this.poly.bind(this);
    const amber = "#f2b23c", amberHi = "#ffd98a", glassD = "#2b3550", glassL = "#44536f";
    P(ctx, [x - .10 * s, y - .34 * s, x + .10 * s, y - .34 * s, x + .10 * s, y - .18 * s, x + .26 * s, y + .16 * s, x - .26 * s, y + .16 * s, x - .10 * s, y - .18 * s], glassD);
    // 中の液体(明度差だけで手前/奥を作る)
    const lv = 0.02 + 0.05 * glowK;
    P(ctx, [x - .21 * s, y + .02 * s - lv * s, x + .21 * s, y + .02 * s - lv * s, x + .26 * s, y + .16 * s, x - .26 * s, y + .16 * s], amber);
    if (style !== "silhouette") P(ctx, [x - .21 * s, y + .02 * s - lv * s, x - .04 * s, y + .02 * s - lv * s, x - .10 * s, y + .16 * s, x - .26 * s, y + .16 * s], amberHi);
    if (style === "poly") P(ctx, [x + .04 * s, y - .30 * s, x + .10 * s, y - .34 * s, x + .10 * s, y - .18 * s], glassL);
  },

  // 主役の描画。style: "dither" | "poly" | "silhouette"
  lizard(ctx, x, y, s, style, glowK) {
    const L = this.LIZ, P = this.poly.bind(this);
    const put = (pts) => { const o = []; for (let i = 0; i < pts.length; i += 2) { o.push(x + pts[i] * s, y + pts[i + 1] * s); } return o; };
    let body, dark, shade, eyeW, eyeP, claw;
    if (style === "silhouette") { body = "#0a0d16"; dark = "#0a0d16"; shade = "#070912"; eyeW = "#f2b23c"; eyeP = "#0a0d16"; claw = "#0a0d16"; }
    else if (style === "poly") { body = "#4a6b52"; dark = "#33503d"; shade = "#263c2e"; eyeW = "#ffd98a"; eyeP = "#141a12"; claw = "#c9c2a8"; }
    else { body = "#4f7057"; dark = "#31493a"; shade = "#223329"; eyeW = "#ffd98a"; eyeP = "#12180f"; claw = "#cfc7ad"; }

    // 奥から順に: 首→肩→クレスト→頭蓋→下顎
    P(ctx, put(L.neck), dark);
    P(ctx, put(L.shoulder), shade);
    P(ctx, put(L.crest), style === "silhouette" ? body : dark);
    P(ctx, put(L.jawLo), style === "silhouette" ? body : dark);
    P(ctx, put(L.skull), body);
    if (style === "poly") {                      // 案B: 頭部を面で割る(面取り=陰影でなく面で立体感)
      P(ctx, put(L.facetA), "#5b7d62"); P(ctx, put(L.facetB), body); P(ctx, put(L.facetC), dark);
    }
    // セル影(ハードエッジ)。ディザ案だけ中間調を市松で挟む
    if (style === "dither") {
      ctx.save(); ctx.beginPath();
      const sp = put(L.shadeHead); ctx.moveTo(sp[0], sp[1]); for (let i = 2; i < sp.length; i += 2) ctx.lineTo(sp[i], sp[i + 1]);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = this.dither(ctx, dark, body, 0.5, 2); ctx.fillRect(x, y, s, s);
      ctx.restore();
    } else if (style === "poly") { P(ctx, put(L.shadeHead), dark); }
    P(ctx, put(L.shadeNeck), shade);
    if (style !== "silhouette") P(ctx, put(L.brow), dark);   // 眉庇(まゆびさし)=爬虫類らしさの要
    // 口の合わせ目(線でなく細い塗りの楔)
    P(ctx, put([.022, .468, .29, .578, .57, .566, .705, .512, .712, .566, .580, .618, .288, .620, .030, .506]), style === "silhouette" ? shade : "#18261d");
    // 鼻孔(小さな塊)
    P(ctx, put([.052, .408, .092, .396, .098, .432, .058, .440]), shade);
    // 目(縦長瞳孔)。主役の視線=物語の主体であることの明示
    const ex = x + .335 * s, ey = y + .345 * s, er = .070 * s;
    P(ctx, [ex - er * 1.25, ey + er * .15, ex - er * .35, ey - er * .72, ex + er * .85, ey - er * .35, ex + er * 1.0, ey + er * .35, ex - er * .2, ey + er * .78], eyeW);
    P(ctx, [ex - er * .1, ey - er * .5, ex + er * .28, ey - er * .3, ex + er * .2, ey + er * .52, ex - er * .18, ey + er * .38], eyeP);
  },

  // 前景の手(下から入る)+フラスコ。主役の手であることが読めるよう、フレーム座標で独立に配置する。
  foreClaw(ctx, x, y, s, style, glowK) {
    const P = this.poly.bind(this);
    let body, dark, claw;
    if (style === "silhouette") { body = "#0a0d16"; dark = "#070912"; claw = "#0a0d16"; }
    else if (style === "poly") { body = "#3f5c48"; dark = "#2b4233"; claw = "#c9c2a8"; }
    else { body = "#42604a"; dark = "#2a3f31"; claw = "#cfc7ad"; }
    // 前腕(下辺から立ち上がる)
    P(ctx, [x - .40 * s, y + 1.2 * s, x - .10 * s, y + .30 * s, x + .34 * s, y + .26 * s, x + .30 * s, y + 1.2 * s], dark);
    // 掌(フラスコを支える)
    P(ctx, [x - .34 * s, y + .34 * s, x + .30 * s, y + .22 * s, x + .40 * s, y + .58 * s, x - .26 * s, y + .66 * s], body);
    // 指(3本の塊。線でなく塗り)
    for (let k = 0; k < 3; k++) {
      const fx = x - .22 * s + k * .22 * s, fy = y + .30 * s - k * .045 * s;
      P(ctx, [fx, fy, fx + .17 * s, fy - .06 * s, fx + .20 * s, fy - .30 * s, fx + .07 * s, fy - .32 * s], body);
      if (style !== "silhouette") P(ctx, [fx + .10 * s, fy - .32 * s, fx + .19 * s, fy - .305 * s, fx + .155 * s, fy - .375 * s], claw);
    }
    this.flask(ctx, x + .02 * s, y - .22 * s, s * .95, style, glowK);
  },

  // =============================================================
  // 故郷の惑星(背景)。侵食=深紅の楔を塗りで放射。輪郭線は引かない。
  // =============================================================
  homeworld(ctx, cx, cy, r, style, k, W) {
    const P = this.poly.bind(this);
    const base = style === "silhouette" ? "#1b2740" : "#2a3350";
    const lit = style === "silhouette" ? "#33456b" : "#3d4a6d";
    const crim = "#8e1f2b", crimHi = "#c9313a";
    this.disc(ctx, cx, cy, r, base);
    // 明部(奥ほど明るい=値の差で奥行き)。円弧の重なりで面を割る
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    this.disc(ctx, cx - r * .35, cy - r * .40, r * .95, lit);
    if (style === "dither") { ctx.fillStyle = this.dither(ctx, lit, base, 0.5, 2); ctx.fillRect(cx - r, cy - r, r * 2, r * 2 * .5); }
    // 侵食の楔(深紅)=内側から喰われた痕。kで広がる
    for (let i = 0; i < 9; i++) {
      const a = this.h(i, 7) * 6.283, w = (.10 + this.h(i, 9) * .16) * (0.35 + k * 1.15);
      const rr = r * (0.30 + this.h(i, 3) * 0.85) * (0.45 + k * 0.75);
      P(ctx, [cx, cy, cx + Math.cos(a - w) * rr, cy + Math.sin(a - w) * rr, cx + Math.cos(a) * rr * 1.18, cy + Math.sin(a) * rr * 1.18, cx + Math.cos(a + w) * rr, cy + Math.sin(a + w) * rr], i % 3 === 0 ? crimHi : crim);
    }
    this.disc(ctx, cx, cy, r * (0.10 + k * 0.30), crimHi);
    ctx.restore();
    // 崩れて飛ぶ破片(塗りの三角)
    for (let i = 0; i < 14; i++) {
      const a = this.h(i, 21) * 6.283, d = r * (1.05 + this.h(i, 31) * 0.9 * (0.2 + k));
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, sz = r * (.03 + this.h(i, 41) * .05);
      if (px < -sz || px > W + sz) continue;
      P(ctx, [px, py - sz, px + sz, py + sz * .6, px - sz * .8, py + sz], i % 4 === 0 ? crim : base);
    }
  },

  // =============================================================
  // 基準カット: カット2「脱出 — 積んだのは科学だけ」
  //   構図: 主役のトカゲ(大)が振り返り、背後で故郷が侵食に喰われて遠ざかる。手にはフラスコ(科学の灯)。
  //   動き: 1カット1動作=「故郷が遠ざかる(小さく・下へ)」+ 侵食の拡大。主役はわずかに上昇。
  //   u: 0..1(カット内の進行)
  // =============================================================
  drawCut2(ctx, W, H, u, style) {
    const P = this.poly.bind(this);
    const ease = u * u * (3 - 2 * u);
    ctx.clearRect(0, 0, W, H);

    // 空: バンド(帯)で塗る。グラデーションは使わない=2Dのまま奥行きを値で作る
    const skyBands = style === "silhouette"
      ? ["#16223c", "#1b2a49", "#213157", "#273a65"]
      : ["#080d1a", "#0c1326", "#111a33", "#16223f"];
    for (let i = 0; i < skyBands.length; i++) P(ctx, [0, H * i / skyBands.length, W, H * i / skyBands.length, W, H * (i + 1) / skyBands.length, 0, H * (i + 1) / skyBands.length], skyBands[i]);
    if (style === "dither") { // 帯の境目をディザで繋ぐ(PC-98流の階調)
      for (let i = 1; i < skyBands.length; i++) {
        ctx.fillStyle = this.dither(ctx, skyBands[i - 1], skyBands[i], 0.5, 2);
        ctx.fillRect(0, H * i / skyBands.length - H * .045, W, H * .09);
      }
    }
    // 星(点の塊・決定論)
    for (let i = 0; i < 46; i++) {
      const sx = this.h(i, 2) * W, sy = this.h(i, 5) * H * .72, sz = 1 + (this.h(i, 8) > .82 ? 1 : 0);
      ctx.fillStyle = i % 5 === 0 ? "#f2d3a0" : "#8fa0c4"; ctx.fillRect(sx | 0, sy | 0, sz, sz);
    }
    // 故郷(遠ざかる=小さく・左上へ退く)
    const r = H * (0.29 - 0.11 * ease), cx = W * (0.185 - 0.025 * ease), cy = H * (0.31 - 0.05 * ease);
    this.homeworld(ctx, cx, cy, r, style, 0.25 + 0.75 * ease, W);

    // 主役(大きく・はっきり)。頭部だけで画面高の約6割。わずかな上昇+呼吸=1カット1動作を邪魔しない微動
    const bob = Math.sin(u * 6.283) * H * .010 - ease * H * .035;
    const s = W * 0.74;
    const lx = W * 0.345, ly = H * -0.055 + bob;
    const glowK = 0.4 + 0.6 * Math.abs(Math.sin(u * 3.1));
    this.lizard(ctx, lx, ly, s, style, glowK);
    // 前景の手+フラスコ(=積んだのは科学だけ)。主役より手前=より暗い
    this.foreClaw(ctx, W * 0.245, H * 0.78 + bob * 0.5, H * 0.42, style, glowK);

    // ロケットの窓枠(手前=最も暗い=手前ほど暗いの原則。重なりで奥行きを作る)
    const fr = style === "silhouette" ? "#04060b" : "#080b12";
    P(ctx, [0, 0, W, 0, W, H * .045, 0, H * .045], fr);
    P(ctx, [0, H * .945, W, H * .945, W, H, 0, H], fr);
    P(ctx, [0, 0, W * .035, 0, W * .035, H, 0, H], fr);
    P(ctx, [W * .965, 0, W, 0, W, H, W * .965, H], fr);

    // 語り(主役に被らない左下。フェードは不透明度のみ=物体への光彩ではない)
    const a = Math.min(1, Math.min(u * 3.2, (1 - u) * 5));
    if (a > 0.01) {
      ctx.globalAlpha = a;
      ctx.fillStyle = "#e8dcc6";
      ctx.font = `500 ${Math.round(H * .058)}px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
      ctx.fillText("積んだのは、科学だけだった。", W * .065, H * .875);
      ctx.globalAlpha = 1;
    }
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Opening };
