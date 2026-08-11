// =============================================================
// screens/dex — 図鑑画面(種族×モーフ+Loreタブ)
// UISkills.md §8: ui/screens/dex相当。
// =============================================================

Object.assign(UI, {
  // ---------------- 図鑑 ----------------
  openDex() {
    Game._badgeDex = false; // §9-C4 開いたら新着ドットを消す
    if (!this.dexTab) this.dexTab = "dex";
    this.openModal(`${Icon.svg("dex")} トカゲ図鑑`, (body) => this.buildDex(body));
  },

  buildDex(body) {
    body.innerHTML = `
      <div class="nest-tabs">
        <button data-dtab="dex" class="${this.dexTab === "dex" ? "primary" : ""}">${Icon.svg("lizard")} 図鑑</button>
        <button data-dtab="lore" class="${this.dexTab === "lore" ? "primary" : ""}">${Icon.svg("scroll")} Lore(世界観)</button>
      </div>
      <div id="dex-body"></div>`;
    for (const btn of body.querySelectorAll("[data-dtab]")) {
      btn.addEventListener("click", () => { this.dexTab = btn.dataset.dtab; this.buildDex(body); });
    }
    const box = body.querySelector("#dex-body");
    if (this.dexTab === "lore") {
      // V4 §3.5: Loreタブ(遊ぶうちに解放されるコレクション)
      const lore = Game.state.lore || {};
      const gotN = LORE.filter((L) => lore[L.id]).length;
      // P4-2: ホロ再生(Lore ARCHIVEムービー)。CFG.holoLoreOn=falseなら導線ごと出さない(可逆)
      box.innerHTML = `<div class="dex-summary" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span>解読済み: <b style="color:var(--gold)">${gotN}/${LORE.length}</b>
        — 惑星レプタイルの記録。遊ぶほどに世界が見えてくる</span>
        ${this.loreMovieOn && this.loreMovieOn() ? `<button id="lore-play" title="世界の記録をホログラムで再生(約${Holo.loreDur().toFixed(0)}秒・クリックでスキップ)">${Icon.svg("hq")} ホロ再生</button>` : ""}</div>`;
      const lp = box.querySelector("#lore-play");
      if (lp) lp.addEventListener("click", () => this.playLore());
      for (const L of LORE) {
        const got = lore[L.id];
        const row = document.createElement("div");
        row.className = "list-row" + (got ? "" : " done");
        row.innerHTML = got
          ? `<span class="fic">${Icon.svg("scroll")}</span><div class="grow"><b>${L.name}</b><div class="desc">${L.text}</div></div>`
          : `<span class="fic">${Icon.svg("lock")}</span><div class="grow"><b>???</b><div class="desc">冒険を進めると解読される…</div></div>`;
        box.appendChild(row);
      }
      return;
    }
    const total = SPECIES.length * MORPHS.length;
    const got = Object.keys(Game.state.dex).length;
    const bonus = Game.dexCompBonus();
    box.innerHTML = `<div class="dex-summary">コンプ率: <b style="color:var(--gold)">${(got / total * 100).toFixed(1)}%</b> (${got}/${total})
      <div class="bar"><div style="width:${got / total * 100}%"></div></div>
      <div style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub);margin-top:5px">
        ${Icon.svg("crown")} コンプ報酬(恒久): 現在 生産+${Math.round(bonus * 100)}% — 25%/50%/75%/100%で +2/4/6/10%</div></div>`;
    const stageId = Game.currentStage().id;
    // V4: 惑星別に区切って表示
    for (const st of STAGES) {
      const list = SPECIES.filter((sp) => sp.stage === st.id);
      if (!list.length) continue;
      const head = document.createElement("h4");
      head.className = "hq-h";
      head.innerHTML = `${Icon.svg(st.icon)} ${st.pname}(${st.name})`;
      box.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "dex-grid";
      for (const sp of list) {
        for (const mo of MORPHS) {
          const found = Game.state.dex[sp.id + ":" + mo.id];
          const cell = document.createElement("div");
          cell.className = "dex-cell" + (found ? "" : " locked");
          if (found) {
            const [h, s, l] = mo.recolor(sp.hue, sp.sat, sp.light);
            cell.innerHTML = `<div class="sw" style="background:hsl(${h},${s}%,${l}%)"></div>
              <div class="nm">${sp.name}</div><div class="mo">${mo.name} ${"★".repeat(sp.stars)}</div>`;
          } else {
            const known = sp.stage <= stageId || sp.stage <= 5;
            cell.innerHTML = `<div class="sw" style="background:#222"></div>
              <div class="nm">???</div><div class="mo">${known ? mo.name : st.pname + "で発見"}</div>`;
          }
          grid.appendChild(cell);
        }
      }
      box.appendChild(grid);
    }
  },
});
