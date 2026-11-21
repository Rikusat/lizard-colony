// One card per owned species and morph. Individual animals stay selectable in the tank and detail panel.
Object.assign(UI, {
  updateResidents() {
    if (!this._residents) {
      const list = document.getElementById("resident-list");
      if (!list) return;
      const toggle = document.getElementById("residents-toggle");
      const setOpen = (open) => {
        toggle.setAttribute("aria-expanded", String(open));
        list.hidden = !open;
      };
      toggle.addEventListener("click", () => {
        setOpen(list.hidden);
        this.updateResidents();
      });
      list.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          setOpen(false);
          toggle.focus({ preventScroll: true });
        }
      });
      list.addEventListener("click", event => {
        const button = event.target.closest("button[data-resident]");
        if (!button) return;
        const members = this.residentMembers(button.dataset.resident);
        const lizard = members.find(lz => lz.id === Game.selectedId)
          || members.find(lz => lz.stage === "adult" && !Game.isAway(lz) && lz.injuredT <= 0)
          || members[0];
        if (!lizard) return;
        Game.selectedId = lizard.id;
        setOpen(false);
        this.renderDetail(true);
        const detail = this.els.detail;
        const control = detail.querySelector("[data-act=next]") || detail.querySelector("[data-act]");
        control?.focus({ preventScroll: true });
      });
      this._residents = { list, cards: new Map() };
    }
    const { list, cards } = this._residents;
    if (list.hidden) return;
    const groups = new Map();
    for (const lz of Game.state.lizards) {
      const key = Game.dispKey(lz);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(lz);
    }
    for (const [key, card] of cards) {
      if (!groups.has(key)) {
        card.el.remove();
        cards.delete(key);
      }
    }
    // Rarer holdings come first. Ties retain the acquisition order of the groups.
    const sorted = [...groups].sort((a, b) => a[1].length - b[1].length);
    for (const [index, [key, members]] of sorted.entries()) {
      let card = cards.get(key);
      if (!card) {
        const lz = members[0];
        const el = document.createElement("button");
        el.className = "resident-card";
        el.type = "button";
        el.dataset.resident = key;
        el.innerHTML = `<span class="resident-art">${this.specimenPortrait(lz.speciesId, lz.morphId)}</span>
          <span class="resident-caption"><b>${speciesById(lz.speciesId).name}</b><small>${morphById(lz.morphId).name}</small></span>
          <strong class="resident-quantity"></strong>`;
        card = { el, quantity: el.querySelector(".resident-quantity") };
        cards.set(key, card);
      }
      const qty = members.length + "匹";
      if (card.quantity.textContent !== qty) {
        card.quantity.textContent = qty;
        card.el.classList.toggle("resident-single", members.length === 1);
      }
      const selected = String(members.some(lz => lz.id === Game.selectedId));
      if (card.el.getAttribute("aria-pressed") !== selected) card.el.setAttribute("aria-pressed", selected);
      const slot = list.children[index];
      if (slot !== card.el) list.insertBefore(card.el, slot || null);
    }
  },
});
