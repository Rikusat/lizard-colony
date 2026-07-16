// =============================================================
// ui/core — UIシングルトンの土台(状態/初期化/毎秒更新/ヒント)
// 各画面は js/ui/screens/*.js が Object.assign(UI, {...}) で拡張し、
// 起動は js/ui/boot.js が担う(読込順: core → components → screens → boot)
// =============================================================

const UI = {
  els: {},
  acc: 0,
  breedPick: { a: null, b: null },
  hints: [
    "トカゲをクリックすると詳細が見られます。餌をあげて育てよう!",
    "アダルト2匹で繁殖できる。色や模様は子に遺伝する!",
    "低確率でモーフ(アルビノ等)や上位種族への突然変異が起きる!",
    "フェンスを建てると蛇の襲撃に先制攻撃できる。",
    "シェルターがあればベビーは蛇に狙われない。",
    "5回撃退するごとにボス蛇が来る。報酬はジェム確定!",
    "図鑑に新種を登録するとジェムがもらえる。コンプを目指せ!",
    "ランクが上がるとステージが進み、新しい種族が解放される。",
    "購入・餌やりボタンは長押しで加速連続実行できる!",
    "繁殖ボタンを長押しすると最善ペアで連続クイック繁殖!",
    "ランク30/60でまとめ買いの単位が育ち、100で自動補給が解禁!",
    "ランク30からは毎回ボスが襲来。5回に1回は報酬2倍のElite!",
    "オオタカの急降下予告リングはタップ連打で追い払える!",
    "クモのウェブはタップ連打でほつれる。ヤモリがいれば自動切除!",
    "サソリの毒は水場のLvが高いほど早く抜ける。",
    "生態データで味方をLvアップできる(味方ボタン)。",
    "巣ネットワークは繁殖するだけで勝手に育つ。眺めて楽しもう!",
    "侵食率は毎日ログインすれば低く保てる。放置しすぎ注意!",
    "隕石はHQの遺伝子ラボで割れる。中から希少個体が…",
    "惑星欄をタップすると惑星マップが開く。移動は1タップ!",
    "餌場を建てると食料供給が生まれ、自動給餌が回り出す。",
    "最新の惑星(フロンティア)が最も稼げる。前へ進もう!",
    "余ったGoldはHQで食料やエネルギーに変換できる。",
    "惑星開発(HQ)はGoldの立派な使い道。生産が底上げされる。",
    "ごく稀に虹色の伝説個体が生まれる。祭壇で確率が上がる!",
    "放浪商人は数分に一度あらわれる。虹色の卵を売ることも…",
    "統計から称号の掲示とコロニー全景の画像保存ができる。",
    "毎日ログインするとデイリーボーナス! 連続でジェム増量。",
  ],
  hintIdx: 0,

  init() {
    const ids = ["ui-coins", "ui-cps", "ui-crickets", "ui-gems", "ui-rank", "rank-bar",
      "ui-pop", "ui-stage", "ui-wins", "raid-timer", "raid-banner", "egg-slots",
      "detail", "modal", "modal-title", "modal-body", "toasts", "mission-badge", "ui-hint"];
    for (const id of ids) this.els[id] = document.getElementById(id);

    // ボタン(購入・餌やりは長押しで加速連続実行 / GameExpansion_v2 ④)
    this.units = shopUnitsFor(Game.state.rank);
    on("btn-buy10", () => Game.buyCrickets(this.units[0]));
    on("btn-buy100", () => Game.buyCrickets(this.units[1]));
    on("btn-breed", () => this.openBreed());
    attachHold(document.getElementById("btn-buy10"), () => Game.buyCrickets(this.units[0], true));
    attachHold(document.getElementById("btn-buy100"), () => Game.buyCrickets(this.units[1], true));
    // 繁殖ボタンの長押し=クイック繁殖の連続実行(短押しは選択画面)
    attachHold(document.getElementById("btn-breed"), () => Game.quickBreed(true));
    on("btn-autosupply", () => {
      Game.state.autoSupply = !Game.state.autoSupply;
      this.toast(Game.state.autoSupply ? " 自動補給 ON: 在庫が減ると毎秒自動購入します" : "自動補給 OFF");
      this.update();
    });
    on("btn-fac", () => this.openFacilities());
    on("btn-allies", () => this.openAllies());
    on("btn-merchant", () => this.openMerchant());
    on("btn-stats", () => this.openStats());
    on("btn-hq", () => this.openHQ());
    on("btn-nest", () => this.openNest());
    on("row-stage", () => this.openMap());
    on("row-title", () => this.openTitles());
    // キーボード操作(§7): role=buttonの行は Enter/Space でも発火
    for (const id of ["row-stage", "row-title"]) {
      document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
      });
    }
    on("btn-dex", () => this.openDex());
    on("btn-missions", () => this.openMissions());
    on("btn-settings", () => this.openSettings());
    on("btn-raid-now", () => Game.raidNow());
    on("modal-close", () => this.closeModal());
    this.els["modal"].addEventListener("pointerdown", (e) => {
      if (e.target === this.els["modal"]) this.closeModal();
    });

    // Canvas クリック → ボスギミック対応 or トカゲ選択
    const cv = document.getElementById("game");
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (W / r.width);
      const y = (e.clientY - r.top) * (H / r.height);
      const raid = Game.raid;
      // 巣穴タップ → 巣・探索ビュー (V3)
      if (!raid && Math.hypot(x - 480, y - 668) < 70) {
        this.openNest();
        return;
      }
      // クモのウェブはタップ連打でほつれる
      if (raid && raid.typeId === "spider") {
        const w = raid.webs.find((w2) => w2.hp > 0 && Math.hypot(w2.x - x, w2.y - y) < 55);
        if (w) {
          w.hp--;
          Game.popup(w.x, w.y - 20, w.hp > 0 ? "ほつれた!" : "除去!", "#cfe8ff");
          return;
        }
      }
      // 鷹の急降下予告リングをタップ連打で追い払う
      if (raid && raid.typeId === "hawk" && raid.dive) {
        const tgt = Game.state.lizards.find((l) => l.id === raid.dive.targetId);
        if (tgt && Math.hypot(tgt.x - x, tgt.y - y) < 90) {
          raid.dive.taps++;
          Game.popup(tgt.x, tgt.y - 40, `威嚇 ${raid.dive.taps}/${CFG.hawkTapToScare}`, "#8fd0ff");
          return;
        }
      }
      let best = null, bestD = Infinity;
      for (const lz of Game.state.lizards) {
        if (!Game.isVisible(lz)) continue;
        // 横向きスプライトの当たり判定(足元アンカーから上に伸びる箱・群衆スケール追従)
        const L = 105 * speciesById(lz.speciesId).size * (lz.stage === "baby" ? 0.5 : 1) * Game.crowdScale();
        const dx = x - lz.x, dy = y - lz.y;
        if (Math.abs(dx) < Math.max(40, L * 0.7) && dy > -Math.max(36, L * 0.52) && dy < L * 0.15) {
          const d = Math.hypot(dx, dy + L * 0.2);
          if (d < bestD) { bestD = d; best = lz; }
        }
      }
      Game.selectedId = best ? best.id : null;
      this.renderDetail(true);
    });

    // 動的パネルは pointerdown 委譲(再描画でclickが失われないように)
    this.els["detail"].addEventListener("pointerdown", (e) => this.onDetailAction(e));
    this.els["egg-slots"].addEventListener("pointerdown", (e) => {
      const btn = e.target.closest("[data-egg]");
      if (btn) Game.instantHatch(+btn.dataset.egg);
    });

    this.buildEggSlots();
    this.initFeeder(); // 給餌ダイヤル(飼育槽右下・Brushup V2 Phase1)
    setInterval(() => this.rotateHint(), 12000);
    // #breed で繁殖画面を直接開く(動作確認・デバッグ用)
    if (location.hash === "#breed") setTimeout(() => this.openBreed(), 400);

    // 背景タブ化する直前にセーブ(リロード復帰時のオフライン精算の基点を新鮮に保つ)
    document.addEventListener("visibilitychange", () => { if (document.hidden) Game.save(); });

    // メインループ(撃破時はスローモーション演出)
    let last = performance.now();
    const loop = (t) => {
      const real = (t - last) / 1000;
      last = t;
      Render.time += Math.min(real, 0.1);
      if (real > 0.5) {
        // タブ復帰やラグで大きな時間ギャップ → 経過ぶんをまとめて精算(生産を止めない)
        Game.catchUp(real);
      } else {
        const gdt = Game.slowmo > 0 ? real * 0.25 : real;
        if (Game.slowmo > 0) Game.slowmo = Math.max(0, Game.slowmo - real);
        Game.tick(gdt);
      }
      Render.draw();
      this.acc += real;
      if (this.acc >= 0.2) { this.acc = 0; this.update(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  rotateHint() {
    this.hintIdx = (this.hintIdx + 1) % this.hints.length;
    this.els["ui-hint"].textContent = this.hints[this.hintIdx];
  },

  // 惑星アクセント(§1.5 / Phase 8): 縁・リング・ドットの差し色のみ。土壌と魂は不変
  planetAccents: {
    1: "desert", 2: "grass", 3: "jungle", 4: "swamp", 5: "volcano",
    6: "jungle", 7: "swamp", 8: "snow", 9: "cave", 10: "ruins",
  },
  planetAccent(id) { return `var(--planet-${this.planetAccents[id] || "desert"})`; },
  applyPlanetAccent() {
    const id = Game.currentStage().id;
    if (this._accentId === id) return;
    this._accentId = id;
    document.documentElement.style.setProperty("--planet-accent", this.planetAccent(id));
  },

  // ランクアップ(§6: 軽)。右パネルのHQ Lv行がその場でリング発光+数値ロールアップ
  rankUpFx() {
    const el = this.els["ui-rank"];
    if (el) Motion.play(el.closest(".rowline"), "rankup");
  },

  // 資源ピルのジュース(§5.1)。quietDelta以下の変動(毎秒の自動収入)は演出しない
  resPill(id, value, quietDelta) {
    const el = this.els[id] || document.getElementById(id);
    const delta = el._mv === undefined ? 0 : value - el._mv;
    Motion.countUp(el, value);
    if (Math.abs(delta) <= (quietDelta || 0)) return;
    const pill = el.closest(".res");
    if (!pill) return;
    if (delta > 0) {
      Motion.play(pill, "gain");
      Motion.play(pill.querySelector(".ricon"), "bounce");
    } else if (delta < 0) {
      Motion.play(pill, "loss");
    }
  },

  // ---------------- 定期更新 ----------------
  update() {
    const s = Game.state;
    // 資源ピル(§5.1): 平常の自動収入は静かに回し、まとまった増減だけ弾ませる
    this.resPill("ui-coins", s.coins, Game.incomePerSec() * 0.5);
    this.els["ui-cps"].textContent = "+" + Game.incomePerSec().toFixed(1) + "/秒";
    this.resPill("ui-crickets", s.crickets, 0);
    this.resPill("ui-gems", s.gems, 0);
    Motion.countUp(this.els["ui-rank"], s.rank, (v) => Math.round(v));
    this.els["rank-bar"].style.width = (s.rankXp / Game.rankXpNeed() * 100) + "%";
    this.els["ui-pop"].textContent = s.lizards.length + "/" + Game.capacity();
    this.els["ui-stage"].textContent = Game.currentStage().name;
    this.applyPlanetAccent(); // 惑星が変わった時だけ差し色が切り替わる
    Motion.countUp(this.els["ui-wins"], s.stats.raidsWon, (v) => Math.round(v));
    // V4: 資源フロー表示
    document.getElementById("ui-res-bio").textContent = fmt(Game.res("bio"));
    document.getElementById("ui-res-food").textContent = fmt(Game.res("food"));
    document.getElementById("ui-res-energy").textContent = fmt(Game.res("energy"));
    document.getElementById("ui-res-science").textContent = fmt(Game.res("science"));
    const curSt = Game.currentStage();
    document.getElementById("ui-invasion").textContent = Math.round(s.erosion || 0) + "%";
    this.updateStageBar();
    const nc = Game.nestWebCounts();
    document.getElementById("nest-badge").classList.toggle("hidden",
      nc.open <= ((s.nestWeb && s.nestWeb.seen) || 0));
    // 称号・放浪商人
    const tt = s.titleSel && TITLES.find((t) => t.id === s.titleSel);
    document.getElementById("ui-title").textContent = tt ? tt.name : "(称号なし)";
    const mBtn = document.getElementById("btn-merchant");
    mBtn.classList.toggle("hidden", !Game.merchant);
    mBtn.classList.toggle("primary", !!Game.merchant);

    // 襲撃タイマー+次ボス予告 (GameExpansion_v2 ①: 予告強化)
    const rt = this.els["raid-timer"];
    const nb = document.getElementById("next-boss");
    // Brushup V2 §3.1: 危機状態(ボス級の戦闘中のみ)。終了で即解除=残り香ゼロ
    const dread = !!(Game.raid && (Game.raid.tier || Game.raid.boss || Game.raid.elite));
    document.body.classList.toggle("dread", dread);
    if (dread && !this._dreadWas) { // 襲来の瞬間: ごく軽い震動(1回だけ)
      const fr = document.getElementById("frame");
      if (fr) Motion.play(fr, "quake");
    }
    this._dreadWas = dread;
    if (Game.raid) {
      const r = Game.raid;
      rt.textContent = "襲撃中!!";
      rt.classList.add("soon");
      this.els["raid-banner"].classList.remove("hidden");
      this.els["raid-banner"].innerHTML =
        `${r.elite ? Icon.svg("crown") + " " : ""}${Icon.svg(r.type.icon)} ${r.type.name}${r.tier ? " T" + r.tier : ""} 襲来中!!`;
      nb.classList.add("hidden");
    } else {
      rt.textContent = fmtTime(s.raidTimer);
      rt.classList.toggle("soon", s.raidTimer <= 10);
      this.els["raid-banner"].classList.add("hidden");
      // 次の襲撃の予告(R30+はBOSSバッジ+名前+脅威)
      if (s.nextRaid && (s.nextRaid.tier || s.nextRaid.boss)) {
        const t = bossTypeById(s.nextRaid.typeId);
        nb.classList.remove("hidden");
        nb.innerHTML = `<span class="boss-badge">BOSS</span>${s.nextRaid.elite ? `<span class="elite-badge">ELITE</span>` : ""}
          <span class="nb-icon">${Icon.svg(t.icon)}</span> ${t.name}${s.nextRaid.tier ? " T" + s.nextRaid.tier : ""}
          <div class="nb-threat">${t.threat}</div>`;
      } else {
        nb.classList.add("hidden");
      }
    }

    // ショップ進化: ランクに応じた購入単位の繰り上げ (GameExpansion_v2 ⑤)
    const units = shopUnitsFor(s.rank);
    if (units !== this._shownUnits) {
      this._shownUnits = units;
      this.units = units;
      for (const [id, u] of [["btn-buy10", units[0]], ["btn-buy100", units[1]]]) {
        const btn = document.getElementById(id);
        btn.querySelector(".lbl").innerHTML = `コオロギ ×${fmt(u)}<small>${u === units[0] ? "トカゲの餌" : "まとめ買い"}</small>`;
        btn.querySelector(".price").textContent = fmt(u * CFG.cricketCost) + "G";
      }
    }
    // 自動補給トグル (R100解禁)
    const asBtn = document.getElementById("btn-autosupply");
    if (s.rank >= CFG.autoSupplyRank) {
      asBtn.classList.remove("hidden");
      asBtn.querySelector(".lbl").innerHTML = `自動補給: ${s.autoSupply ? "ON" : "OFF"}<small>在庫${fmt(CFG.autoSupplyThreshold)}未満で毎秒購入</small>`;
      asBtn.classList.toggle("primary", s.autoSupply);
    } else {
      asBtn.classList.add("hidden");
    }

    // ミッションバッジ
    const claimable = MISSIONS.some((m) => !s.missionsClaimed[m.id] && m.check(s));
    this.els["mission-badge"].classList.toggle("hidden", !claimable);

    this.updateFeeder();
    this.updateEggSlots();
    this.renderDetail(false);
  },

  // ---------------- V4.1 §4: 巣ネットワーク(蜘蛛の巣状・閲覧専用) ----------------
  // 解放ボタンは存在しない。巣は繁殖の裏で勝手に育つ——眺めて、気づくためのUI。
};
