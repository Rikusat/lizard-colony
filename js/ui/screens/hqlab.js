// =============================================================
// screens/hqlab — 本部v5「HOLO COMMAND」(ディレクター試作の本採用・2026-07-25)
// 意匠の唯一の正 = docs/design/hq-holo-command-poc.html(原本死守)。
// 本ファイルはPoCの「再実装」ではなく「データ配線」: 描画・配色・タイポ・レイアウト・
// アニメ(起動/回転環/スイープ/ロックオン/視差)はPoCを逐語移植し、疑似データのみ実データへ差し替える。
// 配線点は「配線:」コメントで明示。意匠変更が必要な場合は実装前にRic承認(無断改善の禁止)。
// 旧GBA研究室(R4-1復元)・v3管制室・v4ドックはgit記録(GBA復元=115049a)。
// 負荷方針: PoCの本体=常時アニメ(回転環/スイープ)のため本部滞在中のみrAF全描画をPoC忠実に維持(実測報告)。
// 公開API(openHqLab/renderHqLab/labTiers/_hqlabZones等)は従来名を維持=QA/コア契約不変。
// =============================================================

// ---- PoC palette(逐語) ----
const HOLO = {
  W: 1600, H: 900,
  AM: "#ffb547", AMd: "rgba(255,181,71,", CR: "#d2384a", CRd: "rgba(210,56,74,",
  WH: "rgba(223,233,238,", FONT_T: 'px ui-monospace, "Consolas", monospace',
  FONT_J: 'px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
  R: 212, // 中央フィード半径
};

