// =============================================================
// screens/hqlab — 本部v4「組立ドック(案い・垂直)」(Ric構図承認→全展開)
// テーゼ:「本部とは、ロケットが組み上がっていく場所である」。
// 主役=建造中のロケット+ドック(ガントリー/足場/作業灯)。鉱石投資(labInvest)が進むほど
// ロケットが物理的に組み上がる(6段=CFG.dockStages写像・進捗を数字でなく実物で見せる)。
// 設備(投資端末/錬成槽/標本棚/ラック)はドック周囲で働き、供給線が設備tier(labRoomTiers)で太る=二重成長軸。
// 管制ブース窓=旧監視スクリーンの縮小残置(生中継=方式1流用・走査線)。宇宙港=ドックへ昇格統合(ロケット本体クリック=旧宇宙港パネル)。
// v3管制室(スクリーン65%+席列+シルエット)はRic裁定で廃棄(記録=git+test-hqctrl-cut.html)。
// 表示層のみ=パネル(hq.js)/投資ロジック/セーブ/飼育槽側コード非接触。調整値=CFG(dockStages/dock*/ctrl*)。
// =============================================================

// パレット(1箇所集約。v3の暗部/計器を継承+ドック系)
const DOCKPAL = {
  room: "#0d1116", wallDeep: "#0a0e13", floor: "#0b0f15", pad: "#11161d",
  frame: "#2a3340", frameDim: "#1d2530", hull: "#3a4450", hullHi: "#5a6a78", hullLit: "#6d8090",
  scaffold: "#242c36", gantry: "#1a222c", gantryHi: "#2e3844",
  crimson: "#a11c2c", crimsonHi: "#d8404e", amber: "#c08d1d", amberHi: "#ecc35a",
  deskGlow: "#27424f", deskGlowHi: "#7fb9cc", led: "#3f8a55",
  spark: "#ffd88a", workCone: "rgba(216,160,60,.10)",
  mark: "rgba(190,214,235,.16)", // 次段階の気配(点線マーキング=説明しない)
  bezel: "#1a2028", bezelHi: "#2a3340", screenOff: "#0a0d12",
  label: "rgba(205,216,228,.92)", labelBg: "rgba(10,13,18,.85)",
};
// 設計空間(1280×720固定・表示はfitスケール)
const DOCKW = {
  W: 1280, H: 720,
  RK: { x: 950, w: 130, baseY: 660, h: 520 },          // ロケット(垂直・右寄り)
  gantry: { x: 770, y: 120, h: 540, armW: 320 },
  booth: { x: 60, y: 70 },                              // 窓サイズはCFG.dockBoothW/H
  eq: { shelf: { x: 70, y: 300, w: 120, h: 150 }, tank: { x: 230, y: 290, w: 76, h: 170 }, console: { x: 380, y: 600, w: 210, h: 96 }, rack: { x: 640, y: 590, w: 90, h: 106 } },
  // 当たり判定(設計座標・パネル機能は完全不変。rocket=旧宇宙港パネルへの昇格統合)
  zones: {
    desks: [{ x: 370, y: 588, w: 230, h: 118 }, { x: 630, y: 578, w: 110, h: 128 }], // 投資端末+ラック
    tank: [{ x: 220, y: 280, w: 96, h: 190 }],
    shelf: [{ x: 60, y: 290, w: 140, h: 170 }],
    rocket: [{ x: 850, y: 110, w: 200, h: 564 }],
  },
  names: { desks: "投資端末", tank: "錬成槽", shelf: "標本棚", rocket: "宇宙港ドック" },
};

