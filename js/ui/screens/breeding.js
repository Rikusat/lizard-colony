// =============================================================
// screens/breeding — 繁殖ピッカーv2(R1・2026-07-25承認: 案B=種×モーフタイル+A/Bスロット+クイック繁殖)
// UISkills §15。旧・系統→個体二段階UIは完全置換(git記録+撤去前スクショ=§6R.11)。
// 選出のみUI側(希少スコア=CFG.breedScoreW・決定論・乱数不使用)。実行は Game.breed(唯一の経路=コスト/CD/確率/遺伝は不変)。
// 繁殖予約(autoBreed=Game.quickBreed・巣Lv5+)は存続(機能撤廃0)。
// =============================================================

Object.assign(UI, {
  // ---------------- 希少スコア(承認式・決定論) ----------------
  // score(A,B) = Wdex×dex到達 + Wrecipe×レシピ寄与 + Wrare×希少特性 + Wfix×固定印(桁分離=辞書式優先)
  _bsTraits(lz) { return (lz.traits || []).map((t) => (t && t.key ? t.key : t)); },
  _bsColonyCount(key) {
    let n = 0;
    for (const lz of Game.state.lizards) if (this._bsTraits(lz).includes(key)) n++;
    return Math.max(1, n);
  },
  _bsColonyHasTrait(key) {
    return Game.state.lizards.some((lz) => this._bsTraits(lz).includes(key));
  },
  breedPairScore(a, b) {
    const W = CFG.breedScoreW || { dex: 1000, recipe: 100, rare: 10, fixed: 1 };
    // (1) dex到達: {A種,B種}×{両親モーフ+変異先(非レジェ)}のうち図鑑未登録数。上位種変異=CFG.breedScoreUpMut(既定OFF)
    const spCands = new Set([a.speciesId, b.speciesId]);
    if (CFG.breedScoreUpMut) {
      for (const sid of [a.speciesId, b.speciesId]) {
        const base = speciesById(sid);
        for (const up of Game.breedablePool()) if (up.stars > base.stars) spCands.add(up.id);
      }
    }
    const moCands = new Set([a.morphId, b.morphId]);
    for (const m of MORPHS) if (!m.legendary) moCands.add(m.id); // モーフ変異は非レジェ全域へ到達し得る
    let dex = 0;
    for (const sid of spCands) for (const mid of moCands) if (!Game.state.dex[sid + ":" + mid]) dex++;
    // (2) レシピ寄与: union(traits)が{a,b}両含み(成果=コロニー未所持のみ)
    const un = new Set([...this._bsTraits(a), ...this._bsTraits(b)]);
    let rec = 0;
    for (const r of RECIPES) if (un.has(r.a) && un.has(r.b) && !this._bsColonyHasTrait(r.result)) rec++;
    // (3) 希少特性: Σ 1/コロニー内保有数
    let rare = 0;
    for (const k of un) rare += 1 / this._bsColonyCount(k);
    // (4) 固定印
    const fx = ((a.fixedTraits || []).length + (b.fixedTraits || []).length);
    return W.dex * dex + W.recipe * rec + W.rare * rare + W.fixed * fx;
  },
  // 個体単独スコア(タイル選択時の自動選出・◀▶の巡回順)。同成分の単独版・同点=id昇順
  breedLizardScore(lz) {
    const W = CFG.breedScoreW || { dex: 1000, recipe: 100, rare: 10, fixed: 1 };
    let dex = 0;
    const moCands = new Set([lz.morphId]);
    for (const m of MORPHS) if (!m.legendary) moCands.add(m.id);
    for (const mid of moCands) if (!Game.state.dex[lz.speciesId + ":" + mid]) dex++;
    let rec = 0;
    const mine = new Set(this._bsTraits(lz));
    for (const r of RECIPES) if ((mine.has(r.a) || mine.has(r.b)) && !this._bsColonyHasTrait(r.result)) rec++;
    let rare = 0;
    for (const k of mine) rare += 1 / this._bsColonyCount(k);
    return W.dex * dex + W.recipe * rec + W.rare * rare + W.fixed * (lz.fixedTraits || []).length;
  },
  // クイック: 繁殖可アダルト全対の総当たりargmax(同点=(a.id,b.id)辞書式昇順)
  breedQuickPick() {
    const cands = Game.state.lizards.filter((lz) => Game.canBreed(lz));
    let best = null;
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i].id < cands[j].id ? cands[i] : cands[j];
      const b = a === cands[i] ? cands[j] : cands[i];
      const s = this.breedPairScore(a, b);
      if (!best || s > best.s || (s === best.s && (a.id < best.a.id || (a.id === best.a.id && b.id < best.b.id)))) best = { a, b, s };
    }
    return best;
  },

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
      const ready = list.filter((l) => Game.canBreed(l)).sort((x, y) => (this.breedLizardScore(y) - this.breedLizardScore(x)) || (x.id - y.id));
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
    let th = `<p style="font-size:calc(12px * var(--fs-scale,1));color:var(--sub);margin-bottom:8px">種を選ぶとA/Bに希少スコア最高の個体が入る(◀▶で切替)。卵スロット ${Game.state.eggs.length}/${Game.eggSlotCap()}</p><div class="sp-tiles" style="--sp-tile-w:${CFG.breedTileMinW || 150}px">`;
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
    const act = `<div class="sp-actions">
      ${Game.nestLv() >= CFG.nestReserveLv ? `<button id="bm-reserve" class="${Game.state.autoBreed ? "primary" : ""}">${Icon.svg("burrow")} 繁殖予約: ${Game.state.autoBreed ? "ON" : "OFF"}</button>` : ""}
      <button id="bm-quick" class="quick">${Icon.svg("spark")} クイック繁殖(最も希少な組を選出)</button>
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
    // ◀▶: 同タイル内を希少スコア順に巡回(他スロット占有は除く)
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
    const qb = body.querySelector("#bm-quick");
    if (qb) qb.addEventListener("click", () => {
      const q = this.breedQuickPick();
      if (!q) { this.toast("繁殖できる個体がいない…", true); return; }
      st.a = q.a.id; st.b = q.b.id;
      this._bmBuild(body);
      this.toast(`クイック選出: ${Game.lizardName(q.a)} × ${Game.lizardName(q.b)}(実行は確定ボタン)`);
    });
    const rv = body.querySelector("#bm-reserve");
    if (rv) rv.addEventListener("click", () => {
      Game.state.autoBreed = !Game.state.autoBreed;
      this.toast(Game.state.autoBreed ? "繁殖予約ON: スロットが空くたび自動でクイック繁殖" : "繁殖予約OFF");
      this._bmBuild(body);
    });
    const go = body.querySelector("#bm-go");
    if (go) go.addEventListener("click", () => {
      if (!A || !B) return;
      if (Game.breed(A.id, B.id)) { this._bmState = { a: null, b: null }; this._bmBuild(body); } // 実行=Game.breed(唯一の経路・旧UIと同一)
      else this._bmBuild(body);
    });
  },
});
