// =============================================================
// ui/hero/boss-reward — ボス討伐後の報酬ルーレット(ヒーロー器・Phase3.13 C2)
// 撃破の余韻→CFGの「間」→中央にせり上がり→タップで球を撃つ→着地で卵/レア/新種→
// 尽きたら集計を読み取れる時間だけ見せて退場・完全消去(ephemeral・平常画面に残り香なし)。
// 盤面は screens/roulette._paintRoulBoard を共有(コピペ増殖を防ぐ)。中央ポケットの色は
// jackpotMode で差替(§1.2.2: rainbow=七色/rare=琥珀)=撃破の瞬間に「今日は虹だ」と盤で分かる。
// reduced-motion時は物理を回さず即時解決(結果保証)。C2a: タップ=1発+集計+退場。長押し/全部撃つはC2b。
// =============================================================

Object.assign(UI, {
  _bossRewardOpen: false,
  _brReward: null,
  _brCv: null, _brCtx: null,
  _brState: "idle",  // "firing" | "tally"
  _brTallyT: 0,
  _brOpenTimer: null,

  // Game.beginBossReward から呼ばれる。撃破の余韻(CFGの「間」)を置いてからせり上がる
  openBossReward(reward) {
    if (typeof document === "undefined" || !reward) return;
    if (this._brOpenTimer) clearTimeout(this._brOpenTimer);
    const delay = (Motion.reduced ? 0.2 : (CFG.roulRewardDelaySec || 1.5)) * 1000;
    this._brOpenTimer = setTimeout(() => this._brRise(reward), delay);
  },

  _brRise(reward) {
    const mode = reward.jackpotMode || reward.mode || "rainbow";
    reward.jackpotMode = mode;
    let el = document.getElementById("boss-reward");
    if (!el) {
      el = document.createElement("div");
      el.id = "boss-reward";
      el.innerHTML =
        '<div class="br-panel">' +
          '<div class="br-title"></div>' +
          '<canvas class="br-canvas"></canvas>' +
          '<div class="br-tray"></div>' +
          '<div class="br-hint">タップで撃つ</div>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector(".br-canvas").addEventListener("pointerdown", () => this._brFire());
    }
    el.querySelector(".br-title").innerHTML = mode === "rainbow"
      ? Icon.svg("spark") + " 大ボス討伐 — 虹の遺伝子"
      : "討伐報酬 — レアの遺伝子";
    el.className = "show " + (mode === "rainbow" ? "rainbow" : "rare");
    this._brCv = el.querySelector(".br-canvas");
    this._brCtx = this._brCv.getContext("2d");
    this._brReward = reward;
    this._bossRewardOpen = true;
    this._brState = "firing";
    Motion.play(el.querySelector(".br-panel"), "rise");
    this._brUpdateTray();
    if (Motion.reduced) this._brResolveInstant(); // 物理を回さず即時解決(結果保証)
  },

  _brFire() {
    if (!this._bossRewardOpen || this._brState !== "firing") return;
    Roulette.fireRewardBall(); // C2a: タップ=1発(長押し/全部撃つはC2b)
  },

  // 毎フレーム(core loop)呼び出し。盤面を共有ペインタで描き、尽きたら集計→退場
  drawBossReward() {
    if (!this._bossRewardOpen) return;
    const cv = this._brCv, ctx = this._brCtx;
    if (cv && ctx) {
      const rect = cv.getBoundingClientRect();
      if (rect.width > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const ww = Math.round(rect.width * dpr), hh = Math.round(rect.height * dpr);
        if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
        this._paintRoulBoard(ctx, cv.width, cv.height, this._brReward.jackpotMode);
      }
    }
    this._brUpdateTray();
    if (this._brState === "firing" && !Roulette.rewardActive()) {
      this._brState = "tally";
      this._brTallyT = Motion.reduced ? 1.0 : (CFG.roulRewardTallySec || 2.4);
      this._brShowTally();
    } else if (this._brState === "tally") {
      this._brTallyT -= 1 / 60;
      if (this._brTallyT <= 0) this.closeBossReward();
    }
  },

  _brUpdateTray() {
    const el = document.getElementById("boss-reward"); if (!el) return;
    const t = Game.bossReward || {};
    const special = this._brReward && this._brReward.jackpotMode === "rare"
      ? '<span class="rare">レア卵 ' + (t.rares || 0) + "</span>"
      : '<span class="rainbow">新種 ' + (t.rainbows || 0) + "</span>";
    const rem = (typeof Roulette !== "undefined") ? Roulette.rewardRemaining() : 0;
    el.querySelector(".br-tray").innerHTML =
      "<span>卵 " + (t.eggs || 0) + "</span>" + special + '<span class="rem">残 ' + rem + "</span>";
  },

  _brShowTally() {
    const el = document.getElementById("boss-reward"); if (!el) return;
    const hint = el.querySelector(".br-hint");
    if (hint) hint.textContent = "報酬を受け取った";
  },

  _brResolveInstant() {
    let g = 0;
    while (Roulette.rewardRemaining() > 0 && g < 5000) { Roulette.fireRewardBall(); g++; }
    g = 0; while (Roulette.rewardActive() && g < 200000) { Roulette.advance(CFG.roulFixedDt * 8); g++; }
    this._brState = "tally"; this._brTallyT = 1.0; this._brShowTally();
  },

  closeBossReward() {
    this._bossRewardOpen = false;
    this._brState = "idle";
    if (typeof Roulette !== "undefined" && Roulette.endReward) Roulette.endReward();
    const el = document.getElementById("boss-reward");
    if (el) {
      el.classList.add("leaving");
      const rm = () => { if (el.parentNode) el.parentNode.removeChild(el); };
      Motion.reduced ? rm() : setTimeout(rm, 260);
    }
    this._brCv = null; this._brCtx = null; this._brReward = null;
  },
});