// ---- 描画部品(モジュール内・知識はDOCKPALのみ参照) ----
function dkGirder(c, x0, y0, x1, y1, col) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function dkSpark(c, x, y, n) {
  c.fillStyle = DOCKPAL.spark;
  const pts = [[0, 0], [6, -4], [-5, -7], [3, -11], [-8, 2], [9, 3], [-2, -14], [7, -9]];
  for (let i = 0; i < n; i++) { const p = pts[i % pts.length]; c.globalAlpha = 0.9 - i * 0.09; c.fillRect(x + p[0], y + p[1], 2, 2); }
  c.globalAlpha = 0.5; c.fillStyle = "#fff2cc"; c.fillRect(x - 1, y - 1, 3, 3); c.globalAlpha = 1;
}
function dkWorkLight(c, x, y, dir, len, amt) { // 作業灯(琥珀コーン)。amt=CFG.dockWorkLight×節目フラッシュ
  c.globalAlpha = Math.min(1, amt);
  c.fillStyle = DOCKPAL.workCone;
  for (let i = 0; i < Math.max(1, Math.round(amt)); i++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dir * len * 0.55, y + len); c.lineTo(x - dir * len * 0.35, y + len); c.closePath(); c.fill(); }
  c.fillStyle = DOCKPAL.amberHi; c.fillRect(x - 2, y - 2, 5, 4);
  c.globalAlpha = 1;
}
function dkPipe(c, pts, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
  c.fillStyle = col;
  for (const [jx, jy] of pts.slice(1, -1)) c.fillRect(jx - w * 0.9, jy - w * 0.9, w * 1.8, w * 1.8);
}

