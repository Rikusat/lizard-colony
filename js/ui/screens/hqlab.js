// =============================================================
// screens/hqlab — 本部=研究施設ページ(hq_lab.md・アイソメ2:1)
// 飼育槽(横視点・生命・温かい土)と対比する「別の場所」(斜め見下ろし・無機質・白)。
// 表示は既存stateからの派生のみ(セーブ非接触・fable2)。機能パネルは hq.js(openLabPanel)。
// =============================================================

// 見た目パラメータ(部屋)。★Ric実機調整の対象。設備の幾何は下の各draw関数(bossの署名描画と同じ流儀)。
const LAB_P = {
  tileW: 64, tileH: 32, cols: 12, rows: 9,
  originX: 500, originY: 150, wallH: 92,
  tile: "#e9e7e1", tileAlt: "#e2dfd8", seam: "#c9c5bb", tileEdge: "#b5b1a6",
  wall: "#dcd9d2", wallDk: "#cfccc4", wallBase: "#b8b4a9",
  light: "rgba(210,225,235,.10)", vig: 0.34,
  label: "rgba(120,112,100,.85)", // 設備の小さな名札(控えめ)
};

Object.assign(UI, {
  // ---------------- ページ制御 ----------------
  // 本部を開く(=飼育槽<main>を隠して切替。topbarは残す=資源が見える)。§9-C4: 開いたら新着ドットを消す。
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab"); // どちらの場所にいるか(topbar側の徴)
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
      const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
      cv.addEventListener("click", (e) => { const p = toCanvas(e); const z = this._hqlabZoneAt(p.x, p.y); if (z) this.openLabPanel(z); });
      cv.addEventListener("mousemove", (e) => { const p = toCanvas(e); cv.style.cursor = this._hqlabZoneAt(p.x, p.y) ? "pointer" : "default"; });
    }
  },

  // ---------------- 設備tier(全て既存stateの派生=保存しない・fable2) ----------------
  labTiers() {
    const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
    const decoded = (typeof RECIPES !== "undefined") ? RECIPES.filter((r) => Game.recipeDecoded(r)).length : 0;
    const rk = Game.ensureRocket();
    return {
      desks: tierOf(Game.hqLevel(), CFG.labDeskTiers),
      tank: tierOf(decoded, CFG.labTankTiers),
      rocket: rk.done ? 4 : rk.stage >= 2 ? 3 : (rk.stage >= 1 || rk.invested > 0) ? 2 : 1,
      shelf: tierOf(Object.keys(Game.state.dex || {}).length, CFG.labShelfTiers),
    };
  },

  // ---------------- 当たり判定(逆等角は不要=設備群のバウンディング矩形・クリック標的は広め=UISkills§7) ----------------
  _hqlabZones() {
    const zr = (gx0, gy0, gx1, gy1, hUp) => { // グリッド範囲→スクリーン矩形
      const pts = [this._iso(gx0, gy0), this._iso(gx1, gy0), this._iso(gx1, gy1), this._iso(gx0, gy1)];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, y0: Math.min(...ys) - hUp, y1: Math.max(...ys) + 8 };
    };
    return [
      { key: "desks", rects: [zr(1.6, 1.6, 5.2, 4.2, 45), zr(0.1, 1.3, 1.2, 3.9, 85)] }, // 机の島+サーバーラック
      { key: "tank", rects: [zr(6.3, 0.9, 9.6, 2.3, 70)] },
      { key: "shelf", rects: [zr(0.05, 4.2, 1.3, 7.3, 150)] },
      { key: "rocket", rects: [zr(8.9, 3.9, 11.0, 6.0, 165)] },
    ];
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- アイソメ描画(静的シーン=開いた時/操作後に再描画のみ・毎フレーム不要=fps余裕) ----------------
  _iso(gx, gy) { return { x: LAB_P.originX + (gx - gy) * LAB_P.tileW / 2, y: LAB_P.originY + (gx + gy) * LAB_P.tileH / 2 }; },
  _poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  },
  _isoBox(c, gx, gy, w, d, h, col) {
    const p00 = this._iso(gx, gy), p10 = this._iso(gx + w, gy), p11 = this._iso(gx + w, gy + d), p01 = this._iso(gx, gy + d);
    const up = (p) => ({ x: p.x, y: p.y - h });
    this._poly(c, [up(p01), up(p11), p11, p01], col.left);
    this._poly(c, [up(p10), up(p11), p11, p10], col.right);
    this._poly(c, [up(p00), up(p10), up(p11), up(p01)], col.top, col.line, 1);
    return { p00, p10, p11, p01 };
  },
  _labShadow(c, gx, gy, w, d) {
    const p00 = this._iso(gx - 0.06, gy - 0.06), p10 = this._iso(gx + w + 0.1, gy - 0.06), p11 = this._iso(gx + w + 0.1, gy + d + 0.1), p01 = this._iso(gx - 0.06, gy + d + 0.1);
    this._poly(c, [p00, p10, p11, p01], "rgba(60,54,44,.18)");
  },

  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"); if (!cv) return;
    const c = cv.getContext("2d");
    const tiers = this.labTiers();
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    // 背景(部屋の外=冷たい闇)
    c.clearRect(0, 0, cv.width, cv.height);
    const bg = c.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, "#191d20"); bg.addColorStop(1, "#0e0c0b");
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    // 奥の壁2面
    const A = this._iso(0, 0), B = this._iso(LAB_P.cols, 0), D = this._iso(0, LAB_P.rows);
    this._poly(c, [{ x: A.x, y: A.y - LAB_P.wallH }, { x: B.x, y: B.y - LAB_P.wallH }, B, A], LAB_P.wall);
    this._poly(c, [{ x: A.x, y: A.y - LAB_P.wallH }, { x: D.x, y: D.y - LAB_P.wallH }, D, A], LAB_P.wallDk);
    c.strokeStyle = LAB_P.wallBase; c.lineWidth = 2;
    c.beginPath(); c.moveTo(D.x, D.y); c.lineTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(D.x, D.y - LAB_P.wallH); c.lineTo(A.x, A.y - LAB_P.wallH); c.lineTo(B.x, B.y - LAB_P.wallH); c.stroke();
    // 床(奥→手前=painter's)
    for (let s = 0; s <= LAB_P.cols + LAB_P.rows - 2; s++)
      for (let gx = 0; gx < LAB_P.cols; gx++) {
        const gy = s - gx; if (gy < 0 || gy >= LAB_P.rows) continue;
        const p0 = this._iso(gx, gy), p1 = this._iso(gx + 1, gy), p2 = this._iso(gx + 1, gy + 1), p3 = this._iso(gx, gy + 1);
        this._poly(c, [p0, p1, p2, p3], (gx + gy) % 2 === 0 ? LAB_P.tile : LAB_P.tileAlt, LAB_P.seam, 1);
      }
    const C2 = this._iso(LAB_P.cols, LAB_P.rows);
    c.strokeStyle = LAB_P.tileEdge; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(C2.x, C2.y); c.lineTo(D.x, D.y); c.stroke();
    // 設備(奥→手前)
    this._labTank(c, tiers.tank);
    this._labDesks(c, tiers.desks);
    this._labShelf(c, tiers.shelf);
    this._labRocket(c, tiers.rocket);
    // 設備の小さな名札(控えめ・機能の場所を示す)
    c.fillStyle = LAB_P.label; c.font = "12px system-ui";
    const lbl = (gx, gy, t) => { const p = this._iso(gx, gy); c.fillText(t, p.x - c.measureText(t).width / 2, p.y); };
    lbl(3.4, 4.9, "研究デスク"); lbl(8.1, 2.9, "実験用水槽"); lbl(1.0, 8.0, "標本棚・記録"); lbl(10.0, 6.6, "宇宙港");
    // 天井灯+ヴィネット(静けさ)
    const M = this._iso(LAB_P.cols / 2, LAB_P.rows / 2);
    const g = c.createRadialGradient(M.x, M.y, 10, M.x, M.y, 190);
    g.addColorStop(0, LAB_P.light); g.addColorStop(1, "rgba(210,225,235,0)");
    c.fillStyle = g; c.beginPath(); c.ellipse(M.x, M.y, 210, 105, 0, 0, 7); c.fill();
    const v = c.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.35, cv.width / 2, cv.height / 2, cv.height * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${LAB_P.vig})`);
    c.fillStyle = v; c.fillRect(0, 0, cv.width, cv.height);
  },

  // ---- パソコンデスク群(研究・変換・管制・侵食モニタ) ----
  _labDesks(c, tier) {
    const DK = { top: "#d3cfc6", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" };
    const MON = { top: "#4c4f55", left: "#3c3f45", right: "#34373d", line: "rgba(0,0,0,.4)" };
    const SCREEN = "#bfe4ee";
    const desk = (gx, gy, w, d) => {
      const legH = 20, topH = 4;
      this._labShadow(c, gx, gy, w, d);
      c.strokeStyle = DK.right; c.lineWidth = 2.5;
      for (const [lx, ly] of [[gx + 0.1, gy + d - 0.1], [gx + w - 0.1, gy + d - 0.1], [gx + w - 0.1, gy + 0.1]]) {
        const l = this._iso(lx, ly); c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.x, l.y - legH); c.stroke();
      }
      const p00 = this._iso(gx, gy), p10 = this._iso(gx + w, gy), p11 = this._iso(gx + w, gy + d), p01 = this._iso(gx, gy + d);
      const up = (p, h) => ({ x: p.x, y: p.y - h });
      this._poly(c, [up(p01, legH + topH), up(p11, legH + topH), up(p11, legH), up(p01, legH)], DK.left);
      this._poly(c, [up(p10, legH + topH), up(p11, legH + topH), up(p11, legH), up(p10, legH)], DK.right);
      this._poly(c, [up(p00, legH + topH), up(p10, legH + topH), up(p11, legH + topH), up(p01, legH + topH)], DK.top, DK.line, 1);
    };
    const monitor = (gx, gy, w, screenW) => {
      this._isoBox(c, gx, gy, w, 0.1, 15, MON);
      const s0 = this._iso(gx + w * 0.08, gy + 0.1), s1 = this._iso(gx + w * (0.08 + (screenW || 0.84)), gy + 0.1);
      c.save(); c.globalAlpha = 0.85; c.shadowColor = SCREEN; c.shadowBlur = 5;
      this._poly(c, [{ x: s0.x, y: s0.y - 13 }, { x: s1.x, y: s1.y - 13 }, { x: s1.x, y: s1.y - 3.5 }, { x: s0.x, y: s0.y - 3.5 }], SCREEN);
      c.restore();
    };
    if (tier >= 4) {
      const RACK = { top: "#464a52", left: "#383c44", right: "#30343c", line: "rgba(0,0,0,.45)" };
      for (const gy0 of [1.6, 2.8]) {
        this._labShadow(c, 0.3, gy0, 0.55, 0.9);
        this._isoBox(c, 0.3, gy0, 0.55, 0.9, 74, RACK);
        for (let i = 0; i < 4; i++) {
          const p = this._iso(0.85, gy0 + 0.18 + i * 0.18);
          c.fillStyle = i % 3 === 0 ? "#e0b34a" : "#7fd98a"; c.globalAlpha = 0.9;
          c.fillRect(p.x - 1, p.y - 58 + i * 3, 2, 2); c.globalAlpha = 1;
        }
      }
    }
    const w = tier >= 3 ? 2.3 : 1.5;
    desk(2.0, 2.0, w, 0.8);
    if (tier >= 3) { monitor(2.15, 2.02, 0.7); monitor(2.95, 2.02, 0.95, 0.8); monitor(4.0, 2.02, 0.55); }
    else monitor(2.35, 2.02, 0.8);
    if (tier >= 2) {
      desk(2.0, 3.15, 1.4, 0.8); monitor(2.3, 3.17, 0.75);
      desk(4.0, 2.9, 0.8, 1.4);
      this._isoBox(c, 4.5, 3.0, 0.1, 0.8, 15, MON);
      const s0 = this._iso(4.5, 3.08), s1 = this._iso(4.5, 3.72);
      c.save(); c.globalAlpha = 0.85; c.shadowColor = SCREEN; c.shadowBlur = 5;
      this._poly(c, [{ x: s0.x, y: s0.y - 13 }, { x: s1.x, y: s1.y - 13 }, { x: s1.x, y: s1.y - 3.5 }, { x: s0.x, y: s0.y - 3.5 }], SCREEN);
      c.restore();
    }
    const stool = (sx, sy) => { this._labShadow(c, sx, sy, 0.32, 0.32); this._isoBox(c, sx, sy, 0.32, 0.32, 12, DK); };
    stool(2.6, 3.0 - (tier >= 2 ? 0 : 0.6));
    if (tier >= 2) stool(3.4, 2.55);
  },

  // ---- 実験用水槽(遺伝子ラボ・鍛造・合成の場) ----
  _labTank(c, tier) {
    const BASE = { top: "#d3cfc6", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" };
    const tank = (gx, gy, w, d, h, crimson) => {
      this._labShadow(c, gx, gy, w, d);
      this._isoBox(c, gx, gy, w, d, 5, BASE);
      const wl = 5 + (h - 5) * 0.62;
      this._isoBox(c, gx + 0.04, gy + 0.04, w - 0.08, d - 0.08, wl, { top: "rgba(150,205,228,.5)", left: "rgba(95,168,201,.38)", right: "rgba(95,168,201,.38)", line: "rgba(0,0,0,0)" });
      if (crimson) { // 錬成槽=部屋で唯一の暖色(賢者の石の深紅・槽内のみ)
        const m = this._iso(gx + w / 2, gy + d / 2);
        const g = c.createRadialGradient(m.x, m.y - wl * 0.55, 2, m.x, m.y - wl * 0.55, 26);
        g.addColorStop(0, "rgba(142,24,38,.34)"); g.addColorStop(1, "rgba(142,24,38,0)");
        c.fillStyle = g; c.beginPath(); c.ellipse(m.x, m.y - wl * 0.55, 26, 20, 0, 0, 7); c.fill();
        c.fillStyle = "#8E1826"; c.globalAlpha = 0.85;
        c.beginPath(); c.arc(m.x, m.y - wl * 0.55, 2.2, 0, 7); c.fill(); c.globalAlpha = 1;
      }
      const b = this._isoBox(c, gx, gy, w, d, h, { top: "rgba(225,240,245,.28)", left: "rgba(168,205,218,.30)", right: "rgba(148,190,205,.36)", line: "rgba(210,235,242,.75)" });
      c.strokeStyle = "rgba(210,235,242,.75)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(b.p11.x, b.p11.y); c.lineTo(b.p11.x, b.p11.y - h); c.stroke();
    };
    const pipe = (gx, gy, topH) => {
      const a = this._iso(gx, gy), w = this._iso(gx, 0.15);
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2.5; c.lineCap = "round";
      c.beginPath(); c.moveTo(a.x, a.y - topH); c.lineTo(a.x, a.y - topH - 10); c.lineTo(w.x, w.y - topH - 10); c.stroke();
    };
    tank(7.6, 1.25, 0.85, 0.85, 36, tier >= 3);
    if (tier >= 2) { tank(8.75, 1.2, 0.62, 0.62, 52, false); pipe(9.05, 1.5, 52); }
    if (tier >= 4) { tank(6.55, 1.35, 0.6, 0.6, 30, false); pipe(8.0, 1.55, 36); }
  },

  // ---- ロケット(宇宙港) ----
  _labRocket(c, tier) {
    const HULL = { top: "#e6e3dc", left: "#c5c1b8", right: "#b2aea4", line: "rgba(90,86,78,.4)" };
    const gx = 9.3, gy = 4.3;
    this._labShadow(c, gx - 0.25, gy - 0.25, 1.5, 1.5);
    this._isoBox(c, gx - 0.25, gy - 0.25, 1.5, 1.5, 6, { top: "#c9c5bb", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" });
    if (tier === 1) {
      this._isoBox(c, gx - 0.05, gy + 0.15, 0.5, 0.5, 14, HULL);
      this._isoBox(c, gx + 0.62, gy + 0.5, 0.62, 0.35, 8, HULL);
      c.fillStyle = "#C9A227"; const t = this._iso(gx + 0.45, gy - 0.02);
      c.beginPath(); c.moveTo(t.x, t.y - 3); c.lineTo(t.x + 14, t.y - 8); c.lineTo(t.x + 2, t.y - 15); c.closePath(); c.fill();
      return;
    }
    const H = 118;
    if (tier === 2) {
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2;
      const corners = [this._iso(gx + 0.14, gy + 0.14), this._iso(gx + 0.86, gy + 0.14), this._iso(gx + 0.86, gy + 0.86), this._iso(gx + 0.14, gy + 0.86)];
      for (const p of corners) { c.beginPath(); c.moveTo(p.x, p.y - 6); c.lineTo(p.x, p.y - 6 - H * 0.72); c.stroke(); }
      for (let i = 1; i <= 3; i++) {
        const y = 6 + (H * 0.72) * i / 3;
        c.beginPath(); c.moveTo(corners[0].x, corners[0].y - y); c.lineTo(corners[1].x, corners[1].y - y); c.lineTo(corners[2].x, corners[2].y - y); c.lineTo(corners[3].x, corners[3].y - y); c.closePath(); c.stroke();
      }
      return;
    }
    this._isoBox(c, gx + 0.2, gy + 0.2, 0.6, 0.6, H, HULL);
    c.strokeStyle = "rgba(120,116,106,.35)"; c.lineWidth = 1;
    for (const yy of [H * 0.35, H * 0.7]) {
      const a = this._iso(gx + 0.2, gy + 0.8), b = this._iso(gx + 0.8, gy + 0.8);
      c.beginPath(); c.moveTo(a.x, a.y - yy - 6); c.lineTo(b.x, b.y - yy - 6); c.stroke();
    }
    const t = this._iso(gx + 0.5, gy + 0.5);
    if (tier >= 4) {
      c.fillStyle = "#C9A227";
      c.beginPath(); c.moveTo(t.x - 11, t.y - 6 - H + 2); c.lineTo(t.x + 11, t.y - 6 - H + 2); c.lineTo(t.x, t.y - 6 - H - 26); c.closePath(); c.fill();
      c.fillStyle = "#b2aea4";
      const fL = this._iso(gx + 0.14, gy + 0.86), fR = this._iso(gx + 0.86, gy + 0.86);
      c.beginPath(); c.moveTo(fL.x, fL.y - 6); c.lineTo(fL.x - 12, fL.y + 2); c.lineTo(fL.x, fL.y - 34); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(fR.x, fR.y - 6); c.lineTo(fR.x + 12, fR.y + 2); c.lineTo(fR.x, fR.y - 34); c.closePath(); c.fill();
      c.fillStyle = "#9fc4d4"; c.beginPath(); c.arc(t.x, t.y - 6 - H * 0.78, 3.2, 0, 7); c.fill();
    } else {
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(t.x - 8, t.y - 6 - H); c.lineTo(t.x - 8, t.y - 6 - H - 14); c.moveTo(t.x + 8, t.y - 6 - H); c.lineTo(t.x + 8, t.y - 6 - H - 14); c.stroke();
    }
  },

  // ---- 標本棚/記録(Lore・鉱石・特性図鑑) ----
  _labShelf(c, tier) {
    const FRAME = { top: "#cfccc4", left: "#aaa69b", right: "#9a968c", line: "rgba(90,86,78,.45)" };
    const unit = (gx, gy) => {
      this._labShadow(c, gx, gy, 0.5, 1.1);
      const H = 66;
      this._isoBox(c, gx, gy, 0.5, 1.1, H, FRAME);
      for (let i = 1; i <= 3; i++) {
        const y = H * i / 3.6;
        const a = this._iso(gx + 0.5, gy + 0.06), b = this._iso(gx + 0.5, gy + 1.04);
        c.strokeStyle = "#b8b4a9"; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(a.x, a.y - y); c.lineTo(b.x, b.y - y); c.stroke();
        if (tier >= 2) for (let j = 0; j < 3 + (i % 2); j++) {
          const p = this._iso(gx + 0.5, gy + 0.18 + j * 0.24);
          c.fillStyle = "rgba(168,205,218,.55)"; c.fillRect(p.x - 2.2, p.y - y - 8, 4.4, 8);
          c.fillStyle = "#9aa0a5"; c.fillRect(p.x - 2.2, p.y - y - 9.5, 4.4, 1.8);
        }
      }
    };
    unit(0.3, 4.6);
    if (tier >= 4) unit(0.3, 6.0);
    if (tier >= 3) { // 星図(左奥の壁・説明しない星座線)
      const a = this._iso(0, 5.0), b = this._iso(0, 6.6);
      const w = { x: b.x - a.x, y: b.y - a.y };
      c.save();
      c.fillStyle = "#2c3440";
      c.beginPath(); c.moveTo(a.x + 2, a.y - 72); c.lineTo(b.x + 2, b.y - 72); c.lineTo(b.x + 2, b.y - 30); c.lineTo(a.x + 2, a.y - 30); c.closePath(); c.fill();
      c.strokeStyle = "rgba(160,190,215,.35)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x + 8, a.y - 62); c.lineTo(a.x + w.x * 0.4, a.y + w.y * 0.4 - 48); c.lineTo(a.x + w.x * 0.75, a.y + w.y * 0.75 - 58); c.stroke();
      c.fillStyle = "#dfe8f0";
      for (const [fx, fy] of [[0.12, -60], [0.4, -46], [0.75, -56], [0.55, -38], [0.88, -44], [0.25, -35]]) {
        c.beginPath(); c.arc(a.x + w.x * fx, a.y + w.y * fx + fy, 1.1, 0, 7); c.fill();
      }
      c.restore();
    }
  },
});

// dev用: index.html#hqlab で直接本部を開く(#hqlab-desks等でパネルも)。実機確認の近道・本番挙動に影響なし。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf))?$/);
  if (m && UI.openHqLab) setTimeout(() => { UI.openHqLab(); if (m[1]) UI.openLabPanel(m[1]); }, 60);
});
