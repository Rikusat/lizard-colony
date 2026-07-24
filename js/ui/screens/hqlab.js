// =============================================================
// screens/hqlab — 本部v3「正面仰視の管制室」(Ric構図承認 §5qqq → 全展開)
// テーゼ:「スクリーンが部屋なのではない。スクリーンの光が部屋である」。
// 上部65%=巨大スクリーン(本部を開いた惑星の飼育槽を生中継=方式1流用)。部屋は暗く、光源は実質スクリーンのみ。
// 手前=段状の管制席+逆光シルエット(黒影・顔なし)。リムライト/光こぼれ=スクリーン平均色から算出(惑星で部屋が変わる)。
// 旧俯瞰×GBA(RAMP/スプライト/整数倍ブリット)はRic裁定で廃棄(記録=git+test-hqlab-pixel.html)。
// 表示層のみ=パネル(hq.js)/投資ロジック/セーブ/飼育槽側コードは非接触(転写ソースとして読むだけ)。
// 調整値はCFG.ctrl*(data.js)。tier=CFG.labRoomTiers流用(T1立ち上げ期/T2稼働/T3過密=管制能力の成長)。
// =============================================================

// 新パレット(1箇所集約=色知識はここだけ。暗部/計器/リムライトの3系統)
const CTRLPAL = {
  // 暗部(冷暗基調)
  room: "#0d1116", wallDeep: "#0a0e13", floor: "#0b0f15",
  consoleBody: "#10151c", consoleTop: "#151b24", consoleEdge: "#1d2530",
  bezel: "#1a2028", bezelHi: "#2a3340", screenOff: "#0a0d12",
  silhouette: "#07090c", standby: "#141a22",
  // 計器(深紅/琥珀/机上の冷光=既存の色言語を継承)
  crimson: "#a11c2c", crimsonHi: "#d8404e", amber: "#c08d1d", amberHi: "#ecc35a",
  deskGlow: "#27424f", deskGlowHi: "#7fb9cc", led: "#3f8a55",
  // リムライト(実際の色=スクリーン平均色×輝度。これは基準色)
  rimBase: [190, 214, 235],
  label: "rgba(205,216,228,.92)", labelBg: "rgba(10,13,18,.85)",
};
// 設計空間(1280×720固定。表示はfitスケール=整数倍規律は廃止・滑らか描画)
const CTRLW = {
  W: 1280, H: 720,
  SCR: { x: 96, y: 26, w: 1088, h: 452 },
  rows: [{ y: 520, h: 34, inset: 120 }, { y: 584, h: 42, inset: 76 }, { y: 648, h: 50, inset: 32 }],
  // 機能設備(当たり判定rect=設計座標・機能/パネルは従来のまま)
  equip: {
    desks: [{ x: 480, y: 626, w: 320, h: 94 }, { x: 140, y: 610, w: 130, h: 110 }], // 主席コンソール+サーバーラック
    tank: [{ x: 1186, y: 100, w: 94, h: 390 }],   // 錬成槽=右端の側室(深紅の液光)
    shelf: [{ x: 0, y: 100, w: 94, h: 200 }],     // 標本棚=左壁上段
    rocket: [{ x: 0, y: 300, w: 94, h: 190 }],    // 宇宙港=左壁下段(発射ステータス湾)
  },
  names: { desks: "投資端末", tank: "錬成槽", rocket: "宇宙港", shelf: "標本棚" },
  // 着席マップ(tier別・決定論)。T1=影3名(立ち上げ期)/T2=承認構図(半分)/T3=満席
  seated: {
    1: [[0, 0, 0, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [1, 0, 0, 1]],
    2: [[1, 0, 1, 0, 1, 0, 1], [0, 1, 0, 1, 1, 0], [1, 0, 1, 0]],
    3: [[1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [1, 1, 1, 1]],
  },
};

Object.assign(UI, {
  // ---------------- ページ制御(公開APIは従来名を維持) ----------------
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    this.renderHqLab();
    this._startLabVideo(); // 生中継(方式1流用・管制室では部屋の光源そのもの)
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
        if (z !== this._ctrlHover) { this._ctrlHover = z; this._ctrlComposite(); } // ホバー時のみ名称表示(浮遊ラベル全廃)
      });
      cv.addEventListener("mouseleave", () => { if (this._ctrlHover) { this._ctrlHover = null; this._ctrlComposite(); } });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); });
  },

  // ---------------- tier(既存CFG.labRoomTiers流用=管制能力の成長) ----------------
  labRoomTier() {
    if (this._labRoomTierOverride) return this._labRoomTierOverride;
    const inv = Game.labInvestLv("desks");
    const th = CFG.labRoomTiers || [1, 2];
    return inv >= th[1] ? 3 : inv >= th[0] ? 2 : 1;
  },
  labTiers() { // 既存互換(update()の変化検知・設備別の派生tier)
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
    };
  },

  // ---------------- 当たり判定(設計座標・機能設備のみ) ----------------
  _hqlabZones() {
    return Object.keys(CTRLW.equip).map((key) => ({ key, rects: CTRLW.equip[key].map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h })) }));
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 静的レイヤ(部屋+席列+シルエット+設備。光はcompositeで) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    const k = Math.min(W / CTRLW.W, H / CTRLW.H);
    this._labBlit = { k, bx: (W - CTRLW.W * k) / 2, by: (H - CTRLW.H * k) / 2 };
    if (!this._ctrlRoom) { this._ctrlRoom = document.createElement("canvas"); this._ctrlRoom.width = CTRLW.W; this._ctrlRoom.height = CTRLW.H; }
    this._ctrlRenderRoom(this._ctrlRoom.getContext("2d"), this.labRoomTier());
    this._ctrlComposite();
  },

  _ctrlRenderRoom(c, tier) {
    const P = CTRLPAL, S = CTRLW.SCR, W = CTRLW.W, H = CTRLW.H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = P.room; c.fillRect(0, 0, W, H);
    c.fillStyle = P.wallDeep; c.fillRect(0, 0, W, S.y + S.h + 26);
    // --- 左壁: 標本棚(上段)+宇宙港(下段)。T1=消灯待機(機能アクセスは維持)・T2+=点灯 ---
    this._ctrlShelf(c, CTRLW.equip.shelf[0], tier);
    this._ctrlRocketBay(c, CTRLW.equip.rocket[0], tier);
    // --- 右壁: 錬成槽=深紅の液光の側室 ---
    this._ctrlTank(c, CTRLW.equip.tank[0], tier);
    // --- 側面サブモニタ群(T2+点灯・T3=マルチスクリーン化はcompositeで生中継を映す) ---
    this._ctrlSubMons(c, tier);
    // --- 主スクリーンのベゼル(映像面はcomposite) ---
    c.fillStyle = P.bezel; c.fillRect(S.x - 10, S.y - 10, S.w + 20, S.h + 20);
    c.fillStyle = P.bezelHi; c.fillRect(S.x - 10, S.y - 10, S.w + 20, 2);
    c.fillStyle = P.screenOff; c.fillRect(S.x, S.y, S.w, S.h);
    // --- 床(段状の管制フロア) ---
    c.fillStyle = P.floor; c.fillRect(0, S.y + S.h + 26, W, H);
    // T3: 過密=床のケーブル束
    if (tier >= 3) this._ctrlCables(c);
    // --- 席列(奥→手前・段差+拡大=浅い遠近)+着席シルエット ---
    const seated = CTRLW.seated[tier] || CTRLW.seated[2];
    const seats = CFG.ctrlSeats || [7, 6, 4];
    for (let r = 0; r < CTRLW.rows.length; r++) {
      const row = CTRLW.rows[r], rowY = row.y, rowH = row.h, inset = row.inset;
      c.fillStyle = P.consoleEdge; c.fillRect(0, rowY - 4, W, 2);
      c.fillStyle = P.consoleBody; c.fillRect(inset, rowY, W - inset * 2, rowH);
      c.fillStyle = P.consoleTop; c.fillRect(inset, rowY, W - inset * 2, 6);
      const n = seats[r], span = (W - inset * 2) / n;
      for (let s = 0; s < n; s++) {
        const sx = inset + span * (s + 0.5);
        const occupied = seated[r] && seated[r][s];
        // T1=立ち上げ期: 无人席は消灯(点くのは主席と着席者の机上だけ)。T2+=全席点灯
        const lit = tier >= 2 || occupied ? 1 : 0.22;
        c.globalAlpha = lit;
        c.fillStyle = P.deskGlow; c.fillRect(sx - 14, rowY + 8, 28, 10 + r * 2);
        c.fillStyle = P.deskGlowHi; c.globalAlpha = 0.5 * lit; c.fillRect(sx - 14, rowY + 8, 28, 2); c.globalAlpha = lit;
        c.fillStyle = (s + r) % 3 === 0 ? P.crimsonHi : P.amberHi;
        c.fillRect(sx + 20, rowY + 10, 3, 3);
        c.globalAlpha = 1;
        if (tier >= 3) { c.fillStyle = (s + r) % 2 ? P.crimson : P.amber; c.fillRect(sx - 24, rowY + 12, 2, 2); } // 計器過密
        if (occupied) this._ctrlSilhouette(c, sx, rowY, r);
      }
    }
    // --- 主席コンソール+サーバーラック(desksゾーン=前列中央/左) ---
    this._ctrlMainConsole(c, CTRLW.equip.desks[0], tier);
    this._ctrlRack(c, CTRLW.equip.desks[1], tier);
  },

  _ctrlSilhouette(c, sx, rowY, r) {
    const P = CTRLPAL, hw = 17 + r * 5, hh = 26 + r * 8, hr = 8 + r * 2.5;
    c.fillStyle = P.silhouette;
    c.beginPath();
    c.moveTo(sx - hw, rowY);
    c.quadraticCurveTo(sx - hw, rowY - hh, sx - hw * 0.35, rowY - hh);
    c.lineTo(sx + hw * 0.35, rowY - hh);
    c.quadraticCurveTo(sx + hw, rowY - hh, sx + hw, rowY);
    c.closePath(); c.fill();
    c.beginPath(); c.arc(sx, rowY - hh - hr * 0.7, hr, 0, Math.PI * 2); c.fill();
  },

  // 主席コンソール(投資端末): 前列中央の主席=曲面デスク+深紅波形+冷光パネル
  _ctrlMainConsole(c, R, tier) {
    const P = CTRLPAL;
    c.fillStyle = P.consoleBody;
    c.beginPath();
    c.moveTo(R.x, R.y + R.h);
    c.quadraticCurveTo(R.x + R.w / 2, R.y - 18, R.x + R.w, R.y + R.h);
    c.closePath(); c.fill();
    c.fillStyle = P.consoleEdge;
    c.beginPath();
    c.moveTo(R.x + 8, R.y + R.h);
    c.quadraticCurveTo(R.x + R.w / 2, R.y - 8, R.x + R.w - 8, R.y + R.h);
    c.closePath(); c.fill();
    // 深紅の波形ディスプレイ(投資端末の顔=旧意匠の継承)
    const wx = R.x + R.w / 2 - 52, wy = R.y + 34;
    c.fillStyle = "#160a0e"; c.fillRect(wx, wy, 104, 30);
    c.strokeStyle = P.crimsonHi; c.lineWidth = 1.6; c.beginPath();
    for (let i = 0; i <= 26; i++) { const yy = wy + 15 + ((i % 4 === 1) ? -6 : (i % 4 === 3) ? 6 : 0); i ? c.lineTo(wx + 4 + i * 3.7, yy) : c.moveTo(wx + 4, yy); }
    c.stroke();
    c.fillStyle = P.crimson; c.fillRect(wx, wy, 104, 2);
    // 冷光パネル×2+計器
    c.fillStyle = P.deskGlow; c.fillRect(R.x + 26, R.y + 44, 56, 16); c.fillRect(R.x + R.w - 82, R.y + 44, 56, 16);
    c.fillStyle = P.deskGlowHi; c.globalAlpha = 0.5; c.fillRect(R.x + 26, R.y + 44, 56, 2); c.fillRect(R.x + R.w - 82, R.y + 44, 56, 2); c.globalAlpha = 1;
    c.fillStyle = P.amberHi; c.fillRect(R.x + 30, R.y + 66, 4, 4);
    c.fillStyle = tier >= 2 ? P.crimsonHi : P.crimson; c.fillRect(R.x + R.w - 34, R.y + 66, 4, 4);
  },
  // サーバーラック(desksゾーン): LED列+通気スリット。T2+=LED増点
  _ctrlRack(c, R, tier) {
    const P = CTRLPAL;
    c.fillStyle = P.consoleBody; c.fillRect(R.x, R.y, R.w, R.h);
    c.fillStyle = P.consoleEdge; c.fillRect(R.x, R.y, R.w, 4);
    for (let i = 0; i < 5; i++) {
      const uy = R.y + 12 + i * 19;
      c.fillStyle = P.standby; c.fillRect(R.x + 8, uy, R.w - 16, 13);
      c.fillStyle = "#0a0d12"; c.fillRect(R.x + 12, uy + 5, R.w - 40, 2);
      const lit = tier >= 2 ? 3 : 1;
      for (let d = 0; d < 3; d++) {
        c.fillStyle = d < lit ? (d === 1 ? P.amberHi : P.led) : "#1a222b";
        c.fillRect(R.x + R.w - 22 + d * 6, uy + 4, 4, 4);
      }
    }
  },
  // 錬成槽: 右端の側室=深紅の液柱の光(T1=薄い待機光)
  _ctrlTank(c, R, tier) {
    const P = CTRLPAL;
    c.fillStyle = P.standby; c.fillRect(R.x, R.y, R.w, R.h);
    c.fillStyle = P.wallDeep; c.fillRect(R.x + 8, R.y + 10, R.w - 16, R.h - 20);
    const lit = tier >= 2 ? 1 : 0.45; // T1=消灯待機ぎみ
    // 液柱(深紅)
    const lx = R.x + 20, lw = R.w - 40, ly = R.y + 26, lh = R.h - 52;
    c.globalAlpha = 0.85 * lit;
    const grad = c.createLinearGradient(0, ly, 0, ly + lh);
    grad.addColorStop(0, P.crimsonHi); grad.addColorStop(0.35, P.crimson); grad.addColorStop(1, "#3a0b13");
    c.fillStyle = grad; c.fillRect(lx, ly, lw, lh);
    c.globalAlpha = 1;
    // ガラスの明線+気泡(静的)
    c.fillStyle = "rgba(220,238,244,.5)"; c.fillRect(lx + 3, ly + 2, 2, lh - 4);
    c.fillStyle = "rgba(240,214,214,.5)";
    for (const [bx, by] of [[0.3, 0.75], [0.6, 0.5], [0.45, 0.25]]) c.fillRect(lx + lw * bx, ly + lh * by, 3, 3);
    // 側室の縁光(部屋側へ深紅がこぼれる)
    c.globalAlpha = 0.28 * lit; c.fillStyle = P.crimson; c.fillRect(R.x - 10, R.y + 20, 10, R.h - 40); c.globalAlpha = 1;
    c.fillStyle = tier >= 2 ? P.crimsonHi : P.crimson; c.fillRect(R.x + 12, R.y + R.h - 8, 8, 3);
  },
  // 標本棚: 左壁上段=薄い冷光のキャビネット+瓶シルエット
  _ctrlShelf(c, R, tier) {
    const P = CTRLPAL;
    c.fillStyle = P.standby; c.fillRect(R.x, R.y, R.w, R.h);
    c.fillStyle = P.wallDeep; c.fillRect(R.x + 8, R.y + 8, R.w - 12, R.h - 16);
    const lit = tier >= 2 ? 1 : 0.4;
    for (let s = 0; s < 3; s++) {
      const sy = R.y + 18 + s * 58;
      c.globalAlpha = 0.5 * lit; c.fillStyle = P.deskGlow; c.fillRect(R.x + 10, sy, R.w - 16, 40); c.globalAlpha = 1;
      c.fillStyle = "#060809";
      for (let j = 0; j < 3; j++) c.fillRect(R.x + 14 + j * 22, sy + 10, 12, 30);
      c.globalAlpha = 0.6 * lit; c.fillStyle = P.deskGlowHi;
      for (let j = 0; j < 3; j++) c.fillRect(R.x + 14 + j * 22, sy + 10, 2, 30);
      c.globalAlpha = 1;
      c.fillStyle = P.consoleEdge; c.fillRect(R.x + 8, sy + 42, R.w - 12, 3);
    }
  },
  // 宇宙港: 左壁下段=発射ステータス湾(琥珀の機影+ステータス灯列)
  _ctrlRocketBay(c, R, tier) {
    const P = CTRLPAL;
    c.fillStyle = P.standby; c.fillRect(R.x, R.y, R.w, R.h);
    c.fillStyle = "#05070a"; c.fillRect(R.x + 8, R.y + 12, R.w - 12, R.h - 52);
    const lit = tier >= 2 ? 1 : 0.45;
    // 機影(琥珀の縦シルエット=ロケット)
    const cx = R.x + (R.w + 4) / 2, ty = R.y + 26, bh = R.h - 84;
    c.globalAlpha = 0.9 * lit;
    c.fillStyle = P.amber;
    c.beginPath();
    c.moveTo(cx, ty);
    c.lineTo(cx + 12, ty + bh * 0.4); c.lineTo(cx + 12, ty + bh); c.lineTo(cx + 20, ty + bh + 16);
    c.lineTo(cx - 20, ty + bh + 16); c.lineTo(cx - 12, ty + bh); c.lineTo(cx - 12, ty + bh * 0.4);
    c.closePath(); c.fill();
    c.fillStyle = P.amberHi; c.fillRect(cx - 3, ty + 12, 6, 10);
    c.globalAlpha = 1;
    // ステータス灯列(建造段階はパネル側の真実を表示=ここは意匠)
    for (let d = 0; d < 4; d++) {
      c.fillStyle = d < (tier >= 2 ? 3 : 1) ? P.amberHi : "#1a222b";
      c.fillRect(R.x + 14 + d * 18, R.y + R.h - 24, 8, 5);
    }
  },
  // 側面サブモニタ(T2+点灯)。T3=マルチスクリーン(compositeで生中継のリピータになる)
  _ctrlSubMons(c, tier) {
    const P = CTRLPAL;
    this._ctrlSubRects = [];
    for (const sideX of [8, CTRLW.W - 88]) {
      for (let i = 0; i < 2; i++) {
        const r = { x: sideX, y: 26 + i * 36, w: 80, h: 28 };
        c.fillStyle = P.bezel; c.fillRect(r.x, r.y, r.w, r.h);
        if (tier >= 2) {
          c.fillStyle = P.deskGlow; c.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
          c.fillStyle = P.deskGlowHi; c.globalAlpha = 0.5; c.fillRect(r.x + 3, r.y + 3, r.w - 6, 2); c.globalAlpha = 1;
          if (tier >= 3) this._ctrlSubRects.push(r); // T3: 生中継リピータ化
        } else {
          c.fillStyle = P.screenOff; c.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        }
      }
    }
  },
  _ctrlCables(c) {
    const P = CTRLPAL;
    c.lineWidth = 3; c.strokeStyle = "#05070a";
    for (const [x0, y0, x1, y1] of [[200, 560, 560, 620], [1080, 560, 760, 624], [340, 640, 640, 700], [980, 646, 700, 706]]) {
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 22, x1, y1); c.stroke();
    }
    c.lineWidth = 1.4; c.strokeStyle = CTRLPAL.crimson;
    c.beginPath(); c.moveTo(210, 564); c.quadraticCurveTo(390, 610, 560, 616); c.stroke();
    c.lineWidth = 1;
    void P;
  },

  // ---------------- 生中継(方式1流用)+光の合成 ----------------
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
  // 転写tick: 半解像度ブラー転写(コスト1/4=品質はブラーが隠す)→平均色実測→合成
  _drawLabScreenVideo(tSec) {
    const S = CTRLW.SCR, src = document.getElementById("game");
    if (!src || !src.width || !src.height) { this._ctrlComposite(tSec); return; }
    const VK = 2;
    if (!this._ctrlVid) { this._ctrlVid = document.createElement("canvas"); this._ctrlVid.width = Math.round(S.w / VK); this._ctrlVid.height = Math.round(S.h / VK); }
    const vid = this._ctrlVid, vc = vid.getContext("2d");
    vc.imageSmoothingEnabled = true;
    const da = S.w / S.h;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sw / sh > da) { sw = Math.round(sh * da); sx = (src.width - sw) / 2; }
    else { sh = Math.round(sw / da); sy = (src.height - sh) / 2; }
    // 弱ブラー=「見下ろす監視映像」の解像度(個体シルエット可・UI不可読)。filter非対応環境は縮小転写自体が近似ブラー
    try { vc.filter = `blur(${((CFG.ctrlBlur || 2.5) / VK).toFixed(2)}px)`; } catch (e) {}
    vc.drawImage(src, sx, sy, sw, sh, 0, 0, vid.width, vid.height);
    try { vc.filter = "none"; } catch (e) {}
    // 走査線(維持・薄く。揺らぎはreduced-motionで停止)
    if ((CFG.ctrlScanAlpha || 0) > 0) {
      vc.fillStyle = `rgba(8,10,12,${CFG.ctrlScanAlpha})`;
      const reduced = (typeof Motion !== "undefined") && Motion.reduced;
      const drift = reduced ? 0 : Math.floor(tSec * 8) % 2;
      for (let yy = drift; yy < vid.height; yy += 2) vc.fillRect(0, yy, vid.width, 1);
    }
    // 平均色(=部屋の照らされ方の源)。16×9へ縮小して実測
    if (!this._ctrlLum) { this._ctrlLum = document.createElement("canvas"); this._ctrlLum.width = 16; this._ctrlLum.height = 9; }
    try {
      const lc = this._ctrlLum.getContext("2d");
      lc.drawImage(vid, 0, 0, 16, 9);
      const d = lc.getImageData(0, 0, 16, 9).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      this._ctrlAvg = [r / n, g / n, b / n];
    } catch (e) { /* tainted等でも生中継は続行(平均色は前回値) */ }
    this._ctrlComposite(tSec);
  },

  // 合成: 部屋レイヤ+映像+スクリーン光(こぼれ/リム)+T3リピータ+ホバー名称
  _ctrlComposite(tSec) {
    const cv = document.getElementById("hqlab-canvas");
    if (!cv || !this._ctrlRoom || !this._labBlit) return;
    const g = cv.getContext("2d"), b = this._labBlit, P = CTRLPAL, S = CTRLW.SCR;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = P.room; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(b.k, 0, 0, b.k, b.bx, b.by);
    g.imageSmoothingEnabled = true;
    g.drawImage(this._ctrlRoom, 0, 0);
    const vid = this._ctrlVid;
    if (vid) g.drawImage(vid, 0, 0, vid.width, vid.height, S.x, S.y, S.w, S.h);
    // T3: 壁面マルチスクリーン=サブモニタが生中継のリピータになる(暗め)
    if (vid && this._ctrlSubRects && this._ctrlSubRects.length) {
      g.globalAlpha = 0.55;
      for (const r of this._ctrlSubRects) g.drawImage(vid, 0, 0, vid.width, vid.height, r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      g.globalAlpha = 1;
    }
    // スクリーン平均輝度(クランプ=最暗/最明の惑星でも破綻させない)
    const avg = this._ctrlAvg || [40, 50, 60];
    const rawL = (avg[0] * 0.299 + avg[1] * 0.587 + avg[2] * 0.114) / 255;
    const L = Math.min(CFG.ctrlLumMax != null ? CFG.ctrlLumMax : 0.85, Math.max(CFG.ctrlLumMin != null ? CFG.ctrlLumMin : 0.06, rawL));
    const tint = `${Math.round(avg[0])},${Math.round(avg[1])},${Math.round(avg[2])}`;
    // 光こぼれ(平均色で着色=映る惑星で部屋の色が変わる)
    const base = CFG.ctrlFloorBase != null ? CFG.ctrlFloorBase : 0.05, spillA = CFG.ctrlSpillAmount != null ? CFG.ctrlSpillAmount : 0.85;
    const spill = g.createLinearGradient(0, S.y + S.h, 0, CTRLW.H);
    spill.addColorStop(0, `rgba(${tint},${(base + L * spillA * 0.30).toFixed(3)})`);
    spill.addColorStop(0.5, `rgba(${tint},${(base * 0.6 + L * spillA * 0.10).toFixed(3)})`);
    spill.addColorStop(1, `rgba(${tint},0.01)`);
    g.fillStyle = spill; g.fillRect(0, S.y + S.h, CTRLW.W, CTRLW.H - S.y - S.h);
    // ベゼル後光
    g.globalAlpha = 0.10 + L * 0.12; g.fillStyle = `rgb(${tint})`;
    g.fillRect(S.x - 16, S.y - 16, S.w + 32, 4); g.fillRect(S.x - 16, S.y + S.h + 12, S.w + 32, 4);
    g.globalAlpha = 1;
    // リムライト(段差+シルエット頭/肩・輝度連動)
    const rim = P.rimBase, ra = Math.min(0.85, (0.12 + L * 0.75) * (CFG.ctrlRimAmount != null ? CFG.ctrlRimAmount : 1));
    const seated = CTRLW.seated[this.labRoomTier()] || CTRLW.seated[2];
    const seats = CFG.ctrlSeats || [7, 6, 4];
    g.lineWidth = 1.6;
    for (let r = 0; r < CTRLW.rows.length; r++) {
      const row = CTRLW.rows[r], rowY = row.y, inset = row.inset;
      g.strokeStyle = `rgba(${rim[0]},${rim[1]},${rim[2]},${(ra * 0.5).toFixed(3)})`;
      g.beginPath(); g.moveTo(inset, rowY); g.lineTo(CTRLW.W - inset, rowY); g.stroke();
      g.strokeStyle = `rgba(${rim[0]},${rim[1]},${rim[2]},${ra.toFixed(3)})`;
      const n = seats[r], span = (CTRLW.W - inset * 2) / n;
      for (let s = 0; s < n; s++) {
        if (!seated[r] || !seated[r][s]) continue;
        const sx = inset + span * (s + 0.5), hw = 17 + r * 5, hh = 26 + r * 8, hr = 8 + r * 2.5;
        g.beginPath(); g.arc(sx, rowY - hh - hr * 0.7, hr, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.beginPath(); g.moveTo(sx - hw * 0.9, rowY - hh * 0.92); g.quadraticCurveTo(sx - hw * 0.3, rowY - hh, sx + hw * 0.3, rowY - hh); g.stroke();
      }
    }
    // ホバー時のみ名称表示(浮遊ラベル/白矩形プレースホルダは全廃)
    if (this._ctrlHover && CTRLW.names[this._ctrlHover]) {
      const R = CTRLW.equip[this._ctrlHover][0];
      const name = CTRLW.names[this._ctrlHover];
      g.font = "600 15px system-ui, sans-serif";
      const tw = g.measureText(name).width + 16;
      let lx = Math.min(Math.max(R.x + R.w / 2 - tw / 2, 6), CTRLW.W - tw - 6);
      let ly = R.y - 26 > 8 ? R.y - 26 : R.y + R.h + 8;
      g.fillStyle = P.labelBg; g.fillRect(lx, ly, tw, 22);
      g.fillStyle = P.label; g.fillText(name, lx + 8, ly + 16);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    void tSec;
  },
});

// dev用: #hqlab で本部を開く(#hqlab-desks等でパネル/#hqlab-t1|t2|t3=部屋tierの表示のみ上書き/#hqlab-fullは互換=T3)。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full|t1|t2|t3))?$/);
  if (m && UI.openHqLab) setTimeout(() => {
    if (m[1] === "full" || m[1] === "t3") UI._labRoomTierOverride = 3;
    else if (m[1] === "t2") UI._labRoomTierOverride = 2;
    else if (m[1] === "t1") UI._labRoomTierOverride = 1;
    UI.openHqLab();
    if (m[1] && !/^t[123]$|^full$/.test(m[1])) UI.openLabPanel(m[1]);
  }, 60);
});
