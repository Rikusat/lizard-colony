"use strict";
// =============================================================
// opening — シネマティック機構(V5C・C1)【表現層・独立モジュール】
// 本編のロジック/セーブ/経済/確率/純血/魂には一切触れない。描画も本編ループとは別(再生中だけ自前のrAF)。
//
// 流儀 = 案C「切り絵シルエット」(Ric選定 2026-07-27)。全カットで以下を貫く:
//   ・手前ほど暗く(ほぼ黒)、奥ほど明るい。層は前景/中景/背景の3段以上。
//   ・層ごとに1色のベタ。層内で色を混ぜない。カットごとに限定パレット(CFG.openingPal・5色)。
//   ・切り絵ゆえシルエットが全て。輪郭の形そのもので語る(頭部・背稜・尾の抜け・脚の間)。
//   ・「間(余白)」を構図の主役として意図的に配置する。
//
// 【厳守した禁止事項(仕様書§3-1・判定以前の失格条件)】
//   1. 主役の不在  → トカゲを前景の暗い塊として大きく据える。
//   2. 陰影グラデ  → createLinearGradient/createRadialGradient/shadowBlur は一切使わない。面は塗りで割る。
//   3. 線画表現    → stroke は一切使わない。すべて塗りの塊(fill)で構成する。
//   ※ tests/opening_regression.js がソース走査+スタブ描画で機械的に監視する。
//
// 決定論: 乱数を使わず ハッシュ+時刻の純関数。同じ t なら常に同じ画。
// =============================================================

