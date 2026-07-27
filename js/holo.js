"use strict";
// =============================================================
// holo — シネマティック「HOLO BRIEFING」(V5C2)【独立モジュール】
// 本部システムが新任ディレクターへ行う起動ブリーフィング。演出でなく機構。
//
// 【表現規律(§2)】C1(切り絵2D)の禁止事項は本アークに適用しない。
//   stroke=HUDの主要素 / shadowBlur=ホログラムの実在感 / グラデーション=走査線・減衰・スイープ に積極的に使う。
//   唯一の禁則=「立体的な陰影で物体をリアルに見せる」用途に使わない(ホログラムは半透明の光の投影)。
// 【様式の正本】docs/design/hq-holo-command-poc.html。虚空#04060a / 琥珀#ffb547 / 深紅#d2384a / 白青#dfe9ee の3色+虚空。
// 【疑似3D(§2-2)】ライブラリ不可。回転行列+透視投影を自前実装し、奥の線を減光して立体感を出す。
// 【嘘をつかない(§4)】表示する惑星名・種名・幾何・確率は実データ(STAGES/SPECIES/CFG)由来。
//   伏せる場合は REDACTED / UNRESOLVED / CONTAINMENT FAILED の遮蔽表示を使い、偽の数値を書かない。
// 【決定論】乱数不使用。グリッチもハッシュ+時刻バケット。
// 本編のロジック・セーブ・経済・確率・純血・魂に非接触。再生中だけ自前のrAF。
// =============================================================

