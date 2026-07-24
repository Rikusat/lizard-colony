// =============================================================
// screens/hqlab — 本部=研究施設ページ(hq_lab v2.0・案A=カイロ系俯瞰×GBA/GBC後期規律)
// 検証カット(#v・Ric承認)を基準に全展開。6規律:
//  ①色ランプ3〜4段(RAMP=単一の真実) ②純黒輪郭禁止(最暗色+上辺は明色抜き=セレクティブ)
//  ③材質の描き分け(金属=鋭ハイライト/紙=柔段差/木=木目/液=ディザ+明線) ④大面積の分割(床=揺らぎ+目地+摩耗・壁=パネル)
//  ⑤白タイル+深紅/琥珀の規律内でランプ化 ⑥整数倍拡大死守・グラデ/AAなし(手打ちディザ可)
// tier成長3段(T1開設/T2稼働/T3過密)=労Invest(鉱石投資進行度)へのマッピングのみ(ロジック/セーブ非接触)。
// =============================================================

// 色ランプ(最暗0→基本1→明2→ハイライト3)。★新素材はここへ追加して申告(色知識の集約)。
const RAMP = {
  floor: [[196, 190, 178], [214, 208, 196], [226, 220, 208], [238, 233, 222]],
  wall: [[104, 100, 92], [150, 146, 136], [186, 182, 172], [212, 208, 198]],
  metal: [[64, 68, 74], [104, 108, 116], [148, 152, 160], [206, 210, 218]],
  wood: [[92, 68, 42], [136, 104, 66], [170, 138, 94], [200, 172, 130]],
  paper: [[186, 180, 166], [218, 212, 198], [242, 238, 228], [252, 250, 244]],
  water: [[52, 110, 150], [84, 152, 192], [120, 190, 220], [172, 222, 242]],
  crimson: [[86, 10, 22], [142, 24, 38], [186, 52, 64], [222, 104, 104]],
  amber: [[132, 94, 18], [188, 142, 30], [222, 178, 54], [244, 214, 118]],
  // 全展開で追加した素材(報告済み): glass=ガラスの明線(錬成槽/瓶の縁) / led=稼働ランプの緑(サーバーラック)
  glass: [[150, 178, 190], [190, 214, 224], [220, 238, 244], [244, 252, 254]],
  led: [[26, 88, 44], [56, 140, 78], [96, 186, 118], [152, 226, 166]],
};
// 部屋パラメータ(★Ric調整)。密度・摩耗・揺らぎ・木目はここ+CFG(labRoomTiers)。
const LABV = {
  W0: 400, H0: 300, T: 16, cols: 22, rows: 14, rx: 24, ry: 64,
  rampSteps: 4, floorJitter: 1, grainLines: 2, wallH: 58, // §5ooo: 奥壁を+30px拡張(巨大監視スクリーンの壁面。床レイアウト不変)
  out: "rgb(13,11,9)", label: "rgba(150,142,128,.9)",
};
// シーン定義(配置=案Aから不変)。tier=出現する部屋tier(1開設/2稼働/3過密)。
const LAB_SCENE = {
  equip: [ // 機能設備(常設・当たり判定あり)
    { t: "desk", x: 3, y: 2 }, { t: "rack", x: 9, y: 1 }, { t: "tank", x: 16, y: 3 },
    { t: "rocket", x: 17, y: 9 }, { t: "shelfMain", x: 1, y: 7 },
  ],
  props: [ // プロップ16種(非インタラクティブ)
    // §5ooo: 壁面プロップはスクリーンを避けて再配置(pipe=壁最上部を横断しスクリーン背後へ / board=左マージンへ)
    { t: "pipe", x: 0, y: 0, tier: 1 }, { t: "board", x: 0.2, y: 0, tier: 2 },
    { t: "light", x: 5, y: 4, tier: 1 }, { t: "light", x: 12, y: 7, tier: 1 }, { t: "light", x: 17, y: 5, tier: 2 },
    { t: "oreCrate", x: 19, y: 2, tier: 1 }, { t: "oreCrate", x: 20, y: 3, tier: 2 }, { t: "oreCrate", x: 19, y: 6, tier: 3 }, { t: "oreCrate", x: 1, y: 12, tier: 3 },
    { t: "shelfJars", x: 13, y: 1, tier: 2 }, { t: "shelfJars", x: 15, y: 1, tier: 3 },
    { t: "waveMon", x: 7, y: 2, tier: 2 }, { t: "tubeRack", x: 5, y: 3, tier: 2 }, { t: "tubeRack", x: 15, y: 4, tier: 3 }, { t: "tubeRack", x: 12, y: 12, tier: 3 },
    { t: "papers", x: 2, y: 4, tier: 2 }, { t: "papers", x: 6, y: 5, tier: 3 }, { t: "papers", x: 12, y: 3, tier: 3 }, { t: "papers", x: 9, y: 11, tier: 3 },
    { t: "cables", x: 8, y: 4, tier: 2 }, { t: "cables", x: 11, y: 2, tier: 3 }, { t: "cables", x: 6, y: 12, tier: 3 },
    { t: "cart", x: 13, y: 6, tier: 2 }, { t: "cart", x: 19, y: 11.5, tier: 3 },
    { t: "ladder", x: 10, y: 9, tier: 3 }, { t: "trash", x: 4, y: 6, tier: 2 }, { t: "trash", x: 16, y: 7, tier: 3 },
    { t: "cup", x: 4.6, y: 2.4, tier: 2 }, { t: "cup", x: 13.5, y: 6.3, tier: 3 },
    { t: "ext", x: 8, y: 12.4, tier: 1 }, { t: "ext", x: 0.3, y: 6, tier: 2 },
    { t: "mold", x: 3, y: 8, len: 8, tier: 2 }, { t: "mold", x: 14, y: 10, len: 6, tier: 3 },
    { t: "stain", x: 7, y: 7, tier: 2 }, { t: "stain", x: 18, y: 12, tier: 3 }, { t: "stain", x: 2, y: 11, tier: 3 },
  ],
  wear: ["7,4", "8,4", "9,4", "10,4", "11,4", "12,4", "13,4", "14,4", "15,4", "7,5", "15,5"], // 摩耗(デスク⇔槽の通路のみ)
};

