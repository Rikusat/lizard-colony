// =============================================================
// screens/roulette — 遺伝子ルーレット【表現層】(roulette.md §7)
// Roulette(ルール層)のstateを毎フレーム描くだけ。結果を計算しない。
// イベント(BallEmitted等)を購読してジュース演出(後続段階)。
// =============================================================

Object.assign(UI, {
  initRoulette() {
    const cv = document.getElementById("roulette-canvas");
    if (!cv) return; // ルーレット枠が無い画面ではセットしない
    this._roulCv = cv;
    this._roulCtx = cv.getContext("2d");
    if (typeof Roulette !== "undefined") Roulette.reset();
    this._resizeRoulette();
    if (!this._roulResizeHooked) {
      window.addEventListener("resize", () => this._resizeRoulette());
      this._roulResizeHooked = true;
    }
  },

  _resizeRoulette() {
    const cv = this._roulCv;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(rect.width * dpr));
    cv.height = Math.max(1, Math.round(rect.height * dpr));
    this._roulDpr = dpr;
  },

  // 毎フレーム描画(core.jsのloopから)。sim単位→canvasへスケール・中央寄せ
  drawRoulette() {
    const ctx = this._roulCtx, cv = this._roulCv;
    if (!ctx || !cv || typeof Roulette === "undefined") return;
    const cw = cv.width, ch = cv.height;
    const W = CFG.roulW, H = CFG.roulH;
    const scale = Math.min(cw / W, ch / H);
    const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // 器の枠(レーン1)
    ctx.fillStyle = "rgba(12,16,10,.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(160,200,150,.35)";
    ctx.lineWidth = 1.4 / scale;
    ctx.strokeRect(0.7, 0.7, W - 1.4, H - 1.4);

    // 球(geneのhueで着色。無ければ生命緑)
    for (const b of Roulette.balls) {
      const hue = b.gene && b.gene.hue != null ? b.gene.hue : 120;
      const sat = b.gene && b.gene.sat != null ? b.gene.sat : 70;
      const li = b.gene && b.gene.light != null ? b.gene.light : 60;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fillStyle = `hsl(${hue},${sat}%,${li}%)`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue},${sat}%,${Math.min(90, li + 20)}%,.8)`;
      ctx.lineWidth = 0.8 / scale;
      ctx.stroke();
      // ハイライト(ぷるっと感)
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.32, 0, 7);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fill();
    }
    ctx.restore();

    // イベント購読(後続段階でジュース。今は捨てるだけ=キュー溢れ防止)
    Roulette.drainEvents();
  },
});