const Holo = {
  // ---- 決定論ハッシュ ----
  h(a, b) {
    let t = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B)) >>> 0;
    t ^= t >>> 15; t = Math.imul(t, 0x2545F491); t ^= t >>> 13; t ^= t >>> 16;
    return (t >>> 0) / 4294967296;
  },
  C() {
    const c = (typeof CFG !== "undefined" && CFG.holoPal) || {};
    return { void: c.void || "#04060a", amber: c.amber || "#ffb547", crim: c.crim || "#d2384a", pale: c.pale || "#dfe9ee" };
  },
  grid() { return (typeof CFG !== "undefined" && CFG.holoGridSec) || 0.4; },

  // ---- 実データ(捏造しない) ----
  planets() {
    if (typeof STAGES === "undefined") return [];
    return STAGES.map((s) => ({
      id: s.id, pname: (s.pname || "").replace(/^惑星/, ""), name: s.name,
      sp: (typeof SPECIES !== "undefined" ? SPECIES.filter((x) => x.stage === s.id).map((x) => x.name) : []),
      sk: (typeof CFG !== "undefined" && CFG.slitSkinByStage && CFG.slitSkinByStage[s.id]) || null,
    }));
  },

  // =============================================================
  // 疑似3D: 回転行列 + 透視投影(自前)
  // =============================================================
  rot3(p, ax, ay) {
    const ca = Math.cos(ay), sa = Math.sin(ay);
    let x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca, y = p[1];
    const cb = Math.cos(ax), sb = Math.sin(ax);
    const y2 = y * cb - z * sb, z2 = y * sb + z * cb;
    return [x, y2, z2];
  },
  proj(p, cx, cy, scale, d) {
    d = d || 3.2;
    const f = d / (d + p[2]);           // 透視投影(遠いほど小さい)
    return { x: cx + p[0] * scale * f, y: cy + p[1] * scale * f, z: p[2], f: f };
  },
  // ワイヤーフレーム球(緯線+経線)。奥の線は減光=陰線処理の簡略
  sphere(ctx, cx, cy, r, ax, ay, col, alpha, seg) {
    seg = seg || 12;
    const LAT = 6, LON = 12, N = seg * 3;
    ctx.lineWidth = 1;
    for (let i = 1; i < LAT; i++) {                 // 緯線
      const phi = Math.PI * i / LAT;
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const th = 6.28318 * k / N;
        const p = this.rot3([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)], ax, ay);
        const q = this.proj(p, cx, cy, r);
        k === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = col; ctx.globalAlpha = alpha * 0.55; ctx.stroke();
    }
    for (let j = 0; j < LON; j++) {                 // 経線(奥半分は減光)
      const th = 6.28318 * j / LON;
      for (const half of [0, 1]) {
        ctx.beginPath();
        let any = false;
        for (let k = 0; k <= N; k++) {
          const phi = Math.PI * k / N;
          const p = this.rot3([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)], ax, ay);
          if ((half === 0) !== (p[2] < 0)) { any = false; continue; }
          const q = this.proj(p, cx, cy, r);
          any ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); any = true;
        }
        ctx.strokeStyle = col; ctx.globalAlpha = alpha * (half === 0 ? 1 : 0.28); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },

  // ---- HUDの語彙(様式の正本から継承) ----
  bracket(ctx, x, y, w, h, len, col, alpha, lw) {
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw || 1.2;
    const L = len || 12;
    const cor = [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]];
    for (const [px, py, sx, sy] of cor) {
      ctx.beginPath(); ctx.moveTo(px + sx * L, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * L); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  tickRing(ctx, cx, cy, r, n, a0, a1, col, alpha, lw, tick) {
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw || 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, t = (i % 5 === 0 ? (tick || 7) : (tick || 7) * 0.45);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * (r + t), cy + Math.sin(a) * (r + t));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  mono(ctx, txt, x, y, size, col, alpha, align) {
    ctx.font = `${size}px ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace`;
    ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.textAlign = align || "left";
    ctx.fillText(txt, x, y); ctx.globalAlpha = 1; ctx.textAlign = "left";
  },
  jp(ctx, txt, x, y, size, col, alpha, align) {
    ctx.font = `700 ${size}px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
    ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.textAlign = align || "left";
    ctx.fillText(txt, x, y); ctx.globalAlpha = 1; ctx.textAlign = "left";
  },
  glow(ctx, col, blur) { ctx.shadowColor = col; ctx.shadowBlur = blur; },  // §2-0: 発光はホログラムの必須語彙
  noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; },

  // 走査線+微細ノイズ+レターボックス(質感)
  scan(ctx, W, H, t, k) {
    const C = this.C();
    ctx.save();
    ctx.globalAlpha = 0.10 * k; ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    // 走る走査帯(グラデーション=減衰の表現)
    const sy = ((t * 140) % (H + 240)) - 120;
    const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
    g.addColorStop(0, "rgba(223,233,238,0)"); g.addColorStop(0.5, `rgba(223,233,238,${0.05 * k})`); g.addColorStop(1, "rgba(223,233,238,0)");
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, sy - 60, W, 120);
    ctx.restore();
  },
  letterbox(ctx, W, H, k) {
    const b = H * 0.085 * k;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b);
  },
  // グリッチ(決定論): バケットごとに横ずれの帯を数本
  glitch(ctx, W, H, t, amt) {
    if (amt <= 0) return;
    const bk = Math.floor(t / 0.13);
    if (this.h(bk, 91) > amt) return;
    const C = this.C();
    for (let i = 0; i < 3; i++) {
      const y = this.h(bk, 100 + i) * H, hh = 2 + this.h(bk, 200 + i) * 9;
      const dx = (this.h(bk, 300 + i) - 0.5) * 26;
      ctx.globalAlpha = 0.5; ctx.fillStyle = i === 1 ? C.crim : C.pale;
      ctx.fillRect(dx, y, W * (0.2 + this.h(bk, 400 + i) * 0.5), hh * 0.4);
      ctx.globalAlpha = 1;
    }
  },

  // =============================================================
  // 基準カット(§6-1): 起動 → 点火 → ノード1 → ノード2 の最初の3.2秒
  //   0.4秒のリズムグリッド上でのみカットを切る(§3-4)
  //   variant: "core"(深紅の芯線が走る) | "beam"(走査ビームが横断する)
  // =============================================================
  drawCut(ctx, W, H, t, variant) {
    const C = this.C(), G = this.grid();
    ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const cell = (i) => t >= i * G;              // グリッド i 番目に到達したか
    const since = (i) => Math.max(0, t - i * G);
    const upto = (i, dur) => Math.min(1, since(i) / dur);

    // ---- 0.0-0.4 起動: 細い琥珀線が水平に伸びる ----
    if (cell(0)) {
      const k = upto(0, G);
      this.glow(ctx, C.amber, 12);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(cx - W * 0.44 * k, cy); ctx.lineTo(cx + W * 0.44 * k, cy); ctx.stroke();
      this.noGlow(ctx); ctx.globalAlpha = 1;
    }
    // ---- 0.4-0.8 ブラケットが噛み合う ----
    if (cell(1)) {
      const k = upto(1, G), e = 1 - Math.pow(1 - k, 3);
      const bw = W * 0.78, bh = H * 0.66;
      this.glow(ctx, C.amber, 8);
      this.bracket(ctx, cx - bw / 2 - (1 - e) * 60, cy - bh / 2 - (1 - e) * 40, bw + (1 - e) * 120, bh + (1 - e) * 80, 22, C.amber, 0.85 * e, 1.4);
      this.noGlow(ctx);
      this.tickRing(ctx, cx, cy, Math.min(W, H) * 0.30 * (0.6 + 0.4 * e), 48, -2.2, 2.2, C.amber, 0.30 * e, 1, 6);
    }
    // ---- 0.8-1.2 BOOT テレメトリ(実データ) ----
    if (cell(2)) {
      const k = upto(2, G), n = Math.floor(k * 6);
      const P = this.planets();
      const lines = [
        "HQ HOLO COMMAND / BOOT",
        `PLANETS ......... ${P.length}`,
        `ENDEMIC / PLANET . 2`,
        `SLIT RINGS ...... ${(typeof CFG !== "undefined" && CFG.slitRings) || 4}`,
        `TRAITS .......... ${(typeof TRAITS !== "undefined") ? Object.keys(TRAITS).length : 18}`,
        "DIRECTOR ........ NEW",
      ];
      // 点火(1.2s)でテレメトリは退場する=ノードの視認性を奪わない(§7-6 読めるか)
      const fade = Math.max(0, 1 - Math.max(0, (t - G * 3) / (G * 0.9)));
      for (let i = 0; i <= n && i < lines.length; i++) {
        this.mono(ctx, lines[i], W * 0.10, H * 0.235 + i * 15, 11, i === 0 ? C.amber : C.pale, (i === 0 ? 0.95 : 0.55) * fade);
      }
      this.mono(ctx, "LIZARD COLONY / SYSTEM", W * 0.90, H * 0.235, 10, C.amber, 0.45 * fade, "right");
    }
    // ---- 1.2-2.0 点火: 導火線(2案) ----
    let fuseX = -1;
    if (cell(3)) {
      const k = Math.min(1, since(3) / (G * 2));      // 2グリッド=0.8秒で横断
      fuseX = W * (0.06 + 0.88 * k);
      if (variant === "beam") {
        // 案b: 走査ビームが横断する。通過した後ろにHUDの格子が残る(=システムが起動していく)
        const g = ctx.createLinearGradient(fuseX - 90, 0, fuseX + 26, 0);
        g.addColorStop(0, "rgba(210,56,74,0)"); g.addColorStop(0.72, "rgba(210,56,74,0.30)"); g.addColorStop(1, "rgba(223,233,238,0.85)");
        ctx.fillStyle = g; ctx.fillRect(fuseX - 90, H * 0.12, 116, H * 0.76);
        this.glow(ctx, C.pale, 18);
        ctx.strokeStyle = C.pale; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.moveTo(fuseX, H * 0.12); ctx.lineTo(fuseX, H * 0.88); ctx.stroke();
        this.noGlow(ctx); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.amber; ctx.globalAlpha = 0.16; ctx.lineWidth = 1;  // 通過済みの格子
        for (let gx = W * 0.06; gx < fuseX; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, H * 0.14); ctx.lineTo(gx, H * 0.86); ctx.stroke(); }
        for (let gy = H * 0.16; gy < H * 0.86; gy += 42) { ctx.beginPath(); ctx.moveTo(W * 0.06, gy); ctx.lineTo(fuseX, gy); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else {
        // 案a: 深紅の芯線が走る。合成特性の共通の格=芯線を導火線に見立てる
        const yOf = (x) => cy + Math.sin(x / W * 6.0) * H * 0.055 + Math.sin(x / W * 17.0) * H * 0.012;
        ctx.strokeStyle = C.crim; ctx.lineWidth = 2.0; ctx.globalAlpha = 0.30;   // 焼け跡(通過後に残る)
        ctx.beginPath();
        for (let x = W * 0.06; x <= fuseX; x += 4) { const y = yOf(x); x === W * 0.06 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        this.glow(ctx, C.crim, 22);                                              // 走る芯(先端ほど明るい)
        ctx.strokeStyle = C.crim; ctx.lineWidth = 2.6; ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let x = Math.max(W * 0.06, fuseX - 120); x <= fuseX; x += 3) { const y = yOf(x); ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.fillStyle = C.pale; ctx.beginPath(); ctx.arc(fuseX, yOf(fuseX), 3.2, 0, 7); ctx.fill();
        this.noGlow(ctx); ctx.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {                                            // 火花(決定論)
          const bk = Math.floor(t * 24), a = this.h(bk, i) * 6.28, d = 4 + this.h(bk, i + 40) * 16;
          ctx.globalAlpha = 0.5; ctx.fillStyle = i % 2 ? C.amber : C.crim;
          ctx.fillRect(fuseX + Math.cos(a) * d, yOf(fuseX) + Math.sin(a) * d, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
    }
    // ---- 2.0-2.6 ノード1: 故郷の崩壊 / CONTAINMENT FAILED ----
    if (cell(5)) {
      const k = Math.min(1, since(5) / (G * 1.5));
      const open = Math.min(1, k * 3), close = Math.max(0, 1 - Math.max(0, (k - 0.78) / 0.22));
      const a = open * close;
      const r = Math.min(W, H) * 0.225;
      const nx = W * 0.38, ny = H * 0.47;
      ctx.save();
      this.glow(ctx, C.amber, 10);
      this.sphere(ctx, nx, ny, r * (0.9 + 0.1 * k), 0.42, t * 1.1, C.amber, 0.75 * a, 14);
      this.noGlow(ctx);
      // 侵食: 深紅の楔が球を食う(崩壊の進行)
      for (let i = 0; i < 8; i++) {
        const ang = this.h(i, 5) * 6.28, w = 0.10 + this.h(i, 9) * 0.16, rr = r * (0.4 + this.h(i, 3) * 0.75) * (0.3 + k);
        ctx.fillStyle = C.crim; ctx.globalAlpha = 0.55 * a;
        ctx.beginPath(); ctx.moveTo(nx, ny);
        ctx.arc(nx, ny, rr, ang - w, ang + w); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.tickRing(ctx, nx, ny, r * 1.25, 36, -1.9, 1.9, C.crim, 0.5 * a, 1, 6);
      this.bracket(ctx, nx - r * 1.5, ny - r * 1.5, r * 3, r * 3, 16, C.crim, 0.6 * a, 1.2);
      this.glow(ctx, C.crim, 14);
      this.mono(ctx, "CONTAINMENT FAILED", nx, ny + r * 1.72, 13, C.crim, 0.95 * a, "center");
      this.noGlow(ctx);
      this.mono(ctx, "ORIGIN / HOMEWORLD", nx, ny - r * 1.62, 10, C.pale, 0.45 * a, "center");
      ctx.restore();
    }
    // ---- 2.4-3.2 ノード2: 十の惑星が流れる(固有の幾何環=四重スリットの確定意匠を引用) ----
    if (cell(6)) {
      const k = Math.min(1, since(6) / (G * 2));
      const P = this.planets();
      ctx.save();
      for (let i = 0; i < P.length; i++) {
        const span = W * 1.7;
        const px = W * 1.02 - ((i / P.length) * span + k * span * 1.15) % (span + W * 0.5);
        if (px < -80 || px > W + 80) continue;
        const py = H * 0.62 + Math.sin(i * 1.7) * H * 0.07;
        const r = Math.min(W, H) * 0.062;
        const a = 0.9 * Math.min(1, k * 4);
        this.glow(ctx, C.amber, 8);
        this.sphere(ctx, px, py, r, 0.35, t * 1.6 + i, C.amber, 0.62 * a, 10);
        this.noGlow(ctx);
        this.planetRing(ctx, px, py, r * 1.5, P[i].sk, C.amber, 0.55 * a);   // 固有の幾何環
        this.mono(ctx, P[i].pname, px, py + r * 2.1, 9, C.pale, 0.5 * a, "center");
      }
      this.mono(ctx, "TEN WORLDS / ROUTE", W * 0.5, H * 0.845, 11, C.amber, 0.7 * Math.min(1, k * 3), "center");
      ctx.restore();
    }

    // ---- 質感(全編共通) ----
    this.glitch(ctx, W, H, t, (typeof CFG !== "undefined" && CFG.holoGlitchRate != null) ? CFG.holoGlitchRate : 0.10);
    this.scan(ctx, W, H, t, 1);
    this.letterbox(ctx, W, H, 1);
    // 下部ティッカー(様式の正本より)
    const P2 = this.planets();
    if (P2.length) {
      const items = P2.map((p) => `${p.pname} · ${p.sp.join(" / ")}`).join("   ·   ");
      const tw = items.length * 5.4;
      this.mono(ctx, items, W - ((t * 46) % (tw + W)), H * 0.962, 9, C.amber, 0.30);
    }
  },

  // 惑星の固有幾何環(四重スリットの確定意匠を引用・線で描く=HUDの語彙)
  planetRing(ctx, cx, cy, r, sk, col, alpha) {
    const kind = (sk && sk.shape) || (sk && sk.rings && sk.rings[0] && sk.rings[0].shape) || "ring";
    const s = (sk && sk.rings && sk.rings[0]) ? Object.assign({}, sk, sk.rings[0]) : (sk || {});
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = 0; d <= 360; d += 4) {
      const th = d * Math.PI / 180; let rr = r;
      if (kind === "poly" && s.sides) { const seg = 360 / s.sides, aa = ((d % seg) - seg / 2) * Math.PI / 180; rr = r * Math.cos(Math.PI / s.sides) / Math.cos(aa); }
      else if (kind === "star" && s.points) { const seg = 360 / s.points, aa = ((d % seg) + seg) % seg, hh = seg / 2, f = aa <= hh ? aa / hh : (seg - aa) / hh; rr = r * (1 - (1 - s.innerF) * f); }
      else if (kind === "gear") { const seg = 360 / (s.teeth || 14), aa = ((d % seg) + seg) % seg; rr = aa < seg * (s.toothFrac || .45) ? r * (1 - (s.toothDepth || .16)) : r; }
      else if (kind === "organic") { rr = r * (1 + (s.wobAmp || .05) * Math.sin((s.wobLobes || 7) * th)); }
      else if (kind === "reuleaux") { for (let q = 0; q < 3; q++) { const dd = (((d - q * 120) % 360) + 360) % 360; if (dd >= 120 && dd <= 240) { const tt = dd * Math.PI / 180; rr = r * (Math.cos(tt) + Math.sqrt(3 - Math.sin(tt) * Math.sin(tt))); break; } } }
      const x = cx + rr * Math.cos(th), y = cy - rr * Math.sin(th) * 0.42;   // 環は寝かせる(軌道に見せる)
      d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  },

  cutDur() { return this.grid() * 8; },   // 基準カット=8グリッド=3.2秒

  // ---- 再生機構(将来の差込先に再利用・本編ループには足さない) ----
  play(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    const reduced = opts.reduced != null ? opts.reduced : (typeof Motion !== "undefined" && Motion.reduced);
    const total = opts.total || this.cutDur();
    const variant = opts.variant || "core";
    const st = { done: false, skipped: false, raf: 0, t: 0 };
    const finish = (sk) => {
      if (st.done) return; st.done = true; st.skipped = !!sk;
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st._unbind) st._unbind();
      this.drawCut(ctx, W, H, total - 0.001, variant);
      if (opts.onEnd) opts.onEnd(st);
    };
    st.skip = function () { finish(true); };
    if (reduced) { this.drawCut(ctx, W, H, total * 0.86, variant); st.done = true; if (opts.onEnd) opts.onEnd(st); return st; }
    const now = opts.now || (() => performance.now());
    const t0 = now();
    const loop = () => {
      st.t = (now() - t0) / 1000;
      if (st.t >= total) { if (opts.loop) { st.t = 0; return finishLoop(); } return finish(false); }
      this.drawCut(ctx, W, H, st.t, variant);
      st.raf = requestAnimationFrame(loop);
    };
    const finishLoop = () => { const t1 = now(); st._t0 = t1; loopFrom(t1); };
    const loopFrom = (base) => {
      const l2 = () => {
        st.t = ((now() - base) / 1000) % total;
        this.drawCut(ctx, W, H, st.t, variant);
        st.raf = requestAnimationFrame(l2);
      };
      l2();
    };
    loop();
    if (opts.bind !== false && ((typeof CFG === "undefined") || CFG.holoSkippable !== false)) {
      const onSkip = () => st.skip();
      st._unbind = () => { canvas.removeEventListener("pointerdown", onSkip); window.removeEventListener("keydown", onSkip); };
      canvas.addEventListener("pointerdown", onSkip);
      window.addEventListener("keydown", onSkip);
    }
    return st;
  },
  PLAYED_KEY: "holoPlayed",
  isPlayed(store) { return !!(store && store[this.PLAYED_KEY]); },
  markPlayed(store) { if (store) store[this.PLAYED_KEY] = 1; return store; },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Holo };