const Opening = {
  // ---- 決定論ハッシュ(乱数を使わない・0..1) ----
  h(a, b) {
    let t = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B)) >>> 0;
    t ^= t >>> 15; t = Math.imul(t, 0x2545F491); t ^= t >>> 13;
    return (t >>> 0) / 4294967296;
  },
  pal(i) { return (typeof CFG !== "undefined" && CFG.openingPal && CFG.openingPal[i]) || ["#333", "#222", "#111", "#000", "#f2b23c"]; },
  durs() { return (typeof CFG !== "undefined" && CFG.openingDurSec) || [1.8, 1.8, 2.0, 1.8, 1.8, 1.6]; },
  total() { return this.durs().reduce((a, b) => a + b, 0); },

  // ---- 塗りのみの基本形 ----
  poly(ctx, pts, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i === 0 ? ctx.moveTo(pts[0], pts[1]) : ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  },
  disc(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); },
  rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); },
  // 塗りの帯(円環の一部)。線ではなく「面」として描く=切り絵の作法
  ringBand(ctx, cx, cy, rOut, rIn, a0, a1, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(cx, cy, rOut, a0, a1); ctx.arc(cx, cy, Math.max(0, rIn), a1, a0, true);
    ctx.closePath(); ctx.fill();
  },

  // =============================================================
  // シルエット資産(切り絵=内部に陰影を持たない単一の塊。明るいのは目だけ)
  // =============================================================
  // 横顔(左向き)。鼻先が細く頭蓋で最も高い+背稜のギザギザ=輪郭だけでトカゲと読める形
  SIL_HEAD: [
    .015, .455, .050, .405, .140, .360, .260, .318, .370, .282, .440, .264,
    .470, .262, .520, .150, .566, .254, .616, .162, .656, .268, .706, .208, .740, .348,
    .845, .398, .975, .585, 1.00, 1.00, .620, 1.00,
    .585, .672, .285, .676, .060, .572, .035, .495,
  ],
  // 全身(左向き)。背稜のギザ・脚の間・尾の抜けを輪郭だけで作る
  SIL_BODY: [
    .020, .560, .055, .500, .120, .470, .190, .452, .245, .436,
    .270, .372, .300, .430, .335, .368, .368, .428, .405, .372, .440, .424,
    .520, .418, .600, .424, .660, .372, .700, .420, .760, .398,
    .860, .424, .960, .470, 1.00, .560, .930, .540, .845, .512, .760, .500,
    .735, .620, .800, .700, .775, .720, .700, .660, .672, .560,
    .560, .576, .530, .690, .590, .760, .565, .782, .482, .706, .462, .572,
    .330, .560, .300, .684, .360, .752, .335, .774, .252, .700, .234, .552,
    .150, .556, .120, .664, .175, .730, .150, .752, .075, .684, .062, .548,
    .030, .600,
  ],

  put(pts, x, y, s, flip, W) {
    const o = [];
    for (let i = 0; i < pts.length; i += 2) {
      const px = flip ? (W - (x + pts[i] * s)) : (x + pts[i] * s);
      o.push(px, y + pts[i + 1] * s);
    }
    return o;
  },
  // 頭部(前景の塊)。切り絵ゆえ内部は塗り分けず、目だけを抜く
  lizHead(ctx, x, y, s, col, eyeCol, W, flip) {
    this.poly(ctx, this.put(this.SIL_HEAD, x, y, s, flip, W), col);
    const ex = flip ? (W - (x + .335 * s)) : (x + .335 * s), ey = y + .345 * s, er = .062 * s;
    const f = flip ? -1 : 1;
    this.poly(ctx, [ex - er * 1.2 * f, ey + er * .15, ex - er * .3 * f, ey - er * .72, ex + er * .9 * f, ey - er * .3, ex + er * .95 * f, ey + er * .38, ex - er * .15 * f, ey + er * .76], eyeCol);
    this.poly(ctx, [ex - er * .06 * f, ey - er * .48, ex + er * .3 * f, ey - er * .28, ex + er * .22 * f, ey + er * .5, ex - er * .14 * f, ey + er * .36], col);
  },
  lizBody(ctx, x, y, s, col, W, flip) { this.poly(ctx, this.put(this.SIL_BODY, x, y, s, flip, W), col); },

  // =============================================================
  // 四重スリット装置(実装と同じ構造: 4基・別速度・逆回転)。塗りの帯で描く
  // =============================================================
  slitRings(ctx, cx, cy, R, t, col) {
    const C = typeof CFG !== "undefined" ? CFG : {};
    const N = C.slitRings || 4, rad = C.slitRadiif || [.92, .68, .44, .2];
    const half = C.slitHalfDeg || [54, 28, 16, 10], spin = C.slitSpinDeg || [3.3, -4.667, 5.716, -7.379];
    for (let i = 0; i < N; i++) {
      const a = ((C.slitBaseAngleDeg || 90) + spin[i] * t * 12) * Math.PI / 180; // 別速度・逆回転(尺が短いため時間を12倍で見せる)
      const hw = half[i] * Math.PI / 180, rO = R * rad[i], rI = rO * 0.90;
      this.ringBand(ctx, cx, cy, rO, rI, a + hw, a - hw + Math.PI * 2, col);
    }
  },

  // 惑星の姿形(四重スリットの確定意匠を引用)。塗りの塊で描く
  planetShape(ctx, cx, cy, r, sk, col) {
    const kind = (sk && sk.shape) || "ring";
    if (kind === "ring") return this.disc(ctx, cx, cy, r, col);
    const pts = [];
    for (let d = 0; d < 360; d += 2) {
      const th = d * Math.PI / 180;
      let rr = r;
      if (kind === "poly") { const seg = 360 / sk.sides, a = ((d % seg) - seg / 2) * Math.PI / 180; rr = r * Math.cos(Math.PI / sk.sides) / Math.cos(a); }
      else if (kind === "star") { const seg = 360 / sk.points, a = ((d % seg) + seg) % seg, hh = seg / 2, f = a <= hh ? a / hh : (seg - a) / hh; rr = r * (1 - (1 - sk.innerF) * f); }
      else if (kind === "gear") { const seg = 360 / (sk.teeth || 14), a = ((d % seg) + seg) % seg; rr = a < seg * (sk.toothFrac || .45) ? r * (1 - (sk.toothDepth || .16)) : r; }
      else if (kind === "reuleaux") { for (let k = 0; k < 3; k++) { const dd = (((d - k * 120) % 360) + 360) % 360; if (dd >= 120 && dd <= 240) { const tt = dd * Math.PI / 180; rr = r * (Math.cos(tt) + Math.sqrt(3 - Math.sin(tt) * Math.sin(tt))); break; } } }
      else if (kind === "organic") { rr = r * (1 + (sk.wobAmp || .05) * Math.sin((sk.wobLobes || 7) * th) + (sk.wobAmp2 || .02) * Math.sin((sk.wobLobes2 || 17) * th + 1.7)); }
      pts.push(cx + rr * Math.cos(th), cy - rr * Math.sin(th));
    }
    this.poly(ctx, pts, col);
  },

  // 層(帯)で空を塗る。グラデーションは使わない=奥ほど明るい段を面で作る
  sky(ctx, W, H, cA, cB, n) {
    n = n || 4;
    for (let i = 0; i < n; i++) this.rect(ctx, 0, H * i / n, W, H / n + 1, i < n / 2 ? cA : cB);
  },
  stars(ctx, W, H, col, k, seed) {
    for (let i = 0; i < 44; i++) {
      if (this.h(i, 11) > k) continue;
      const sx = this.h(i, seed || 2) * W, sy = this.h(i, (seed || 2) + 3) * H * .7;
      ctx.fillStyle = col; ctx.fillRect(sx | 0, sy | 0, 1 + (this.h(i, 8) > .85 ? 1 : 0), 1);
    }
  },
  // 語り(前景より前・不透明度のみでフェード)
  say(ctx, W, H, txt, a, col) {
    if (a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = col;
    ctx.font = `500 ${Math.round(H * .056)}px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
    ctx.fillText(txt, W * .062, H * .90);
    ctx.globalAlpha = 1;
  },
  fade(u) { return Math.min(1, u * 4.5, (1 - u) * 5.5); },

  // =============================================================
  // カット(u: 0..1)。各カットで「間(余白)」の置き場所を決めてある。
  // =============================================================
  // ①崩壊 — 余白=右上の空。主役は左の巨大な頭部、視線の先(右)で大地が噴き上がる
  cut1(ctx, W, H, u) {
    const P = this.pal(0), e = u * u * (3 - 2 * u);
    this.sky(ctx, W, H, P[0], P[1], 4);
    for (let i = 0; i < 7; i++) {                                   // 背景(最も明るい): 噴き上がる侵食の楔
      const bx = W * (.34 + this.h(i, 5) * .62), bw = W * (.025 + this.h(i, 6) * .045);
      const bh = H * (.10 + this.h(i, 7) * .38) * (0.35 + e * .95);
      this.poly(ctx, [bx, H * .62, bx + bw, H * .62, bx + bw * .5, H * .62 - bh], P[4]);
    }
    this.poly(ctx, [0, H * .58, W, H * .50, W, H * .70, 0, H * .70], P[1]);
    this.poly(ctx, [0, H * .70, W * .34, H * .66, W * .55, H * .74, W, H * .68, W, H * .84, 0, H * .86], P[2]); // 中景: 割れた地殻
    for (let i = 0; i < 5; i++) { const gx = W * (.38 + i * .13 + this.h(i, 9) * .02); this.poly(ctx, [gx, H * .70, gx + W * .012, H * .70, gx + W * .03, H * .86, gx - W * .01, H * .86], P[3]); }
    this.poly(ctx, [0, H * .84, W, H * .80, W, H, 0, H], P[2]);     // 床は中景値=前景の黒と溶けない
    const s = W * .62, bob = Math.sin(u * 6.283) * H * .006;        // 前景(ほぼ黒): 崩壊を見つめる主役(最後=最も手前)
    this.lizHead(ctx, W * .10, H * .05 + bob + e * H * .02, s, P[3], P[4], W, true); // 目が画面中央高に来る位置=顔として読める
    this.say(ctx, W, H, "故郷は、内側から喰われた。", this.fade(u), "#e8dcc6");
  },

  // ②脱出 — 余白=中央上の夜空。左に遠ざかる故郷、右に主役、下に琥珀の灯
  cut2(ctx, W, H, u) {
    const P = this.pal(1), e = u * u * (3 - 2 * u);
    this.sky(ctx, W, H, P[0], P[1], 4);
    this.stars(ctx, W, H, "#8fa0c4", .75, 2);
    const r = H * (.30 - .12 * e), cx = W * (.20 - .04 * e), cy = H * (.30 - .04 * e); // 背景: 遠ざかる故郷
    this.disc(ctx, cx, cy, r, P[1]);
    for (let i = 0; i < 7; i++) { const a = this.h(i, 7) * 6.283, w = .16 + this.h(i, 9) * .18, rr = r * (.45 + this.h(i, 3) * .55); this.poly(ctx, [cx, cy, cx + Math.cos(a - w) * rr, cy + Math.sin(a - w) * rr, cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr * 1.15, cx + Math.cos(a + w) * rr, cy + Math.sin(a + w) * rr], "#8e1f2b"); }
    const ry = H * (1.15 - e * .55);                                 // 中景: 上昇する機体
    this.poly(ctx, [W * .60, ry, W * .70, ry - H * .30, W * .76, ry - H * .30, W * .80, ry, W * .74, ry + H * .10, W * .66, ry + H * .10], P[2]);
    const s = W * .74, bob = Math.sin(u * 6.283) * H * .009 - e * H * .03; // 前景: 主役+フラスコ(唯一の明るい差し色)
    this.lizHead(ctx, W * .345, H * -.055 + bob, s, P[3], P[4], W, false);
    const fx = W * .245, fy = H * .80 + bob * .5, fs = H * .30;
    this.poly(ctx, [fx - .34 * fs, fy + 1.4 * fs, fx - .12 * fs, fy + .30 * fs, fx + .34 * fs, fy + .24 * fs, fx + .30 * fs, fy + 1.4 * fs], P[3]);
    this.poly(ctx, [fx - .30 * fs, fy + .30 * fs, fx + .32 * fs, fy + .20 * fs, fx + .40 * fs, fy + .56 * fs, fx - .24 * fs, fy + .64 * fs], P[3]);
    this.poly(ctx, [fx - .12 * fs, fy - .30 * fs, fx + .12 * fs, fy - .30 * fs, fx + .12 * fs, fy - .12 * fs, fx + .30 * fs, fy + .26 * fs, fx - .30 * fs, fy + .26 * fs, fx - .12 * fs, fy - .12 * fs], P[3]);
    this.poly(ctx, [fx - .24 * fs, fy + .04 * fs, fx + .24 * fs, fy + .04 * fs, fx + .29 * fs, fy + .24 * fs, fx - .29 * fs, fy + .24 * fs], P[4]);
    this.say(ctx, W, H, "積んだのは、科学だけだった。", this.fade(u), "#e8dcc6");
  },

  // ③航行 — 十の星+固有種。余白=上の星海。下辺に二匹だけの全身シルエット
  cut3(ctx, W, H, u) {
    const P = this.pal(2);
    this.sky(ctx, W, H, P[0], P[1], 4);
    this.stars(ctx, W, H, "#cddaf0", .9, 5);
    const by = (typeof CFG !== "undefined" && CFG.slitSkinByStage) || {};   // 背景: 十の星(確定意匠の引用)
    for (let k = 0; k < 10; k++) {
      const sk0 = by[k + 1] || {};
      const sk = sk0.rings && sk0.rings[0] ? Object.assign({}, sk0, sk0.rings[0]) : sk0;
      const span = W * 1.9, px = ((k / 10) * span - u * span * .5 + span * 2) % span - W * .12;
      const py = H * (.22 + .18 * this.h(k, 13)), rr = H * (.055 + .028 * this.h(k, 17));
      const c = sk.rail ? `rgb(${sk.rail[0]},${sk.rail[1]},${sk.rail[2]})` : "#9fb3d9";
      if (px > -rr * 2 && px < W + rr * 2) this.planetShape(ctx, px, py, rr, sk, c);
    }
    this.poly(ctx, [0, H * .60, W * .30, H * .52, W * .62, H * .62, W, H * .55, W, H * .74, 0, H * .74], P[1]); // 中景: 尾根の重なり
    this.poly(ctx, [0, H * .70, W * .26, H * .64, W * .58, H * .73, W, H * .66, W, H * .86, 0, H * .86], P[2]);
    this.rect(ctx, 0, H * .855, W, H * .145, P[2]);                          // 床=中景値(前景の黒と分離)
    this.lizBody(ctx, W * .01, H * .105, W * .64, P[3], W, false);   // 手前=大きく暗い主役
    this.lizBody(ctx, W * .66, H * .335, W * .34, P[3], W, true);     // 奥=もう一種(固有種は二種だけ)
    this.say(ctx, W, H, "十の星。星ごとに、二種だけが生きる。", this.fade(u), "#e8dcc6");
  },

  // ④実験 — 余白=左上の闇。右に装置、左下から見上げる主役
  cut4(ctx, W, H, u) {
    const P = this.pal(3), e = u * u * (3 - 2 * u);
    this.sky(ctx, W, H, P[0], P[1], 3);
    const cx = W * .68, cy = H * .40, R = H * .36;                            // 背景: 四重の環(実装と同じ4基)
    this.slitRings(ctx, cx, cy, R, u * (this.durs()[3] || 1.8), P[1]);
    this.poly(ctx, [W * .52, H * .80, W * .84, H * .80, W * .90, H * .92, W * .46, H * .92], P[2]); // 中景: 台座
    const bt = (u * 2.2) % 1;                                                  // 差し色: 落ちる球→中心に灯る
    if (bt < .72) this.disc(ctx, cx, cy - H * (.40 - .40 * (bt / .72)), H * .016, P[4]);
    if (e > .55) this.disc(ctx, cx, cy, H * (.02 + .05 * (e - .55) / .45), P[4]);
    this.rect(ctx, 0, H * .885, W, H * .115, P[2]);                            // 床=中景値
    this.lizHead(ctx, W * -.04, H * .30, W * .60, P[3], P[4], W, false);       // 前景: 見上げる主役(最後=最も手前)
    this.say(ctx, W, H, "何度も試し、ようやく一つが灯った。", this.fade(u), "#e8dcc6");
  },

  // ⑤祝祭 — 余白=左上。虹は「太い塗りの帯」で描く(細い弧の重ねは禁止)
  cut5(ctx, W, H, u) {
    const P = this.pal(4), e = u * u * (3 - 2 * u);
    this.sky(ctx, W, H, P[0], P[1], 3);
    const RB = ["#c9313a", "#e2762f", "#e8c34a", "#7bd986", "#4fb3d9", "#4a63c9", "#9a5bd0"];
    const cx = W * .60, cy = H * (1.22 - .10 * e), R0 = H * 1.08;
    for (let i = 0; i < 7; i++) {                                              // 背景: 虹=7本の太い帯
      const rO = (R0 - i * H * .078) * (0.25 + 0.75 * e), rI = rO - H * .072 * (0.25 + 0.75 * e);
      this.ringBand(ctx, cx, cy, rO, rI, Math.PI * 1.06, Math.PI * 1.94, RB[i]);
    }
    this.poly(ctx, [0, H * .72, W * .34, H * .66, W * .70, H * .74, W, H * .68, W, H * .88, 0, H * .88], P[2]); // 中景: 丘
    const sx = W * .74, sy = H * .58;                                          // 差し色: 賢者の石
    this.poly(ctx, [sx, sy - H * .05, sx + H * .04, sy, sx, sy + H * .05, sx - H * .04, sy], "#f2b23c");
    this.rect(ctx, 0, H * .875, W, H * .125, P[2]);                            // 床=中景値
    this.lizBody(ctx, W * -.03, H * .115, W * .62, P[3], W, false);            // 前景: 祝う群れ(手前=大)
    this.lizBody(ctx, W * .52, H * .335, W * .30, P[3], W, true);
    this.lizBody(ctx, W * .78, H * .400, W * .23, P[3], W, false);
    this.say(ctx, W, H, "虹は生命の祝祭。石は、個性の錬成。", this.fade(u), "#e8dcc6");
  },

  // ⑥コロニーと題 — 余白=中央上(タイトルの居場所)。手前に群れ、奥に巣と水
  cut6(ctx, W, H, u) {
    const P = this.pal(5), e = u * u * (3 - 2 * u);
    this.sky(ctx, W, H, P[0], P[1], 4);
    this.disc(ctx, W * .84, H * .16, H * .09, "#e8dcc6");
    this.poly(ctx, [0, H * .66, W * .28, H * .58, W * .52, H * .68, W, H * .60, W, H * .80, 0, H * .80], P[2]);
    this.poly(ctx, [W * .30, H * .78, W * .62, H * .76, W * .66, H * .84, W * .26, H * .86], "#3d6f8a");
    for (let i = 0; i < 3; i++) { const nx = W * (.08 + i * .30); this.poly(ctx, [nx, H * .74, nx + W * .10, H * .67, nx + W * .20, H * .74], P[3]); }
    this.rect(ctx, 0, H * .86, W, H * .14, P[2]);
    this.lizBody(ctx, W * -.06, H * .095, W * .64, P[3], W, false);  // 手前=大きく暗い主役
    this.lizBody(ctx, W * .46, H * .335, W * .30, P[3], W, true);
    this.lizBody(ctx, W * .70, H * .390, W * .24, P[3], W, false);
    this.lizBody(ctx, W * .30, H * .430, W * .19, P[3], W, true);
    if (e > .38) {
      const a = Math.min(1, (e - .38) / .32);
      ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc6"; ctx.font = `700 ${Math.round(H * .125)}px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
      ctx.fillText("トカゲコロニー", W * .5, H * .36);
      ctx.fillStyle = "#f2b23c"; ctx.font = `500 ${Math.round(H * .045)}px "Hiragino Kaku Gothic ProN",sans-serif`;
      ctx.fillText("LIZARD COLONY", W * .5, H * .45);
      ctx.globalAlpha = 1; ctx.textAlign = "left";
    } else this.say(ctx, W, H, "あとは、育てて、眺めるだけ。", this.fade(u * 2.4), "#e8dcc6");
  },

  cuts() { return [this.cut1, this.cut2, this.cut3, this.cut4, this.cut5, this.cut6]; },

  // 時刻t(秒)の画を描く。カット境界は尺CFGから決まる。決定論=同じtなら同じ画
  drawAt(ctx, W, H, t) {
    const d = this.durs(), C = this.cuts();
    let acc = 0, i = 0;
    for (; i < C.length; i++) { if (t < acc + d[i]) break; acc += d[i]; }
    if (i >= C.length) { i = C.length - 1; acc = this.total() - d[i]; }
    const u = Math.max(0, Math.min(1, (t - acc) / d[i]));
    ctx.clearRect(0, 0, W, H);
    C[i].call(this, ctx, W, H, u);
    return { cut: i + 1, u: u };
  },

  // ---- 再生機構(②〜④に再利用。本編ループには一切足さない=再生中だけ自前のrAF) ----
  play(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const reduced = opts.reduced != null ? opts.reduced : (typeof Motion !== "undefined" && Motion.reduced);
    const skippable = opts.skippable != null ? opts.skippable : ((typeof CFG === "undefined") || CFG.openingSkippable !== false);
    const total = this.total();
    const st = { done: false, skipped: false, raf: 0, t: 0 };
    const finish = (skipped) => {
      if (st.done) return; st.done = true; st.skipped = !!skipped;
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st._unbind) st._unbind();
      this.drawAt(ctx, W, H, total - 0.001);          // 中断でも最終画(タイトル)を残す
      if (opts.onEnd) opts.onEnd(st);
    };
    st.skip = function () { finish(true); };
    if (reduced) { this.drawAt(ctx, W, H, total - 0.001); st.done = true; if (opts.onEnd) opts.onEnd(st); return st; }
    const now = opts.now || (() => performance.now());
    const t0 = now();
    const loop = () => {
      st.t = (now() - t0) / 1000;
      if (st.t >= total) return finish(false);
      this.drawAt(ctx, W, H, st.t);
      st.raf = requestAnimationFrame(loop);
    };
    loop();
    if (skippable && opts.bind !== false) {
      const onSkip = () => st.skip();
      st._unbind = () => { canvas.removeEventListener("pointerdown", onSkip); window.removeEventListener("keydown", onSkip); };
      canvas.addEventListener("pointerdown", onSkip);
      window.addEventListener("keydown", onSkip);
    }
    return st;
  },
  // 再生済みフラグ。store は呼び出し側が注入する(本モジュールはセーブに直接触れない)
  PLAYED_KEY: "openingPlayed",
  isPlayed(store) { return !!(store && store[this.PLAYED_KEY]); },
  markPlayed(store) { if (store) store[this.PLAYED_KEY] = 1; return store; },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Opening };