Object.assign(UI, {
  // ---------------- ページ制御(公開API名は維持=QA/コア契約不変) ----------------
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    this.renderHqLab();
    this._startLabVideo();
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
      const toDesign = (e) => { const r = cv.getBoundingClientRect(), b = this._labBlit || { k: 1, bx: 0, by: 0 }; return { x: ((e.clientX - r.left) * cv.width / r.width - b.bx) / b.k, y: ((e.clientY - r.top) * cv.height / r.height - b.by) / b.k }; };
      cv.addEventListener("click", (e) => { const p = toDesign(e); const z = this._hqlabZoneAt(p.x, p.y); if (z) this.openLabPanel(z); });
      cv.addEventListener("mousemove", (e) => {
        const p = toDesign(e); const z = this._hqlabZoneAt(p.x, p.y);
        cv.style.cursor = z ? "pointer" : "default";
        if (z !== this._dockHover) { this._dockHover = z; this._dockComposite(); } // ホバー時のみ名称(v3方針継承)
      });
      cv.addEventListener("mouseleave", () => { if (this._dockHover) { this._dockHover = null; this._dockComposite(); } });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); });
  },

  // ---------------- 成長軸(表示のみ・写像のみ=ロジック/セーブ非接触) ----------------
  // 設備側3段(既存labRoomTiers)
  labRoomTier() {
    if (this._labRoomTierOverride) return this._labRoomTierOverride;
    const inv = Game.labInvestLv("desks");
    const th = CFG.labRoomTiers || [1, 2];
    return inv >= th[1] ? 3 : inv >= th[0] ? 2 : 1;
  },
  // ロケット側6段(CFG.dockStages=labInvest進行度のしきい値6つ。降順走査で現段階)
  dockRocketStage() {
    if (this._dockStageOverride) return this._dockStageOverride;
    const inv = Game.labInvestLv("desks");
    const th = CFG.dockStages || [0, 1, 1, 2, 2, 3];
    let st = 1;
    for (let i = 0; i < th.length; i++) if (inv >= th[i]) st = i + 1;
    return Math.max(1, Math.min(6, st));
  },
  labTiers() { // 既存互換(update()の変化検知・設備別の派生tier)。dock=建造段階を含めて節目で再描画
    if (this._labTierOverride) return this._labTierOverride;
    const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
    const decoded = (typeof RECIPES !== "undefined") ? RECIPES.filter((r) => Game.recipeDecoded(r)).length : 0;
    const rk = Game.ensureRocket();
    return {
      desks: Math.min(4, 1 + Game.labInvestLv("desks")),
      tank: tierOf(decoded, CFG.labTankTiers),
      rocket: rk.done ? 4 : rk.stage >= 2 ? 3 : (rk.stage >= 1 || rk.invested > 0) ? 2 : 1,
      shelf: tierOf(Object.keys(Game.state.dex || {}).length, CFG.labShelfTiers),
      room: this.labRoomTier(),
      dock: this.dockRocketStage(),
    };
  },

  // ---------------- 当たり判定(設計座標) ----------------
  _hqlabZones() {
    return Object.keys(DOCKW.zones).map((key) => ({ key, rects: DOCKW.zones[key].map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h })) }));
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 静的レイヤ(ドック+ロケット+設備+供給線) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    const k = Math.min(W / DOCKW.W, H / DOCKW.H);
    this._labBlit = { k, bx: (W - DOCKW.W * k) / 2, by: (H - DOCKW.H * k) / 2 };
    // 節目演出: 建造段階が切り替わったら作業灯が一斉に瞬く(通知なし・reduced-motionは無し)
    const st = this.dockRocketStage();
    if (this._dockLastStage != null && st !== this._dockLastStage && !((typeof Motion !== "undefined") && Motion.reduced)) {
      this._dockFlashT = performance.now() + (CFG.dockFlashSec || 1.2) * 1000;
    }
    this._dockLastStage = st;
    if (!this._dockRoom) { this._dockRoom = document.createElement("canvas"); this._dockRoom.width = DOCKW.W; this._dockRoom.height = DOCKW.H; }
    this._dockRenderRoom(this._dockRoom.getContext("2d"), st, this.labRoomTier());
    this._dockComposite();
  },

  _dockRenderRoom(c, stage, tier) {
    const P = DOCKPAL, W = DOCKW.W, H = DOCKW.H, RK = DOCKW.RK, G = DOCKW.gantry;
    c.clearRect(0, 0, W, H);
    c.fillStyle = P.room; c.fillRect(0, 0, W, H);
    c.fillStyle = P.wallDeep; c.fillRect(0, 0, W, 620);
    c.fillStyle = P.floor; c.fillRect(0, 620, W, 100);
    c.strokeStyle = "#12181f"; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 640 + i * 12); c.lineTo(W, 638 + i * 12); c.stroke(); }
    // --- ガントリークレーン(塔+上腕。吊り荷=次に組む部位、完成後は撤去) ---
    c.fillStyle = P.gantry; c.fillRect(G.x, G.y, 26, G.h);
    c.fillStyle = P.gantryHi; c.fillRect(G.x, G.y, 4, G.h);
    for (let i = 0; i < 9; i++) dkGirder(c, G.x + 2, 150 + i * 56, G.x + 24, 178 + i * 56, P.frameDim);
    c.fillStyle = P.gantry; c.fillRect(G.x, G.y - 10, G.armW, 14);
    c.fillStyle = P.gantryHi; c.fillRect(G.x, G.y - 10, G.armW, 3);
    if (stage < 6) { // 吊り荷(建造中のみ)
      dkGirder(c, 1000, G.y + 4, 1000, 208, P.frameDim);
      if (stage < 5) { c.fillStyle = P.hull; c.fillRect(970, 208, 60, 26); c.fillStyle = P.hullHi; c.fillRect(970, 208, 5, 26); }
      else { c.fillStyle = P.crimson; c.fillRect(976, 208, 48, 18); } // S5=塗装リフト(深紅パネル)
    }
    // --- 足場(建造中の作業部位の高さに追随: S3=エンジン部/S4=中部/S5=上部) ---
    if (stage < 6) {
      const scafY = stage <= 3 ? 560 : stage === 4 ? 380 : 240;
      for (const [px2, py] of [[RK.x - 92, scafY], [RK.x - 92, scafY + 50], [RK.x + 108 - 60, scafY], [RK.x + 108 - 60, scafY + 50]]) {
        c.fillStyle = P.scaffold; c.fillRect(px2, py, 60, 6);
        dkGirder(c, px2 + 4, py + 6, px2 + 4, py + 40, P.frameDim); dkGirder(c, px2 + 54, py + 6, px2 + 54, py + 40, P.frameDim);
      }
    }
    // --- ロケット本体(6段) ---
    this._dockRocket(c, RK.x, RK.baseY, RK.w, RK.h, stage);
    if (stage === 3) { dkSpark(c, RK.x - 40, 630, 8); dkSpark(c, RK.x + 46, 604, 6); }
    if (stage === 4) { dkSpark(c, RK.x - 44, 420, 6); }
    if (stage === 5) { dkSpark(c, RK.x + 44, 250, 5); }
    // --- 設備(採用構図の配置・T2意匠を基準にtierで灯りが増える) ---
    this._dockBoothFrame(c);
    this._dockShelf(c, DOCKW.eq.shelf, tier);
    this._dockTank(c, DOCKW.eq.tank, tier);
    this._dockConsole(c, DOCKW.eq.console, tier);
    this._dockRack(c, DOCKW.eq.rack, tier);
    // --- 供給線(設備→ロケット基部。太さ/本数=設備tier連動=二重成長軸が1画面で読める) ---
    const sw = (CFG.dockSupplyW || [1.5, 3, 5])[tier - 1] || 3;
    dkPipe(c, [[306, 380], [340, 380], [340, 646], [880, 646]], sw, "#2a3340");           // 錬成槽→
    dkPipe(c, [[190, 430], [210, 470], [210, 664], [878, 664]], sw * 0.7, "#242c36");     // 標本棚→
    dkPipe(c, [[590, 668], [880, 668]], sw, "#2a3340");                                   // 投資端末→
    dkPipe(c, [[730, 640], [820, 640], [880, 655]], sw * 0.7, "#242c36");                 // ラック→
    if (tier >= 3) { // T3=供給線が増える(第2系統)
      dkPipe(c, [[306, 340], [356, 340], [356, 630], [876, 630]], sw * 0.6, "#232d38");
      dkPipe(c, [[590, 690], [900, 690], [940, 672]], sw * 0.6, "#232d38");
    }
    c.fillStyle = P.amberHi;
    const pulses = tier >= 3 ? [[520, 668], [700, 646], [820, 664], [420, 630], [760, 690]] : tier >= 2 ? [[520, 668], [700, 646], [820, 664]] : [[600, 668]];
    for (const [dx2, dy2] of pulses) c.fillRect(dx2, dy2 - 1, 4, 3);
  },

  // ロケット(6段=ラフ準拠: S1骨組み/S2下部船体/S3エンジン組付/S4上部船体+配管/S5外装+塗装/S6発射準備)
  _dockRocket(c, cx, baseY, w, totalH, stage) {
    const P = DOCKPAL;
    const secH = totalH / 5;
    const secY = (i) => baseY - secH * i;
    c.fillStyle = P.pad; c.fillRect(cx - w * 0.9, baseY, w * 1.8, 14);
    c.fillStyle = P.frameDim; c.fillRect(cx - w * 0.9, baseY, w * 1.8, 3);
    const hullRect = (yTop, hh, lit) => {
      c.fillStyle = lit ? P.hullLit : P.hull; c.fillRect(cx - w / 2, yTop, w, hh);
      c.fillStyle = P.hullHi; c.fillRect(cx - w / 2, yTop, 6, hh);
      c.fillStyle = "#242c36"; c.fillRect(cx + w / 2 - 5, yTop, 5, hh);
      c.strokeStyle = "#1a222c"; c.lineWidth = 1;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(cx - w / 2, yTop + hh * i / 3); c.lineTo(cx + w / 2, yTop + hh * i / 3); c.stroke(); }
    };
    const skeleton = (yTop, hh, alpha) => {
      c.globalAlpha = alpha != null ? alpha : 1;
      c.strokeStyle = P.frame; c.lineWidth = 2;
      c.strokeRect(cx - w / 2, yTop, w, hh);
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(cx - w / 2, yTop + hh * i / 3); c.lineTo(cx + w / 2, yTop + hh * i / 3); c.stroke(); }
      dkGirder(c, cx - w / 2, yTop, cx + w / 2, yTop + hh, P.frame);
      dkGirder(c, cx + w / 2, yTop, cx - w / 2, yTop + hh, P.frame);
      c.globalAlpha = 1;
    };
    if (stage >= 2) hullRect(secY(2), secH, false); else skeleton(secY(2), secH);
    if (stage >= 4) hullRect(secY(3), secH, false); else skeleton(secY(3), secH, stage >= 3 ? 1 : 0.75);
    if (stage >= 4) hullRect(secY(4), secH, false); else skeleton(secY(4), secH, stage >= 3 ? 0.75 : 0.4);
    if (stage < 2) skeleton(secY(1), secH, 1); // S1=基礎骨組み
    // エンジン(S3+で実体)
    for (const ex of [-w * 0.28, 0, w * 0.28]) {
      if (stage >= 3) {
        c.fillStyle = "#242c36"; c.beginPath(); c.moveTo(cx + ex - 10, baseY); c.lineTo(cx + ex - 5, baseY - 20); c.lineTo(cx + ex + 5, baseY - 20); c.lineTo(cx + ex + 10, baseY); c.closePath(); c.fill();
        c.fillStyle = P.hullHi; c.fillRect(cx + ex - 5, baseY - 20, 3, 18);
      } else { c.strokeStyle = P.frameDim; c.lineWidth = 1.4; c.strokeRect(cx + ex - 9, baseY - 20, 18, 20); }
    }
    // ノーズ(S5+で実体)
    const noseTopY = secY(4) - secH * 0.9;
    if (stage >= 5) {
      c.fillStyle = P.hullLit; c.beginPath();
      c.moveTo(cx - w / 2, secY(4)); c.quadraticCurveTo(cx, noseTopY, cx + w / 2, secY(4)); c.closePath(); c.fill();
      c.fillStyle = P.amberHi; c.fillRect(cx - 4, secY(4) - secH * 0.5, 8, 10);
    } else {
      c.globalAlpha = 0.35; c.strokeStyle = P.frame; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - w / 2, secY(4)); c.quadraticCurveTo(cx, noseTopY, cx + w / 2, secY(4)); c.stroke();
      c.globalAlpha = 1;
    }
    if (stage === 4) { // 配管敷設
      c.strokeStyle = P.deskGlowHi; c.globalAlpha = 0.5; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(cx - w / 2 + 8, secY(4)); c.lineTo(cx - w / 2 + 8, secY(2)); c.stroke(); c.globalAlpha = 1;
    }
    if (stage >= 5) { // 外装+塗装(深紅の帯=コロニーの紋)
      c.fillStyle = P.crimson; c.fillRect(cx - w / 2, secY(3) - 8, w, 8);
      c.fillStyle = P.crimsonHi; c.fillRect(cx - w / 2, secY(3) - 8, w, 2);
    }
    if (stage >= 6) { // 発射準備(全灯+蒸気)
      for (const ly of [secY(2), secY(3), secY(4)]) { c.fillStyle = P.amberHi; c.fillRect(cx - w / 2 - 4, ly - 3, 3, 3); c.fillRect(cx + w / 2 + 1, ly - 3, 3, 3); }
      c.globalAlpha = 0.18; c.fillStyle = "#cfe0ea"; c.beginPath(); c.arc(cx - w * 0.7, baseY - 6, 18, 0, Math.PI * 2); c.arc(cx + w * 0.75, baseY - 10, 14, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    }
    // 次段階の気配(点線マーキング・薄く)
    if (stage < 5) {
      c.strokeStyle = P.mark; c.setLineDash([5, 5]); c.lineWidth = 1.5;
      if (stage < 2) c.strokeRect(cx - w / 2, secY(2), w, secH);
      else if (stage < 4) c.strokeRect(cx - w / 2, secY(4), w, secH);
      else { c.beginPath(); c.moveTo(cx - w / 2, secY(4)); c.quadraticCurveTo(cx, noseTopY, cx + w / 2, secY(4)); c.stroke(); }
      c.setLineDash([]);
    }
  },

  // ---- 設備(意匠はtierで灯りが増える。zones/パネルは不変) ----
  _dockBoothFrame(c) {
    const P = DOCKPAL, B = DOCKW.booth, bw = CFG.dockBoothW || 240, bh = CFG.dockBoothH || 130;
    c.fillStyle = P.bezel; c.fillRect(B.x - 6, B.y - 6, bw + 12, bh + 12);
    c.fillStyle = P.bezelHi; c.fillRect(B.x - 6, B.y - 6, bw + 12, 2);
    c.fillStyle = P.screenOff; c.fillRect(B.x, B.y, bw, bh);
    c.fillStyle = "#10151c"; c.fillRect(B.x - 6, B.y + bh + 12, bw + 12, 24); // ブース台座
    c.fillStyle = P.amberHi; c.fillRect(B.x + 4, B.y + bh + 18, 4, 4);
  },
  _dockShelf(c, R, tier) {
    const P = DOCKPAL;
    c.fillStyle = "#141a22"; c.fillRect(R.x, R.y, R.w, R.h);
    const lit = tier >= 2 ? 1 : 0.45;
    for (let s = 0; s < 3; s++) {
      const sy = R.y + 6 + s * (R.h - 12) / 3;
      c.globalAlpha = 0.5 * lit; c.fillStyle = P.deskGlow; c.fillRect(R.x + 4, sy, R.w - 8, (R.h - 12) / 3 - 5); c.globalAlpha = 1;
      c.fillStyle = "#060809";
      for (let j = 0; j < 3; j++) c.fillRect(R.x + 8 + j * (R.w - 16) / 3, sy + 4, (R.w - 16) / 5, (R.h - 12) / 3 - 13);
    }
  },
  _dockTank(c, R, tier) {
    const P = DOCKPAL;
    c.fillStyle = "#141a22"; c.fillRect(R.x, R.y, R.w, R.h);
    const lit = tier >= 2 ? 1 : 0.5;
    const grad = c.createLinearGradient(0, R.y + 8, 0, R.y + R.h - 8);
    grad.addColorStop(0, P.crimsonHi); grad.addColorStop(0.4, P.crimson); grad.addColorStop(1, "#3a0b13");
    c.globalAlpha = 0.85 * lit; c.fillStyle = grad; c.fillRect(R.x + 7, R.y + 8, R.w - 14, R.h - 16); c.globalAlpha = 1;
    c.fillStyle = "rgba(220,238,244,.5)"; c.fillRect(R.x + 9, R.y + 10, 2, R.h - 20);
    c.globalAlpha = 0.25 * lit; c.fillStyle = P.crimson; c.fillRect(R.x - 8, R.y + 20, 8, R.h - 40); c.globalAlpha = 1;
  },
  _dockConsole(c, R, tier) {
    const P = DOCKPAL;
    c.fillStyle = "#10151c"; c.beginPath();
    c.moveTo(R.x, R.y + R.h); c.quadraticCurveTo(R.x + R.w / 2, R.y - 12, R.x + R.w, R.y + R.h); c.closePath(); c.fill();
    const wx = R.x + R.w / 2 - 34, wy = R.y + R.h - 40;
    c.fillStyle = "#160a0e"; c.fillRect(wx, wy, 68, 20);
    c.strokeStyle = P.crimsonHi; c.lineWidth = 1.4; c.beginPath();
    for (let i = 0; i <= 16; i++) { const yy = wy + 10 + ((i % 4 === 1) ? -4 : (i % 4 === 3) ? 4 : 0); i ? c.lineTo(wx + 3 + i * 3.9, yy) : c.moveTo(wx + 3, yy); }
    c.stroke();
    c.fillStyle = P.deskGlow; c.fillRect(R.x + 10, R.y + R.h - 36, 26, 10); c.fillRect(R.x + R.w - 36, R.y + R.h - 36, 26, 10);
    c.fillStyle = tier >= 2 ? P.amberHi : P.amber; c.fillRect(R.x + R.w - 14, R.y + R.h - 16, 4, 4);
  },
  _dockRack(c, R, tier) {
    const P = DOCKPAL;
    c.fillStyle = "#10151c"; c.fillRect(R.x, R.y, R.w, R.h);
    for (let i = 0; i < 4; i++) {
      const uy = R.y + 6 + i * (R.h - 10) / 4;
      c.fillStyle = "#141a22"; c.fillRect(R.x + 4, uy, R.w - 8, (R.h - 10) / 4 - 4);
      const lit = tier >= 2 ? 3 : 1;
      for (let d = 0; d < 3; d++) { c.fillStyle = d < lit ? (d === 1 ? P.amberHi : P.led) : "#1a222b"; c.fillRect(R.x + R.w - 12 - d * 6, uy + 3, 3, 3); }
    }
  },

  // ---------------- 生中継(ブース窓=方式1流用・半解像度+走査線)+合成 ----------------
  _startLabVideo() {
    if (this._labVidOn) return;
    this._labVidOn = true;
    this._labVidLast = 0;
    const step = () => {
      if (!this.hqLabOpen()) { this._labVidOn = false; return; }
      const now = performance.now();
      if (now - this._labVidLast >= 1000 / Math.max(1, CFG.ctrlFps || 12)) {
        this._labVidLast = now;
        this._drawLabScreenVideo(now / 1000);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  _drawLabScreenVideo(tSec) {
    const src = document.getElementById("game");
    const bw = CFG.dockBoothW || 240, bh = CFG.dockBoothH || 130;
    if (src && src.width && src.height) {
      if (!this._dockVid) { this._dockVid = document.createElement("canvas"); }
      const vid = this._dockVid, vw = Math.round(bw / 2), vh = Math.round(bh / 2);
      if (vid.width !== vw || vid.height !== vh) { vid.width = vw; vid.height = vh; }
      const vc = vid.getContext("2d");
      vc.imageSmoothingEnabled = true;
      const da = bw / bh;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (sw / sh > da) { sw = Math.round(sh * da); sx = (src.width - sw) / 2; }
      else { sh = Math.round(sw / da); sy = (src.height - sh) / 2; }
      try { vc.filter = `blur(${((CFG.ctrlBlur || 2.5) / 2).toFixed(2)}px)`; } catch (e) {}
      vc.drawImage(src, sx, sy, sw, sh, 0, 0, vw, vh);
      try { vc.filter = "none"; } catch (e) {}
      if ((CFG.ctrlScanAlpha || 0) > 0) {
        vc.fillStyle = `rgba(8,10,12,${CFG.ctrlScanAlpha})`;
        const reduced = (typeof Motion !== "undefined") && Motion.reduced;
        const drift = reduced ? 0 : Math.floor(tSec * 8) % 2;
        for (let yy = drift; yy < vh; yy += 2) vc.fillRect(0, yy, vw, 1);
      }
    }
    this._dockComposite(tSec);
  },
  _dockComposite(tSec) {
    const cv = document.getElementById("hqlab-canvas");
    if (!cv || !this._dockRoom || !this._labBlit) return;
    const g = cv.getContext("2d"), b = this._labBlit, P = DOCKPAL, B = DOCKW.booth;
    const bw = CFG.dockBoothW || 240, bh = CFG.dockBoothH || 130;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = P.room; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(b.k, 0, 0, b.k, b.bx, b.by);
    g.imageSmoothingEnabled = true;
    g.drawImage(this._dockRoom, 0, 0);
    // ブース窓の生中継
    if (this._dockVid) g.drawImage(this._dockVid, 0, 0, this._dockVid.width, this._dockVid.height, B.x, B.y, bw, bh);
    // 作業灯(節目フラッシュ=段階が切り替わった直後だけ一斉に瞬く。通知なし)
    let amt = CFG.dockWorkLight != null ? CFG.dockWorkLight : 1;
    if (this._dockFlashT && performance.now() < this._dockFlashT) {
      const ph = (this._dockFlashT - performance.now()) / ((CFG.dockFlashSec || 1.2) * 1000);
      amt *= 1 + 1.6 * Math.abs(Math.sin(ph * Math.PI * 4));
    }
    const st = this.dockRocketStage();
    const scafY = st <= 3 ? 540 : st === 4 ? 360 : 220;
    if (st < 6) { dkWorkLight(g, DOCKW.RK.x - 78, scafY - 20, 1, 90, amt); dkWorkLight(g, DOCKW.RK.x + 92, scafY - 20, -1, 90, amt); }
    else { dkWorkLight(g, DOCKW.RK.x - 78, 540, 1, 90, amt); dkWorkLight(g, DOCKW.RK.x + 92, 540, -1, 90, amt); }
    // ホバー時のみ名称(浮遊ラベル全廃=v3方針継承)
    if (this._dockHover && DOCKW.names[this._dockHover]) {
      const R = DOCKW.zones[this._dockHover][0];
      const name = DOCKW.names[this._dockHover];
      g.font = "600 15px system-ui, sans-serif";
      const tw = g.measureText(name).width + 16;
      const lx = Math.min(Math.max(R.x + R.w / 2 - tw / 2, 6), DOCKW.W - tw - 6);
      const ly = R.y - 26 > 8 ? R.y - 26 : R.y + R.h + 8;
      g.fillStyle = P.labelBg; g.fillRect(lx, ly, tw, 22);
      g.fillStyle = P.label; g.fillText(name, lx + 8, ly + 16);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    void tSec;
  },
});

// dev用: #hqlab で本部を開く(#hqlab-desks等でパネル/#hqlab-t1|t2|t3=設備tier/#hqlab-s1..s6=建造段階の表示のみ上書き/#hqlab-fullは互換=T3)。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full|t1|t2|t3|s[1-6]))?$/);
  if (m && UI.openHqLab) setTimeout(() => {
    if (m[1] === "full" || m[1] === "t3") UI._labRoomTierOverride = 3;
    else if (m[1] === "t2") UI._labRoomTierOverride = 2;
    else if (m[1] === "t1") UI._labRoomTierOverride = 1;
    else if (m[1] && /^s[1-6]$/.test(m[1])) { UI._dockStageOverride = parseInt(m[1].slice(1), 10); UI._labRoomTierOverride = 2; }
    UI.openHqLab();
    if (m[1] && !/^t[123]$|^full$|^s[1-6]$/.test(m[1])) UI.openLabPanel(m[1]);
  }, 60);
});
