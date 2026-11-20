"use strict";
// V7: presentation-only companion to GenePachinko. The game rules are never
// mutated by the renderer. Three visible balls resolve before the egg is made.
Object.assign(UI, {
  _gpOpen: false, _gpEl: null,
  openGenePachinko(aId, bId) {
    if (!GenePachinko.begin(aId, bId)) {
      this.toast("繁殖条件を確認してください（ボス戦・報酬中は開始できません）", true);
      return false;
    }
    this.closeModal();
    const a = Game.state.lizards.find(l => l.id === aId), b = Game.state.lizards.find(l => l.id === bId);
    const el = document.createElement("div");
    el.id = "gene-pachinko";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "遺伝子パチンコ");
    el.innerHTML = `<section class="gp-panel">
      <header class="gp-head"><div><small>V7 / GENE RECOMBINATION</small><h2>遺伝子パチンコ</h2></div><button class="gp-exit" type="button" aria-label="確定して閉じる">×</button></header>
      <div class="gp-pair"><div><small>親 A</small><b>${Game.lizardName(a)}</b></div><span>×</span><div><small>親 B</small><b>${Game.lizardName(b)}</b></div></div>
      <div class="gp-live"><strong class="gp-locus">01 / 血統</strong><span class="gp-phase">PHYSICAL CHANCE</span></div>
      <div class="gp-board-frame"><canvas class="gp-board" role="img" aria-label="物理演算で釘を落下する遺伝子球"></canvas><div class="gp-board-foot"><span>親A</span><span>変異</span><span>中央V</span><span>変異</span><span>親B</span></div></div>
      <p class="gp-hint">球の着地で遺伝を決定します。</p>
      <div class="gp-track"><span class="gp-chip" data-gp="0">血統 未決定</span><span class="gp-chip" data-gp="1">モーフ 未決定</span><span class="gp-chip" data-gp="2">模様 未決定</span></div>
      <div class="gp-outcome" aria-live="polite"></div>
      <div class="gp-actions"><button class="gp-fast" type="button">結果まで早送り</button><button class="gp-done" type="button" hidden>飼育槽へ戻る</button></div>
      <footer>ペアは手動で選択。1回の繁殖で卵は必ず1個。中央Vは伝説へのチャンス。</footer>
    </section>`;
    document.body.appendChild(el);
    this._gpOpen = true; this._gpEl = el;
    GenePachinko.onLand = (locus, drop) => {
      if (!this._gpEl) return;
      const idx = GenePachinko.loci.indexOf(locus);
      const chip = this._gpEl.querySelector(`[data-gp="${idx}"]`);
      if (chip) {
        chip.textContent = locus.name + " " + (drop.rainbow && locus.id === "morph" ? "伝説!" : drop.win && locus.id !== "pattern" ? "変異チャンス" : drop.side === "a" ? "親A" : "親B");
        chip.classList.add("resolved");
      }
      if (drop.rainbow && locus.id === "morph") this._gpEl.classList.add("gp-jackpot");
      else if (drop.win) this._gpEl.classList.add("gp-hit");
    };
    GenePachinko.onFinish = result => {
      const panel = this._gpEl;
      if (!panel) return;
      panel.querySelector(".gp-outcome").textContent = result.success
        ? `遺伝確定！ ${speciesById(result.decision.speciesId).name} / ${morphById(result.decision.morphId).name} の卵が誕生！`
        : "繁殖条件が変わったため費用を消費せず終了しました";
      panel.querySelector(".gp-outcome").classList.add("show");
      panel.querySelector(".gp-locus").textContent = "遺伝確定";
      panel.querySelector(".gp-phase").textContent = result.decision && result.decision.morphId === "legendary" ? "JACKPOT!" : "RESULT";
      panel.querySelector(".gp-fast").hidden = true; panel.querySelector(".gp-done").hidden = false;
      panel.classList.add("gp-complete");
    };
    el.querySelector(".gp-fast").addEventListener("click", () => GenePachinko.finishInstant());
    el.querySelector(".gp-done").addEventListener("click", () => this._gpClose());
    el.querySelector(".gp-exit").addEventListener("click", () => this._gpClose());
    this._gpKey = e => { if (e.key === "Escape") { e.preventDefault(); this._gpClose(); } };
    document.addEventListener("keydown", this._gpKey);
    if (typeof Motion !== "undefined" && Motion.reduced) GenePachinko.finishInstant();
    return true;
  },
  _gpClose() {
    // Close == fast-forward of the same physical steps. No paid attempt disappears.
    if (GenePachinko.active()) GenePachinko.finishInstant();
    if (this._gpKey) document.removeEventListener("keydown", this._gpKey);
    this._gpKey = null; GenePachinko.onLand = null; GenePachinko.onFinish = null;
    if (this._gpEl) this._gpEl.remove();
    this._gpEl = null; this._gpOpen = false;
  },
  drawGenePachinko(realDt) {
    if (!this._gpOpen || !this._gpEl) return;
    if (GenePachinko.active()) GenePachinko.advance(realDt);
    const s = GenePachinko.session(), el = this._gpEl;
    if (!s) return;
    const locus = GenePachinko.loci[Math.min(s.locus, 2)];
    el.querySelector(".gp-locus").textContent = `0${Math.min(s.locus + 1, 3)} / ${locus.name}`;
    el.querySelector(".gp-hint").textContent = locus.hint;
    const cv = el.querySelector(".gp-board"), rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(rect.width * dpr), ph = Math.round(rect.height * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const c = cv.getContext("2d");
    if (!c) return;
    const w = CFG.roulW, h = CFG.roulH, cx = CFG.roulHoleCenterf * w;
    const land = CFG.roulLandYf * h, outer = CFG.roulPrizeOuterf * w;
    const center = CFG.roulRainbowHalfWf * w, shelf = CFG.roulStageYf * h;
    c.setTransform(pw / w, 0, 0, ph / h, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#32241c"); bg.addColorStop(.57, "#201a21"); bg.addColorStop(1, "#100d10");
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(240,195,106,.27)"; c.lineWidth = 1;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = "rgba(10,8,12,.94)"; c.fillRect(0, land, w, h - land);
    c.fillStyle = "rgba(213,156,61,.4)"; c.fillRect(cx - outer, land, outer * 2, 6);
    c.fillStyle = "rgba(215,80,232,.95)"; c.fillRect(cx - center, land, center * 2, 6);
    c.strokeStyle = "rgba(233,191,108,.6)";
    c.beginPath();
    c.moveTo(cx - CFG.roulChuteTopHalff * w, 0); c.lineTo(cx - CFG.roulChuteBotHalff * w, CFG.roulRailEndYf * h);
    c.moveTo(cx + CFG.roulChuteTopHalff * w, 0); c.lineTo(cx + CFG.roulChuteBotHalff * w, CFG.roulRailEndYf * h);
    if (CFG.roulStageOn) {
      const half = CFG.roulStageHalfWf * w, slot = CFG.roulStageSlotHalff * w;
      c.moveTo(cx - half, shelf); c.lineTo(cx - slot, shelf);
      c.moveTo(cx + slot, shelf); c.lineTo(cx + half, shelf);
      c.moveTo(cx - slot, shelf); c.lineTo(cx - slot, land);
      c.moveTo(cx + slot, shelf); c.lineTo(cx + slot, land);
    }
    c.stroke();
    // True physical pin locations; no fake random-looking pins.
    for (const nail of s.physics.nails) {
      c.beginPath(); c.arc(nail.x, nail.y, nail.r, 0, 7);
      c.fillStyle = "#83674b"; c.fill(); c.strokeStyle = "#e8be78"; c.lineWidth = .45; c.stroke();
    }
    for (const ball of s.physics.balls) {
      const g = c.createRadialGradient(ball.x - ball.r * .3, ball.y - ball.r * .3, 0, ball.x, ball.y, ball.r);
      g.addColorStop(0, "#fff"); g.addColorStop(.45, "#e7e1d1"); g.addColorStop(1, "#7f798a");
      c.fillStyle = g; c.beginPath(); c.arc(ball.x, ball.y, ball.r, 0, 7); c.fill();
      c.strokeStyle = "#fff4df"; c.lineWidth = .5; c.stroke();
    }
    if (s.flash > 0) {
      c.fillStyle = s.justLanded && s.justLanded.rainbow ? `rgba(195,81,242,${s.flash * .17})` : `rgba(249,196,91,${s.flash * .13})`;
      c.fillRect(0, 0, w, h);
    }
  },
});
