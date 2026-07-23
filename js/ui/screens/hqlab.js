// =============================================================
// screens/hqlab — 本部=研究施設ページ(hq_lab.md・アイソメ2:1)
// 壁なし・タイルは画面端まで走らせ「画面外へ続く」(浮いた島を作らない)。奥行き=床グリッド+接地影。
// 表示は既存stateからの派生のみ(セーブ非接触・fable2)。機能パネルは hq.js(openLabPanel)。
// =============================================================

// 見た目パラメータ(色)。大きさは CFG.labTileScale(タイル+設備の一体倍率)/CFG.labFacScale(設備のみ倍率・比較用)。
const LAB_P = {
  baseTileW: 64, baseTileH: 32,
  tile: "#e9e7e1", tileAlt: "#e2dfd8", seam: "#c9c5bb",
  light: "rgba(210,225,235,.10)", vig: 0.34,
  label: "rgba(120,112,100,.85)",
};
// 壁の無い床では旧・部屋の北西寄り配置が偏って見える→クラスタごとのオフセットで画面全体へ再配分(描画/判定が_iso経由で自動追従)
const LAB_OFFS = {
  desks: { x: 0.9, y: 0.9 },   // 中央左=主役
  tank: { x: 1.5, y: 1.7 },    // 右上の島
  rocket: { x: -0.2, y: 1.9 }, // 右下の発射区画
  shelf: { x: 0.9, y: 1.3 },   // 左下の収蔵
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
      const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
      cv.addEventListener("click", (e) => { const p = toCanvas(e); const z = this._hqlabZoneAt(p.x, p.y); if (z) this.openLabPanel(z); });
      cv.addEventListener("mousemove", (e) => { const p = toCanvas(e); cv.style.cursor = this._hqlabZoneAt(p.x, p.y) ? "pointer" : "default"; });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); }); // 解像度変化に追従(静的シーン=再描画1回)
  },

  // ---------------- 設備tier(全て既存stateの派生=保存しない・fable2) ----------------
  labTiers() {
    if (this._labTierOverride) return this._labTierOverride; // dev表示用オーバーライド(状態は変えない)
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

  // ---------------- 座標系(倍率S・原点=設備群の中心を画面中央へ) ----------------
  _labS() { return CFG.labTileScale || 1.7; },   // タイル+設備の一体倍率(★Ric実機調整)
  _labF() { return CFG.labFacScale || 1.0; },    // 設備のみ倍率(比較用・既定1)
  _iso(gx, gy) {
    const o = this._labO || { x: 500, y: 150 }, f = this._labOff; // _labOff=描画中クラスタのオフセット(再配分)
    if (f) { gx += f.x; gy += f.y; }
    return { x: o.x + (gx - gy) * this._tw / 2, y: o.y + (gx + gy) * this._th / 2 };
  },
  _unproject(sx, sy) { // 逆等角(O(1)) — 当たり判定/床範囲の算出
    const o = this._labO, dx = (sx - o.x) / (this._tw / 2), dy = (sy - o.y) / (this._th / 2);
    return { gx: (dy + dx) / 2, gy: (dy - dx) / 2 };
  },
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

  // ---------------- 当たり判定(設備群のバウンディング矩形・標的広め=UISkills§7・倍率に自動追従) ----------------
  _hqlabZones() {
    const S = this._labS() * this._labF();
    const zr = (gx0, gy0, gx1, gy1, hUp) => {
      const pts = [this._iso(gx0, gy0), this._iso(gx1, gy0), this._iso(gx1, gy1), this._iso(gx0, gy1)];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, y0: Math.min(...ys) - hUp * S, y1: Math.max(...ys) + 8 };
    };
    const defs = [
      { key: "desks", raw: [[1.6, 1.6, 5.2, 4.2, 45], [0.1, 0.4, 1.9, 3.9, 85]] }, // 机の島+ラック+侵食モニタ
      { key: "tank", raw: [[6.3, 0.9, 9.6, 2.3, 70]] },
      { key: "shelf", raw: [[0.05, 4.2, 2.3, 7.6, 100]] },
      { key: "rocket", raw: [[8.9, 3.9, 11.0, 6.0, 165]] },
    ];
    const out = [];
    for (const d of defs) { // クラスタオフセットを適用して矩形化(描画と同じ座標系=ズレない)
      this._labOff = LAB_OFFS[d.key];
      out.push({ key: d.key, rects: d.raw.map((r) => zr(r[0], r[1], r[2], r[3], r[4])) });
      this._labOff = null;
    }
    return out;
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 描画(静的シーン=開いた時/変化時のみ。壁なし=床が画面外へ続く) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    // canvasを領域実寸で確保(全解像度でcrisp・CSS=実寸1:1=当たり判定もそのまま)
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const S = this._labS();
    this._tw = LAB_P.baseTileW * S; this._th = LAB_P.baseTileH * S;
    // 原点: 設備群の視覚重心(gx≈5.4, gy≈3.4)を画面中央へ(塔物の高さぶんやや下げる)
    const cgx = 5.4, cgy = 3.4;
    this._labO = { x: 0, y: 0 };
    const cIso = this._iso(cgx, cgy);
    this._labO = { x: W / 2 - cIso.x, y: H * 0.52 - cIso.y };
    const c = cv.getContext("2d");
    const tiers = this.labTiers();
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    c.clearRect(0, 0, W, H);
    // 床タイル: 画面の四隅を逆等角変換し、視界を覆う範囲を全て描く=「画面外へ続く」(縁の切れ目を作らない)
    const corners = [this._unproject(0, 0), this._unproject(W, 0), this._unproject(0, H), this._unproject(W, H)];
    const gxMin = Math.floor(Math.min(...corners.map((p) => p.gx))) - 1, gxMax = Math.ceil(Math.max(...corners.map((p) => p.gx))) + 1;
    const gyMin = Math.floor(Math.min(...corners.map((p) => p.gy))) - 1, gyMax = Math.ceil(Math.max(...corners.map((p) => p.gy))) + 1;
    for (let s = gxMin + gyMin; s <= gxMax + gyMax; s++) // 奥→手前(painter's)
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const gy = s - gx; if (gy < gyMin || gy > gyMax) continue;
        const p0 = this._iso(gx, gy), p1 = this._iso(gx + 1, gy), p2 = this._iso(gx + 1, gy + 1), p3 = this._iso(gx, gy + 1);
        if (Math.max(p0.x, p2.x) < -this._tw || Math.min(p0.x, p2.x) > W + this._tw) continue;
        this._poly(c, [p0, p1, p2, p3], (((gx % 2) + 2) % 2 + ((gy % 2) + 2) % 2) % 2 === 0 ? LAB_P.tile : LAB_P.tileAlt, LAB_P.seam, 1);
      }
    // 設備(奥→手前・クラスタごとに再配分オフセットを適用)
    this._labOff = LAB_OFFS.tank; this._labTank(c, tiers.tank);
    this._labOff = LAB_OFFS.desks; this._labDesks(c, tiers.desks);
    this._labOff = LAB_OFFS.shelf; this._labShelf(c, tiers.shelf);
    this._labOff = LAB_OFFS.rocket; this._labRocket(c, tiers.rocket);
    this._labOff = null;
    // 設備の小さな名札(控えめ・各クラスタのオフセットで描く)
    c.fillStyle = LAB_P.label; c.font = `${Math.round(12 * Math.min(1.25, S * 0.75))}px system-ui`;
    const lbl = (off, gx, gy, t) => { this._labOff = off; const p = this._iso(gx, gy); this._labOff = null; c.fillText(t, p.x - c.measureText(t).width / 2, p.y); };
    lbl(LAB_OFFS.desks, 3.4, 4.9, "研究デスク"); lbl(LAB_OFFS.tank, 8.1, 2.9, "実験用水槽"); lbl(LAB_OFFS.shelf, 1.4, 8.3, "標本棚・記録"); lbl(LAB_OFFS.rocket, 10.0, 6.6, "宇宙港");
    // 天井灯の光だまり+ヴィネット(静けさ・清潔)
    const M = this._iso(cgx, cgy);
    const g = c.createRadialGradient(M.x, M.y, 10, M.x, M.y, 190 * S);
    g.addColorStop(0, LAB_P.light); g.addColorStop(1, "rgba(210,225,235,0)");
    c.fillStyle = g; c.beginPath(); c.ellipse(M.x, M.y, 220 * S, 110 * S, 0, 0, 7); c.fill();
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${LAB_P.vig})`);
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  },

  // ---- パソコンデスク群(研究・変換・管制)+自立式の侵食モニタ(旧・壁面モニタの床置き化) ----
  _labDesks(c, tier) {
    const S = this._labS() * this._labF();
    const DK = { top: "#d3cfc6", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" };
    const MON = { top: "#4c4f55", left: "#3c3f45", right: "#34373d", line: "rgba(0,0,0,.4)" };
    const SCREEN = "#bfe4ee";
    const F = this._labF();
    const desk = (gx, gy, w, d) => {
      w *= F; d *= F;
      const legH = 20 * S, topH = 4 * S;
      this._labShadow(c, gx, gy, w, d);
      c.strokeStyle = DK.right; c.lineWidth = 2.5 * S * 0.7 + 0.8;
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
      w *= F;
      this._isoBox(c, gx, gy, w, 0.1, 15 * S, MON);
      const s0 = this._iso(gx + w * 0.08, gy + 0.1), s1 = this._iso(gx + w * (0.08 + (screenW || 0.84)), gy + 0.1);
      c.save(); c.globalAlpha = 0.85; c.shadowColor = SCREEN; c.shadowBlur = 5;
      this._poly(c, [{ x: s0.x, y: s0.y - 13 * S }, { x: s1.x, y: s1.y - 13 * S }, { x: s1.x, y: s1.y - 3.5 * S }, { x: s0.x, y: s0.y - 3.5 * S }], SCREEN);
      c.restore();
    };
    if (tier >= 4) { // サーバーラック(床置き・静かなLED)
      const RACK = { top: "#464a52", left: "#383c44", right: "#30343c", line: "rgba(0,0,0,.45)" };
      for (const gy0 of [1.6, 2.8]) {
        this._labShadow(c, 0.3, gy0, 0.55 * F, 0.9 * F);
        this._isoBox(c, 0.3, gy0, 0.55 * F, 0.9 * F, 74 * S, RACK);
        for (let i = 0; i < 4; i++) {
          const p = this._iso(0.3 + 0.55 * F, gy0 + (0.18 + i * 0.18) * F);
          c.fillStyle = i % 3 === 0 ? "#e0b34a" : "#7fd98a"; c.globalAlpha = 0.9;
          c.fillRect(p.x - S, p.y - (58 - i * 3) * S, 2 * S, 2 * S); c.globalAlpha = 1;
        }
      }
    }
    // 自立式の侵食モニタ(旧・壁面モニタ→床置きスタンドの大型盤。機能=デスクパネル内・見た目の家)
    if (tier >= 3) {
      const gx = 0.55, gy = 0.55, bw = 1.15 * F;
      this._labShadow(c, gx, gy, bw, 0.16);
      const a = this._iso(gx, gy + 0.08), b = this._iso(gx + bw, gy + 0.08);
      c.strokeStyle = "#3c3f45"; c.lineWidth = 2.2 * S * 0.7 + 0.8; // スタンド脚2本
      for (const p of [a, b]) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - 30 * S); c.stroke(); }
      this._poly(c, [{ x: a.x - 2, y: a.y - 62 * S }, { x: b.x + 2, y: b.y - 62 * S }, { x: b.x + 2, y: b.y - 30 * S }, { x: a.x - 2, y: a.y - 30 * S }], "#3c3f45", "rgba(0,0,0,.4)", 1);
      c.save(); c.globalAlpha = 0.8; c.shadowColor = SCREEN; c.shadowBlur = 5; // 盤面(侵食の帯グラフ=気配のみ)
      this._poly(c, [{ x: a.x + 2 * S, y: a.y - 58 * S }, { x: b.x - 2 * S, y: b.y - 58 * S }, { x: b.x - 2 * S, y: b.y - 34 * S }, { x: a.x + 2 * S, y: a.y - 34 * S }], "#9fc7d4");
      c.restore();
      const ero = Math.min(1, Math.max(0, (Game.state.erosion || 0) / 100));
      c.fillStyle = "#c96a4e"; c.globalAlpha = 0.85;
      c.fillRect(a.x + 4 * S, a.y - 42 * S, Math.max(2, (b.x - a.x - 8 * S) * ero), 3 * S); c.globalAlpha = 1; // 侵食の帯(見れば分かる=§9)
    }
    const w = tier >= 3 ? 2.3 : 1.5;
    desk(2.0, 2.0, w, 0.8);
    if (tier >= 3) { monitor(2.15, 2.02, 0.7); monitor(2.95, 2.02, 0.95, 0.8); monitor(4.0, 2.02, 0.55); }
    else monitor(2.35, 2.02, 0.8);
    if (tier >= 2) {
      desk(2.0, 3.15, 1.4, 0.8); monitor(2.3, 3.17, 0.75);
      desk(4.0, 2.9, 0.8, 1.4);
      this._isoBox(c, 4.5, 3.0, 0.1, 0.8 * F, 15 * S, MON);
      const s0 = this._iso(4.5, 3.08), s1 = this._iso(4.5, 3.0 + 0.72 * F);
      c.save(); c.globalAlpha = 0.85; c.shadowColor = SCREEN; c.shadowBlur = 5;
      this._poly(c, [{ x: s0.x, y: s0.y - 13 * S }, { x: s1.x, y: s1.y - 13 * S }, { x: s1.x, y: s1.y - 3.5 * S }, { x: s0.x, y: s0.y - 3.5 * S }], SCREEN);
      c.restore();
    }
    const stool = (sx, sy) => { this._labShadow(c, sx, sy, 0.32 * F, 0.32 * F); this._isoBox(c, sx, sy, 0.32 * F, 0.32 * F, 12 * S, DK); };
    stool(2.6, 3.0 - (tier >= 2 ? 0 : 0.6));
    if (tier >= 2) stool(3.4, 2.55);
  },

  // ---- 実験用水槽(遺伝子ラボ・鍛造・合成の場) ----
  _labTank(c, tier) {
    const S = this._labS() * this._labF(), F = this._labF();
    const BASE = { top: "#d3cfc6", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" };
    const tank = (gx, gy, w, d, h, crimson) => {
      w *= F; d *= F; h *= S;
      this._labShadow(c, gx, gy, w, d);
      this._isoBox(c, gx, gy, w, d, 5 * S, BASE);
      const wl = 5 * S + (h - 5 * S) * 0.62;
      this._isoBox(c, gx + 0.04, gy + 0.04, w - 0.08, d - 0.08, wl, { top: "rgba(150,205,228,.5)", left: "rgba(95,168,201,.38)", right: "rgba(95,168,201,.38)", line: "rgba(0,0,0,0)" });
      if (crimson) { // 錬成槽=唯一の暖色(賢者の石の深紅・槽内のみ)
        const m = this._iso(gx + w / 2, gy + d / 2);
        const g = c.createRadialGradient(m.x, m.y - wl * 0.55, 2, m.x, m.y - wl * 0.55, 26 * S);
        g.addColorStop(0, "rgba(142,24,38,.34)"); g.addColorStop(1, "rgba(142,24,38,0)");
        c.fillStyle = g; c.beginPath(); c.ellipse(m.x, m.y - wl * 0.55, 26 * S, 20 * S, 0, 0, 7); c.fill();
        c.fillStyle = "#8E1826"; c.globalAlpha = 0.85;
        c.beginPath(); c.arc(m.x, m.y - wl * 0.55, 2.2 * S, 0, 7); c.fill(); c.globalAlpha = 1;
      }
      const b = this._isoBox(c, gx, gy, w, d, h, { top: "rgba(225,240,245,.28)", left: "rgba(168,205,218,.30)", right: "rgba(148,190,205,.36)", line: "rgba(210,235,242,.75)" });
      c.strokeStyle = "rgba(210,235,242,.75)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(b.p11.x, b.p11.y); c.lineTo(b.p11.x, b.p11.y - h); c.stroke();
    };
    const pipe = (gx, gy, topH) => { // 壁が無いので配管は槽間を渡る低い連絡管に(行き先を失わない)
      const a = this._iso(gx, gy), b = this._iso(7.9, 1.6);
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2.5 * S * 0.6 + 0.8; c.lineCap = "round";
      c.beginPath(); c.moveTo(a.x, a.y - topH * S); c.lineTo(a.x, a.y - (topH + 8) * S); c.lineTo(b.x, b.y - (topH + 8) * S); c.stroke();
    };
    tank(7.6, 1.25, 0.85, 0.85, 36, tier >= 3);
    if (tier >= 2) { tank(8.75, 1.2, 0.62, 0.62, 52, false); pipe(9.05, 1.5, 52); }
    if (tier >= 4) { tank(6.55, 1.35, 0.6, 0.6, 30, false); }
  },

  // ---- ロケット(宇宙港) ----
  _labRocket(c, tier) {
    const S = this._labS() * this._labF(), F = this._labF();
    const HULL = { top: "#e6e3dc", left: "#c5c1b8", right: "#b2aea4", line: "rgba(90,86,78,.4)" };
    const gx = 9.3, gy = 4.3;
    this._labShadow(c, gx - 0.25, gy - 0.25, 1.5 * F, 1.5 * F);
    this._isoBox(c, gx - 0.25, gy - 0.25, 1.5 * F, 1.5 * F, 6 * S, { top: "#c9c5bb", left: "#a8a498", right: "#98948a", line: "rgba(90,86,78,.45)" });
    if (tier === 1) {
      this._isoBox(c, gx - 0.05, gy + 0.15, 0.5 * F, 0.5 * F, 14 * S, HULL);
      this._isoBox(c, gx + 0.62, gy + 0.5, 0.62 * F, 0.35 * F, 8 * S, HULL);
      c.fillStyle = "#C9A227"; const t = this._iso(gx + 0.45, gy - 0.02);
      c.beginPath(); c.moveTo(t.x, t.y - 3 * S); c.lineTo(t.x + 14 * S, t.y - 8 * S); c.lineTo(t.x + 2 * S, t.y - 15 * S); c.closePath(); c.fill();
      return;
    }
    const H = 118 * S;
    if (tier === 2) {
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2 * S * 0.7 + 0.6;
      const corners = [this._iso(gx + 0.14, gy + 0.14), this._iso(gx + 0.86, gy + 0.14), this._iso(gx + 0.86, gy + 0.86), this._iso(gx + 0.14, gy + 0.86)];
      for (const p of corners) { c.beginPath(); c.moveTo(p.x, p.y - 6 * S); c.lineTo(p.x, p.y - 6 * S - H * 0.72); c.stroke(); }
      for (let i = 1; i <= 3; i++) {
        const y = 6 * S + (H * 0.72) * i / 3;
        c.beginPath(); c.moveTo(corners[0].x, corners[0].y - y); c.lineTo(corners[1].x, corners[1].y - y); c.lineTo(corners[2].x, corners[2].y - y); c.lineTo(corners[3].x, corners[3].y - y); c.closePath(); c.stroke();
      }
      return;
    }
    this._isoBox(c, gx + 0.2, gy + 0.2, 0.6 * F, 0.6 * F, H, HULL);
    c.strokeStyle = "rgba(120,116,106,.35)"; c.lineWidth = 1;
    for (const yy of [H * 0.35, H * 0.7]) {
      const a = this._iso(gx + 0.2, gy + 0.8), b = this._iso(gx + 0.8, gy + 0.8);
      c.beginPath(); c.moveTo(a.x, a.y - yy - 6 * S); c.lineTo(b.x, b.y - yy - 6 * S); c.stroke();
    }
    const t = this._iso(gx + 0.5, gy + 0.5);
    if (tier >= 4) {
      c.fillStyle = "#C9A227";
      c.beginPath(); c.moveTo(t.x - 11 * S, t.y - 6 * S - H + 2 * S); c.lineTo(t.x + 11 * S, t.y - 6 * S - H + 2 * S); c.lineTo(t.x, t.y - 6 * S - H - 26 * S); c.closePath(); c.fill();
      c.fillStyle = "#b2aea4";
      const fL = this._iso(gx + 0.14, gy + 0.86), fR = this._iso(gx + 0.86, gy + 0.86);
      c.beginPath(); c.moveTo(fL.x, fL.y - 6 * S); c.lineTo(fL.x - 12 * S, fL.y + 2 * S); c.lineTo(fL.x, fL.y - 34 * S); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(fR.x, fR.y - 6 * S); c.lineTo(fR.x + 12 * S, fR.y + 2 * S); c.lineTo(fR.x, fR.y - 34 * S); c.closePath(); c.fill();
      c.fillStyle = "#9fc4d4"; c.beginPath(); c.arc(t.x, t.y - 6 * S - H * 0.78, 3.2 * S, 0, 7); c.fill();
    } else {
      c.strokeStyle = "#9aa0a5"; c.lineWidth = 2 * S * 0.7 + 0.6;
      c.beginPath(); c.moveTo(t.x - 8 * S, t.y - 6 * S - H); c.lineTo(t.x - 8 * S, t.y - 6 * S - H - 14 * S); c.moveTo(t.x + 8 * S, t.y - 6 * S - H); c.lineTo(t.x + 8 * S, t.y - 6 * S - H - 14 * S); c.stroke();
    }
  },

  // ---- 標本棚/記録(床置き什器)+自立スタンドの星図盤(旧・壁のチャートの床置き化) ----
  _labShelf(c, tier) {
    const S = this._labS() * this._labF(), F = this._labF();
    const FRAME = { top: "#cfccc4", left: "#aaa69b", right: "#9a968c", line: "rgba(90,86,78,.45)" };
    const unit = (gx, gy) => {
      this._labShadow(c, gx, gy, 0.5 * F, 1.1 * F);
      const H = 66 * S;
      this._isoBox(c, gx, gy, 0.5 * F, 1.1 * F, H, FRAME);
      for (let i = 1; i <= 3; i++) {
        const y = H * i / 3.6;
        const a = this._iso(gx + 0.5 * F, gy + 0.06), b = this._iso(gx + 0.5 * F, gy + 1.04 * F);
        c.strokeStyle = "#b8b4a9"; c.lineWidth = 1.6 * S * 0.6 + 0.5;
        c.beginPath(); c.moveTo(a.x, a.y - y); c.lineTo(b.x, b.y - y); c.stroke();
        if (tier >= 2) for (let j = 0; j < 3 + (i % 2); j++) {
          const p = this._iso(gx + 0.5 * F, gy + (0.18 + j * 0.24) * F);
          c.fillStyle = "rgba(168,205,218,.55)"; c.fillRect(p.x - 2.2 * S, p.y - y - 8 * S, 4.4 * S, 8 * S);
          c.fillStyle = "#9aa0a5"; c.fillRect(p.x - 2.2 * S, p.y - y - 9.5 * S, 4.4 * S, 1.8 * S);
        }
      }
    };
    unit(0.3, 4.6);
    if (tier >= 4) unit(0.3, 6.0);
    if (tier >= 3) { // 自立スタンドの星図盤(旧・壁チャート→床置きイーゼル。説明しない星座線)
      const gx = 0.9, gy = 6.9, bw = 1.15 * F;
      this._labShadow(c, gx, gy, bw, 0.16);
      const a = this._iso(gx, gy + 0.08), b = this._iso(gx + bw, gy + 0.08);
      c.strokeStyle = "#8a867c"; c.lineWidth = 2.2 * S * 0.6 + 0.7; // イーゼル脚
      for (const p of [a, b]) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - 26 * S); c.stroke(); }
      this._poly(c, [{ x: a.x - 2, y: a.y - 58 * S }, { x: b.x + 2, y: b.y - 58 * S }, { x: b.x + 2, y: b.y - 24 * S }, { x: a.x - 2, y: a.y - 24 * S }], "#2c3440", "rgba(0,0,0,.4)", 1);
      const w = { x: b.x - a.x, y: b.y - a.y };
      c.strokeStyle = "rgba(160,190,215,.35)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x + 6 * S, a.y - 50 * S); c.lineTo(a.x + w.x * 0.4, a.y + w.y * 0.4 - 38 * S); c.lineTo(a.x + w.x * 0.75, a.y + w.y * 0.75 - 46 * S); c.stroke();
      c.fillStyle = "#dfe8f0";
      for (const [fx, fy] of [[0.12, -48], [0.4, -36], [0.75, -44], [0.55, -30], [0.88, -34], [0.25, -27]]) {
        c.beginPath(); c.arc(a.x + w.x * fx, a.y + w.y * fx + fy * S, 1.1 * S, 0, 7); c.fill();
      }
    }
  },
});

// dev用: index.html#hqlab で直接本部を開く(#hqlab-desks等でパネル/#hqlab-fullで全設備T4表示)。本番挙動に影響なし。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full))?$/);
  if (m && UI.openHqLab) setTimeout(() => {
    if (m[1] === "full") UI._labTierOverride = { desks: 4, tank: 4, rocket: 4, shelf: 4 }; // 表示のみ・状態は変えない
    UI.openHqLab();
    if (m[1] && m[1] !== "full") UI.openLabPanel(m[1]);
  }, 60);
});
