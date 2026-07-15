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
  // ---------------- 味方 (GameExpansion_v2 ⑩) ----------------
  openAllies() {
    this.openModal("🐾 味方 (繁殖不可の特別な仲間)", (body) => {
      body.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        各ボスの脅威を無力化する頼れる仲間。ボス撃破の素材でLvアップ。
        所持🧬生態データ: <b style="color:var(--gold)">${fmt(Game.res("bio"))}</b></p>`;
      for (const a of ALLIES) {
        const owned = Game.state.allies[a.id];
        const row = document.createElement("div");
        row.className = "list-row" + (owned ? "" : " done");
        if (owned) {
          const maxed = owned.lv >= CFG.allyMaxLv;
          const cost = Game.allyLvUpCost(a.id);
          row.innerHTML = `
            <span class="fic">${a.icon}</span>
            <div class="grow"><b>${a.name}</b> <span class="lv">Lv${owned.lv}/${CFG.allyMaxLv}</span>
              <div class="desc">${a.desc}</div></div>
            <button ${maxed || Game.res("bio") < cost ? "disabled" : ""}>${maxed ? "MAX" : "強化 🧬" + cost}</button>`;
          if (!maxed) row.querySelector("button").addEventListener("click", () => {
            Game.allyLvUp(a.id);
            this.openAllies();
          });
        } else {
          row.innerHTML = `
            <span class="fic">❓</span>
            <div class="grow"><b>${a.name}</b>
              <div class="desc">入手条件: ${a.unlockText}</div></div>
            <span style="color:var(--sub)">未加入</span>`;
        }
        body.appendChild(row);
      }
    });
  },

  // ---------------- 称号 (⑨-1) ----------------
  openTitles() {
    this.openModal("🏅 称号", (body) => {
      body.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        条件を達成すると自動で獲得。好きな称号をコロニーに掲げよう。</p>`;
      for (const t of TITLES) {
        const owned = Game.state.titles[t.id];
        const selected = Game.state.titleSel === t.id;
        const row = document.createElement("div");
        row.className = "list-row" + (owned ? "" : " done");
        row.innerHTML = `
          <span class="fic">${owned ? "🏅" : "🔒"}</span>
          <div class="grow"><b>${owned ? t.name : "???"}</b>
            <div class="desc">${t.hint}</div></div>
          ${owned ? (selected ? `<span class="lv">掲示中</span>` : `<button>掲げる</button>`) : ""}`;
        if (owned && !selected) row.querySelector("button").addEventListener("click", () => {
          Game.state.titleSel = t.id;
          this.toast(`🏅 称号「${t.name}」を掲げた!`);
          this.openTitles();
        });
        body.appendChild(row);
      }
    });
  },

  // ---------------- 統計ダッシュボード (⑨-4/20/23/25) ----------------
  openStats() {
    this.openModal("📊 統計ダッシュボード", (body) => {
      const s = Game.state;
      const p = Game.prestige();
      const pc = Game.prestigeClass();
      const rows = [
        ["🏆 コロニーランク", s.rank],
        ["🦎 現在のトカゲ数", `${s.lizards.length} / ${Game.capacity()}`],
        ["🐣 累計孵化数", s.stats.hatched],
        ["💕 累計繁殖回数", s.stats.bred],
        ["🍴 累計餌やり回数", fmt(s.stats.fed)],
        ["🛡 撃退数", s.stats.raidsWon],
        ["👹 ボス撃破数", s.stats.bossWon],
        ["💰 売却数", s.stats.sold],
        ["📖 図鑑コンプ率", (Game.dexRate() * 100).toFixed(1) + "%"],
        ["🏅 獲得称号", `${Object.keys(s.titles).length} / ${TITLES.length}`],
        ["📅 連続ログイン", s.daily.streak + "日"],
      ];
      body.innerHTML = `
        <div class="prestige-box">
          <div class="p-class">${pc.cls}</div>
          <div class="p-score">コロニー勲章(威信値): <b>${fmt(p)}</b></div>
          <div class="p-rank">推定順位: 世界の上位 ${pc.pct}% のコロニー</div>
        </div>
        <div class="stats-grid">
          ${rows.map(([k, v]) => `<div class="stat-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>
        <button id="btn-export" style="width:100%;margin-top:12px">📸 コロニー全景を画像で保存 (SNS共有用)</button>`;
      body.querySelector("#btn-export").addEventListener("click", () => this.exportShot());
    });
  },

  // コロニー全景の書き出し (⑨-25)
  exportShot() {
    const src = document.getElementById("game");
    const out = document.createElement("canvas");
    out.width = W; out.height = H + 90;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#241a0e";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 90);
    const s = Game.state;
    const tt = s.titleSel && TITLES.find((t) => t.id === s.titleSel);
    ctx.fillStyle = "#f2c65e";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("🦎 トカゲコロニー", 24, 44);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ede3d0";
    ctx.fillText(
      `${tt ? "「" + tt.name + "」 " : ""}ランク${s.rank} / トカゲ${s.lizards.length}匹 / 撃退${s.stats.raidsWon}回 / 図鑑${(Game.dexRate() * 100).toFixed(0)}% / ${Game.currentStage().name}`,
      24, 74);
    ctx.textAlign = "right";
    ctx.fillStyle = "#b3a488";
    ctx.fillText(new Date().toLocaleDateString("ja-JP"), W - 24, 44);
    const a = document.createElement("a");
    a.download = `lizard-colony-rank${s.rank}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
    this.toast("📸 コロニー全景を保存した!");
  },

  // ---------------- 放浪商人 (⑨-11) ----------------
  openMerchant() {
    const m = Game.merchant;
    if (!m) return;
    this.openModal("🧳 放浪商人", (body) => {
      if (!Game.merchant || !Game.merchant.offers.length) {
        body.innerHTML = `<p>「もう売るものがないよ。また来るね」</p>`;
        return;
      }
      body.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        「いいものあるよ。ジェムで払っておくれ」(滞在 残り${Math.ceil(Game.merchant.t)}秒 / 所持💎${fmt(Game.state.gems)})</p>`;
      Game.merchant.offers.forEach((o, i) => {
        const row = document.createElement("div");
        row.className = "list-row";
        row.innerHTML = `
          <div class="grow"><b>${o.label}</b></div>
          <button ${Game.state.gems < o.price ? "disabled" : ""}>💎${o.price}</button>`;
        row.querySelector("button").addEventListener("click", () => {
          Game.buyMerchant(i);
          this.openMerchant();
        });
        body.appendChild(row);
      });
    });
  },

  // ---------------- 図鑑 ----------------
  openDex() {
    if (!this.dexTab) this.dexTab = "dex";
    this.openModal("📖 トカゲ図鑑", (body) => this.buildDex(body));
  },

  buildDex(body) {
    body.innerHTML = `
      <div class="nest-tabs">
        <button data-dtab="dex" class="${this.dexTab === "dex" ? "primary" : ""}">🦎 図鑑</button>
        <button data-dtab="lore" class="${this.dexTab === "lore" ? "primary" : ""}">📖 Lore(世界観)</button>
      </div>
      <div id="dex-body"></div>`;
    for (const btn of body.querySelectorAll("[data-dtab]")) {
      btn.addEventListener("click", () => { this.dexTab = btn.dataset.dtab; this.buildDex(body); });
    }
    const box = body.querySelector("#dex-body");
    if (this.dexTab === "lore") {
      // V4 §3.5: Loreタブ(遊ぶうちに解放されるコレクション)
      const lore = Game.state.lore || {};
      const gotN = LORE.filter((L) => lore[L.id]).length;
      box.innerHTML = `<div class="dex-summary">解読済み: <b style="color:var(--gold)">${gotN}/${LORE.length}</b>
        — 惑星レプタイルの記録。遊ぶほどに世界が見えてくる</div>`;
      for (const L of LORE) {
        const got = lore[L.id];
        const row = document.createElement("div");
        row.className = "list-row" + (got ? "" : " done");
        row.innerHTML = got
          ? `<span class="fic">📜</span><div class="grow"><b>${L.name}</b><div class="desc">${L.text}</div></div>`
          : `<span class="fic">🔒</span><div class="grow"><b>???</b><div class="desc">冒険を進めると解読される…</div></div>`;
        box.appendChild(row);
      }
      return;
    }
    const total = SPECIES.length * MORPHS.length;
    const got = Object.keys(Game.state.dex).length;
    const bonus = Game.dexCompBonus();
    box.innerHTML = `<div class="dex-summary">コンプ率: <b style="color:var(--gold)">${(got / total * 100).toFixed(1)}%</b> (${got}/${total})
      <div class="bar"><div style="width:${got / total * 100}%"></div></div>
      <div style="font-size:12px;color:var(--sub);margin-top:5px">
        🏆 コンプ報酬(恒久): 現在 生産+${Math.round(bonus * 100)}% — 25%/50%/75%/100%で +2/4/6/10%</div></div>`;
    const stageId = Game.currentStage().id;
    // V4: 惑星別に区切って表示
    for (const st of STAGES) {
      const list = SPECIES.filter((sp) => sp.stage === st.id);
      if (!list.length) continue;
      const head = document.createElement("h4");
      head.className = "hq-h";
      head.textContent = `${st.icon} ${st.pname}(${st.name})`;
      box.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "dex-grid";
      for (const sp of list) {
        for (const mo of MORPHS) {
          const found = Game.state.dex[sp.id + ":" + mo.id];
          const cell = document.createElement("div");
          cell.className = "dex-cell" + (found ? "" : " locked");
          if (found) {
            const [h, s, l] = mo.recolor(sp.hue, sp.sat, sp.light);
            cell.innerHTML = `<div class="sw" style="background:hsl(${h},${s}%,${l}%)"></div>
              <div class="nm">${sp.name}</div><div class="mo">${mo.name} ${"★".repeat(sp.stars)}</div>`;
          } else {
            const known = sp.stage <= stageId || sp.stage <= 5;
            cell.innerHTML = `<div class="sw" style="background:#222"></div>
              <div class="nm">???</div><div class="mo">${known ? mo.name : st.pname + "で発見"}</div>`;
          }
          grid.appendChild(cell);
        }
      }
      box.appendChild(grid);
    }
  },

  // ---------------- ミッション ----------------
  openMissions() {
    this.openModal("🎯 ミッション", (body) => {
      body.innerHTML = "";
      for (const m of MISSIONS) {
        const claimed = Game.state.missionsClaimed[m.id];
        const done = m.check(Game.state);
        const row = document.createElement("div");
        row.className = "list-row" + (claimed ? " done" : "");
        const rewardTxt = [
          m.reward.gems ? `💎${m.reward.gems}` : "",
          m.reward.coins ? `${fmt(m.reward.coins)}G` : "",
        ].filter(Boolean).join(" ");
        row.innerHTML = `
          <span style="font-size:20px">${claimed ? "✅" : done ? "🎁" : "🎯"}</span>
          <div class="grow"><b>${m.name}</b><div class="desc">報酬: ${rewardTxt}</div></div>
          ${claimed ? `<span class="lv">達成済</span>` : done ? `<button>受取</button>` : `<span style="color:var(--sub)">未達成</span>`}`;
        if (!claimed && done) row.querySelector("button").addEventListener("click", () => {
          Game.state.missionsClaimed[m.id] = true;
          if (m.reward.gems) Game.state.gems += m.reward.gems;
          if (m.reward.coins) Game.state.coins += m.reward.coins;
          this.toast(`🎁 ミッション達成! ${m.name} → ${rewardTxt}`);
          this.openMissions();
        });
        body.appendChild(row);
      }
    });
  },

  // ---------------- 設定 ----------------
  openSettings() {
    this.openModal("⚙ 設定", (body) => {
      body.innerHTML = `
        <div class="list-row"><div class="grow"><b>セーブ</b><div class="desc">10秒ごとに自動保存されます</div></div>
          <button id="set-save">今すぐ保存</button></div>
        <div class="list-row"><div class="grow"><b>V4.1移行前のバックアップから復元</b><div class="desc">Idle Nest(V4.1)移行前のセーブへ巻き戻す</div></div>
          <button id="set-rollback41">復元</button></div>
        <div class="list-row"><div class="grow"><b>V4移行前のバックアップから復元</b><div class="desc">Planet Reptile(V4)移行前のセーブへ巻き戻す</div></div>
          <button id="set-rollback">復元</button></div>
        <div class="list-row"><div class="grow"><b>データ初期化</b><div class="desc">すべての進行状況を削除して最初から</div></div>
          <button id="set-reset" class="danger">初期化</button></div>
        <div style="font-size:12px;color:var(--sub);line-height:1.7;margin-top:10px">
          <b style="color:var(--gold)">🦎 遊び方</b><br>
          1. コオロギを買ってトカゲに餌やり → 成長・レベルアップ<br>
          2. アダルト2匹で繁殖 → 卵が孵化してコロニー拡大<br>
          3. 定期的に蛇が襲来! トカゲたちが自動で戦う<br>
          4. 撃退報酬で設備を強化し、図鑑コンプリートを目指そう!
        </div>`;
      body.querySelector("#set-save").addEventListener("click", () => {
        Game.save(); this.toast("💾 セーブしました");
      });
      body.querySelector("#set-rollback41").addEventListener("click", () => {
        if (confirm("V4.1移行前のバックアップへ巻き戻しますか? 移行後の進行は失われます。")) Game.restoreV4Backup();
      });
      body.querySelector("#set-rollback").addEventListener("click", () => {
        if (confirm("V4移行前のバックアップへ巻き戻しますか? 移行後の進行は失われます。")) Game.restoreV3Backup();
      });
      body.querySelector("#set-reset").addEventListener("click", () => {
        if (confirm("本当に初期化しますか? この操作は取り消せません!")) Game.resetSave();
      });
    });
  },

};
