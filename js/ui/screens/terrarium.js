Object.assign(UI, {
  initTerrariumInput(canvas) {
    const pointers = new Map(),
      home = document.getElementById("habitat-home");
    let dragged = false,
      pressed = null;
    const pick = (e) => {
      const r = canvas.getBoundingClientRect();
      return Terrarium.hit(
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height,
        e.pointerType === "touch" ? 4 : 0,
      );
    };
    const reset = () => {
      Terrarium.reset();
      home.hidden = true;
    };
    home.addEventListener("click", () => {
      reset();
      canvas.focus({ preventScroll: true });
    });
    Game.onEvent((name) => {
      if (name === "planet") reset();
    });
    const zoomAt = (factor, x, y) => {
      const r = canvas.getBoundingClientRect();
      Terrarium.zoom(factor, (x - r.left) / r.width, (y - r.top) / r.height);
    };
    const distance = () => {
      const [a, b] = pointers.values();
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (!pointers.size) {
        dragged = false;
        pressed = pick(e);
      } else dragged = true;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      const two = pointers.size === 2,
        before = two ? distance() : 0;
      p.x = e.clientX;
      p.y = e.clientY;
      dragged = true;
      home.hidden = false;
      if (two) {
        if (before > 2) {
          const [a, b] = pointers.values();
          zoomAt(distance() / before, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
      } else Terrarium.orbit(dx * 0.009, dy * 0.006);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!pointers.delete(e.pointerId) || dragged) return;
      this.selectTerrarium(pressed);
      pressed = null;
    });
    const cancel = (e) => {
      if (pointers.delete(e.pointerId)) dragged = true;
    };
    canvas.addEventListener("lostpointercapture", cancel);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        home.hidden = false;
        zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.12), e.clientX, e.clientY);
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowLeft":
          Terrarium.orbit(-0.14, 0);
          break;
        case "ArrowRight":
          Terrarium.orbit(0.14, 0);
          break;
        case "ArrowUp":
          Terrarium.orbit(0, 0.09);
          break;
        case "ArrowDown":
          Terrarium.orbit(0, -0.09);
          break;
        case "+":
        case "=":
          Terrarium.zoom(1.15);
          break;
        case "-":
          Terrarium.zoom(1 / 1.15);
          break;
        case "Home":
          reset();
          e.preventDefault();
          return;
        default:
          return;
      }
      home.hidden = false;
      e.preventDefault();
    });
  },
  selectTerrarium(target) {
    const raid = Game.raid;
    if (target?.kind === "web" && raid?.webs.includes(target.value)) {
      const w = target.value;
      if (w.hp > 0) {
        w.hp--;
        Game.popup(w.x, w.y - 20, w.hp ? "ほつれた!" : "除去!", "#cfe8ff");
      }
      return;
    }
    if (
      raid?.dive &&
      (target?.kind === "dive" || target?.kind === "resident") &&
      target.value.id === raid.dive.targetId
    ) {
      raid.dive.taps++;
      Game.popup(
        target.value.x,
        target.value.y - 40,
        `威嚇 ${raid.dive.taps}/${CFG.hawkTapToScare}`,
        "#8fd0ff",
      );
      return;
    }
    if (target?.kind === "boss") {
      if (target.value === raid && Game.aimWindow(raid)) Game.aimStrike();
      return;
    }
    if (!raid && target?.kind === "egg" && Game.state.eggs[target.value]) {
      this.openEggMenu(target.value);
      return;
    }
    if (!raid && target?.kind === "burrow") {
      this.openNest();
      return;
    }
    Game.selectedId =
      target?.kind === "resident" && Game.state.lizards.includes(target.value) ? target.value.id : null;
    this.renderDetail(true);
  },
});
