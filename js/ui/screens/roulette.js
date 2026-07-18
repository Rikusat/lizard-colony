// =============================================================
// screens/roulette — 遺伝子ルーレット【表現層】(roulette.md §7 v2・パチンコ方式)
// Roulette(ルール層)の b.p(進行度0→1)を軌道パスへ写像して描くだけ。結果は計算しない。
// 落下の減速(焦らし)は y(p) の ease-out で作る。当たり穴/通常スロットへのドリフトは
// b.rainbow(emit時確定)を読んで最終approachのみ分岐(それまで中立=見た目と真実は一致)。
// =============================================================

Object.assign(UI, {
  initRoulette() {
    const cv = document.getElementById("roulette-canvas");
    if (!cv) return;
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

  // 進行度 b.p(0→1) → 軌道パス座標(sim単位)。ルールは座標を持たず表現がここで写像
  _roulBallPos(b) {
    const W = CFG.roulW, H = CFG.roulH;
    const lx = CFG.roulLaunchX * W, ly = CFG.roulLaunchY * H;
    const ax = CFG.roulApexX * W, ay = CFG.roulApexY * H;
    const fx = CFG.roulFallX * W;
    const jit = (b.jitter || 0) * CFG.roulLaneJitter * W;
    const p = b.p;
    let x, y;
    if (p < CFG.roulRiseP) {                       // 上昇(左下→左上・easeOut)
      const u = p / CFG.roulRiseP, e = 1 - (1 - u) * (1 - u);
      x = lx + (ax - lx) * e; y = ly + (ay - ly) * e;
    } else if (p < CFG.roulArcP) {                 // アーク(頂点→中央上・軽い山)
      const u = (p - CFG.roulRiseP) / (CFG.roulArcP - CFG.roulRiseP);
      x = ax + (fx - ax) * u;
      y = ay - ay * 0.35 * Math.sin(u * Math.PI);
    } else {                                       // 落下(中央→最奥部・終盤減速=焦らし)
      const u = (p - CFG.roulArcP) / (1 - CFG.roulArcP);
      const ey = 1 - Math.pow(1 - u, CFG.roulFallEase); // easeOut: 終盤ゆっくり
      y = ay + (H - ay) * ey;
      const targetX = (b.rainbow ? CFG.roulRainbowSlotX : CFG.roulNormalSlotX) * W + (b.rainbow ? 0 : jit);
      const midX = fx + jit * 0.4;
      if (p < CFG.roulCommitP) x = midX;           // それまでは中立(入るか?の焦らし)
      else {                                       // 最終approachで当たり穴/通常へドリフト
        const cu = (p - CFG.roulCommitP) / (1 - CFG.roulCommitP), ce = 1 - (1 - cu) * (1 - cu);
        x = midX + (targetX - midX) * ce;
      }
    }
    return { x, y };
  },

  drawRoulette() {
    const ctx = this._roulCtx, cv = this._roulCv;
    if (!ctx || !cv || typeof Roulette === "undefined") return;
    const cw = cv.width, ch = cv.height;
    const W = CFG.roulW, H = CFG.roulH;
    const scale = Math.min(cw / W, ch / H);
    const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
    const calm = typeof Motion !== "undefined" && Motion.reduced;
    const rbX = CFG.roulRainbowSlotX * W, nmX = CFG.roulNormalSlotX * W;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // 器
    ctx.fillStyle = "rgba(10,14,12,.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(160,200,150,.28)";
    ctx.lineWidth = 1.4 / scale;
    ctx.strokeRect(0.7, 0.7, W - 1.4, H - 1.4);

    // 軌道ガイド(中立の球で p=0..1 をサンプルして薄く描く=トラックの可視化)
    ctx.strokeStyle = "rgba(150,190,160,.16)";
    ctx.lineWidth = 1.2 / scale;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const g = this._roulBallPos({ p: i / 40, jitter: 0, rainbow: false });
      i === 0 ? ctx.moveTo(g.x, g.y) : ctx.lineTo(g.x, g.y);
    }
    ctx.stroke();

    // 最奥部スロット: 通常スロット(中立)＋当たり穴(レインボー・七色脈動)
    const tp = (Render.time * 90) % 360;
    const pulse = calm ? 0.65 : 0.5 + 0.5 * Math.sin(Render.time * 2.4);
    // 通常スロット
    ctx.fillStyle = "rgba(90,120,100,.35)";
    ctx.fillRect(nmX - 12, H - 10, 24, 10);
    // 当たり穴(レインボー)
    const rg = ctx.createRadialGradient(rbX, H - 6, 1, rbX, H - 6, 22);
    rg.addColorStop(0, `hsla(${tp},95%,62%,${0.55 + pulse * 0.35})`);
    rg.addColorStop(1, `hsla(${(tp + 140) % 360},95%,62%,0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(rbX - 24, H - 30, 48, 30);
    for (let k = 0; k < 6; k++) {                  // 七色の口
      ctx.fillStyle = `hsla(${(k * 60 + tp) % 360},95%,60%,${0.55 + pulse * 0.3})`;
      ctx.fillRect(rbX - 12 + 4 * k, H - 5, 4, 5);
    }
    ctx.strokeStyle = `hsla(${(tp + 60) % 360},95%,70%,.8)`;
    ctx.lineWidth = 1.4 / scale;
    ctx.strokeRect(rbX - 13, H - 13, 26, 13);

    // 発射口(左下)
    ctx.fillStyle = "rgba(180,200,170,.5)";
    ctx.beginPath();
    ctx.arc(CFG.roulLaunchX * W, CFG.roulLaunchY * H, 3.2, 0, 7);
    ctx.fill();

    // 球(軌道上の位置を写像して描く)
    for (const b of Roulette.balls) {
      const pos = this._roulBallPos(b);
      const g = b.gene || {};
      const hue = b.rainbow ? (Render.time * 200) % 360 : (g.hue != null ? g.hue : 120);
      const sat = b.rainbow ? 95 : (g.sat != null ? g.sat : 70);
      const li = b.rainbow ? 62 : (g.light != null ? g.light : 60);
      // レインボー球は淡い尾(誘目)
      if (b.rainbow && !calm) {
        ctx.strokeStyle = `hsla(${hue},95%,65%,.4)`;
        ctx.lineWidth = b.r * 1.4;
        ctx.lineCap = "round";
        const prev = this._roulBallPos({ ...b, p: Math.max(0, b.p - 0.04) });
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(pos.x, pos.y, b.r, 0, 7);
      ctx.fillStyle = `hsl(${hue},${sat}%,${li}%)`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue},${sat}%,${Math.min(92, li + 22)}%,.85)`;
      ctx.lineWidth = 0.9 / scale;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(pos.x - b.r * 0.3, pos.y - b.r * 0.3, b.r * 0.32, 0, 7);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fill();
    }

    // レインボー着弾バースト(BallEnteredRainbowで発火・当たり穴位置・~1.1s減衰)
    this._roulFx = (this._roulFx || []).filter((f) => f.t > 0);
    let flash = 0;
    for (const f of this._roulFx) {
      f.t -= 0.016;
      const q = 1 - f.t / f.ttl;
      flash = Math.max(flash, (1 - q) * 0.5);
      const N = 14;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2 + q * 3;
        const rad = q * (W * 0.5);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad * 0.7, (1 - q) * 4 + 0.8, 0, 7);
        ctx.fillStyle = `hsla(${(k * 26 + Render.time * 160) % 360},95%,64%,${1 - q})`;
        ctx.fill();
      }
      for (const rr of [q * (W * 0.45), q * (W * 0.28)]) {
        ctx.strokeStyle = `hsla(${(Render.time * 240 + rr * 3) % 360},95%,66%,${(1 - q) * 0.9})`;
        ctx.lineWidth = (1 - q) * 3 / scale + 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke();
      }
    }
    if (flash > 0) {
      ctx.fillStyle = `hsla(${(Render.time * 300) % 360},90%,70%,${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // イベント購読(fable1: イベント駆動)。reduced-motionでは装飾を出さない(結果は保証)
    for (const ev of Roulette.drainEvents()) {
      if (ev.type === "BallEnteredRainbow" && !calm) {
        this._roulFx = this._roulFx || [];
        this._roulFx.push({ x: rbX, y: H - 6, t: 1.1, ttl: 1.1 });
      }
    }
  },

  // レインボー新種誕生の画面演出フック(game.spawnRouletteEggから呼ばれる)
  rouletteRainbowFx() {
    const wrap = document.getElementById("roulette-wrap");
    if (wrap && !Motion.reduced) Motion.play(wrap, "roul-pop");
  },
});
