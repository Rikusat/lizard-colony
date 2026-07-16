"use strict";
// ============================================================
// トカゲコロニー: Canvas 描画 (1280x720)
// ============================================================

const HORIZON = 170;

// 設備の配置座標
const FAC_POS = {
  water: { x: 230, y: 610 },
  shelter: { x: 170, y: 320 },
  light: { x: 1110, y: 300 },
  rocks: { x: 800, y: 630 },
  heat: { x: 620, y: 250 },
  fenceX: 1218,
};
const NEST = { x: 430, y: 300 };

const Render = {
  ctx: null,
  time: 0,
  _bgCache: null,   // 背景は重いのでオフスクリーンにキャッシュ
  _bgStage: 0,

  init() {
    this.ctx = document.getElementById("game").getContext("2d");
  },

  lizardColor(lz) {
    // 伝説モーフは虹色に変化し続ける
    if (lz.morphId === "legendary") {
      const h = Math.floor((this.time * 50 + lz.id * 47) % 360);
      return { h, s: 85, l: 60, css: `hsl(${h},85%,60%)` };
    }
    const [h, s, l] = morphById(lz.morphId).recolor(lz.hue, lz.sat, lz.light);
    return { h, s, l, css: `hsl(${h},${s}%,${l}%)` };
  },

  draw() {
    const ctx = this.ctx;
    Game.refreshCrowdScale();
    this.drawStage(ctx);
    this.drawNest(ctx);
    this.drawFacilities(ctx);
    this.drawSmallFacilities(ctx);
    this.drawAllies(ctx);
    this.drawBurrow(ctx);
    // y座標順に描画(奥行き)。さらわれ中・休憩中の個体は描かない
    const sorted = Game.state.lizards.filter((lz) => Game.isVisible(lz)).sort((a, b) => a.y - b.y);
    for (const lz of sorted) this.drawLizard(ctx, lz);
    if (Game.raid) this.drawBoss(ctx, Game.raid);
    else if (Game.corpse) this.drawCorpse(ctx, Game.corpse);
    this.drawMerchant(ctx);
    this.drawPopups(ctx);
    this.drawVignette(ctx);
    // イベント中の表示
    if (Game.event) {
      ctx.font = "bold 16px sans-serif";
      this.centerLabel(ctx, `${Game.event.def.name} 残り${Math.ceil(Game.event.t)}秒 — ${Game.event.def.desc}`,
        W / 2, H - 26, "rgba(60,40,10,.7)", "#ffe9b0");
    }
    if (Game.raid && Game.raid.cutinT > 0 && !Game.raid.heroShown) this.drawCutin(ctx, Game.raid);
    // 伝説誕生などのフラッシュ
    if (Game.flashT > 0) {
      ctx.fillStyle = `rgba(255,250,230,${Math.min(0.85, Game.flashT)})`;
      ctx.fillRect(0, 0, W, H);
    }
  },

  // 放浪商人の屋台
  drawMerchant(ctx) {
    const m = Game.merchant;
    if (!m) return;
    const x = 950, y = 688;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(x, y + 8, 40, 8, 0, 0, 7); ctx.fill();
    // 荷車
    ctx.fillStyle = "#6b5433";
    rr(ctx, x - 30, y - 22, 60, 24, 5); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1.5;
    rr(ctx, x - 30, y - 22, 60, 24, 5); ctx.stroke();
    // 幌
    ctx.fillStyle = "#8f2f1c";
    ctx.beginPath();
    ctx.moveTo(x - 34, y - 20);
    ctx.quadraticCurveTo(x, y - 48, x + 34, y - 20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c9a86a";
    ctx.beginPath();
    ctx.moveTo(x - 28, y - 22);
    ctx.quadraticCurveTo(x, y - 44, x + 28, y - 22);
    ctx.closePath(); ctx.fill();
    // 車輪
    for (const ox of [-16, 16]) {
      ctx.fillStyle = "#3d3222";
      ctx.beginPath(); ctx.arc(x + ox, y + 3, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#57452c";
      ctx.beginPath(); ctx.arc(x + ox, y + 3, 3, 0, 7); ctx.fill();
    }
    // ランタン(ゆらめく)
    ctx.fillStyle = `rgba(255,220,120,${0.7 + Math.sin(this.time * 6) * 0.2})`;
    ctx.beginPath(); ctx.arc(x + 34, y - 26, 4, 0, 7); ctx.fill();
    this.pill(ctx, x - 52, y + 14, `放浪商人 ${Math.ceil(m.t)}s`, "rgba(90,30,60,.75)", "#ffd0e0");
  },

  // ---------------- 背景(キャッシュ) ----------------
  drawStage(ctx) {
    const st = Game.currentStage();
    if (!this._bgCache || this._bgStage !== st.id) {
      this._bgStage = st.id;
      this._bgCache = document.createElement("canvas");
      this._bgCache.width = W; this._bgCache.height = H;
      this.paintBackground(this._bgCache.getContext("2d"), st);
    }
    ctx.drawImage(this._bgCache, 0, 0);
    // ステージ名プレート(動的でないが軽いので直描き)
    this.pill(ctx, 20, 18, `STAGE ${st.id} ${st.name}`, "rgba(0,0,0,.4)", "rgba(255,255,255,.75)", 15);
  },

  paintBackground(ctx, st) {
    const rand = lcg(st.id * 7919);
    // 空
    let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, st.sky); g.addColorStop(1, st.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON);

    // 太陽 / 火山の赤い光 (洞窟は光源なし)
    if (st.id === 9) {
      // 洞窟: 淡い燐光だけ
    } else if (st.id !== 5) {
      const glow = ctx.createRadialGradient(1080, 70, 8, 1080, 70, 90);
      glow.addColorStop(0, "rgba(255,245,200,.95)");
      glow.addColorStop(0.25, "rgba(255,235,170,.5)");
      glow.addColorStop(1, "rgba(255,235,170,0)");
      ctx.fillStyle = glow; ctx.fillRect(960, 0, 320, 190);
      ctx.fillStyle = "#fff3cf";
      ctx.beginPath(); ctx.arc(1080, 70, 26, 0, 7); ctx.fill();
    } else {
      const glow = ctx.createRadialGradient(1080, 90, 10, 1080, 90, 130);
      glow.addColorStop(0, "rgba(255,110,50,.8)");
      glow.addColorStop(1, "rgba(255,110,50,0)");
      ctx.fillStyle = glow; ctx.fillRect(920, 0, 360, 230);
    }

    // 遠景の山(2層シルエット)
    ctx.fillStyle = hexA(st.accent, 0.45);
    this.ridge(ctx, rand, HORIZON, 55, 5);
    ctx.fillStyle = hexA(st.accent, 0.75);
    this.ridge(ctx, rand, HORIZON, 30, 7);

    // 地面
    g = ctx.createLinearGradient(0, HORIZON - 10, 0, H);
    g.addColorStop(0, st.ground); g.addColorStop(1, st.ground2);
    ctx.fillStyle = g; ctx.fillRect(0, HORIZON, W, H - HORIZON);
    ctx.fillStyle = hexA("#000000", 0.25);
    ctx.fillRect(0, HORIZON, W, 3);

    // 地面の色ムラ(大きめパッチ・はっきりと)
    for (let i = 0; i < 30; i++) {
      const x = rand() * W, y = HORIZON + 40 + rand() * (H - HORIZON - 60);
      const r = 24 + rand() * 60;
      ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,.07)" : "rgba(255,230,200,.05)";
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.5, 0, 0, 7); ctx.fill();
    }
    // 太陽の側からの環境光(地面に落ちる暖色)
    const warm = ctx.createRadialGradient(1080, HORIZON + 60, 30, 1080, HORIZON + 60, 620);
    warm.addColorStop(0, st.id === 5 ? "rgba(255,120,60,.10)" : "rgba(255,235,170,.08)");
    warm.addColorStop(1, "rgba(255,235,170,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    // 地面の細かいノイズ(土の粒感)
    for (let i = 0; i < 380; i++) {
      const x = rand() * W, y = HORIZON + 10 + rand() * (H - HORIZON - 20);
      ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.07 + rand() * 0.07})` : `rgba(255,235,210,${0.05 + rand() * 0.06})`;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 2, 0, 7); ctx.fill();
    }
    // 立体感のある小石(ステージ対比色ではっきり見せる)
    for (let i = 0; i < 90; i++) {
      const x = rand() * W, y = HORIZON + 30 + rand() * (H - HORIZON - 50);
      const r = 2 + rand() * 5;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.45, r * 1.6, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = st.pebble;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.9, rand() * 0.6 - 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.7, r * 0.35, 0, 0, 7); ctx.fill();
    }
    // 大きな岩(中〜大サイズを全体に散らす)
    for (let i = 0; i < 13; i++) {
      const edge = rand() < 0.45;
      const x = edge ? (rand() < 0.5 ? rand() * 200 : W - rand() * 200) : rand() * W;
      const y = HORIZON + 40 + rand() * (H - HORIZON - 70);
      this.boulder(ctx, rand, x, y, 12 + rand() * 24, st.rock);
    }
    // ステージ固有の装飾
    this.paintDeco(ctx, st, rand);
  },

  ridge(ctx, rand, baseY, height, n) {
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    let x = 0;
    while (x < W) {
      const w2 = 90 + rand() * 200;
      const peak = baseY - 10 - rand() * height;
      ctx.quadraticCurveTo(x + w2 / 2, peak, x + w2, baseY);
      x += w2;
    }
    ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
  },

  paintDeco(ctx, st, rand) {
    const groundY = () => HORIZON + 50 + rand() * (H - HORIZON - 80);
    if (st.id === 1) { // 乾燥地帯: サボテン・枯れ草
      for (let i = 0; i < 4; i++) {
        const x = 80 + rand() * (W - 160), y = groundY();
        this.cactus(ctx, x, y, 0.7 + rand() * 0.6);
      }
      for (let i = 0; i < 18; i++) this.tuft(ctx, rand() * W, groundY(), "#8a7040", rand);
    } else if (st.id === 2) { // 摩天楼スラム: 夜のスカイライン・ネオン・経済格差
      // 光害グロー: 高層側の空がネオンで滲む(シルエットを浮かせる下地)
      const glow = ctx.createLinearGradient(0, HORIZON - 150, 0, HORIZON);
      glow.addColorStop(0, "rgba(217,87,176,0)");
      glow.addColorStop(0.7, "rgba(120,80,150,.10)");
      glow.addColorStop(1, "rgba(255,170,120,.16)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, HORIZON - 150, W, 150);
      // 左=高層(煌びやか) → 右=スラム(暗い)のグラデーションで格差を描く
      let bx = -20;
      let sign = 0;
      while (bx < W) {
        const highSide = bx < W * 0.55;
        const bw = highSide ? 46 + rand() * 40 : 34 + rand() * 30;
        const bh = highSide ? 90 + rand() * 130 : 24 + rand() * 46;
        const top = HORIZON - bh;
        ctx.fillStyle = highSide ? "#232c4a" : "#262530";
        ctx.fillRect(bx, top, bw, bh);
        ctx.fillStyle = highSide ? "rgba(159,208,255,.25)" : "rgba(216,195,165,.12)";
        ctx.fillRect(bx, top, bw, 1.5); // 屋上の縁明かり
        // 窓明かり: 高層=多く暖色/寒色、スラム=まばらで薄暗い
        const litRate = highSide ? 0.5 : 0.12;
        for (let wy = top + 6; wy < HORIZON - 6; wy += 9) {
          for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) {
            if (rand() < litRate) {
              ctx.fillStyle = highSide
                ? (rand() < 0.5 ? "rgba(255,217,138,.85)" : "rgba(159,208,255,.8)")
                : "rgba(201,162,94,.4)";
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
        // 高層のみ: 屋上ネオン(惑星アクセントのネオンピンク+シアン・1本は明滅)
        if (highSide && rand() < 0.6) {
          const nx = bx + 4 + rand() * (bw - 12);
          const neon = rand() < 0.5 ? "217,87,176" : "95,204,217";
          const pulse = sign++ === 1 ? 0.55 + Math.sin(this.time * 2.2) * 0.3 : 0.8;
          ctx.fillStyle = `rgba(${neon},${0.16 * pulse})`;
          ctx.fillRect(nx - 4, top - 8, 14, 12); // ハロー
          ctx.fillStyle = `rgba(${neon},${pulse})`;
          ctx.fillRect(nx, top - 5, 6, 3);
          ctx.fillRect(nx + 8, top - 4, 2, 2);
        }
        // スラムのみ: トタン屋根の段差
        if (!highSide) {
          ctx.fillStyle = "#22222c";
          ctx.fillRect(bx - 3, top - 3, bw * 0.6, 4);
        }
        bx += bw + (highSide ? 6 : 3);
      }
      // 地面: 廃材・水たまりのネオン反射(軽め)
      for (let i = 0; i < 8; i++) {
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "#22222a";
        ctx.fillRect(x, y - 3, 10 + rand() * 14, 5);
      }
      for (let i = 0; i < 3; i++) {
        const x = W * 0.15 + rand() * W * 0.45, y = groundY();
        ctx.fillStyle = "rgba(217,87,176,.10)";
        ctx.beginPath(); ctx.ellipse(x, y, 26 + rand() * 18, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(159,208,255,.07)";
        ctx.beginPath(); ctx.ellipse(x + 8, y + 2, 14, 3.5, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 3) { // 森林: 地平線の木・シダ
      for (let i = 0; i < 9; i++) {
        const x = rand() * W, s = 0.6 + rand() * 0.7;
        ctx.fillStyle = "#233a1e";
        ctx.fillRect(x - 4 * s, HORIZON - 46 * s, 8 * s, 46 * s);
        ctx.beginPath(); ctx.arc(x, HORIZON - 52 * s, 26 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#2e4a26";
        ctx.beginPath(); ctx.arc(x - 10 * s, HORIZON - 44 * s, 16 * s, 0, 7); ctx.arc(x + 10 * s, HORIZON - 46 * s, 15 * s, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 22; i++) this.tuft(ctx, rand() * W, groundY(), "#2c4a22", rand);
    } else if (st.id === 4) { // 湿地: 水たまり・葦
      for (let i = 0; i < 6; i++) {
        const x = 80 + rand() * (W - 160), y = groundY(), r = 26 + rand() * 44;
        ctx.fillStyle = "rgba(70,110,125,.65)";
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.42, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(160,210,220,.3)";
        ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.08, r * 0.9, r * 0.2, 0, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = rand() * W, y = groundY();
        ctx.strokeStyle = "#3a5a3a"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 22, x + 2, y - 34); ctx.stroke();
        ctx.fillStyle = "#6a5636";
        ctx.beginPath(); ctx.ellipse(x + 2, y - 34, 3, 8, 0.2, 0, 7); ctx.fill();
      }
    } else if (st.id === 5) { // 火山: 溶岩の裂け目・黒岩
      for (let i = 0; i < 7; i++) {
        let x = rand() * W, y = groundY();
        ctx.strokeStyle = "rgba(255,120,40,.85)"; ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255,100,30,.9)"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let p = 0; p < 4; p++) { x += 18 + rand() * 30; y += (rand() - 0.5) * 26; ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (let i = 0; i < 8; i++) {
        const x = rand() * W, y = groundY(), r = 12 + rand() * 20;
        ctx.fillStyle = "#241814";
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r * 0.8, y + 4, r * 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.06)";
        ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.5, 0, 7); ctx.fill();
      }
    } else if (st.id === 6) { // 密林: 蔦と大きなシダ・木漏れ日
      for (let i = 0; i < 10; i++) { // 上から垂れる蔦
        const x = rand() * W;
        ctx.strokeStyle = "#2a4222"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 15, 40 + rand() * 40, x - 5, 70 + rand() * 80);
        ctx.stroke();
        ctx.fillStyle = "#3a5a2c";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.ellipse(x + (rand() - 0.5) * 16, 25 + k * 28, 7, 3.5, rand() * 2, 0, 7); ctx.fill();
        }
      }
      for (let i = 0; i < 14; i++) { // シダ
        const x = rand() * W, y = groundY(), s2 = 0.7 + rand() * 0.8;
        ctx.strokeStyle = "#39592c"; ctx.lineWidth = 2;
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + b * 12 * s2, y - 22 * s2, x + b * 20 * s2, y - 14 * s2);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 5; i++) { // 木漏れ日
        const x = rand() * W, y = HORIZON + 60 + rand() * 300;
        ctx.fillStyle = "rgba(255,250,190,.05)";
        ctx.beginPath(); ctx.ellipse(x, y, 60 + rand() * 60, 20 + rand() * 15, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 7) { // 大湿原: 立ち枯れ・水たまり・霧
      for (let i = 0; i < 7; i++) { // 立ち枯れの木
        const x = rand() * W, s2 = 0.5 + rand() * 0.7;
        ctx.strokeStyle = "#3d4238"; ctx.lineWidth = 5 * s2;
        ctx.beginPath(); ctx.moveTo(x, HORIZON + 4); ctx.lineTo(x + 4, HORIZON - 44 * s2);
        ctx.moveTo(x + 2, HORIZON - 26 * s2); ctx.lineTo(x + 16 * s2, HORIZON - 38 * s2);
        ctx.moveTo(x + 3, HORIZON - 32 * s2); ctx.lineTo(x - 12 * s2, HORIZON - 42 * s2);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) { // 水たまり
        const x = 80 + rand() * (W - 160), y = groundY(), r = 24 + rand() * 40;
        ctx.fillStyle = "rgba(90,120,130,.5)";
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(170,200,205,.25)";
        ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - 2, r * 0.8, r * 0.18, 0, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 6; i++) { // 漂う霧
        const x = rand() * W, y = HORIZON + 30 + rand() * 320;
        ctx.fillStyle = "rgba(215,225,220,.08)";
        ctx.beginPath(); ctx.ellipse(x, y, 130 + rand() * 120, 18 + rand() * 12, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 8) { // 雪原: オーロラ・雪・吹き溜まり
      for (let i = 0; i < 3; i++) { // オーロラ
        const x0 = rand() * W;
        const grad = ctx.createLinearGradient(x0, 0, x0 + 200, HORIZON);
        grad.addColorStop(0, "rgba(120,255,190,.16)");
        grad.addColorStop(0.5, "rgba(140,180,255,.1)");
        grad.addColorStop(1, "rgba(120,255,190,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.quadraticCurveTo(x0 + 100, HORIZON * 0.5, x0 + 60, HORIZON - 20);
        ctx.lineTo(x0 + 140, HORIZON - 30);
        ctx.quadraticCurveTo(x0 + 190, HORIZON * 0.4, x0 + 90, 0);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 60; i++) { // 粉雪
        ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
        ctx.beginPath(); ctx.arc(rand() * W, rand() * H, 1 + rand() * 1.8, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 6; i++) { // 吹き溜まり
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.beginPath(); ctx.ellipse(x, y, 50 + rand() * 60, 10 + rand() * 8, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 9) { // 洞窟: 鍾乳石・燐光キノコ
      ctx.fillStyle = st.accent;
      for (let i = 0; i < 12; i++) { // 鍾乳石
        const x = rand() * W, w2 = 14 + rand() * 22, h2 = 40 + rand() * 70;
        ctx.beginPath();
        ctx.moveTo(x - w2 / 2, 0); ctx.lineTo(x + w2 / 2, 0); ctx.lineTo(x, h2);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 16; i++) { // 燐光キノコ
        const x = rand() * W, y = groundY();
        const glow = ctx.createRadialGradient(x, y - 6, 1, x, y - 6, 22);
        glow.addColorStop(0, "rgba(110,240,220,.5)");
        glow.addColorStop(1, "rgba(110,240,220,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y - 6, 22, 0, 7); ctx.fill();
        ctx.fillStyle = "#6ef0dc";
        ctx.beginPath(); ctx.ellipse(x, y - 6, 5, 3.5, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#4aa898";
        ctx.fillRect(x - 1.2, y - 6, 2.4, 6);
      }
    } else if (st.id === 10) { // 古代遺跡: 石柱・遺物・苔
      for (let i = 0; i < 7; i++) { // 崩れた石柱
        const x = 60 + rand() * (W - 120), y = groundY();
        const h2 = 40 + rand() * 70, w2 = 16 + rand() * 8;
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath(); ctx.ellipse(x, y + 4, w2 * 1.3, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#9a8c74";
        ctx.fillRect(x - w2 / 2, y - h2, w2, h2);
        ctx.fillStyle = "#b3a58c";
        ctx.fillRect(x - w2 / 2 - 3, y - h2 - 8, w2 + 6, 9);
        ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1.5;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath(); ctx.moveTo(x - w2 / 2, y - (h2 / 4) * k); ctx.lineTo(x + w2 / 2, y - (h2 / 4) * k); ctx.stroke();
        }
        ctx.fillStyle = "rgba(90,130,70,.5)"; // 苔
        ctx.beginPath(); ctx.ellipse(x - w2 / 4, y - h2 + 6, w2 / 3, 5, 0.4, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 8; i++) { // 金の遺物のきらめき
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "#d9b45a";
        ctx.beginPath(); ctx.arc(x, y, 3 + rand() * 3, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,240,180,.8)";
        ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.2, 0, 7); ctx.fill();
      }
    }
  },

  cactus(ctx, x, y, s) {
    ctx.fillStyle = "#4e7a35";
    ctx.strokeStyle = "#33511f"; ctx.lineWidth = 2;
    rr(ctx, x - 9 * s, y - 62 * s, 18 * s, 62 * s, 9 * s); ctx.fill(); ctx.stroke();
    rr(ctx, x - 30 * s, y - 48 * s, 12 * s, 26 * s, 6 * s); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 30 * s, y - 26 * s, 22 * s, 8 * s);
    rr(ctx, x + 18 * s, y - 40 * s, 12 * s, 20 * s, 6 * s); ctx.fill(); ctx.stroke();
    ctx.fillRect(x + 8 * s, y - 24 * s, 22 * s, 8 * s);
  },

  tuft(ctx, x, y, color, rand) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let b = -3; b <= 3; b++) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + b * 3, y - 8, x + b * 5, y - 13 - Math.abs(b));
    }
    ctx.stroke();
  },

  // 立体感のある岩(不規則多角形+接地影+ハイライト面)
  boulder(ctx, rand, x, y, r, baseCol) {
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.beginPath(); ctx.ellipse(x + r * 0.12, y + r * 0.42, r * 1.15, r * 0.4, 0, 0, 7); ctx.fill();
    const nv = 8, vx = [], vy = [];
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * Math.PI * 2;
      const rr2 = r * (0.75 + rand() * 0.4) * (Math.sin(a) > 0 ? 0.82 : 1);
      vx.push(x + Math.cos(a) * rr2);
      vy.push(y + Math.sin(a) * rr2 * 0.82);
    }
    ctx.fillStyle = baseCol || "#4a4034";
    ctx.beginPath(); ctx.moveTo(vx[0], vy[0]);
    for (let i = 1; i < nv; i++) ctx.lineTo(vx[i], vy[i]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    // 左上のハイライト面
    ctx.fillStyle = "rgba(255,255,255,.13)";
    ctx.beginPath();
    ctx.moveTo(vx[4], vy[4]); ctx.lineTo(vx[5], vy[5]); ctx.lineTo(vx[6], vy[6]); ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill();
  },

  // ---------------- 設備 ----------------
  drawFacilities(ctx) {
    const lv = (id) => Game.facLv(id);
    const P = FAC_POS;

    if (lv("water")) { // 岸のある水場
      const p = P.water, r = 78 + lv("water") * 4;
      // 岸(明るい砂の縁)
      ctx.fillStyle = "#8a7350";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.14, r * 0.44, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, r * 1.04, r * 0.4, 0, 0, 7); ctx.fill();
      // 深い水 → 浅瀬のグラデーション
      ctx.fillStyle = "#26485f";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#3d6f8f";
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.05, p.y - 2, r * 0.78, r * 0.27, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#5b93b5";
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.12, p.y - 4, r * 0.5, r * 0.16, 0, 0, 7); ctx.fill();
      // 波紋(2重)
      ctx.strokeStyle = "rgba(210,240,252,.35)"; ctx.lineWidth = 1.8;
      for (const off of [0, 1.5]) {
        const w = ((this.time + off) % 3) / 3;
        ctx.globalAlpha = 1 - w;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 3, r * 0.6 * w + 8, (r * 0.6 * w + 8) * 0.3, 0, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // きらめき
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.ellipse(p.x - r * 0.3, p.y - 6, 9, 2, -0.2, 0, 7);
      ctx.ellipse(p.x + r * 0.25, p.y + 3, 6, 1.5, 0.15, 0, 7);
      ctx.fill();
      this.pill(ctx, p.x - 44, p.y + r * 0.44 + 6, "水場 Lv" + lv("water"));
    }

    if (lv("shelter")) { // 岩の洞窟
      const p = P.shelter;
      ctx.fillStyle = "rgba(0,0,0,.32)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 78, 20, 0, 0, 7); ctx.fill();
      // 岩のドーム(重なった岩塊)
      ctx.fillStyle = "#5a4c3e";
      ctx.beginPath();
      ctx.arc(p.x - 28, p.y - 18, 34, 0, 7);
      ctx.arc(p.x + 20, p.y - 24, 38, 0, 7);
      ctx.arc(p.x + 42, p.y - 6, 26, 0, 7);
      ctx.arc(p.x - 48, p.y - 2, 24, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#463a2e";
      ctx.beginPath(); ctx.arc(p.x + 34, p.y - 12, 28, 0, 7); ctx.fill();
      // 上面のハイライト
      ctx.fillStyle = "rgba(255,255,255,.09)";
      ctx.beginPath(); ctx.arc(p.x - 20, p.y - 34, 22, 0, 7); ctx.arc(p.x + 16, p.y - 40, 20, 0, 7); ctx.fill();
      // 入口(奥行きのある闇)
      const g = ctx.createRadialGradient(p.x, p.y + 4, 4, p.x, p.y + 4, 30);
      g.addColorStop(0, "#000"); g.addColorStop(1, "#1c1510");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 27, 22, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(p.x - 27, p.y + 4, 54, 5);
      this.pill(ctx, p.x - 58, p.y + 24, "シェルター Lv" + lv("shelter"));
    }

    if (lv("heat")) { // 吊りランプ(保温設備)
      const p = P.light;
      // 地面の光だまり
      const flick = 0.85 + Math.sin(this.time * 7) * 0.08;
      ctx.fillStyle = `rgba(255,214,120,${0.1 * flick})`;
      ctx.beginPath(); ctx.ellipse(p.x - 46, p.y + 52, 78, 24, 0, 0, 7); ctx.fill();
      // ポール+腕木
      ctx.strokeStyle = "#3d3222"; ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y + 60); ctx.lineTo(p.x, p.y - 46); ctx.stroke();
      ctx.strokeStyle = "#55462f"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 44); ctx.lineTo(p.x - 44, p.y - 52); ctx.stroke();
      // 吊り紐+笠+電球
      ctx.strokeStyle = "#2b2318"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x - 44, p.y - 52); ctx.lineTo(p.x - 46, p.y - 42); ctx.stroke();
      const glow = ctx.createRadialGradient(p.x - 46, p.y - 34, 4, p.x - 46, p.y - 34, 66);
      glow.addColorStop(0, `rgba(255,222,130,${0.85 * flick})`);
      glow.addColorStop(1, "rgba(255,222,130,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x - 46, p.y - 34, 66, 0, 7); ctx.fill();
      ctx.fillStyle = "#6b5433";
      ctx.beginPath(); ctx.moveTo(p.x - 58, p.y - 36); ctx.lineTo(p.x - 34, p.y - 36); ctx.lineTo(p.x - 40, p.y - 44); ctx.lineTo(p.x - 52, p.y - 44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffedb0";
      ctx.beginPath(); ctx.arc(p.x - 46, p.y - 30, 8, 0, 7); ctx.fill();
      this.pill(ctx, p.x - 50, p.y + 68, "保温設備 Lv" + lv("heat"));
    }

    if (lv("breedfac")) { // 繁殖施設(岩場と草の巣)
      const p = P.rocks;
      const rrand = lcg(777);
      this.boulder(ctx, rrand, p.x - 34, p.y + 8, 18, "#5d5142");
      this.boulder(ctx, rrand, p.x + 2, p.y - 2, 27, "#6b5c4a");
      this.boulder(ctx, rrand, p.x + 42, p.y + 10, 16, "#55483a");
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.beginPath(); ctx.ellipse(p.x + 20, p.y + 22, 8, 3, 0, 0, 7); ctx.ellipse(p.x - 12, p.y + 24, 6, 2.5, 0, 0, 7); ctx.fill();
      this.pill(ctx, p.x - 44, p.y + 36, "繁殖施設 Lv" + lv("breedfac"));
    }

    if (lv("feeder")) { // 餌場(自動給餌トラフ)
      const p = P.heat;
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 18, 62, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#33261c";
      rr(ctx, p.x - 58, p.y - 18, 116, 36, 9); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 2;
      rr(ctx, p.x - 58, p.y - 18, 116, 36, 9); ctx.stroke();
      // コイル(脈動する発光)
      const pulse = 0.55 + Math.sin(this.time * 4) * 0.3;
      ctx.shadowColor = `rgba(255,120,40,${pulse})`; ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(255,150,70,${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 3.5; ctx.lineCap = "round";
      for (const oy of [-8, 0, 8]) {
        ctx.beginPath(); ctx.moveTo(p.x - 48, p.y + oy); ctx.lineTo(p.x + 48, p.y + oy); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      this.pill(ctx, p.x - 44, p.y + 26, "餌場 Lv" + lv("feeder"));
    }

    if (lv("fence")) { // 木製フェンス
      const x = P.fenceX;
      // 横板(2本、奥に)
      ctx.strokeStyle = "#4d3d24"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 1, 244); ctx.lineTo(x - 1, 696); ctx.stroke();
      ctx.strokeStyle = "#5f4c2d"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 7, 250); ctx.lineTo(x + 7, 692); ctx.stroke();
      // 支柱(丸頭+木目)
      for (let y = 232; y <= 680; y += 46) {
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.beginPath(); ctx.ellipse(x + 2, y + 40, 9, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#6b5433";
        rr(ctx, x - 5, y, 10, 40, 4); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.2;
        rr(ctx, x - 5, y, 10, 40, 4); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.14)";
        rr(ctx, x - 3.5, y + 1.5, 3, 36, 2); ctx.fill();
      }
      this.pill(ctx, x - 62, 206, "フェンス Lv" + lv("fence"));
    }
  },

  // 巣穴: アダルトの生活拠点+探索の入口(タップで巣ビュー)
  drawBurrow(ctx) {
    const resting = Game.state.lizards.filter((l) => l.resting).length;
    const x = 480, y = 668;
    // 掘り出した土+穴
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(x, y + 8, 52, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#57452c";
    ctx.beginPath(); ctx.ellipse(x, y + 2, 46, 15, 0, Math.PI, 0); ctx.fill();
    const g = ctx.createRadialGradient(x, y, 3, x, y, 34);
    g.addColorStop(0, "#000"); g.addColorStop(1, "#241a10");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y + 1, 32, 11, 0, 0, 7); ctx.fill();
    // 中から覗く目(数匹分)
    for (let i = 0; i < Math.min(3, Math.ceil(resting / 30)); i++) {
      const ex = x - 14 + i * 14, blink = Math.sin(this.time * 2 + i * 2.1) > -0.85;
      if (!blink) continue;
      ctx.fillStyle = "#ffcc44";
      ctx.beginPath(); ctx.arc(ex, y - 1, 2, 0, 7); ctx.arc(ex + 5, y - 1, 2, 0, 7); ctx.fill();
    }
    const st = Game.currentStage();
    const label = [`${st.nest}`];
    if (resting > 0) label.push(`休${resting}`);
    this.pill(ctx, x - 60, y + 16, label.join(" ") + " (タップで巣)");
  },

  // Phase3 追加設備の小型マーカー(小屋+アイコンラベル)
  drawSmallFacilities(ctx) {
    const spots = {
      observatory: [1005, 330], watchtower: [862, 204], trap: [1148, 668],
    };
    for (const f of FACILITIES) {
      if (!f.unlock || !Game.facLv(f.id)) continue;
      const p = spots[f.id];
      if (!p) continue;
      const [x, y] = p;
      // 接地影+小屋
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x, y + 13, 22, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#57452c";
      rr(ctx, x - 16, y - 8, 32, 20, 4); ctx.fill();
      ctx.fillStyle = "#6d5636";
      ctx.beginPath();
      ctx.moveTo(x - 20, y - 6); ctx.lineTo(x, y - 20); ctx.lineTo(x + 20, y - 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.4;
      rr(ctx, x - 16, y - 8, 32, 20, 4); ctx.stroke();
      // 特殊演出
      if (f.id === "bonfire") { // 炎
        const fl = Math.sin(this.time * 9) * 3;
        const g = ctx.createRadialGradient(x, y - 24, 2, x, y - 24, 26);
        g.addColorStop(0, "rgba(255,180,80,.8)"); g.addColorStop(1, "rgba(255,180,80,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y - 24, 26, 0, 7); ctx.fill();
        ctx.fillStyle = "#ff9a40";
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 18); ctx.quadraticCurveTo(x - 2 + fl, y - 34, x, y - 38 + fl);
        ctx.quadraticCurveTo(x + 4 - fl, y - 30, x + 6, y - 18);
        ctx.closePath(); ctx.fill();
      } else if (f.id === "altar") { // 金の光
        const g = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 30);
        g.addColorStop(0, `rgba(255,220,120,${0.35 + Math.sin(this.time * 2) * 0.15})`);
        g.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y - 12, 30, 0, 7); ctx.fill();
      }
      this.pill(ctx, x - 30, y + 16, `${f.icon}Lv${Game.facLv(f.id)}`);
    }
  },

  // 半透明ラベル
  pill(ctx, x, y, txt, bg, fg, size) {
    ctx.font = `${size || 12}px sans-serif`;
    const w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = bg || "rgba(0,0,0,.38)";
    rr(ctx, x, y, w, (size || 12) + 10, 7); ctx.fill();
    ctx.fillStyle = fg || "rgba(255,255,255,.85)";
    ctx.textAlign = "left";
    ctx.fillText(txt, x + 7, y + (size || 12) + 2);
  },

  // ---------------- 巣(卵) ----------------
  drawNest(ctx) {
    const eggs = Game.state.eggs;
    const n = NEST;
    const rand = lcg(1234);
    // 接地影と土の盛り上がり
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 12, 86, 22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#5d4a30";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 4, 80, 30, 0, 0, 7); ctx.fill();
    // 放射状の藁(2トーン)
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r1 = 26 + rand() * 10, r2 = 58 + rand() * 22;
      ctx.strokeStyle = rand() < 0.5 ? "#a8854a" : "#78592e";
      ctx.lineWidth = 1.6 + rand() * 1.8;
      ctx.beginPath();
      ctx.moveTo(n.x + Math.cos(a) * r1, n.y + Math.sin(a) * r1 * 0.5);
      ctx.quadraticCurveTo(
        n.x + Math.cos(a) * (r1 + r2) * 0.55, n.y + Math.sin(a) * (r1 + r2) * 0.28 - 3,
        n.x + Math.cos(a) * r2, n.y + Math.sin(a) * r2 * 0.48 - rand() * 3,
      );
      ctx.stroke();
    }
    // 内側のくぼみ
    ctx.fillStyle = "#42301a";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 36, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#59452a";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 3, 30, 12, 0, 0, 7); ctx.fill();
    // 卵(白くつややかに・孵化プログレスリング付き。ラッキー卵は虹色)
    for (let i = 0; i < eggs.length; i++) {
      const egg = eggs[i];
      const x = n.x - 24 + i * 24, y = n.y + 1;
      const wob = egg.t < 8 && egg.t > 0 ? Math.sin(this.time * 18 + i) * 2.5 : 0;
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(x + wob, y + 10, 11, 4, 0, 0, 7); ctx.fill();
      if (egg.lucky) {
        const hh = Math.floor((this.time * 70 + i * 60) % 360);
        ctx.shadowColor = `hsl(${hh},90%,65%)`; ctx.shadowBlur = 14;
        ctx.fillStyle = `hsl(${hh},70%,72%)`;
      } else {
        ctx.fillStyle = "#f6efdd";
      }
      ctx.beginPath(); ctx.ellipse(x + wob, y, 11, 14, 0, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(190,170,130,.5)";
      ctx.beginPath(); ctx.ellipse(x + wob + 3, y + 4, 6, 8, -0.3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath(); ctx.ellipse(x + wob - 3.5, y - 5, 3.5, 5.5, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(120,100,70,.6)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x + wob, y, 11, 14, 0, 0, 7); ctx.stroke();
      // 進捗リング
      const prog = 1 - egg.t / egg.total;
      ctx.strokeStyle = "rgba(242,198,94,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 19, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    }
    this.pill(ctx, n.x - 24, n.y + 34, "卵の巣");
  },

  // ---------------- トカゲ(横向き・オオトカゲスタイル) ----------------
  // 参照: 頭を高く上げた立ち姿 / 高く跳ね上がる鞭状の尾 / 爪のある四肢 / 喉のたるみ
  drawLizard(ctx, lz) {
    const sp = speciesById(lz.speciesId);
    const col = this.lizardColor(lz);
    // 群衆スケール: 表示数が多いほど縮小して見通しを確保
    const scale = sp.size * (lz.stage === "baby" ? 0.5 : 1) * Game.crowdScale();
    const L = 105 * scale;                    // 体格スケール
    const injured = lz.injuredT > 0;
    const moving = lz.moving && !injured;
    const phase = this.time * 8 + lz.id * 1.31;
    const face = Math.cos(lz.angle) >= 0 ? 1 : -1; // 横向きスプライトは左右反転のみ
    const baseAlpha = injured ? 0.55 : 1;

    const outline = "rgba(18,10,4,.6)";
    const darker = `hsl(${col.h},${Math.min(100, col.s + 5)}%,${Math.max(6, col.l - 22)}%)`;
    const darkest = `hsl(${col.h},${Math.min(100, col.s + 5)}%,${Math.max(4, col.l - 34)}%)`;
    const lighter = `hsl(${col.h},${Math.max(0, col.s - 14)}%,${Math.min(93, col.l + 16)}%)`;

    ctx.save();
    ctx.translate(lz.x, lz.y);
    if (injured) ctx.globalAlpha = 0.55;

    // 地面の影
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath(); ctx.ellipse(-L * 0.06 * face, L * 0.01, L * 0.42, L * 0.06, 0, 0, 7); ctx.fill();

    ctx.scale(face, 1);
    if (moving) {
      ctx.rotate(clamp(Math.sin(lz.angle), -1, 1) * 0.1 * face); // 縦移動でわずかに傾く
      ctx.translate(0, Math.sin(phase * 2) * L * 0.008);          // 歩行の上下動
    }
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    // --- 背骨サンプリング (t=0 尾先 → 1 鼻先、地面が y=0) ---
    const N = 34;
    const pts = [], nrm = [], wid = [];
    const tailAmp = L * (moving ? 0.05 : 0.02);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const k = lizSideSample(t);
      let w = k.w * L;
      let y = k.y * L;
      // 尾のしなり(先端ほど大きく)
      if (t < 0.42) y += Math.sin(phase * 0.8 - t * 9) * tailAmp * Math.pow((0.42 - t) / 0.42, 1.6);
      // 種族ごとの体型
      if (sp.id === "leopa" && t > 0.14 && t < 0.48) w *= 1.8;   // 脂肪を蓄えた太い尾
      if (sp.id === "futoago" && t > 0.5 && t < 0.8) w *= 1.18;  // 幅広の胴
      if (sp.id === "komodo") w *= 1.15;                          // 重量級
      if (sp.id === "kanahebi" && t < 0.48) w *= 0.7;             // 細い尾
      pts.push({ x: k.x * L, y }); wid.push(w);
    }
    // 平滑化(キーポイント折れ線の角を落とす)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < N; i++) {
        pts[i].x = (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4;
        pts[i].y = (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4;
      }
    }
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      nrm.push({ x: -dy / d, y: dx / d });
    }
    // 各サンプルの「背側」がどちらかを判定(+n*u が上)
    const up = [];
    for (let i = 0; i <= N; i++) up.push(nrm[i].y < 0 ? 1 : -1);
    const S = (t) => {
      const i = Math.round(clamp(t, 0, 1) * N);
      return { p: pts[i], n: nrm[i], w: wid[i], u: up[i], i };
    };

    // --- 輪郭パス(ごつごつの隆起付き) ---
    const orand = lcg(lz.id * 977 + 3);
    const jagA = [], jagB = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = 0.12 * (t < 0.82 ? 1 : 0.4); // 頭部は鱗が細かい
      jagA.push(1 + (orand() * 2 - 1) * a);
      jagB.push(1 + (orand() * 2 - 1) * a);
    }
    const body = new Path2D();
    body.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= N; i++) body.lineTo(pts[i].x + nrm[i].x * wid[i] * jagA[i], pts[i].y + nrm[i].y * wid[i] * jagA[i]);
    for (let i = N; i >= 0; i--) body.lineTo(pts[i].x - nrm[i].x * wid[i] * jagB[i], pts[i].y - nrm[i].y * wid[i] * jagB[i]);
    body.closePath();

    // --- 脚(爪のある四肢): 奥側 → 体 → 手前側の順で奥行きを出す ---
    const claws = (toe, dir) => {
      ctx.strokeStyle = "#1a120a";
      ctx.lineWidth = Math.max(1.2, L * 0.012);
      for (const [dx2, dy2] of [[L * 0.036, L * 0.012], [L * 0.042, -L * 0.002], [L * 0.033, -L * 0.016]]) {
        ctx.beginPath();
        ctx.moveTo(toe.x, toe.y);
        ctx.quadraticCurveTo(toe.x + dx2 * 0.7 * dir, toe.y + dy2 - L * 0.01, toe.x + dx2 * dir, toe.y + dy2 + L * 0.006);
        ctx.stroke();
      }
    };
    const legPair = (isFar) => {
      const shift = isFar ? L * 0.035 : 0;
      const c = isFar ? darkest : col.css;
      const phOff = isFar ? Math.PI : 0;
      // --- 後脚(筋肉質の太もも) ---
      const hip = { x: -L * 0.06 + shift, y: -L * 0.1 };
      const swH = moving ? Math.sin(phase + phOff) * L * 0.05 : 0;
      const liftH = moving ? Math.max(0, Math.sin(phase + phOff + 0.7)) * L * 0.04 : 0;
      const kneeH = { x: hip.x + L * 0.09 + swH * 0.6, y: -L * 0.055 };
      const ankH = { x: hip.x - L * 0.04 + swH, y: -L * 0.012 - liftH };
      const toeH = { x: ankH.x + L * 0.12 + swH * 0.3, y: -L * 0.004 - liftH * 0.6 };
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse((hip.x + kneeH.x) / 2, (hip.y + kneeH.y) / 2 + L * 0.012, L * 0.08, L * 0.055, 0.5, 0, 7); ctx.fill();
      if (!isFar) {
        ctx.strokeStyle = outline; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse((hip.x + kneeH.x) / 2, (hip.y + kneeH.y) / 2 + L * 0.012, L * 0.08, L * 0.055, 0.5, 0, 7); ctx.stroke();
      }
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(3, L * 0.042);
      ctx.beginPath(); ctx.moveTo(kneeH.x, kneeH.y); ctx.lineTo(ankH.x, ankH.y); ctx.stroke();
      ctx.lineWidth = Math.max(2.4, L * 0.028);
      ctx.beginPath(); ctx.moveTo(ankH.x, ankH.y); ctx.lineTo(toeH.x, toeH.y); ctx.stroke();
      if (!isFar) claws(toeH, 1);
      // --- 前脚 ---
      const sh = { x: L * 0.2 + shift, y: -L * 0.14 };
      const swF = moving ? Math.sin(phase + phOff + Math.PI) * L * 0.045 : 0;
      const liftF = moving ? Math.max(0, Math.sin(phase + phOff + Math.PI + 0.7)) * L * 0.035 : 0;
      const elb = { x: sh.x - L * 0.025 + swF * 0.5, y: -L * 0.07 };
      const wri = { x: sh.x + L * 0.008 + swF, y: -L * 0.012 - liftF };
      const toeF = { x: wri.x + L * 0.08 + swF * 0.3, y: -L * 0.004 - liftF * 0.6 };
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse((sh.x + elb.x) / 2, (sh.y + elb.y) / 2, L * 0.055, L * 0.042, 1.25, 0, 7); ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(3, L * 0.038);
      ctx.beginPath(); ctx.moveTo(elb.x, elb.y); ctx.lineTo(wri.x, wri.y); ctx.stroke();
      ctx.lineWidth = Math.max(2.4, L * 0.026);
      ctx.beginPath(); ctx.moveTo(wri.x, wri.y); ctx.lineTo(toeF.x, toeF.y); ctx.stroke();
      if (!isFar) claws(toeF, 1);
    };
    legPair(true); // 奥側の脚

    // エリマキトカゲのフリルは首の後ろ(体より奥)に描く
    if (sp.id === "erimaki") {
      const nk = S(0.86);
      ctx.fillStyle = `hsl(${col.h},${Math.min(100, col.s + 12)}%,${Math.max(10, col.l - 10)}%)`;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(nk.p.x - L * 0.03, nk.p.y + L * 0.03, L * 0.15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = darker; ctx.lineWidth = 1.2;
      for (let a = 0; a < 6.2; a += 0.52) {
        ctx.beginPath();
        ctx.moveTo(nk.p.x - L * 0.03, nk.p.y + L * 0.03);
        ctx.lineTo(nk.p.x - L * 0.03 + Math.cos(a) * L * 0.145, nk.p.y + L * 0.03 + Math.sin(a) * L * 0.145);
        ctx.stroke();
      }
    }

    // --- 胴体+尾+首+頭(一体の輪郭) ---
    if (sp.glow || lz.morphId === "legendary") { // 発光系統・伝説個体
      ctx.shadowColor = `hsla(${col.h},95%,65%,${0.75 + Math.sin(this.time * 3 + lz.id) * 0.2})`;
      ctx.shadowBlur = lz.morphId === "legendary" ? 30 : 24;
    }
    ctx.fillStyle = col.css;
    ctx.fill(body);
    ctx.shadowBlur = 0;

    // --- 陰影・質感・模様(体内にクリップ) ---
    ctx.save();
    ctx.clip(body);

    // 縁の内側を暗く(立体感)
    ctx.strokeStyle = darker; ctx.globalAlpha = baseAlpha * 0.4;
    ctx.lineWidth = L * 0.05;
    ctx.stroke(body);
    ctx.globalAlpha = baseAlpha;

    // 背側を暗く・腹側を明るく(写真の上下トーン)
    const edgePath = (sign, k) => {
      ctx.beginPath();
      for (let i = 1; i <= N - 1; i++) {
        const m = i === 1 ? "moveTo" : "lineTo";
        ctx[m](pts[i].x + nrm[i].x * wid[i] * k * sign * up[i], pts[i].y + nrm[i].y * wid[i] * k * sign * up[i]);
      }
    };
    ctx.strokeStyle = darkest; ctx.globalAlpha = baseAlpha * 0.3;
    ctx.lineWidth = L * 0.05; edgePath(1, 0.72); ctx.stroke();
    ctx.strokeStyle = lighter; ctx.globalAlpha = baseAlpha * 0.42;
    ctx.lineWidth = L * 0.06; edgePath(-1, 0.66); ctx.stroke();
    ctx.globalAlpha = baseAlpha;

    // ごつごつしたイボ状の鱗
    const trand = lcg(lz.id * 331 + 7);
    for (let i = 0; i < 34; i++) {
      const t = 0.08 + trand() * 0.88;
      const lat = (trand() * 2 - 1) * 0.8;
      const s0 = S(t);
      const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
      const r = L * (0.007 + trand() * 0.01);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.45, r, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.85, 0, 7); ctx.fill();
    }
    // 大きめの結節
    for (let i = 0; i < 6; i++) {
      const t = 0.45 + trand() * 0.33;
      const lat = (trand() * 2 - 1) * 0.55;
      const s0 = S(t);
      const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
      const r = L * (0.013 + trand() * 0.009);
      ctx.fillStyle = "rgba(0,0,0,.32)";
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.5, r, 0, 7); ctx.fill();
      ctx.fillStyle = darker;
      ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.32, 0, 7); ctx.fill();
    }

    // 遺伝模様
    const prand = lcg(lz.id * 7919 + 17);
    ctx.fillStyle = darker; ctx.strokeStyle = darker;
    if (lz.pattern === "bands") {
      // 体を縦に横切るバンド(オオトカゲの縞)
      for (let t = 0.06; t <= 0.78; t += 0.075) {
        const s0 = S(t);
        const w = s0.w + 2;
        ctx.lineWidth = L * (0.028 + prand() * 0.018);
        ctx.beginPath();
        ctx.moveTo(s0.p.x + s0.n.x * w, s0.p.y + s0.n.y * w);
        ctx.lineTo(s0.p.x - s0.n.x * w, s0.p.y - s0.n.y * w);
        ctx.stroke();
      }
    } else if (lz.pattern === "spots") {
      for (let i = 0; i < 18; i++) {
        const onHead = prand() < 0.3;
        const t = onHead ? 0.82 + prand() * 0.15 : 0.06 + prand() * 0.72;
        const lat = (prand() * 2 - 1) * 0.72;
        const s0 = S(t);
        const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
        const r = L * (onHead ? 0.01 + prand() * 0.01 : 0.018 + prand() * 0.02);
        ctx.beginPath();
        ctx.ellipse(x, y, r * (0.8 + prand() * 0.5), r, prand() * 3, 0, 7);
        ctx.fill();
      }
    } else if (lz.pattern === "stripe") {
      // 体側に走る2本のストライプ
      for (const k of [0.15, -0.3]) {
        ctx.lineWidth = L * (k > 0 ? 0.024 : 0.016);
        ctx.beginPath();
        for (let i = 2; i <= N - 2; i++) {
          const m = i === 2 ? "moveTo" : "lineTo";
          ctx[m](pts[i].x + nrm[i].x * wid[i] * k * up[i], pts[i].y + nrm[i].y * wid[i] * k * up[i]);
        }
        ctx.stroke();
      }
    } else {
      // 無地でも鱗の質感を少し
      for (let i = 0; i < 8; i++) {
        const t = 0.3 + prand() * 0.55;
        const lat = (prand() * 2 - 1) * 0.5;
        const s0 = S(t);
        ctx.globalAlpha = baseAlpha * 0.35;
        ctx.beginPath(); ctx.arc(s0.p.x + s0.n.x * s0.w * lat, s0.p.y + s0.n.y * s0.w * lat, L * 0.011, 0, 7); ctx.fill();
        ctx.globalAlpha = baseAlpha;
      }
    }
    ctx.restore();

    // --- 喉のたるんだ皮(デューラップ) ---
    const d1 = S(0.9), d2 = S(0.79);
    const v1 = { x: d1.p.x - d1.n.x * d1.w * d1.u * 0.85, y: d1.p.y - d1.n.y * d1.w * d1.u * 0.85 };
    const v2 = { x: d2.p.x - d2.n.x * d2.w * d2.u * 0.85, y: d2.p.y - d2.n.y * d2.w * d2.u * 0.85 };
    const sag = L * (sp.id === "komodo" || sp.id === "futoago" ? 0.085 : 0.055);
    ctx.fillStyle = col.css;
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag, v2.x, v2.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = Math.max(1.4, L * 0.016);
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag, v2.x, v2.y);
    ctx.stroke();
    // 喉のしわ
    ctx.strokeStyle = darker; ctx.lineWidth = 1;
    for (const k of [0.55, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y + 2);
      ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag * k, v2.x, v2.y + 2);
      ctx.stroke();
    }
    // フトアゴのあごヒゲ棘
    if (sp.id === "futoago") {
      ctx.fillStyle = darker;
      for (let k = 0.1; k <= 0.9; k += 0.16) {
        const bx = v1.x + (v2.x - v1.x) * k;
        const by = Math.max(v1.y, v2.y) + sag * (1 - Math.abs(k - 0.5) * 1.6) * 0.9;
        ctx.beginPath();
        ctx.moveTo(bx - L * 0.008, by - L * 0.01);
        ctx.lineTo(bx, by + L * 0.028);
        ctx.lineTo(bx + L * 0.008, by - L * 0.01);
        ctx.closePath(); ctx.fill();
      }
    }

    // --- 輪郭線 ---
    ctx.strokeStyle = outline; ctx.lineWidth = Math.max(1.6, L * 0.018);
    ctx.stroke(body);

    // --- 背中のクレスト(背側の縁に沿った鋸歯) ---
    const srand = lcg(lz.id * 53 + 9);
    const crestAmp = (sp.id === "futoago" || sp.id === "komodo") ? 0.03 : 0.021;
    ctx.fillStyle = darker;
    for (let t = 0.05; t <= 0.9; t += 0.032) {
      const s0 = S(t);
      const w = s0.w * jagA[s0.i];
      const bx = s0.p.x + s0.n.x * w * s0.u, by = s0.p.y + s0.n.y * w * s0.u;
      const a = pts[Math.min(N, s0.i + 1)], b = pts[Math.max(0, s0.i - 1)];
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      const spk = L * crestAmp * (0.5 + srand() * 0.7) * (t < 0.45 ? 0.75 : 1);
      ctx.beginPath();
      ctx.moveTo(bx - (dx / d) * L * 0.012, by - (dy / d) * L * 0.012);
      ctx.lineTo(bx + s0.n.x * spk * s0.u - (dx / d) * L * 0.002, by + s0.n.y * spk * s0.u - (dy / d) * L * 0.002);
      ctx.lineTo(bx + (dx / d) * L * 0.012, by + (dy / d) * L * 0.012);
      ctx.closePath(); ctx.fill();
    }

    // --- 手前側の脚(体の上に重ねる) ---
    legPair(false);

    // --- 頭部ディテール ---
    const he = S(0.93);
    const ex = he.p.x + he.n.x * he.w * 0.15 * he.u, ey = he.p.y + he.n.y * he.w * 0.15 * he.u;
    const eyeR = Math.max(1.8, L * 0.022);
    // 眉の隆起
    ctx.strokeStyle = darkest; ctx.lineWidth = Math.max(1.4, L * 0.014);
    ctx.beginPath(); ctx.moveTo(ex - eyeR * 2, ey - eyeR * 1.3); ctx.lineTo(ex + eyeR * 1.6, ey - eyeR * 1.5); ctx.stroke();
    // 目(横向きなので1つ)
    ctx.fillStyle = lz.morphId === "albino" ? "#8f3030" : "#17100a";
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath(); ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.35, eyeR * 0.3, 0, 7); ctx.fill();
    // 耳の穴(あごの後ろ)
    const ea = S(0.875);
    ctx.fillStyle = "rgba(18,10,4,.5)";
    ctx.beginPath(); ctx.ellipse(ea.p.x - L * 0.012, ea.p.y + ea.w * 0.25, L * 0.007, L * 0.014, 0.2, 0, 7); ctx.fill();
    // 口のライン(鼻先から後ろへ)
    const m1 = S(0.995), m2 = S(0.885);
    const mv1 = { x: m1.p.x - m1.n.x * m1.w * m1.u * 0.5, y: m1.p.y - m1.n.y * m1.w * m1.u * 0.5 };
    const mv2 = { x: m2.p.x - m2.n.x * m2.w * m2.u * 0.8, y: m2.p.y - m2.n.y * m2.w * m2.u * 0.8 };
    ctx.strokeStyle = "rgba(18,10,4,.55)"; ctx.lineWidth = Math.max(1.1, L * 0.011);
    ctx.beginPath();
    ctx.moveTo(mv1.x, mv1.y);
    ctx.quadraticCurveTo((mv1.x + mv2.x) / 2, Math.max(mv1.y, mv2.y) + L * 0.012, mv2.x, mv2.y);
    ctx.stroke();
    // 鼻孔
    const no = S(0.985);
    ctx.fillStyle = "rgba(18,10,4,.6)";
    ctx.beginPath(); ctx.arc(no.p.x, no.p.y - no.w * 0.2, Math.max(0.9, L * 0.008), 0, 7); ctx.fill();
    // アオジタの青い舌
    if (sp.id === "aojita" && (this.time * 0.7 + lz.id) % 2.4 < 0.45) {
      ctx.strokeStyle = "#4a7fd9"; ctx.lineWidth = Math.max(2, L * 0.02);
      ctx.beginPath();
      ctx.moveTo(mv1.x, mv1.y);
      ctx.lineTo(mv1.x + L * 0.1, mv1.y + L * 0.02 + Math.sin(this.time * 20) * 2);
      ctx.stroke();
    }

    ctx.restore();

    // --- 状態表示(反転なし) ---
    ctx.save();
    ctx.translate(lz.x, lz.y);
    if (Game.selectedId === lz.id) {
      ctx.strokeStyle = "#ffd24c"; ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -this.time * 24;
      ctx.beginPath(); ctx.ellipse(-L * 0.06, 0, L * 0.55, L * 0.12, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.textAlign = "center";
    if (lz.founder) { // 創始者マーク (V3 §9.4)
      ctx.font = "13px sans-serif";
      this.glyphCrown(ctx, L * 0.3, -L * 0.42 - 6, 11);
    }
    if (lz.poisonT > 0) { // サソリの毒: 紫の明滅
      ctx.fillStyle = `rgba(180,90,220,${0.4 + Math.sin(this.time * 10) * 0.25})`;
      ctx.beginPath(); ctx.ellipse(0, -L * 0.15, L * 0.4, L * 0.28, 0, 0, 7); ctx.fill();
      ctx.font = "13px sans-serif";
      this.glyphSkull(ctx, 0, -L * 0.52 - 6, 9);
    }
    if (injured) {
      ctx.font = "16px sans-serif";
      this.glyphCross(ctx, 0, -L * 0.52 - 6, 8);
    } else if (lz.stage === "baby") {
      ctx.fillStyle = "rgba(0,0,0,.45)";
      rr(ctx, -19, -L * 0.52 - 13, 38, 15, 7); ctx.fill();
      ctx.fillStyle = "#ffe9b0"; ctx.font = "bold 10px sans-serif";
      ctx.fillText("BABY", 0, -L * 0.52 - 2);
    }
    ctx.restore();
  },

  // ---------------- ボス共通ディスパッチ (GameExpansion_v2 ①②) ----------------
  // ボス級の拡大率(Brushup V2 §3.2)。描画のみ・座標や当たり判定は不変
  bossScale(raid) {
    const big = raid.tier || raid.boss || raid.elite;
    let k = big ? CFG.bossScaleBoss + (raid.tier || 0) * CFG.bossScaleTier : CFG.bossScaleSnake;
    if (!raid.snake.arrived && !raid.type.flying) k *= CFG.bossApproach; // 迫り=より大きな影
    if (raid.snake.arrived) {
      k *= 1 + Math.sin(this.time * 2.1) * CFG.bossBreath;              // 呼吸
      const lunge = Math.max(0, Math.sin(this.time * 0.9));             // 時折の威嚇(鎌首)
      k *= 1 + Math.pow(lunge, 14) * 0.09;
    }
    return k;
  },

  // 撃破の死に様(§3.3): のけぞり→崩壊→消滅。座標・ロジックには関与しない
  drawCorpse(ctx, c) {
    const e = c.snake;
    const T = 1.15, p = clamp(1 - c.dyingT / T, 0, 1);
    const big = c.tier || c.boss || c.elite;
    const k = big ? CFG.bossScaleBoss + (c.tier || 0) * CFG.bossScaleTier : CFG.bossScaleSnake;
    const rear = Math.sin(Math.min(p / 0.28, 1) * Math.PI) * -0.38;      // のけぞり
    const collapse = clamp((p - 0.3) / 0.5, 0, 1);                       // 崩壊
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(rear + collapse * 0.22);
    ctx.scale(k * (1 + collapse * 0.08), k * (1 - collapse * 0.85));
    ctx.globalAlpha = 1 - clamp((p - 0.55) / 0.45, 0, 1);
    ctx.filter = `saturate(${(1 - collapse * 0.7).toFixed(2)}) brightness(${(1 - collapse * 0.4).toFixed(2)})`;
    ctx.translate(-e.x, -e.y);
    switch (c.typeId) {
      case "hawk": this.drawHawk(ctx, c); break;
      case "crow": this.drawCrow(ctx, c); break;
      case "monitor": this.drawMonitor(ctx, c); break;
      case "scorpion": this.drawScorpion(ctx, c); break;
      case "spider": this.drawSpider(ctx, c); break;
      case "bugger": this.drawBugger(ctx, c); break;
      default: this.drawSnake(ctx, c);
    }
    ctx.restore();
    // 崩壊の土煙(簡素な粒・描画のみ)
    if (collapse > 0 && collapse < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - collapse) * 0.5;
      ctx.fillStyle = "rgba(216, 195, 165, .5)";
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + p * 3;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * (30 + collapse * 70), e.y + 20 - Math.sin(a) * 10 * collapse, 5 + collapse * 6, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  drawBoss(ctx, raid) {
    const e = raid.snake;
    const k = this.bossScale(raid);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(k, k);
    ctx.translate(-e.x, -e.y);
    // 迫り(未到着): 大きな影/シルエットとして進入(§3.1)
    if (!e.arrived && !raid.type.flying) {
      ctx.filter = "brightness(0.32) saturate(0.5)";
      ctx.globalAlpha = 0.9;
    } else if (raid.hitT > 0) {
      ctx.filter = "brightness(2) saturate(1.4)"; // 被弾フラッシュ(§3.3)
    } else if (raid.enraged) {
      // Enrage: ボス本体が赤く明滅(既存判定に同期・§3.3)
      const p = 0.5 + Math.sin(this.time * 12) * 0.5;
      ctx.filter = `brightness(${(1.05 + p * 0.35).toFixed(2)}) saturate(${(1.2 + p * 0.5).toFixed(2)}) hue-rotate(-${Math.round(p * 14)}deg)`;
    }
    // ティアオーラ (T3+)
    if (raid.tierDef && raid.tierDef.aura) {
      const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 130);
      g.addColorStop(0, hexA(raid.tierDef.aura, 0.28 + Math.sin(this.time * 5) * 0.08));
      g.addColorStop(1, hexA(raid.tierDef.aura, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, 130, 0, 7); ctx.fill();
    }
    switch (raid.typeId) {
      case "hawk": this.drawHawk(ctx, raid); break;
      case "crow": this.drawCrow(ctx, raid); break;
      case "monitor": this.drawMonitor(ctx, raid); break;
      case "scorpion": this.drawScorpion(ctx, raid); break;
      case "spider": this.drawSpider(ctx, raid); break;
      case "bugger": this.drawBugger(ctx, raid); break;
      default: this.drawSnake(ctx, raid);
    }
    // Elite金縁
    if (raid.elite) {
      ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]); ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath(); ctx.ellipse(e.x + (raid.typeId === "snake" ? 90 : 0), e.y, 120, 60, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      this.pill(ctx, e.x - 30, e.y - 105, "ELITE", "rgba(120,90,10,.75)", "#ffe9a0");
    }
    // Enrage: 赤い明滅
    if (raid.enraged) {
      ctx.strokeStyle = `rgba(255,60,40,${0.5 + Math.sin(this.time * 12) * 0.4})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(e.x + (raid.typeId === "snake" ? 90 : 0), e.y, 105, 52, 0, 0, 7); ctx.stroke();
    }
    ctx.restore(); // 変換ここまで
    // HPバー・残り時間はDOMのボスHUD(§3.3)へ移設。Canvasには描かない
  },



  // 登場カットイン (T2+)
  drawCutin(ctx, raid) {
    const a = clamp(raid.cutinT / 1.2, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`;
    ctx.fillRect(0, 0, W, H);
    const slide = (1 - a) * 60;
    ctx.fillStyle = `rgba(120,20,10,${0.85 * a})`;
    ctx.fillRect(0, H / 2 - 52, W, 104);
    ctx.fillStyle = `rgba(255,235,210,${a})`;
    ctx.font = "bold 42px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${raid.elite ? "ELITE " : ""}${raid.type.name}`, W / 2 + slide, H / 2 + 2);
    ctx.font = "bold 17px sans-serif";
    ctx.fillStyle = `rgba(255,180,150,${a})`;
    ctx.fillText(`BOSS TIER ${raid.tier} — ${raid.type.threat}`, W / 2 + slide, H / 2 + 34);
  },

  // ---------------- 新ボス (GameExpansion_v2 ②) ----------------
  // B-1 オオタカ
  drawHawk(ctx, raid) {
    const e = raid.snake;
    // 急降下予告: ターゲットに影+赤リング
    if (raid.dive) {
      const tgt = Game.state.lizards.find((l) => l.id === raid.dive.targetId);
      if (tgt) {
        const pu = 0.7 + Math.sin(this.time * 14) * 0.3;
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath(); ctx.ellipse(tgt.x, tgt.y + 6, 46, 15, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,60,40,${pu})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(tgt.x, tgt.y + 4, 62, 24, 0, 0, 7); ctx.stroke();
        this.pill(ctx, tgt.x - 58, tgt.y - 58, "タップ連打で追い払え!", "rgba(120,20,10,.8)", "#ffd0c0");
      }
    }
    this.drawBird(ctx, e.x, e.y, 1.7, "#8a6432", "#6d4d24", "#e8c46a", false);
  },

  // B-2 オオガラス
  drawCrow(ctx, raid) {
    const e = raid.snake;
    this.drawBird(ctx, e.x, e.y, 1.35, "#2b2d36", "#1c1e26", "#4a4d5a", raid.fleeing);
    if (raid.stolenEgg) { // くわえた卵
      ctx.fillStyle = "#f6efdd";
      ctx.beginPath(); ctx.ellipse(e.x - 34 * 1.35, e.y + 6, 9, 12, 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(120,100,70,.6)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(e.x - 34 * 1.35, e.y + 6, 9, 12, 0.2, 0, 7); ctx.stroke();
    }
  },

  // 鳥の共通描画(左向き)
  drawBird(ctx, x, y, s, body, wing, beak, fleeRight) {
    ctx.save();
    ctx.translate(x, y);
    if (fleeRight) ctx.scale(-1, 1);
    const flap = Math.sin(this.time * 9) * 0.55;
    // 地面の影
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(0, (SNAKE_HOME.y + 160 - y) * 0.9, 34 * s, 8 * s, 0, 0, 7); ctx.fill();
    ctx.lineJoin = "round";
    // 両翼(羽ばたき)
    for (const side of [-1, 1]) {
      ctx.fillStyle = wing;
      ctx.strokeStyle = "rgba(10,8,4,.5)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2 * s, 0);
      ctx.quadraticCurveTo(14 * s * side + 8 * s, -18 * s - flap * 16 * s * side, 44 * s * side + 6 * s, -26 * s * side * flap - 14 * s);
      // 羽の切れ込み
      ctx.lineTo(38 * s * side + 6 * s, -8 * s * side * flap - 6 * s);
      ctx.lineTo(30 * s * side + 6 * s, -10 * s * side * flap - 2 * s);
      ctx.lineTo(20 * s * side + 6 * s, -4 * s * side * flap + 2 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 尾羽
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(16 * s, 0);
    ctx.lineTo(34 * s, -6 * s); ctx.lineTo(36 * s, 6 * s);
    ctx.closePath(); ctx.fill();
    // 胴体
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(10,8,4,.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 20 * s, 11 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    // 頭+くちばし
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(-18 * s, -4 * s, 8.5 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = beak;
    ctx.beginPath();
    ctx.moveTo(-25 * s, -6 * s); ctx.lineTo(-34 * s, -2 * s); ctx.lineTo(-25 * s, -1 * s);
    ctx.closePath(); ctx.fill();
    // 目
    ctx.fillStyle = "#ffcc44";
    ctx.beginPath(); ctx.arc(-20 * s, -6 * s, 2.4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(-20.5 * s, -6 * s, 1.2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // B-3 ヌシオオトカゲ(トカゲ描画を巨大化して再利用)
  drawMonitor(ctx, raid) {
    const e = raid.snake;
    if (!raid._fake) {
      raid._fake = {
        id: 999983, speciesId: "komodo", morphId: "melanistic",
        hue: 0, sat: 20, light: 26, pattern: "bands", stage: "adult", level: 50,
        xp: 0, injuredT: 0, breedCd: 0, hiddenT: 0, poisonT: 0,
        x: 0, y: 0, tx: 0, ty: 0, angle: Math.PI * 0.999, wanderT: 0, moving: false,
      };
    }
    const f = raid._fake;
    f.x = e.x; f.y = e.y;
    f.moving = !e.arrived;
    ctx.save();
    ctx.translate(e.x, e.y); ctx.scale(1.9, 1.9); ctx.translate(-e.x, -e.y);
    this.drawLizard(ctx, f);
    ctx.restore();
    // 威嚇の圧(生産低下中の表示)
    if (e.arrived) {
      this.pill(ctx, e.x - 96, e.y - 150, "威嚇中: 生産低下・繁殖不可!", "rgba(90,30,10,.75)", "#ffd0b0");
    }
  },

  // B-4 オオサソリ
  drawScorpion(ctx, raid) {
    const e = raid.snake;
    const s = 1.5;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // 影
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(10 * s, 14 * s, 55 * s, 12 * s, 0, 0, 7); ctx.fill();
    const body = "#6d3226", dark = "#48201a";
    // 脚8本
    ctx.strokeStyle = dark; ctx.lineWidth = 3 * s;
    for (let i = 0; i < 4; i++) {
      const bx = -8 * s + i * 12 * s;
      const step = Math.sin(this.time * 8 + i) * 3 * s;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(bx, side * 6 * s);
        ctx.lineTo(bx + step, side * 16 * s);
        ctx.lineTo(bx + step + 4 * s, side * 22 * s);
        ctx.stroke();
      }
    }
    // 胴体(3節)
    ctx.fillStyle = body; ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 26 * s, 13 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(20 * s, 0, 15 * s, 10 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-6 * s, -4 * s, 18 * s, 5 * s, 0, 0, 7); ctx.fill();
    // ハサミ(左前方に2本)
    for (const side of [1, -1]) {
      ctx.strokeStyle = body; ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(-20 * s, side * 5 * s);
      ctx.lineTo(-34 * s, side * 13 * s);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(-42 * s, side * 15 * s, 10 * s, 6.5 * s, side * 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-48 * s, side * 12 * s); ctx.lineTo(-36 * s, side * 15 * s); ctx.stroke();
    }
    // 尾(上に巻く5節+毒針)
    const curl = Math.sin(this.time * 3) * 0.1;
    let tx = 32 * s, ty = -4 * s;
    ctx.fillStyle = body;
    for (let i = 0; i < 5; i++) {
      const a = -0.5 - i * (0.42 + curl);
      tx += Math.cos(a) * 11 * s;
      ty += Math.sin(a) * 11 * s;
      ctx.beginPath(); ctx.arc(tx, ty, (7 - i * 0.8) * s, 0, 7); ctx.fill();
    }
    // 毒針
    ctx.fillStyle = "#e0b13a";
    ctx.beginPath();
    ctx.moveTo(tx - 3 * s, ty - 3 * s);
    ctx.lineTo(tx - 12 * s, ty - 10 * s);
    ctx.lineTo(tx + 2 * s, ty - 6 * s);
    ctx.closePath(); ctx.fill();
    // 目
    ctx.fillStyle = "#ffcc44";
    ctx.beginPath(); ctx.arc(-22 * s, -3 * s, 2 * s, 0, 7); ctx.arc(-22 * s, 3 * s, 2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // B-5 オオグモ+ウェブ
  drawSpider(ctx, raid) {
    const e = raid.snake;
    // ウェブ
    for (const w of raid.webs) {
      if (w.hp <= 0) continue;
      const a = 0.28 + (w.hp / CFG.webHp) * 0.3;
      ctx.strokeStyle = `rgba(240,240,250,${a})`;
      ctx.lineWidth = 1.5;
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath(); ctx.ellipse(w.x, w.y, ring * 18, ring * 11, 0, 0, 7); ctx.stroke();
      }
      for (let k = 0; k < 8; k++) {
        const ang = k / 8 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + Math.cos(ang) * 54, w.y + Math.sin(ang) * 33);
        ctx.stroke();
      }
      if (w.burnT > 0) this.pill(ctx, w.x - 22, w.y + 36, "焼却 " + Math.ceil(w.burnT) + "s");
      else this.pill(ctx, w.x - 30, w.y + 36, "タップ ×" + w.hp);
    }
    const s = 1.5;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(6 * s, 16 * s, 46 * s, 11 * s, 0, 0, 7); ctx.fill();
    const body = "#3a2c38", dark = "#241a24";
    // 脚8本(2関節)
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
    for (let i = 0; i < 4; i++) {
      const ang0 = -0.9 + i * 0.55;
      const step = Math.sin(this.time * 7 + i * 1.3) * 0.12;
      for (const side of [1, -1]) {
        const a1 = side * (ang0 + step);
        const kx = -6 * s + Math.cos(a1) * 26 * s * (side > 0 ? 1 : 1);
        const ky = Math.sin(a1) * 26 * s;
        ctx.beginPath();
        ctx.moveTo(-6 * s, 0);
        ctx.lineTo(kx - 6 * s, ky - side * 8 * s);
        ctx.lineTo(kx - 2 * s, ky + side * 14 * s);
        ctx.stroke();
      }
    }
    // 腹部(大)+頭胸部
    ctx.fillStyle = body; ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(14 * s, 0, 24 * s, 17 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-14 * s, 0, 12 * s, 9 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    // 腹の模様
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(6 * s, -8 * s); ctx.lineTo(22 * s, 0); ctx.lineTo(6 * s, 8 * s); ctx.lineTo(12 * s, 0);
    ctx.closePath(); ctx.fill();
    // 目(4つ赤く光る)+牙
    ctx.fillStyle = "#ff4438";
    for (const [ox, oy] of [[-22, -3], [-24, 1], [-20, -6], [-19, 2]]) {
      ctx.beginPath(); ctx.arc(ox * s, oy * s, 1.6 * s, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "#c8c0b0"; ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-25 * s, 4 * s); ctx.lineTo(-28 * s, 9 * s);
    ctx.moveTo(-21 * s, 6 * s); ctx.lineTo(-23 * s, 11 * s);
    ctx.stroke();
    ctx.restore();
  },

  // V4 §3.5.3: バガー(惑星を侵食する実験生命体・甲虫型)
  drawBugger(ctx, raid) {
    const e = raid.snake;
    const s = 1.6;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // 影
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(4 * s, 16 * s, 42 * s, 10 * s, 0, 0, 7); ctx.fill();
    const shell = "#3a4a2c", shellHi = "#55663a", dark = "#222c18";
    // 脚6本(カサカサ動く)
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
    for (let i = 0; i < 3; i++) {
      const bx = -10 * s + i * 14 * s;
      const step = Math.sin(this.time * 12 + i * 2) * 4 * s;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(bx, side * 8 * s);
        ctx.lineTo(bx + step, side * 17 * s);
        ctx.lineTo(bx + step + 5 * s, side * 22 * s);
        ctx.stroke();
      }
    }
    // 腹部+前胸
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 0, 30 * s, 16 * s, 0, 0, 7); ctx.fill();
    // 鞘翅(ドーム・真ん中に割れ目)
    ctx.fillStyle = shell; ctx.strokeStyle = "rgba(10,14,6,.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(4 * s, 0, 26 * s, 14 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shellHi;
    ctx.beginPath(); ctx.ellipse(0, -4 * s, 18 * s, 6 * s, -0.15, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(-20 * s, 0); ctx.lineTo(30 * s, 0); ctx.stroke();
    // 病斑(侵食の証・不気味な紫の点)
    ctx.fillStyle = `rgba(180,90,220,${0.5 + Math.sin(this.time * 5) * 0.25})`;
    for (const [ox, oy] of [[-8, -6], [6, 5], [14, -4], [-2, 8]]) {
      ctx.beginPath(); ctx.arc(ox * s, oy * s, 2.4 * s, 0, 7); ctx.fill();
    }
    // 頭+大顎
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(-27 * s, 0, 8 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 3 * s;
    const jaw = Math.sin(this.time * 8) * 0.2;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(-33 * s, side * 3 * s);
      ctx.quadraticCurveTo(-42 * s, side * (8 + jaw * 10) * s, -45 * s, side * 3 * s);
      ctx.stroke();
    }
    // 触角
    ctx.lineWidth = 1.8 * s;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(-30 * s, side * 5 * s);
      ctx.quadraticCurveTo(-40 * s, side * 14 * s, -36 * s, side * 20 * s);
      ctx.stroke();
    }
    // 目(赤)
    ctx.fillStyle = "#ff4438";
    ctx.beginPath(); ctx.arc(-30 * s, -4 * s, 2.2 * s, 0, 7); ctx.arc(-30 * s, 4 * s, 2.2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // ---------------- 味方 (GameExpansion_v2 ⑩) ----------------
  drawAllies(ctx) {
    const s = Game.state;
    const lv = (id) => Game.allyLv(id);
    if (lv("eagle")) { // 上空を旋回
      const x = W / 2 + Math.cos(this.time * 0.45) * 430;
      const y = 58 + Math.sin(this.time * 0.9) * 16;
      this.drawBird(ctx, x, y, 0.9, "#5d4a2c", "#463620", "#e8c46a", Math.cos(this.time * 0.45) > 0);
      this.pill(ctx, x - 26, y + 22, "ワシ Lv" + lv("eagle"));
    }
    if (lv("owl")) { // 保温ライトのポールに止まる
      const x = FAC_POS.light.x, y = FAC_POS.light.y - 62;
      ctx.fillStyle = "#6d5a40";
      ctx.beginPath(); ctx.ellipse(x, y, 11, 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#8a7355";
      ctx.beginPath(); ctx.ellipse(x, y + 4, 7, 8, 0, 0, 7); ctx.fill();
      // 耳羽と大きな目
      ctx.fillStyle = "#6d5a40";
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 10); ctx.lineTo(x - 4, y - 17); ctx.lineTo(x - 1, y - 10);
      ctx.moveTo(x + 8, y - 10); ctx.lineTo(x + 4, y - 17); ctx.lineTo(x + 1, y - 10);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#ffcc44";
        ctx.beginPath(); ctx.arc(x + side * 4, y - 6, 3.2, 0, 7); ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(x + side * 4, y - 6, 1.5, 0, 7); ctx.fill();
      }
      this.pill(ctx, x - 34, y - 36, "フクロウ Lv" + lv("owl"));
    }
    if (lv("meerkat")) { // 二本足で見張り
      const x = 985, y = 285;
      const sway = Math.sin(this.time * 2) * 2;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x, y + 20, 12, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#b39468";
      rr(ctx, x - 6, y - 18, 12, 36, 6); ctx.fill();
      ctx.fillStyle = "#8a6f4a";
      ctx.beginPath(); ctx.arc(x + sway * 0.4, y - 22, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.arc(x - 2 + sway * 0.4, y - 23, 1.4, 0, 7); ctx.arc(x + 3 + sway * 0.4, y - 23, 1.4, 0, 7); ctx.fill();
      ctx.strokeStyle = "#8a6f4a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 5, y + 8); ctx.quadraticCurveTo(x + 14, y + 12, x + 15, y + 20); ctx.stroke();
      this.pill(ctx, x - 44, y + 26, "ミーアキャット Lv" + lv("meerkat"));
    }
    if (lv("turtle")) { // 中央寄りにどっしり
      const x = 700, y = 585;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x, y + 8, 26, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4a6236";
      ctx.beginPath(); ctx.ellipse(x, y - 6, 24, 15, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = "#33461f"; ctx.lineWidth = 1.6;
      for (const [ox, oy, r2] of [[-8, -8, 6], [6, -10, 6], [0, -3, 6]]) {
        ctx.beginPath(); ctx.arc(x + ox, y + oy, r2, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = "#7d9456";
      ctx.beginPath(); ctx.ellipse(x - 27, y - 2, 8, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.arc(x - 30, y - 4, 1.4, 0, 7); ctx.fill();
      this.pill(ctx, x - 26, y + 14, "カメ Lv" + lv("turtle"));
    }
    if (lv("gecko")) { // 加温パネルの近く
      const x = FAC_POS.heat.x - 90, y = FAC_POS.heat.y + 40;
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#c9a03c";
      ctx.beginPath(); ctx.ellipse(x, y, 13, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 14, y - 1, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#c9a03c"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.quadraticCurveTo(x + 22, y + Math.sin(this.time * 6) * 3, x + 27, y - 3); ctx.stroke();
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.arc(x - 15, y - 2.5, 1.3, 0, 7); ctx.fill();
      this.pill(ctx, x - 30, y + 10, "ヤモリ Lv" + lv("gecko"));
    }
    if (lv("ferret")) { // うろうろする回収屋
      const x = 330 + Math.sin(this.time * 0.7) * 120;
      const y = 560 + Math.cos(this.time * 1.1) * 30;
      const dir = Math.cos(this.time * 0.7) > 0 ? 1 : -1;
      ctx.save();
      ctx.translate(x, y); ctx.scale(dir, 1);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.beginPath(); ctx.ellipse(0, 7, 20, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#8a7358";
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-17, -2, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#6d5a44"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(15, -1); ctx.quadraticCurveTo(24, -6 + Math.sin(this.time * 8) * 2, 30, -2); ctx.stroke();
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.arc(-19, -3.5, 1.3, 0, 7); ctx.fill();
      // 泥棒マスク模様
      ctx.fillStyle = "#4a3a2c";
      ctx.beginPath(); ctx.ellipse(-17, -3, 4.5, 2, 0, 0, 7); ctx.fill();
      ctx.restore();
      this.pill(ctx, x - 36, y + 12, "フェレット Lv" + lv("ferret"));
    }
  },

  // ---------------- 蛇(コロニーランクに同期した階級・背骨ベース描画) ----------------
  drawSnake(ctx, raid) {
    const s = raid.snake;
    const tier = raid.snakeTier || snakeTierFor(Game.state.rank);
    const boss = raid.boss;
    const scale = tier.scale * (boss ? 1.35 : 1);
    const lig = boss ? Math.max(12, tier.light - 8) : tier.light;
    const bodyCol = `hsl(${tier.hue},${tier.sat}%,${lig}%)`;
    const darker = `hsl(${tier.hue},${Math.min(100, tier.sat + 10)}%,${Math.max(6, lig - 15)}%)`;
    const belly = `hsl(${tier.hue},${Math.max(0, tier.sat - 22)}%,${Math.min(88, lig + 20)}%)`;
    const outline = "rgba(15,8,4,.6)";

    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2.5, 2.5), rnd(-2.5, 2.5)); raid.shake = Math.max(0, raid.shake - 0.2); }

    // --- 背骨(頭の後ろから尾先まで) ---
    const segs = 22;
    const segLen = 15 * scale;
    const pts = [], nrm = [], wid = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wave = Math.sin(this.time * 5 + i * 0.62 + s.phase) * 16 * scale * Math.min(1, i / 3);
      pts.push({ x: s.x + 16 * scale + i * segLen, y: s.y + wave });
      const w = (t < 0.15 ? 9 + (t / 0.15) * 5 : t < 0.55 ? 14 : 14 - ((t - 0.55) / 0.45) * 12.5) * scale;
      wid.push(Math.max(1.5, w));
    }
    for (let i = 0; i <= segs; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      nrm.push({ x: -dy / d, y: dx / d });
    }

    // 影
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(s.x + segs * segLen * 0.45, s.y + 24 * scale, segs * segLen * 0.52, 9 * scale, 0, 0, 7);
    ctx.fill();

    // --- 胴体 ---
    const body = new Path2D();
    body.moveTo(pts[0].x, pts[0].y - wid[0]);
    for (let i = 0; i <= segs; i++) body.lineTo(pts[i].x + nrm[i].x * wid[i], pts[i].y + nrm[i].y * wid[i]);
    for (let i = segs; i >= 0; i--) body.lineTo(pts[i].x - nrm[i].x * wid[i], pts[i].y - nrm[i].y * wid[i]);
    body.closePath();
    ctx.fillStyle = bodyCol;
    ctx.fill(body);

    ctx.save();
    ctx.clip(body);
    // 背を暗く・腹を明るく
    ctx.strokeStyle = darker; ctx.globalAlpha = 0.5; ctx.lineWidth = 9 * scale;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) { const m = i ? "lineTo" : "moveTo"; ctx[m](pts[i].x, pts[i].y - wid[i] * 0.55); }
    ctx.stroke();
    ctx.strokeStyle = belly; ctx.globalAlpha = 0.55; ctx.lineWidth = 8 * scale;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) { const m = i ? "lineTo" : "moveTo"; ctx[m](pts[i].x, pts[i].y + wid[i] * 0.55); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 菱形の鱗模様
    ctx.fillStyle = darker;
    for (let i = 1; i < segs; i += 2) {
      const p = pts[i], w = wid[i];
      ctx.beginPath();
      ctx.moveTo(p.x - segLen * 0.55, p.y);
      ctx.lineTo(p.x, p.y - w * 0.72);
      ctx.lineTo(p.x + segLen * 0.55, p.y);
      ctx.lineTo(p.x, p.y + w * 0.72);
      ctx.closePath(); ctx.fill();
    }
    // 鱗の粒感
    const srand = lcg(99);
    for (let i = 0; i < 40; i++) {
      const p = pts[Math.floor(srand() * segs)];
      ctx.fillStyle = srand() < 0.5 ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.12)";
      ctx.beginPath();
      ctx.arc(p.x + (srand() * 2 - 1) * segLen, p.y + (srand() * 2 - 1) * wid[5] * 0.7, 1 + srand() * 2 * scale, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = outline; ctx.lineWidth = 2;
    ctx.stroke(body);

    // --- 頭(くさび形・毒蛇の顎) ---
    const hx = s.x, hy = s.y;
    ctx.fillStyle = bodyCol; ctx.strokeStyle = outline; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(hx - 26 * scale, hy + 1 * scale);            // 鼻先
    ctx.quadraticCurveTo(hx - 20 * scale, hy - 12 * scale, hx - 2 * scale, hy - 13 * scale); // 上顎ライン
    ctx.quadraticCurveTo(hx + 18 * scale, hy - 12 * scale, hx + 20 * scale, hy);             // 後頭部(えらの張り)
    ctx.quadraticCurveTo(hx + 16 * scale, hy + 13 * scale, hx - 4 * scale, hy + 12 * scale); // 顎の下
    ctx.quadraticCurveTo(hx - 22 * scale, hy + 9 * scale, hx - 26 * scale, hy + 1 * scale);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 頭頂の暗い模様
    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.moveTo(hx - 14 * scale, hy - 8 * scale);
    ctx.quadraticCurveTo(hx, hy - 13 * scale, hx + 14 * scale, hy - 7 * scale);
    ctx.quadraticCurveTo(hx + 2 * scale, hy - 3 * scale, hx - 14 * scale, hy - 8 * scale);
    ctx.fill();
    // 口のライン
    ctx.strokeStyle = "rgba(15,8,4,.55)"; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - 25 * scale, hy + 3 * scale);
    ctx.quadraticCurveTo(hx - 6 * scale, hy + 8 * scale, hx + 12 * scale, hy + 6 * scale);
    ctx.stroke();
    // 目(スリット瞳・ボスは赤)
    ctx.fillStyle = boss ? "#ff5540" : "#ffcc44";
    ctx.beginPath(); ctx.arc(hx - 9 * scale, hy - 5 * scale, 4.2 * scale, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx - 9 * scale, hy - 5 * scale, 4.2 * scale, 0, 7); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(hx - 9 * scale, hy - 5 * scale, 1.2 * scale, 3.6 * scale, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.beginPath(); ctx.arc(hx - 10 * scale, hy - 7 * scale, 1 * scale, 0, 7); ctx.fill();
    // 鼻孔
    ctx.fillStyle = "rgba(15,8,4,.6)";
    ctx.beginPath(); ctx.arc(hx - 21 * scale, hy - 2 * scale, 1.1 * scale, 0, 7); ctx.fill();
    // 舌(チロチロ)
    if (Math.sin(this.time * 6) > 0.3) {
      ctx.strokeStyle = "#e05555"; ctx.lineWidth = 2.2 * scale; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hx - 26 * scale, hy + 2 * scale);
      ctx.lineTo(hx - 40 * scale, hy - 2 * scale);
      ctx.moveTo(hx - 33 * scale, hy);
      ctx.lineTo(hx - 40 * scale, hy + 5 * scale);
      ctx.stroke();
    }

    // HPバー・階級名・残り時間はDOMのボスHUD(§3.3)へ移設
    ctx.restore();
  },

  centerLabel(ctx, txt, x, y, bg, fg) {
    const w = ctx.measureText(txt).width + 22;
    ctx.fillStyle = bg;
    rr(ctx, x - w / 2, y - 17, w, 26, 13); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = "center";
    ctx.fillText(txt, x, y + 2);
  },

  drawPopups(ctx) {
    ctx.textAlign = "center";
    for (const p of Game.popups) {
      ctx.globalAlpha = clamp(p.ttl, 0, 1);
      if (p.big) {
        // 重いダメージ数値(Brushup V2 §3.3): 大きく出て弾んで着地
        const age = 1.2 - p.ttl;
        const pop = 1 + Math.max(0, 0.5 - age) * 0.9;
        ctx.font = `bold ${Math.round(26 * pop)}px sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillText(p.txt, p.x + 2, p.y + 2);
      } else {
        ctx.font = "bold 17px sans-serif";
        ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillText(p.txt, p.x + 1.5, p.y + 1.5);
      }
      ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  },

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.3)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
};

// 角丸矩形(roundRect非対応環境のフォールバック)
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// トカゲの体幅プロファイル (t=0 尾先 → t=1 鼻先、全長比)
// 横向きトカゲの背骨キーポイント [t, x, y, 半幅] (体格L比 / 地面が y=0、上が負)
// 参照写真のポーズ: 尾先は高く跳ね上がり、頭は誇らしげに持ち上がる
const LIZ_SIDE_KEYS = [
  [0.00, -0.80, -0.44, 0.004], // 尾先(高く上がる)
  [0.10, -0.73, -0.28, 0.012],
  [0.22, -0.61, -0.13, 0.022], // 尾の下りカーブ
  [0.34, -0.43, -0.08, 0.034], // 尾の最下点
  [0.45, -0.22, -0.105, 0.052], // 尾の付け根
  [0.56, -0.06, -0.15, 0.082],  // 腰
  [0.66, 0.08, -0.175, 0.094],  // 胸(最も深い)
  [0.76, 0.20, -0.21, 0.072],   // 肩
  [0.84, 0.28, -0.295, 0.047],  // 立ち上がる首
  [0.90, 0.34, -0.36, 0.042],   // 後頭部
  [0.95, 0.40, -0.378, 0.030],  // 頭
  [1.00, 0.485, -0.368, 0.008], // 鼻先
];
function lizSideSample(t) {
  for (let i = 1; i < LIZ_SIDE_KEYS.length; i++) {
    const a = LIZ_SIDE_KEYS[i - 1], b = LIZ_SIDE_KEYS[i];
    if (t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      return {
        x: a[1] + (b[1] - a[1]) * k,
        y: a[2] + (b[2] - a[2]) * k,
        w: a[3] + (b[3] - a[3]) * k,
      };
    }
  }
  const e = LIZ_SIDE_KEYS[LIZ_SIDE_KEYS.length - 1];
  return { x: e[1], y: e[2], w: e[3] };
}

// 固定シード乱数(背景デコ用)
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// #rrggbb → rgba
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- SVG化スプリント: Canvas用ステータスグリフ(絵文字の代替・§9) ----
Object.assign(Render, {
  glyphCrown(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f2c65e";
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s * 1.1, -s * 0.4); ctx.lineTo(-s * 0.45, s * 0.05);
    ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.45, s * 0.05); ctx.lineTo(s * 1.1, -s * 0.4);
    ctx.lineTo(s, s * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  glyphSkull(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#c07ae0";
    ctx.beginPath(); ctx.arc(0, -s * 0.15, s, 0, 7); ctx.fill();
    ctx.fillRect(-s * 0.55, s * 0.3, s * 1.1, s * 0.55);
    ctx.fillStyle = "#241812";
    ctx.beginPath(); ctx.arc(-s * 0.38, -s * 0.2, s * 0.26, 0, 7); ctx.arc(s * 0.38, -s * 0.2, s * 0.26, 0, 7); ctx.fill();
    ctx.restore();
  },
  glyphCross(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f28066";
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const w = s * 0.42;
    ctx.rect(-w / 2, -s, w, s * 2);
    ctx.rect(-s, -w / 2, s * 2, w);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
});
