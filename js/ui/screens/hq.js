// =============================================================
// screens/hq — HQ(本部)画面(資源変換/惑星開発/侵食/宇宙港/遺伝子ラボ/鍛造/研究)
// UISkills.md §8: ui/screens/hq相当。
// =============================================================

Object.assign(UI, {
  // ---------------- V4 §3.4: HQ(本部) — 全惑星共通の中枢 ----------------
  openHQ() {
    Game._badgeHq = false; // §9-C4 開いたら新着ドットを消す
    this.openModal(`${Icon.svg("hq")} HQ(本部) — 惑星ネットワークの中枢`, (body) => {
      const s = Game.state;
      const lvl = Game.hqLevel();
      const cur = Game.currentStage();
      const frontier = stageById(Game.frontierId());
      // V4.1: 侵食率(全惑星共通)・宇宙港・遺伝子解析
      const ero = Math.round(s.erosion || 0);
      const eroStage = Game.erosionStage();
      const rocket = Game.ensureRocket();
      const invHtml = `
        <div class="inv-row"><span>${Icon.svg("erosion")} バガー侵食率</span>
          <div class="bar" style="flex:1"><div style="width:${ero}%;background:linear-gradient(90deg,#8a3a2a,#e05b41)"></div></div>
          <b>${ero}%</b></div>
        <div style="font-size:calc(12px * var(--fs-scale, 1));color:${eroStage ? "var(--red)" : "var(--sub)"}">
          ${eroStage === 0 ? "無害な水準。毎日ログインすれば低く保てる" :
            eroStage === 1 ? "影響発生中: 生産-5%・繁殖CD+15%・ボス強化。ログインやバガー撃破で下がる" :
            "侵食が濃い: 生産-10%・繁殖CD+30%。だが可逆——今日から取り戻せる"}</div>`;
      body.innerHTML = `
        <div class="prestige-box">
          <div class="p-class">HQ Lv${lvl}</div>
          <div class="p-score">全惑星恒久バフ: 生産+${(lvl * 0.2).toFixed(1)}% / 開拓支給の増額 / フロンティア: ${Icon.svg(frontier.icon)}${frontier.pname}</div>
          <div class="p-rank">HQは全惑星の成果で成長し、決してリセットされない</div>
          <button id="hq-lore" style="margin-top:8px">${Icon.svg("scroll")} 惑星レプタイル物語(Lore)を読む</button>
        </div>

        <h4 class="hq-h">${Icon.svg("coin")} 資源管理 — Gold→資源変換(所持 ${fmt(s.coins)}G)</h4>
        <div class="breed-filters" style="flex-wrap:wrap">
          <button id="cv-food">${Icon.svg("food")} 食料+${CFG.convertBatch} (${fmt(CFG.goldToFoodRate * CFG.convertBatch)}G)</button>
          <button id="cv-energy">${Icon.svg("energy")} エネルギー+${CFG.convertBatch} (${fmt(CFG.goldToEnergyRate * CFG.convertBatch)}G)</button>
          <button id="cv-science">${Icon.svg("science")} 研究力+${CFG.convertBatch} (${Icon.svg("bio")}${fmt(CFG.bioToScienceRate * CFG.convertBatch)})</button>
        </div>
        <div class="rowline" style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub)">
          所持: ${Icon.svg("bio")}${fmt(Game.res("bio"))} / ${Icon.svg("food")}${fmt(Game.res("food"))} / ${Icon.svg("energy")}${fmt(Game.res("energy"))} / ${Icon.svg("science")}${fmt(Game.res("science"))}</div>

        <h4 class="hq-h">${Icon.svg("build")} 惑星開発 — ${Icon.svg(cur.icon)}${cur.pname}(Lv${s.devLv || 0}/${CFG.devMaxLv})</h4>
        <div class="list-row">
          <div class="grow"><b>開発度を上げる</b>
            <div class="desc">この惑星の生産+2%/Lv・エネルギー産出+。Goldの大きな使い道</div></div>
          <button id="hq-dev" ${(s.devLv || 0) >= CFG.devMaxLv ? "disabled" : ""}>${fmt(Game.devCost())}G</button>
        </div>

        <h4 class="hq-h">${Icon.svg("erosion")} バガー侵食(全惑星共通・1日1回のログインが特効薬)</h4>
        <div id="hq-invasion">${invHtml}</div>

        <h4 class="hq-h">${Icon.svg("rocket")} 宇宙港 — ロケット建造(長期目標)</h4>
        <div class="list-row">
          <span class="fic">${Icon.svg(rocket.done ? "planet" : "rocket")}</span>
          <div class="grow"><b>${rocket.done ? "ロケット完成 — 星の海へ(全惑星の生産+10%)" : `建造 第${rocket.stage + 1}/${CFG.rocketStages.length}段階`}</b>
            <div class="desc">${rocket.done ? "トカゲ文明の新たな章がLoreに刻まれた" : `イリジウム ${rocket.invested}/${Game.rocketStageNeed()}(所持${Icon.svg("iridium")}${fmt(Game.ore("iridium"))})`}</div>
            ${rocket.done ? "" : `<div class="bar"><div style="width:${(rocket.invested / Math.max(1, Game.rocketStageNeed()) * 100).toFixed(0)}%"></div></div>`}</div>
          ${rocket.done ? "" : `<button id="hq-rocket" ${Game.ore("iridium") < 1 ? "disabled" : ""}>${Icon.svg("iridium")}×10投入</button>`}</div>

        <h4 class="hq-h">${Icon.svg("bio")} 遺伝子ラボ(希少鉱石の出口)</h4>
        <div class="breed-filters" style="flex-wrap:wrap">
          <button id="hq-gene" ${Game.ore("amber") < CFG.geneAmberCost ? "disabled" : ""}>${Icon.svg("amber")}琥珀${CFG.geneAmberCost}: 未発見遺伝子を解析</button>
          <button id="hq-meteor" ${Game.ore("meteorite") < 1 ? "disabled" : ""}>${Icon.svg("meteorite")}隕石を割る(希少個体)</button>
          <button id="hq-amethyst" ${Game.ore("amethyst") < CFG.amethystLegendCost ? "disabled" : ""}>${Icon.svg("amethyst")}${CFG.amethystLegendCost}: 始祖の卵</button>
        </div>
        <div class="rowline" style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub)">
          鉱石: ${ORES.map((o) => `${Icon.svg(o.icon)}${o.name.slice(0, 4)}${fmt(Game.ore(o.id))}`).join(" / ")} — 巣ネットワークが自動で運んでくる</div>

        <h4 class="hq-h">${Icon.svg("titanium")} チタン鍛造 — 設備を化けさせる(Lv上限+1 / チタン鉱${CFG.forgeTitaniumCost})</h4>
        <div class="breed-filters" style="flex-wrap:wrap" id="hq-forge"></div>

        <h4 class="hq-h">${Icon.svg("science")} 研究(恒久・全惑星適用) — ${Icon.svg("science")}${fmt(Game.res("science"))} / 所持${fmt(s.coins)}G</h4>
        <div id="research-list"></div>`;
      body.querySelector("#hq-lore").addEventListener("click", () => { this.dexTab = "lore"; this.openDex(); });
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this.openHQ(); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this.openHQ(); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this.openHQ(); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this.openHQ(); });
      const rk = body.querySelector("#hq-rocket");
      if (rk) rk.addEventListener("click", () => { Game.investRocket(10); this.openHQ(); });
      const ge = body.querySelector("#hq-gene");
      if (ge) ge.addEventListener("click", () => { Game.geneAnalyze(); this.openHQ(); });
      const mt = body.querySelector("#hq-meteor");
      if (mt) mt.addEventListener("click", () => { Game.crackMeteorite(); this.openHQ(); });
      const am = body.querySelector("#hq-amethyst");
      if (am) am.addEventListener("click", () => { Game.amethystEgg(); this.openHQ(); });
      const forge = body.querySelector("#hq-forge");
      if (forge) {
        for (const f of FACILITIES) {
          const b = document.createElement("button");
          b.innerHTML = `${Icon.svg(f.icon)}${f.name}(上限${Game.facMax(f)})`;
          b.disabled = Game.ore("titaniumOre") < CFG.forgeTitaniumCost;
          b.addEventListener("click", () => { Game.forgeFacility(f.id); this.openHQ(); });
          forge.appendChild(b);
        }
      }
      const list = body.querySelector("#research-list");
      for (const r of RESEARCH) {
        const done = s.research[r.id];
        const locked = r.req && !s.research[r.req];
        const row = document.createElement("div");
        row.className = "list-row" + (done ? " done" : "");
        row.innerHTML = `
          <span class="fic">${Icon.svg(done ? "check" : locked ? "lock" : "science")}</span>
          <div class="grow"><b>${r.name}</b><div class="desc">${r.desc}</div></div>
          ${done ? `<span class="lv">済</span>` : locked ? `<span style="color:var(--sub)">要:${researchById(r.req).name}</span>`
            : `<button>${r.cost.orichalcum ? `${Icon.svg("orichalcum")}${r.cost.orichalcum}` : `${Icon.svg("science")}${r.cost.science || 0}+${fmt(r.cost.coins || 0)}G`}</button>`}`;
        if (!done && !locked) row.querySelector("button").addEventListener("click", () => {
          Game.buyResearch(r.id);
          this.openHQ();
        });
        list.appendChild(row);
      }
    });
  },
});
