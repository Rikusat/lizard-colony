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

  // ---------------- デスク群=建造計画(UISkills §13「作業リストから、発射までの計画書へ」) ----------------
  // 表示のみの再設計: 投資/変換/研究のロジック・コスト・機能ID(#lab-invest等=QA契約)は完全不変。
  // 素材表示の統一書式=「[アイコン] 素材名 保有X / 必要Y」(充足=琥珀点灯/不足=沈み+「あと◯」深紅=明度と文言の二重化)。
  _planStageNames: ["基礎骨組み", "下部船体", "エンジン組付", "上部船体+配管", "外装+塗装", "発射準備"],
  _planMat(icon, name, have, need) {
    const ok = have >= need;
    return `<span class="mat ${ok ? "ok" : "ng"}">${Icon.svg(icon)}<span class="mname">${name}</span>
      <span class="mhave">保有${fmt(have)}</span><span>/</span><span>必要${fmt(need)}</span>
      ${ok ? "" : `<span class="lack">${CFG.planLackWord || "あと"}${fmt(need - have)}</span>`}</span>`;
  },
  // 節点ミニ絵(ドック6段と同じ言語)。st=1..6、7=発射(終点)
  _planGlyph(cv, st) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    const cx = W / 2, bw = W * 0.52, base = H - 6;
    const frame = "#5a6f84", hull = "#8fa2b5", amber = CFG.planCurColor || "#ecc35a";
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#232c36"; c.fillRect(cx - bw * 0.8, base, bw * 1.6, 2.5);
    const secH = (H - 14) / 4;
    const y = (i) => base - secH * i;
    const skel = (yTop, hh) => { c.strokeStyle = frame; c.lineWidth = 1; c.strokeRect(cx - bw / 2, yTop, bw, hh); c.beginPath(); c.moveTo(cx - bw / 2, yTop); c.lineTo(cx + bw / 2, yTop + hh); c.moveTo(cx + bw / 2, yTop); c.lineTo(cx - bw / 2, yTop + hh); c.stroke(); };
    const solid = (yTop, hh) => { c.fillStyle = hull; c.fillRect(cx - bw / 2, yTop, bw, hh); };
    if (st === 7) {
      solid(y(3), secH * 3);
      c.fillStyle = hull; c.beginPath(); c.moveTo(cx - bw / 2, y(3)); c.quadraticCurveTo(cx, y(3) - secH, cx + bw / 2, y(3)); c.closePath(); c.fill();
      c.fillStyle = amber; c.beginPath(); c.moveTo(cx - bw * 0.35, base); c.lineTo(cx, base + 5); c.lineTo(cx + bw * 0.35, base); c.closePath(); c.fill();
      return;
    }
    if (st >= 2) solid(y(1), secH); else skel(y(1), secH);
    if (st >= 4) { solid(y(2), secH); solid(y(3), secH); } else { skel(y(2), secH); skel(y(3), secH); }
    if (st >= 3) { c.fillStyle = "#3a4450"; for (const ex of [-bw * 0.28, bw * 0.28]) { c.beginPath(); c.moveTo(cx + ex - 3, base); c.lineTo(cx + ex, base - 4); c.lineTo(cx + ex + 3, base); c.closePath(); c.fill(); } }
    if (st >= 5) { c.fillStyle = hull; c.beginPath(); c.moveTo(cx - bw / 2, y(3)); c.quadraticCurveTo(cx, y(3) - secH, cx + bw / 2, y(3)); c.closePath(); c.fill(); c.fillStyle = "#a11c2c"; c.fillRect(cx - bw / 2, y(2) - 2, bw, 2.5); }
    if (st >= 6) { c.fillStyle = amber; c.fillRect(cx - bw / 2 - 2, y(2), 2, 2); c.fillRect(cx + bw / 2, y(2), 2, 2); c.fillRect(cx - 1, y(3) - secH * 0.6, 2, 3); }
  },
  openLabDesks() {
    this.openModal(`${Icon.svg("build")} 建造計画`, (body) => {
      const s = Game.state;
      const cur = this.dockRocketStage ? this.dockRocketStage() : 1;
      const inv = Game.labInvestLv("desks"), cost = Game.labInvestCost("desks");
      const gw = CFG.planGlyphW || 30, gh = CFG.planGlyphH || 44;
      const oreOf = (id) => ORES.find((x) => x.id === id) || { icon: id, name: id };
      const ero = Math.round(s.erosion || 0);
      // ①発射へのみちのりトラッカー(S2/S4未到達節点も表示=全体像を隠さない)
      let tr = `<div class="plan-tracker">`;
      for (let st = 1; st <= 6; st++) {
        const cls = st < cur ? "done" : st === cur ? "cur" : "";
        tr += `<div class="pt-node ${cls}"><canvas class="pt-glyph" data-st="${st}" width="${gw}" height="${gh}"></canvas><span class="pt-label">S${st}</span></div>`;
        tr += `<div class="pt-link ${st < cur ? "" : "dash"}"></div>`;
      }
      tr += `<div class="pt-node goal"><canvas class="pt-glyph" data-st="7" width="${gw}" height="${gh}"></canvas><span class="pt-label">発射</span></div></div>`;
      // ②建造投資ブロック(格上げ・青写真の気配)。次の工程=現在地の次に建つ部位
      const nextStage = Math.min(6, cur + 1);
      const mats = cost ? Object.keys(cost).map((o) => this._planMat(oreOf(o).icon, oreOf(o).name, Game.ore(o), cost[o])).join("") : "";
      const canInvest = cost && Object.keys(cost).every((o) => Game.ore(o) >= cost[o]);
      const bd = `
        <div class="plan-build" id="lab-invest">
          <h3>${Icon.svg("build")} 建造投資 — ${cost ? `次の工程: <span class="next">S${nextStage} ${this._planStageNames[nextStage - 1]}</span>
            <canvas class="pt-glyph" data-st="${nextStage}" width="${Math.round(gw * 0.87)}" height="${Math.round(gh * 0.87)}" style="opacity:.9"></canvas>` : `<span class="next">全工程完了 — 発射準備よし</span>`}</h3>
          ${cost ? `<div class="pb-body">
            <div class="pb-mats">${mats}</div>
            <div class="pb-btn"><button id="lab-invest-btn" ${canInvest ? "" : "disabled"}>${Icon.svg("build")} 投じる</button></div>
          </div>` : ""}
        </div>`;
      // ③変換(保有内蔵・不足=沈み+あと◯)
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
      // 惑星開発+侵食(機能維持・従来行)
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
      // ⑤手持ち資源(俯瞰・一段沈める)
      const pocket = `<div class="plan-pocket">手持ち資源 —
        ${Icon.svg("bio")}${fmt(Game.res("bio"))} ${Icon.svg("food")}${fmt(Game.res("food"))} ${Icon.svg("energy")}${fmt(Game.res("energy"))}
        ${Icon.svg("science")}${fmt(Game.res("science"))} ${Icon.svg("coin")}${fmt(s.coins)}
        ${ORES.map((o) => `${Icon.svg(o.icon)}${fmt(Game.ore(o.id))}`).join(" ")}</div>`;
      body.innerHTML = `<div class="plan-root" style="--plan-cur:${CFG.planCurColor || "#ecc35a"};--plan-glow:${CFG.planCurGlow || "rgba(236,195,90,.55)"};--plan-lack:${CFG.planLackColor || "#d8404e"};--plan-dim:${CFG.planDimOpacity != null ? CFG.planDimOpacity : 0.62}">
        ${tr}${bd}${cv}${devEro}<div id="research-list" class="plan-research"></div>${pocket}</div>`;
      for (const g of body.querySelectorAll(".pt-glyph")) this._planGlyph(g, parseInt(g.dataset.st, 10));
      const invBtn = body.querySelector("#lab-invest-btn");
      if (invBtn) invBtn.addEventListener("click", () => { if (Game.labInvestPay("desks")) this._labRefresh("desks"); });
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this._labRefresh("desks"); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this._labRefresh("desks"); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this._labRefresh("desks"); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this._labRefresh("desks"); });
      // ④研究(現行項目・順序維持+統一書式。ロック=錠前+ホバーで開放条件)
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
