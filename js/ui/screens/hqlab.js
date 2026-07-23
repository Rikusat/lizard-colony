// =============================================================
// screens/hqlab — 本部=研究施設ページ(hq_lab.md v2.0・案A=アイソメ×ファミコン)
// 箱庭: 境界のある一室(床の縁+低い巾木・外は暗)。一望できる。
// 質感: 低解像度(256×176)に描き imageSmoothingEnabled=false で整数倍拡大=本物のドット感。
//   フラット色面・限定パレット・硬エッジ・AAなし。影は硬い単色。暖色=錬成槽の深紅+ロケット先端の琥珀のみ。
// 表示は既存stateの派生+labInvest(デスク群のみ・§5.3案B)。機能パネルは hq.js。
// =============================================================

// 限定パレット(ファミコン風・★Ric実機調整)
const LAB_P = {
  W0: 256, H0: 176, tileW: 16, tileH: 8, cols: 13, rows: 10, ox: 128, oy: 40,
  out: "#14100d",
  floor: "#e0d8c8", floorAlt: "#d0c8b8",
  base: "#8a8478", baseDk: "#555046", edge: "#3a3630",
  shadow: "#bcb4a4",       // 接地影(硬い単色・ぼかしなし)
  grey1: "#c8c4b8", grey2: "#98948a", grey3: "#6a665c", dark: "#3a3630", ink: "#242018",
  screen: "#7ad4e8", water: "#6ab4d8", waterHi: "#9ad4ec", glass: "#cfe8f0",
  crimson: "#8E1826", amber: "#d8a828", white: "#f4f0e6",
  led1: "#7fd98a", led2: "#d8a828",
  label: "rgba(96,88,76,.95)",
};

