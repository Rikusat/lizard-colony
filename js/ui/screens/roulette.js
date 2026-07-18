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

    // 2レーン: 上部=レーン1(放出)/下部=レーン2(結果)。床=レーン2最奥部(回収)
    const y1 = H * CFG.roulLane1Ratio;
    ctx.fillStyle = "rgba(14,20,12,.72)";
    ctx.fillRect(0, 0, W, y1);
    ctx.fillStyle = "rgba(10,14,18,.78)";
    ctx.fillRect(0, y1, W, H - y1);
    ctx.strokeStyle = "rgba(120,160,120,.22)";
    ctx.lineWidth = 1 / scale;
    ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.stroke(); // レーン境界
    // 床(レーン2最奥部)=回収ライン
    ctx.strokeStyle = "rgba(180,210,160,.4)";
    ctx.lineWidth = 1.6 / scale;
    ctx.beginPath(); ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1); ctx.stroke();
    ctx.strokeStyle = "rgba(160,200,150,.3)";
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
    // レインボー帯の可視化(far-left・七色の脈動グロー=ここが当たり)。常時明滅で誘目
    const rbx0 = CFG.roulRainbowX0 * W, rbx1 = CFG.roulRainbowX1 * W, rbw = rbx1 - rbx0;
    const pulse = 0.5 + 0.5 * Math.sin(Render.time * 3);
    const tp = (Render.time * 90) % 360;
    const rg = ctx.createLinearGradient(rbx0, H, rbx0, H - 40);
    rg.addColorStop(0, `hsla(${tp},95%,62%,${0.4 + pulse * 0.3})`);
    rg.addColorStop(0.5, `hsla(${(tp + 90) % 360},95%,62%,${0.18 + pulse * 0.15})`);
    rg.addColorStop(1, `hsla(${(tp + 180) % 360},95%,62%,0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(rbx0, H - 40, rbw, 40);
    // 七色の縦バー(当たりゾーンの明示)
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `hsla(${(k * 60 + tp) % 360},95%,60%,${0.5 + pulse * 0.3})`;
      ctx.fillRect(rbx0 + (rbw / 6) * k, H - 4, rbw / 6, 4);
    }
    ctx.strokeStyle = `hsla(${(tp + 60) % 360},95%,68%,.7)`;
    ctx.lineWidth = 1.6 / scale;
    ctx.beginPath(); ctx.moveTo(rbx1, H - 40); ctx.lineTo(rbx1, H); ctx.stroke();

    // レインボー着弾バースト(BallEnteredRainbowで発火・~1.1s減衰・大型)
    this._roulFx = (this._roulFx || []).filter((f) => f.t > 0);
    let flash = 0;
    for (const f of this._roulFx) {
      f.t -= 0.016;
      const p = 1 - f.t / f.ttl;         // 0→1
      flash = Math.max(flash, (1 - p) * 0.5);
      const N = 14;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2 + p * 3;
        const rad = p * (W * 0.5);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * rad, H - 8 + Math.sin(a) * rad * 0.7, (1 - p) * 4 + 0.8, 0, 7);
        ctx.fillStyle = `hsla(${(k * 26 + Render.time * 160) % 360},95%,64%,${(1 - p)})`;
        ctx.fill();
      }
      // 二重リング
      for (const rr of [p * (W * 0.45), p * (W * 0.28)]) {
        ctx.strokeStyle = `hsla(${(Render.time * 240 + rr * 3) % 360},95%,66%,${(1 - p) * 0.9})`;
        ctx.lineWidth = (1 - p) * 3 / scale + 0.5;
        ctx.beginPath(); ctx.arc(f.x, H - 8, rr, 0, 7); ctx.stroke();
      }
    }
    // 盤面フラッシュ(当たり全体を七色で一瞬満たす=事件感)
    if (flash > 0) {
      ctx.fillStyle = `hsla(${(Render.time * 300) % 360},90%,70%,${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // イベント購読(fable1: イベント駆動のジュース)
    for (const ev of Roulette.drainEvents()) {
      if (ev.type === "BallEnteredRainbow") {
        this._roulFx = this._roulFx || [];
        this._roulFx.push({ x: ev.x, t: 1.1, ttl: 1.1 });
      }
    }
  },

  // レインボー新種誕生の画面演出フック(game.spawnRouletteEggから呼ばれる)
  rouletteRainbowFx(sp) {
    // ルーレット枠に一瞬の発光(魂=メインCanvasには触れない)
    const wrap = document.getElementById("roulette-wrap");
    if (wrap && !Motion.reduced) Motion.play(wrap, "roul-pop");
  },
});
