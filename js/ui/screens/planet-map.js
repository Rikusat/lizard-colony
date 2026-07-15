// =============================================================
// screens/planet-map — 惑星マップ/移住確認/開拓/宇宙船トランジション/ステージバー
// UISkills.md §8: ui/screens/planetMap相当。
// =============================================================

Object.assign(UI, {
  // ---------------- V3: Stage切替(独立コロニー) ----------------
  openStages() {
    this.openModal(`${Icon.svg("planet")} コロニー一覧 (各Stageは独立して生き続ける)`, (body) => {
      body.innerHTML = "";
      const cur = Game.currentStage();
      for (const st of STAGES) {
        const unlocked = Game.state.rank >= st.rank;
        const data = Game.stageData(st.id);
        const row = document.createElement("div");
        row.className = "list-row" + (unlocked ? "" : " done");
        const pop = data ? data.lizards.length : 0;
        const badges = unlocked ? Game.stageBadges(st.id === cur.id ? Game.activeStageData() : data).join("") : "";
        const extra = [
          st.envText,
          data && data.pioneered ? `個体${pop}匹 / 撃退${(data.boss && data.boss.wins) || 0}回` : (unlocked ? "未開拓" : ""),
        ].filter(Boolean).join(" / ");
        if (unlocked) {
          const here = cur.id === st.id;
          const pioneered = data && data.pioneered;
          row.innerHTML = `
            <span class="fic" style="background:${st.ground};border-color:${st.accent}">${Icon.svg(st.icon)}</span>
            <div class="grow"><b>${st.name}</b> ${badges}
              <div class="desc">${extra}</div></div>
            ${here ? `<span class="lv">滞在中</span>` : `<button>${pioneered ? "移動" : Icon.svg("build") + " 開拓"}</button>`}`;
          if (!here) row.querySelector("button").addEventListener("click", () => this.confirmSwitch(st.id));
        } else {
          row.innerHTML = `
            <span class="fic">${Icon.svg("lock")}</span>
            <div class="grow"><b>${st.name}</b>
              <div class="desc">${st.envText}</div></div>
            <span class="lv">R${st.rank}で解放</span>`;
        }
        body.appendChild(row);
      }
    });
  },

  // 切替(未開拓なら創始者の卵を選ぶ §9.4)

  confirmSwitch(stageId) {
    const data = Game.stageData(stageId);
    if (data && data.pioneered) {
      Game.selectStage(stageId);
      this.closeModal();
      return;
    }
    const st = stageById(stageId);
    const max = CFG.founderCount;
    this.founderPicks = [];
    this.openModal(`${Icon.svg("build")} ${Icon.svg(st.icon)}「${st.name}」を開拓する`, (body) => this.buildPioneer(body, stageId));
  },

  buildPioneer(body, stageId) {
    const max = CFG.founderCount;
    const picks = this.founderPicks;
    const founders = Game.state.lizards.filter((lz) => Game.canFound(lz, stageId));
    body.innerHTML = `
      <p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        新しい土地の開拓には本部Lv${Game.hqLevel()}の支援(コオロギ・資金・水場/シェルター無償)が付く。<br>
        <b style="color:var(--gold)">創始者の卵</b>: 今のコロニーから血統を最大${max}匹まで連れて行ける(繁殖できるよう2匹推奨。個体自体は移動しない)。</p>
      <div class="breed-filters" style="margin-bottom:10px">
        <button id="pioneer-go" class="primary">${picks.length ? `${Icon.svg("crown")} ${picks.length}匹連れて開拓する` : "この2匹を選んで開拓"}</button>
        <button id="pioneer-skip">連れずに開拓</button>
      </div>
      <div class="breed-grid" id="founder-list" style="max-height:44vh"></div>`;
    body.querySelector("#pioneer-go").addEventListener("click", () => {
      Game.selectStage(stageId, picks.slice());
      this.closeModal();
    });
    body.querySelector("#pioneer-skip").addEventListener("click", () => {
      Game.selectStage(stageId, []);
      this.closeModal();
    });
    const list = body.querySelector("#founder-list");
    for (const lz of founders.slice(0, 60)) {
      const col = Render.lizardColor(lz);
      const sel = picks.includes(lz.id);
      const cell = document.createElement("div");
      cell.className = "breed-cell" + (sel ? " sel" : "");
      cell.innerHTML = `<span class="sw" style="background:${col.css}"></span>
        <div class="nm">${Game.lizardName(lz)}</div>
        <div class="mo">Lv${lz.level}${lz.founder ? " " + Icon.svg("crown") : ""}</div>`;
      cell.addEventListener("click", () => {
        const i = picks.indexOf(lz.id);
        if (i >= 0) picks.splice(i, 1);
        else if (picks.length < max) picks.push(lz.id);
        else this.toast(`連れて行けるのは${max}匹まで`, true);
        this.buildPioneer(this.els["modal-body"], stageId);
      });
      list.appendChild(cell);
    }
    if (!founders.length) list.innerHTML = `<p style="color:var(--sub);grid-column:1/-1">持ち込めるアダルトがいない(固有種は持ち出せない)</p>`;
  },

  // ---------------- V4 §4-1: 惑星マップ+宇宙船トランジション ----------------
  openMap() {
    this.openModal(`${Icon.svg("planet")} 惑星マップ — Planet Reptile`, (body) => {
      const s = Game.state;
      const cur = Game.currentStage();
      const pos = {
        1: [7, 58], 2: [17, 26], 3: [27, 62], 4: [37, 24], 5: [47, 58],
        6: [57, 26], 7: [67, 60], 8: [77, 26], 9: [86, 60], 10: [93, 38],
      };
      let html = `<div id="planet-map">`;
      for (const st of STAGES) {
        const unlocked = s.rank >= st.rank;
        const data = st.id === cur.id ? Game.activeStageData() : Game.stageData(st.id);
        const inv = 0; // V4.1: 侵略リング廃止(侵食は全惑星共通)
        const pop = data ? data.lizards.length : 0;
        const badges = unlocked && data ? Game.stageBadges(data).join("") : "";
        const [x, y] = pos[st.id];
        const frontier = st.id === Game.frontierId();
        html += `
          <div class="planet-node ${unlocked ? "" : "locked"} ${st.id === cur.id ? "here" : ""} ${frontier && unlocked ? "frontier" : ""}" data-planet="${st.id}"
            style="left:${x}%;top:${y}%">
            <div class="pn-ring" style="--pa:${UI.planetAccent(st.id)}">
              <div class="pn-ball" style="background:radial-gradient(circle at 35% 30%, ${st.ground}, ${st.ground2})">${Icon.svg(unlocked ? st.icon : "lock")}</div>
            </div>
            <div class="pn-name">${unlocked ? st.pname : "HQ Lv" + st.rank}${frontier && unlocked ? " " + Icon.svg("star") : ""}</div>
            <div class="pn-sub">${unlocked ? (data && data.pioneered ? `${Icon.svg("lizard")}${pop} ${badges}` : "未開拓") : ""}</div>
          </div>`;
      }
      const ero = Math.round(Game.state.erosion || 0);
      html += `</div>
        <div class="map-legend">
          <span>${Icon.svg("star")} フロンティア(生産・報酬・XPボーナス)</span>
          <span>◎ 現在地</span>
          <span class="map-ero">${Icon.svg("erosion")} 侵食率(全惑星共通)
            <span class="bar"><span style="width:${ero}%"></span></span> <b>${ero}%</b></span>
          <span style="color:var(--sub)">タップで宇宙船が出発(クリックでスキップ)</span>
        </div>`;
      body.innerHTML = html;
      for (const node of body.querySelectorAll(".planet-node")) {
        const id = +node.dataset.planet;
        if (Game.state.rank < stageById(id).rank || id === cur.id) continue;
        node.addEventListener("click", () => this.travelTo(id));
      }
    });
  },

  // 宇宙船トランジション(スキップ可)

  travelTo(id) {
    this.closeModal();
    const from = Game.currentStage();
    const to = stageById(id);
    let ov = document.getElementById("travel-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "travel-overlay";
      document.body.appendChild(ov);
    }
    ov.innerHTML = `
      <div class="tv-stars"></div>
      <div class="tv-from">${Icon.svg(from.icon)} ${from.pname}</div>
      <div class="tv-ship">${Icon.svg("rocket")}</div>
      <div class="tv-to" style="color:${this.planetAccent(to.id)}">${Icon.svg(to.icon)} ${to.pname}</div>
      <div class="tv-skip">クリックでスキップ</div>`;
    ov.classList.add("show");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ov.classList.remove("show");
      this.confirmSwitch(id);
    };
    ov.onclick = finish;
    setTimeout(finish, Motion.reduced ? 500 : 1400); // reduced時は即到着(§4.4)
  },

  // ---------------- V3: Stage切替バー (§10.1) ----------------
  updateStageBar() {
    const bar = document.getElementById("stage-bar");
    const cur = Game.currentStage();
    let sig = "";
    const tabs = [];
    for (const st of STAGES) {
      const unlocked = Game.state.rank >= st.rank;
      const data = st.id === cur.id ? Game.activeStageData() : Game.stageData(st.id);
      const badges = unlocked && data ? Game.stageBadges(data).join("") : "";
      const pop = data ? data.lizards.length : 0;
      tabs.push({ st, unlocked, badges, pop });
      sig += `${st.id}:${unlocked}:${badges}:${pop}:${st.id === cur.id};`;
    }
    if (sig === this._stageBarSig) return;
    this._stageBarSig = sig;
    bar.innerHTML = "";
    // V4: 先頭は惑星マップボタン
    const mapBtn = document.createElement("button");
    mapBtn.className = "stage-tab map-tab";
    mapBtn.innerHTML = `<span class="si">${Icon.svg("planet")}</span><span class="sn">マップ</span>`;
    mapBtn.addEventListener("click", () => this.openMap());
    bar.appendChild(mapBtn);
    for (const t of tabs) {
      const el = document.createElement("button");
      el.className = "stage-tab" + (t.st.id === cur.id ? " active" : "") + (t.unlocked ? "" : " locked");
      el.title = t.unlocked ? t.st.envText : `R${t.st.rank}で解放`;
      el.innerHTML = t.unlocked
        ? `<span class="si">${Icon.svg(t.st.icon)}</span><span class="sn">${PLANET_NAMES[t.st.id]}</span><span class="sp">${t.pop}</span><span class="sb">${t.badges}</span>`
        : `<span class="si">${Icon.svg("lock")}</span><span class="sn">${t.st.name}</span><span class="sp">R${t.st.rank}</span>`;
      if (t.unlocked && t.st.id !== cur.id) el.addEventListener("click", () => this.travelTo(t.st.id));
      bar.appendChild(el);
    }
  },
});
