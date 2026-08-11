// =============================================================
// screens/nest — 巣ネットワーク画面(V4.1・蜘蛛の巣状・閲覧専用)
// UISkills.md §8: ui/screens/nest相当。
// =============================================================

Object.assign(UI, {
  // ⑤ 巣の卵タップ→【小ウィンドウ】(モーダルでない=飼育槽を隠さない・孵化秒数が進み表示が同期し続ける)
  openEggMenu(i) {
    const egg = Game.state.eggs[i];
    if (!egg) return;
    this._eggPop = { egg };
    this._buildEggPop();
  },
  _buildEggPop() {
    const frame = document.getElementById("frame") || document.body;
    let el = document.getElementById("egg-pop");
    if (!el) {
      el = document.createElement("div"); el.id = "egg-pop";
      frame.appendChild(el);
      el.addEventListener("pointerdown", (e) => { // 委譲(innerHTML再構築でも失われない)
        if (e.target.closest(".ep-close")) { this.closeEggPop(); return; }
        if (e.target.closest(".ep-hatch")) {
          const egg = this._eggPop && this._eggPop.egg; if (!egg) return;
          if (Game.state.gems < 1) { UI.denyFlash("gems"); return; }
          const idx = Game.state.eggs.indexOf(egg);
          if (idx < 0) { this.closeEggPop(); return; }
          Game.instantHatch(idx); // ダイヤ1消費→孵化タイマーを0に
          this.closeEggPop();
        }
      });
    }
    this._renderEggPop();
  },
  // 毎フレームの update() から呼ばれ、孵化カウントダウン/進捗を同期(時間が進み表示が止まらない)
  _renderEggPop() {
    const el = document.getElementById("egg-pop"); if (!el || !this._eggPop) return;
    const egg = this._eggPop.egg;
    if (Game.state.eggs.indexOf(egg) < 0) { this.closeEggPop(); return; } // 孵化して消えた→自動で閉じる
    const sp = speciesById(egg.speciesId);
    const mo = (typeof MORPHS !== "undefined") && MORPHS.find((m) => m.id === egg.morphId);
    const sec = Math.max(0, Math.ceil(egg.t));
    const prog = Math.max(0, Math.min(1, egg.total ? 1 - egg.t / egg.total : 1));
    const canGem = Game.state.gems >= 1;
    el.innerHTML =
      `<div class="ep-head"><span>${Icon.svg("egg")} 巣の卵</span><button class="ep-close" aria-label="閉じる">×</button></div>` +
      `<div class="ep-name">${(mo ? mo.name + " " : "") + (sp ? sp.name : "卵")}</div>` +
      `<div class="ep-time">孵化まで <b>${sec > 0 ? sec + "秒" : "まもなく"}</b></div>` +
      `<div class="ep-prog"><span style="width:${Math.round(prog * 100)}%"></span></div>` +
      `<button class="ep-hatch cta"${canGem ? "" : ' aria-disabled="true"'}>${Icon.svg("gem")} 今すぐ孵化 <small>ダイヤ1 / 所持 ${Game.state.gems}</small></button>`;
  },
  closeEggPop() {
    this._eggPop = null;
    const el = document.getElementById("egg-pop");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  // V6-P2-1(2026-08-10 Ric指示): 巣=モーダル→独立ページへ(本部#hqlabの様式を踏襲)。
  //   機能(閲覧専用・進捗・ツールチップ・パン)は buildNest のまま非接触=表示層と導線のみの変更。
  //   openNest は従来名の入口として維持(呼び出し側=飼育槽の巣穴クリックは無変更)。
  // v2(素材化): 素材の遅延ロード窓口。読めなければ null=呼び出し側が手続き描画へ退化(壊れない)。
  //   ?noassets=1 で強制退化(フォールバックの実測用)。読了時は再レイアウト(どの器でも寸法ガード済み)。
  _nestAssets: {},
  _nestAssetFailed: {},
  _nestAsset(name) {
    if (typeof location !== "undefined" && /[?&]noassets=1(?:&|$)/.test(location.search)) return null;
    if (this._nestAssetFailed[name]) return null;
    let img = this._nestAssets[name];
    if (!img) {
      img = new Image();
      img.onload = () => { if (this._nestLayout) this._nestLayout(); if (this._nestRingApply) this._nestRingApply(); };
      img.onerror = () => { this._nestAssetFailed[name] = true; delete this._nestAssets[name]; };
      img.src = "image/nest/" + name + ".png";
      this._nestAssets[name] = img;
    }
    return img.complete && img.naturalWidth ? img : null;
  },

  openNest() {
    Game.ensureNestWeb();
    const main = document.querySelector("main"), pg = document.getElementById("nestpage");
    if (!main || !pg) { // ページ骨格が無い環境(旧テストページ等)はモーダルへフォールバック(退路)
      this.openModal(`${Icon.svg("nestweb")} 巣ネットワーク — 全惑星共通(閲覧専用)`, (body) => this.buildNest(body));
      Game.state.nestWeb.seen = Game.nestWebCounts().open;
      return;
    }
    if (this.hqLabOpen && this.hqLabOpen()) this.closeHqLab(); // 場所の切替=二重表示しない
    main.classList.add("hidden");
    pg.classList.remove("hidden");
    this._nestPageBind();
    const body = document.getElementById("nestpage-body");
    if (body) this.buildNest(body); // 開くたび再構築=モーダル時代と同じ鮮度
    Game.state.nestWeb.seen = Game.nestWebCounts().open; // 既読化(バッジ解除)=従来どおり
  },
  closeNestPage() {
    const main = document.querySelector("main"), pg = document.getElementById("nestpage");
    if (!main || !pg) return;
    pg.classList.add("hidden");
    main.classList.remove("hidden");
  },
  nestPageOpen() { const pg = document.getElementById("nestpage"); return !!(pg && !pg.classList.contains("hidden")); },
  _nestPageBind() {
    if (this._nestPageBound) return; this._nestPageBound = true;
    const h2 = document.querySelector("#nestpage-head h2");
    if (h2) h2.innerHTML = `${Icon.svg("nestweb")} 巣ネットワーク — 全惑星共通`;
    const back = document.getElementById("nestpage-back");
    if (back) back.addEventListener("click", () => this.closeNestPage());
    window.addEventListener("resize", () => { if (this.nestPageOpen() && this._nestLayout) this._nestLayout(); }); // V6-P2-2: 背景canvas再描画
    this._buildNestMenu();
  },
  // 右メニュー(本部§14 _buildHqMenuと同様式・CFG外部化)。巣に内部パネルは無いため中身は他所への常設導線。
  _buildNestMenu() {
    if (document.getElementById("nestpage-menu")) return;
    const row = document.getElementById("nestpage-row");
    if (!row) return;
    const nav = document.createElement("nav");
    nav.id = "nestpage-menu";
    nav.style.setProperty("--hqmenu-w", (CFG.hqMenuWidth || 200) + "px");
    nav.style.setProperty("--hqmenu-w-narrow", (CFG.hqMenuWidthNarrow || 52) + "px");
    nav.style.setProperty("--hqmenu-fs", CFG.hqMenuFontScale != null ? CFG.hqMenuFontScale : 1);
    nav.style.setProperty("--hqmenu-gap", (CFG.hqMenuGap != null ? CFG.hqMenuGap : 12) + "px");
    nav.style.setProperty("--hqmenu-pady", (CFG.hqMenuPadY != null ? CFG.hqMenuPadY : 96) + "px");
    nav.classList.add((CFG.hqMenuLayout || "spread") === "spread" ? "hm-spread" : "hm-stack");
    for (const it of (CFG.nestMenuItems || [])) {
      const b = document.createElement("button");
      b.type = "button";
      b.title = it.jp;
      b.innerHTML = `${Icon.svg(it.icon)}<span class="hm-tx"><span class="hm-jp">${it.jp}</span><span class="hm-en">${it.en}</span></span>`;
      b.addEventListener("click", () => {
        if (it.key === "hq") { this.closeNestPage(); this.openHqLab(); }
        else if (it.key === "dex") this.openDex();
        else if (it.key === "feed") this.closeNestPage();
      });
      nav.appendChild(b);
    }
    row.appendChild(nav);
  },

  buildNest(body) {
    const web = Game.state.nestWeb;
    const nodes = buildNestWeb();
    const counts = Game.nestWebCounts();
    // 次に開きそうなノード(進捗最大の未解放)
    let next = null, nextP = -1;
    for (const n of nodes) {
      if (n.id === "core" || web.nodes[n.id]) continue;
      const p = Game.nestProgress(n);
      if (p > nextP) { nextP = p; next = n; }
    }
    // V6-P2-2 B0/B4: レイアウト=中央ステージ(canvas背景+コア+web)+右パネル+ヒント帯(nest_image2 準拠)。
    //   右パネルの数値は実データのみ(モックの見本値 Lv.12/325/800 等は使わない・Ric裁定 2026-08-11)。
    //   B4: 大表示=解放ノード数 / 進捗バー=次に開きそうなノード / レア資源=6鉱石(写像対応表どおり)。
    const rate = counts.total ? Math.floor(counts.open / counts.total * 100) : 0;
    const nearCount = nodes.filter((n) => n.id !== "core" && !web.nodes[n.id] && Game.nestProgress(n) >= CFG.nestNearThreshold).length;
    body.innerHTML = `
      <div class="nest-head">
        <span>解放済み <b>${counts.open}/${counts.total}</b>
          ${next ? ` / 次に開きそう: <b>${next.name}</b>(${Math.floor(nextP * 100)}%)` : ""}</span>
        <span class="nest-legend">
          <i class="lg on"></i>解放済み <i class="lg near"></i>もうすぐ <i class="lg off"></i>未解放
        </span>
      </div>
      <div id="nest-main">
        <div id="nest-stage">
          <canvas id="nest-canvas"></canvas>
          <div id="nest-web"></div>
          <div id="nest-openrate"><span class="npo-cap">総解放率</span><b>${rate}%</b></div>
        </div>
        <aside id="nest-side">
          <div class="nest-panel"><h3>${Icon.svg("nestweb")} 巣のステータス</h3>
            <div class="np-frame-rank"><div class="np-fr-inner">
              <div class="np-label">解放ノード</div>
              <div class="np-big">${counts.open}<small>/${counts.total}</small></div>
              <div class="np-bar"><span style="width:${Math.round((next ? nextP : 1) * 100)}%"></span></div>
            </div></div>
            <div class="np-barcap">${next ? `次: ${next.name}(${Math.floor(nextP * 100)}%)` : "全ノード解放済み"}</div>
            <div class="np-row"><span>総解放率</span><b>${rate}%</b></div>
            <div class="np-row"><span>もうすぐ解放</span><b>${nearCount}個</b></div>
            <div class="np-row"><span>先行解放</span><b>${web.surprises || 0}回</b></div>
          </div>
          <div class="nest-panel"><h3>${Icon.svg("stone")} レア資源</h3>
            ${ORES.map((o) => `<div class="np-row np-ore"><span><i class="np-medal" style="color:${o.color}">${Icon.svg(o.icon)}</i>${o.name}</span><b>${(Game.state.rare && Game.state.rare[o.id]) || 0}</b></div>`).join("")}
          </div>
          <button id="nest-fx-btn" class="np-cta">${Icon.svg("spark")} 巣の効果一覧</button>
        </aside>
      </div>
      <div id="nest-hint">ヒント: 各ノードは繁殖や日々の営みで自然に解放される。巣のネットワークが広がるほど、コロニーは豊かになる。</div>
      <div id="nest-tip" class="hidden"></div>`;
    const wrap = body.querySelector("#nest-web");
    const { SIZE, C } = NESTWEB_GEO;
    const posOf = nestWebPos; // V6-P2-2 B2: 幾何は data.js の単一の真実(検分ゲートと共用)
    // 糸はSVGを廃止し canvas(Render.nestThreads=スアミの視覚言語)へ。結線規則と3状態は従来のまま。
    const links = nestWebLinks(nodes).map((l, i) => {
      const open = !!web.nodes[l.to.id];
      const parentOpen = l.from.id === "core" || !!web.nodes[l.from.id];
      return { from: l.from, to: l.to, i, state: open && parentOpen ? "lit" : open ? "half" : "off" };
    });
    let html = "";
    for (const n of nodes) {
      const [x, y] = posOf(n);
      const open = n.id === "core" || web.nodes[n.id];
      const p = open ? 1 : Game.nestProgress(n);
      const near = !open && p >= CFG.nestNearThreshold;
      const cls = n.id === "core" ? "core" : open ? "on" : near ? "near" : "off";
      const tip = n.id === "core" ? "巣の中心"
        : open ? `${n.name} — 解放済み` : `${n.name} — 進捗${Math.floor(p * 100)}%`;
      // V6-P2-2 B3: メダリオン意匠(参照準拠)。未解放=錠前 / 解放=報酬鉱石のグリフ(ORES.colorで彩色=データ駆動)。
      //   ラベルピルは on/near のみ(実UIは81ノード=モックの約14より密なため、全数表示は判読不能。数の差はRic裁定で再現対象外)。
      //   条件などの副記はタップのツールチップが引き続き担う。
      const ore = n.id === "core" ? null : oreById(n.reward.ore);
      const glyph = n.id === "core" ? Icon.svg("nestweb") : open ? `<b style="color:${ore.color}">${Icon.svg(ore.icon)}</b>` : Icon.svg("lock");
      const pill = n.id === "core" ? "" : open ? `<i class="wn-pill">${n.name}</i>` : near ? `<i class="wn-pill">${n.name}<em>${Math.floor(p * 100)}%</em></i>` : "";
      const ring = n.id === "core" ? "" : ` data-ring="${open ? ore.ring : "lock"}"`; // v2-V2: 素材リング(未解放=錠前素材)
      html += `<div class="wnode ${cls}" data-node="${n.id}" data-tip="${tip}"${ring} style="left:${x}px;top:${y}px">
        <span>${glyph}</span>${pill}</div>`;
    }
    wrap.innerHTML = html;
    // タップ=ツールチップのみ(§4.2)。解放操作は存在しない
    const tip = body.querySelector("#nest-tip");
    for (const el of wrap.querySelectorAll(".wnode")) {
      el.addEventListener("click", () => {
        const n = nodes.find((x) => x.id === el.dataset.node);
        if (!n || n.id === "core") { tip.classList.add("hidden"); return; }
        const open = web.nodes[n.id];
        const o = oreById(n.reward.ore);
        const condTxt = n.conds.map((c) => {
          const def = NEST_CONDS.find((d) => d.type === c.type);
          const cur = Math.floor(Game.nestMetric(c.type));
          return `${Icon.svg(def.icon)}${def.name} ${Math.min(cur, c.need)}/${c.need}${c.type === "dexRate" ? "%" : ""}`;
        }).join(" + ");
        tip.classList.remove("hidden");
        tip.innerHTML = `<b>${n.name}</b> ${open ? Icon.svg("check") + "解放済み" : ""}<br>
          条件: ${condTxt}<br>報酬: ${Icon.svg(o.icon)}${o.name}×${n.reward.n}
          ${open ? "" : `<br><span style="color:var(--sub)">いつもの繁殖を続ければ自然に開く</span>`}`;
      });
    }
    // V6-P2-2 B0/B1: ステージ実寸に合わせて背景+コアを描き、web(1100座標)をコア位置へスケール配置。
    //   パンは廃止(参照画像=全体が一望の構図)。座標は NEST_VIS=検分ゲートと同じ単一の真実。
    const stage = body.querySelector("#nest-stage");
    const layoutStage = () => {
      const cv = body.querySelector("#nest-canvas");
      if (!cv || !stage) return;
      const sw = stage.clientWidth, sh = stage.clientHeight;
      if (!sw || !sh) return;
      cv.width = sw; cv.height = sh;
      const nctx = cv.getContext("2d");
      const ccx = sw * NEST_VIS.core.x, ccy = sh * NEST_VIS.core.y, R = Math.min(sw, sh) * NEST_VIS.core.r;
      Render.nestBg(nctx, sw, sh);
      Render.nestCoreDraw(nctx, ccx, ccy, R, this._nestAsset("nest-core")); // v2: 素材(未着ならコード描画へ退化)
      const k = (Math.min(sw, sh) / SIZE) * 0.98;
      // B2: 糸(放射=結線規則+状態 / 横糸=網の織り・両端が解放済みのときだけ淡く灯る)
      const tf = ([x, y]) => [ccx + (x - C) * k, ccy + (y - C) * k];
      const laterals = nestWebLaterals(nodes).map((l) => ({
        from: l.from, to: l.to,
        state: web.nodes[l.from.id] && web.nodes[l.to.id] ? "half" : "off",
      }));
      Render.nestThreads(nctx, Render.nestThreadSegs(links.concat(laterals), tf, ccx, ccy, R));
      wrap.style.transform = `translate(${ccx - C * k}px, ${ccy - C * k}px) scale(${k})`;
    };
    // v2-V2/V3: DOM系素材(リング6+パネル枠2+ボタン1=同一トーンの装飾群)を先読みし、
    //   **全て**読めた時だけ .assets で一括切替(部分適用の混在意匠を作らない=欠けたら丸ごと退化)。
    //   コア素材(canvas)は別要素種のため独立退化(nestCoreDrawのフォールバック)。
    const ringKeys = Object.values(NEST_RING_ASSETS).concat(["panel-rank", "panel-rate", "btn-effects"]);
    const side = body.querySelector("#nest-side");
    const applyRingAssets = () => {
      const all = ringKeys.every((k2) => this._nestAsset(k2));
      wrap.classList.toggle("assets", all);
      if (side) side.classList.toggle("assets", all);
      const orate = body.querySelector("#nest-openrate");
      if (orate) orate.classList.toggle("assets", all);
    };
    ringKeys.forEach((k2) => this._nestAsset(k2));
    this._nestAsset("spark-big-b"); // スパークFx用の先読み(.assets条件には含めない=無くてもFxを黙って省くだけ)
    this._nestRingApply = applyRingAssets;
    applyRingAssets();
    this._nestLayout = layoutStage;
    requestAnimationFrame(layoutStage);
    // B4: 効果一覧(閲覧専用・実データ=解放済みノードの獲得報酬)
    const fxBtn = body.querySelector("#nest-fx-btn");
    if (fxBtn) fxBtn.addEventListener("click", () => this.openNestEffects());
  },
  // v2-V3+(Ric裁定: スパークは「①解放の瞬間の一回性」のみ採用・②常設微飾は不採用)。
  //   一回性=animationendで自壊(残らない) / reduced-motionでは出さない(解放状態の表示自体が変化を伝える) /
  //   決定論(乱数なし・1解放=1つ) / CFG.nestSparkOn でOFF可 / 素材が無ければ出さない(退化=状態表示のみ)。
  nestSparkFx(nodes) {
    if (!this.nestPageOpen || !this.nestPageOpen()) return;
    const body = document.getElementById("nestpage-body");
    if (body) this.buildNest(body); // 解放後の状態を即反映(スパークは変化の瞬間の徴)
    if (CFG.nestSparkOn === false) return;
    if (typeof Motion !== "undefined" && Motion.reduced) return;
    if (!this._nestAsset("spark-big-b")) return;
    for (const n of (nodes || []).slice(0, 3)) { // 同時多発は3つまで(過剰にしない・通常プレイは1〜2解放/回)
      const el = body && body.querySelector(`.wnode[data-node="${n.id}"]`);
      if (!el) continue;
      const img = document.createElement("img");
      img.className = "wn-spark";
      img.src = "image/nest/spark-big-b.png";
      img.alt = "";
      img.addEventListener("animationend", () => img.remove());
      el.appendChild(img);
    }
  },
  // B4: 巣の効果一覧(モーダル・閲覧専用)。解放済みノードと獲得済み報酬の一覧=実データのみ
  openNestEffects() {
    const web = Game.ensureNestWeb();
    const opened = buildNestWeb().filter((n) => n.id !== "core" && web.nodes[n.id]);
    this.openModal(`${Icon.svg("spark")} 巣の効果一覧`, (body) => {
      body.innerHTML = opened.length
        ? `<div class="nest-fx-list">${opened.map((n) => {
            const o = oreById(n.reward.ore);
            return `<div class="np-row np-ore"><span><i class="np-medal" style="color:${o.color}">${Icon.svg(o.icon)}</i>${n.name}</span><b>${o.name}×${n.reward.n}</b></div>`;
          }).join("")}</div>
          <p class="nest-fx-note">解放時に受け取り済み。巣は増えるほど豊かになる。</p>`
        : `<p class="nest-fx-note">まだ解放された巣がない。いつもの繁殖を続ければ自然に開く。</p>`;
    });
  },
});
