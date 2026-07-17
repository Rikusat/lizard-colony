// =============================================================
// screens/breeding — 繁殖画面(系統→個体の二段階選択+クイック繁殖)
// UISkills.md §8: ui/screens/breeding相当。
// =============================================================

Object.assign(UI, {
  // ---------------- 繁殖(系統→個体の二段階選択 / GameExpansion_v2 ⑦⑧) ----------------
  openBreed() {
    this.breedView = { speciesId: null, picks: [], onlyReady: false, sort: "rare" };
    this.openModal(`${Icon.svg("breed")} 繁殖`, (body) => this.buildBreed(body));
  },

  buildBreed(body) {
    const v = this.breedView;
    if (v.speciesId === null) this.buildBreedSpecies(body);
    else this.buildBreedIndividuals(body);
  },

  rebuildBreed() {
    this.buildBreed(this.els["modal-body"]);
  },

  // 第1画面: 系統カード一覧

  buildBreedSpecies(body) {
    const lizards = Game.state.lizards;
    const groups = {};
    for (const lz of lizards) {
      const g = groups[lz.speciesId] = groups[lz.speciesId] || { total: 0, ready: 0 };
      g.total++;
      if (Game.canBreed(lz)) g.ready++;
    }
    const readyAll = lizards.filter((lz) => Game.canBreed(lz)).length;
    body.innerHTML = `
      <p style="font-size:calc(13px * var(--fs-scale, 1));color:var(--sub);margin-bottom:10px">
        系統を選んで2匹ペアを決めよう。突然変異で新モーフや上位種族が生まれることも…!
        (卵スロット ${Game.state.eggs.length}/${Game.eggSlotCap()})</p>
      <button id="quick-breed" class="cta">${Icon.svg("energy")} クイック繁殖 (最善の2匹を自動選抜・長押しで連続)</button>
      ${Game.facLv("breedfac") >= 5
        ? `<button id="auto-breed" class="${Game.state.autoBreed ? "primary" : ""}" style="width:100%;margin-bottom:10px">${Icon.svg("breedfac")} 繁殖予約: ${Game.state.autoBreed ? "ON(卵スロットが空くと自動繁殖)" : "OFF"}</button>`
        : `<div style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub);margin-bottom:10px">繁殖施設Lv5で「繁殖予約」(自動繁殖)が解禁</div>`}
      <div id="breed-species"></div>`;

    const ab = body.querySelector("#auto-breed");
    if (ab) ab.addEventListener("click", () => {
      Game.state.autoBreed = !Game.state.autoBreed;
      this.toast(Game.state.autoBreed ? "繁殖予約ON: スロットが空くたび自動でクイック繁殖" : "繁殖予約OFF");
      this.rebuildBreed();
    });
    const qb = body.querySelector("#quick-breed");
    qb.addEventListener("click", () => {
      const pair = Game.quickBreedPick();
      if (pair && Game.quickBreed()) {
        this.toast(`選抜: ${Game.lizardName(pair[0])} Lv${pair[0].level} × ${Game.lizardName(pair[1])} Lv${pair[1].level}(レア度と成長が最も高いペア)`);
      }
      this.rebuildBreed();
    });
    attachHold(qb, () => Game.quickBreed(true));

    const list = body.querySelector("#breed-species");
    // 繁殖可能数が多い順、空系統は最後尾
    const ids = SPECIES.filter((sp) => groups[sp.id]).map((sp) => sp.id)
      .sort((a, b) => (groups[b].ready - groups[a].ready) || (groups[b].total - groups[a].total));
    const makeCard = (id, name, stars, swCss, total, ready) => {
      const card = document.createElement("div");
      card.className = "breed-card" + (ready < 1 ? " cd" : "");
      card.innerHTML = `
        <span class="sw" style="background:${swCss}"></span>
        <div class="grow"><b>${name}</b>
          <div class="desc">${stars ? "★".repeat(stars) + " / " : ""}個体 ${total} 匹</div></div>
        <span class="ready-badge${ready ? "" : " off"}">繁殖可 ${ready}</span>`;
      card.addEventListener("click", () => {
        this.breedView.speciesId = id;
        this.breedView.picks = [];
        this.rebuildBreed();
      });
      list.appendChild(card);
    };
    // 「すべて」カード(異系統ペア用)
    makeCard("__all", "すべての系統", 0, "linear-gradient(90deg,#e8b64c,#7fb24f,#4f9fd9)", lizards.length, readyAll);
    for (const id of ids) {
      const sp = speciesById(id);
      makeCard(id, sp.name, sp.stars, `hsl(${sp.hue},${sp.sat}%,${sp.light}%)`, groups[id].total, groups[id].ready);
    }
    if (!ids.length) list.innerHTML += `<p>トカゲがいない…</p>`;
  },

  // 第2画面: 個体グリッド

  buildBreedIndividuals(body) {
    const v = this.breedView;
    const all = v.speciesId === "__all"
      ? Game.state.lizards
      : Game.state.lizards.filter((lz) => lz.speciesId === v.speciesId);
    const title = v.speciesId === "__all" ? "すべての系統" : speciesById(v.speciesId).name;

    let list = all.filter((lz) => !v.onlyReady || Game.canBreed(lz));
    // 繁殖可能を上位に、その中を選択ソート順で
    const key = v.sort === "rare"
      ? (lz) => Game.quickBreedScore(lz)
      : (lz) => lz.level;
    list = [...list].sort((a, b) =>
      (Game.canBreed(b) - Game.canBreed(a)) || (key(b) - key(a)));

    body.innerHTML = `
      <div class="breed-head">
        <button id="breed-back">← 系統一覧</button>
        <b>${title}</b>
        <span style="color:var(--sub);font-size:calc(12px * var(--fs-scale, 1))">2匹選択(卵 ${Game.state.eggs.length}/${Game.eggSlotCap()})</span>
      </div>
      <div class="breed-filters">
        <button id="bf-ready" class="${v.onlyReady ? "primary" : ""}">繁殖可のみ</button>
        <button id="bf-rare" class="${v.sort === "rare" ? "primary" : ""}">レア度順</button>
        <button id="bf-level" class="${v.sort === "level" ? "primary" : ""}">レベル順</button>
      </div>
      <div class="breed-grid" id="breed-grid"></div>
      <button id="breed-go" class="cta" disabled>2匹選んでね</button>`;

    body.querySelector("#breed-back").addEventListener("click", () => {
      v.speciesId = null; v.picks = [];
      this.rebuildBreed();
    });
    body.querySelector("#bf-ready").addEventListener("click", () => { v.onlyReady = !v.onlyReady; this.rebuildBreed(); });
    body.querySelector("#bf-rare").addEventListener("click", () => { v.sort = "rare"; this.rebuildBreed(); });
    body.querySelector("#bf-level").addEventListener("click", () => { v.sort = "level"; this.rebuildBreed(); });

    const grid = body.querySelector("#breed-grid");
    for (const lz of list) {
      const ok = Game.canBreed(lz);
      const col = Render.lizardColor(lz);
      const cell = document.createElement("div");
      cell.className = "breed-cell" + (ok ? "" : " cd") + (v.picks.includes(lz.id) ? " sel" : "");
      const status = ok ? "繁殖可"
        : lz.injuredT > 0 ? "負傷中"
        : lz.breedCd > 0 ? "CD " + Math.ceil(lz.breedCd) + "s"
        : "ベビー";
      cell.innerHTML = `
        <span class="sw" style="background:${col.css}"></span>
        <div class="nm">${Game.lizardName(lz)}</div>
        <div class="mo">${morphById(lz.morphId).name} / ${lz.stage === "baby" ? "ベビー" : "Lv" + lz.level}</div>
        <div class="st">${status}</div>`;
      if (ok) cell.addEventListener("click", () => {
        if (v.picks.includes(lz.id)) v.picks = v.picks.filter((id) => id !== lz.id);
        else {
          v.picks.push(lz.id);
          if (v.picks.length > 2) v.picks.shift();
        }
        this.rebuildBreed();
      });
      grid.appendChild(cell);
    }
    if (!list.length) grid.innerHTML = `<p style="grid-column:1/-1">該当する個体がいない</p>`;

    const go = body.querySelector("#breed-go");
    if (v.picks.length === 2) {
      const a = Game.state.lizards.find((x) => x.id === v.picks[0]);
      const b = Game.state.lizards.find((x) => x.id === v.picks[1]);
      if (a && b) {
        go.disabled = false;
        go.textContent = `この2匹で繁殖する (${fmt(Game.breedCost(a, b))}G)`;
        go.onclick = () => {
          if (Game.breed(a.id, b.id)) {
            v.picks = [];
            this.rebuildBreed();
          }
        };
      }
    }
  },
});
