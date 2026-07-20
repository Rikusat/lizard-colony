// =============================================================
// screens/equipment — 設備画面(通常/防衛の2タブ+すみかLv)
// UISkills.md §8: ui/screens/equipment相当。
// =============================================================

Object.assign(UI, {
  // ---------------- 設備 (V4 §3.1: 通常/防衛の2タブ・統廃合済み10種) ----------------
  openFacilities() {
    if (!this.facTab) this.facTab = "norm";
    this.openModal(`${Icon.svg("build")} 設備`, (body) => this.buildFacilities(body));
  },

  // ②: フィールドの設備タップ判定/個別強化メニューは撤廃。設備強化は左メニューの「設備」ボタン(openFacilities)が唯一の導線。

  buildFacilities(body) {
    body.innerHTML = `
      <div class="nest-tabs">
        <button data-ftab="norm" class="${this.facTab === "norm" ? "primary" : ""}">${Icon.svg("shelter")} 通常設備(育成・QoL)</button>
        <button data-ftab="def" class="${this.facTab === "def" ? "primary" : ""}">${Icon.svg("shield")} 防衛設備(ボス対策)</button>
      </div>
      <div id="fac-list"></div>`;
    for (const btn of body.querySelectorAll("[data-ftab]")) {
      btn.addEventListener("click", () => { this.facTab = btn.dataset.ftab; this.buildFacilities(body); });
    }
    const list = body.querySelector("#fac-list");
    const rank = Game.state.rank;
    const stId = Game.currentStage().id;
    // V4.1: すみか(住居)のLvアップは設備タブへ(巣画面は閲覧専用のため)
    if (this.facTab === "norm") {
      const nl = Game.state.nest.lv;
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <span class="fic">${Icon.svg("burrow")}</span>
        <div class="grow"><b>すみか(巣穴)</b> <span class="lv">Lv${nl}/${CFG.nestLvMax}</span>
          <div class="desc">外出枠+1/Lv・卵スロット(Lv2/6で+1)・孵化-3%/Lv・カラス猶予+1秒/Lv</div></div>
        <button ${nl >= CFG.nestLvMax ? "disabled" : ""}>${nl >= CFG.nestLvMax ? "MAX" : "強化 " + fmt(Game.nestLvUpCost()) + "G"}</button>`;
      if (nl < CFG.nestLvMax) row.querySelector("button").addEventListener("click", () => {
        Game.nestLvUp();
        this.buildFacilities(body);
      });
      list.appendChild(row);
    }
    const sorted = FACILITIES
      .filter((f) => (f.tab || "norm") === this.facTab)
      .filter((f) => !(f.hideOn && f.hideOn.includes(stId)))
      .sort((a, b) => ((rank < a.unlock) - (rank < b.unlock)) || (a.unlock - b.unlock));
    for (const f of sorted) {
      const locked = rank < f.unlock;
      const lv = Game.facLv(f.id);
      const fmax = Game.facMax(f);
      const maxed = lv >= fmax;
      const cost = Game.facilityCost(f.id);
      const row = document.createElement("div");
      row.className = "list-row" + (locked ? " done" : "");
      if (locked) {
        row.innerHTML = `
          <span class="fic">${Icon.svg("lock")}</span>
          <div class="grow"><b>${f.name}</b>
            <div class="desc">${f.desc}</div></div>
          <span class="lv">HQ Lv${f.unlock}で解放</span>`;
      } else {
        row.innerHTML = `
          <span class="fic">${Icon.svg(f.icon)}</span>
          <div class="grow"><b>${f.name}</b> <span class="lv">Lv${lv}/${fmax}${Game.state.forged && Game.state.forged[f.id] ? Icon.svg("titanium") : ""}</span>
            <div class="desc">${f.desc}</div></div>
          <button ${maxed ? "disabled" : ""}>${maxed ? "MAX" : "強化 " + fmt(cost) + "G"}</button>`;
        if (!maxed) row.querySelector("button").addEventListener("click", () => {
          Game.buyFacility(f.id);
          this.buildFacilities(body); // 再描画
        });
      }
      list.appendChild(row);
    }
    // シナジー示唆 (効果は自然に重なるだけ・専用ルールなし)
    const syn = document.createElement("div");
    let synHtml = `<h4 style="color:var(--gold);font-size:calc(13px * var(--fs-scale, 1));margin:14px 0 8px">シナジーのヒント</h4>`;
    for (const sy of FACILITY_SYNERGIES) {
      const have = sy.ids.filter((id) => Game.facLv(id) > 0).length;
      const names = sy.ids.map((id) => facilityById(id).name).join("+");
      synHtml += `<div class="list-row" style="padding:7px 10px">
        <span class="fic" style="font-size:calc(14px * var(--fs-scale, 1))">${have === sy.ids.length ? Icon.svg("check") : have + "/" + sy.ids.length}</span>
        <div class="grow"><b>${sy.name}</b><div class="desc">${names} — ${sy.desc}</div></div></div>`;
    }
    syn.innerHTML = synHtml;
    list.appendChild(syn);
  },
});
