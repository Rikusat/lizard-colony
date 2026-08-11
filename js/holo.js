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
  // 色ユーティリティ(hex→rgba / 虚空の上で読める明度まで持ち上げる)
  rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return `rgba(223,233,238,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  },
  // 惑星の色調(その惑星のパレットを引用)。虚空#04060aの上で線が読めない暗い空は明度を底上げする
  tintOf(st) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String((st && (st.sky || st.ground)) || "").trim());
    if (!m) return this.C().amber;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const MIN = 168, lum = (rr, gg, bb) => 0.299 * rr + 0.587 * gg + 0.114 * bb;
    const l0 = lum(r, g, b);
    if (l0 < MIN) {   // ①色相を保ったまま増幅 → ②飽和(255で頭打ち)で届かない分だけ白へ寄せる
      const f = MIN / Math.max(1, l0);
      r = Math.min(255, Math.round(r * f)); g = Math.min(255, Math.round(g * f)); b = Math.min(255, Math.round(b * f));
      const l1 = lum(r, g, b);
      if (l1 < MIN) {
        const w = (MIN - l1) / (255 - l1);
        r = Math.round(r + (255 - r) * w); g = Math.round(g + (255 - g) * w); b = Math.round(b + (255 - b) * w);
      }
    }
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  },

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
  // 【共通様式】走査ビーム(案b・C2改訂でHUDトランジションの共通の格として採用)
  //   白青のビームが横断し、通過した後ろにHUDの格子が起動して残る=システムが立ち上がっていく。
  //   ★基準カットの欠陥是正: 従来は横断完了(p=1)後もビームが右端(0.94W)に描かれ続け、
  //     後続のノード表示と競合した。head を画面外まで走らせ、末尾 CFG.holoBeamTailF で減衰させて必ず消す。
  //   戻り値 {x,a} は「通過後に残っていないこと」を恒久テストで測るための観測点。
  // =============================================================
  beam(ctx, W, H, p, opts) {
    opts = opts || {};
    const C = this.C();
    const col = opts.col || C.pale, gcol = opts.grid || C.amber;
    const y0 = opts.y0 != null ? opts.y0 : H * 0.12, y1 = opts.y1 != null ? opts.y1 : H * 0.88;
    const tail = (typeof CFG !== "undefined" && CFG.holoBeamTailF != null) ? CFG.holoBeamTailF : 0.18;
    const k = Math.max(0, Math.min(1, p));
    const x = W * (-0.04 + 1.12 * k);                                        // 画面外→画面外(必ず抜ける)
    let a = k <= 1 - tail ? 1 : Math.max(0, 1 - (k - (1 - tail)) / tail);     // 末尾で減衰して消える
    if (a < 1e-6) a = 0;   // 浮動小数の残差(≒1e-16)で「消えたはずのビーム」が描かれるのを断つ
    const gx0 = W * 0.06, gx1 = Math.min(x, W * 0.94);
    const gy0 = y0 + (y1 - y0) * 0.03, gy1 = y1 - (y1 - y0) * 0.03;
    ctx.save();
    if (gx1 > gx0) {                                                          // 通過済みの格子(ビームが消えた後も残る)
      ctx.strokeStyle = gcol; ctx.globalAlpha = 0.16 * (opts.gridA != null ? opts.gridA : 1); ctx.lineWidth = 1;
      for (let gx = gx0; gx < gx1; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx, gy1); ctx.stroke(); }
      for (let gy = gy0; gy < gy1; gy += 42) { ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke(); }
    }
    if (a > 0) {
      const g = ctx.createLinearGradient(x - 90, 0, x + 26, 0);                // 尾(減衰)→先端(白青の閃光)
      g.addColorStop(0, this.rgba(C.crim, 0)); g.addColorStop(0.72, this.rgba(C.crim, 0.30 * a)); g.addColorStop(1, this.rgba(col, 0.85 * a));
      ctx.fillStyle = g; ctx.fillRect(x - 90, y0, 116, y1 - y0);
      this.glow(ctx, col, 18);
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95 * a;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      this.noGlow(ctx);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    return { x: x, a: a };
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
        // 案b(C2改訂で共通様式に採用): 共通の beam() を呼ぶ=同じ知識を2箇所に持たない。
        //   横断後は減衰して消えるため、ノード1〜2の視認性を奪わない(欠陥是正)。
        fuseX = this.beam(ctx, W, H, k, { y0: H * 0.12, y1: H * 0.88 }).x;
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

  // =============================================================
  // C2 フェーズ2 オープニング「バガー暴走からの飛び立ち」(物語軸)
  //   前版の9ノード予告モンタージュは破棄。尺の唯一の真実は CFG.holoOpenNodes(グリッド番号の表)。
  //   本セッションは前半(1 静穏 → 2 異常 → 3 暴走 → 4 ヌシ・バガーの影)のみ。
  //   ★案a(core=深紅の芯線)の語彙はここで正式に役割を得る: 「焼け跡が残り火花が散る」を
  //     侵食が球面を走る表現へ転用する(横一直線でなく球面上を走らせる)。
  // =============================================================
  openNodes() {
    return (typeof CFG !== "undefined" && CFG.holoOpenNodes) || [
      { id: "calm", grid: 0 }, { id: "anomaly", grid: 5 }, { id: "rampage", grid: 10 },
      { id: "blackout", grid: 17 }, { id: "bagger", grid: 18 }, { id: "end", grid: 20 },
    ];
  },
  openAt(id) {                       // ノード開始秒(必ずグリッド上に乗る)
    const n = this.openNodes().find((x) => x.id === id);
    return n ? n.grid * this.grid() : 0;
  },
  openDur() {                        // 尺(CFGの上限でクランプ)
    const max = (typeof CFG !== "undefined" && CFG.holoOpenMaxSec) || 15;
    return Math.min(max, this.openAt("end"));
  },
  openAfter(id) {                    // そのノードの終端秒(=次ノードの開始)。尺の真実はノード表だけ=長さを別途持たない
    const ns = this.openNodes(), i = ns.findIndex((x) => x.id === id);
    return (i >= 0 && ns[i + 1]) ? ns[i + 1].grid * this.grid() : this.openDur();
  },
  openStaticT() {                    // reduced-motion で見せる「最終画」= 題の終盤。
    //   ★0.6ではビームが題の上に重なる位相に当たる。ビームが抜けきり、格子とSYSTEM ONLINEが揃う0.88を採る。
    const a = this.openAt("title"), b = this.openAfter("title");
    return b > a ? a + (b - a) * 0.88 : this.openDur() * 0.86;
  },

  // 機構であることの明示(全編共通のアンカー)。同じ知識を2箇所に持たないため関数化する
  sysTag(ctx, W, H, S, a) { this.mono(ctx, "LIZARD COLONY / SYSTEM", W * 0.06, H * 0.085, 10 * S, this.C().amber, a); },

  // ---- 積載リスト(5 決断)。全行が実データ由来=それらしい品目を捏造しない ----
  //   末尾の1行だけは遮蔽表示。「積んだが正体が分からないもの」=最大の伏線(ヌシ・バガーへ接続する)。
  manifest() {
    const rows = [];
    if (typeof SPECIES !== "undefined") for (const s of SPECIES) rows.push(["SPECIMEN", s.name, "★" + s.stars]);
    if (typeof MORPHS !== "undefined") for (const m of MORPHS) rows.push(["GENOME", m.name, "×" + m.mult.toFixed(1)]);
    if (typeof FACILITIES !== "undefined") for (const f of FACILITIES) rows.push(["APPARATUS", f.name, "Lv" + f.max]);
    if (typeof RESEARCH !== "undefined") for (const r of RESEARCH) rows.push(["ARCHIVE", r.name, "SCI " + ((r.cost && r.cost.science) || 0)]);
    rows.push(["SPECIMEN", "REDACTED", "UNRESOLVED"]);
    return rows;
  },

  // ---- ロケット(6 飛び立ち)。実在の描画資産が無いためHUDの図式として線で組む ----
  //   §2-2の規律どおり回転行列+透視投影で本物の3Dを2Dへ落とす(立体的な陰影は使わない=光の投影のまま)。
  rocketWire(ctx, cx, cy, s, spin, col, alpha) {
    const P = (x, y, z) => this.proj(this.rot3([x, y, z], 0.18, spin), cx, cy, s);
    const prof = [[-1.48, 0.00], [-1.14, 0.14], [-0.70, 0.24], [0.56, 0.24], [0.74, 0.20], [0.92, 0.22]]; // [軸方向(上が負), 半径]
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1.2;
    for (const [y, rr] of prof) {                      // 輪(横断面)
      if (rr <= 0) continue;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const th = 6.28318 * k / 24, q = P(Math.cos(th) * rr, y, Math.sin(th) * rr); k === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    }
    for (let j = 0; j < 6; j++) {                      // 母線(縦)
      const th = 6.28318 * j / 6;
      ctx.beginPath();
      for (let i = 0; i < prof.length; i++) { const q = P(Math.cos(th) * prof[i][1], prof[i][0], Math.sin(th) * prof[i][1]); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    }
    for (let f = 0; f < 3; f++) {                      // フィン
      const th = 6.28318 * f / 3;
      const a = P(Math.cos(th) * 0.24, 0.34, Math.sin(th) * 0.24);
      const b = P(Math.cos(th) * 0.24, 0.92, Math.sin(th) * 0.24);
      const c = P(Math.cos(th) * 0.62, 1.02, Math.sin(th) * 0.62);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // 球面上を走る侵食の芯線(案a の転用)。焼け跡が残り、先端が燃え、火花が散る。決定論(ハッシュのみ)。
  //   奥(z>=0)は減光=既存の陰線処理の簡略と同じ規律。
  emberOnSphere(ctx, cx, cy, r, ax, ay, i, prog, t) {
    const C = this.C();
    if (prog <= 0) return;
    const phi0 = 0.55 + this.h(i, 11) * 2.0;           // 起点(緯)
    const th0 = this.h(i, 23) * 6.28318;                // 起点(経)
    const dPhi = (this.h(i, 31) - 0.5) * 1.6, dTh = (this.h(i, 41) - 0.5) * 4.2; // 進む向き
    const N = 26, span = 2.1 * prog;
    const pt = (s) => {
      const phi = Math.max(0.05, Math.min(3.09, phi0 + dPhi * s)), th = th0 + dTh * s;
      const p = this.rot3([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)], ax, ay);
      return { p: p, q: this.proj(p, cx, cy, r) };
    };
    // 焼け跡(通過後に残る=点火した因果が絵に残る)
    ctx.lineWidth = 2.0; ctx.strokeStyle = C.crim;
    for (let k = 0; k < N; k++) {
      const a = pt(span * k / N), b = pt(span * (k + 1) / N);
      ctx.globalAlpha = (a.p[2] < 0 ? 0.40 : 0.12);
      ctx.beginPath(); ctx.moveTo(a.q.x, a.q.y); ctx.lineTo(b.q.x, b.q.y); ctx.stroke();
    }
    // 走る芯(先端ほど明るい)+火花
    const head = pt(span);
    if (head.p[2] < 0) {
      this.glow(ctx, C.crim, 18);
      ctx.strokeStyle = C.crim; ctx.lineWidth = 2.6; ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const q = pt(Math.max(0, span - 0.22 * (6 - k) / 6)).q; k === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      ctx.fillStyle = C.pale; ctx.beginPath(); ctx.arc(head.q.x, head.q.y, 2.6, 0, 7); ctx.fill();
      this.noGlow(ctx);
      const bk = Math.floor(t * 24);                    // 火花(決定論・時刻バケット)
      for (let k = 0; k < 4; k++) {
        const a = this.h(bk, i * 7 + k) * 6.28, d = 3 + this.h(bk, i * 7 + k + 50) * 13;
        ctx.globalAlpha = 0.55; ctx.fillStyle = k % 2 ? C.amber : C.crim;
        ctx.fillRect(head.q.x + Math.cos(a) * d, head.q.y + Math.sin(a) * d, 1.6, 1.6);
      }
    }
    ctx.globalAlpha = 1;
  },

  // 侵食の被膜(3 暴走 / 5 決断 / 6 飛び立ちで共有=同じ知識を1箇所に置く)。
  //   ★平坦な円で塗ると球が「赤い円盤」に潰れるため、侵食の中心から縁へ落ちる放射グラデーションにして
  //   立体を残す(縁を暗く=球の丸みが読める)。前半のスクショ検分で見つけた欠陥の是正がここに集約される。
  infectWash(ctx, cx, cy, r, k) {
    const C = this.C();
    if (k <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28318); ctx.clip();
    const ix = cx - r * 0.22, iy = cy - r * 0.14;                  // 侵食の中心(やや手前上)
    const w = ctx.createRadialGradient(ix, iy, r * 0.05, ix, iy, r * (0.5 + 1.5 * k));
    w.addColorStop(0, this.rgba(C.crim, 0.52 * k));
    w.addColorStop(0.6, this.rgba(C.crim, 0.30 * k));
    w.addColorStop(1, this.rgba(C.crim, 0));
    ctx.fillStyle = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28318); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  },

  // ヌシ・バガーの影(伏線)。★実物と食い違わないよう Render.drawBaggerParent を**そのまま**呼び、
  //   ホログラム化(低不透明度+走査線+深紅の被膜)だけを被せる。自前で似顔絵を描かない。
  //   槽面のヒビは FIELD.x2(盤の右端)へ描かれる仕様なので、クリップ矩形の外に落ちて出ない。
  //   Render.time はパルスの位相源なので、呼出の間だけ t に固定して決定論を保つ(直後に復帰)。
  baggerShade(ctx, cx, cy, k, t, scale) {
    const C = this.C();
    if (typeof Render === "undefined" || typeof Render.drawBaggerParent !== "function") return false;
    const s = scale || 1;
    const box = [cx - 200 * s, cy - 150 * s, 400 * s, 300 * s];
    const saved = Render.time;
    // 背光(逆光): 影が「浮かび上がる」ための光源。★矩形でなく放射グラデーション=クリップ矩形の縁を見せない
    const bg = ctx.createRadialGradient(cx, cy, 4 * s, cx, cy, 190 * s);
    bg.addColorStop(0, this.rgba(C.crim, 0.34 * k));
    bg.addColorStop(0.55, this.rgba(C.crim, 0.13 * k));
    bg.addColorStop(1, this.rgba(C.crim, 0));
    ctx.fillStyle = bg; ctx.fillRect(box[0], box[1], box[2], box[3]);
    ctx.save();
    ctx.beginPath(); ctx.rect(box[0], box[1], box[2], box[3]); ctx.clip();
    try {
      Render.time = t;
      ctx.globalAlpha = 0.62 * k;   // 0.4秒で「何かいた」と分かる濃さ(薄すぎると伏線にならない)
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      Render.drawBaggerParent(ctx, { snake: { x: cx, y: cy, hp: 1, maxHp: 1 }, boss: true, elite: true, typeId: "bugger", tier: 5 });
    } catch (e) { /* 描画資産が揃わない環境では影を出さない(本編には一切影響させない) */ }
    Render.time = saved;
    ctx.restore();
    // ホログラム化: 走査線で刻む。★線の濃さも中心から縁へ落とす=走査線が張られた矩形の輪郭を出さない
    //   (一様な濃さで矩形を埋めると、暗い背景の上でも「四角い領域」が読めてしまう)
    const sg = ctx.createRadialGradient(cx, cy, 10 * s, cx, cy, 190 * s);
    sg.addColorStop(0, this.rgba(C.void, 0.60 * k));
    sg.addColorStop(0.7, this.rgba(C.void, 0.34 * k));
    sg.addColorStop(1, this.rgba(C.void, 0));
    ctx.save();
    ctx.beginPath(); ctx.rect(box[0], box[1], box[2], box[3]); ctx.clip();
    ctx.fillStyle = sg;
    for (let y = box[1]; y < box[1] + box[3]; y += 3) ctx.fillRect(box[0], y, box[2], 1.5);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  },

  drawOpening(ctx, W, H, t) {
    const C = this.C(), G = this.grid();
    const A = (id) => this.openAt(id);
    const seg = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const S = Math.max(0.75, Math.min(2, H / 675));
    ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);

    const cx = W * 0.40, cy = H * 0.50, r = Math.min(W, H) * 0.26;
    const inNode = (id) => t >= A(id) && t < this.openAfter(id);
    const anomaly = seg(A("anomaly"), A("rampage"));      // 異常の進行 0→1
    const infect = seg(A("rampage"), A("blackout"));      // 侵食の進行 0→1
    const bgGrids = (typeof CFG !== "undefined" && CFG.holoOpenBaggerGrids) || 1;
    const baggerK = t >= A("bagger") ? (1 - seg(A("bagger") + G * bgGrids, this.openAfter("bagger"))) : 0;
    const spin = t * 0.42;                                 // 故郷の自転(静かに回る)
    // 後半(5〜8)の進行。長さは持たず全てノード表から引く=尺の真実を二重化しない
    const decision = seg(A("decision"), this.openAfter("decision"));
    const launch = seg(A("launch"), this.openAfter("launch"));
    const route = seg(A("route"), this.openAfter("route"));
    const title = seg(A("title"), this.openAfter("title"));

    // ---- 暗転(溜め): 深紅の残光だけを置いて全部落とす(空白があるから密が効く §3-4) ----
    //   置き場所は2箇所(3→4の間 / 6の直後)だが、それを決めるのはノード表の blackout* だけ。
    const dk = this.openNodes().find((n) => /^blackout/.test(n.id) && t >= A(n.id) && t < this.openAfter(n.id));
    if (dk) {
      const k = 1 - seg(A(dk.id), this.openAfter(dk.id));
      if (dk.id === "blackout") {
        // 3→4の間: 侵食しきった故郷の残光だけが広がって消える
        this.glow(ctx, C.crim, 26);
        ctx.strokeStyle = C.crim; ctx.globalAlpha = 0.34 * k; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cx, cy, r * (1.0 + (1 - k) * 0.5), 0, 6.28318); ctx.stroke();
        this.noGlow(ctx); ctx.globalAlpha = 1;
        this.mono(ctx, "CONTAINMENT FAILED", cx, cy + r * 1.5, 13 * S, C.crim, 0.5 * k, "center");
      } else {
        // 6の直後: 遠ざかった故郷の小さな残光と、抜けていった航跡だけ。文字は置かない(説明しない)
        const px = W * 0.22, py = H * 0.70;
        this.glow(ctx, C.crim, 14);
        ctx.strokeStyle = C.crim; ctx.globalAlpha = 0.30 * k; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, r * 0.16 * (1 + (1 - k) * 0.4), 0, 6.28318); ctx.stroke();
        this.noGlow(ctx);
        ctx.strokeStyle = C.pale; ctx.globalAlpha = 0.16 * k; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(W * 0.72, H * 0.24); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      this.scan(ctx, W, H, t, 0.5);
      this.letterbox(ctx, W, H, 1);
      return;
    }

    // ---- 1 静穏 / 2 異常 / 3 暴走: 故郷のワイヤーフレーム球 ----
    if (t < A("bagger")) {
      const born = 1 - Math.pow(1 - Math.min(1, t / (G * 2)), 3);   // 起動(最初の2グリッドで現れる)
      this.glow(ctx, C.amber, 10);
      this.sphere(ctx, cx, cy, r, 0.38, spin, C.amber, 0.85 * born * (1 - infect * 0.45), 14);
      this.noGlow(ctx);
      this.tickRing(ctx, cx, cy, r * 1.28, 48, -2.3, 2.3, C.amber, 0.22 * born, 1, 6);
      this.mono(ctx, "HOMEWORLD / REDACTED", cx, cy - r * 1.42, 10 * S, C.pale, 0.42 * born, "center");

      // 2 異常: 深紅の点が球面に灯る(決定論・数は進行に比例)
      if (anomaly > 0) {
        const n = Math.max(1, Math.round(anomaly * 7));
        for (let i = 0; i < n; i++) {
          const phi = 0.5 + this.h(i, 11) * 2.0, th = this.h(i, 23) * 6.28318;
          const p = this.rot3([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)], 0.38, spin);
          if (p[2] >= 0) continue;                                  // 裏側は出さない
          const q = this.proj(p, cx, cy, r);
          const pulse = 0.55 + Math.sin(t * 7 + i) * 0.35;
          this.glow(ctx, C.crim, 12);
          ctx.fillStyle = C.crim; ctx.globalAlpha = Math.min(1, anomaly * 3) * pulse;
          ctx.beginPath(); ctx.arc(q.x, q.y, 2.6 + pulse * 1.4, 0, 7); ctx.fill();
          this.noGlow(ctx); ctx.globalAlpha = 1;
        }
      }

      // 3 暴走: 侵食が球面を走り、覆っていく(案a の語彙=焼け跡+火花)
      if (infect > 0) {
        for (let i = 0; i < 11; i++) {
          const delay = this.h(i, 3) * 0.45;                        // 走り出しを filament ごとにずらす=一斉でなく次々に
          this.emberOnSphere(ctx, cx, cy, r, 0.38, spin, i, Math.max(0, (infect - delay) / (1 - delay)), t);
        }
        this.infectWash(ctx, cx, cy, r, infect);                    // 覆っていく=深紅の被膜が球を飲む
        if (infect > 0.55) {
          this.glow(ctx, C.crim, 14);
          this.mono(ctx, "CONTAINMENT FAILED", cx, cy + r * 1.5, 13 * S, C.crim, Math.min(1, (infect - 0.55) * 5), "center");
          this.noGlow(ctx);
        }
      }
    }

    // ---- 4 ヌシ・バガーの影(1グリッド=0.4秒だけ。長く見せない) ----
    if (baggerK > 0) {
      const drew = this.baggerShade(ctx, cx, cy, baggerK, t, Math.min(W, H) / 620);
      this.glow(ctx, C.crim, 16);
      this.mono(ctx, "UNRESOLVED", cx, cy + r * 1.5, 13 * S, C.crim, 0.85 * baggerK, "center");
      this.noGlow(ctx);
      if (!drew) this.mono(ctx, "SIGNATURE / REDACTED", cx, cy, 11 * S, C.crim, 0.6 * baggerK, "center");
    }

    // ---- 5 決断: HUDが退避計画へ切替。積載リスト(実データ)が高速で流れ、減速して着地する ----
    if (inNode("decision")) {
      const e = 1 - Math.pow(1 - decision, 3);              // 高速→減速: 末尾の数行は読める(§7-6)
      const io = Math.min(1, decision * 6) * (1 - Math.max(0, (decision - 0.9) / 0.1));
      // 置いていく故郷(小さく・深紅に覆われ・まだ燃えている)
      const hx = W * 0.16, hy = H * 0.52, hr = r * 0.46;
      this.sphere(ctx, hx, hy, hr, 0.38, spin, C.crim, 0.72 * io, 10);
      this.infectWash(ctx, hx, hy, hr, io);
      for (let i = 0; i < 3; i++) this.emberOnSphere(ctx, hx, hy, hr, 0.38, spin, i, 1, t);
      this.mono(ctx, "HOMEWORLD / REDACTED", hx, hy + hr * 1.75, 10 * S, C.crim, 0.55 * io, "center");
      // 退避計画のHUD。★列は行幅に合わせて詰める(枠だけ広いと表でなく「壊れたレイアウト」に読める)
      const px = W * 0.38, py = H * 0.19, pw = W * 0.31, ph = H * 0.58;
      this.bracket(ctx, px, py, pw, ph, 18 * S, C.amber, 0.45 * io, 1.2);
      this.glow(ctx, C.amber, 8);
      this.mono(ctx, "EVACUATION PLAN / AUTHORIZED", px + 6 * S, py - 10 * S, 12 * S, C.amber, 0.9 * io);
      this.noGlow(ctx);
      const rows = this.manifest(), VIS = 12, rh = ph / (VIS + 1);
      const top = e * Math.max(0, rows.length - VIS);
      ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
      for (let i = Math.floor(top), last = Math.min(rows.length, Math.floor(top) + VIS + 1); i < last; i++) {
        const y = py + rh * (1 + i - top), sealed = i === rows.length - 1;   // 遮蔽された1行=最大の伏線
        const col = sealed ? C.crim : C.pale;
        this.mono(ctx, rows[i][0], px + 10 * S, y, 10 * S, C.amber, 0.5 * io);
        this.mono(ctx, rows[i][1], px + 88 * S, y, 11 * S, col, (sealed ? 0.95 : 0.8) * io);
        this.mono(ctx, rows[i][2], px + 262 * S, y, 10 * S, col, 0.6 * io);
      }
      ctx.restore();
      this.mono(ctx, "MANIFEST " + rows.length, px + 6 * S, py + ph + 16 * S, 10 * S, C.amber, 0.55 * io);
      this.tickRing(ctx, px + pw + 26 * S, py + ph * 0.5, 13 * S, 24, -1.57, -1.57 + 6.28318 * e, C.pale, 0.5 * io, 1, 4);
      this.sysTag(ctx, W, H, S, 0.45 * io);
    }

    // ---- 6 飛び立ち: ロケットが離れ、深紅に覆われた故郷が遠ざかり小さくなる ----
    if (inNode("launch")) {
      const e = launch * launch;                            // 離昇=だんだん速く
      const io = Math.min(1, launch * 4);
      // ★故郷は左上へ退き、ロケットは右側を上がる。**全位相でシルエットが重ならない**ように分離する
      //   (重なると「惑星の上に立つ玩具のロケット」に読めてしまう=スクショ検分で見つけた欠陥)
      const hx = W * (0.30 - 0.14 * e), hy = H * (0.42 + 0.30 * e), hr = r * (0.60 - 0.44 * e);
      this.sphere(ctx, hx, hy, hr, 0.38, spin, C.crim, 0.80 * (1 - e * 0.35), 10);
      this.infectWash(ctx, hx, hy, hr, 1);                   // 覆われたまま遠ざかる(縁を暗くして丸みを残す)
      const rx = W * (0.50 + 0.26 * e), ry = H * (0.94 - 0.80 * e), rs = Math.min(W, H) * (0.105 - 0.035 * e);
      ctx.strokeStyle = C.pale; ctx.globalAlpha = 0.20; ctx.lineWidth = 1;   // 航跡(通過後に残る)
      ctx.beginPath(); ctx.moveTo(W * 0.50, H * 0.94); ctx.lineTo(rx, ry); ctx.stroke(); ctx.globalAlpha = 1;
      for (let i = 0; i < 9; i++) {                          // 噴射(決定論・時刻バケット)
        const bk = Math.floor(t * 24), dx = (this.h(bk, i) - 0.5) * rs * 0.5, d = this.h(bk, i + 30) * rs * 1.6;
        ctx.globalAlpha = 0.55 * (1 - d / (rs * 1.6)); ctx.fillStyle = i % 3 ? C.amber : C.crim;
        ctx.fillRect(rx + dx, ry + rs * 1.05 + d, 2, 2);
      }
      ctx.globalAlpha = 1;
      this.glow(ctx, C.amber, 12);
      this.rocketWire(ctx, rx, ry, rs, -0.5 + t * 0.5, C.amber, 0.95);
      this.noGlow(ctx);
      // 追跡ロックオン(本部の個体追跡と同じ語彙)=飾りでなく機構に見せる。目盛環は輪郭が浮くので使わない
      this.bracket(ctx, rx - rs * 0.95, ry - rs * 1.75, rs * 1.9, rs * 3.1, 11 * S, C.pale, 0.45 * io, 1);
      // 退避の帳簿(全て実データ由来 or 遮蔽表示)。行き先はまだ UNRESOLVED =7 航路で解決する
      const bx = W * 0.62, by = H * 0.44, rows = [["HOMEWORLD", "REDACTED"], ["DESTINATION", "UNRESOLVED"], ["MANIFEST", String(this.manifest().length)]];
      this.bracket(ctx, bx - 12 * S, by - 24 * S, W * 0.27, 90 * S, 14 * S, C.amber, 0.35 * io, 1.2);
      for (let i = 0; i < rows.length; i++) {
        const yy = by + i * 22 * S, sealed = i < 2;
        this.mono(ctx, (rows[i][0] + " ...........").slice(0, 13), bx, yy, 11 * S, C.amber, 0.45 * io);
        this.mono(ctx, rows[i][1], bx + 104 * S, yy, 11 * S, sealed ? C.crim : C.pale, 0.85 * io);
      }
      this.mono(ctx, "DEPARTURE / VECTOR SET", W * 0.5, H * 0.90, 12 * S, C.amber, 0.75 * io, "center");
      this.sysTag(ctx, W, H, S, 0.45);
    }

    // ---- 7 航路: 十の星。フェーズ1(惑星移動トランジション)の惑星表示語彙をそのまま流用する ----
    if (inNode("route")) {
      const io = Math.min(1, route * 5) * (1 - Math.max(0, (route - 0.88) / 0.12));
      const ids = (typeof STAGES !== "undefined") ? STAGES.map((s) => s.id) : [];
      const n = Math.max(1, ids.length);
      const pos = (i) => ({ x: W * (0.10 + 0.80 * (i / Math.max(1, n - 1))), y: H * (0.50 + Math.sin(i * 0.92) * 0.155) });
      ctx.strokeStyle = C.amber; ctx.globalAlpha = 0.26 * io; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const q = pos(i); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
      ctx.stroke(); ctx.globalAlpha = 1;
      const pr = Math.min(W, H) * 0.052;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, Math.min(1, route * (n + 2) - i));   // 次々に灯る
        if (a <= 0) break;
        const q = pos(i), inf = this.travelInfo(ids[i]), tint = (inf && inf.tint) || C.amber;
        this.glow(ctx, tint, 8);
        this.sphere(ctx, q.x, q.y, pr, 0.35, t * 1.2 + i, tint, 0.80 * a * io, 10);
        this.noGlow(ctx);
        this.planetRing(ctx, q.x, q.y, pr * 1.5, inf && inf.sk, tint, 0.60 * a * io);
        this.jp(ctx, (inf && inf.short) || "REDACTED", q.x, q.y + pr * 2.3, 12 * S, C.pale, 0.85 * a * io, "center");
      }
      this.mono(ctx, "TEN WORLDS / ROUTE", W * 0.5, H * 0.895, 12 * S, C.amber, 0.8 * io, "center");
      this.sysTag(ctx, W, H, S, 0.45 * io);
    }

    // ---- 8 題 → システム起動(導線を途切れさせない: 最後に残るのは本部HUDの格子) ----
    if (inNode("title")) {
      const e = 1 - Math.pow(1 - Math.min(1, title * 2.2), 3);
      const tx = W * 0.5, ty = H * 0.47, bw = W * 0.60, bh = H * 0.26;
      this.bracket(ctx, tx - bw / 2 - (1 - e) * 80, ty - bh / 2 - (1 - e) * 50, bw + (1 - e) * 160, bh + (1 - e) * 100, 22 * S, C.amber, 0.75 * e, 1.4);
      this.tickRing(ctx, tx, ty, Math.min(W, H) * 0.34 * (0.86 + 0.14 * e), 48, -2.2, 2.2, C.amber, 0.22 * e, 1, 6);
      this.glow(ctx, C.pale, 16);
      this.jp(ctx, "トカゲコロニー", tx, ty + 2 * S, 44 * S, C.pale, 0.98 * e, "center");
      this.noGlow(ctx);
      this.mono(ctx, "LIZARD COLONY", tx, ty + 34 * S, 15 * S, C.amber, 0.85 * e, "center");
      // 走査ビームが横断して抜け、HUDの格子だけが残る=次の画面(本部)が既に起動している
      const bp = (title - 0.34) / 0.50;
      if (bp > 0) this.beam(ctx, W, H, bp, { y0: H * 0.10, y1: H * 0.90 });
      this.mono(ctx, "SYSTEM ONLINE", tx, H * 0.855, 11 * S, C.pale, 0.75 * Math.max(0, Math.min(1, (title - 0.55) / 0.20)), "center");
      this.sysTag(ctx, W, H, S, 0.45 * e);
    }

    // ---- テレメトリ(1〜3): 実データが「壊れていく」ことで不穏を作る(偽の数値を足さない) ----
    if (t < A("blackout")) {
      const P = this.planets();
      const rows = [
        ["HQ HOLO COMMAND", "BOOT"],
        ["PLANETS", String(P.length)],
        ["ENDEMIC / PLANET", "2"],
        ["TRAITS", String((typeof TRAITS !== "undefined") ? Object.keys(TRAITS).length : 18)],
        ["CONTAINMENT", infect > 0.55 ? "FAILED" : (anomaly > 0 ? "DEGRADED" : "NOMINAL")],
      ];
      // 警告が1つ、また1つ: 異常の間に1行ずつ、暴走で残りが落ちる(いきなり全滅させない=段階が読める)
      const broken = Math.floor(anomaly * 2.99) + Math.floor(infect * 1.99);
      const fade = 1 - seg(A("blackout") - G, A("blackout"));
      for (let i = 0; i < rows.length; i++) {
        const lost = i > 0 && i <= broken && i < rows.length - 1;
        const val = lost ? (i % 2 ? "REDACTED" : "UNRESOLVED") : rows[i][1];
        const col = (i === 0) ? C.amber : (lost || (i === rows.length - 1 && infect > 0) ? C.crim : C.pale);
        this.mono(ctx, (rows[i][0] + " ...............").slice(0, 18), W * 0.70, H * 0.20 + i * 18 * S, 11 * S, C.amber, 0.42 * fade);
        this.mono(ctx, val, W * 0.70 + 122 * S, H * 0.20 + i * 18 * S, 11 * S, col, (lost ? 0.9 : 0.72) * fade);
      }
      this.sysTag(ctx, W, H, S, 0.45 * fade);
    }

    // ---- 質感: 異常が進むほどグリッチが増え、決断以降は引いていく(題では既定値=系は安定して引き渡される) ----
    const settle = 1 - seg(A("decision"), A("route"));
    this.glitch(ctx, W, H, t, ((typeof CFG !== "undefined" && CFG.holoGlitchRate != null) ? CFG.holoGlitchRate : 0.10) + (anomaly * 0.18 + infect * 0.30) * settle);
    this.scan(ctx, W, H, t, 1);
    this.letterbox(ctx, W, H, 1);
  },

  // =============================================================
  // P4-2 Lore ホログラムムービー「ARCHIVE — 世界の記録」(2026-08-11 Ric承認)
  //   役割分担: オープニング=物語の始まり(時間軸) / Lore=世界の設定(空間と理)。C2の場面を再演しない
  //   (7 航路=一筆の線に対し、本章1は**ハブ+環の網**=構図から変える)。
  //   尺の唯一の真実=CFG.holoLoreNodes(グリッド表)。何度でも再生可(一度きりフラグなし)。
  //   表示は全て実データ由来(PLANET_NAMES/LORE実文/state.lore)。伏せは REDACTED/UNRESOLVED のみ・捏造しない。
  //   章の深い1行は対応Lore解放時のみ実文(holoLoreChapterGate)=未解放はREDACTEDへ落とす(解読が進むと行が開く)。
  // =============================================================
  loreNodes() {
    return (typeof CFG !== "undefined" && CFG.holoLoreNodes) || [{ id: "net", grid: 0 }, { id: "end", grid: 36 }];
  },
  loreAt(id) { const n = this.loreNodes().find((x) => x.id === id); return n ? n.grid * this.grid() : 0; },
  loreDur() {
    const max = (typeof CFG !== "undefined" && CFG.holoLoreMaxSec) || 15;
    return Math.min(max, this.loreAt("end"));
  },
  loreAfter(id) {
    const ns = this.loreNodes(), i = ns.findIndex((x) => x.id === id);
    return (i >= 0 && ns[i + 1]) ? ns[i + 1].grid * this.grid() : this.loreDur();
  },
  loreStaticT() {                    // reduced-motion の「最終画」=結び(解読数+UNRESOLVED)が読める位相
    const a = this.loreAt("archive"), b = this.loreAfter("archive");
    return b > a ? a + (b - a) * 0.7 : this.loreDur() * 0.9;
  },
  // 章の深い1行の解放状態は呼び出し側(UI層)が解決し opts.gates={net:bool,...} で渡す
  //   =演出層はセーブ/ルール層を参照しない(恒久テスト§8の非接触規律。drawTravelのinfoと同形)。
  loreTag(ctx, W, H, S, a) { this.mono(ctx, "LIZARD COLONY / ARCHIVE", W * 0.06, H * 0.085, 10 * S, this.C().amber, a); },
  loreText(id, n) {                  // Lore実文の第n文(既定=第1文)。単一の真実=LORE定義から導出。捏造しない
    const L = (typeof LORE !== "undefined") && LORE.find((x) => x.id === id);
    return L ? (L.text.split("。")[n || 0] || null) : null;
  },

  drawLore(ctx, W, H, t, opts) {
    const C = this.C(), G = this.grid();
    const A = (id) => this.loreAt(id);
    const seg = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const S = Math.max(0.75, Math.min(2, H / 675));
    ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);
    const inNode = (id) => t >= A(id) && t < this.loreAfter(id);
    const gates = (opts && opts.gates) || {};   // 章の深い1行の解放状態(UI層が解決)。未指定=閉=REDACTED(嘘をつかない側へ倒す)

    // ---- 1 NETWORK: 星系図。中心=HQ結節・十球が環に並び、回線が1本ずつ結ばれる ----
    //   密度の規律(Ric注意 2026-08-11): 読ませる行は章末2グリッド以上残して全灯させる=速すぎて残らないを避ける。
    if (inNode("net")) {
      const p = seg(A("net"), this.loreAfter("net"));
      const io = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.95) / 0.05));
      const cx = W * 0.5, cy = H * 0.46, R = Math.min(W, H) * 0.315;
      const ids = (typeof STAGES !== "undefined") ? STAGES.map((s) => s.id) : [];
      const n = Math.max(1, ids.length);
      const pos = (i) => { const a = -Math.PI / 2 + i * 6.28318 / n; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.74 }; };
      // 中心=HQ結節(惑星ではない=回線の心臓。tickRingとラベルのみ・球は置かない)
      const hubA = Math.min(1, p * 4);
      this.tickRing(ctx, cx, cy, R * 0.15, 24, 0, 6.28318, C.amber, 0.55 * hubA * io, 1, 4);
      this.mono(ctx, "HQ NETWORK", cx, cy + 3.5 * S, 10 * S, C.amber, 0.85 * hubA * io, "center");
      // 回線(放射)と十球が1つずつ灯る: grid1〜6に収める=章末は読む時間(密度の規律)
      const lit = seg(A("net") + G * 1, A("net") + G * 6);
      const pr = Math.min(W, H) * 0.042;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, Math.min(1, lit * (n + 2) - i));
        if (a <= 0) break;
        const q = pos(i), inf = this.travelInfo(ids[i]), tint = (inf && inf.tint) || C.amber;
        ctx.strokeStyle = C.amber; ctx.globalAlpha = 0.26 * a * io; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + (q.x - cx) * 0.17, cy + (q.y - cy) * 0.17);
        ctx.lineTo(cx + (q.x - cx) * (0.17 + 0.66 * a), cy + (q.y - cy) * (0.17 + 0.66 * a));
        ctx.stroke(); ctx.globalAlpha = 1;
        this.glow(ctx, tint, 8);
        this.sphere(ctx, q.x, q.y, pr, 0.35, t * 0.8 + i, tint, 0.80 * a * io, 10);
        this.noGlow(ctx);
        this.jp(ctx, (inf && inf.short) || "REDACTED", q.x, q.y + pr * 1.95, 11 * S, C.pale, 0.85 * a * io, "center");
      }
      // 環(隣接回線): 全球が灯ってから一周つながる=網の完成
      const ringK = seg(A("net") + G * 6, A("net") + G * 8);
      if (ringK > 0) {
        ctx.strokeStyle = C.amber; ctx.globalAlpha = 0.22 * io; ctx.lineWidth = 1;
        ctx.beginPath();
        const steps = Math.floor(n * ringK + 1e-6);
        for (let i = 0; i <= steps && i <= n; i++) { const q = pos(i % n); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      // 読み(章末grid6〜: 実文が2グリッド以上読める)。LORE.hq第1文=単一の真実から導出・未解放はREDACTED
      const readK = seg(A("net") + G * 6, A("net") + G * 8);
      const line = gates.net ? this.loreText("hq") : null;
      if (line) this.jp(ctx, line, W * 0.5, H * 0.855, 13 * S, C.pale, 0.9 * readK * io, "center");
      else this.mono(ctx, "RECORD / REDACTED", W * 0.5, H * 0.855, 12 * S, C.crim, 0.7 * readK * io, "center");
      // 伏線の再提示(左上・沈めた深紅): 故郷は網のどこにもいない=名は伏せたまま
      this.mono(ctx, "HOMEWORLD / REDACTED", W * 0.06, H * 0.16, 10 * S, C.crim, 0.42 * io);
      // 章タグ(0.895=オープニングの下段タグと同位置。0.94はletterbox帯8.5%に隠れるため不可)
      this.mono(ctx, "ARCHIVE 01 / NETWORK", W * 0.5, H * 0.895, 11 * S, C.amber, 0.75 * io, "center");
      this.loreTag(ctx, W, H, S, 0.45 * io);
    }

    // ---- 2 PURITY: 純血の理。惑星球1つ+固有種の帳簿(2実名+3行目=REDACTED=伏線の再提示) ----
    //   惑星は呼び出し側が opts.planetId で渡す(=再生時の現在惑星。自分の星の話として観られる)。
    if (inNode("purity")) {
      const p = seg(A("purity"), this.loreAfter("purity"));
      const io = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.95) / 0.05));
      const pid = (opts && opts.planetId) || 1;
      const inf = this.travelInfo(pid), tint = (inf && inf.tint) || C.amber;
      const cx = W * 0.29, cy = H * 0.47, r = Math.min(W, H) * 0.17;
      this.glow(ctx, tint, 10);
      this.sphere(ctx, cx, cy, r, 0.35, t * 0.5, tint, 0.85 * io, 14);
      this.noGlow(ctx);
      this.planetRing(ctx, cx, cy, r * 1.45, inf && inf.sk, tint, 0.5 * io);
      this.jp(ctx, (inf && inf.short) || "REDACTED", cx, cy + r * 1.9, 12 * S, C.pale, 0.85 * io, "center");
      // 右: 固有種の帳簿。1行ずつ(grid2/4/6)=読める速度。3行目だけ深紅=正体は渡さない
      const bx = W * 0.52, by = H * 0.37;
      this.bracket(ctx, bx - 18 * S, by - 24 * S, W * 0.40, 92 * S, 14 * S, C.amber, 0.5 * io, 1.2);
      const sp = (inf && inf.sp) || [];
      const rows = [["ENDEMIC 01", sp[0] || "REDACTED", false], ["ENDEMIC 02", sp[1] || "REDACTED", false], ["ENDEMIC 3RD", "REDACTED", true]];
      for (let i = 0; i < rows.length; i++) {
        const a = seg(A("purity") + G * (2 + i * 2), A("purity") + G * (3 + i * 2));
        const yy = by + i * 26 * S;
        this.mono(ctx, (rows[i][0] + " ...............").slice(0, 17), bx, yy, 11 * S, C.amber, 0.5 * a * io);
        if (rows[i][2]) this.mono(ctx, rows[i][1], bx + 128 * S, yy, 11 * S, C.crim, 0.9 * a * io);
        else this.jp(ctx, rows[i][1], bx + 128 * S, yy, 12 * S, C.pale, 0.9 * a * io);
      }
      // 読み(章末grid7〜9で全灯・実文=LORE.native第1文): 純血の理由=生態系を守る隣人の作法
      const readK = seg(A("purity") + G * 7, A("purity") + G * 9);
      const line = gates.purity ? this.loreText("native") : null;
      if (line) this.jp(ctx, line, W * 0.5, H * 0.855, 13 * S, C.pale, 0.9 * readK * io, "center");
      else this.mono(ctx, "RECORD / REDACTED", W * 0.5, H * 0.855, 12 * S, C.crim, 0.7 * readK * io, "center");
      this.mono(ctx, "ARCHIVE 02 / PURITY", W * 0.5, H * 0.895, 11 * S, C.amber, 0.75 * io, "center");
      this.loreTag(ctx, W, H, S, 0.45 * io);
    }

    // ---- 3 ORIGIN OF BUGGER: 唯一「明かす」章。同じ実験から2本の枝=養う虫と喰らう虫の系譜図 ----
    //   既存Lore実文(intro/cricket)の映像化に留める。ヌシ・バガーの正体と上位存在には触れない(Ric裁定)。
    if (inNode("bugger")) {
      const p = seg(A("bugger"), this.loreAfter("bugger"));
      const io = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.95) / 0.05));
      const nx = W * 0.5, ny = H * 0.26;
      // 起点=実験の結節(惑星でも生物でもない=標本枠のブラケット)
      const nodeA = Math.min(1, p * 4);
      this.bracket(ctx, nx - 96 * S, ny - 20 * S, 192 * S, 36 * S, 12 * S, C.amber, 0.6 * nodeA * io, 1.2);
      this.mono(ctx, "INSECT FARM EXPERIMENT", nx, ny + 3 * S, 11 * S, C.amber, 0.85 * nodeA * io, "center");
      // 分岐(grid2〜5で伸びる): 左=コオロギ(琥珀=食) / 右=バガー(深紅=侵食)。根は同じ1点
      const growth = seg(A("bugger") + G * 2, A("bugger") + G * 5);
      const y0 = ny + 22 * S, lx = W * 0.28, rx = W * 0.72, byy = H * 0.60;
      const branch = (x1, col, k) => {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.45 * io; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(nx, y0);
        ctx.lineTo(nx + (x1 - nx) * k, y0 + (byy - y0) * k); ctx.stroke(); ctx.globalAlpha = 1;
      };
      branch(lx, C.amber, growth); branch(rx, C.crim, growth);
      if (growth >= 1) {
        // 左端点: コオロギ(食の側=静かな琥珀の結節)
        this.tickRing(ctx, lx, byy, 16 * S, 12, 0, 6.28318, C.amber, 0.55 * io, 1, 3);
        this.jp(ctx, "コオロギ", lx, byy + 34 * S, 13 * S, C.pale, 0.9 * io, "center");
        // 右端点: バガー(侵食の側=深紅の脈動。決定論=tのみ)。姿は描かない(影の記憶はオープニングの領分)
        const pulse = 0.7 + 0.3 * Math.sin(t * 3.0);
        this.glow(ctx, C.crim, 12);
        ctx.strokeStyle = C.crim; ctx.globalAlpha = 0.6 * pulse * io; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(rx, byy, 15 * S * (0.9 + 0.15 * pulse), 0, 6.28318); ctx.stroke();
        this.noGlow(ctx); ctx.globalAlpha = 1;
        this.jp(ctx, "バガー", rx, byy + 34 * S, 13 * S, C.crim, 0.9 * io, "center");
        // 脅威型の実データ(BOSS_TYPES)を小さく添える(捏造しない)
        const bt = (typeof BOSS_TYPES !== "undefined") && BOSS_TYPES.find((b) => b.id === "bugger");
        if (bt) this.jp(ctx, bt.threat, rx, byy + 52 * S, 10 * S, C.crim, 0.55 * io, "center");
      }
      // 読み(grid5.5〜7で全灯=長文につき早めに出して3グリッド以上読める): cricket解放済み=核心の一文/未解放=intro第2文(初期解放=常に実文)
      const readK = seg(A("bugger") + G * 5.5, A("bugger") + G * 7);
      const line = (gates.bugger && this.loreText("cricket", 1)) || this.loreText("intro", 1) ;
      if (line) this.jp(ctx, line, W * 0.5, H * 0.855, 13 * S, C.pale, 0.9 * readK * io, "center");
      else this.mono(ctx, "RECORD / REDACTED", W * 0.5, H * 0.855, 12 * S, C.crim, 0.7 * readK * io, "center");
      this.mono(ctx, "ARCHIVE 03 / ORIGIN OF BUGGER", W * 0.5, H * 0.895, 11 * S, C.amber, 0.75 * io, "center");
      this.loreTag(ctx, W, H, S, 0.45 * io);
    }

    // ---- 結び ARCHIVE: 帳簿2行で締める。2行目=manifest()末尾行と同一の行(コピーでなく導出=単一の真実) ----
    //   判断記録(Ric承認 2026-08-11): 同じ謎(積んだが正体が分からないもの)が別の場所でも疼く。
    if (inNode("archive")) {
      const p = seg(A("archive"), this.loreAfter("archive"));
      const io = Math.min(1, p * 5) * (1 - Math.max(0, (p - 0.88) / 0.12));   // 終端はゆっくり落ちて閉じる
      const ar = (opts && opts.archive) || null;
      const bx = W * 0.36, by = H * 0.42;
      const m = this.manifest(), last = m.length ? m[m.length - 1] : ["SPECIMEN", "REDACTED", "UNRESOLVED"];
      const a1 = seg(A("archive") + G * 1, A("archive") + G * 2);
      const a2 = seg(A("archive") + G * 2.5, A("archive") + G * 3.5);
      this.mono(ctx, ("DECODED ...............").slice(0, 17), bx, by, 12 * S, C.amber, 0.5 * a1 * io);
      this.mono(ctx, ar ? (ar.got + " / " + ar.total) : "UNRESOLVED", bx + 128 * S, by, 12 * S, ar ? C.pale : C.crim, 0.9 * a1 * io);
      this.mono(ctx, (last[0] + " ...............").slice(0, 17), bx, by + 28 * S, 12 * S, C.amber, 0.5 * a2 * io);
      this.mono(ctx, last[1], bx + 128 * S, by + 28 * S, 12 * S, C.crim, 0.9 * a2 * io);
      this.mono(ctx, last[2], bx + 205 * S, by + 28 * S, 12 * S, C.crim, 0.9 * a2 * io);
      this.mono(ctx, "END OF RECORD", W * 0.5, H * 0.895, 11 * S, C.amber, 0.6 * a2 * io, "center");
      this.loreTag(ctx, W, H, S, 0.45 * io);
    }

    this.glitch(ctx, W, H, t, (typeof CFG !== "undefined" && CFG.holoGlitchRate != null) ? CFG.holoGlitchRate : 0.10);
    this.scan(ctx, W, H, t, 1);
    this.letterbox(ctx, W, H, 1);
  },

  // =============================================================
  // 惑星移動トランジション(C2改訂 フェーズ1) — 共通様式=beam を使う差込先の第1号
  //   頻度への配慮: 尺は CFG.holoTravelMaxSec 以下 / スキップ即時 / 初訪と既訪で尺と情報量を変える。
  //   表示は全て実データ由来(travelInfo)。惑星ごとに色調(tint)が変わる。
  // =============================================================

  // ルール層(純関数・DOM非依存): 何を表示するかを実データから解決する。捏造しない・欠落は遮蔽表示。
  travelInfo(id) {
    const st = (typeof stageById === "function") ? stageById(id) : null;
    if (!st) return null;
    const pb = (typeof PLANET_BOSS !== "undefined") ? PLANET_BOSS[id] : null;
    const bt = (pb && typeof BOSS_TYPES !== "undefined") ? BOSS_TYPES.find((b) => b.id === pb.threat) : null;
    return {
      id: id,
      pname: st.pname,                                             // 惑星アリド
      short: (st.pname || "").replace(/^惑星/, ""),                 // アリド
      name: st.name,                                               // 乾燥地帯
      rank: st.rank,
      mat: st.mat || null,
      sp: (typeof SPECIES !== "undefined" ? SPECIES.filter((x) => x.stage === id).map((x) => x.name) : []),
      threat: bt ? bt.name : null,
      threatText: bt ? bt.threat : null,
      sk: (typeof CFG !== "undefined" && CFG.slitSkinByStage && CFG.slitSkinByStage[id]) || null,
      tint: this.tintOf(st),
    };
  },
  // 尺(CFG・上限でクランプ)。full=初訪(情報表示あり) / 短縮=既訪(ビームの走査のみ)
  travelDur(full, reduced) {
    const c = (typeof CFG !== "undefined" && CFG) || {};
    const max = c.holoTravelMaxSec || 1.2;
    if (reduced) return Math.min(max, c.holoTravelReducedSec || 0.45);
    return Math.min(max, full ? (c.holoTravelFullSec || 1.15) : (c.holoTravelShortSec || 0.8));
  },
  // 初回/既訪の分岐(しきい値はCFG)。判定材料はセーブ済みの pioneered を**読むだけ**(新規保存なし)
  travelFull(stageData) {
    const c = (typeof CFG !== "undefined" && CFG) || {};
    if (c.holoTravelFullOnUnpioneered === false) return true;
    return !(stageData && stageData.pioneered);
  },

  drawTravel(ctx, W, H, t, info, opts) {
    opts = opts || {};
    const C = this.C();
    const full = opts.full !== false;
    const dur = opts.dur || this.travelDur(full);
    const p = Math.max(0, Math.min(1, t / dur));
    ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);
    if (!info) return;
    const tint = info.tint || C.amber;
    const seg = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    const out = 1 - seg(0.86, 1);      // 抜ける=平常画面へ残り香を持ち込まない(UISkills §5.8)
    const S = Math.max(0.75, Math.min(2, H / 675));   // 文字組みは画面サイズに追従(1.15秒で読める大きさを保つ)

    // ---- 行き先の惑星: ワイヤーフレーム球が回転して現れる + 固有幾何環(四重スリットの確定意匠を引用) ----
    const cx = full ? W * 0.32 : W * 0.5, cy = H * (full ? 0.50 : 0.46);
    const pk = ease(seg(0.16, 0.62));
    const r = Math.min(W, H) * (full ? 0.21 : 0.17) * (0.70 + 0.30 * pk);
    if (pk > 0) {
      this.glow(ctx, tint, 12);
      this.sphere(ctx, cx, cy, r, 0.38, t * 2.0, tint, 0.92 * pk * out, 12);
      this.noGlow(ctx);
      this.planetRing(ctx, cx, cy, r * 1.55, info.sk, tint, 0.70 * pk * out);
      this.tickRing(ctx, cx, cy, r * 1.92, 36, -2.4, 2.4, C.amber, 0.22 * pk * out, 1, 5);
      if (!full) this.jp(ctx, info.short, cx, cy + r * 2.30, 22 * S, C.pale, 0.92 * pk * out, "center");
    }
    // 着地の一閃: 球が出そろった瞬間に細い環が一度だけ広がって消える=「着いた」の句読点
    const fl = seg(0.56, 0.76);
    if (fl > 0 && fl < 1) {
      const e = 1 - Math.pow(1 - fl, 2);
      this.glow(ctx, C.pale, 10);
      ctx.strokeStyle = C.pale; ctx.globalAlpha = 0.55 * (1 - fl) * out; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, r * (1.0 + 1.5 * e), 0, 6.28318); ctx.stroke();
      ctx.globalAlpha = 1; this.noGlow(ctx);
    }

    // ---- 実データ(初訪のみ・等幅で一瞬): 惑星名 / 固有種2種 / 脅威型 ----
    if (full) {
      const tk = seg(0.26, 0.74), head = Math.min(1, tk * 3);
      const x = W * 0.57, y = H * 0.34;
      this.bracket(ctx, x - 18 * S, y - 40 * S, W * 0.38, 160 * S, 14 * S, C.amber, 0.40 * Math.min(1, tk * 2) * out, 1.2);
      this.glow(ctx, tint, 10);
      this.jp(ctx, info.short, x, y, 34 * S, C.pale, 0.96 * head * out);
      this.noGlow(ctx);
      this.mono(ctx, info.name, x, y + 21 * S, 12 * S, tint, 0.60 * head * out);
      const rows = [
        ["PLANET", `${("0" + info.id).slice(-2)} / HQ Lv${info.rank}`],
        ["ENDEMIC", info.sp.length ? info.sp.join(" · ") : "REDACTED"],
        ["THREAT", info.threat ? `${info.threat} / ${info.threatText}` : "UNRESOLVED"],
        ["MATERIAL", info.mat || "REDACTED"],
      ];
      for (let i = 0; i < rows.length; i++) {
        const a = Math.max(0, Math.min(1, tk * (rows.length + 1) - i));
        if (a <= 0) break;
        const yy = y + (56 + i * 22) * S;
        this.mono(ctx, (rows[i][0] + " ..........").slice(0, 11), x, yy, 13 * S, tint, 0.55 * a * out);
        this.mono(ctx, rows[i][1], x + 105 * S, yy, 13 * S, C.pale, 0.85 * a * out);
      }
    }

    // ---- テレメトリ(共通・機構であることの明示) ----
    this.mono(ctx, "HQ HOLO COMMAND / TRANSIT", W * 0.06, H * 0.085, 11 * S, C.amber, 0.55 * out);
    if (opts.from) this.mono(ctx, `${opts.from}  >>  ${info.pname}`, W * 0.94, H * 0.085, 11 * S, C.pale, 0.50 * out, "right");

    // ---- 共通様式: 走査ビームが横断して抜ける(格子はその惑星の色調で残る) ----
    this.beam(ctx, W, H, p / 0.70, { grid: tint, gridA: out });
    this.scan(ctx, W, H, t, 0.8);
  },

  // ---- 再生機構(共通・差込先で再利用。opts.draw で描画を差し替える=演出のコピペ亜種を作らない) ----
  play(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    const reduced = opts.reduced != null ? opts.reduced : (typeof Motion !== "undefined" && Motion.reduced);
    const total = opts.total || this.cutDur();
    const variant = opts.variant || "core";
    const draw = opts.draw || ((c, w, h, tt) => this.drawCut(c, w, h, tt, variant));
    const st = { done: false, skipped: false, raf: 0, t: 0 };
    const finish = (sk) => {
      if (st.done) return; st.done = true; st.skipped = !!sk;
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st._to) clearTimeout(st._to);
      if (st._unbind) st._unbind();
      draw(ctx, W, H, total - 0.001);
      if (opts.onEnd) opts.onEnd(st);
    };
    st.skip = function () { finish(true); };
    // スキップは即時・確認なし(クリック/タップ/キー)
    const bindSkip = () => {
      if (opts.bind === false || ((typeof CFG !== "undefined") && CFG.holoSkippable === false)) return;
      const onSkip = () => st.skip();
      st._unbind = () => { canvas.removeEventListener("pointerdown", onSkip); window.removeEventListener("keydown", onSkip); };
      canvas.addEventListener("pointerdown", onSkip);
      window.addEventListener("keydown", onSkip);
    };
    if (reduced) {
      // reduced-motion: 動かさず最終画を静止表示(情報は残す)。保持秒があればその間だけ見せて終わる
      //   opts.staticT=「最終画」の位相(秒)。オープニングは題が最終画なので既定の0.86では届かない
      draw(ctx, W, H, opts.staticT != null ? opts.staticT : total * 0.86);
      st.reducedStatic = true;
      if (opts.reducedHoldSec > 0) { st._to = setTimeout(() => finish(false), opts.reducedHoldSec * 1000); bindSkip(); }
      else { st.done = true; if (opts.onEnd) opts.onEnd(st); }
      return st;
    }
    const now = opts.now || (() => performance.now());
    const t0 = now();
    const loop = () => {
      st.t = (now() - t0) / 1000;
      if (st.t >= total) { if (opts.loop) { st.t = 0; return finishLoop(); } return finish(false); }
      draw(ctx, W, H, st.t);
      st.raf = requestAnimationFrame(loop);
    };
    const finishLoop = () => { const t1 = now(); st._t0 = t1; loopFrom(t1); };
    const loopFrom = (base) => {
      const l2 = () => {
        st.t = ((now() - base) / 1000) % total;
        draw(ctx, W, H, st.t);
        st.raf = requestAnimationFrame(l2);
      };
      l2();
    };
    loop();
    bindSkip();
    return st;
  },
  // 全面オーバーレイの器(UISkills §5.10 `.holo-stage`)を用意して canvas を返す。
  //   器の寸法という同じ知識を呼び出し側ごとに持たない(惑星移動・オープニングの2箇所で使う)。
  //   CSSは可視制御のみ=見た目はすべて Canvas 側に閉じる。DOM が無い環境(nodeテスト)では null。
  mount(id) {
    if (typeof document === "undefined" || !document.body) return null;
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = id;
      ov.className = "holo-stage";
      ov.innerHTML = `<canvas></canvas>`;
      document.body.appendChild(ov);
    }
    const cv = ov.querySelector("canvas");
    cv.width = Math.min(1600, Math.max(320, window.innerWidth));
    cv.height = Math.min(1000, Math.max(200, window.innerHeight));
    ov.classList.add("show");
    return { ov: ov, cv: cv };
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Holo };
