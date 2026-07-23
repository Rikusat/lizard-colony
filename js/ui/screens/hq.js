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
    else if (key === "shelf") this.openLabShelf();
  },
  _labRefresh(key) { this.closeModal(); this.openLabPanel(key); if (this.renderHqLab) this.renderHqLab(); },
  // コスト表示: アイコン+個数のみ。不足=赤字(.cost-ng)
  _costHtml(pairs) { // pairs=[{icon,n,have}]
    return pairs.map((p) => `<span class="lab-cost${p.have >= p.n ? "" : " cost-ng"}">${Icon.svg(p.icon)}${p.n}</span>`).join("");
  },

  // ---------------- デスク群 ----------------
  openLabDesks() {
    this.openModal(`${Icon.svg("hq")} 研究デスク`, (body) => {
      const s = Game.state;
      const inv = Game.labInvestLv("desks"), cost = Game.labInvestCost("desks");
      const invPairs = cost ? Object.keys(cost).map((o) => ({ icon: (ORES.find((x) => x.id === o) || { icon: o }).icon, n: cost[o], have: Game.ore(o) })) : [];
      const canInvest = cost && invPairs.every((p) => p.have >= p.n);
      const ero = Math.round(s.erosion || 0);
      body.innerHTML = `
        <div class="list-row" id="lab-invest">
          <span class="fic">${Icon.svg("build")}</span>
          <div class="grow"><b>設備投資 T${Math.min(4, 1 + inv)}/4</b></div>
          ${cost ? `<span>${this._costHtml(invPairs)}</span><button id="lab-invest-btn" ${canInvest ? "" : "disabled"}>${Icon.svg("build")} 投じる</button>` : `<span class="lv">最大</span>`}
        </div>
        <div class="list-row">
          <span class="fic">${Icon.svg("coin")}</span><div class="grow"><b>変換</b></div>
          <button id="cv-food">${Icon.svg("coin")}${fmt(CFG.goldToFoodRate * CFG.convertBatch)}→${Icon.svg("food")}${CFG.convertBatch}</button>
          <button id="cv-energy">${Icon.svg("coin")}${fmt(CFG.goldToEnergyRate * CFG.convertBatch)}→${Icon.svg("energy")}${CFG.convertBatch}</button>
          <button id="cv-science">${Icon.svg("bio")}${fmt(CFG.bioToScienceRate * CFG.convertBatch)}→${Icon.svg("science")}${CFG.convertBatch}</button>
        </div>
        <div class="list-row">
          <span class="fic">${Icon.svg("build")}</span><div class="grow"><b>惑星開発 Lv${s.devLv || 0}/${CFG.devMaxLv}</b></div>
          <button id="hq-dev" ${(s.devLv || 0) >= CFG.devMaxLv ? "disabled" : ""}>${Icon.svg("coin")}${fmt(Game.devCost())}</button>
        </div>
        <div class="list-row" id="hq-invasion">
          <span class="fic">${Icon.svg("erosion")}</span>
          <div class="bar" style="flex:1"><div style="width:${ero}%;background:linear-gradient(90deg,#8a3a2a,#e05b41)"></div></div>
          <b>${ero}%</b>
        </div>
        <div class="rowline" style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub)">
          ${Icon.svg("bio")}${fmt(Game.res("bio"))} ${Icon.svg("food")}${fmt(Game.res("food"))} ${Icon.svg("energy")}${fmt(Game.res("energy"))} ${Icon.svg("science")}${fmt(Game.res("science"))} ${Icon.svg("coin")}${fmt(s.coins)}</div>
        <div id="research-list"></div>`;
      const invBtn = body.querySelector("#lab-invest-btn");
      if (invBtn) invBtn.addEventListener("click", () => { if (Game.labInvestPay("desks")) this._labRefresh("desks"); });
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this._labRefresh("desks"); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this._labRefresh("desks"); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this._labRefresh("desks"); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this._labRefresh("desks"); });
      // 研究(11): [名称][コストアイコン列]のみ(説明文なし)
      const list = body.querySelector("#research-list");
      for (const r of RESEARCH) {
        const done = Game.state.research[r.id];
        const locked = r.req && !Game.state.research[r.req];
        const pairs = [];
        if (r.cost.science) pairs.push({ icon: "science", n: r.cost.science, have: Game.res("science") });
        if (r.cost.coins) pairs.push({ icon: "coin", n: r.cost.coins, have: Game.state.coins });
        if (r.cost.orichalcum) pairs.push({ icon: "orichalcum", n: r.cost.orichalcum, have: Game.ore("orichalcum") });
        if (r.cost.stones) pairs.push({ icon: "stone", n: r.cost.stones, have: Game.stones() });
        const row = document.createElement("div");
        row.className = "list-row" + (done ? " done" : "");
        row.innerHTML = `
          <span class="fic">${Icon.svg(done ? "check" : locked ? "lock" : "science")}</span>
          <div class="grow"><b>${r.name}</b></div>
          ${done ? `<span class="lv">済</span>` : locked ? `<span style="color:var(--sub)">${Icon.svg("lock")}</span>`
            : `<span>${this._costHtml(pairs)}</span><button>${Icon.svg("science")}</button>`}`;
        if (!done && !locked) row.querySelector("button").addEventListener("click", () => {
          Game.buyResearch(r.id);
          this._labRefresh("desks");
        });
        list.appendChild(row);
      }
    });
  },

  // ---------------- 実験用水槽(合成・遺伝子ラボ・鍛造) ----------------
  openLabTank() {
    this.openModal(`${Icon.svg("bio")} 実験用水槽`, (body) => {
      body.innerHTML = `<div id="synth-list"></div><div id="gene-list"></div><div class="breed-filters" style="flex-wrap:wrap" id="hq-forge"></div>`;
      // 合成(§8): [素材ロゴ2]→[結果ロゴ]+[石n]。未解読=[?]+シルエット
      const list = body.querySelector("#synth-list");
      for (const r of RECIPES.slice().sort((a, b) => a.order - b.order)) {
        const decoded = Game.recipeDecoded(r);
        const A = TRAITS[r.a], B = TRAITS[r.b], C = TRAITS[r.result];
        const cost = Game.stoneSynthCost(r);
        const cands = Game.state.lizards.filter((lz) => Game.synthesizableRecipes(lz).some((x) => x.result === r.result));
        const row = document.createElement("div");
        row.className = "list-row" + (decoded ? "" : " done");
        if (decoded) {
          row.innerHTML =
            `<span class="fic" style="color:${A.rim}">${Icon.svg(A.icon)}</span><span class="fic" style="color:${B.rim}">${Icon.svg(B.icon)}</span>` +
            `<span style="color:var(--sub)">→</span><span class="fic" style="color:${C.rim}">${Icon.svg(C.icon)}</span>` +
            `<div class="grow"><b>${C.name}</b></div>` +
            `<span>${this._costHtml([{ icon: "stone", n: cost, have: Game.stones() }])}</span><span id="synth-slot-${r.order}"></span>`;
          const slot = row.querySelector(`#synth-slot-${r.order}`);
          for (const lz of cands.slice(0, 3)) {
            const b = document.createElement("button");
            b.innerHTML = `${Game.lizardName(lz)}`;
            b.disabled = Game.stones() < cost;
            b.addEventListener("click", () => {
              if (Game.synthesize(lz, r.result)) { UI.toast(`${C.name} が生まれた`); this._labRefresh("tank"); }
            });
            slot.appendChild(b);
          }
          if (!cands.length) row.innerHTML += `<span style="color:var(--sub)">${Icon.svg("lock")}</span>`;
        } else {
          row.innerHTML =
            `<span class="fic" style="opacity:.35">${Icon.svg(A.icon)}${Icon.svg(B.icon)}</span>` +
            `<div class="grow"><b>? ? ?</b></div><span style="color:var(--sub)">${Icon.svg("science")} 解読 ${["I", "II", "III", "IV", "V", "VI"][r.order - 1]}</span>`;
        }
        list.appendChild(row);
      }
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