Object.assign(UI, {
  // ---------------- ページ制御(公開API名維持) ----------------
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"), lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq"); if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    this._holoT0 = null; // 起動シーケンスは開くたび再生(CFG.holoBootOn=falseでスキップ/holoBootSpeedで短縮)
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
    this._buildHqMenu(); // §14: 本部右メニュー(常設導線・動注入=飼育槽レイアウト非接触)
    const cv = document.getElementById("hqlab-canvas");
    if (cv) {
      const toDesign = (e) => { const r = cv.getBoundingClientRect(), b = this._labBlit || { k: 1, bx: 0, by: 0 }; return { x: ((e.clientX - r.left) * cv.width / r.width - b.bx) / b.k, y: ((e.clientY - r.top) * cv.height / r.height - b.by) / b.k }; };
      cv.addEventListener("click", (e) => {
        const p = toDesign(e); const z = this._hqlabZoneAt(p.x, p.y);
        if (z === "feed") this.closeHqLab(); // 配線: 中央フィード→飼育槽へ戻る
        else if (z === "archive") this.openDex(); // 配線: 標本アーカイブ→図鑑
        else if (z) this.openLabPanel(z);
      });
      cv.addEventListener("mousemove", (e) => {
        const p = toDesign(e);
        cv.style.cursor = this._hqlabZoneAt(p.x, p.y) ? "pointer" : "crosshair";
        // PoC: mouse parallax(逐語・設計空間正規化)
        this._holoMx = (p.x / HOLO.W - 0.5) * 2; this._holoMy = (p.y / HOLO.H - 0.5) * 2;
      });
    }
    window.addEventListener("resize", () => { if (this.hqLabOpen()) this.renderHqLab(); });
  },

  // §14: 本部右メニュー(黒空間クリック依存の解消)。#hqlab-wrapを#hqlab-rowで包み右列に注入。
  // 既存openLabPanel/openDexを呼ぶだけ=パネルロジック非接触。二重導線(ホロモジュール直クリックも存続)。
  _buildHqMenu() {
    if (document.getElementById("hqlab-menu")) return;
    const wrap = document.getElementById("hqlab-wrap");
    if (!wrap || !wrap.parentNode) return;
    const row = document.createElement("div");
    row.id = "hqlab-row";
    wrap.parentNode.insertBefore(row, wrap);
    row.appendChild(wrap);
    const nav = document.createElement("nav");
    nav.id = "hqlab-menu";
    nav.style.setProperty("--hqmenu-w", (CFG.hqMenuWidth || 200) + "px");
    nav.style.setProperty("--hqmenu-w-narrow", (CFG.hqMenuWidthNarrow || 52) + "px");
    nav.style.setProperty("--hqmenu-fs", CFG.hqMenuFontScale != null ? CFG.hqMenuFontScale : 1); // 裁定①: フォント係数
    nav.style.setProperty("--hqmenu-gap", (CFG.hqMenuGap != null ? CFG.hqMenuGap : 12) + "px");
    nav.style.setProperty("--hqmenu-pady", (CFG.hqMenuPadY != null ? CFG.hqMenuPadY : 96) + "px");
    nav.classList.add((CFG.hqMenuLayout || "spread") === "spread" ? "hm-spread" : "hm-stack"); // 裁定①: 縦の使い切り
    for (const it of (CFG.hqMenuItems || [])) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.panel = it.key;
      b.title = it.jp;
      b.innerHTML = `${Icon.svg(it.icon)}<span class="hm-tx"><span class="hm-jp">${it.jp}</span><span class="hm-en">${it.en}</span></span>`;
      b.addEventListener("click", () => { if (it.key === "dex") this.openDex(); else this.openLabPanel(it.key); });
      nav.appendChild(b);
    }
    row.appendChild(nav);
  },

  // ---------------- tier(labRoomTiers=部屋→点灯モジュール数へ) ----------------
  labRoomTier() {
    if (this._labRoomTierOverride) return this._labRoomTierOverride;
    const inv = Game.labInvestLv("desks");
    const th = CFG.labRoomTiers || [1, 2];
    return inv >= th[1] ? 3 : inv >= th[0] ? 2 : 1;
  },
  labTiers() { // 既存互換(update()の変化検知)
    if (this._labTierOverride) return this._labTierOverride;
    const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
    const rk = Game.ensureRocket();
    return {
      desks: Math.min(4, 1 + Game.labInvestLv("desks")),
      tank: tierOf(Game.hqRank ? Game.hqRank() : ((Game.state.headquarters || {}).rank || 1), CFG.labTankTiers), // V6-P1-2: 駆動源=HQ Lv(研究デスクはP3-3でβ非公開になり不可視のため)
      rocket: rk.done ? 4 : rk.stage >= 2 ? 3 : (rk.stage >= 1 || rk.invested > 0) ? 2 : 1,
      shelf: tierOf(Object.keys(Game.state.dex || {}).length, CFG.labShelfTiers),
      room: this.labRoomTier(),
    };
  },

  // ---------------- 当たり判定(設計座標1600×900・モジュール=PoCレイアウトの矩形) ----------------
  _hqlabZones() {
    const W = HOLO.W, H = HOLO.H;
    const zs = [
      { key: "tank", rects: [{ x0: 64, y0: 118, x1: 64 + 252, y1: 118 + 250 }] },          // 錬成槽モジュール→錬成パネル
      { key: "archive", rects: [{ x0: 64, y0: 404, x1: 64 + 252, y1: 404 + 210 }] },       // 標本アーカイブ→図鑑
      { key: "desks", rects: [{ x0: W - 372, y0: H * 0.30 + 96, x1: W - 372 + 308, y1: H * 0.30 + 96 + 190 }] }, // 投資リング→研究デスク
      { key: "rocket", rects: [{ x0: W - 260, y0: 30, x1: W - 40, y1: 78 }] },             // 裁定①: SPACEPORTインジケータ(ヘッダ右)→宇宙港パネル
      { key: "feed", rects: [{ x0: W * 0.5 - HOLO.R, y0: H * 0.465 - HOLO.R, x1: W * 0.5 + HOLO.R, y1: H * 0.465 + HOLO.R }] }, // 中央フィード→飼育槽へ戻る
    ];
    if (this.labRoomTier() >= 3) zs.splice(3, 0, { key: "shelf", rects: [{ x0: W - 372, y0: H * 0.30 + 312, x1: W - 372 + 308, y1: H * 0.30 + 312 + 150 }] }); // 裁定①: 観測ログ(T3点灯時)→標本棚パネル
    return zs;
  },
  _hqlabZoneAt(x, y) {
    for (const z of this._hqlabZones()) for (const r of z.rects) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return z.key;
    return null;
  },

  // ---------------- 描画(PoC逐語移植+配線) ----------------
  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"), wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const W = Math.max(320, wrap.clientWidth), H = Math.max(240, wrap.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lv = document.getElementById("hqlab-lv"); if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} — 全惑星恒久バフ 生産+${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    const k = Math.min(W / HOLO.W, H / HOLO.H);
    this._labBlit = { k, bx: (W - HOLO.W * k) / 2, by: (H - HOLO.H * k) / 2 };
    if (!this._holoMotes) { // PoC: 塵(逐語・座標は設計空間)
      this._holoMotes = Array.from({ length: 26 }, () => ({ x: Math.random() * HOLO.W, y: Math.random() * HOLO.H, r: Math.random() * 1.3 + 0.3, v: Math.random() * 0.14 + 0.04 }));
    }
    this._holoDraw(performance.now());
  },
  _startLabVideo() {
    if (this._labVidOn) return;
    this._labVidOn = true;
    const step = () => {
      if (!this.hqLabOpen()) { this._labVidOn = false; return; }
      this._holoDraw(performance.now());
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  _drawLabScreenVideo(tSec) { this._holoDraw(performance.now()); void tSec; }, // devページ互換(1フレーム描画)

  // 配線: 追跡対象の選出=決定論・CFG.holoTrackSec秒ごとに巡回(乱数不使用)
  _holoTrackTarget(s) {
    const ls = Game.state.lizards;
    if (!ls || !ls.length) return null;
    const idx = Math.floor(s / Math.max(1, CFG.holoTrackSec || 5)) % ls.length;
    return ls[idx];
  },

  _holoDraw(now) {
    const cvEl = document.getElementById("hqlab-canvas");
    if (!cvEl || !this._labBlit) return;
    const ctx = cvEl.getContext("2d");
    const W = HOLO.W, H = HOLO.H, AM = HOLO.AM, AMd = HOLO.AMd, CR = HOLO.CR, CRd = HOLO.CRd, WHd = HOLO.WH, FONT_T = HOLO.FONT_T, FONT_J = HOLO.FONT_J;
    const RM = ((typeof Motion !== "undefined") && Motion.reduced) || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tier = this.labRoomTier();
    if (this._holoT0 === null || this._holoT0 === undefined) this._holoT0 = now;
    const bootOn = CFG.holoBootOn !== false;
    const t = (RM || !bootOn) ? 9999 : (now - this._holoT0) * (CFG.holoBootSpeed || 1); // 起動時間(CFGで短縮/OFF)
    const s = now / 1000;
    const rot = RM ? 0 : s;
    const mx = this._holoMx || 0, my = this._holoMy || 0;
    // PoC helpers(逐語)
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
    const st = (tt, s0, d) => ease((tt - s0) / d);
    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) ^ (a << 7); h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
    const glow = (c, b2) => { ctx.shadowColor = c; ctx.shadowBlur = b2; };
    const g0 = () => { ctx.shadowBlur = 0; };
    function bracket(x, y, w, h, len, c, lw) {
      ctx.strokeStyle = c; ctx.lineWidth = lw || 1.4; ctx.beginPath();
      ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
      ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
      ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
      ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
      ctx.stroke();
    }
    function panel(x, y, w, h, a) {
      ctx.fillStyle = AMd + (0.035 * a) + ")"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = AMd + (0.16 * a) + ")"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      bracket(x - 3, y - 3, w + 6, h + 6, 9, AMd + (0.75 * a) + ")", 1.4);
    }
    function label(x, y, jp, en, a) {
      ctx.textAlign = "left"; ctx.fillStyle = AMd + (0.92 * a) + ")";
      ctx.font = "600 13" + FONT_J; ctx.fillText(jp, x, y);
      ctx.fillStyle = AMd + (0.42 * a) + ")"; ctx.font = "10" + FONT_T;
      ctx.fillText(en, x + ctx.measureText(jp).width + 46, y);
    }
    // ---- フレーム開始(表示canvasへfitスケール) ----
    const b = this._labBlit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#020407"; ctx.fillRect(0, 0, cvEl.width, cvEl.height);
    ctx.setTransform(b.k, 0, 0, b.k, b.bx, b.by);
    const CX = W * 0.5 + mx * -6, CY = H * 0.465 + my * -4;

    /* ---- 0. 床グリッド(PoC逐語) ---- */
    const gA = st(t, 0, 600);
    if (gA > 0) {
      ctx.save(); ctx.globalAlpha = gA * 0.5;
      const hy = H * 0.66;
      for (let i = 0; i <= 14; i++) {
        const p = i / 14, x0 = W * (-0.35 + 1.7 * p), xh = CX + (x0 - CX) * 0.12;
        ctx.strokeStyle = AMd + "0.10)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, H + 20); ctx.lineTo(xh, hy); ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const y = hy + Math.pow(i / 6, 1.8) * (H - hy + 18);
        ctx.strokeStyle = AMd + (i === 0 ? "0.16)" : "0.07)");
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();
    }
    /* 塵(PoC逐語) */
    ctx.save();
    for (const m of (this._holoMotes || [])) {
      if (!RM) { m.y -= m.v; if (m.y < 0) m.y = H; }
      ctx.fillStyle = AMd + "0.16)"; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.29); ctx.fill();
    }
    ctx.restore();

    /* ---- 1. 中心: 飼育槽=アークリアクター ---- */
    const R = HOLO.R, ringA = st(t, 350, 750), feedA = st(t, 850, 700);
    if (ringA > 0) {
      ctx.save(); ctx.translate(CX, CY); ctx.globalAlpha = ringA;
      /* 層1: 目盛環(T1から) */
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * 6.2832 + rot * 0.05, big = i % 5 === 0;
        ctx.strokeStyle = AMd + (big ? "0.8)" : "0.35)"); ctx.lineWidth = big ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (R + 22), Math.sin(a) * (R + 22));
        ctx.lineTo(Math.cos(a) * (R + 22 + (big ? 12 : 6)), Math.sin(a) * (R + 22 + (big ? 12 : 6)));
        ctx.stroke();
      }
      if (tier >= 2) { /* 層2: 破線環(T2+)=tier表現: 環の層はtierで増える */
        ctx.setLineDash([26, 14]); ctx.lineDashOffset = -rot * 30;
        ctx.strokeStyle = AMd + "0.55)"; ctx.lineWidth = 2; glow(AM, 10);
        ctx.beginPath(); ctx.arc(0, 0, R + 46, 0, 6.2832); ctx.stroke(); g0(); ctx.setLineDash([]);
      }
      if (tier >= 2) { /* 層3: 弧片(T2+) */
        const segs = [[0.1, 1.25, AMd + "0.9)"], [2.0, 0.7, AMd + "0.5)"], [3.5, 0.95, CRd + "0.85)"], [5.1, 0.6, AMd + "0.7)"]];
        segs.forEach(([a0, al, c]) => {
          ctx.strokeStyle = c; ctx.lineWidth = 3.2; glow(c.startsWith("rgba(210") ? CR : AM, 8);
          ctx.beginPath(); ctx.arc(0, 0, R + 62, a0 + rot * 0.12, a0 + al + rot * 0.12); ctx.stroke(); g0();
        });
      }
      if (tier >= 3) { /* 方位数値(T3=計器の密度最大) */
        ctx.font = "10" + FONT_T; ctx.fillStyle = AMd + "0.5)"; ctx.textAlign = "center";
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * 6.2832 - 1.5708;
          ctx.fillText(String(i * 30).padStart(3, "0"), Math.cos(a) * (R + 88), Math.sin(a) * (R + 88) + 3);
        }
      }
      ctx.restore();
    }
    /* フィード本体 */
    let feedMap = null; // 配線: 実個体位置→フィード座標の変換(追跡レティクル用)
    if (feedA > 0) {
      ctx.save(); ctx.translate(CX, CY); ctx.globalAlpha = feedA;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.clip();
      // 配線: 疑似飼育槽→実際の飼育槽canvasの生中継(方式1)。coverクロップで円内へ
      const src = document.getElementById("game");
      if (src && src.width && src.height) {
        let sw = src.width, sh = src.height, sx = 0, sy = 0;
        if (sw / sh > 1) { sw = sh; sx = (src.width - sw) / 2; } // 円(1:1)へのcover
        else { sh = sw; sy = (src.height - sh) / 2; }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, sx, sy, sw, sh, -R, -R, R * 2, R * 2);
        feedMap = { sx, sy, sw, sh };
      } else {
        ctx.fillStyle = "#241d15"; ctx.fillRect(-R, -R, R * 2, R * 2);
      }
      /* HUD越しの色味(PoC逐語): 琥珀被膜+走査線+スイープ */
      ctx.fillStyle = AMd + "0.07)"; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      for (let y = -R; y < R; y += 4) ctx.fillRect(-R, y, R * 2, 1.4);
      if (!RM) {
        const sa = (s * 0.5) % 6.2832;
        ctx.save(); ctx.rotate(sa);
        const sweep = ctx.createLinearGradient(0, 0, R, 0);
        sweep.addColorStop(0, AMd + "0)"); sweep.addColorStop(1, AMd + "0.18)");
        ctx.fillStyle = sweep;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -0.5, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      /* フィード縁(PoC逐語)+配線: ラベル=本部を開いた惑星名 */
      ctx.save(); ctx.translate(CX, CY);
      ctx.globalAlpha = feedA; glow(AM, 16);
      ctx.strokeStyle = AMd + "0.95)"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.stroke(); g0();
      ctx.font = "11" + FONT_T; ctx.fillStyle = AMd + "0.75)"; ctx.textAlign = "center";
      const stg = Game.currentStage();
      const pname = (typeof PLANET_NAMES !== "undefined" && PLANET_NAMES[stg.id]) ? PLANET_NAMES[stg.id] : stg.name;
      ctx.fillText(`LIVE COLONY FEED — ${String(pname).toUpperCase()} (#p${stg.id})`, 0, -R - 32);
      ctx.fillStyle = CRd + (0.5 + 0.5 * Math.sin(s * 4)) + ")";
      ctx.beginPath(); ctx.arc(-118, -R - 36, 3.4, 0, 6.29); ctx.fill();
      ctx.restore();
    }

    /* ---- 2. 追跡レティクル(配線: 実個体をロックオン・決定論巡回) ---- */
    const trk = this._holoTrackTarget(s), trkA = st(t, 1900, 600);
    let trkFeed = null;
    if (trk && feedMap) {
      const fx = ((trk.x - feedMap.sx) / feedMap.sw) * R * 2 - R;
      const fy = ((trk.y - feedMap.sy) / feedMap.sh) * R * 2 - R;
      if (Math.hypot(fx, fy) < R - 24) trkFeed = { x: fx, y: fy };
    }
    if (trkA > 0 && trkFeed) {
      const lx = CX + trkFeed.x, ly = CY + trkFeed.y;
      ctx.save(); ctx.globalAlpha = trkA;
      const bs = 40, pulse = RM ? 0 : Math.sin(s * 5) * 2;
      bracket(lx - bs / 2 - pulse, ly - bs / 2 - pulse, bs + pulse * 2, bs + pulse * 2, 7, AMd + "0.95)", 1.6);
      const px = W - 372, py = H * 0.30;
      ctx.strokeStyle = AMd + "0.55)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(lx + bs / 2 + 3, ly); ctx.lineTo(lx + bs / 2 + 42, ly - 26); ctx.lineTo(px, py + 34); ctx.stroke();
      ctx.fillStyle = AMd + "0.9)"; ctx.beginPath(); ctx.arc(lx + bs / 2 + 3, ly, 2, 0, 6.29); ctx.fill();
      ctx.restore();
    }

    /* ---- 3. 左モジュール群(T2+=錬成槽/T3=標本アーカイブ) ---- */
    const mA1 = st(t, 1250, 500) * (tier >= 2 ? 1 : 0);
    if (mA1 > 0) { /* 錬成槽(配線: 石残数/合成キュー=実データ・他読み出しはPoC意匠) */
      const x = 64, y = 118, w = 252, h = 250;
      ctx.save(); ctx.globalAlpha = mA1;
      panel(x, y, w, h, 1); label(x + 14, y + 28, "錬成槽", "ALCHEMIC COLUMN · CR-01", 1);
      const cx0 = x + 62, cy0 = y + 58, cw = 44, ch = 158;
      ctx.strokeStyle = AMd + "0.35)"; ctx.strokeRect(cx0 - 6.5, cy0 - 6.5, cw + 13, ch + 13);
      const lg = ctx.createLinearGradient(0, cy0, 0, cy0 + ch);
      lg.addColorStop(0, "rgba(210,56,74,0.25)"); lg.addColorStop(1, "rgba(120,16,30,0.85)");
      ctx.fillStyle = lg; glow(CR, 14); ctx.fillRect(cx0, cy0 + ch * 0.18, cw, ch * 0.82); g0();
      ctx.fillStyle = CRd + "0.9)"; ctx.fillRect(cx0, cy0 + ch * 0.18, cw, 2);
      if (!RM) for (let i = 0; i < 5; i++) {
        const bp = (s * 0.25 + i * 0.2) % 1;
        ctx.fillStyle = CRd + (0.5 * (1 - bp)) + ")";
        ctx.beginPath(); ctx.arc(cx0 + 8 + hash(i, 7) * 28, cy0 + ch - bp * ch * 0.76, 2.2, 0, 6.29); ctx.fill();
      }
      // 配線: SYNTH QUEUE=解読済みで素材が揃う個体数/解読済みレシピ数・STONE RESERVE=実残数
      ctx.font = "10" + FONT_T; ctx.textAlign = "left";
      const rd = [["STONE RESERVE", String(Game.stones())], ["STABILITY", "98.2%"], ["CORE TEMP", "341K"]];
      rd.forEach(([k2, v], i) => {
        const yy = y + 72 + i * 34;
        ctx.fillStyle = AMd + "0.45)"; ctx.fillText(k2, x + 128, yy);
        ctx.fillStyle = i === 1 ? CRd + "0.95)" : AMd + "0.9)"; ctx.font = "600 13" + FONT_T; ctx.fillText(v, x + 128, yy + 15); ctx.font = "10" + FONT_T;
      });
      ctx.restore();
    }
    const mA2 = st(t, 1450, 500) * (tier >= 3 ? 1 : 0);
    if (mA2 > 0) { /* 標本アーカイブ(配線: 特性カタログの実所持N/18・セル=TRAITS順・所持=点灯・合成特性=深紅) */
      const x = 64, y = 404, w = 252, h = 210;
      ctx.save(); ctx.globalAlpha = mA2;
      panel(x, y, w, h, 0.9); label(x + 14, y + 28, "標本アーカイブ", "SPECIMEN ARCHIVE 18", 0.9);
      const keys = Object.keys(TRAITS);
      const owned = new Set();
      for (const lz of Game.state.lizards) for (const tr2 of (lz.traits || [])) owned.add(tr2 && tr2.key ? tr2.key : tr2);
      let n = 0;
      for (let i = 0; i < 18 && i < keys.length; i++) {
        const gx = x + 22 + (i % 6) * 36, gy = y + 52 + Math.floor(i / 6) * 46, on = owned.has(keys[i]);
        if (on) n++;
        ctx.strokeStyle = AMd + (on ? "0.7)" : "0.18)"); ctx.lineWidth = 1.2;
        ctx.strokeRect(gx, gy, 26, 32);
        if (on) {
          ctx.fillStyle = AMd + "0.14)"; ctx.fillRect(gx, gy, 26, 32);
          ctx.fillStyle = TRAITS[keys[i]].tier >= 6 ? CRd + "0.9)" : AMd + "0.8)";
          ctx.beginPath(); ctx.ellipse(gx + 13, gy + 18, 6, 9, 0, 0, 6.29); ctx.fill();
        }
      }
      ctx.font = "10" + FONT_T; ctx.fillStyle = AMd + "0.45)";
      ctx.fillText(`COVERAGE ${n}/18 — ${Math.round(n / 18 * 100)}%`, x + 14, y + h - 12);
      ctx.restore();
    }

    /* ---- 4. 右モジュール群(T2+=追跡・投資/T3=観測ログ) ---- */
    const mA3 = st(t, 1350, 500) * (tier >= 2 ? 1 : 0);
    if (mA3 > 0) { /* 追跡パネル(配線: 実個体の名前/特性チップ/固定印/HP) */
      const x = W - 372, y = H * 0.30 - 52, w = 308, h = 126;
      ctx.save(); ctx.globalAlpha = mA3 * (trkA > 0 && trk ? 1 : 0.55);
      panel(x, y, w, h, 1); label(x + 14, y + 26, "個体追跡", "ENTITY TRACK · LOCK", 1);
      if (trk) {
        ctx.font = "600 15" + FONT_J; ctx.fillStyle = AMd + "0.95)";
        ctx.fillText(Game.lizardName(trk), x + 14, y + 56);
        ctx.font = "10" + FONT_T;
        ctx.fillStyle = AMd + "0.5)"; ctx.fillText("TRAIT", x + 14, y + 80);
        const trs = (trk.traits || []).map((t2) => t2 && t2.key ? t2.key : t2);
        if (trk.morphId === "legendary") { ctx.fillStyle = AMd + "0.95)"; ctx.fillText("LEGENDARY", x + 60, y + 80); }
        else if (!trs.length) { ctx.fillStyle = AMd + "0.35)"; ctx.fillText("—", x + 60, y + 80); }
        else {
          let tx = x + 60;
          for (const k2 of trs.slice(0, 3)) {
            const d = TRAITS[k2]; if (!d) continue;
            const fixed = Game.isFixed(trk, k2);
            ctx.fillStyle = fixed ? CRd + "0.95)" : AMd + "0.9)";
            const txt = (fixed ? "◆ " : "") + d.name;
            ctx.fillText(txt, tx, y + 80);
            tx += ctx.measureText(txt).width + 14;
          }
        }
        ctx.fillStyle = AMd + "0.5)"; ctx.fillText("VITALS", x + 14, y + 100);
        const hpP = trk.injuredT > 0 ? Math.max(0, Math.round(100 - trk.injuredT * 10)) : 100;
        const bars = Math.round(hpP / 10);
        ctx.fillStyle = trk.injuredT > 0 ? CRd + "0.9)" : AMd + "0.9)";
        ctx.fillText(`${"█".repeat(bars)}${"░".repeat(10 - bars)} ${hpP}%`, x + 62, y + 100); // 裁定③: 「HP」表記撤去=VITALS(負傷残時間近似・負傷中は深紅=自切/尾再生と接続)
      }
      ctx.restore();
    }
    const mA4 = st(t, 1550, 500) * (tier >= 2 ? 1 : 0);
    if (mA4 > 0) { /* 投資リング(配線: labRoomTiers実値)+資源列(配線: 実残数・R3序列と同一言語) */
      const x = W - 372, y = H * 0.30 + 96, w = 308, h = 190;
      ctx.save(); ctx.globalAlpha = mA4;
      panel(x, y, w, h, 0.9); label(x + 14, y + 26, "設備投資", "FACILITY TIER", 0.9);
      const gx = x + 72, gy = y + 112, gr = 46;
      const inv = Game.labInvestLv("desks"), invMax = (CFG.labInvestCosts && CFG.labInvestCosts.desks || []).length || 3;
      ctx.strokeStyle = AMd + "0.18)"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(gx, gy, gr, -1.5708, 4.7124); ctx.stroke();
      glow(AM, 10); ctx.strokeStyle = AMd + "0.95)";
      ctx.beginPath(); ctx.arc(gx, gy, gr, -1.5708, -1.5708 + 6.2832 * Math.min(1, inv / invMax)); ctx.stroke(); g0();
      ctx.font = "600 22" + FONT_T; ctx.fillStyle = AMd + "1)"; ctx.textAlign = "center";
      ctx.fillText("T" + tier, gx, gy + 2);
      ctx.font = "9" + FONT_T; ctx.fillStyle = AMd + "0.5)"; ctx.fillText("/ T3", gx, gy + 18);
      ctx.textAlign = "left"; ctx.font = "11" + FONT_T;
      const res = [["◇ DIAMOND", fmt(Game.state.gems || 0), AMd], ["⬡ AMETHYST", fmt(Game.ore("amethyst")), WHd], ["● SAGE STONE", fmt(Game.stones()), CRd]];
      res.forEach(([k2, v, c], i) => {
        const yy = y + 64 + i * 34;
        ctx.fillStyle = c + "0.85)"; ctx.fillText(k2, x + 150, yy);
        ctx.font = "600 14" + FONT_T; ctx.fillText(v, x + 258, yy); ctx.font = "11" + FONT_T;
      });
      ctx.restore();
    }
    const mA5 = st(t, 1700, 500) * (tier >= 3 ? 1 : 0);
    if (mA5 > 0) { /* 観測ログ(PoC逐語=ブートログ意匠) */
      const x = W - 372, y = H * 0.30 + 312, w = 308, h = 150;
      ctx.save(); ctx.globalAlpha = mA5;
      panel(x, y, w, h, 0.8); label(x + 14, y + 26, "観測ログ", "TELEMETRY", 0.8);
      ctx.font = "10" + FONT_T;
      const logs = ["> boot sequence .......... OK", "> colony feed uplink ...... OK",
        "> gene roulette calib ..... OK", "> quad-slit resonance ..... 1/85",
        "> all systems nominal"];
      const chars = RM ? 9999 : Math.floor((t - 1700) / 18);
      let used = 0;
      logs.forEach((L, i) => {
        const take = clamp(chars - used, 0, L.length); used += L.length + 6;
        ctx.fillStyle = i === 4 ? AMd + "0.95)" : AMd + "0.55)";
        ctx.fillText(L.slice(0, take), x + 14, y + 50 + i * 20);
      });
      ctx.restore();
    }

    /* ---- 5. ヘッダ/フッタ(PoC逐語+配線: ティッカー=実コロニー統計) ---- */
    const hA = st(t, 150, 500);
    if (hA > 0) {
      ctx.save(); ctx.globalAlpha = hA;
      ctx.font = "600 16" + FONT_J; ctx.fillStyle = AMd + "0.95)"; ctx.textAlign = "left";
      ctx.fillText("本部 — HOLO COMMAND", 40, 52);
      ctx.font = "10" + FONT_T; ctx.fillStyle = AMd + "0.45)";
      ctx.fillText("LIZARD COLONY · HQ COMMAND", 40, 72);
      ctx.strokeStyle = AMd + "0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(40, 84); ctx.lineTo(W - 40, 84); ctx.stroke();
      // 裁定①: SPACEPORTインジケータ(ヘッダ右・最小表現=小さな機影+微ラベル。クリック→宇宙港パネル)
      const rk = Game.ensureRocket();
      const spx = W - 150, spy = 52;
      ctx.fillStyle = AMd + "0.75)";
      ctx.beginPath(); ctx.moveTo(spx, spy - 12); ctx.lineTo(spx + 5, spy - 2); ctx.lineTo(spx + 5, spy + 2); ctx.lineTo(spx + 8, spy + 7); ctx.lineTo(spx - 8, spy + 7); ctx.lineTo(spx - 5, spy + 2); ctx.lineTo(spx - 5, spy - 2); ctx.closePath(); ctx.fill();
      ctx.font = "10" + FONT_T; ctx.fillStyle = AMd + "0.45)"; ctx.textAlign = "left";
      ctx.fillText("SPACEPORT", spx + 16, spy + 2);
      ctx.fillStyle = rk.done ? AMd + "0.9)" : AMd + "0.4)";
      ctx.fillText(rk.done ? "READY" : `STAGE ${rk.stage + 1}/${CFG.rocketStages.length}`, spx + 16, spy + 15);
      ctx.restore();
    }
    const tA = st(t, 2100, 500);
    if (tA > 0) {
      ctx.save(); ctx.globalAlpha = tA * 0.7;
      ctx.font = "10" + FONT_T; ctx.fillStyle = AMd + "0.6)"; ctx.textAlign = "left";
      const sst = Game.state.stats || {};
      const msg = `COLONY ${Game.state.lizards.length} ACTIVE · PUREBLOOD LOCK ENGAGED · RAIDS WON ${sst.raidsWon || 0} · QUAD-SLIT 1/85 · AMETHYST RESERVE ${fmt(Game.ore("amethyst"))} · SAGE STONE ${fmt(Game.stones())} · DEX ${Object.keys(Game.state.dex || {}).length} ·  `;
      const tw = ctx.measureText(msg).width, off = RM ? 0 : (s * 46) % tw;
      ctx.fillText(msg + msg, 40 - off, H - 28);
      ctx.strokeStyle = AMd + "0.25)";
      ctx.beginPath(); ctx.moveTo(40, H - 46); ctx.lineTo(W - 40, H - 46); ctx.stroke();
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
});

// dev用: #hqlab で本部を開く(#hqlab-desks|tank|rocket|shelf=パネル/#hqlab-t1|t2|t3=tier表示上書き/#hqlab-fullは互換=T3)。
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
