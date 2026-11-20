// Cabinet controls and presentation. Game settles each launch before the board animates it.
Object.assign(UI, {
  initPachinko() {
    const panel = document.getElementById("pachi-dashboard");
    if (!panel) return;
    const main = panel.closest("main");
    const frame = main.querySelector("#frame");
    const els = {};
    for (const el of main.querySelectorAll('[id^="pachi-"]')) els[el.id.slice(6)] = el;
    this._pachi = { els, aim: 0, count: 1, parentIds: [], firing: false };
    PachinkoBoard.mount(els.board);

    els["jump-to-board"].addEventListener("click", () => {
      panel.scrollIntoView({ block: "start" });
      els.fire.focus({ preventScroll: true });
    });
    els.aim.addEventListener("input", () => {
      const p = this._pachi;
      p.aim = Number(els.aim.value);
      PachinkoBoard.setAim(p.aim);
      this.updatePachinko();
    });
    for (const count of [1, 10]) {
      els["count-" + count].addEventListener("click", () => {
        this._pachi.count = count;
        this.updatePachinko();
      });
    }
    els.fire.addEventListener("click", () => this.firePachinko());
    els["feed-fire"].addEventListener("click", () => this.firePachinko(true));
    els.pair.addEventListener("click", () => this.openBreedMenu());
    els["goal-action"].addEventListener("click", () => this.openMissions());
    els["pair-clear"].addEventListener("click", () => {
      this._pachi.parentIds = [];
      this.updatePachinko();
      els.pair.focus();
    });
    els["raid-action"].addEventListener("click", () => {
      if (!Game.raid) Game.raidNow();
      frame.scrollIntoView({ block: "nearest" });
      frame.focus({ preventScroll: true });
      this.updatePachinko();
    });
    Game.onEvent((name) => {
      if (name !== "planet") return;
      this._pachi.parentIds = [];
      this.updatePachinko();
    });
    this.updatePachinko();
  },

  selectPachinkoParents(a, b) {
    if (!this._pachi) return;
    this._pachi.parentIds = [a.id, b.id];
    this.closeModal();
    this.updatePachinko();
    this._pachi.els.fire.focus();
  },

  updatePachinko() {
    const p = this._pachi;
    if (!p) return;
    const { els, aim, count, parentIds, firing } = p;
    const state = Game.state;
    const raid = Game.raid;
    const s = p.statusBefore || Game.pachinkoStatus(parentIds, aim);
    const live = p.lastLanding ? { ...s, ...p.lastLanding.progress } : s;
    const stage = Game.currentStage();
    const raidType = raid || state.nextRaid;
    const calls = Game.bossCallRemaining();
    const mode = s.rushActive ? "rush" : live.feverShots > 0 ? "fever" : "normal";
    PachinkoBoard.setPlanet(stage.id);
    const cost = s.cost * count + (s.fee || 0);
    const setText = (key, value) => {
      if (els[key].textContent !== value) els[key].textContent = value;
    };

    setText("stage-name", stage.name);
    setText("population", `トカゲ ${state.lizards.length} / ${Game.capacity()}匹`);
    setText("egg-count", `卵 ${state.eggs.length} / ${Game.eggSlotCap()}個`);
    setText("aim-label", aim < 0 ? "給餌重視" : aim > 0 ? "レア狙い" : "バランス");
    els.aim.setAttribute("aria-valuetext", els["aim-label"].textContent);
    if (els.mode.dataset.mode !== mode) {
      els.mode.dataset.mode = mode;
      els.mode.innerHTML = `<i aria-hidden="true"></i> ${{ normal: "通常モード", fever: "FEVER 突入", rush: "報酬 RUSH" }[mode]}`;
      PachinkoBoard.setMode(mode);
    }
    const fever = live.fever;
    const meter = els["fever-meter"];
    meter.setAttribute("aria-valuenow", String(fever));
    meter.firstElementChild.style.width = fever + "%";
    setText("fever-count", live.feverShots ? `残り ${live.feverShots}発` : fever + "%");
    const feverNote = p.lastLanding?.feverStarted ? "FEVER 点灯！"
      : s.multiplier > 1 ? `レア期待度アップ ／ コイン配当 ×${s.multiplier}`
      : live.feverShots ? "レア期待度アップ" : "満タンでレア期待度と配当が上昇。";
    setText("fever-note", feverNote);
    setText("streak", live.streak + "回");
    setText("rare-chance", firing ? "—" : s.rareChance + "%");
    setText("chance-note", live.chanceReady ? "CHANCE　次の1発はレア以上！" : `CHANCE まで最大 ${live.untilChance}発`);
    els["chance-note"].dataset.ready = String(live.chanceReady);

    els["raid-card"].dataset.snake = String(!raidType || raidType.typeId === "snake");
    els["raid-card"].dataset.active = String(!!raid);
    setText("raid-name", raidType ? Game.bossDisplayName(raidType) : "襲来を警戒");
    setText("raid-timer", raid ? "迎撃中" : fmtTime(state.raidTimer));
    const rush = els["rush-badge"];
    rush.hidden = !s.rushShots;
    setText("rush-badge", `RUSH 残り ${s.rushShots}発`);
    setText("raid-action", raid ? "防衛へ ↗" : calls ? `襲来を呼ぶ · 残り${calls}回 ↗` : "本日の呼び出し終了");
    els["raid-action"].disabled = !raid && calls <= 0;
    setText("guard", s.guard ? `迎撃支援 ×${s.guard} ／ 攻撃力 +${s.guardBonus}%` : "レア以上で次の迎撃を強化。");

    let pairStatus = "親を2匹選ぶと、発射結果が卵の遺伝に反映されます。";
    if (parentIds.length) {
      pairStatus = s.canBreed
        ? `${s.pair.map((parent) => Game.lizardName(parent)).join(" × ")} ／ 繁殖料 ${fmt(s.fee)} G`
        : `${s.pairError}。親を選び直すか、解除してください。`;
    }
    setText("pair-status", pairStatus);
    els["pair-clear"].hidden = !parentIds.length;

    if (!firing) {
      const goals = MISSIONS.filter((mission) => mission.pachinko && !state.missionsClaimed[mission.id]);
      const claimable = goals.find((mission) => mission.check(state));
      const goal = claimable || goals[0];
      setText("goal-title", goal ? goal.name : "ミッション一覧");
      setText("goal-note", claimable ? "報酬を受け取る" : goal
        ? `進行 ${fmt(s[goal.pachinko.stat])} / ${fmt(goal.pachinko.target)}` : "");
    }

    const feedFire = els["feed-fire"];
    feedFire.closest(".pachi-feed").dataset.ready = String(s.feedBall);
    const feedProgress = s.feedBall ? "1発ストック" : `${s.feedProgress} / ${s.feedTarget}`;
    setText("feed-progress", feedProgress);
    setText("feed-at-habitat", `給餌球 ${feedProgress}`);
    els["feed-at-habitat"].dataset.ready = String(s.feedBall);
    setText("feed-note", s.feedBall ? "コイン不要。入賞で素材やFEVERを獲得。" : `クランクの手動給餌 ${s.feedTarget}回で1発。`);
    setText("feed-fire", raid ? "迎撃中" : "給餌球を撃つ");
    feedFire.disabled = firing || !!raid || !s.feedBall;

    const controls = [els.aim, els["count-1"], els["count-10"], els.pair, els["pair-clear"]];
    for (const el of controls) el.disabled = firing;
    for (const n of [1, 10]) els["count-" + n].setAttribute("aria-pressed", String(count === n));
    els.fire.disabled = firing || !!raid || s.coins < cost || (parentIds.length > 0 && !s.canBreed);
    els.fire.firstElementChild.lastChild.textContent = firing ? " 発射中…" : " 発射する";
    setText("fire-price", raid ? "迎撃中" : !firing && s.coins < cost ? `${fmt(cost)} G（不足）` : `${fmt(cost)} G`);
  },

  async firePachinko(feedBall = false) {
    const p = this._pachi;
    if (!p || p.firing) return;
    const show = (title, note, tier) => {
      p.els["result-title"].textContent = title;
      p.els["result-note"].textContent = note;
      p.els.result.dataset.tier = tier;
    };
    const parents = feedBall ? [] : p.parentIds;
    const options = feedBall ? { feedBall: true } : undefined;
    const count = feedBall ? 1 : p.count;
    const paidStatus = Game.pachinkoStatus(p.parentIds, p.aim);
    const preview = feedBall ? Game.pachinkoStatus(p.parentIds, p.aim, options) : paidStatus;
    const result = Game.playPachinko(p.aim, count, parents, options);
    if (result.error) {
      show("発射できません", result.error, "error");
      this.updatePachinko();
      return;
    }
    p.firing = true;
    p.statusBefore = { ...preview, cost: paidStatus.cost };
    p.els["ball-trace"].replaceChildren(...result.shots.map(() => document.createElement("i")));
    p.els.landing.textContent = "";
    show(feedBall ? "給餌球を発射" : count === 1 ? "玉を発射" : `${count}発を発射`, "着地を待っています。", "");
    if (typeof Sound !== "undefined") Sound.play("pachinkoLaunch");
    this.updatePachinko();

    try {
      await PachinkoBoard.play(result.shots, { onLanding: (event) => this.showPachinkoLanding(event) });
    } finally {
      p.firing = false;
      p.statusBefore = null;
      p.lastLanding = null;
      if (result.egg && p.parentIds === parents) p.parentIds = [];
      this.showPachinkoResult(result, show);
      this.updatePachinko();
    }
  },

  showPachinkoLanding({ shot, index, count }) {
    const p = this._pachi;
    p.lastLanding = shot;
    const light = p.els["ball-trace"].children[index];
    light.dataset.tier = shot.tier;
    light.title = PachinkoBoard.label(shot.tier);
    p.els.landing.textContent = [
      count > 1 ? `${index + 1}/${count}` : "",
      shot.chance ? "CHANCE" : "",
      PachinkoBoard.label(shot.tier),
      shot.feverStarted ? "FEVER 点灯" : "",
    ].filter(Boolean).join(" · ");
    if (typeof Sound !== "undefined" && !Motion.reduced) {
      const cue = shot.tier === "jackpot" ? "pachinkoJackpot" : shot.feverStarted ? "pachinkoFever"
        : shot.tier === "normal" || shot.tier === "mutation" ? "pachinkoPocket" : "pachinkoHit";
      Sound.play(cue);
    }
    this.updatePachinko();
  },

  showPachinkoResult(result, show) {
    const tiers = Game.pachinkoBoard().tiers;
    const rewards = [
      ["coins", "G"], ["crickets", "匹のコオロギ"], ["gems", "ジェム"], ["amethyst", "アメジスト"], ["guard", "迎撃支援"],
    ].flatMap(([key, unit]) => {
      const quantity = result.total[key];
      return quantity > 0 ? [`+${fmt(quantity)} ${unit}`] : [];
    });
    if (result.egg) {
      const { speciesId, morphId } = result.egg;
      const morph = morphById(morphId);
      rewards.push(`卵 1個（${speciesById(speciesId).name}${morph && morphId !== "normal" ? "・" + morph.name : ""}）`);
    }
    if (result.shots.length > 1) {
      const details = tiers.flatMap((tier) => {
        const num = result.shots.filter((shot) => shot.tier === tier).length;
        return num ? [`${PachinkoBoard.label(tier)} ×${num}`] : [];
      });
      rewards.unshift(details.join(" / "));
    }
    if (result.shots.some((shot) => shot.feverStarted)) rewards.push("FEVER 発動");
    if (typeof Sound !== "undefined" && Motion.reduced && result.bestTier !== "normal") {
      Sound.play(result.bestTier === "jackpot" ? "pachinkoJackpot" : "pachinkoHit");
    }
    const title = result.shots.length === 1 ? PachinkoBoard.label(result.bestTier) : `${result.shots.length}連の結果`;
    show(title, rewards.join(" · "), result.bestTier);
  },
});
