// A stable set of focusable cards lets the player inspect a moving animal without chasing it.
Object.assign(UI, {
  updateResidents() {
    if (!this._residents) {
      const list = document.getElementById("resident-list");
      if (!list) return;
      const toggle = document.getElementById("residents-toggle");
      const small = matchMedia("(orientation: portrait), (max-height: 520px)");
      const setOpen = (open) => {
        toggle.setAttribute("aria-expanded", String(open));
        list.hidden = !open;
      };
      setOpen(!small.matches);
      small.addEventListener("change", () => setOpen(!small.matches));
      toggle.addEventListener("click", () => {
        setOpen(list.hidden);
        this.updateResidents();
      });
      list.addEventListener("click", event => {
        const button = event.target.closest("button[data-resident]");
        if (!button) return;
        const lizard = Game.state.lizards.find(lz => String(lz.id) === button.dataset.resident);
        if (!lizard) return;
        Game.selectedId = lizard.id;
        if (small.matches) setOpen(false);
        this.renderDetail(true);
        this.updateResidents();
      });
      this._residents = { list, cards: new Map() };
    }
    const { list, cards } = this._residents;
    if (list.hidden) return;
    const residentIds = new Set(Game.state.lizards.map(lz => lz.id));
    for (const [id, card] of cards) {
      if (!residentIds.has(id)) {
        card.el.remove();
        cards.delete(id);
      }
    }
    const localSpecies = Game.endemicSpecies(Game.currentStage().id);
    for (const lz of Game.state.lizards) {
      let card = cards.get(lz.id);
      if (!card) {
        const el = document.createElement("button");
        el.className = "resident-card";
        el.type = "button";
        el.dataset.resident = lz.id;
        el.innerHTML = '<span class="resident-art"></span><span class="resident-caption"><b></b><small></small><progress class="resident-growth" aria-label="成長経験値"></progress></span>';
        card = { el, art: el.firstElementChild, name: el.querySelector("b"), level: el.querySelector("small"), growth: el.querySelector("progress") };
        cards.set(lz.id, card);
        list.appendChild(el);
      }
      const kind = lz.speciesId + "/" + lz.morphId;
      if (card.kind !== kind) {
        card.art.innerHTML = this.specimenPortrait(lz.speciesId, lz.morphId);
        card.name.textContent = Game.lizardName(lz);
        card.kind = kind;
      }
      const status = Game.isAway(lz) ? "遠征中" : lz.injuredT > 0 ? "療養中" : lz.stage === "baby" ? "ベビー" : "Lv." + lz.level;
      if (card.level.textContent !== status) card.level.textContent = status;
      const targetXp = lz.stage === "baby" ? CFG.babyXpToAdult : CFG.adultXpPerLevel;
      const xp = Math.floor(lz.xp);
      if (card.growth.max !== targetXp) card.growth.max = targetXp;
      if (card.growth.value !== xp) card.growth.value = xp;
      const eligible = lz.stage === "adult" && !Game.isAway(lz) && lz.injuredT <= 0 && localSpecies.includes(lz.speciesId);
      const title = card.name.textContent + " · " + status + (eligible ? " ／ 観察して発射球に遺伝子を乗せる" : " ／ 観察する");
      if (card.el.title !== title) card.el.title = title;
      const selected = String(lz.id === Game.selectedId);
      if (card.el.getAttribute("aria-pressed") !== selected) card.el.setAttribute("aria-pressed", selected);
    }
  },
});
