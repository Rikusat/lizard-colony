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
    "ランクが上がるとコオロギのまとめ買いロットが大きくなる!",
    "ランク30からは毎回ボスが襲来。5回に1回は報酬2倍のElite!",
    "オオタカの急降下予告リングはタップ連打で追い払える!",
    "クモのウェブはタップ連打でほつれる。ヤモリがいれば自動切除!",
    "サソリの毒は水場のLvが高いほど早く抜ける。",
    "生態データで味方をLvアップできる(味方ボタン)。",
    "巣ネットワークは繁殖するだけで勝手に育つ。フィールドの巣穴をタップ!",
    "侵食率は毎日ログインすれば低く保てる。放置しすぎ注意!",
    "隕石はHQの遺伝子ラボで割れる。中から希少個体が…",
    "惑星欄をタップすると惑星マップが開く。移動は1タップ!",
    "餌場を建てると食料供給が生まれ、自動給餌が回り出す。",
    "最新の惑星(フロンティア)が最も稼げる。前へ進もう!",
    "余ったGoldはHQで食料やエネルギーに変換できる。",
    "惑星開発(HQ)はGoldの立派な使い道。生産が底上げされる。",
    "ごく稀に虹色の伝説個体が生まれる。祭壇で確率が上がる!",
    "統計から称号の掲示とコロニー全景の画像保存ができる。",
    "毎日ログインするとデイリーボーナス! 連続でジェム増量。",
  ],
  hintIdx: 0,

  init() {
    const ids = ["ui-coins", "ui-cps", "ui-gems", "ui-stones", "ui-rank", "rank-bar",
      "raid-timer", "raid-banner",
      "detail", "modal", "modal-title", "modal-body", "toasts", "mission-badge", "ui-hint"];
    for (const id of ids) this.els[id] = document.getElementById(id);

    // ボタン(購入・餌やりは長押しで加速連続実行 / GameExpansion_v2 ④)
    // V5.1: 購入単位(ショップ)は撤去
    // V5.1: コオロギ購入ボタンは撤去
    // 3.11.4: 「繁殖する」ボタンは撤廃。繁殖はトカゲクリック→相手選択(renderDetail)から
    on("btn-fac", () => this.openFacilities());
    on("btn-stats", () => this.openStats());
    on("btn-hq", () => this.openHQ());
    // V5.2: コオロギ購入(まとめ買い)復活。短押し=1ロット / 長押し=連続。巣ネットワークは巣タップで開く
    on("btn-cricket", () => Game.buyCrickets());
    const cricketBtn = document.getElementById("btn-cricket");
    if (cricketBtn) attachHold(cricketBtn, () => Game.buyCrickets(undefined, true));
    on("btn-map", () => this.openMap()); // 3.10.2: 惑星バー撤廃→右上マップボタンから惑星マップ
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
      // 巣穴タップ → 巣・探索ビュー (V3)。Phase8: 住居Lvのtierスケールにタップ領域を追従
      const burrowR = (typeof burrowTierInfo !== "undefined") ? burrowTierInfo((Game.state.nest && Game.state.nest.lv) || 1).hitR : 70;
      if (!raid && Math.hypot(x - 480, y - 668) < burrowR) {
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
      // 巣の卵タップ → 卵メニュー(ダイヤ即時孵化・#7)。卵はNEST周りに描画
      if (!raid && typeof NEST !== "undefined") {
        for (let i = 0; i < Game.state.eggs.length; i++) {
          const ex = NEST.x - 24 + i * 24, ey = NEST.y + 1;
          if (Math.hypot(x - ex, y - ey) < 17) { this.openEggMenu(i); return; }
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
      if (best) { Game.selectedId = best.id; this.renderDetail(true); return; }
      // 3.11.2: トカゲが無ければ設備タップ→個別強化メニュー(建設済みの設備のみ)
      if (!raid && this.facilityHitId && this.openFacilityMenu) {
        const fid = this.facilityHitId(x, y);
        if (fid) { this.openFacilityMenu(fid); return; }
      }
      Game.selectedId = null;
      this.renderDetail(true);
    });

    // 動的パネルは pointerdown 委譲(再描画でclickが失われないように)
    this.els["detail"].addEventListener("pointerdown", (e) => this.onDetailAction(e));
    // V5 3.8: 卵スロットパネルは撤廃(卵ロジックは不変・ルーレットが卵生成を担う)
    if (this.els["egg-slots"]) {
      this.els["egg-slots"].addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("[data-egg]");
        if (btn) Game.instantHatch(+btn.dataset.egg);
      });
      this.buildEggSlots();
    }
    this.initFeeder(); // 給餌ダイヤル(飼育槽右下・Brushup V2 Phase1)
    this.initRoulette(); // 遺伝子ルーレット(左メニュー下部・roulette.md §7)
    this.initSlit(); // 四重スリット実験装置(左メニュー下部・roulette.md §9)
    this.initBossHud(); // ボスHPバー(上部中央・Brushup V2 Phase3)
    setInterval(() => this.rotateHint(), 12000);
    // #breed で繁殖画面を直接開く(動作確認・デバッグ用)
    if (location.hash === "#breed") setTimeout(() => this.openBreed(), 400);

    // 背景タブ化する直前にセーブ(リロード復帰時のオフライン精算の基点を新鮮に保つ)
    // 3.11.3: フォアグラウンド判定(visibleのみボス到来/戦闘を進める)。hiddenで保存も行う
    const syncForeground = () => { Game.foreground = document.visibilityState === "visible"; };
    syncForeground();
    document.addEventListener("visibilitychange", () => { syncForeground(); if (document.hidden) Game.save(); });

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
        // Phase3.13 v4: 給餌連動の常時発射は撤廃(ルーレット=ボス討伐後の報酬)。物理は固定dtで積分し続ける
        if (typeof Roulette !== "undefined") Roulette.advance(gdt);
        if (typeof Slit !== "undefined") Slit.advance(gdt); // §9: 四重スリット装置(クールダウン/飛行/張り付き寿命)
      }
      Render.draw();
      if (this.drawRoulette) this.drawRoulette();
      if (this.drawSlit) this.drawSlit(); // §9: 四重スリット装置(左メニュー下部・線のみ)
      if (this.drawBossReward) this.drawBossReward(); // Phase3.13 C2: ボス報酬オーバーレイ(稼働中のみ)
      this.acc += real;
      if (this.acc >= 0.2) { this.acc = 0; this.update(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  rotateHint() {
    // 3.11.1e: 常設ヒント枠は撤去(ルーレット最大化)。要素があれば更新、無ければ何もしない
    this.hintIdx = (this.hintIdx + 1) % this.hints.length;
    const el = this.els["ui-hint"] || document.getElementById("ui-hint");
    if (el) el.textContent = this.hints[this.hintIdx];
  },

  // 惑星アクセント(§1.5 / Phase 8): 縁・リング・ドットの差し色のみ。土壌と魂は不変
  planetAccents: {
    1: "desert", 2: "city", 3: "jungle", 4: "swamp", 5: "volcano",
    6: "jungle", 7: "abyss", 8: "snow", 9: "reactor", 10: "ruins",
  },
  planetAccent(id) { return `var(--planet-${this.planetAccents[id] || "desert"})`; },
  applyPlanetAccent() {
    const id = Game.currentStage().id;
    if (this._accentId === id) return;
    this._accentId = id;
    document.documentElement.style.setProperty("--planet-accent", this.planetAccent(id));
    if (typeof Slit !== "undefined" && Slit.reset) Slit.reset(); // §9: 惑星切替で装置の痕跡もクリア(惑星別意匠の布石)
  },

  // ランクアップ(§6: 軽)。3.10.4: HQバー(ヘッダー直下)が発光+数値ロールアップ
  rankUpFx() {
    const bar = document.getElementById("hq-bar");
    if (bar) Motion.play(bar, "rankup");
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
    this.resPill("ui-coins", s.coins, Game.totalIncomePerSec() * 0.5);
    this.els["ui-cps"].textContent = "+" + Game.totalIncomePerSec().toFixed(1) + "/秒"; // V5: 全コロニー合算
    // V5.1: コオロギピル撤去(givesはGold直接消費)
    this.resPill("ui-gems", s.gems, 0);
    if (this.els["ui-stones"]) this.resPill("ui-stones", s.stones || 0, 0); // v11: 賢者の石
    // 3.10.4: HQはヘッダー直下のプログレスバー。数値はバー上の小ラベル。棒はrankXp進捗
    if (this.els["ui-rank"]) Motion.countUp(this.els["ui-rank"], s.rank, (v) => Math.round(v));
    if (this.els["rank-bar"]) this.els["rank-bar"].style.width = (s.rankXp / Game.rankXpNeed() * 100) + "%";
    this.applyPlanetAccent(); // 惑星アクセント(HQバー色・差し色)を惑星変化時に切替
    // 3.10.3: トカゲ数/惑星名/撃退数/res/侵食率/称号は右パネル撤廃で「Canvas左上」or「本部/統計モーダル」へ移動
    // (res4種・侵食率=本部モーダル / 撃退数・称号=統計モーダル。ここでの毎秒更新は不要)
    // V5.2: コオロギ在庫はヘッダーのみ(右パネル撤廃)。同一の state.crickets を参照
    const crkText = fmt(Math.floor(s.crickets || 0));
    const crkTop = document.getElementById("ui-crickets-top");
    if (crkTop) crkTop.textContent = crkText;
    const lotLbl = document.getElementById("cricket-lot-lbl");
    if (lotLbl) { const n = Game.cricketLot(); lotLbl.textContent = `+${fmt(n)}匹 / ${fmt(n * CFG.cricketCost)}G`; }
    // 称号(統計モーダルへ集約・3.10.3)。DOM要素は撤去済のためガード
    const tEl = document.getElementById("ui-title");
    if (tEl) { const tt = s.titleSel && TITLES.find((t) => t.id === s.titleSel); tEl.textContent = tt ? tt.name : "(称号なし)"; }

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

    // 3.11.3: 「今すぐ呼ぶ」は1日3回。残り回数を表示し、0回or襲撃中は不可。マップは襲撃中は暗転(移動禁止)
    const rn = document.getElementById("btn-raid-now");
    if (rn) {
      const rem = Game.bossCallRemaining();
      rn.innerHTML = `${Icon.svg("snake")} 今すぐ呼ぶ <small style="opacity:.85">(あと${rem})</small>`;
      const lock = !!Game.raid || rem <= 0;
      rn.toggleAttribute("disabled", lock);
      rn.classList.toggle("locked", lock);
    }
    const mapBtn = document.getElementById("btn-map");
    if (mapBtn) { mapBtn.toggleAttribute("disabled", !!Game.raid); mapBtn.classList.toggle("locked", !!Game.raid); }

    // V5.1: ショップ(コオロギ購入単位)・自動補給トグルはUIごと撤去

    // ミッションバッジ
    const claimable = MISSIONS.some((m) => !s.missionsClaimed[m.id] && m.check(s));
    this.els["mission-badge"].classList.toggle("hidden", !claimable);

    this.updateFeeder();
    this.updateBossHud();
    this.updateEggSlots();
    this.renderDetail(false);
  },

  // ---------------- V4.1 §4: 巣ネットワーク(蜘蛛の巣状・閲覧専用) ----------------
  // 解放ボタンは存在しない。巣は繁殖の裏で勝手に育つ——眺めて、気づくためのUI。
};
