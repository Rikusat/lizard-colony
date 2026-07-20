// =============================================================
// screens/roulette — 遺伝子ルーレット【表現層】(roulette.md §7 v3.1・物理決定型パチンコ)
// ルール層(Roulette)の実(x,y)/釘/穴をそのまま描くだけ。結果は計算しない。
// 見えている落下がそのまま真実(§2 fable1: 演出と結果の乖離が原理的に起きない)。
// =============================================================

// ── 盤の意匠(boardSkin・§④): 描画のみ=当たり判定/確率は不変。惑星別へ差し替え可能な構造。
//   釘=巣の藁(+芯の小点で視認性) / レール=祖の蛇の背骨 / 棚=祭壇 / 中央スリット=卵が孵る割れ目 /
//   受け皿=巣穴 / 背景=紋章(既定は汎用「卵と巣」・スリット落下時のみ0.6s淡く発光→即戻る)。
//   すべて低コントラストの温色=球が主役(役者>舞台)。reduced-motionで発光・藁のゆらぎは静的化。
const ROUL_BOARD_SKINS = {
  default: {
    id: "default",
    straw: "198,158,96", core: "232,212,162", spine: "192,150,100", altar: "214,176,112", emblem: "212,180,120",
    // 背景の紋章(汎用=卵と巣)。普段は極薄の線画=気配、スリット落下時のみ光のハロー(発光)→即戻る。
    // 将来は惑星固有種シルエットへ差替(この関数だけ置換すればよい=boardSkin分離)。
    emblem_draw(ctx, W, H, glow, calm) {
      const ex = W * 0.5, ey = H * 0.42, s = W * 0.14;      // 盤中ほど(釘の海の奥)に静かに
      const g = calm ? 0 : glow;
      // 落下時の光のハロー(発光=明るい温色が滲む・ソリッド塗りにしない=暗いブロブ回避)
      if (g > 0.01) {
        ctx.save();
        const hg = ctx.createRadialGradient(ex, ey, 1, ex, ey, s * 1.5);
        hg.addColorStop(0, `rgba(244,216,158,${g * 0.22})`); hg.addColorStop(1, "rgba(244,216,158,0)");
        ctx.fillStyle = hg; ctx.fillRect(ex - s * 1.5, ey - s * 1.6, s * 3, s * 3.2);
        ctx.restore();
      }
      // 線画の気配(惑星ごとの紋章モチーフ)。普段はごく薄く、発光時に少しだけ明るく。motifを差し替えれば惑星別に
      const line = 0.055 + g * 0.12;
      ctx.strokeStyle = `rgba(${this.emblem},${line})`; ctx.fillStyle = `rgba(${this.emblem},${line})`;
      ctx.lineWidth = Math.max(0.6, W * 0.005); ctx.lineCap = "round";
      this.motif(ctx, ex, ey, s);
    },
    // 紋章モチーフ(既定=卵と巣)。惑星skinはこれだけ差し替える(strokeStyle/lineWidthは呼び出し側が設定済)
    motif(ctx, ex, ey, s) {
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(ex, ey + s * 0.5, s * (0.9 + Math.abs(k) * 0.06), Math.PI * (0.12 + k * 0.02), Math.PI * (0.88 - k * 0.02));
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(ex, ey + s * 0.05, s * 0.34, s * 0.46, 0, 0, 7); ctx.stroke(); // 卵=輪郭のみ(気配)
    },
    // 釘=巣の藁の束(短い温色ストローク)+芯の小点(視認性維持=球の跳ね返り先が読める)
    nail_draw(ctx, n, scale) {
      const L = n.r * 2.4, lw = Math.max(0.5, 0.7 / scale);
      ctx.strokeStyle = `rgba(${this.straw},.38)`; ctx.lineWidth = lw; ctx.lineCap = "round";
      for (const dx of [-0.7, 0, 0.7]) {
        ctx.beginPath(); ctx.moveTo(n.x + dx * n.r, n.y + n.r * 0.6);
        ctx.lineTo(n.x + dx * n.r * 1.5, n.y - L); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${this.core},.7)`;               // 芯の小点(明るめ=当たり判定の実体が一目)
      ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.7, n.r * 0.62), 0, 7); ctx.fill();
    },
    // レール=祖の蛇の背骨(2軌条に沿う椎骨の刻み)。温色・低コントラスト
    rail_draw(ctx, cx, chTop, chBot, railEndY, scale) {
      ctx.strokeStyle = `rgba(${this.spine},.30)`; ctx.lineWidth = Math.max(0.5, 0.7 / scale); ctx.lineCap = "round";
      const seg = 7;
      for (const s of [-1, 1]) {
        for (let i = 1; i < seg; i++) {
          const t = i / seg, x = cx + s * (chTop + (chBot - chTop) * t), y = railEndY * t;
          const nx = -s * 2.0, ny = 0.6; // 椎骨=軌条に短い横棒
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx, y + ny); ctx.stroke();
        }
      }
    },
    // 棚=祭壇(縁の温色装飾)+祭壇の灯り(球が乗ると縁が淡く灯る・高揚を邪魔しない程度)
    shelf_draw(ctx, cx, stageY, sHalf, slotH, lit, scale, calm) {
      const a = 0.22 + (calm ? 0 : lit * 0.30);
      ctx.strokeStyle = `rgba(${this.altar},${a})`; ctx.lineWidth = Math.max(0.7, 1.0 / scale); ctx.lineCap = "round";
      for (const s of [-1, 1]) { // 祭壇の段(棚縁の下に一段の飾り)
        ctx.beginPath();
        ctx.moveTo(cx + s * slotH, stageY + 4.5);
        ctx.lineTo(cx + s * sHalf, stageY + 3.5); ctx.stroke();
      }
      if (lit > 0.01 && !calm) { // 灯り(乗った棚の面が淡く温まる)
        const gy = stageY + 1;
        const gg = ctx.createRadialGradient(cx, gy, 1, cx, gy, sHalf * 1.3);
        gg.addColorStop(0, `rgba(${this.altar},${lit * 0.22})`); gg.addColorStop(1, `rgba(${this.altar},0)`);
        ctx.fillStyle = gg; ctx.fillRect(cx - sHalf * 1.3, gy - 4, sHalf * 2.6, 8);
      }
    },
    // 受け皿=巣穴(器の縁に温色の土の口)
    cup_draw(ctx, ccx, halfW, landY, cupDepth, scale) {
      ctx.strokeStyle = `rgba(${this.straw},.30)`; ctx.lineWidth = Math.max(0.6, 0.9 / scale);
      ctx.beginPath();
      ctx.moveTo(ccx - halfW * 1.05, landY - 1.5);
      ctx.quadraticCurveTo(ccx, landY + cupDepth * 0.4, ccx + halfW * 1.05, landY - 1.5);
      ctx.stroke();
    },
  },
};

// 惑星別の盤意匠(描画のみ=当たり判定/geometry/確率は不変)。defaultの描画メソッドを継承し、パレットと紋章motifだけ差し替える。
// 紋章motifはstrokeStyle/fillStyle設定済で呼ばれる(emblem_drawが管理)。惑星の文明を暗示する簡素なモチーフ。
(function () {
  const D = ROUL_BOARD_SKINS.default;
  const mk = (id, pal, motif) => { ROUL_BOARD_SKINS[id] = Object.assign({}, D, { id }, pal, motif ? { motif } : {}); };
  const eye = (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.9, 0, 7); c.stroke(); c.beginPath(); c.ellipse(x, y, s * 0.5, s * 0.24, 0, 0, 7); c.stroke(); c.beginPath(); c.arc(x, y, s * 0.12, 0, 7); c.fill(); }; // 企業ホログラムの眼
  const gearLeaf = (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.58, 0, 7); c.stroke(); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.fillRect(x + Math.cos(a) * s * 0.66 - s * 0.05, y + Math.sin(a) * s * 0.66 - s * 0.05, s * 0.1, s * 0.1); } c.beginPath(); c.ellipse(x + s * 0.72, y + s * 0.38, s * 0.3, s * 0.13, -0.6, 0, 7); c.stroke(); }; // からくり(歯車+葉)
  const keyhole = (c, x, y, s) => { c.beginPath(); c.arc(x, y - s * 0.18, s * 0.52, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.28); c.lineTo(x + s * 0.3, y + s * 0.28); c.lineTo(x + s * 0.52, y + s * 0.82); c.lineTo(x - s * 0.52, y + s * 0.82); c.closePath(); c.stroke(); }; // 前方後円墳
  const flame = (c, x, y, s) => { c.beginPath(); c.moveTo(x, y + s * 0.7); c.quadraticCurveTo(x - s * 0.58, y, x - s * 0.2, y - s * 0.4); c.quadraticCurveTo(x, y - s * 0.9, x + s * 0.2, y - s * 0.4); c.quadraticCurveTo(x + s * 0.58, y, x, y + s * 0.7); c.stroke(); }; // 炎
  const wheel = (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.6, 0, 7); c.stroke(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6); c.stroke(); } c.beginPath(); c.arc(x, y, s * 0.13, 0, 7); c.fill(); }; // 御神体の車輪
  const hatch = (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.58, 0, 7); c.stroke(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.58, y + Math.sin(a) * s * 0.58); c.lineTo(x + Math.cos(a) * s * 0.85, y + Math.sin(a) * s * 0.85); c.stroke(); } }; // 耐圧ハッチホイール
  const hexagon = (c, x, y, s) => { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.26; const px = x + Math.cos(a) * s * 0.7, py = y + Math.sin(a) * s * 0.7; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.stroke(); }; // 六角台座
  const trefoil = (c, x, y, s) => { for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(x, y); c.arc(x, y, s * 0.68, a - 0.5, a + 0.5); c.closePath(); c.stroke(); } c.beginPath(); c.arc(x, y, s * 0.16, 0, 7); c.fill(); }; // 放射能トレフォイル
  const armillary = (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.62, 0, 7); c.stroke(); c.beginPath(); c.ellipse(x, y, s * 0.62, s * 0.24, 0, 0, 7); c.stroke(); c.beginPath(); c.ellipse(x, y, s * 0.24, s * 0.62, 0, 0, 7); c.stroke(); }; // 渾天儀
  mk("p1", { straw: "198,158,96", core: "232,212,162", spine: "192,150,100", altar: "214,176,112", emblem: "212,180,120" });               // アリド(=卵と巣・default紋章)
  mk("p2", { straw: "95,204,217", core: "217,87,176", spine: "120,150,200", altar: "217,87,176", emblem: "95,204,217" }, eye);            // ネオヴェルデ
  mk("p3", { straw: "150,190,110", core: "200,230,150", spine: "120,150,90", altar: "180,150,90", emblem: "150,200,120" }, gearLeaf);     // シルヴァ
  mk("p4", { straw: "150,175,120", core: "210,190,130", spine: "120,140,100", altar: "201,168,106", emblem: "150,180,130" }, keyhole);    // パルス
  mk("p5", { straw: "230,140,70", core: "255,200,120", spine: "200,100,60", altar: "255,160,80", emblem: "240,150,80" }, flame);          // イグニス
  mk("p6", { straw: "120,180,120", core: "180,230,170", spine: "100,150,110", altar: "201,168,106", emblem: "47,169,138" }, wheel);       // ユンガ(翡翠)
  mk("p7", { straw: "120,190,210", core: "190,230,245", spine: "90,150,180", altar: "160,214,234", emblem: "95,168,201" }, hatch);        // メアリス
  mk("p8", { straw: "150,190,210", core: "220,235,245", spine: "127,199,222", altar: "180,210,230", emblem: "127,199,222" }, hexagon);    // グラキス
  mk("p9", { straw: "130,150,140", core: "200,215,205", spine: "111,184,160", altar: "150,170,160", emblem: "111,184,160" }, trefoil);    // ヴォルタ
  mk("p10", { straw: "180,150,100", core: "220,190,130", spine: "150,130,90", altar: "201,162,39", emblem: "201,162,39" }, armillary);    // オリジン
})();

Object.assign(UI, {
  // 現在の惑星の盤意匠を選ぶ(_roulSkinId優先=テスト用/未設定なら惑星ID自動)。無ければdefault
  _roulSkin() {
    if (this._roulSkinId) return ROUL_BOARD_SKINS[this._roulSkinId] || ROUL_BOARD_SKINS.default;
    const id = (typeof Game !== "undefined" && Game.currentStage) ? "p" + Game.currentStage().id : null;
    return ROUL_BOARD_SKINS[id] || ROUL_BOARD_SKINS.default;
  },
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
    if (this._bossRewardOpen) return; // 報酬オーバーレイ稼働中はそちらが描画(イベント二重drain防止)
    if (!this._syncRoulSize()) return; // 自己修復
    this._paintRoulBoard(ctx, cv.width, cv.height, "rainbow");
  },

  // 盤面ペインタ(左メニュー(暫定)/報酬オーバーレイ で共有・fable1 演出のコピペ増殖を防ぐ)。
  // jackpotMode(§1.2.2): "rainbow"=中央七色(新種) / "rare"=中央琥珀(レア卵)。盤geometryは共通
  _paintRoulBoard(ctx, cw, ch, jackpotMode) {
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

    // 意匠: 背景の紋章(§④・卵と巣)。普段は極薄、スリット落下(BallWin/Rainbow)時のみ0.6s淡く発光→即戻る
    const skin = this._roulSkin();
    this._roulEmblemGlow = Math.max(0, (this._roulEmblemGlow || 0) - 1 / 60 / 0.6);
    skin.emblem_draw(ctx, W, H, this._roulEmblemGlow, calm);

    // レール(発射→落下導入・roulette_rules.md §1): 球が沿って走る溝=ファネル状シュートの2軌条
    const railEndY = CFG.roulRailEndYf * H;
    const chTop = CFG.roulChuteTopHalff * W, chBot = CFG.roulChuteBotHalff * W;
    // 溝の内側の淡い塗り(レールに沿って落ちる帯を可視化)
    ctx.fillStyle = "rgba(150,190,160,.06)";
    ctx.beginPath();
    ctx.moveTo(cx - chTop, 0); ctx.lineTo(cx - chBot, railEndY);
    ctx.lineTo(cx + chBot, railEndY); ctx.lineTo(cx + chTop, 0); ctx.closePath(); ctx.fill();
    // 左右の軌条(はっきり見える2本のレール)
    ctx.strokeStyle = "rgba(170,205,175,.5)"; ctx.lineWidth = 1.6 / scale; ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + s * chTop, 0); ctx.lineTo(cx + s * chBot, railEndY); ctx.stroke();
    }
    // 解放点(レール終端)の淡い印
    ctx.strokeStyle = "rgba(170,205,175,.22)"; ctx.lineWidth = 0.8 / scale;
    ctx.beginPath(); ctx.moveTo(cx - chBot, railEndY); ctx.lineTo(cx + chBot, railEndY); ctx.stroke();
    // 意匠: レール=祖の蛇の背骨(軌条に沿う椎骨の刻み)
    skin.rail_draw(ctx, cx, chTop, chBot, railEndY, scale);
    // 発射口
    ctx.fillStyle = "rgba(180,200,170,.55)";
    ctx.beginPath(); ctx.arc(CFG.roulLaunchXf * W, 3, 3.2, 0, 7); ctx.fill();

    // 釘=巣の藁(藁束+芯の小点で視認性維持・§④)。低コントラスト温色=球が主役
    for (const n of Roulette.nails) {
      skin.nail_draw(ctx, n, scale);
    }

    // 着地=受け皿(roulette_rules.md §2): 入賞球が「コトンと収まる」器。ハズレは器が無く流れて消える
    const tp = (Render.time * 90) % 360;
    const pulse = calm ? 0.6 : 0.5 + 0.5 * Math.sin(Render.time * 2.6);
    const cupDepth = CFG.roulCupDepthf * H;
    const pzMid = (rbHalf + pzOut) / 2; // 景品受け皿の中心オフセット

    // ── 三層の関門(§1.2.3拡張): ワープ穴 + 中央ステージ(谷型棚+スリット)。惑星意匠はここを差し替え ──
    if (CFG.roulStageOn) {
      const rareC = jackpotMode === "rare";
      const accent = rareC ? "235,195,110" : "150,210,180"; // 中央の景品色(レア=琥珀/虹=翡翠寄り。虹の七色はスリット光で)
      // ワープ穴(左右・釘の海をスキップして中央ステージへ直行=稀だが可視)
      const wY = CFG.roulWarpYf * H, wx = CFG.roulWarpXf * W;
      for (const s of [-1, 1]) {
        const hx = cx + s * wx;
        const wg = ctx.createRadialGradient(hx, wY, 0.5, hx, wY, 5.5);
        wg.addColorStop(0, "rgba(10,16,20,.95)"); wg.addColorStop(1, "rgba(10,16,20,0)");
        ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(hx, wY, 5.5, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(${accent},${calm ? 0.5 : 0.4 + pulse * 0.4})`; ctx.lineWidth = 1.2 / scale;
        ctx.beginPath(); ctx.arc(hx, wY, 3.4, 0, 7); ctx.stroke();
      }
      // 中央ステージ: 両端開放の谷型棚。中央にスリット(=中央ポケットへの落下口)
      const stageY = CFG.roulStageYf * H, sHalf = CFG.roulStageHalfWf * W, slotH = CFG.roulStageSlotHalff * W;
      ctx.fillStyle = "rgba(20,26,22,.92)"; // スリット(暗い縦の隙間=中央への落下口)
      ctx.fillRect(cx - slotH, stageY - 1, slotH * 2, landY - stageY + 2);
      ctx.fillStyle = "rgba(120,140,120,.16)"; // 棚の面(薄く反る=谷)
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * slotH, stageY + 3);
        ctx.quadraticCurveTo(cx + s * sHalf * 0.6, stageY - 1, cx + s * sHalf, stageY - 2);
        ctx.lineTo(cx + s * sHalf, stageY + 4); ctx.lineTo(cx + s * slotH, stageY + 4);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = "rgba(160,180,160,.5)"; ctx.lineWidth = 1.6 / scale; ctx.lineCap = "round"; // 棚の縁
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * slotH, stageY + 3);
        ctx.quadraticCurveTo(cx + s * sHalf * 0.6, stageY - 1, cx + s * sHalf, stageY - 2);
        ctx.stroke();
      }
      // 意匠: 棚=祭壇。球が乗ると縁が淡く灯る(§④・「乗った!」の高揚は邪魔しない程度)
      let shelfLit = 0;
      for (const b of Roulette.balls) {
        if (Math.abs(b.x - cx) <= sHalf && b.y > stageY - b.r - 2 && b.y < stageY + 4 && Math.abs(b.vy || 0) < 14) { shelfLit = 1; break; }
      }
      skin.shelf_draw(ctx, cx, stageY, sHalf, slotH, shelfLit, scale, calm);
      // スリット縁の誘目光(中央=当たりへの落下口・modeで色。虹は七色脈動)
      const sg = rareC ? `rgba(${accent},${0.5 + pulse * 0.3})` : `hsla(${tp},95%,64%,${0.5 + pulse * 0.35})`;
      ctx.strokeStyle = sg; ctx.lineWidth = 1.2 / scale;
      ctx.beginPath(); ctx.moveTo(cx - slotH, stageY + 2); ctx.lineTo(cx - slotH, landY - 2);
      ctx.moveTo(cx + slotH, stageY + 2); ctx.lineTo(cx + slotH, landY - 2); ctx.stroke();
    }
    // ハズレの床(暗い・受け皿の無い領域=球が滑り落ちて消える)
    ctx.fillStyle = "rgba(26,32,26,.92)";
    ctx.fillRect(0, landY, W, H - landY);
    // 受け皿を1つ描くヘルパ(器=底が丸い窪み)
    const drawCup = (ccx, halfW, fill, stroke) => {
      ctx.beginPath();
      ctx.moveTo(ccx - halfW, landY - 2);
      ctx.lineTo(ccx - halfW, landY + cupDepth * 0.5);
      ctx.quadraticCurveTo(ccx, landY + cupDepth, ccx + halfW, landY + cupDepth * 0.5);
      ctx.lineTo(ccx + halfW, landY - 2);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.0 / scale; ctx.stroke();
    };
    // ②(a): スロット満杯なら景品穴に蓋(閉=一目で満杯と分かる)。球は入らずハズレに(虹は常に開)
    const prizeOpen = typeof Roulette === "undefined" || !Roulette.canAcceptEgg || Roulette.canAcceptEgg();
    const pzHalf = (pzOut - rbHalf) / 2;
    const drawLid = (ccx) => { // 閉じた蓋: 灰の金属板+×印
      ctx.fillStyle = "rgba(70,74,70,.95)";
      ctx.fillRect(ccx - pzHalf, landY - 3, pzHalf * 2, 6);
      ctx.strokeStyle = "rgba(120,124,120,.9)"; ctx.lineWidth = 1.0 / scale;
      ctx.strokeRect(ccx - pzHalf, landY - 3, pzHalf * 2, 6);
      ctx.strokeStyle = "rgba(40,44,40,.9)"; ctx.lineWidth = 1.2 / scale;
      ctx.beginPath();
      ctx.moveTo(ccx - pzHalf * 0.5, landY - 2); ctx.lineTo(ccx + pzHalf * 0.5, landY + 2);
      ctx.moveTo(ccx + pzHalf * 0.5, landY - 2); ctx.lineTo(ccx - pzHalf * 0.5, landY + 2);
      ctx.stroke();
    };
    if (prizeOpen) {
      drawCup(cx - pzMid, pzHalf, "rgba(210,170,90,.5)", "rgba(235,195,110,.8)");
      drawCup(cx + pzMid, pzHalf, "rgba(210,170,90,.5)", "rgba(235,195,110,.8)");
      skin.cup_draw(ctx, cx - pzMid, pzHalf, landY, cupDepth, scale); // 意匠: 受け皿=巣穴(土の口)
      skin.cup_draw(ctx, cx + pzMid, pzHalf, landY, cupDepth, scale);
    } else {
      drawLid(cx - pzMid); drawLid(cx + pzMid);
    }
    // 中央ポケット(§1.2.2): 大ボス=七色脈動(新種)/通常ボス=琥珀脈動(レア卵)。ボス撃破の瞬間に盤の色で「今日は虹だ」と分かる
    const rareCenter = jackpotMode === "rare";
    if (rareCenter) {
      const a = 0.6 + pulse * 0.4;
      drawCup(cx, Math.max(rbHalf, 2.2), `rgba(210,170,90,${a})`, `rgba(240,205,115,.95)`);
      if (!calm) {
        ctx.save(); ctx.globalAlpha = 0.4 + pulse * 0.3;
        const gg = ctx.createRadialGradient(cx, landY, 1, cx, landY, 14);
        gg.addColorStop(0, "rgba(235,195,110,.7)"); gg.addColorStop(1, "rgba(235,195,110,0)");
        ctx.fillStyle = gg; ctx.fillRect(cx - 14, landY - 12, 28, 24); ctx.restore();
      }
    } else {
      const rg = ctx.createLinearGradient(cx - rbHalf, 0, cx + rbHalf, 0);
      rg.addColorStop(0, `hsla(${tp},95%,62%,${0.65 + pulse * 0.35})`);
      rg.addColorStop(1, `hsla(${(tp + 160) % 360},95%,62%,${0.65 + pulse * 0.35})`);
      drawCup(cx, Math.max(rbHalf, 2.2), rg, `hsla(${(tp + 60) % 360},95%,74%,.95)`);
      if (!calm) {
        ctx.save(); ctx.globalAlpha = 0.4 + pulse * 0.3;
        const gg = ctx.createRadialGradient(cx, landY, 1, cx, landY, 14);
        gg.addColorStop(0, `hsla(${tp},95%,66%,.7)`); gg.addColorStop(1, `hsla(${tp},95%,66%,0)`);
        ctx.fillStyle = gg; ctx.fillRect(cx - 14, landY - 12, 28, 24); ctx.restore();
      }
    }

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
      if (ev.type === "BallRainbow" || ev.type === "BallWin") this._roulEmblemGlow = 1; // スリット落下=紋章がひと呼吸灯る(§④)
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
