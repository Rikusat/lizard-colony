// =============================================================
// screens/main — メイン画面の常設ウィジェット(卵スロット/個体詳細パネル)
// UISkills.md §8: ui/screens/main相当。
// =============================================================

Object.assign(UI, {
  // ---------------- 卵スロット ----------------
  buildEggSlots() {
    const box = this.els["egg-slots"];
    box.innerHTML = "";
    for (let i = 0; i < Game.eggSlotCap(); i++) {
      const div = document.createElement("div");
      div.className = "egg-slot";
      div.innerHTML = `<span class="ico"></span><span class="info"></span><span class="t"></span><button data-egg="${i}" class="hidden"><svg class="icon"><use href="#i-gem"/></svg>1</button>`;
      box.appendChild(div);
    }
  },

  updateEggSlots() {
    // 孵化室でスロット数が変わったら作り直す
    if (this.els["egg-slots"].children.length !== Game.eggSlotCap()) this.buildEggSlots();
    const slots = this.els["egg-slots"].children;
    const genelab = Game.facLv("breedfac") >= 3; // 繁殖施設Lv3: レア予兆
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i], egg = Game.state.eggs[i];
      const btn = el.querySelector("button");
      if (egg) {
        el.classList.add("filled");
        el.querySelector(".ico").innerHTML = Icon.svg("egg", egg.lucky ? "ic-lucky" : "");
        const sp = speciesById(egg.speciesId);
        // 遺伝解析室: レア予兆の表示(演出のみ)
        const omen = genelab && (egg.morphId !== "normal" || sp.stars >= 4) ? " " + Icon.svg("spark") : "";
        el.querySelector(".info").textContent = sp.name + "系" + omen;
        el.querySelector(".t").textContent =
          egg.t <= 0 ? "スペース待ち" : fmtTime(egg.t);
        btn.classList.toggle("hidden", egg.t <= 0);
      } else {
        el.classList.remove("filled");
        el.querySelector(".ico").textContent = "";
        el.querySelector(".info").textContent = "(空きスロット)";
        el.querySelector(".t").textContent = "";
        btn.classList.add("hidden");
      }
    }
  },

  // ---------------- トカゲ詳細 ----------------
  renderDetail(force) {
    const el = this.els["detail"];
    const lz = Game.state.lizards.find((x) => x.id === Game.selectedId);
    if (!lz) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    const col = Render.lizardColor(lz);
    const xpMax = lz.stage === "baby" ? CFG.babyXpToAdult : CFG.adultXpPerLevel;
    el.innerHTML = `
      <h4><span class="sw" style="display:inline-block;width:20px;height:12px;border-radius:6px;background:${col.css};border:1px solid #0006"></span>
        ${Game.lizardName(lz)}</h4>
      <div class="stars">${"★".repeat(sp.stars)}${"☆".repeat(5 - sp.stars)} <span style="color:var(--sub)">${mo.name}</span></div>
      <div class="stat"><span>${lz.stage === "baby" ? "ベビー" : "アダルト Lv" + lz.level}</span>
        <span>XP ${Math.floor(lz.xp)}/${xpMax}</span></div>
      <div class="bar"><div style="width:${clamp(lz.xp / xpMax * 100, 0, 100)}%"></div></div>
      <div class="stat"><span>攻撃力</span><b>${Game.lizardAtk(lz).toFixed(1)}</b></div>
      <div class="stat"><span>生産/秒</span><b>${Game.lizardIncome(lz).toFixed(2)}G</b></div>
      ${lz.injuredT > 0 ? `<div class="injured">負傷中 (あと${Math.ceil(lz.injuredT)}秒)</div>` : ""}
      ${lz.breedCd > 0 ? `<div style="color:var(--sub)">💕 繁殖まで ${Math.ceil(lz.breedCd)}秒</div>` : ""}
      ${lz.founder ? `<div style="color:var(--gold)">👑 創始者 — 旧コロニーの血統</div>` : ""}
      ${lz.exploring ? `<div style="color:#8fd0ff">🔦 探索派遣中</div>` : ""}
      <div class="btns">
        <button data-act="feed">🦗 餌やり</button>
        ${lz.injuredT > 0 ? `<button data-act="heal">💎1 回復</button>` : ""}
        <button data-act="pin">${(Game.state.nest.pins || []).includes(lz.id) ? "📌解除" : "📌ピン"}</button>
        ${Game.stageSpecificSpecies().length && Game.res("bio") >= CFG.mutateBioCost && speciesById(lz.speciesId).stage !== Game.currentStage().id
          ? `<button data-act="mutate">🧬 変異(🧬${CFG.mutateBioCost})</button>` : ""}
        <button data-act="sell">💰 売却 ${fmt(Game.lizardSellPrice(lz))}</button>
        <button data-act="close">閉じる</button>
      </div>`;
  },

  onDetailAction(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const lz = Game.state.lizards.find((x) => x.id === Game.selectedId);
    if (!lz) return;
    switch (btn.dataset.act) {
      case "feed": Game.feed(lz); break;
      case "heal": Game.healWithGem(lz); break;
      case "mutate": Game.mutateLizard(lz); break;
      case "pin": {
        const pins = Game.state.nest.pins || (Game.state.nest.pins = []);
        if (pins.includes(lz.id)) Game.state.nest.pins = pins.filter((id) => id !== lz.id);
        else if (pins.length < 5) pins.push(lz.id);
        else this.toast("ピン留めは5匹まで", true);
        break;
      }
      case "sell":
        if (confirm(`${Game.lizardName(lz)} を ${fmt(Game.lizardSellPrice(lz))}G で売却しますか?`)) Game.sell(lz);
        break;
      case "close": Game.selectedId = null; break;
    }
    this.renderDetail(true);
  },
});
