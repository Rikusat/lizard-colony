"use strict";
// ============================================================
// トカゲコロニー: DOM UI・入力・メインループ
// ============================================================

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
    "🧬生態データで味方をLvアップできる(🐾味方ボタン)。",
    "🕸巣ネットワークは繁殖するだけで勝手に育つ。眺めて楽しもう!",
    "🪲侵食率は毎日ログインすれば低く保てる。放置しすぎ注意!",
    "☄️隕石はHQの遺伝子ラボで割れる。中から希少個体が…",
    "🪐惑星欄をタップすると惑星マップが開く。移動は1タップ!",
    "餌場を建てると食料供給が生まれ、自動給餌が回り出す。",
    "最新の惑星(フロンティア)が最も稼げる。前へ進もう!",
    "余ったGoldはHQで食料やエネルギーに変換できる。",
    "惑星開発(HQ)はGoldの立派な使い道。生産が底上げされる。",
    "ごく稀に虹色の伝説個体が生まれる。祭壇で確率が上がる!",
    "🧳放浪商人は数分に一度あらわれる。虹色の卵を売ることも…",
    "📊統計から称号の掲示とコロニー全景の画像保存ができる。",
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
    on("btn-feedall", () => Game.feedAll());
    on("btn-breed", () => this.openBreed());
    attachHold(document.getElementById("btn-buy10"), () => Game.buyCrickets(this.units[0], true));
    attachHold(document.getElementById("btn-buy100"), () => Game.buyCrickets(this.units[1], true));
    attachHold(document.getElementById("btn-feedall"), () => Game.feedAll(true));
    // 繁殖ボタンの長押し=クイック繁殖の連続実行(短押しは選択画面)
    attachHold(document.getElementById("btn-breed"), () => Game.quickBreed(true));
    on("btn-autosupply", () => {
      Game.state.autoSupply = !Game.state.autoSupply;
      this.toast(Game.state.autoSupply ? "🔁 自動補給 ON: 在庫が減ると毎秒自動購入します" : "自動補給 OFF");
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

  // ---------------- 定期更新 ----------------
  update() {
    const s = Game.state;
    this.els["ui-coins"].textContent = fmt(s.coins);
    this.els["ui-cps"].textContent = "+" + Game.incomePerSec().toFixed(1) + "/秒";
    this.els["ui-crickets"].textContent = fmt(s.crickets);
    this.els["ui-gems"].textContent = fmt(s.gems);
    this.els["ui-rank"].textContent = s.rank;
    this.els["rank-bar"].style.width = (s.rankXp / Game.rankXpNeed() * 100) + "%";
    this.els["ui-pop"].textContent = s.lizards.length + "/" + Game.capacity();
    this.els["ui-stage"].textContent = Game.currentStage().name;
    this.els["ui-wins"].textContent = s.stats.raidsWon;
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
    if (Game.raid) {
      const r = Game.raid;
      rt.textContent = "襲撃中!!";
      rt.classList.add("soon");
      this.els["raid-banner"].classList.remove("hidden");
      this.els["raid-banner"].textContent =
        `${r.elite ? "👑 " : ""}${r.type.icon} ${r.type.name}${r.tier ? " T" + r.tier : ""} 襲来中!!`;
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
          <span class="nb-icon">${t.icon}</span> ${t.name}${s.nextRaid.tier ? " T" + s.nextRaid.tier : ""}
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

    this.updateEggSlots();
    this.renderDetail(false);
  },

  // ---------------- 卵スロット ----------------
  buildEggSlots() {
    const box = this.els["egg-slots"];
    box.innerHTML = "";
    for (let i = 0; i < Game.eggSlotCap(); i++) {
      const div = document.createElement("div");
      div.className = "egg-slot";
      div.innerHTML = `<span class="ico"></span><span class="info"></span><span class="t"></span><button data-egg="${i}" class="hidden">💎1</button>`;
      box.appendChild(div);
    }
  },

  updateEggSlots() {
    // 孵化室でスロット数が変わったら作り直す
    if (this.els["egg-slots"].children.length !== Game.eggSlotCap()) this.buildEggSlots();
    const slots = this.els["egg-slots"].children;
    const genelab = Game.facLv("breedfac") >= 3; // 繁殖施設Lv3: レア予兆
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i], egg = Game.state.eggs[i];
      const btn = el.querySelector("button");
      if (egg) {
        el.classList.add("filled");
        el.querySelector(".ico").textContent = egg.lucky ? "🌈" : "🥚";
        const sp = speciesById(egg.speciesId);
        // 遺伝解析室: レア予兆の表示(演出のみ)
        const omen = genelab && (egg.morphId !== "normal" || sp.stars >= 4) ? " ✨" : "";
        el.querySelector(".info").textContent = sp.name + "系" + omen;
        el.querySelector(".t").textContent =
          egg.t <= 0 ? "スペース待ち" : fmtTime(egg.t);
        btn.classList.toggle("hidden", egg.t <= 0);
      } else {
        el.classList.remove("filled");
        el.querySelector(".ico").textContent = "";
        el.querySelector(".info").textContent = "(空きスロット)";
        el.querySelector(".t").textContent = "";
        btn.classList.add("hidden");
      }
    }
  },

  // ---------------- トカゲ詳細 ----------------
  renderDetail(force) {
    const el = this.els["detail"];
    const lz = Game.state.lizards.find((x) => x.id === Game.selectedId);
    if (!lz) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    const col = Render.lizardColor(lz);
    const xpMax = lz.stage === "baby" ? CFG.babyXpToAdult : CFG.adultXpPerLevel;
    el.innerHTML = `
      <h4><span class="sw" style="display:inline-block;width:20px;height:12px;border-radius:6px;background:${col.css};border:1px solid #0006"></span>
        ${Game.lizardName(lz)}</h4>
      <div class="stars">${"★".repeat(sp.stars)}${"☆".repeat(5 - sp.stars)} <span style="color:var(--sub)">${mo.name}</span></div>
      <div class="stat"><span>${lz.stage === "baby" ? "🐣 ベビー" : "🦎 アダルト Lv" + lz.level}</span>
        <span>XP ${Math.floor(lz.xp)}/${xpMax}</span></div>
      <div class="bar"><div style="width:${clamp(lz.xp / xpMax * 100, 0, 100)}%"></div></div>
      <div class="stat"><span>⚔ 攻撃力</span><b>${Game.lizardAtk(lz).toFixed(1)}</b></div>
      <div class="stat"><span>💰 生産/秒</span><b>${Game.lizardIncome(lz).toFixed(2)}G</b></div>
      ${lz.injuredT > 0 ? `<div class="injured">🩹 負傷中 (あと${Math.ceil(lz.injuredT)}秒)</div>` : ""}
      ${lz.breedCd > 0 ? `<div style="color:var(--sub)">💕 繁殖まで ${Math.ceil(lz.breedCd)}秒</div>` : ""}
      ${lz.founder ? `<div style="color:var(--gold)">👑 創始者 — 旧コロニーの血統</div>` : ""}
      ${lz.exploring ? `<div style="color:#8fd0ff">🔦 探索派遣中</div>` : ""}
      <div class="btns">
        <button data-act="feed">🦗 餌やり</button>
        ${lz.injuredT > 0 ? `<button data-act="heal">💎1 回復</button>` : ""}
        <button data-act="pin">${(Game.state.nest.pins || []).includes(lz.id) ? "📌解除" : "📌ピン"}</button>
        ${Game.stageSpecificSpecies().length && Game.res("bio") >= CFG.mutateBioCost && speciesById(lz.speciesId).stage !== Game.currentStage().id
          ? `<button data-act="mutate">🧬 変異(🧬${CFG.mutateBioCost})</button>` : ""}
        <button data-act="sell">💰 売却 ${fmt(Game.lizardSellPrice(lz))}</button>
        <button data-act="close">閉じる</button>
      </div>`;
  },

  onDetailAction(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const lz = Game.state.lizards.find((x) => x.id === Game.selectedId);
    if (!lz) return;
    switch (btn.dataset.act) {
      case "feed": Game.feed(lz); break;
      case "heal": Game.healWithGem(lz); break;
      case "mutate": Game.mutateLizard(lz); break;
      case "pin": {
        const pins = Game.state.nest.pins || (Game.state.nest.pins = []);
        if (pins.includes(lz.id)) Game.state.nest.pins = pins.filter((id) => id !== lz.id);
        else if (pins.length < 5) pins.push(lz.id);
        else this.toast("ピン留めは5匹まで", true);
        break;
      }
      case "sell":
        if (confirm(`${Game.lizardName(lz)} を ${fmt(Game.lizardSellPrice(lz))}G で売却しますか?`)) Game.sell(lz);
        break;
      case "close": Game.selectedId = null; break;
    }
    this.renderDetail(true);
  },

  // ---------------- V4.1 §4: 巣ネットワーク(蜘蛛の巣状・閲覧専用) ----------------
  // 解放ボタンは存在しない。巣は繁殖の裏で勝手に育つ——眺めて、気づくためのUI。
};
