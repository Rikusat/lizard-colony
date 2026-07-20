// =============================================================
// ui/hero/boss-reward — ボス討伐後の報酬ルーレット(ヒーロー器・Phase3.13 C2)
// 撃破の余韻→CFGの「間」→中央にせり上がり(大きめ)→盤の右下に"同じクランク"を再登場。
// クランクで球を撃つ→着地で卵/レア/新種→尽きたら集計を読み取れる時間だけ見せて退場・完全消去。
//
// §1.2.3 クランク: 既存の #feeder-dial を丸ごとモーダルへ移設して行動だけ「給餌→球射出」に分岐する
// (新規機構を作らない)。同一要素のためスキン(CrankSkins・惑星差替可)/spin/オート回転/緑=オート/
// #spin-proof は骨格のまま保たれる。操作モデルはボス前のオート状態を継承:
//   auto ON  → モーダル内でも自動射出(crankは緑の後光で自動回転・操作不要)
//   auto OFF → クランクのクリック=1発 / 長押し=連続(レート別間隔=見ていられる速さ)
// 盤とクランクの意匠は惑星ごとに差し替える前提(roulette_rules §0)。意匠変更時は §4 でMC再測。
// reduced-motion時は物理を回さず即時解決(結果保証)。
// =============================================================

Object.assign(UI, {
  _bossRewardOpen: false,
  _brReward: null,
  _brCv: null, _brCtx: null,
  _brState: "idle",  // "firing" | "tally"
  _brTallyT: 0,
  _brOpenTimer: null,
  _brFireAcc: 0,
  _brLastT: 0,

  // Game.beginBossReward から呼ばれる。撃破の余韻(CFGの「間」)を置いてからせり上がる
  openBossReward(reward) {
    if (typeof document === "undefined" || !reward) return;
    if (this._brOpenTimer) clearTimeout(this._brOpenTimer);
    if (this._bossRewardOpen) this.closeBossReward(); // 前の報酬が残っていたら畳む(通常ボスは逐次なので稀)
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
      // 盤(プレイフィールド)と操作部(ドック=クランク+全部撃つ)を領域として分離。
      // クランクは盤の下の専用ドック右側に置き、球の落下・受け皿に重ねない(§1.2.3改修)
      el.innerHTML =
        '<div class="br-panel">' +
          '<div class="br-title"></div>' +
          '<div class="br-stage"><canvas class="br-canvas"></canvas></div>' +
          '<div class="br-tray"></div>' +
          '<div class="br-dock">' +
            '<button class="br-skip" type="button">全部撃つ</button>' +
            '<div class="br-crankslot"></div>' +
          '</div>' +
          '<div class="br-hint"></div>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector(".br-skip").addEventListener("click", () => this._brSkip());
      el.addEventListener("click", (e) => { if (this._brState === "tally" && !e.target.closest("#feeder-dial")) this.closeBossReward(); }); // ④ 獲得景品はタップで即終了
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
    this._brFireAcc = 0; this._brLastT = (typeof Render !== "undefined") ? Render.time : 0;
    Motion.play(el.querySelector(".br-panel"), "rise");
    this._brRelocateCrank(el.querySelector(".br-crankslot")); // 盤の下のドック右側へ(盤に重ねない)
    this._brUpdateHint();
    this._brUpdateTray();
    if (Motion.reduced) this._brResolveInstant(); // 物理を回さず即時解決(結果保証)
  },

  // #feeder-dial を丸ごとモーダルへ移設。行動分岐は feeder.feedOnce 側。
  // 復帰先は常に #frame(クランクの定位置)=報酬が重なっても親が壊れない
  _brRelocateCrank(into) {
    const fd = document.getElementById("feeder-dial");
    if (!fd || !into) return;
    fd.classList.add("in-reward");
    into.appendChild(fd);
    if (UI.updateFeeder) UI.updateFeeder(); // オート状態を反映(raid=null→auto-onで自動回転)
  },
  _brRestoreCrank() {
    const fd = document.getElementById("feeder-dial");
    if (!fd) return;
    fd.classList.remove("in-reward");
    (document.getElementById("frame") || document.body).appendChild(fd);
    if (UI.updateFeeder) UI.updateFeeder();
  },

  // クランク(タップ/長押し)から呼ばれ、球を1発撃つ。撃てたら true
  _brCrankFire() {
    if (!this._bossRewardOpen || this._brState !== "firing") return false;
    return (typeof Roulette !== "undefined") && Roulette.fireRewardBall();
  },

  // 「全部撃つ」(スキップ): 残りを即発射(物理は通るので損しない=着地で正しく判定)
  _brSkip() {
    if (!this._bossRewardOpen || this._brState !== "firing") return;
    let g = 0;
    while (Roulette.rewardRemaining() > 0 && g < 5000) { Roulette.fireRewardBall(); g++; }
  },

  // 毎フレーム(core loop)。盤面を共有ペインタで描画・auto射出・尽きたら集計→退場
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
    // オート射出(ボス前オートを継承): レート別間隔で自動発射。crankは緑の後光で自動回転(updateFeeder)
    if (this._brState === "firing" && Game.ensureDial && Game.ensureDial().auto) {
      const now = (typeof Render !== "undefined") ? Render.time : this._brLastT + 1 / 60;
      const dt = Math.max(0, Math.min(0.1, now - this._brLastT));
      this._brLastT = now;
      this._brFireAcc += dt;
      const iv = CFG.roulRewardRateInterval[Game.ensureDial().rate] || 0.5;
      while (this._brFireAcc >= iv && Roulette.rewardRemaining() > 0) { this._brFireAcc -= iv; Roulette.fireRewardBall(); }
    } else if (typeof Render !== "undefined") {
      this._brLastT = Render.time;
    }
    this._brUpdateTray();
    if (this._brState === "firing" && !Roulette.rewardActive()) {
      // ④ 全球が落ち切った後に「獲得景品」を表示(獲得ありのみ・タップで即終了)。無ければ表示せず即退場(無駄な間なし)
      const t = Game.bossReward || {};
      const got = (t.eggs || 0) + (t.rares || 0) + (t.rainbows || 0);
      if (got <= 0) { this.closeBossReward(); return; }
      this._brState = "tally";
      this._brTallyT = CFG.roulResultSec || 3.0;
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
    // ④ 射出中は残数のみ(獲得の内訳は落ち切った後=tallyで見せる=演出と被らない)
    if (this._brState === "tally") {
      el.querySelector(".br-tray").innerHTML = '<span class="got">獲得</span><span>卵 ' + (t.eggs || 0) + "</span>" + special;
    } else {
      const rem = (typeof Roulette !== "undefined") ? Roulette.rewardRemaining() : 0;
      el.querySelector(".br-tray").innerHTML = '<span class="rem">残 ' + rem + "</span>";
    }
  },

  _brUpdateHint() {
    const el = document.getElementById("boss-reward"); if (!el) return;
    const hint = el.querySelector(".br-hint"); if (!hint) return;
    hint.textContent = (Game.ensureDial && Game.ensureDial().auto) ? "自動で撃っています" : "クランクで撃つ(長押しで連続)";
  },

  _brShowTally() {
    const el = document.getElementById("boss-reward"); if (!el) return;
    const hint = el.querySelector(".br-hint");
    if (hint) hint.textContent = "報酬を受け取った";
    const skip = el.querySelector(".br-skip");
    if (skip) skip.style.visibility = "hidden";
  },

  _brResolveInstant() {
    let g = 0;
    while (Roulette.rewardRemaining() > 0 && g < 5000) { Roulette.fireRewardBall(); g++; }
    g = 0; while (Roulette.rewardActive() && g < 200000) { Roulette.advance(CFG.roulFixedDt * 8); g++; }
    const t = Game.bossReward || {}; const got = (t.eggs || 0) + (t.rares || 0) + (t.rainbows || 0);
    if (got <= 0) { this.closeBossReward(); return; } // ④ 獲得なしは表示しない
    this._brState = "tally"; this._brTallyT = CFG.roulResultSec || 3.0; this._brShowTally();
  },

  closeBossReward() {
    this._bossRewardOpen = false;
    this._brState = "idle";
    this._brRestoreCrank(); // クランクを飼育槽の右下へ戻す
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