Object.assign(UI, {
  // ---------------- ページ制御 ----------------
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    this.renderHqLab();
    this._startLabVideo(); // §5ooo: 巨大監視スクリーンの生中継(方式1・スクリーン領域のみの差分描画)
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
      const toLow = (e) => { const r = cv.getBoundingClientRect(), b = this._labBlit || { k: 1, bx: 0, by: 0 }; return { x: ((e.clientX - r.left) * cv.width / r.width - b.bx) / b.k, y: ((e.clientY - r.top) * cv.height / r.height - b.by) / b.k }; };
      cv.addEventListener("click", (e) => { const p = toLow(e); const z = this._hqlabZoneAt(p.x, p.y); if (z) this.openLabPanel(z); });
      cv.addEventListener("mousemove", (e) => { const p = toLow(e); cv.style.cursor = this._hqlabZoneAt(p.x, p.y) ? "pointer" : "default"; });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); });
  },

  // ---------------- tier ----------------
  // 部屋の密度tier(T1開設/T2稼働/T3過密)=鉱石投資進行度labInvestへのマッピングのみ(CFG.labRoomTiers・ロジック/セーブ非接触)
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

  // ---------------- 座標(低解像度・トップダウン) ----------------
  _labTile(gx, gy) { return { x: LABV.rx + gx * LABV.T, y: LABV.ry + gy * LABV.T }; },
  _rc(m, i) { const v = RAMP[m][Math.min(i, LABV.rampSteps - 1)]; return `rgb(${v[0]},${v[1]},${v[2]})`; },
  _pxl(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  _dth(c, x, y, w, h, col) { c.fillStyle = col; for (let yy = Math.round(y); yy < y + h; yy++) for (let xx = Math.round(x) + (yy % 2); xx < x + w; xx += 2) c.fillRect(xx, yy, 1, 1); },
  _ol(c, x, y, w, h, m) { // セレクティブ輪郭(最暗+上辺明抜き)
    c.strokeStyle = this._rc(m, 0); c.lineWidth = 1; c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w, h);
    this._pxl(c, x + 1, y, w - 1, 1, this._rc(m, 3));
  },

  // ---------------- 当たり判定(機能設備のみ・プロップ非対象) ----------------
  _hqlabZones() {
    const T = LABV.T;
    const zr = (gx, gy, wT, hT) => { const p = this._labTile(gx, gy); return { x0: p.x - 3, y0: p.y - 3, x1: p.x + wT * T + 3, y1: p.y + hT * T + 3 }; };
    return [
      { key: "desks", rects: [zr(3, 2, 4, 2), zr(9, 1, 2, 1)] },   // 投資端末+サーバーラック
      { key: "tank", rects: [zr(16, 3, 3, 3)] },
      { key: "rocket", rects: [zr(17, 9, 3, 3)] },
      { key: "shelf", rects: [zr(1, 7, 2, 4)] },
    ];
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 描画(静的シーン) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    if (!this._labLow) { this._labLow = document.createElement("canvas"); this._labLow.width = LABV.W0; this._labLow.height = LABV.H0; }
    const c = this._labLow.getContext("2d");
    const T = LABV.T, RX = LABV.rx, RY = LABV.ry, roomTier = this.labRoomTier();
    const hash2 = (a, b) => (((a + 7) * 73856093) ^ ((b + 3) * 19349663)) >>> 0;
    this._pxl(c, 0, 0, LABV.W0, LABV.H0, LABV.out); // 照明の外
    // --- 床(揺らぎ+目地+摩耗) ---
    const wear = new Set(LAB_SCENE.wear);
    for (let gx = 0; gx < LABV.cols; gx++) for (let gy = 0; gy < LABV.rows; gy++) {
      const X = RX + gx * T, Y = RY + gy * T;
      const base = (gx + gy) % 2 ? 1 : 2;
      const j = (hash2(gx, gy) % 2) * LABV.floorJitter;
      this._pxl(c, X, Y, T, T, this._rc("floor", Math.min(3, base + j)));
      this._pxl(c, X, Y + T - 1, T, 1, this._rc("floor", 0));
      this._pxl(c, X + T - 1, Y, 1, T, this._rc("floor", 0));
      this._pxl(c, X, Y, T, 1, this._rc("floor", 3));
      if (roomTier >= 2 && wear.has(gx + "," + gy)) this._dth(c, X + 2, Y + 4, T - 4, T - 7, this._rc("floor", 0)); // 摩耗=稼働後のみ
    }
    // --- 壁(§5ooo拡張: 高い奥壁=監視スクリーンの壁面。パネル分割+上辺明抜き+巾木2段+側壁+手前縁) ---
    const WH = LABV.wallH;
    this._pxl(c, RX - 6, RY - WH, LABV.cols * T + 12, WH, this._rc("wall", 1));
    this._pxl(c, RX - 6, RY - WH, LABV.cols * T + 12, 2, this._rc("wall", 3));
    for (let i = 1; i < 8; i++) this._pxl(c, RX - 6 + i * (LABV.cols * T + 12) / 8, RY - WH + 2, 1, WH - 11, this._rc("wall", 0));
    this._pxl(c, RX - 6, RY - 7, LABV.cols * T + 12, 2, this._rc("wall", 2));
    this._pxl(c, RX - 6, RY - 5, LABV.cols * T + 12, 5, this._rc("wall", 0));
    this._pxl(c, RX - 6, RY, 6, LABV.rows * T, this._rc("wall", 0));
    this._pxl(c, RX - 5, RY, 2, LABV.rows * T, this._rc("wall", 2));
    this._pxl(c, RX + LABV.cols * T, RY, 6, LABV.rows * T, this._rc("wall", 0));
    this._pxl(c, RX + LABV.cols * T + 1, RY, 2, LABV.rows * T, this._rc("wall", 1));
    this._pxl(c, RX - 6, RY + LABV.rows * T, LABV.cols * T + 12, 5, this._rc("wall", 0));
    this._pxl(c, RX - 6, RY + LABV.rows * T, LABV.cols * T + 12, 2, this._rc("wall", 2));
    // --- 設備+プロップ(tierフィルタ・yソート=描画順) ---
    const items = [];
    for (const e of LAB_SCENE.equip) items.push(e);
    for (const p of LAB_SCENE.props) if ((p.tier || 1) <= roomTier) items.push(p);
    items.sort((p, q) => p.y - q.y);
    for (const it of items) {
      const pt = this._labTile(it.x, it.y);
      const fn = this._labSpr[it.t];
      if (fn) fn.call(this, c, pt.x, pt.y, it);
    }
    // --- 巨大監視スクリーン(§5ooo・T1常設=統率は成長より先にある)。プロップの後に描く=壁面(pipe)がスクリーン背後へ回る ---
    if (CFG.labScreenOn) this._labDrawScreenHousing(c);
    else this._labScreenLowRect = null;
    // --- 整数倍ブリット ---
    const k = Math.max(1, Math.floor(Math.min(W / LABV.W0, H / LABV.H0)));
    const bx = Math.floor((W - LABV.W0 * k) / 2), by = Math.floor((H - LABV.H0 * k) / 2);
    this._labBlit = { k, bx, by };
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = LABV.out; g.fillRect(0, 0, W, H);
    g.drawImage(this._labLow, 0, 0, LABV.W0, LABV.H0, bx, by, LABV.W0 * k, LABV.H0 * k);
    // 名札(共通UI層・シーン内はドットのみ)
    g.fillStyle = LABV.label; g.font = "12px system-ui";
    const lbl = (gx, gy, t) => { const p = this._labTile(gx, gy); g.fillText(t, bx + p.x * k - g.measureText(t).width / 2, by + p.y * k); };
    lbl(5.2, 5.2, "投資端末"); lbl(17.6, 7.2, "錬成槽"); lbl(18.6, 13.2, "宇宙港"); lbl(2.1, 12.2, "標本棚");
  },

  // ---------------- 巨大監視スクリーン(§5ooo「本部はこちらを見ている」) ----------------
  // 筐体・ベゼル=GBA規律(RAMP/セレクティブ輪郭/整数倍)。映像面のみ滑らかなブラー画=整数倍規律の意図的な例外
  // (二つの場所の質感対比を映像面が媒介する・HANDOFF §5ooo に明記)。装飾は走査線のみ(監視装置の記号)。
  _labScreenLowRect: null,
  _labDrawScreenHousing(c) {
    const T = LABV.T, RX = LABV.rx, RY = LABV.ry;
    const vw = Math.min(CFG.labScreenTilesW * T, LABV.cols * T - 32), vh = CFG.labScreenVidH;
    const hw = vw + 6, hh = vh + 6;
    const hx = RX + Math.round((LABV.cols * T - hw) / 2), hy = RY - LABV.wallH;
    this._pxl(c, hx, hy, hw, hh, this._rc("metal", 0));            // 筐体
    this._pxl(c, hx + 1, hy + 1, hw - 2, 1, this._rc("metal", 2)); // ベゼル内の面取り
    this._pxl(c, hx + 1, hy + hh - 2, hw - 2, 1, this._rc("metal", 1));
    this._pxl(c, hx + 3, hy + 3, vw, vh, "rgb(9,11,14)");          // 映像面(消灯下地。生中継が上書き)
    this._ol(c, hx, hy, hw, hh, "metal");                          // セレクティブ輪郭
    this._labScreenLowRect = { x: hx + 3, y: hy + 3, w: vw, h: vh };
  },

  // ---- 生中継(方式1): 同一ドキュメントの飼育槽canvasを低頻度でブラー転写。スクリーン領域のみの差分描画 ----
  _startLabVideo() {
    if (this._labVidOn) return;
    this._labVidOn = true;
    this._labVidLast = 0;
    const step = () => {
      if (!this.hqLabOpen() || !CFG.labScreenOn) { this._labVidOn = false; return; } // ページを離れたら自然停止
      const now = performance.now();
      if (now - this._labVidLast >= 1000 / Math.max(1, CFG.labScreenFps)) {
        this._labVidLast = now;
        this._drawLabScreenVideo(now / 1000);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  _drawLabScreenVideo(tSec) {
    const r = this._labScreenLowRect, b = this._labBlit;
    const cv = document.getElementById("hqlab-canvas"), src = document.getElementById("game");
    if (!r || !b || !cv || !src || !src.width || !src.height) return;
    const g = cv.getContext("2d");
    const dx = b.bx + r.x * b.k, dy = b.by + r.y * b.k, dw = r.w * b.k, dh = r.h * b.k;
    // 飼育槽の中央を切り出し(cover=アスペクト維持・UIは映さず盤面のみ)
    const da = dw / dh;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sw / sh > da) { sw = Math.round(sh * da); sx = Math.round((src.width - sw) / 2); }
    else { sh = Math.round(sw / da); sy = Math.round((src.height - sh) / 2); }
    if (!this._labVid) this._labVid = document.createElement("canvas");
    const tmp = this._labVid, tw = Math.round(dw), th = Math.round(dh);
    if (tmp.width !== tw || tmp.height !== th) { tmp.width = tw; tmp.height = th; }
    const tc = tmp.getContext("2d");
    tc.imageSmoothingEnabled = true;
    // 強ブラー=気配の解像度。ctx.filter対応=filter / 非対応=縮小→拡大の近似ブラーへ自動フォールバック
    let filterOk = false;
    try { tc.filter = `blur(${CFG.labScreenBlur}px)`; filterOk = typeof tc.filter === "string" && tc.filter.indexOf("blur") === 0; } catch (e) {}
    if (filterOk) {
      tc.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
      tc.filter = "none";
    } else {
      if (!this._labVidSmall) this._labVidSmall = document.createElement("canvas");
      const sm = this._labVidSmall, f = Math.max(2, Math.round(CFG.labScreenBlur * 1.5));
      const smw = Math.max(8, Math.round(tw / f)), smh = Math.max(6, Math.round(th / f));
      if (sm.width !== smw || sm.height !== smh) { sm.width = smw; sm.height = smh; }
      const sc = sm.getContext("2d");
      sc.imageSmoothingEnabled = true;
      sc.drawImage(src, sx, sy, sw, sh, 0, 0, smw, smh);
      tc.drawImage(sm, 0, 0, smw, smh, 0, 0, tw, th);
    }
    // 生気=緩やかな明滅(生中継の実動きに重ねるだけ・reduced-motionで停止)
    const reduced = (typeof Motion !== "undefined") && Motion.reduced;
    if (!reduced && CFG.labScreenShimmer > 0) {
      const a = (Math.sin(tSec * 1.7) * 0.5 + 0.5) * CFG.labScreenShimmer;
      tc.fillStyle = "rgba(0,0,0," + a.toFixed(3) + ")";
      tc.fillRect(0, 0, tw, th);
    }
    // 走査線(監視装置の記号・CFGでON/OFF+濃度。揺らぎはreducedで停止)
    if (CFG.labScreenScanOn && CFG.labScreenScanAlpha > 0) {
      tc.fillStyle = "rgba(8,10,12," + CFG.labScreenScanAlpha + ")";
      const drift = reduced ? 0 : Math.floor(tSec * 8) % 3;
      for (let yy = drift; yy < th; yy += 3) tc.fillRect(0, yy, tw, 1);
    }
    g.drawImage(tmp, dx, dy); // 等倍転写=部屋全体は再描画しない(差分描画)
  },

  // ---------------- スプライト(GBA規律・検証カット基準) ----------------
  _labSpr: {
    desk(c, x, y) { // 投資端末: 金属=鋭ハイライト+パネル分割+通気スリット+画面2トーン+深紅波形
      const north = this._labLayoutVariant === "b"; // §5ooo案ロ: 管制室型=モニタ群を北辺(スクリーン側)へ向ける
      const my = north ? y + 3 : y + 5;             // モニタ行のy(案ロ=北辺寄せ)
      this._dth(c, x + 1, y + 28, 64, 3, this._rc("floor", 0));
      this._pxl(c, x, y, 64, 30, this._rc("metal", 1));
      this._pxl(c, x, y, 64, 4, this._rc("metal", 2)); this._pxl(c, x, y, 64, 1, this._rc("metal", 3));
      this._pxl(c, x, y + 26, 64, 4, this._rc("metal", 0));
      this._pxl(c, x + 32, y + 2, 1, 26, this._rc("metal", 0));
      for (let i = 0; i < 4; i++) this._pxl(c, x + 52, y + 8 + i * 4, 8, 1, this._rc("metal", 0));
      this._pxl(c, x + 5, my, 22, 14, this._rc("metal", 0));
      this._pxl(c, x + 7, my + 2, 18, 10, this._rc("water", 1)); this._pxl(c, x + 7, my + 2, 18, 3, this._rc("water", 2)); this._pxl(c, x + 8, my + 10, 16, 1, this._rc("water", 0));
      this._pxl(c, x + 30, my + 2, 15, 11, this._rc("metal", 0)); this._pxl(c, x + 32, my + 4, 11, 7, this._rc("crimson", 0));
      c.strokeStyle = this._rc("crimson", 2); c.beginPath();
      for (let i = 0; i <= 10; i++) { const yy = my + 7.5 + ((i % 4 === 1) ? -2 : (i % 4 === 3) ? 2 : 0); i ? c.lineTo(x + 33 + i, yy) : c.moveTo(x + 33, yy); }
      c.stroke();
      this._pxl(c, x + 48, y + 21, 10, 6, this._rc("paper", 3)); this._pxl(c, x + 48, y + 25, 10, 2, this._rc("paper", 1));
      this._ol(c, x, y, 64, 30, "metal");
    },
    tank(c, x, y) { // 錬成槽: 金属リム+ボルト+液面ディザ+明線+深紅の芯(唯一の暖色その1)
      this._dth(c, x + 1, y + 46, 48, 3, this._rc("floor", 0));
      this._pxl(c, x, y, 48, 48, this._rc("metal", 1));
      this._pxl(c, x, y, 48, 2, this._rc("metal", 3)); this._pxl(c, x, y + 46, 48, 2, this._rc("metal", 0));
      for (const [bx2, by2] of [[2, 2], [44, 2], [2, 44], [44, 44]]) this._pxl(c, x + bx2, y + by2, 2, 2, this._rc("metal", 3));
      this._pxl(c, x + 4, y + 4, 40, 40, this._rc("water", 1));
      this._dth(c, x + 5, y + 5, 38, 8, this._rc("water", 2));
      this._pxl(c, x + 5, y + 5, 38, 1, this._rc("glass", 3));
      this._pxl(c, x + 6, y + 38, 36, 5, this._rc("water", 0));
      this._dth(c, x + 16, y + 16, 16, 4, this._rc("crimson", 1));
      this._pxl(c, x + 20, y + 19, 8, 8, this._rc("crimson", 2)); this._pxl(c, x + 21, y + 20, 3, 2, this._rc("crimson", 3));
      this._ol(c, x, y, 48, 48, "metal");
    },
    rocket(c, x, y) { // 宇宙港: 発射口+機体上面+琥珀の先端(唯一の暖色その2)
      this._dth(c, x + 1, y + 46, 48, 3, this._rc("floor", 0));
      this._pxl(c, x, y, 48, 48, this._rc("metal", 0));
      this._pxl(c, x + 2, y + 2, 44, 44, this._rc("metal", 1));
      for (const [bx2, by2] of [[3, 3], [42, 3], [3, 42], [42, 42]]) this._pxl(c, x + bx2, y + by2, 3, 3, this._rc("amber", 1)); // 警告マーカー
      this._pxl(c, x + 8, y + 8, 32, 32, this._rc("metal", 2)); this._pxl(c, x + 8, y + 8, 32, 2, this._rc("metal", 3));
      this._pxl(c, x + 14, y + 14, 20, 20, this._rc("paper", 2)); this._pxl(c, x + 14, y + 14, 20, 2, this._rc("paper", 3)); // 機体(白)
      this._pxl(c, x + 19, y + 19, 10, 10, this._rc("amber", 2)); this._pxl(c, x + 20, y + 20, 4, 3, this._rc("amber", 3)); // 先端(琥珀)
      this._pxl(c, x + 22, y + 5, 4, 3, this._rc("crimson", 2)); // 管制灯
      this._ol(c, x, y, 48, 48, "metal");
    },
    shelfMain(c, x, y) { // 標本棚(大): 木目+棚板影+瓶2トーン+金属蓋
      this._dth(c, x + 1, y + 62, 32, 3, this._rc("floor", 0));
      this._pxl(c, x, y, 32, 64, this._rc("wood", 1));
      this._pxl(c, x, y, 32, 2, this._rc("wood", 3));
      for (let i = 0; i < LABV.grainLines; i++) this._pxl(c, x + 6 + i * 16, y + 3, 1, 59, this._rc("wood", 0));
      for (let r = 0; r < 4; r++) {
        this._pxl(c, x + 2, y + 14 + r * 15, 28, 2, this._rc("wood", 0));
        for (let j = 0; j < 3; j++) { const jx = x + 5 + j * 9, jy = y + 4 + r * 15; this._pxl(c, jx, jy, 6, 9, this._rc("water", 1)); this._pxl(c, jx + 1, jy + 1, 2, 7, this._rc("water", 2)); this._pxl(c, jx, jy, 6, 2, this._rc("metal", 2)); }
      }
      this._ol(c, x, y, 32, 64, "wood");
    },
    rack(c, x, y) { // サーバーラック: 金属+スリット+LED(緑/琥珀・点滅させない)
      this._dth(c, x + 1, y + 14, 32, 3, this._rc("floor", 0));
      this._pxl(c, x, y, 32, 16, this._rc("metal", 0));
      this._pxl(c, x + 2, y + 2, 28, 12, this._rc("metal", 1));
      this._pxl(c, x + 2, y + 2, 28, 1, this._rc("metal", 2));
      for (let i = 0; i < 3; i++) this._pxl(c, x + 4, y + 5 + i * 3, 18, 1, this._rc("metal", 0)); // スリット
      for (let i = 0; i < 3; i++) this._pxl(c, x + 25, y + 4 + i * 3, 2, 2, i === 1 ? this._rc("amber", 2) : this._rc("led", 2));
      this._ol(c, x, y, 32, 16, "metal");
    },
    shelfJars(c, x, y) { this._pxl(c, x, y, 28, 12, this._rc("wood", 1)); this._pxl(c, x, y, 28, 2, this._rc("wood", 3)); this._pxl(c, x + 2, y + 10, 24, 1, this._rc("wood", 0)); for (let j = 0; j < 5; j++) { this._pxl(c, x + 2 + j * 5, y + 3, 3, 7, this._rc("water", 1)); this._pxl(c, x + 3 + j * 5, y + 4, 1, 5, this._rc("water", 2)); this._pxl(c, x + 2 + j * 5, y + 2, 3, 1, this._rc("glass", 2)); } this._ol(c, x, y, 28, 12, "wood"); },
    papers(c, x, y) { this._pxl(c, x, y, 12, 10, this._rc("paper", 2)); this._pxl(c, x, y + 8, 12, 2, this._rc("paper", 1)); this._pxl(c, x + 2, y - 2, 12, 10, this._rc("paper", 3)); this._pxl(c, x + 2, y + 6, 12, 2, this._rc("paper", 2)); this._pxl(c, x + 4, y, 8, 1, this._rc("paper", 0)); this._pxl(c, x + 4, y + 2, 6, 1, this._rc("paper", 0)); c.strokeStyle = this._rc("paper", 1); c.strokeRect(x + 2.5, y - 1.5, 11, 9); },
    cables(c, x, y) { c.lineWidth = 2; c.strokeStyle = this._rc("metal", 0); c.beginPath(); c.moveTo(x, y + 8); c.bezierCurveTo(x + 6, y, x + 10, y + 14, x + 16, y + 5); c.stroke(); c.lineWidth = 1; c.strokeStyle = this._rc("crimson", 1); c.beginPath(); c.moveTo(x + 1, y + 10); c.bezierCurveTo(x + 7, y + 3, x + 9, y + 15, x + 15, y + 8); c.stroke(); c.strokeStyle = this._rc("metal", 2); c.beginPath(); c.moveTo(x, y + 7); c.bezierCurveTo(x + 6, y - 1, x + 10, y + 13, x + 16, y + 4); c.stroke(); },
    waveMon(c, x, y) { const north = this._labLayoutVariant === "b"; const sy2 = north ? y + 1 : y + 2; this._dth(c, x + 1, y + 15, 22, 2, this._rc("floor", 0)); this._pxl(c, x, y, 22, 16, this._rc("metal", 1)); this._pxl(c, x, y, 22, 1, this._rc("metal", 3)); if (north) this._pxl(c, x + 2, y + 13, 18, 2, this._rc("metal", 0)); /* §5ooo案ロ: 南辺スタンド=画面が北(スクリーン側)を向く */ this._pxl(c, x + 2, sy2, 18, 12, this._rc("crimson", 0)); c.strokeStyle = this._rc("crimson", 2); c.beginPath(); for (let i = 0; i <= 16; i++) { const yy = sy2 + 6.5 + ((i % 4 === 1) ? -3 : (i % 4 === 3) ? 3 : 0); i ? c.lineTo(x + 3 + i, yy) : c.moveTo(x + 3, yy); } c.stroke(); this._pxl(c, x + 3, sy2 + 1, 6, 1, this._rc("crimson", 1)); this._ol(c, x, y, 22, 16, "metal"); },
    tubeRack(c, x, y) { this._pxl(c, x, y + 6, 18, 6, this._rc("metal", 1)); this._pxl(c, x, y + 6, 18, 1, this._rc("metal", 3)); this._pxl(c, x, y + 11, 18, 1, this._rc("metal", 0)); for (let j = 0; j < 4; j++) { const cx2 = x + 2 + j * 4; this._pxl(c, cx2, y, 2, 9, this._rc("glass", 1)); this._pxl(c, cx2, y + 4, 2, 4, j % 2 ? this._rc("crimson", 2) : this._rc("water", 2)); this._pxl(c, cx2, y, 1, 3, this._rc("glass", 3)); } },
    oreCrate(c, x, y) { this._dth(c, x + 1, y + 14, 20, 3, this._rc("floor", 0)); this._pxl(c, x, y, 20, 16, this._rc("wood", 1)); this._pxl(c, x, y, 20, 3, this._rc("wood", 2)); this._pxl(c, x, y, 20, 1, this._rc("wood", 3)); this._pxl(c, x + 3, y + 6, 14, 1, this._rc("wood", 0)); this._pxl(c, x + 3, y + 11, 14, 1, this._rc("wood", 0)); for (const [bx2, by2] of [[0, 0], [17, 0], [0, 13], [17, 13]]) this._pxl(c, x + bx2, y + by2, 3, 3, this._rc("metal", 2)); this._pxl(c, x + 4, y + 3, 5, 4, this._rc("amber", 2)); this._pxl(c, x + 5, y + 3, 2, 1, this._rc("amber", 3)); this._pxl(c, x + 11, y + 4, 5, 4, this._rc("water", 2)); this._pxl(c, x + 12, y + 4, 2, 1, this._rc("water", 3)); this._ol(c, x, y, 20, 16, "wood"); },
    cart(c, x, y) { this._dth(c, x + 1, y + 14, 26, 3, this._rc("floor", 0)); this._pxl(c, x, y, 26, 12, this._rc("metal", 1)); this._pxl(c, x, y, 26, 2, this._rc("metal", 2)); this._pxl(c, x, y, 26, 1, this._rc("metal", 3)); this._pxl(c, x, y + 10, 26, 2, this._rc("metal", 0)); this._pxl(c, x + 2, y + 12, 4, 3, this._rc("metal", 0)); this._pxl(c, x + 20, y + 12, 4, 3, this._rc("metal", 0)); this._pxl(c, x + 4, y + 3, 8, 6, this._rc("wood", 1)); this._pxl(c, x + 4, y + 3, 8, 1, this._rc("wood", 3)); this._ol(c, x, y, 26, 12, "metal"); },
    mold(c, x, y, it) { const L = (it.len || 5) * LABV.T; this._pxl(c, x, y, L, 3, this._rc("metal", 0)); this._pxl(c, x, y, L, 1, this._rc("metal", 2)); for (let i = 0; i < L; i += 12) this._pxl(c, x + i, y + 1, 1, 2, this._rc("metal", 1)); },
    pipe(c) { const RX = LABV.rx, RY = LABV.ry - LABV.wallH + 8, W = LABV.cols * LABV.T; this._pxl(c, RX - 4, RY, W + 8, 3, this._rc("metal", 1)); this._pxl(c, RX - 4, RY, W + 8, 1, this._rc("metal", 3)); for (let i = 0; i < 7; i++) this._pxl(c, RX + 20 + i * 50, RY - 1, 3, 5, this._rc("metal", 0)); this._dth(c, RX + 60, RY + 3, 6, 4, this._rc("paper", 3)); }, // §5ooo: 壁最上部へ(スクリーン背後を横断)
    ladder(c, x, y) { this._pxl(c, x, y, 3, 26, this._rc("amber", 1)); this._pxl(c, x, y, 1, 26, this._rc("amber", 3)); this._pxl(c, x + 11, y, 3, 26, this._rc("amber", 1)); this._pxl(c, x + 13, y, 1, 26, this._rc("amber", 0)); for (let i = 0; i < 4; i++) { this._pxl(c, x + 3, y + 3 + i * 6, 8, 2, this._rc("amber", 2)); this._pxl(c, x + 3, y + 4 + i * 6, 8, 1, this._rc("amber", 0)); } c.strokeStyle = this._rc("amber", 0); c.strokeRect(x + 0.5, y + 0.5, 13, 25); },
    trash(c, x, y) { this._dth(c, x, y + 11, 11, 2, this._rc("floor", 0)); this._pxl(c, x, y, 10, 12, this._rc("metal", 1)); this._pxl(c, x + 1, y, 1, 12, this._rc("metal", 2)); this._pxl(c, x + 8, y, 2, 12, this._rc("metal", 0)); this._pxl(c, x, y, 10, 2, this._rc("metal", 3)); this._pxl(c, x + 2, y - 2, 6, 2, this._rc("paper", 3)); this._ol(c, x, y, 10, 12, "metal"); },
    cup(c, x, y) { this._pxl(c, x, y, 5, 5, this._rc("paper", 3)); this._pxl(c, x, y + 3, 5, 2, this._rc("paper", 1)); this._pxl(c, x + 5, y + 1, 2, 2, this._rc("paper", 2)); this._pxl(c, x + 1, y + 1, 3, 1, this._rc("wood", 1)); },
    ext(c, x, y) { this._dth(c, x, y + 11, 7, 2, this._rc("floor", 0)); this._pxl(c, x, y, 6, 12, this._rc("crimson", 1)); this._pxl(c, x + 1, y, 1, 12, this._rc("crimson", 3)); this._pxl(c, x + 4, y, 2, 12, this._rc("crimson", 0)); this._pxl(c, x + 1, y - 2, 3, 2, this._rc("metal", 2)); this._pxl(c, x + 1, y - 2, 3, 1, this._rc("metal", 3)); c.strokeStyle = this._rc("crimson", 0); c.strokeRect(x + 0.5, y + 0.5, 5, 11); },
    board(c, x, y) { this._pxl(c, x, y - 20, 40, 16, this._rc("paper", 3)); this._pxl(c, x, y - 20, 40, 1, this._rc("paper", 2)); this._pxl(c, x, y - 5, 40, 1, this._rc("metal", 2)); c.strokeStyle = this._rc("paper", 0); c.beginPath(); c.moveTo(x + 4, y - 14); c.lineTo(x + 20, y - 14); c.moveTo(x + 4, y - 10); c.lineTo(x + 28, y - 10); c.stroke(); c.strokeStyle = this._rc("crimson", 1); c.beginPath(); c.moveTo(x + 24, y - 16); c.lineTo(x + 34, y - 8); c.stroke(); c.strokeStyle = this._rc("metal", 0); c.strokeRect(x + 0.5, y - 20.5, 40, 16); this._pxl(c, x + 1, y - 20, 39, 1, this._rc("metal", 3)); },
    stain(c, x, y) { this._dth(c, x, y, 14, 8, this._rc("floor", 0)); this._dth(c, x + 3, y + 2, 8, 4, this._rc("floor", 1)); },
    light(c, x, y) { this._pxl(c, x + 3, y + 3, 10, 10, this._rc("metal", 2)); this._pxl(c, x + 4, y + 4, 8, 8, this._rc("paper", 3)); this._pxl(c, x + 5, y + 5, 6, 6, "rgb(255,252,238)"); this._pxl(c, x + 5, y + 5, 3, 2, "rgb(255,255,250)"); },
  },
});

// dev用: #hqlab で本部を開く(#hqlab-desks等でパネル/#hqlab-t1|t2|t3=部屋tierの表示のみ上書き/#hqlab-fullは互換=T3)。
// §5ooo比較試作: #hqlab-lb=案ロ(管制室型・T3) / #hqlab-t3=案イ(現配置維持・T3)。
if (typeof window !== "undefined") window.addEventListener("load", () => {
  const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full|t1|t2|t3|lb))?$/);
  if (m && UI.openHqLab) setTimeout(() => {
    if (m[1] === "full" || m[1] === "t3") UI._labRoomTierOverride = 3;
    else if (m[1] === "t2") UI._labRoomTierOverride = 2;
    else if (m[1] === "t1") UI._labRoomTierOverride = 1;
    else if (m[1] === "lb") { UI._labRoomTierOverride = 3; UI._labLayoutVariant = "b"; }
    UI.openHqLab();
    if (m[1] && !/^t[123]$|^full$|^lb$/.test(m[1])) UI.openLabPanel(m[1]);
  }, 60);
});
