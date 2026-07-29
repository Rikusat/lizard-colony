// =============================================================
// screens/breeding — 繁殖ピッカー(種×モーフタイル+A/Bスロット)
// UISkills §15。旧・系統→個体二段階UIは完全置換(git記録+撤去前スクショ=§6R.11)。
//
// 【自動選出の撤廃(Ric裁定 2026-07-29)】手動での掛け合わせこそがゲームUXの核であり、
//   自動選出と予約はその体験を痩せさせる。よって以下を撤廃した:
//     ・クイック繁殖ボタン(全対総当たりargmax) ・希少スコア式(CFG.breedScoreW 系) ・繁殖予約トグル(autoBreed)
//   残すもの: 種×モーフのタイル / A/Bスロット / 特性チップ / 固定印 / ◀▶切替 / 同種残0のグレーアウト。
//   **スロット内の巡回・自動選出は id 昇順の安定順序**(希少スコア順ではない)=プレイヤーが順序を予測できる。
// 実行は Game.breed(唯一の経路=コスト/CD/確率/遺伝は不変)。
// =============================================================

Object.assign(UI, {
  // ---------------- モーダル(種×モーフタイル+A/Bスロット) ----------------
  openBreedMenu(preA) {
    this._bmState = { a: preA ? preA.id : null, b: null };
    this.openModal(`${Icon.svg("breed")} 繁殖 — 種を選ぶ`, (body) => this._bmBuild(body));
  },
  openBreed() { this.openBreedMenu(); },          // 旧導線の互換(#breedハッシュ等)
  openBreedPicker(lz) { this.openBreedMenu(lz); }, // 旧・相手選択の互換(詳細パネル=A事前選択)

  _bmGroups() { // 種×モーフのタイル群(案B)。全所持を表示(繁殖可0もグレーで=全体像を隠さない)
    const map = new Map();
    for (const lz of Game.state.lizards) {
      const key = lz.speciesId + ":" + lz.morphId;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(lz);
    }
    return [...map.entries()].map(([key, list]) => {
      const ready = list.filter((l) => Game.canBreed(l)).sort((x, y) => x.id - y.id);  // 安定順序=id昇順(希少スコア順は撤廃)
      return { key, list, ready, rep: ready[0] || list[0] };
    }).sort((g, h) => (h.ready.length - g.ready.length) || (h.list.length - g.list.length));
  },
  _bmDrawLz(cv, lz, scale) {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    const tmp = { ...lz, x: cv.width / 2 / scale, y: cv.height / 2 / scale + 8, tx: 0, ty: 0, angle: 0.12, moving: false };
    c.save(); c.scale(scale, scale);
    Render.drawLizard(c, tmp, true);
    c.restore();
  },
  _bmSlotHtml(tag, lz) {
    if (!lz) return `<div class="sp-slot"><span class="tag">${tag}</span><span class="empty">${tag === "A" ? "種タイルを選ぶ" : "A選択後にBを選ぶ"}</span></div>`;
    const mo = morphById(lz.morphId);
    return `<div class="sp-slot"><span class="tag">${tag}</span>
      <canvas width="120" height="84" data-slotlz="${lz.id}"></canvas>
      <div class="who"><b class="${mo.legendary ? "leg-name" : ""}">${Game.lizardName(lz)}</b><span class="desc">${mo.name} / Lv${lz.level || 1}</span>${this.breedTraitChips(lz)}</div>
      <div class="sp-nav"><button data-nav="${tag}:-1" title="同種同モーフ内で前へ">◀</button><button data-nav="${tag}:1" title="同種同モーフ内で次へ">▶</button></div>
    </div>`;
  },
  _bmBuild(body) {
    const st = this._bmState;
    const groups = this._bmGroups();
    const A = Game.state.lizards.find((l) => l.id === st.a) || null;
    const B = Game.state.lizards.find((l) => l.id === st.b) || null;
    let th = `<p style="font-size:calc(12px * var(--fs-scale,1));color:var(--sub);margin-bottom:8px">種を選ぶとA/Bに個体が入る(◀▶で切替)。卵スロット ${Game.state.eggs.length}/${Game.eggSlotCap()}</p><div class="sp-tiles" style="--sp-tile-w:${CFG.breedTileMinW || 150}px">`;
    for (const g of groups) {
      const hasA = A && g.list.includes(A), hasB = B && g.list.includes(B);
      const remain = g.ready.filter((l) => l !== A && l !== B).length;
      // 同種(同タイル)の繁殖可残(A/B除く)が0=グレーアウト。繁殖可0のタイルもグレー
      const gray = (!hasA && !hasB && g.ready.length === 0) || ((hasA || hasB) && remain === 0 && !(hasA && hasB));
      const sp = speciesById(g.rep.speciesId), mo = morphById(g.rep.morphId);
      th += `<div class="sp-tile ${hasA ? "picked-a" : hasB ? "picked-b" : ""} ${gray ? "grayed" : ""}" data-tile="${g.key}">
        <canvas width="120" height="72" data-tilelz="${g.rep.id}"></canvas>
        <b>${sp.name}</b><span class="cnt">${mo.name}${(CFG.breedCountBadge !== false) ? ` × ${g.list.length}匹 / 繁殖可 ${g.ready.length}` : ""}</span></div>`;
    }
    th += `</div>`;
    const cost = A && B ? Game.breedCost(A, B) : 0;
    const sl = `<div class="sp-slots">${this._bmSlotHtml("A", A)}${this._bmSlotHtml("B", B)}</div>`;
    // 自動選出(クイック繁殖)と繁殖予約は撤廃(Ric裁定 2026-07-29)。残るのは手動確定のみ
    const act = `<div class="sp-actions">
      <button id="bm-go" class="cta" ${A && B && Game.state.coins >= cost ? "" : "disabled"}>${Icon.svg("breed")} この組で繁殖 ${A && B ? `(${Icon.svg("coin")}${fmt(cost)})` : ""}</button>
    </div>`;
    body.innerHTML = th + sl + act;
    for (const cv of body.querySelectorAll("[data-tilelz]")) this._bmDrawLz(cv, Game.state.lizards.find((l) => l.id === +cv.dataset.tilelz), 0.55);
    for (const cv of body.querySelectorAll("[data-slotlz]")) this._bmDrawLz(cv, Game.state.lizards.find((l) => l.id === +cv.dataset.slotlz), 0.62);
    // タイル選択: A→B の順。タイル内の希少スコア最高(他スロット占有は除く)を自動選出
    for (const el of body.querySelectorAll(".sp-tile:not(.grayed)")) {
      el.addEventListener("click", () => {
        const g = groups.find((x) => x.key === el.dataset.tile);
        if (!g) return;
        const other = st.a && !st.b ? st.a : st.b;
        const pick = g.ready.find((l) => l.id !== st.a && l.id !== st.b);
        if (!pick) return;
        if (!st.a) st.a = pick.id;
        else if (!st.b) st.b = pick.id;
        else { st.a = pick.id; st.b = null; } // 両方選択済みで別タイル=Aから選び直し
        void other;
        this._bmBuild(body);
      });
    }
    // ◀▶: 同タイル内を id 昇順(安定順序)で巡回(他スロット占有は除く)
    for (const nb of body.querySelectorAll("[data-nav]")) {
      nb.addEventListener("click", (e) => {
        e.stopPropagation();
        const [tag, dirS] = nb.dataset.nav.split(":");
        const dir = parseInt(dirS, 10);
        const cur = tag === "A" ? A : B;
        if (!cur) return;
        const g = groups.find((x) => x.list.includes(cur));
        const ring = g.ready.filter((l) => l.id !== (tag === "A" ? st.b : st.a));
        if (ring.length < 2) return;
        const i = ring.indexOf(cur);
        const nxt = ring[(i + dir + ring.length) % ring.length];
        if (tag === "A") st.a = nxt.id; else st.b = nxt.id;
        this._bmBuild(body);
      });
    }
    const go = body.querySelector("#bm-go");
    if (go) go.addEventListener("click", () => {
      if (!A || !B) return;
      if (Game.breed(A.id, B.id)) { this._bmState = { a: null, b: null }; this._bmBuild(body); } // 実行=Game.breed(唯一の経路・旧UIと同一)
      else this._bmBuild(body);
    });
  },
});
