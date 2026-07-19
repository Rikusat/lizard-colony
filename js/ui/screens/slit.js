// =============================================================
// screens/slit — 二重スリット実験装置【表現層】(roulette.md §9)
// ルール層(Slit)の実状態を「線のみ」で描く。極小窓・低コントラスト=飼育槽の生き物から注意を奪わない。
// 同心円のレール(切れ目=基準角のギャップ)/内向きに走る点レーザー/壁に張り付いた失敗の痕跡
// (内側=惜しいほど明るく残す=静かな殿堂)/成功=控えめな中心のブルーム。
// 惑星別意匠の差し替えを見据え、色/線はここに集約(骨格・確率はSlit=不変)。reduced-motionで演出簡略化。
// =============================================================

Object.assign(UI, {
  initSlit() {
    const cv = document.getElementById("slit-canvas");
    if (!cv) return;
    this._slitCv = cv;
    this._slitCtx = cv.getContext("2d");
    this._slitFx = []; // 一過性の火花/ブルーム
    if (typeof Slit !== "undefined") Slit.reset();
  },

  _syncSlitSize() {
    const cv = this._slitCv; if (!cv) return false;
    const rect = cv.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return true;
  },

  // 成功時の"静かな祝祭"(boot の Slit.onSuccess から)。中心の控えめなブルーム
  slitSuccessFx() {
    if (typeof Motion !== "undefined" && Motion.reduced) return;
    this._slitFx = this._slitFx || [];
    this._slitFx.push({ kind: "win", t: 1.1, ttl: 1.1 });
  },

  // 円の切れ目付き弧を「線のみ」で(ギャップ=スリットを飛ばして描く)。θ: 0=右/90=上、y上向き
  _slitRing(ctx, cx, cy, rr, baseDeg, halfDeg, stroke, lw) {
    const start = baseDeg + halfDeg, span = 360 - 2 * halfDeg;
    const steps = Math.max(20, Math.round(span / 5));
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const th = (start + span * k / steps) * Math.PI / 180;
      const x = cx + rr * Math.cos(th), y = cy - rr * Math.sin(th);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
  },

  drawSlit() {
    const ctx = this._slitCtx, cv = this._slitCv;
    if (!ctx || !cv || typeof Slit === "undefined") return;
    if (!this._syncSlitSize()) return;
    const cw = cv.width, ch = cv.height, cx = cw / 2, cy = ch / 2;
    const R = Math.min(cw, ch) * 0.44;
    const calm = typeof Motion !== "undefined" && Motion.reduced;
    const N = CFG.slitRings, radii = CFG.slitRadiif, half = CFG.slitHalfDeg, base = CFG.slitBaseAngleDeg;
    const pt = (r, thDeg) => { const t = thDeg * Math.PI / 180; return [cx + r * R * Math.cos(t), cy - r * R * Math.sin(t)]; };

    ctx.clearRect(0, 0, cw, ch);
    // 同心円レール(線のみ・低コントラスト)。待機中はクールダウンで僅かに減光
    const cd = Slit.cooldownLeft ? Slit.cooldownLeft() : 0;
    const baseA = 0.16 + (cd > 0 ? 0 : 0.04);
    for (let i = 0; i < N; i++) {
      this._slitRing(ctx, cx, cy, radii[i] * R, base, half[i], `rgba(150,195,215,${baseA})`, Math.max(1, 1.1 * (cw / 200)));
    }
    // 中心の的(奇跡の到達点)。ごく淡い
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, R * 0.05), 0, 7);
    ctx.strokeStyle = "rgba(210,140,165,.35)"; ctx.lineWidth = 1; ctx.stroke();

    // 張り付いた失敗の痕跡(内側=惜しいほど明るく大きく=静かな殿堂)。寿命末期はフェード
    for (const s of Slit.stuck) {
      const [x, y] = pt(s.r, s.theta);
      const depth = (s.ring + 1) / N;               // 0..1 内側ほど大
      const fade = Math.min(1, s.life / 6);          // 消える前に薄く
      const rad = (0.9 + depth * 1.8) * (cw / 200);
      const a = (0.22 + depth * 0.5) * fade;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7);
      ctx.fillStyle = `rgba(190,225,240,${a})`; ctx.fill();
      if (depth >= 0.99 && !calm) { // 最内到達=最高記録は静かに光る
        ctx.beginPath(); ctx.arc(x, y, rad + 1.6, 0, 7);
        ctx.strokeStyle = `rgba(215,150,175,${0.5 * fade})`; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // 飛行中の球=点に近い一条のレーザー(内向きの短い光跡)
    const b = Slit.ball;
    if (b && b.phase === "fly") {
      const [x, y] = pt(b.r, b.theta);
      const [x2, y2] = pt(Math.min(1, b.r + 0.14), b.theta); // 外向きの尾
      const g = ctx.createLinearGradient(x2, y2, x, y);
      g.addColorStop(0, "rgba(180,235,255,0)"); g.addColorStop(1, "rgba(220,245,255,.95)");
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.4, 1.8 * (cw / 200)); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, 1.6 * (cw / 200)), 0, 7);
      ctx.fillStyle = "rgba(235,250,255,.95)"; ctx.fill();
    }

    // イベント購読: 失敗の"惜しさ"火花 / 成功ブルーム(reduced-motionでは出さない=結果は保証済)
    for (const ev of Slit.drainEvents()) {
      if (calm) continue;
      if (ev.type === "SlitBlocked" && ev.miss < 6) { // 切れ目のすぐ横=惜しい
        this._slitFx.push({ kind: "near", ring: ev.ring, t: 0.5, ttl: 0.5 });
      } else if (ev.type === "SlitSuccess") {
        this._slitFx.push({ kind: "win", t: 1.1, ttl: 1.1 });
      }
    }
    // fx描画
    this._slitFx = (this._slitFx || []).filter((f) => f.t > 0);
    for (const f of this._slitFx) {
      f.t -= 0.016;
      const q = 1 - f.t / f.ttl;
      if (f.kind === "win") { // 中心の控えめな金/桃のブルーム(賢者の石)
        const rr = R * (0.1 + q * 0.9);
        const gg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rr);
        gg.addColorStop(0, `rgba(255,215,190,${(1 - q) * 0.8})`); gg.addColorStop(1, "rgba(255,215,190,0)");
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
      } else if (f.kind === "near") { // 惜しさ: その円の切れ目のふちに小さな明滅
        const rr = radii[f.ring] * R;
        for (const s of [-1, 1]) {
          const [ex, ey] = pt(rr / R, base + s * half[f.ring]);
          ctx.beginPath(); ctx.arc(ex, ey, (1 - q) * 2.2 + 0.6, 0, 7);
          ctx.fillStyle = `rgba(255,225,160,${(1 - q) * 0.7})`; ctx.fill();
        }
      }
    }
  },
});
