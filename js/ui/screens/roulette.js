// =============================================================
// screens/roulette — 遺伝子ルーレット【表現層】(roulette.md §7 v3.1・物理決定型パチンコ)
// ルール層(Roulette)の実(x,y)/釘/穴をそのまま描くだけ。結果は計算しない。
// 見えている落下がそのまま真実(§2 fable1: 演出と結果の乖離が原理的に起きない)。
// =============================================================

Object.assign(UI, {
  initRoulette() {
    const cv = document.getElementById("roulette-canvas");
    if (!cv) return;
    this._roulCv = cv;
    this._roulCtx = cv.getContext("2d");
    if (typeof Roulette !== "undefined") Roulette.reset();
    // サイズ合わせは drawRoulette が毎フレーム自己修復(init前レイアウト/flex伸長/dpr変化を吸収・2026-07-18)
  },

  // canvas内部解像度を現レイアウトサイズへ同期。未配置(0サイズ)ならfalse=このframeは描かない
  _syncRoulSize() {
    const cv = this._roulCv;
    if (!cv) return false;
    const rect = cv.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wantW = Math.round(rect.width * dpr), wantH = Math.round(rect.height * dpr);
    if (cv.width !== wantW || cv.height !== wantH) { cv.width = wantW; cv.height = wantH; this._roulDpr = dpr; }
    return true;
  },

  drawRoulette() {
    const ctx = this._roulCtx, cv = this._roulCv;
    if (!ctx || !cv || typeof Roulette === "undefined") return;
    if (!this._syncRoulSize()) return; // 自己修復
    const cw = cv.width, ch = cv.height;
    const W = CFG.roulW, H = CFG.roulH;
    const scale = Math.min(cw / W, ch / H);
    const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
    const calm = typeof Motion !== "undefined" && Motion.reduced;
    const cx = CFG.roulHoleCenterf * W;
    const landY = CFG.roulLandYf * H;
    const rbHalf = CFG.roulRainbowHalfWf * W, pzOut = CFG.roulPrizeOuterf * W;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // 器
    ctx.fillStyle = "rgba(10,14,12,.82)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(160,200,150,.28)";
    ctx.lineWidth = 1.4 / scale;
    ctx.strokeRect(0.7, 0.7, W - 1.4, H - 1.4);

    // レール区間(導入部)の淡いガイド
    const railEndY = CFG.roulRailEndYf * H;
    ctx.strokeStyle = "rgba(150,190,160,.12)";
    ctx.lineWidth = 1.0 / scale;
    ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx, railEndY); ctx.stroke();
    // 発射口
    ctx.fillStyle = "rgba(180,200,170,.5)";
    ctx.beginPath(); ctx.arc(CFG.roulLaunchXf * W, 3, 3.0, 0, 7); ctx.fill();

    // 釘(控えめ・低コントラスト=球が主役・#設計2)
    ctx.fillStyle = "rgba(150,170,150,.42)";
    for (const n of Roulette.nails) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7); ctx.fill();
    }

    // 着地の穴(中央=極細の虹穴、その左右を景品穴が挟む)
    const tp = (Render.time * 90) % 360;
    const pulse = calm ? 0.6 : 0.5 + 0.5 * Math.sin(Render.time * 2.6);
    const shelfY = landY, shelfH = H - landY;
    // ハズレ床(暗い)
    ctx.fillStyle = "rgba(30,36,30,.9)";
    ctx.fillRect(0, shelfY, W, shelfH);
    // 景品穴(左右の帯・琥珀)
    ctx.fillStyle = "rgba(210,170,90,.5)";
    ctx.fillRect(cx - pzOut, shelfY, pzOut - rbHalf, shelfH);
    ctx.fillRect(cx + rbHalf, shelfY, pzOut - rbHalf, shelfH);
    ctx.strokeStyle = "rgba(230,190,110,.7)"; ctx.lineWidth = 0.8 / scale;
    ctx.strokeRect(cx - pzOut, shelfY, pzOut - rbHalf, shelfH);
    ctx.strokeRect(cx + rbHalf, shelfY, pzOut - rbHalf, shelfH);
    // 虹穴(中央・極細・七色脈動)
    const rg = ctx.createLinearGradient(cx - rbHalf, 0, cx + rbHalf, 0);
    rg.addColorStop(0, `hsla(${tp},95%,62%,${0.6 + pulse * 0.35})`);
    rg.addColorStop(1, `hsla(${(tp + 160) % 360},95%,62%,${0.6 + pulse * 0.35})`);
    ctx.fillStyle = rg;
    ctx.fillRect(cx - rbHalf, shelfY - 3, rbHalf * 2, shelfH + 3);
    ctx.strokeStyle = `hsla(${(tp + 60) % 360},95%,72%,.9)`; ctx.lineWidth = 1.0 / scale;
    ctx.strokeRect(cx - rbHalf, shelfY - 3, rbHalf * 2, shelfH + 3);

    // 球(ルール層の実(x,y)を描く・しっかりした球体・#1)
    for (const b of Roulette.balls) {
      const g = b.gene || {};
      const nearC = Math.abs(b.x - cx) < pzOut && b.y > railEndY; // 中央帯に迫る=期待
      const hue = g.hue != null ? g.hue : 120;
      const sat = g.sat != null ? g.sat : 70;
      const li = g.light != null ? g.light : 58;
      // 球体(放射グラデで立体感)
      const bg = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.2, b.x, b.y, b.r);
      bg.addColorStop(0, `hsl(${hue},${sat}%,${Math.min(90, li + 28)}%)`);
      bg.addColorStop(1, `hsl(${hue},${sat}%,${Math.max(20, li - 14)}%)`);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = `hsla(${hue},${sat}%,${Math.min(94, li + 30)}%,.85)`;
      ctx.lineWidth = 0.9 / scale; ctx.stroke();
      // ハイライト
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.34, b.y - b.r * 0.34, b.r * 0.3, 0, 7);
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fill();
      // 中央帯へ迫る球は淡い光(期待の誘目)
      if (nearC && !calm) {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2.4, 0, 7);
        ctx.strokeStyle = `hsla(${tp},95%,70%,.35)`; ctx.lineWidth = 1.4 / scale; ctx.stroke();
      }
    }

    // 入賞バースト(BallRainbow=大・BallWin=小。イベント駆動・fable1)
    this._roulFx = (this._roulFx || []).filter((f) => f.t > 0);
    let flash = 0;
    for (const f of this._roulFx) {
      f.t -= 0.016;
      const q = 1 - f.t / f.ttl;
      const big = f.kind === "rainbow";
      if (big) flash = Math.max(flash, (1 - q) * 0.5);
      const N = big ? 14 : 7, spread = big ? W * 0.5 : W * 0.16;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2 + q * 3, rad = q * spread;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad * 0.7, (1 - q) * (big ? 4 : 2) + 0.7, 0, 7);
        ctx.fillStyle = big ? `hsla(${(k * 26 + Render.time * 160) % 360},95%,64%,${1 - q})`
          : `hsla(45,90%,66%,${(1 - q) * 0.9})`;
        ctx.fill();
      }
    }
    if (flash > 0) {
      ctx.fillStyle = `hsla(${(Render.time * 300) % 360},90%,70%,${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // イベント購読(reduced-motionでは装飾を出さない・結果は保証)
    for (const ev of Roulette.drainEvents()) {
      if (calm) continue;
      if (ev.type === "BallRainbow") { (this._roulFx = this._roulFx || []).push({ x: ev.x, y: landY, t: 1.1, ttl: 1.1, kind: "rainbow" }); }
      else if (ev.type === "BallWin") { (this._roulFx = this._roulFx || []).push({ x: ev.x, y: landY, t: 0.5, ttl: 0.5, kind: "win" }); }
    }
  },

  // レインボー新種誕生の画面演出フック(game.spawnRouletteEggから呼ばれる)
  rouletteRainbowFx() {
    const wrap = document.getElementById("roulette-wrap");
    if (wrap && !Motion.reduced) Motion.play(wrap, "roul-pop");
  },
});
