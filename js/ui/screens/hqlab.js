// Research workshop. The canvas and its input regions use the same pixel coordinates.
Object.assign(UI, {
  // ---------------- ページ制御(公開API名維持) ----------------
  openHqLab() {
    Game._badgeHq = false;
    const main = document.querySelector("main"),
      lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    if (this.nestPageOpen && this.nestPageOpen()) this.closeNestPage(); // V6-P2-1: 場所の切替=巣ページと排他(対称)
    main.classList.add("hidden");
    lab.classList.remove("hidden");
    const btn = document.getElementById("btn-hq");
    if (btn) btn.classList.add("at-lab");
    this._hqlabBind();
    if (this.renderHqDirective) this.renderHqDirective(); // P3-2: 指令帯(開くたび実データで更新)
    this.renderHqLab();
    this._startLabVideo();
    this.placeChanged(); // V6-P5 S3: 場所の環境音(本部=冷たい計器)へ沈み込みで切り替える
  },
  closeHqLab() {
    const main = document.querySelector("main"),
      lab = document.getElementById("hqlab");
    if (!main || !lab) return;
    lab.classList.add("hidden");
    main.classList.remove("hidden");
    const btn = document.getElementById("btn-hq");
    if (btn) btn.classList.remove("at-lab");
    this.placeChanged(); // V6-P5 S3: 飼育槽へ戻る
  },
  hqLabOpen() {
    const lab = document.getElementById("hqlab");
    return !!(lab && !lab.classList.contains("hidden"));
  },
  _hqlabBind() {
    if (this._hqlabBound) return;
    this._hqlabBound = true;
    const back = document.getElementById("hqlab-back");
    if (back) back.addEventListener("click", () => this.closeHqLab());
    const dir = document.getElementById("hq-directive");
    if (dir) dir.addEventListener("click", () => this.openLabPanel("rocket")); // P3-2: 詳細は宇宙港へ
    this._buildHqMenu(); // §14: 本部右メニュー(常設導線・動注入=飼育槽レイアウト非接触)
    const cv = document.getElementById("hqlab-canvas");
    if (cv) {
      const stationAt = (e) => {
        const rect = cv.getBoundingClientRect();
        return this._hqlabZoneAt(
          ((e.clientX - rect.left) * cv.width) / rect.width,
          ((e.clientY - rect.top) * cv.height) / rect.height,
        );
      };
      cv.addEventListener("click", (e) => {
        const key = stationAt(e);
        if (key === "feed") this.closeHqLab();
        else if (key === "archive") this.openDex();
        else if (key) this.openLabPanel(key);
      });
      cv.addEventListener("pointermove", (e) => {
        const key = stationAt(e);
        this._labHover = key;
        cv.style.cursor = key ? "pointer" : "default";
        cv.title = CabinetScenery.workshop.stations.find((s) => s.key === key)?.name || "";
      });
      cv.addEventListener("pointerleave", () => {
        this._labHover = null;
      });
    }
    window.addEventListener("resize", () => {
      if (this.hqLabOpen()) this.renderHqLab();
    });
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
    for (const it of CFG.hqMenuItems || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.panel = it.key;
      b.title = it.jp;
      b.innerHTML = `${Icon.svg(it.icon)}<span class="hm-tx"><span class="hm-jp">${it.jp}</span></span>`;
      b.addEventListener("click", () => {
        if (it.key === "dex") this.openDex();
        else this.openLabPanel(it.key);
      });
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
  labTiers() {
    // 既存互換(update()の変化検知)
    if (this._labTierOverride) return this._labTierOverride;
    const tierOf = (v, th) => (v >= th[2] ? 4 : v >= th[1] ? 3 : v >= th[0] ? 2 : 1);
    const rk = Game.ensureRocket();
    return {
      desks: Math.min(4, 1 + Game.labInvestLv("desks")),
      // V6-P1-2: 駆動源=HQ Lv(研究デスクはP3-3でβ非公開になり不可視のため)。
      //   ★HQ Lv の真実は state.rank。headquarters.rank は保存側の器で、applyWorld が state.rank へ復元する
      //     (ランタイムに state.headquarters は存在しない=そこを読むと常に1になる)。
      tank: Math.max(Game.state.labTankFloor || 1, tierOf(Game.hqLevel(), CFG.labTankTiers)),
      rocket: rk.done ? 4 : rk.stage >= 2 ? 3 : rk.stage >= 1 || rk.invested > 0 ? 2 : 1,
      shelf: tierOf(Object.keys(Game.state.dex || {}).length, CFG.labShelfTiers),
      room: this.labRoomTier(),
    };
  },

  _hqlabZones() {
    return CabinetScenery.workshop.stations.map((s) => {
      const [x, y] = CabinetScenery.stationPoint(s);
      return { key: s.key, rects: [{ x0: x - s.w / 2, x1: x + s.w / 2, y0: y - s.h, y1: y + 3 }] };
    });
  },
  _hqlabZoneAt(x, y) {
    for (const zone of this._hqlabZones()) {
      const r = zone.rects[0];
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return zone.key;
    }
    return null;
  },

  renderHqLab() {
    const cv = document.getElementById("hqlab-canvas"),
      wrap = document.getElementById("hqlab-wrap");
    if (!cv || !wrap) return;
    const { w, h } = CabinetScenery.workshop;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const scale = Math.min(wrap.clientWidth / w, wrap.clientHeight / h);
    cv.style.width = Math.floor(w * scale) + "px";
    cv.style.height = Math.floor(h * scale) + "px";
    cv.setAttribute("aria-label", "研究施設。飼育槽、標本棚、錬成装置と宇宙港");
    const lv = document.getElementById("hqlab-lv");
    if (lv) lv.textContent = `HQ Lv${Game.hqLevel()} ・ 生産 +${(Game.hqLevel() * 0.2).toFixed(1)}%`;
    this._paintWorkshop();
  },
  _startLabVideo() {
    if (this._labVidOn) return;
    this._labVidOn = true;
    let drawn = 0;
    const step = (now) => {
      if (!this.hqLabOpen()) {
        this._labVidOn = false;
        return;
      }
      if (now - drawn >= 100) {
        this._paintWorkshop();
        drawn = now;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  _drawLabScreenVideo() {
    this._paintWorkshop();
  },

  _paintWorkshop() {
    const cv = document.getElementById("hqlab-canvas");
    if (!cv) return;
    const c = cv.getContext("2d"),
      tier = this.labRoomTier();
    if (!this._workshopArt || this._workshopTier !== tier) {
      const layer = document.createElement("canvas");
      layer.width = cv.width;
      layer.height = cv.height;
      CabinetScenery.workshopArt(layer.getContext("2d"), tier);
      this._workshopArt = layer;
      this._workshopTier = tier;
    }
    c.imageSmoothingEnabled = false;
    c.drawImage(this._workshopArt, 0, 0);
    const stations = CabinetScenery.workshop.stations;
    const [x, y] = CabinetScenery.stationPoint(stations.find((s) => s.key === "feed"));
    const src = document.getElementById("game");
    if (src && src.width && src.height) c.drawImage(src, x - 30, y - 41, 60, 29);
    if (this._labHover) {
      const station = stations.find((s) => s.key === this._labHover);
      if (station) {
        const [sx, sy] = CabinetScenery.stationPoint(station);
        c.fillStyle = "#e2c687";
        c.fillRect(Math.round(sx - 5), Math.round(sy + 3), 10, 1);
      }
    }
  },
});

// dev用: #hqlab で本部を開く(#hqlab-desks|tank|rocket|shelf=パネル/#hqlab-t1|t2|t3=tier表示上書き/#hqlab-fullは互換=T3)。
if (typeof window !== "undefined")
  window.addEventListener("load", () => {
    const m = location.hash.match(/^#hqlab(?:-(desks|tank|rocket|shelf|full|t1|t2|t3))?$/);
    if (m && UI.openHqLab)
      setTimeout(() => {
        if (m[1] === "full" || m[1] === "t3") UI._labRoomTierOverride = 3;
        else if (m[1] === "t2") UI._labRoomTierOverride = 2;
        else if (m[1] === "t1") UI._labRoomTierOverride = 1;
        UI.openHqLab();
        if (m[1] && !/^t[123]$|^full$/.test(m[1])) UI.openLabPanel(m[1]);
      }, 60);
  });
