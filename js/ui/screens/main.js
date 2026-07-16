// =============================================================
// screens/main — メイン画面の常設ウィジェット(卵スロット/個体詳細パネル)
// UISkills.md §8: ui/screens/main相当。
// =============================================================

Object.assign(UI, {
  // ---------------- ボスHPバー(Brushup V2 §3.3: 映画的HUD・戦闘中のみ) ----------------
  initBossHud() {
    const center = document.getElementById("center");
    if (!center || document.getElementById("boss-hud")) return;
    const el = document.createElement("div");
    el.id = "boss-hud";
    el.className = "hidden";
    el.innerHTML = `
      <span class="bh-portrait" id="bh-portrait"></span>
      <div class="bh-mid">
        <div class="bh-name"><b id="bh-name"></b><span class="bh-tier hidden" id="bh-tier"></span><span class="bh-elite hidden" id="bh-elite">ELITE</span></div>
        <div class="bh-bar"><div class="bh-fill" id="bh-fill"></div></div>
        <div class="bh-nums"><span id="bh-hp"></span><span id="bh-time"></span></div>
      </div>`;
    center.appendChild(el);
  },

  updateBossHud() {
    const el = document.getElementById("boss-hud");
    if (!el) return;
    const r = Game.raid;
    if (!r) { el.classList.add("hidden"); this._hudTypeId = null; return; }
    el.classList.remove("hidden");
    el.classList.toggle("enraged", !!r.enraged);
    if (this._hudTypeId !== r.typeId) { // 襲撃ごとに1回だけ組み立て
      this._hudTypeId = r.typeId;
      document.getElementById("bh-portrait").innerHTML = Icon.svg(r.type.icon);
      document.getElementById("bh-name").textContent =
        r.typeId === "snake" ? r.snakeTier.name : r.type.name;
      const tier = document.getElementById("bh-tier");
      tier.classList.toggle("hidden", !r.tier);
      tier.textContent = r.tier ? "T" + r.tier : "";
      document.getElementById("bh-elite").classList.toggle("hidden", !r.elite);
    }
    const e = r.snake;
    document.getElementById("bh-fill").style.width = Math.max(0, e.hp / e.maxHp * 100) + "%";
    document.getElementById("bh-hp").textContent = `${fmt(Math.ceil(Math.max(0, e.hp)))} / ${fmt(e.maxHp)}`;
    document.getElementById("bh-time").textContent = e.arrived
      ? (r.stunT > 0 ? `足止め ${r.stunT.toFixed(1)}s` : `去るまで ${Math.ceil(Math.max(0, r.timeLeft))}s`)
      : "接近中…";
  },

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
      ${lz.breedCd > 0 ? `<div style="color:var(--sub)">${Icon.svg("breed")} 繁殖まで ${Math.ceil(lz.breedCd)}秒</div>` : ""}
      ${lz.founder ? `<div style="color:var(--gold)">${Icon.svg("crown")} 創始者 — 旧コロニーの血統</div>` : ""}
            <div class="btns">
        <button data-act="feed">${Icon.svg("cricket")} 餌やり</button>
        ${lz.injuredT > 0 ? `<button data-act="heal">${Icon.svg("gem")}1 回復</button>` : ""}
        <button data-act="pin">${Icon.svg("pin")}${(Game.state.nest.pins || []).includes(lz.id) ? "解除" : "ピン"}</button>
        ${Game.stageSpecificSpecies().length && Game.res("bio") >= CFG.mutateBioCost && speciesById(lz.speciesId).stage !== Game.currentStage().id
          ? `<button data-act="mutate">${Icon.svg("bio")} 変異(${CFG.mutateBioCost})</button>` : ""}
        <button data-act="sell">${Icon.svg("coin")} 売却 ${fmt(Game.lizardSellPrice(lz))}</button>
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
