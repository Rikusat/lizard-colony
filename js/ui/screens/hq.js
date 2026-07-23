// =============================================================
// screens/hq — 本部=研究施設の機能パネル(hq_lab.md §6 棚卸し12機能の移設先)
// 旧・単一HQモーダルを廃し、本部ページ(hqlab.js)の設備クリックで各パネルを開く。機能撤廃0:
//  デスク群= HQ Lv表示(1)/資源変換(3)/資源表示(4)/惑星開発(5)/侵食モニタ(6)/研究(11)
//  実験用水槽= 遺伝子ラボ(8)/チタン鍛造(10=作業台)/合成(§8・トランスミュート)
//  ロケット= 宇宙港・建造投入(7)
//  標本棚= Lore(2)/鉱石在庫(9)
//  新着ドット(12)=ページを開いた時に消す(hqlab.js)。既存の数値・挙動は同じ意味で機能する。
// =============================================================

Object.assign(UI, {
  openHQ() { this.openHqLab(); }, // 旧導線の互換(モーダル廃止→ページへ)

  openLabPanel(key) {
    if (key === "desks") this.openLabDesks();
    else if (key === "tank") this.openLabTank();
    else if (key === "rocket") this.openLabRocket();
    else if (key === "shelf") this.openLabShelf();
  },
  _labRefresh(key) { this.closeModal(); this.openLabPanel(key); if (this.renderHqLab) this.renderHqLab(); },

  // ---------------- デスク群: 研究・変換・管制・侵食モニタ ----------------
  openLabDesks() {
    this.openModal(`${Icon.svg("hq")} 研究デスク — 解析と管制`, (body) => {
      const s = Game.state;
      const lvl = Game.hqLevel();
      const cur = Game.currentStage();
      const frontier = stageById(Game.frontierId());
      const ero = Math.round(s.erosion || 0);
      const eroStage = Game.erosionStage();
      body.innerHTML = `
        <div class="prestige-box">
          <div class="p-class">HQ Lv${lvl}</div>
          <div class="p-score">全惑星恒久バフ: 生産+${(lvl * 0.2).toFixed(1)}% / 開拓支給の増額 / フロンティア: ${Icon.svg(frontier.icon)}${frontier.pname}</div>
          <div class="p-rank">HQは全惑星の成果で成長し、決してリセットされない</div>
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

        <h4 class="hq-h">${Icon.svg("erosion")} 壁面モニタ — バガー侵食(全惑星共通・1日1回のログインが特効薬)</h4>
        <div id="hq-invasion">
          <div class="inv-row"><span>${Icon.svg("erosion")} バガー侵食率</span>
            <div class="bar" style="flex:1"><div style="width:${ero}%;background:linear-gradient(90deg,#8a3a2a,#e05b41)"></div></div>
            <b>${ero}%</b></div>
          <div style="font-size:calc(12px * var(--fs-scale, 1));color:${eroStage ? "var(--red)" : "var(--sub)"}">
            ${eroStage === 0 ? "無害な水準。毎日ログインすれば低く保てる" :
              eroStage === 1 ? "影響発生中: 生産-5%・繁殖CD+15%・ボス強化。ログインやバガー撃破で下がる" :
              "侵食が濃い: 生産-10%・繁殖CD+30%。だが可逆——今日から取り戻せる"}</div></div>

        <h4 class="hq-h">${Icon.svg("science")} 研究(恒久・全惑星適用) — ${Icon.svg("science")}${fmt(Game.res("science"))} / 所持${fmt(s.coins)}G</h4>
        <div id="research-list"></div>`;
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this._labRefresh("desks"); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this._labRefresh("desks"); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this._labRefresh("desks"); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this._labRefresh("desks"); });
      const list = body.querySelector("#research-list");
      for (const r of RESEARCH) {
        const done = Game.state.research[r.id];
        const locked = r.req && !Game.state.research[r.req];
        const row = document.createElement("div");
        row.className = "list-row" + (done ? " done" : "");
        row.innerHTML = `
          <span class="fic">${Icon.svg(done ? "check" : locked ? "lock" : "science")}</span>
          <div class="grow"><b>${r.name}</b><div class="desc">${r.desc}</div></div>
          ${done ? `<span class="lv">済</span>` : locked ? `<span style="color:var(--sub)">要:${researchById(r.req).name}</span>`
            : `<button>${r.cost.orichalcum ? `${Icon.svg("orichalcum")}${r.cost.orichalcum}` : `${Icon.svg("science")}${r.cost.science || 0}+${fmt(r.cost.coins || 0)}G${r.cost.stones ? `+${Icon.svg("stone")}${r.cost.stones}` : ""}`}</button>`}`;
        if (!done && !locked) row.querySelector("button").addEventListener("click", () => {
          Game.buyResearch(r.id);
          this._labRefresh("desks");
        });
        list.appendChild(row);
      }
    });
  },

  // ---------------- 実験用水槽: 遺伝子ラボ・鍛造・合成 ----------------
  openLabTank() {
    this.openModal(`${Icon.svg("bio")} 実験用水槽 — 錬成と解析`, (body) => {
      const s = Game.state;
      body.innerHTML = `
        <h4 class="hq-h">${Icon.svg("stone")} 錬成 — 特性の合成(2つの個性がひとつへ昇華する)</h4>
        <div id="synth-list"></div>
        <h4 class="hq-h">${Icon.svg("bio")} 遺伝子ラボ(希少鉱石の出口)</h4>
        <div class="breed-filters" style="flex-wrap:wrap">
          <button id="hq-gene" ${Game.ore("amber") < CFG.geneAmberCost ? "disabled" : ""}>${Icon.svg("amber")}琥珀${CFG.geneAmberCost}: 未発見遺伝子を解析</button>
          <button id="hq-meteor" ${Game.ore("meteorite") < 1 ? "disabled" : ""}>${Icon.svg("meteorite")}隕石を割る(希少個体)</button>
          <button id="hq-amethyst" ${Game.ore("amethyst") < CFG.amethystLegendCost ? "disabled" : ""}>${Icon.svg("amethyst")}${CFG.amethystLegendCost}: 始祖の卵</button>
        </div>
        <h4 class="hq-h">${Icon.svg("titanium")} 作業台 — チタン鍛造(設備Lv上限+1 / チタン鉱${CFG.forgeTitaniumCost})</h4>
        <div class="breed-filters" style="flex-wrap:wrap" id="hq-forge"></div>`;
      // --- 合成(§8): 解読済み=実名+実行 / 未解読=「?」+素材ロゴのシルエット(気配のみ) ---
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
            `<span class="fic" style="color:${C.rim}">${Icon.svg(C.icon)}</span>` +
            `<div class="grow"><b>${A.name} + ${B.name} → ${C.name}</b><div class="desc">${C.desc}</div>` +
            (cands.length ? "" : `<div class="desc" style="opacity:.7">素材(2特性を併せ持つ個体・固定印なし)がいない</div>`) + `</div>` +
            `<span id="synth-slot-${r.order}"></span>`;
          const slot = row.querySelector(`#synth-slot-${r.order}`);
          for (const lz of cands.slice(0, 3)) { // 個体ごとの実行ボタン(多すぎる場合は先頭3体)
            const b = document.createElement("button");
            b.innerHTML = `${Game.lizardName(lz)} ${Icon.svg("stone")}${cost}`;
            b.disabled = Game.stones() < cost;
            b.addEventListener("click", () => {
              if (Game.synthesize(lz, r.result)) { UI.toast(`${C.name} が生まれた — ふたつの個性が昇華した`); this._labRefresh("tank"); }
            });
            slot.appendChild(b);
          }
        } else {
          // 「?」カード: 素材2特性のロゴをシルエット表示(気配のみ・説明しない)
          row.innerHTML =
            `<span class="fic" style="opacity:.35">${Icon.svg(A.icon)}${Icon.svg(B.icon)}</span>` +
            `<div class="grow"><b>? ? ?</b><div class="desc">未解読の錬成式(研究デスク「レシピ解読 ${["I", "II", "III", "IV", "V", "VI"][r.order - 1]}」で解読)</div></div>`;
        }
        list.appendChild(row);
      }
      const ge = body.querySelector("#hq-gene");
      if (ge) ge.addEventListener("click", () => { Game.geneAnalyze(); this._labRefresh("tank"); });
      const mt = body.querySelector("#hq-meteor");
      if (mt) mt.addEventListener("click", () => { Game.crackMeteorite(); this._labRefresh("tank"); });
      const am = body.querySelector("#hq-amethyst");
      if (am) am.addEventListener("click", () => { Game.amethystEgg(); this._labRefresh("tank"); });
      const forge = body.querySelector("#hq-forge");
      if (forge) {
        for (const f of FACILITIES) {
          const b = document.createElement("button");
          b.innerHTML = `${Icon.svg(f.icon)}${f.name}(上限${Game.facMax(f)})`;
          b.disabled = Game.ore("titaniumOre") < CFG.forgeTitaniumCost;
          b.addEventListener("click", () => { Game.forgeFacility(f.id); this._labRefresh("tank"); });
          forge.appendChild(b);
        }
      }
    });
  },

  // ---------------- ロケット: 宇宙港 ----------------
  openLabRocket() {
    this.openModal(`${Icon.svg("rocket")} 宇宙港 — ロケット建造(長期目標)`, (body) => {
      const rocket = Game.ensureRocket();
      body.innerHTML = `
        <div class="list-row">
          <span class="fic">${Icon.svg(rocket.done ? "planet" : "rocket")}</span>
          <div class="grow"><b>${rocket.done ? "ロケット完成 — 星の海へ(全惑星の生産+10%)" : `建造 第${rocket.stage + 1}/${CFG.rocketStages.length}段階`}</b>
            <div class="desc">${rocket.done ? "トカゲ文明の新たな章がLoreに刻まれた" : `イリジウム ${rocket.invested}/${Game.rocketStageNeed()}(所持${Icon.svg("iridium")}${fmt(Game.ore("iridium"))})`}</div>
            ${rocket.done ? "" : `<div class="bar"><div style="width:${(rocket.invested / Math.max(1, Game.rocketStageNeed()) * 100).toFixed(0)}%"></div></div>`}</div>
          ${rocket.done ? "" : `<button id="hq-rocket" ${Game.ore("iridium") < 1 ? "disabled" : ""}>${Icon.svg("iridium")}×10投入</button>`}</div>`;
      const rk = body.querySelector("#hq-rocket");
      if (rk) rk.addEventListener("click", () => { Game.investRocket(10); this._labRefresh("rocket"); });
    });
  },

  // ---------------- 標本棚: Lore・鉱石在庫 ----------------
  openLabShelf() {
    this.openModal(`${Icon.svg("scroll")} 標本棚・記録の間`, (body) => {
      body.innerHTML = `
        <div class="list-row">
          <span class="fic">${Icon.svg("scroll")}</span>
          <div class="grow"><b>惑星レプタイル物語(Lore)</b><div class="desc">この星々で起きたことの記録</div></div>
          <button id="hq-lore">読む</button></div>
        <h4 class="hq-h">${Icon.svg("amethyst")} 鉱石標本(巣ネットワークが自動で運んでくる)</h4>
        <div class="rowline" style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub)">
          ${ORES.map((o) => `${Icon.svg(o.icon)}${o.name.slice(0, 4)} ${fmt(Game.ore(o.id))}`).join(" / ")}</div>`;
      body.querySelector("#hq-lore").addEventListener("click", () => { this.dexTab = "lore"; this.openDex(); });
    });
  },
});
