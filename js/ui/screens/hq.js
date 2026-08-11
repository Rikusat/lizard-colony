// =============================================================
// screens/hq — 本部=研究施設の機能パネル(hq_lab v2.0 §5: 文字ベースからの脱却)
// アイコン+個数のみ(説明文で埋めない)。不足=赤字/充足=タップ可能。12機能撤廃0:
//  デスク群= 鉱石投資(labInvest・§5.3案B)/資源変換(3)/資源表示(4)/惑星開発(5)/侵食(6=帯のみ)/研究(11)
//  実験用水槽= 合成(§8)/遺伝子ラボ(8)/チタン鍛造(10)
//  ロケット= 宇宙港・建造投入(7)  標本棚= Lore(2)/鉱石在庫(9)
//  HQ Lv(1)=ページヘッダ+デスク群の姿そのもの。新着ドット(12)=開いた時に消す(hqlab.js)。
// =============================================================

Object.assign(UI, {
  openHQ() { this.openHqLab(); }, // 旧導線の互換

  openLabPanel(key) {
    if (key === "desks") this.openLabDesks();
    else if (key === "tank") this.openLabTank();
    else if (key === "rocket") this.openLabRocket();
    else if (key === "roster") this.openLabRoster();
    else if (key === "shelf") this.openLabShelf();
  },
  _labRefresh(key) { this.closeModal(); this.openLabPanel(key); if (this.renderHqLab) this.renderHqLab(); },

  // ================= P3-1裁定①(2026-08-11): 個体分析 =================
  // 本部パネル(本番)と devビューア(?tune=1#roster)が**同じ収集/整列/表生成**を使う=単一の真実・二重実装なし。
  // 読み取り専用: この関数群に Game.state への書き込みは1行も無い(grepで証明・恒久保証は装置QA)。
  rosterCollect() {
    const curId = Game.currentStage().id;
    const rows = [];
    for (const lz of Game.state.lizards) rows.push({ lz, planet: curId });
    for (const st of ((Game.world && Game.world.stages) || [])) {
      if (st.stageId === curId) continue;
      for (const lz of (st.lizards || [])) rows.push({ lz, planet: st.stageId });
    }
    return rows;
  },
  buildRosterTable(host, state) {
    const rebuild = () => this.buildRosterTable(host, state);
    const rows = this.rosterCollect();
    const sorted = rows.slice().sort((a, b) => {
      const key = state.sort;
      const v = (r) => key === "lv" ? (r.lz.level || 1) : key === "name" ? Game.lizardName(r.lz) : key === "sp" ? r.lz.speciesId : key === "mo" ? r.lz.morphId : key === "cd" ? (r.lz.breedCd || 0) : key === "pl" ? r.planet : 0;
      const va = v(a), vb = v(b);
      if (key !== "default" && va !== vb) return (va < vb ? -1 : 1) * state.dir;
      return (a.planet - b.planet) || (a.lz.speciesId < b.lz.speciesId ? -1 : a.lz.speciesId > b.lz.speciesId ? 1 : 0) || ((b.lz.level || 1) - (a.lz.level || 1));
    }).filter((r) =>
      (!state.fSp || r.lz.speciesId === state.fSp) &&
      (!state.fPl || String(r.planet) === state.fPl) &&
      (!state.fMo || r.lz.morphId === state.fMo) &&
      (state.fTr === "" || (state.fTr === "y") === ((r.lz.traits || []).length > 0)));
    const spOpts = [...new Set(rows.map((r) => r.lz.speciesId))].map((id2) => `<option value="${id2}" ${state.fSp === id2 ? "selected" : ""}>${(speciesById(id2) || {}).name || id2}</option>`).join("");
    const plOpts = [...new Set(rows.map((r) => r.planet))].sort((a, b) => a - b).map((p) => `<option value="${p}" ${state.fPl === String(p) ? "selected" : ""}>${(stageById(p) || {}).name || p}</option>`).join("");
    const moOpts = MORPHS.map((m) => `<option value="${m.id}" ${state.fMo === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    const th = (key, label, cls) => `<th data-sort="${key}" class="${cls || ""}">${label}${state.sort === key ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    let html = `<div class="rst-ctl">
      <label>惑星 <select data-f="fPl"><option value="">すべて</option>${plOpts}</select></label>
      <label>種 <select data-f="fSp"><option value="">すべて</option>${spOpts}</select></label>
      <label>モーフ <select data-f="fMo"><option value="">すべて</option>${moOpts}</select></label>
      <label>特性 <select data-f="fTr"><option value="">すべて</option><option value="y" ${state.fTr === "y" ? "selected" : ""}>あり</option><option value="n" ${state.fTr === "n" ? "selected" : ""}>なし</option></select></label>
      <button class="rst-refresh">更新</button><span class="rst-count">表示 ${sorted.length} / ${rows.length}</span></div>
      <div class="rst-scroll"><table class="rst-table"><thead><tr>
      <th>#</th>${th("name", "名前")}${th("sp", "種")}${th("mo", "モーフ", "rc-mo")}${th("lv", "Lv")}<th>特性</th>${th("cd", "CD残", "rc-cd")}<th class="rc-st">状態</th>${th("pl", "惑星")}</tr></thead><tbody>`;
    sorted.forEach((r, i) => {
      const lz = r.lz, mo = morphById(lz.morphId) || { name: lz.morphId };
      const leg = lz.morphId === "legendary";
      const status = lz.injuredT > 0 ? `負傷 ${Math.ceil(lz.injuredT)}s` : lz.tailRegrowT > 0 ? "尾再生中" : lz.poisonT > 0 ? "毒" : "—";
      html += `<tr><td class="rc-i">${i + 1}</td>
        <td><b class="${leg ? "leg-name" : ""}">${Game.lizardName(lz)}</b></td>
        <td>${(speciesById(lz.speciesId) || {}).name || lz.speciesId}</td>
        <td class="rc-mo">${mo.name}</td>
        <td class="rc-num">${lz.stage === "baby" ? "ベビー" : "Lv" + (lz.level || 1)}</td>
        <td>${UI.breedTraitChips ? UI.breedTraitChips(lz) : ""}</td>
        <td class="rc-cd rc-num">${lz.breedCd > 0 ? Math.ceil(lz.breedCd) + "s" : "—"}</td>
        <td class="rc-st">${status}</td>
        <td>${(stageById(r.planet) || {}).name || r.planet}</td></tr>`;
    });
    html += "</tbody></table></div>";
    host.innerHTML = html;
    host.querySelector(".rst-refresh").addEventListener("click", rebuild);
    for (const sel of host.querySelectorAll("[data-f]")) sel.addEventListener("change", (e) => { state[e.target.dataset.f] = e.target.value; rebuild(); });
    for (const el of host.querySelectorAll("[data-sort]")) el.addEventListener("click", () => {
      const k = el.dataset.sort;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      rebuild();
    });
  },
  openLabRoster() {
    this.openModal(`${Icon.svg("lizard")} 個体分析 <small class="rst-en">SPECIMEN ANALYSIS</small>`, (body) => {
      const rows = this.rosterCollect();
      const planets = new Set(rows.map((r) => r.planet));
      const adults = rows.filter((r) => r.lz.stage !== "baby").length;
      const nTr = rows.filter((r) => (r.lz.traits || []).length > 0).length;
      body.innerHTML = `<div class="rst-sum">
        <span>${Icon.svg("lizard")}総個体 <b>${rows.length}</b></span>
        <span>${Icon.svg("planet")}惑星 <b>${planets.size}</b></span>
        <span>アダルト率 <b>${rows.length ? Math.round(adults / rows.length * 100) : 0}%</b></span>
        <span>${Icon.svg("spark")}特性保持 <b>${nTr}</b></span></div>
        <div class="rst-host"></div>`;
      this.buildRosterTable(body.querySelector(".rst-host"), this._rstState || (this._rstState = { sort: "default", dir: 1, fSp: "", fMo: "", fTr: "", fPl: "" }));
      // 本番の更新=サマリ行も含めて全再構築(共通関数の更新は表のみのため上書きで格上げ)
      body.querySelector(".rst-refresh").addEventListener("click", () => this._labRefresh("roster"));
    });
  },
  // コスト表示: アイコン+個数のみ。不足=赤字(.cost-ng)
  _costHtml(pairs) { // pairs=[{icon,n,have}]
    return pairs.map((p) => `<span class="lab-cost${p.have >= p.n ? "" : " cost-ng"}">${Icon.svg(p.icon)}${p.n}</span>`).join("");
  },

  // ---------------- デスク群=研究デスク(R4-1: ロケット要素撤去・UISkills §13 R4改訂) ----------------
  // 維持するUX改善(ロケットと独立): 素材の統一書式「[アイコン] 素材名 保有X / 必要Y」(充足=琥珀/不足=沈み+あと◯深紅)・
  // 変換ボタンの保有内蔵・研究ロック行のホバー開放条件・手持ち資源の降格表示。機能ID/ロジックは完全不変。
  _planMat(icon, name, have, need) {
    const ok = have >= need;
    return `<span class="mat ${ok ? "ok" : "ng"}">${Icon.svg(icon)}<span class="mname">${name}</span>
      <span class="mhave">保有${fmt(have)}</span><span>/</span><span>必要${fmt(need)}</span>
      ${ok ? "" : `<span class="lack">${CFG.planLackWord || "あと"}${fmt(need - have)}</span>`}</span>`;
  },
  openLabDesks() {
    this.openModal(`${Icon.svg("hq")} 研究デスク`, (body) => {
      const s = Game.state;
      const inv = Game.labInvestLv("desks"), cost = Game.labInvestCost("desks");
      const oreOf = (id) => ORES.find((x) => x.id === id) || { icon: id, name: id };
      const ero = Math.round(s.erosion || 0);
      // 設備投資(統一書式の素材列+不足で沈む投じる)
      const mats = cost ? Object.keys(cost).map((o) => this._planMat(oreOf(o).icon, oreOf(o).name, Game.ore(o), cost[o])).join("") : "";
      const canInvest = cost && Object.keys(cost).every((o) => Game.ore(o) >= cost[o]);
      const invest = `
        <div class="list-row" id="lab-invest">
          <span class="fic">${Icon.svg("build")}</span>
          <div class="grow"><b>設備投資 T${Math.min(4, 1 + inv)}/4</b></div>
          ${cost ? `<span style="display:flex;gap:4px;flex-wrap:wrap">${mats}</span><button id="lab-invest-btn" ${canInvest ? "" : "disabled"}>${Icon.svg("build")} 投じる</button>` : `<span class="lv">最大</span>`}
        </div>`;
      // 変換(保有内蔵・不足=沈み+あと◯)
      const cvBtn = (id, fromIcon, fromName, fromCost, fromHave, toIcon) => {
        const ok = fromHave >= fromCost;
        return `<button id="${id}" class="cv-btn ${ok ? "" : "ng"}">
          <span class="cv-main"><span class="cv-from">${Icon.svg(fromIcon)}${fmt(fromCost)}</span><span class="cv-arr">▶</span><span class="cv-to">${Icon.svg(toIcon)}+${CFG.convertBatch}</span></span>
          <span class="cv-have">${fromName} 保有<b>${fmt(fromHave)}</b>${ok ? "" : ` <b>${CFG.planLackWord || "あと"}${fmt(fromCost - fromHave)}</b>`}</span></button>`;
      };
      const cv = `<div class="plan-cv">
        ${cvBtn("cv-food", "coin", "ゴールド", CFG.goldToFoodRate * CFG.convertBatch, s.coins, "food")}
        ${cvBtn("cv-energy", "coin", "ゴールド", CFG.goldToEnergyRate * CFG.convertBatch, s.coins, "energy")}
        ${cvBtn("cv-science", "bio", "生態データ", CFG.bioToScienceRate * CFG.convertBatch, Game.res("bio"), "science")}
      </div>`;
      const devEro = `
        <div class="list-row">
          <span class="fic">${Icon.svg("build")}</span><div class="grow"><b>惑星開発 Lv${s.devLv || 0}/${CFG.devMaxLv}</b></div>
          <button id="hq-dev" ${(s.devLv || 0) >= CFG.devMaxLv ? "disabled" : ""}>${Icon.svg("coin")}${fmt(Game.devCost())}</button>
        </div>
        <div class="list-row" id="hq-invasion">
          <span class="fic">${Icon.svg("erosion")}</span>
          <div class="bar" style="flex:1"><div style="width:${ero}%;background:linear-gradient(90deg,#8a3a2a,#e05b41)"></div></div>
          <b>${ero}%</b>
        </div>`;
      const pocket = `<div class="plan-pocket">手持ち資源 —
        ${Icon.svg("bio")}${fmt(Game.res("bio"))} ${Icon.svg("food")}${fmt(Game.res("food"))} ${Icon.svg("energy")}${fmt(Game.res("energy"))}
        ${Icon.svg("science")}${fmt(Game.res("science"))} ${Icon.svg("coin")}${fmt(s.coins)}
        ${ORES.map((o) => `${Icon.svg(o.icon)}${fmt(Game.ore(o.id))}`).join(" ")}</div>`;
      body.innerHTML = `<div class="plan-root" style="--plan-cur:${CFG.planCurColor || "#ecc35a"};--plan-lack:${CFG.planLackColor || "#d8404e"};--plan-dim:${CFG.planDimOpacity != null ? CFG.planDimOpacity : 0.62}">
        ${invest}${cv}${devEro}<div id="research-list" class="plan-research"></div>${pocket}</div>`;
      const invBtn = body.querySelector("#lab-invest-btn");
      if (invBtn) invBtn.addEventListener("click", () => { if (Game.labInvestPay("desks")) this._labRefresh("desks"); });
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this._labRefresh("desks"); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this._labRefresh("desks"); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this._labRefresh("desks"); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this._labRefresh("desks"); });
      // 研究(現行項目・順序維持+統一書式。ロック=錠前+ホバーで開放条件)
      const list = body.querySelector("#research-list");
      const resName = { science: "研究力", coins: "ゴールド", orichalcum: "オリハルコン", stones: "賢者の石" };
      for (const r of RESEARCH) {
        const done = Game.state.research[r.id];
        const locked = r.req && !Game.state.research[r.req];
        const pairs = [];
        if (r.cost.science) pairs.push(["science", resName.science, Game.res("science"), r.cost.science]);
        if (r.cost.coins) pairs.push(["coin", resName.coins, s.coins, r.cost.coins]);
        if (r.cost.orichalcum) pairs.push(["orichalcum", resName.orichalcum, Game.ore("orichalcum"), r.cost.orichalcum]);
        if (r.cost.stones) pairs.push(["stone", resName.stones, Game.stones(), r.cost.stones]);
        const row = document.createElement("div");
        row.className = "list-row" + (done ? " done" : "") + (locked ? " locked" : "");
        if (locked) row.title = `開放条件: ${(RESEARCH.find((x) => x.id === r.req) || {}).name || r.req} の完了`;
        row.innerHTML = `
          <span class="fic">${Icon.svg(done ? "check" : locked ? "lock" : "science")}</span>
          <div class="grow"><b>${r.name}</b></div>
          ${done ? `<span class="lv">済</span>` : locked ? `<span style="color:var(--sub)">${Icon.svg("lock")}</span>`
            : `<span style="display:flex;gap:4px;flex-wrap:wrap">${pairs.map((p) => this._planMat(p[0], p[1], p[2], p[3])).join("")}</span><button>${Icon.svg("science")}</button>`}`;
        if (!done && !locked) row.querySelector("button").addEventListener("click", () => {
          Game.buyResearch(r.id);
          this._labRefresh("desks");
        });
        list.appendChild(row);
      }
    });
  },

  // ---------------- 実験用水槽(遺伝子ラボ・鍛造) ---------------- ※合成はV6-P1-2で撤廃
  openLabTank() {
    this.openModal(`${Icon.svg("bio")} 実験用水槽`, (body) => {
      body.innerHTML = `<div id="gene-list"></div><div class="breed-filters" style="flex-wrap:wrap" id="hq-forge"></div>`;
      // 遺伝子ラボ(8): [鉱石n]→[結果アイコン] の3行
      const gl = body.querySelector("#gene-list");
      const geneRow = (id, icon, n, have, resIcon, name, fn) => {
        const row = document.createElement("div");
        row.className = "list-row";
        row.innerHTML = `<span class="fic">${Icon.svg(icon)}</span><div class="grow"><b>${name}</b></div>
          <span>${this._costHtml([{ icon, n, have }])}</span><span style="color:var(--sub)">→${Icon.svg(resIcon)}</span><button id="${id}" ${have >= n ? "" : "disabled"}>${Icon.svg(resIcon)}</button>`;
        gl.appendChild(row);
        row.querySelector("button").addEventListener("click", () => { fn(); this._labRefresh("tank"); });
      };
      geneRow("hq-gene", "amber", CFG.geneAmberCost, Game.ore("amber"), "bio", "遺伝子解析", () => Game.geneAnalyze());
      geneRow("hq-meteor", "meteorite", 1, Game.ore("meteorite"), "egg", "隕石を割る", () => Game.crackMeteorite());
      geneRow("hq-amethyst", "amethyst", CFG.amethystLegendCost, Game.ore("amethyst"), "egg", "始祖の卵", () => Game.amethystEgg());
      // 鍛造(10): [設備アイコン]+[チタンn]
      const forge = body.querySelector("#hq-forge");
      for (const f of FACILITIES) {
        const b = document.createElement("button");
        const have = Game.ore("titaniumOre");
        b.innerHTML = `${Icon.svg(f.icon)}${Game.facMax(f)} ${this._costHtml([{ icon: "titanium", n: CFG.forgeTitaniumCost, have }])}`;
        b.disabled = have < CFG.forgeTitaniumCost;
        b.addEventListener("click", () => { Game.forgeFacility(f.id); this._labRefresh("tank"); });
        forge.appendChild(b);
      }
    });
  },

  // ---------------- ロケット(宇宙港) ----------------
  openLabRocket() {
    this.openModal(`${Icon.svg("rocket")} 宇宙港`, (body) => {
      const rocket = Game.ensureRocket();
      body.innerHTML = `
        <div class="list-row">
          <span class="fic">${Icon.svg(rocket.done ? "planet" : "rocket")}</span>
          <div class="grow"><b>${rocket.done ? "完成" : `第${rocket.stage + 1}/${CFG.rocketStages.length}段階`}</b>
            ${rocket.done ? "" : `<div class="bar"><div style="width:${(rocket.invested / Math.max(1, Game.rocketStageNeed()) * 100).toFixed(0)}%"></div></div>`}</div>
          ${rocket.done ? "" : `<span>${this._costHtml([{ icon: "iridium", n: 10, have: Game.ore("iridium") }])}</span><button id="hq-rocket" ${Game.ore("iridium") < 1 ? "disabled" : ""}>${Icon.svg("rocket")} 投じる</button>`}</div>`;
      const rk = body.querySelector("#hq-rocket");
      if (rk) rk.addEventListener("click", () => { Game.investRocket(10); this._labRefresh("rocket"); });
    });
  },

  // ---------------- 標本棚(Lore・鉱石在庫) ----------------
  openLabShelf() {
    this.openModal(`${Icon.svg("scroll")} 標本棚・記録の間`, (body) => {
      body.innerHTML = `
        <div class="list-row">
          <span class="fic">${Icon.svg("scroll")}</span><div class="grow"><b>Lore</b></div>
          <button id="hq-lore">${Icon.svg("scroll")} 読む</button></div>
        <div class="rowline" style="font-size:calc(13px * var(--fs-scale, 1));color:var(--sub)">
          ${ORES.map((o) => `${Icon.svg(o.icon)}${fmt(Game.ore(o.id))}`).join("  ")}</div>`;
      body.querySelector("#hq-lore").addEventListener("click", () => { this.dexTab = "lore"; this.openDex(); });
    });
  },
});