Object.assign(UI, {
  // ---------------- ページ制御 ----------------
  openHqLab() {
    Game._badgeHq = false; // §9-C4 開いたら新着ドットを消す
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    this.renderHqLab();
  },
  closeHqLab() {
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    lab.classList.add("hidden");
    main.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.remove("at-lab");
  },
  hqLabOpen() { const lab = document.getElementById("hqlab"); return !!(lab && !lab.classList.contains("hidden")); },

  _hqlabBind() {
    if (this._hqlabBound) return; this._hqlabBound = true;
    const back = document.getElementById("hqlab-back");
    if (back) back.addEventListener("click", () => this.closeHqLab());
    const cv = document.getElementById("hqlab-canvas");
    if (cv) {
      const toLow = (e) => { // 表示px→低解像度px(整数倍ブリットの逆変換)
        const r = cv.getBoundingClientRect(), b = this._labBlit || { k: 1, bx: 0, by: 0 };
        return { x: ((e.clientX - r.left) * cv.width / r.width - b.bx) / b.k, y: ((e.clientY - r.top) * cv.height / r.height - b.by) / b.k };
      };
      cv.addEventListener("click", (e) => { const p = toLow(e); const z = this._hqlabZoneAt(p.x, p.y); if (z) this.openLabPanel(z); });
      cv.addEventListener("mousemove", (e) => { const p = toLow(e); cv.style.cursor = this._hqlabZoneAt(p.x, p.y) ? "pointer" : "default"; });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); });
  },

  // ---------------- 設備tier(混在駆動=施設ごとの物語・Ric承認) ----------------
  // デスク群=鉱石投資(labInvest・案B) / 水槽=解読レシピ数 / ロケット=rocket状態 / 標本棚=図鑑登録数(観賞=収集の成果)
  labTiers() {
    if (this._labTierOverride) return this._labTierOverride; // dev表示用(状態は変えない)
    const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
    const decoded = (typeof RECIPES !== "undefined") ? RECIPES.filter((r) => Game.recipeDecoded(r)).length : 0;
    const rk = Game.ensureRocket();
    return {
      desks: Math.min(4, 1 + Game.labInvestLv("desks")), // 投資1回=1段(T1→T4)
      tank: tierOf(decoded, CFG.labTankTiers),
      rocket: rk.done ? 4 : rk.stage >= 2 ? 3 : (rk.stage >= 1 || rk.invested > 0) ? 2 : 1,
      shelf: tierOf(Object.keys(Game.state.dex || {}).length, CFG.labShelfTiers),
    };
  },

  // ---------------- 座標系(低解像度空間) ----------------
  _iso(gx, gy) { return { x: LAB_P.ox + (gx - gy) * LAB_P.tileW / 2, y: LAB_P.oy + (gx + gy) * LAB_P.tileH / 2 }; },
  _px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  _flat(c, pts, fill, line) { // フラット多角形(塗り+1px硬線)
    c.beginPath(); c.moveTo(Math.round(pts[0].x) + 0.5, Math.round(pts[0].y) + 0.5);
    for (let i = 1; i < pts.length; i++) c.lineTo(Math.round(pts[i].x) + 0.5, Math.round(pts[i].y) + 0.5);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (line) { c.strokeStyle = line; c.lineWidth = 1; c.stroke(); }
  },
  // フラットなアイソメ箱(3面+上面の硬い輪郭・グラデ/ぼかしなし)
  _box(c, gx, gy, w, d, h, top, left, right, line) {
    const p00 = this._iso(gx, gy), p10 = this._iso(gx + w, gy), p11 = this._iso(gx + w, gy + d), p01 = this._iso(gx, gy + d);
    const up = (p) => ({ x: p.x, y: p.y - h });
    this._flat(c, [up(p01), up(p11), p11, p01], left);
    this._flat(c, [up(p10), up(p11), p11, p10], right);
    this._flat(c, [up(p00), up(p10), up(p11), up(p01)], top, line || LAB_P.ink);
    return { p00, p10, p11, p01 };
  },
  _shadow(c, gx, gy, w, d) { // 接地影=硬い単色の菱形(床トーンを一段沈める)
    const p00 = this._iso(gx - 0.05, gy - 0.05), p10 = this._iso(gx + w + 0.12, gy - 0.05), p11 = this._iso(gx + w + 0.12, gy + d + 0.12), p01 = this._iso(gx - 0.05, gy + d + 0.12);
    this._flat(c, [p00, p10, p11, p01], LAB_P.shadow);
  },

  // ---------------- 当たり判定(低解像度座標・標的広め) ----------------
  _hqlabZones() {
    const zr = (gx0, gy0, gx1, gy1, hUp) => {
      const pts = [this._iso(gx0, gy0), this._iso(gx1, gy0), this._iso(gx1, gy1), this._iso(gx0, gy1)];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 3, y0: Math.min(...ys) - hUp, y1: Math.max(...ys) + 3 };
    };
    return [
      { key: "desks", rects: [zr(1.6, 1.4, 6.0, 4.6, 14), zr(0.2, 0.2, 2.0, 4.0, 26)] }, // 机の島+ラック+侵食モニタ
      { key: "tank", rects: [zr(7.6, 0.8, 11.6, 3.2, 20)] },
      { key: "shelf", rects: [zr(0.3, 5.3, 3.2, 9.4, 24)] },
      { key: "rocket", rects: [zr(8.6, 5.2, 12.2, 8.6, 48)] },
    ];
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 描画(静的シーン=開いた時/変化時のみ) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    // --- 低解像度バッファへドット絵を描く ---
    if (!this._labLow) { this._labLow = document.createElement("canvas"); this._labLow.width = LAB_P.W0; this._labLow.height = LAB_P.H0; }
    const c = this._labLow.getContext("2d");
    const tiers = this.labTiers();
    this._px(c, 0, 0, LAB_P.W0, LAB_P.H0, LAB_P.out); // 外は暗
    // 床(箱庭=境界あり・2色市松・フラット)
    for (let gx = 0; gx < LAB_P.cols; gx++) for (let gy = 0; gy < LAB_P.rows; gy++) {
      const p0 = this._iso(gx, gy), p1 = this._iso(gx + 1, gy), p2 = this._iso(gx + 1, gy + 1), p3 = this._iso(gx, gy + 1);
      this._flat(c, [p0, p1, p2, p3], (gx + gy) % 2 === 0 ? LAB_P.floor : LAB_P.floorAlt);
    }
    // 縁: 手前2辺=低い巾木(高さ4px・高い壁なし)/奥2辺=1pxの硬線
    const A = this._iso(0, 0), B = this._iso(LAB_P.cols, 0), C2 = this._iso(LAB_P.cols, LAB_P.rows), D = this._iso(0, LAB_P.rows);
    this._flat(c, [B, C2, { x: C2.x, y: C2.y + 4 }, { x: B.x, y: B.y + 4 }], LAB_P.baseDk);
    this._flat(c, [D, C2, { x: C2.x, y: C2.y + 4 }, { x: D.x, y: D.y + 4 }], LAB_P.base);
    c.strokeStyle = LAB_P.edge; c.lineWidth = 1;
    c.beginPath(); c.moveTo(D.x + 0.5, D.y + 0.5); c.lineTo(A.x + 0.5, A.y + 0.5); c.lineTo(B.x + 0.5, B.y + 0.5); c.stroke();
    // 設備(奥→手前)
    this._labTank(c, tiers.tank);
    this._labDesks(c, tiers.desks);
    this._labShelf(c, tiers.shelf);
    this._labRocket(c, tiers.rocket);
    // --- 整数倍拡大ブリット(ドット感) ---
    const k = Math.max(2, Math.floor(Math.min(W / LAB_P.W0, H / LAB_P.H0)));
    const bx = Math.floor((W - LAB_P.W0 * k) / 2), by = Math.floor((H - LAB_P.H0 * k) / 2);
    this._labBlit = { k, bx, by };
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = LAB_P.out; g.fillRect(0, 0, W, H);
    g.drawImage(this._labLow, 0, 0, LAB_P.W0, LAB_P.H0, bx, by, LAB_P.W0 * k, LAB_P.H0 * k);
    // 名札(共通UI層=ブリット後に通常フォントで控えめに。シーン内はドットのみ)
    g.fillStyle = LAB_P.label; g.font = "12px system-ui";
    const lbl = (gx, gy, t) => { const p = this._iso(gx, gy); g.fillText(t, bx + p.x * k - g.measureText(t).width / 2, by + p.y * k); };
    lbl(3.8, 5.4, "研究デスク"); lbl(9.8, 3.7, "実験用水槽"); lbl(1.8, 10.1, "標本棚・記録"); lbl(10.6, 9.2, "宇宙港");
  },

  // ---- パソコンデスク群(鉱石投資で育つ=labInvest・§5.3案B)+自立式の侵食モニタ ----
  _labDesks(c, tier) {
    const P = LAB_P;
    const desk = (gx, gy, w, d) => {
      this._shadow(c, gx, gy, w, d);
      this._box(c, gx, gy, w, d, 6, P.grey1, P.grey2, P.grey3);
    };
    const monitor = (gx, gy, w) => {
      this._box(c, gx, gy, w, 0.12, 5, P.dark, P.dark, P.ink, P.ink);
      const s0 = this._iso(gx + 0.06, gy + 0.12), s1 = this._iso(gx + w - 0.06, gy + 0.12);
      this._flat(c, [{ x: s0.x, y: s0.y - 4.5 }, { x: s1.x, y: s1.y - 4.5 }, { x: s1.x, y: s1.y - 1 }, { x: s0.x, y: s0.y - 1 }], P.screen);
    };
    if (tier >= 4) { // サーバーラック(LEDは点=静的)
      for (const gy0 of [0.5, 1.7]) {
        this._shadow(c, 0.4, gy0, 0.6, 1.0);
        this._box(c, 0.4, gy0, 0.6, 1.0, 22, P.grey3, P.dark, P.ink);
        for (let i = 0; i < 3; i++) {
          const p = this._iso(1.0, gy0 + 0.2 + i * 0.25);
          this._px(c, p.x, p.y - 17 + i * 3, 1, 1, i % 2 === 0 ? P.led1 : P.led2);
        }
      }
    }
    if (tier >= 3) { // 自立式の侵食モニタ(帯=深紅・見れば分かる§9)
      const a = this._iso(1.5, 0.5), b = this._iso(2.7, 0.5);
      this._shadow(c, 1.5, 0.42, 1.2, 0.16);
      c.strokeStyle = P.dark; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x + 0.5, a.y + 0.5); c.lineTo(a.x + 0.5, a.y - 8.5); c.moveTo(b.x + 0.5, b.y + 0.5); c.lineTo(b.x + 0.5, b.y - 8.5); c.stroke();
      this._flat(c, [{ x: a.x - 1, y: a.y - 18 }, { x: b.x + 1, y: b.y - 18 }, { x: b.x + 1, y: b.y - 8 }, { x: a.x - 1, y: a.y - 8 }], P.dark, P.ink);
      this._px(c, a.x + 1, a.y - 16, b.x - a.x - 2, 6, P.screen);
      const ero = Math.min(1, Math.max(0, (Game.state.erosion || 0) / 100));
      this._px(c, a.x + 1, a.y - 12, Math.max(1, (b.x - a.x - 2) * ero), 2, P.crimson);
    }
    const w = tier >= 3 ? 2.4 : 1.6;
    desk(2.2, 2.0, w, 0.9);
    if (tier >= 3) { monitor(2.35, 2.05, 0.6); monitor(3.1, 2.05, 0.8); monitor(4.05, 2.05, 0.5); }
    else monitor(2.5, 2.05, 0.7);
    if (tier >= 2) { desk(2.2, 3.3, 1.5, 0.9); monitor(2.5, 3.35, 0.7); }
    // 丸椅子
    this._shadow(c, 2.9, 3.05 - (tier >= 2 ? -0.35 : 0.45), 0.35, 0.35);
    this._box(c, 2.9, 3.05 - (tier >= 2 ? -0.35 : 0.45), 0.35, 0.35, 4, P.grey1, P.grey2, P.grey3);
  },

  // ---- 実験用水槽(錬成の場・唯一の暖色=深紅は槽内のみ) ----
  _labTank(c, tier) {
    const P = LAB_P;
    const tank = (gx, gy, w, d, h, crimson) => {
      this._shadow(c, gx, gy, w, d);
      this._box(c, gx, gy, w, d, 2, P.grey2, P.grey3, P.dark); // 台座
      const wl = Math.round(h * 0.62);
      this._box(c, gx + 0.06, gy + 0.06, w - 0.12, d - 0.12, wl, P.waterHi, P.water, P.water, P.water); // 水(フラット2トーン)
      if (crimson) { const m = this._iso(gx + w / 2, gy + d / 2); this._px(c, m.x - 1, m.y - wl + 1, 3, 3, P.crimson); } // 賢者の石の芯
      // ガラス=輪郭のみ(1px明線)
      const p00 = this._iso(gx, gy), p10 = this._iso(gx + w, gy), p11 = this._iso(gx + w, gy + d), p01 = this._iso(gx, gy + d);
      const up = (p) => ({ x: p.x, y: p.y - h });
      c.strokeStyle = P.glass; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(up(p00).x + 0.5, up(p00).y + 0.5); c.lineTo(up(p10).x + 0.5, up(p10).y + 0.5); c.lineTo(up(p11).x + 0.5, up(p11).y + 0.5); c.lineTo(up(p01).x + 0.5, up(p01).y + 0.5); c.closePath();
      c.moveTo(up(p11).x + 0.5, up(p11).y + 0.5); c.lineTo(p11.x + 0.5, p11.y + 0.5);
      c.moveTo(up(p01).x + 0.5, up(p01).y + 0.5); c.lineTo(p01.x + 0.5, p01.y + 0.5);
      c.moveTo(up(p10).x + 0.5, up(p10).y + 0.5); c.lineTo(p10.x + 0.5, p10.y + 0.5);
      c.stroke();
    };
    tank(8.2, 1.2, 1.1, 1.1, 12, tier >= 3);
    if (tier >= 2) {
      tank(9.8, 1.1, 0.8, 0.8, 17, false);
      const a = this._iso(10.2, 1.5); // 連絡管(硬い1px線)
      c.strokeStyle = P.grey2; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x + 0.5, a.y - 19.5); c.lineTo(a.x + 0.5, a.y - 22.5); c.lineTo(this._iso(8.8, 1.7).x + 0.5, a.y - 22.5); c.stroke();
    }
    if (tier >= 4) tank(7.0, 1.4, 0.7, 0.7, 9, false);
  },

  // ---- ロケット(宇宙港・先端の琥珀=もう一つの暖色) ----
  _labRocket(c, tier) {
    const P = LAB_P;
    const gx = 9.6, gy = 5.8;
    this._shadow(c, gx - 0.3, gy - 0.3, 1.7, 1.7);
    this._box(c, gx - 0.3, gy - 0.3, 1.7, 1.7, 2, P.grey2, P.grey3, P.dark); // 発射台
    if (tier === 1) {
      this._box(c, gx, gy + 0.2, 0.5, 0.5, 5, P.white, P.grey1, P.grey2);
      this._box(c, gx + 0.7, gy + 0.6, 0.6, 0.35, 3, P.white, P.grey1, P.grey2);
      const t = this._iso(gx + 0.5, gy);
      this._flat(c, [{ x: t.x, y: t.y - 1 }, { x: t.x + 5, y: t.y - 3 }, { x: t.x + 1, y: t.y - 6 }], P.amber, P.ink);
      return;
    }
    const H = tier === 2 ? 26 : 36;
    if (tier === 2) { // 骨組み(硬い1px線)
      c.strokeStyle = P.grey2; c.lineWidth = 1;
      const cs = [this._iso(gx + 0.2, gy + 0.2), this._iso(gx + 0.9, gy + 0.2), this._iso(gx + 0.9, gy + 0.9), this._iso(gx + 0.2, gy + 0.9)];
      for (const p of cs) { c.beginPath(); c.moveTo(p.x + 0.5, p.y - 2); c.lineTo(p.x + 0.5, p.y - 2 - H); c.stroke(); }
      for (let i = 1; i <= 3; i++) {
        const y = 2 + H * i / 3;
        c.beginPath(); c.moveTo(cs[0].x + 0.5, cs[0].y - y); c.lineTo(cs[1].x + 0.5, cs[1].y - y); c.lineTo(cs[2].x + 0.5, cs[2].y - y); c.lineTo(cs[3].x + 0.5, cs[3].y - y); c.closePath(); c.stroke();
      }
      return;
    }
    this._box(c, gx + 0.25, gy + 0.25, 0.65, 0.65, H, P.white, P.grey1, P.grey2); // 機体(フラット2トーン)
    const t = this._iso(gx + 0.57, gy + 0.57);
    c.strokeStyle = P.grey2; c.lineWidth = 1; // 継ぎ目
    c.beginPath(); c.moveTo(t.x - 5, t.y - H * 0.5 - 2); c.lineTo(t.x + 5, t.y - H * 0.5 - 2); c.stroke();
    if (tier >= 4) {
      this._flat(c, [{ x: t.x - 5, y: t.y - H - 1 }, { x: t.x + 5, y: t.y - H - 1 }, { x: t.x, y: t.y - H - 10 }], P.amber, P.ink); // 琥珀の先端
      const fL = this._iso(gx + 0.2, gy + 0.95), fR = this._iso(gx + 0.95, gy + 0.95);
      this._flat(c, [{ x: fL.x, y: fL.y - 2 }, { x: fL.x - 4, y: fL.y + 1 }, { x: fL.x, y: fL.y - 11 }], P.grey2, P.ink);
      this._flat(c, [{ x: fR.x, y: fR.y - 2 }, { x: fR.x + 4, y: fR.y + 1 }, { x: fR.x, y: fR.y - 11 }], P.grey2, P.ink);
      this._px(c, t.x - 1, t.y - H * 0.78, 2, 2, P.screen); // 小窓
    } else {
      c.strokeStyle = P.grey2;
      c.beginPath(); c.moveTo(t.x - 3.5, t.y - H); c.lineTo(t.x - 3.5, t.y - H - 5); c.moveTo(t.x + 3.5, t.y - H); c.lineTo(t.x + 3.5, t.y - H - 5); c.stroke();
    }
  },

  // ---- 標本棚/記録(収集の成果が景色になる・投資対象外)+自立スタンドの星図盤 ----
  _labShelf(c, tier) {
    const P = LAB_P;
    const unit = (gx, gy) => {
      this._shadow(c, gx, gy, 0.55, 1.2);
      const H = 18;
      this._box(c, gx, gy, 0.55, 1.2, H, P.grey1, P.grey2, P.grey3);
      for (let i = 1; i <= 2; i++) { // 棚板(1px)+標本瓶(2×3pxフラット)
        const y = Math.round(H * i / 3);
        const a = this._iso(gx + 0.55, gy + 0.06), b = this._iso(gx + 0.55, gy + 1.14);
        c.strokeStyle = P.grey3; c.lineWidth = 1;
        c.beginPath(); c.moveTo(a.x + 0.5, a.y - y + 0.5); c.lineTo(b.x + 0.5, b.y - y + 0.5); c.stroke();
        if (tier >= 2) for (let j = 0; j < 3; j++) {
          const p = this._iso(gx + 0.55, gy + 0.22 + j * 0.3);
          this._px(c, p.x - 1, p.y - y - 4, 2, 3, P.glass);
          this._px(c, p.x - 1, p.y - y - 5, 2, 1, P.grey2);
        }
      }
    };
    unit(0.8, 5.8);
    if (tier >= 4) unit(0.8, 7.2);
    if (tier >= 3) { // 自立スタンドの星図盤(フラット紺+星1px)
      const gx = 2.0, gy = 7.9;
      this._shadow(c, gx, gy - 0.1, 1.1, 0.16);
      const a = this._iso(gx, gy), b = this._iso(gx + 1.1, gy);
      c.strokeStyle = P.grey3; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x + 0.5, a.y + 0.5); c.lineTo(a.x + 0.5, a.y - 7.5); c.moveTo(b.x + 0.5, b.y + 0.5); c.lineTo(b.x + 0.5, b.y - 7.5); c.stroke();
      this._flat(c, [{ x: a.x - 1, y: a.y - 17 }, { x: b.x + 1, y: b.y - 17 }, { x: b.x + 1, y: b.y - 7 }, { x: a.x - 1, y: a.y - 7 }], "#2c3440", P.ink);
      for (const [fx, fy] of [[0.15, -14], [0.4, -10], [0.7, -13], [0.55, -9], [0.85, -12]]) {
        this._px(c, a.x + (b.x - a.x) * fx, a.y + fy, 1, 1, P.white);
      }
    }
  },
});

// dev用: index.html#hqlab で直接本部を開く(#hqlab-desks等でパネル/#hqlab-fullで全設備T4表示)。本番挙動に影響なし。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full))?$/);
  if (m && UI.openHqLab) setTimeout(() => {
    if (m[1] === "full") UI._labTierOverride = { desks: 4, tank: 4, rocket: 4, shelf: 4 };
    UI.openHqLab();
    if (m[1] && m[1] !== "full") UI.openLabPanel(m[1]);
  }, 60);
});
