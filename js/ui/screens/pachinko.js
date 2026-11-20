// 常設台とボス報酬盤は同じ物理・描画を使い、球と結果は別々に保持する。
Object.assign(UI, {
  initPachinko() {
    const canvas = document.getElementById("crank-roulette-canvas");
    if (!canvas) return;
    const main = canvas.closest("main");
    const frame = main.querySelector("#frame");
    const panel = main.querySelector("#pachi-dashboard");
    const board = Roulette.create();
    const els = Object.fromEntries(Array.from(main.querySelectorAll('[id^="pachi-"]'), (el) => [el.id.slice(6), el]));
    this._liveRoulette = { board, canvas, ctx: canvas.getContext("2d"), effects: {}, els, stream: 0, running: false };
    board.canAcceptEgg = () => Game.state.eggs.length < Game.eggSlotCap();
    board.onLanding = ({ win }) => Game.recordCrankRouletteLanding(win);
    board.onEgg = (outcome) => {
      const result = Game.awardCrankRoulette(outcome);
      if (!result) return;
      els["result-title"].textContent = result;
      els.result.dataset.tier = outcome.rainbow ? "jackpot" : "win";
      if (typeof Sound !== "undefined") Sound.play(outcome.rainbow ? "pachinkoJackpot" : "pachinkoHit");
    };
    Game.onEvent((name) => {
      if (name !== "planet") return;
      board.reset();
      this._liveRoulette.effects = {};
      els["result-title"].textContent = "クランクを回すと玉が流れます。";
      delete els.result.dataset.tier;
    });
    els["jump-to-board"].addEventListener("click", () => panel.scrollIntoView({ block: "start" }));
    els["goal-action"].addEventListener("click", () => this.openMissions());
    els["raid-action"].addEventListener("click", () => {
      if (!Game.raid) Game.raidNow();
      frame.scrollIntoView({ block: "nearest" });
      frame.focus({ preventScroll: true });
      this.updatePachinko();
    });
    this.initHabitatFullscreen(frame, main.querySelector("#habitat-fullscreen"));
    this.updatePachinko();
  },

  initHabitatFullscreen(frame, button) {
    let fallback = false;
    const detail = this.els.detail;
    const detailHome = detail.parentElement;
    const sync = () => {
      const active = fallback || document.fullscreenElement === frame;
      const detailHost = active ? frame : detailHome;
      if (detail.parentElement !== detailHost) detailHost.appendChild(detail);
      const label = active ? "全画面表示を解除" : "飼育槽を全画面表示";
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", label);
      button.title = label;
      button.querySelector("path").setAttribute("d", active
        ? "M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5"
        : "M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5");
    };
    const setFallback = (active) => {
      fallback = active;
      frame.classList.toggle("habitat-expanded", active);
      sync();
    };
    let request = 0;
    this.closeHabitatFullscreen = () => {
      request++;
      if (fallback) setFallback(false);
      if (document.fullscreenElement === frame) document.exitFullscreen().catch(() => {});
    };
    button.addEventListener("click", async () => {
      if (fallback || document.fullscreenElement === frame) {
        this.closeHabitatFullscreen();
        return;
      }
      const current = ++request;
      setFallback(true);
      if (!frame.requestFullscreen) return;
      try {
        await frame.requestFullscreen();
        if (request !== current && !fallback && document.fullscreenElement === frame) {
          await document.exitFullscreen();
        } else if (document.fullscreenElement === frame) {
          setFallback(false);
        }
      } catch { /* The in-page fullscreen is already active. */ }
    });
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && fallback) this.closeHabitatFullscreen();
    });
  },

  fireCrankRoulette() {
    const live = this._liveRoulette;
    if (!live || Game.raid || Roulette.reward || this._bossRewardOpen) return;
    live.board.emit(Game.rouletteRepGene());
  },

  advanceCrankRoulette(dt) {
    const live = this._liveRoulette;
    if (!live) return;
    const dial = Game.ensureDial();
    const running = dial.auto && Game.foreground && !Roulette.reward && !this._bossRewardOpen && Game.canTurnFeedCrank();
    if (running) {
      const interval = CFG.roulCrankIntervals[dial.rate] ?? CFG.roulCrankIntervals[1];
      live.stream = live.running ? live.stream + dt : interval;
      if (live.stream >= interval) {
        this.fireCrankRoulette();
        live.stream %= interval;
      }
    } else {
      live.stream = 0;
    }
    live.running = running;
    if (live.board.balls.length) live.board.advance(dt);
  },

  drawCrankRoulette() {
    const live = this._liveRoulette;
    if (!live) return;
    const { canvas, ctx, board, effects } = live;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) { board.drainEvents(); return; }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this._paintRoulBoard(ctx, w, h, "rainbow", board, effects);
  },

  updatePachinko() {
    const live = this._liveRoulette;
    if (!live) return;
    const { els } = live;
    const state = Game.state;
    const raid = Game.raid;
    const raidType = raid || state.nextRaid;
    const calls = Game.bossCallRemaining();
    const progress = Game.pachinkoStatus();
    const text = (key, value) => { if (els[key].textContent !== value) els[key].textContent = value; };
    text("stage-name", Game.currentStage().name);
    text("population", `トカゲ ${state.lizards.length} / ${Game.capacity()}匹`);
    text("egg-count", `卵 ${state.eggs.length} / ${Game.eggSlotCap()}個`);
    text("total", fmt(progress.total));
    text("streak", progress.streak + "回");
    text("mode", Game.raid ? "迎撃中" : live.running ? "連続発射中" : live.board.balls.length ? "落下中" : "クランク待機");
    els.mode.dataset.mode = live.running ? "stream" : "normal";
    els["raid-card"].dataset.snake = String(!raidType || raidType.typeId === "snake");
    els["raid-card"].dataset.active = String(!!raid);
    text("raid-name", raidType ? Game.bossDisplayName(raidType) : "襲来を警戒");
    text("raid-timer", raid ? "迎撃中" : fmtTime(state.raidTimer));
    text("raid-action", raid ? "防衛へ ↗" : calls ? `襲来を呼ぶ · 残り${calls}回 ↗` : "本日の呼び出し終了");
    els["raid-action"].disabled = !raid && calls <= 0;
    text("guard", progress.guard ? `迎撃支援 ×${progress.guard} ／ 攻撃力 +${progress.guardBonus}%` : "襲来時は飼育槽で迎撃。");
    const goals = MISSIONS.filter((mission) => mission.pachinko && !state.missionsClaimed[mission.id]);
    const claimable = goals.find((mission) => mission.check(state));
    const goal = claimable || goals[0];
    text("goal-title", goal ? goal.name : "ミッション一覧");
    text("goal-note", claimable ? "報酬を受け取る" : goal
      ? `進行 ${fmt(progress[goal.pachinko.stat])} / ${fmt(goal.pachinko.target)}` : "");
  },
});
