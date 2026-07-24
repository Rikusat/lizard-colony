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
  // §5yyy 質感引き上げ(線から面へ/夜間工事の熱)
  hullShadow: "#2b333e", hullSeam: "#232b35", hullEdge: "#8fa5b8",
  duct: "#12181f", ductHi: "#1c242e",
  hazard: "#8a6d20", hazardDim: "#3a3320",
  crew: "#05070a", crewRim: "rgba(216,200,150,.5)",
  crate: "#1a2028", crateHi: "#2a3340", panelMat: "#26303c",
  poolWarm: "216,170,80", // 光だまり(rgbの素・alphaは計算)
  steam: "rgba(200,214,224,.10)",
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
// §5yyy: 面+明暗3段+エッジハイライト(「線から面へ」の基本部品)
function dkFace(c, x, y, w, h, base, light, dark, edge) {
  c.fillStyle = base; c.fillRect(x, y, w, h);
  c.fillStyle = light; c.fillRect(x, y, Math.max(2, w * 0.14), h);       // 左=受光帯
  c.fillStyle = dark; c.fillRect(x + w - Math.max(2, w * 0.16), y, Math.max(2, w * 0.16), h); // 右=陰帯
  if (edge) { c.fillStyle = edge; c.fillRect(x, y, w, 1.5); }             // 上端エッジハイライト
}
// 作業員シルエット(v3の逆光影を縮小流用・顔なし・スケールの物差し)
function dkCrewSil(c, x, baseY, h, rimA) {
  const hw = h * 0.32, hr = h * 0.19;
  c.fillStyle = DOCKPAL.crew;
  c.beginPath();
  c.moveTo(x - hw, baseY);
  c.quadraticCurveTo(x - hw, baseY - h * 0.72, x - hw * 0.35, baseY - h * 0.72);
  c.lineTo(x + hw * 0.35, baseY - h * 0.72);
  c.quadraticCurveTo(x + hw, baseY - h * 0.72, x + hw, baseY);
  c.closePath(); c.fill();
  c.beginPath(); c.arc(x, baseY - h * 0.72 - hr * 0.7, hr, 0, Math.PI * 2); c.fill();
  if (rimA > 0.02) { // 作業灯側のリム
    c.strokeStyle = `rgba(216,200,150,${rimA.toFixed(3)})`; c.lineWidth = 1.2;
    c.beginPath(); c.arc(x, baseY - h * 0.72 - hr * 0.7, hr, Math.PI * 1.2, Math.PI * 1.8); c.stroke();
  }
}
// 資材: 鉱石木箱(面で描く)
function dkCrate(c, x, y, w, h) {
  dkFace(c, x, y, w, h, DOCKPAL.crate, DOCKPAL.crateHi, "#12181f", "#3a4552");
  c.fillStyle = "#12181f"; c.fillRect(x + 2, y + h * 0.45, w - 4, 1.5);
  c.fillStyle = DOCKPAL.amber; c.globalAlpha = 0.5; c.fillRect(x + w * 0.3, y + 3, w * 0.18, 3); c.globalAlpha = 1;
}
// 資材: パネル材の山(立てかけ)
function dkPanels(c, x, baseY, n) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = i % 2 ? DOCKPAL.panelMat : DOCKPAL.hull;
    c.beginPath();
    c.moveTo(x + i * 5, baseY); c.lineTo(x + 14 + i * 5, baseY - 40 - i * 2); c.lineTo(x + 20 + i * 5, baseY - 40 - i * 2); c.lineTo(x + 8 + i * 5, baseY);
    c.closePath(); c.fill();
  }
  c.fillStyle = DOCKPAL.hullEdge; c.globalAlpha = 0.4; c.fillRect(x + (n - 1) * 5 + 14, baseY - 40 - (n - 1) * 2, 6, 1.5); c.globalAlpha = 1;
}
// 小型作業車両(フォークリフト風・1台)
function dkVehicle(c, x, baseY) {
  dkFace(c, x, baseY - 22, 44, 22, "#1c242e", "#2a3644", "#10151c", "#3a4a5a");
  c.fillStyle = "#10151c"; c.fillRect(x + 30, baseY - 34, 12, 12);       // キャビン
  c.fillStyle = DOCKPAL.deskGlow; c.fillRect(x + 32, baseY - 32, 8, 6);  // 窓
  c.fillStyle = "#05070a";
  c.beginPath(); c.arc(x + 10, baseY, 6, 0, Math.PI * 2); c.arc(x + 34, baseY, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#242c36"; c.fillRect(x - 8, baseY - 16, 8, 3); c.fillRect(x - 8, baseY - 8, 8, 3); // フォーク
  c.fillStyle = DOCKPAL.amberHi; c.fillRect(x + 40, baseY - 20, 3, 3);   // 回転灯(点滅はcomposite)
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
    const amb = CFG.dockAmbient != null ? CFG.dockAmbient : 0.14;
    const dens = CFG.dockPropDensity != null ? CFG.dockPropDensity : 1;
    c.clearRect(0, 0, W, H);
    c.fillStyle = P.room; c.fillRect(0, 0, W, H);
    // --- 奥景: 壁+ダクト(暗・§5yyy奥行き3層の1層目) ---
    c.fillStyle = P.wallDeep; c.fillRect(0, 0, W, 620);
    for (const [dy, dh] of [[86, 14], [170, 10]]) { // 横走りダクト
      c.fillStyle = P.duct; c.fillRect(0, dy, W, dh);
      c.fillStyle = P.ductHi; c.fillRect(0, dy, W, 2);
      for (let x = 40; x < W; x += 120) { c.fillStyle = "#0a0e13"; c.fillRect(x, dy - 2, 6, dh + 4); }
    }
    c.globalAlpha = 0.55; // 縦ダクト(奥・中央の空白帯のみ=雑然させない)
    for (const dx of [470, 640]) {
      c.fillStyle = P.duct; c.fillRect(dx, 60, 12, 540);
      c.fillStyle = P.ductHi; c.fillRect(dx, 60, 2, 540);
    }
    c.globalAlpha = 1;
    // --- 床(面として成立させる: 明度帯+マーキングライン+ハザード) ---
    c.fillStyle = P.floor; c.fillRect(0, 620, W, 100);
    const fg = c.createLinearGradient(0, 620, 0, H);
    fg.addColorStop(0, "rgba(90,106,120,.10)"); fg.addColorStop(1, "rgba(90,106,120,.02)");
    c.fillStyle = fg; c.fillRect(0, 620, W, 100);
    c.strokeStyle = "#12181f"; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 640 + i * 12); c.lineTo(W, 638 + i * 12); c.stroke(); }
    c.strokeStyle = "rgba(190,214,235,.10)"; c.lineWidth = 2; // 動線マーキング
    c.beginPath(); c.moveTo(320, 700); c.lineTo(860, 682); c.stroke();
    c.setLineDash([10, 8]); c.beginPath(); c.moveTo(340, 712); c.lineTo(880, 694); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 14; i++) { // 発射パッド外周のハザード縞
      c.fillStyle = i % 2 ? P.hazard : P.hazardDim; c.globalAlpha = 0.4;
      c.fillRect(RK.x - w2(RK) - 26 + i * ((w2(RK) * 2 + 52) / 14), 676, (w2(RK) * 2 + 52) / 14 - 2, 5);
      c.globalAlpha = 1;
    }
    function w2(rk) { return rk.w * 0.9; }
    // --- ガントリークレーン(面で描く: 塔=受光/陰帯・腕=厚み) ---
    dkFace(c, G.x, G.y, 26, G.h, P.gantry, P.gantryHi, "#10151c", "#3a4a5a");
    for (let i = 0; i < 9; i++) { // 筋交いは暗色の面取り三角
      c.fillStyle = "#10151c";
      c.beginPath(); c.moveTo(G.x + 4, 150 + i * 56); c.lineTo(G.x + 22, 178 + i * 56); c.lineTo(G.x + 22, 172 + i * 56); c.lineTo(G.x + 8, 150 + i * 56); c.closePath(); c.fill();
    }
    dkFace(c, G.x, G.y - 12, G.armW, 16, P.gantry, P.gantryHi, "#10151c", "#3a4a5a");
    for (let x = G.x + 20; x < G.x + G.armW - 10; x += 34) { c.fillStyle = "#10151c"; c.fillRect(x, G.y - 9, 3, 10); } // 腕のリブ
    if (stage < 6) { // 吊り荷(建造中のみ)
      c.strokeStyle = "#39434f"; c.lineWidth = 2; c.beginPath(); c.moveTo(1000, G.y + 4); c.lineTo(1000, 208); c.stroke();
      if (stage < 5) dkFace(c, 970, 208, 60, 26, P.hull, P.hullHi, P.hullShadow, P.hullEdge);
      else dkFace(c, 976, 208, 48, 18, P.crimson, P.crimsonHi, "#5c1018", "#e88894"); // S5=塗装リフト
    }
    // --- 足場(厚みのある板+支柱の面) ---
    if (stage < 6) {
      const scafY = stage <= 3 ? 560 : stage === 4 ? 380 : 240;
      for (const [px2, py] of [[RK.x - 92, scafY], [RK.x - 92, scafY + 50], [RK.x + 108 - 60, scafY], [RK.x + 108 - 60, scafY + 50]]) {
        dkFace(c, px2, py, 60, 8, P.scaffold, "#31404e", "#161d25", "#4a5c6c");
        c.fillStyle = "#1a222c"; c.fillRect(px2 + 3, py + 8, 3.5, 40); c.fillRect(px2 + 53, py + 8, 3.5, 40);
        c.fillStyle = "#39434f"; c.fillRect(px2 + 3, py + 8, 1.2, 40); c.fillRect(px2 + 53, py + 8, 1.2, 40);
      }
    }
    // --- スケールの物差し: 資材+車両(密度=CFG.dockPropDensity・段階で増減は全展開で調整) ---
    if (dens > 0) {
      dkCrate(c, 760, 636, 34, 26); dkCrate(c, 800, 642, 30, 22);
      if (dens >= 1) { dkCrate(c, 300, 630, 30, 22); dkPanels(c, 720, 700, 4); }
      dkVehicle(c, 560, 706);
    }
    // --- ロケット本体(6段) ---
    this._dockRocket(c, RK.x, RK.baseY, RK.w, RK.h, stage);
    // ※溶接火花は§5yyyで転写tick(composite)の動的レイヤへ移設(明滅・reduced-motionは静的1回)
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
    // --- 作業員シルエット(スケールの物差し。足場上+床・作業部位の近く) ---
    const crewN = Math.max(0, Math.round((CFG.dockCrew != null ? CFG.dockCrew : 3)));
    if (stage < 6 && crewN > 0) {
      const scafY2 = stage <= 3 ? 560 : stage === 4 ? 380 : 240;
      const spots = [[RK.x - 62, scafY2, 15], [RK.x + 80, scafY2 + 50, 15], [RK.x - 34, 668, 20], [RK.x + 140, 692, 20]]; // 床の2名は光だまり圏内=視認できる物差し
      for (let i = 0; i < Math.min(crewN + 1, spots.length); i++) dkCrewSil(c, spots[i][0], spots[i][1], spots[i][2], 0.5);
    }
    // --- 手前層(奥行き3層の3層目): 手すり+資材の暗いシルエット ---
    c.fillStyle = "rgba(4,6,9,.85)";
    c.fillRect(0, H - 16, W, 16);
    for (const [hx, hw2] of [[30, 300], [980, 270]]) { // 手すり(暗)
      c.fillRect(hx, H - 34, hw2, 4);
      for (let x = hx + 8; x < hx + hw2; x += 46) c.fillRect(x, H - 30, 4, 16);
    }
    c.beginPath(); c.moveTo(880, H); c.lineTo(905, H - 40); c.lineTo(955, H - 44); c.lineTo(980, H); c.closePath(); c.fill(); // 手前の資材影
    // --- 暗部の底上げ(黒潰れ→夜間工事の暗さ。CFG.dockAmbient) ---
    if (amb > 0) {
      c.fillStyle = `rgba(96,116,136,${(amb * 0.30).toFixed(3)})`;
      c.fillRect(0, 0, W, H);
    }
  },

  // ロケット(6段=ラフ準拠: S1骨組み/S2下部船体/S3エンジン組付/S4上部船体+配管/S5外装+塗装/S6発射準備)
  _dockRocket(c, cx, baseY, w, totalH, stage) {
    const P = DOCKPAL;
    const secH = totalH / 5;
    const secY = (i) => baseY - secH * i;
    c.fillStyle = P.pad; c.fillRect(cx - w * 0.9, baseY, w * 1.8, 14);
    c.fillStyle = P.frameDim; c.fillRect(cx - w * 0.9, baseY, w * 1.8, 3);
    const hullRect = (yTop, hh, lit) => {
      // §5yyy 線から面へ: 曲率を持つ明暗3段+パネル継ぎ目+エッジハイライト
      const g2 = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g2.addColorStop(0, P.hullHi); g2.addColorStop(0.22, lit ? P.hullLit : P.hull);
      g2.addColorStop(0.72, lit ? P.hull : P.hullShadow); g2.addColorStop(1, "#1e252e");
      c.fillStyle = g2; c.fillRect(cx - w / 2, yTop, w, hh);
      c.fillStyle = P.hullEdge; c.globalAlpha = 0.65; c.fillRect(cx - w / 2 + 2, yTop, 2.5, hh); c.globalAlpha = 1; // 受光エッジ
      c.strokeStyle = P.hullSeam; c.lineWidth = 1;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(cx - w / 2, yTop + hh * i / 3); c.lineTo(cx + w / 2, yTop + hh * i / 3); c.stroke(); }
      c.strokeStyle = "rgba(143,165,184,.14)"; // 継ぎ目のハイライト(下側)
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(cx - w / 2, yTop + hh * i / 3 + 1.2); c.lineTo(cx + w / 2, yTop + hh * i / 3 + 1.2); c.stroke(); }
      c.fillStyle = "rgba(10,13,18,.5)";
      for (const rx of [-w * 0.18, w * 0.3]) c.fillRect(cx + rx, yTop + 4, 2, hh - 8); // リベット列(縦)
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
    const lx1 = DOCKW.RK.x - 78, lx2 = DOCKW.RK.x + 92, ly = st < 6 ? scafY - 20 : 540;
    dkWorkLight(g, lx1, ly, 1, 90, amt); dkWorkLight(g, lx2, ly, -1, 90, amt);
    // --- §5yyy 夜間工事の熱(転写tickに同居=フレーム毎の全再描画なし・reduced-motionは静的) ---
    const t = tSec || 0;
    const reduced = (typeof Motion !== "undefined") && Motion.reduced;
    const pool = (CFG.dockLightPool != null ? CFG.dockLightPool : 1) * amt;
    if (pool > 0) { // 作業灯の光だまり(床の円+船体の光帯)
      const pulse = reduced ? 1 : 1 + 0.06 * Math.sin(t * 2.1);
      for (const px of [lx1 + 40, lx2 - 40]) {
        const rg = g.createRadialGradient(px, ly + 96, 6, px, ly + 96, 68 * pulse);
        rg.addColorStop(0, `rgba(${P.poolWarm},${(0.13 * pool).toFixed(3)})`);
        rg.addColorStop(1, `rgba(${P.poolWarm},0)`);
        g.fillStyle = rg; g.beginPath(); g.ellipse(px, ly + 96, 68 * pulse, 26 * pulse, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = `rgba(${P.poolWarm},${(0.06 * pool).toFixed(3)})`; // 船体に落ちる光
      g.fillRect(DOCKW.RK.x - DOCKW.RK.w / 2, ly + 6, DOCKW.RK.w, 62);
    }
    const sparkRate = CFG.dockSparkRate != null ? CFG.dockSparkRate : 1;
    if (st >= 3 && st < 6 && sparkRate > 0) { // 溶接火花(明滅=時間ハッシュ・乱数不使用=決定論)
      const sites = st === 3 ? [[DOCKW.RK.x - 40, 630], [DOCKW.RK.x + 46, 604]] : st === 4 ? [[DOCKW.RK.x - 44, 420]] : [[DOCKW.RK.x + 44, 250]];
      for (let i = 0; i < sites.length; i++) {
        const ph = Math.sin(t * 9.7 * sparkRate + i * 2.3) + Math.sin(t * 23.3 * sparkRate + i * 5.1);
        const on = reduced ? true : ph > -1.2; // 明滅=強弱主体(消えるのは稀・撮影/一目で「溶接中」と分かる)
        if (on) dkSpark(g, sites[i][0], sites[i][1], reduced ? 6 : Math.max(3, 5 + Math.floor(ph * 2.2)));
      }
    }
    if (st >= 3 && st < 6) { // 配管の蒸気(緩やかな漂い・reducedは静止)
      const drift = reduced ? 0 : (t * 7) % 22;
      g.fillStyle = P.steam;
      g.beginPath();
      g.arc(DOCKW.RK.x - 96, 600 - drift, 9 + drift * 0.35, 0, Math.PI * 2);
      g.arc(DOCKW.RK.x - 88, 585 - drift * 1.2, 6 + drift * 0.25, 0, Math.PI * 2);
      g.fill();
    }
    { // 計器の点滅(車両回転灯+供給脈・reducedは常灯)
      const blink = reduced ? 1 : (Math.sin(t * 3.4) > 0 ? 1 : 0.25);
      g.globalAlpha = blink; g.fillStyle = P.amberHi; g.fillRect(600, 686, 3, 3); g.globalAlpha = 1; // 車両回転灯
    }
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
