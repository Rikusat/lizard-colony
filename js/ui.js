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

  // ---------------- 繁殖(系統→個体の二段階選択 / GameExpansion_v2 ⑦⑧) ----------------
  openBreed() {
    this.breedView = { speciesId: null, picks: [], onlyReady: false, sort: "rare" };
    this.openModal("💕 繁殖", (body) => this.buildBreed(body));
  },

  buildBreed(body) {
    const v = this.breedView;
    if (v.speciesId === null) this.buildBreedSpecies(body);
    else this.buildBreedIndividuals(body);
  },

  rebuildBreed() {
    this.buildBreed(this.els["modal-body"]);
  },

  // 第1画面: 系統カード一覧
  buildBreedSpecies(body) {
    const lizards = Game.state.lizards;
    const groups = {};
    for (const lz of lizards) {
      const g = groups[lz.speciesId] = groups[lz.speciesId] || { total: 0, ready: 0 };
      g.total++;
      if (Game.canBreed(lz)) g.ready++;
    }
    const readyAll = lizards.filter((lz) => Game.canBreed(lz)).length;
    body.innerHTML = `
      <p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        系統を選んで2匹ペアを決めよう。突然変異で新モーフや上位種族が生まれることも…!
        (卵スロット ${Game.state.eggs.length}/${Game.eggSlotCap()})</p>
      <button id="quick-breed" class="primary">⚡ クイック繁殖 (最善の2匹を自動選抜・長押しで連続)</button>
      ${Game.facLv("breedfac") >= 5
        ? `<button id="auto-breed" class="${Game.state.autoBreed ? "primary" : ""}" style="width:100%;margin-bottom:10px">🪺 繁殖予約: ${Game.state.autoBreed ? "ON(卵スロットが空くと自動繁殖)" : "OFF"}</button>`
        : `<div style="font-size:12px;color:var(--sub);margin-bottom:10px">🪺 繁殖施設Lv5で「繁殖予約」(自動繁殖)が解禁</div>`}
      <div id="breed-species"></div>`;

    const ab = body.querySelector("#auto-breed");
    if (ab) ab.addEventListener("click", () => {
      Game.state.autoBreed = !Game.state.autoBreed;
      this.toast(Game.state.autoBreed ? "🪺 繁殖予約ON: スロットが空くたび自動でクイック繁殖" : "繁殖予約OFF");
      this.rebuildBreed();
    });
    const qb = body.querySelector("#quick-breed");
    qb.addEventListener("click", () => {
      const pair = Game.quickBreedPick();
      if (pair && Game.quickBreed()) {
        this.toast(`⚡ 選抜: ${Game.lizardName(pair[0])} Lv${pair[0].level} × ${Game.lizardName(pair[1])} Lv${pair[1].level}(レア度と成長が最も高いペア)`);
      }
      this.rebuildBreed();
    });
    attachHold(qb, () => Game.quickBreed(true));

    const list = body.querySelector("#breed-species");
    // 繁殖可能数が多い順、空系統は最後尾
    const ids = SPECIES.filter((sp) => groups[sp.id]).map((sp) => sp.id)
      .sort((a, b) => (groups[b].ready - groups[a].ready) || (groups[b].total - groups[a].total));
    const makeCard = (id, name, stars, swCss, total, ready) => {
      const card = document.createElement("div");
      card.className = "breed-card" + (ready < 1 ? " cd" : "");
      card.innerHTML = `
        <span class="sw" style="background:${swCss}"></span>
        <div class="grow"><b>${name}</b>
          <div class="desc">${stars ? "★".repeat(stars) + " / " : ""}個体 ${total} 匹</div></div>
        <span class="ready-badge${ready ? "" : " off"}">繁殖可 ${ready}</span>`;
      card.addEventListener("click", () => {
        this.breedView.speciesId = id;
        this.breedView.picks = [];
        this.rebuildBreed();
      });
      list.appendChild(card);
    };
    // 「すべて」カード(異系統ペア用)
    makeCard("__all", "すべての系統", 0, "linear-gradient(90deg,#e8b64c,#7fb24f,#4f9fd9)", lizards.length, readyAll);
    for (const id of ids) {
      const sp = speciesById(id);
      makeCard(id, sp.name, sp.stars, `hsl(${sp.hue},${sp.sat}%,${sp.light}%)`, groups[id].total, groups[id].ready);
    }
    if (!ids.length) list.innerHTML += `<p>トカゲがいない…</p>`;
  },

  // 第2画面: 個体グリッド
  buildBreedIndividuals(body) {
    const v = this.breedView;
    const all = v.speciesId === "__all"
      ? Game.state.lizards
      : Game.state.lizards.filter((lz) => lz.speciesId === v.speciesId);
    const title = v.speciesId === "__all" ? "すべての系統" : speciesById(v.speciesId).name;

    let list = all.filter((lz) => !v.onlyReady || Game.canBreed(lz));
    // 繁殖可能を上位に、その中を選択ソート順で
    const key = v.sort === "rare"
      ? (lz) => Game.quickBreedScore(lz)
      : (lz) => lz.level;
    list = [...list].sort((a, b) =>
      (Game.canBreed(b) - Game.canBreed(a)) || (key(b) - key(a)));

    body.innerHTML = `
      <div class="breed-head">
        <button id="breed-back">← 系統一覧</button>
        <b>${title}</b>
        <span style="color:var(--sub);font-size:12px">2匹選択(卵 ${Game.state.eggs.length}/${Game.eggSlotCap()})</span>
      </div>
      <div class="breed-filters">
        <button id="bf-ready" class="${v.onlyReady ? "primary" : ""}">繁殖可のみ</button>
        <button id="bf-rare" class="${v.sort === "rare" ? "primary" : ""}">レア度順</button>
        <button id="bf-level" class="${v.sort === "level" ? "primary" : ""}">レベル順</button>
      </div>
      <div class="breed-grid" id="breed-grid"></div>
      <button id="breed-go" disabled>2匹選んでね</button>`;

    body.querySelector("#breed-back").addEventListener("click", () => {
      v.speciesId = null; v.picks = [];
      this.rebuildBreed();
    });
    body.querySelector("#bf-ready").addEventListener("click", () => { v.onlyReady = !v.onlyReady; this.rebuildBreed(); });
    body.querySelector("#bf-rare").addEventListener("click", () => { v.sort = "rare"; this.rebuildBreed(); });
    body.querySelector("#bf-level").addEventListener("click", () => { v.sort = "level"; this.rebuildBreed(); });

    const grid = body.querySelector("#breed-grid");
    for (const lz of list) {
      const ok = Game.canBreed(lz);
      const col = Render.lizardColor(lz);
      const cell = document.createElement("div");
      cell.className = "breed-cell" + (ok ? "" : " cd") + (v.picks.includes(lz.id) ? " sel" : "");
      const status = ok ? "⭕ 繁殖可"
        : lz.injuredT > 0 ? "🩹 負傷中"
        : lz.breedCd > 0 ? "CD " + Math.ceil(lz.breedCd) + "s"
        : "🐣 ベビー";
      cell.innerHTML = `
        <span class="sw" style="background:${col.css}"></span>
        <div class="nm">${Game.lizardName(lz)}</div>
        <div class="mo">${morphById(lz.morphId).name} / ${lz.stage === "baby" ? "ベビー" : "Lv" + lz.level}</div>
        <div class="st">${status}</div>`;
      if (ok) cell.addEventListener("click", () => {
        if (v.picks.includes(lz.id)) v.picks = v.picks.filter((id) => id !== lz.id);
        else {
          v.picks.push(lz.id);
          if (v.picks.length > 2) v.picks.shift();
        }
        this.rebuildBreed();
      });
      grid.appendChild(cell);
    }
    if (!list.length) grid.innerHTML = `<p style="grid-column:1/-1">該当する個体がいない</p>`;

    const go = body.querySelector("#breed-go");
    if (v.picks.length === 2) {
      const a = Game.state.lizards.find((x) => x.id === v.picks[0]);
      const b = Game.state.lizards.find((x) => x.id === v.picks[1]);
      if (a && b) {
        go.disabled = false;
        go.textContent = `💕 この2匹で繁殖する (${fmt(Game.breedCost(a, b))}G)`;
        go.onclick = () => {
          if (Game.breed(a.id, b.id)) {
            v.picks = [];
            this.rebuildBreed();
          }
        };
      }
    }
  },

  // ---------------- 設備 (V4 §3.1: 通常/防衛の2タブ・統廃合済み10種) ----------------
  openFacilities() {
    if (!this.facTab) this.facTab = "norm";
    this.openModal("🏗 設備", (body) => this.buildFacilities(body));
  },

  buildFacilities(body) {
    body.innerHTML = `
      <div class="nest-tabs">
        <button data-ftab="norm" class="${this.facTab === "norm" ? "primary" : ""}">🏡 通常設備(育成・QoL)</button>
        <button data-ftab="def" class="${this.facTab === "def" ? "primary" : ""}">🛡 防衛設備(ボス対策)</button>
      </div>
      <div id="fac-list"></div>`;
    for (const btn of body.querySelectorAll("[data-ftab]")) {
      btn.addEventListener("click", () => { this.facTab = btn.dataset.ftab; this.buildFacilities(body); });
    }
    const list = body.querySelector("#fac-list");
    const rank = Game.state.rank;
    const stId = Game.currentStage().id;
    // V4.1: すみか(住居)のLvアップは設備タブへ(巣画面は閲覧専用のため)
    if (this.facTab === "norm") {
      const nl = Game.state.nest.lv;
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <span class="fic">🕳</span>
        <div class="grow"><b>すみか(巣穴)</b> <span class="lv">Lv${nl}/${CFG.nestLvMax}</span>
          <div class="desc">外出枠+1/Lv・卵スロット(Lv2/6で+1)・孵化-3%/Lv・カラス猶予+1秒/Lv</div></div>
        <button ${nl >= CFG.nestLvMax ? "disabled" : ""}>${nl >= CFG.nestLvMax ? "MAX" : "強化 " + fmt(Game.nestLvUpCost()) + "G"}</button>`;
      if (nl < CFG.nestLvMax) row.querySelector("button").addEventListener("click", () => {
        Game.nestLvUp();
        this.buildFacilities(body);
      });
      list.appendChild(row);
    }
    const sorted = FACILITIES
      .filter((f) => (f.tab || "norm") === this.facTab)
      .filter((f) => !(f.hideOn && f.hideOn.includes(stId)))
      .sort((a, b) => ((rank < a.unlock) - (rank < b.unlock)) || (a.unlock - b.unlock));
    for (const f of sorted) {
      const locked = rank < f.unlock;
      const lv = Game.facLv(f.id);
      const fmax = Game.facMax(f);
      const maxed = lv >= fmax;
      const cost = Game.facilityCost(f.id);
      const row = document.createElement("div");
      row.className = "list-row" + (locked ? " done" : "");
      if (locked) {
        row.innerHTML = `
          <span class="fic">🔒</span>
          <div class="grow"><b>${f.name}</b>
            <div class="desc">${f.desc}</div></div>
          <span class="lv">HQ Lv${f.unlock}で解放</span>`;
      } else {
        row.innerHTML = `
          <span class="fic">${f.icon}</span>
          <div class="grow"><b>${f.name}</b> <span class="lv">Lv${lv}/${fmax}${Game.state.forged && Game.state.forged[f.id] ? " ⛏️" : ""}</span>
            <div class="desc">${f.desc}</div></div>
          <button ${maxed ? "disabled" : ""}>${maxed ? "MAX" : "強化 " + fmt(cost) + "G"}</button>`;
        if (!maxed) row.querySelector("button").addEventListener("click", () => {
          Game.buyFacility(f.id);
          this.buildFacilities(body); // 再描画
        });
      }
      list.appendChild(row);
    }
    // シナジー示唆 (効果は自然に重なるだけ・専用ルールなし)
    const syn = document.createElement("div");
    let synHtml = `<h4 style="color:var(--gold);font-size:13px;margin:14px 0 8px">🔗 シナジーのヒント</h4>`;
    for (const sy of FACILITY_SYNERGIES) {
      const have = sy.ids.filter((id) => Game.facLv(id) > 0).length;
      const names = sy.ids.map((id) => facilityById(id).name).join("+");
      synHtml += `<div class="list-row" style="padding:7px 10px">
        <span class="fic" style="font-size:14px">${have === sy.ids.length ? "✅" : have + "/" + sy.ids.length}</span>
        <div class="grow"><b>${sy.name}</b><div class="desc">${names} — ${sy.desc}</div></div></div>`;
    }
    syn.innerHTML = synHtml;
    list.appendChild(syn);
  },

  // ---------------- V3: Stage切替(独立コロニー) ----------------
  openStages() {
    this.openModal("🌍 コロニー一覧 (各Stageは独立して生き続ける)", (body) => {
      body.innerHTML = "";
      const cur = Game.currentStage();
      for (const st of STAGES) {
        const unlocked = Game.state.rank >= st.rank;
        const data = Game.stageData(st.id);
        const row = document.createElement("div");
        row.className = "list-row" + (unlocked ? "" : " done");
        const pop = data ? data.lizards.length : 0;
        const badges = unlocked ? Game.stageBadges(st.id === cur.id ? Game.activeStageData() : data).join("") : "";
        const extra = [
          st.envText,
          data && data.pioneered ? `個体${pop}匹 / 撃退${(data.boss && data.boss.wins) || 0}回` : (unlocked ? "未開拓" : ""),
        ].filter(Boolean).join(" / ");
        if (unlocked) {
          const here = cur.id === st.id;
          const pioneered = data && data.pioneered;
          row.innerHTML = `
            <span class="fic" style="background:${st.ground};border-color:${st.accent}">${st.icon}</span>
            <div class="grow"><b>${st.name}</b> ${badges}
              <div class="desc">${extra}</div></div>
            ${here ? `<span class="lv">滞在中</span>` : `<button>${pioneered ? "移動" : "⛏ 開拓"}</button>`}`;
          if (!here) row.querySelector("button").addEventListener("click", () => this.confirmSwitch(st.id));
        } else {
          row.innerHTML = `
            <span class="fic">🔒</span>
            <div class="grow"><b>${st.name}</b>
              <div class="desc">${st.envText}</div></div>
            <span class="lv">R${st.rank}で解放</span>`;
        }
        body.appendChild(row);
      }
    });
  },

  // 切替(未開拓なら創始者の卵を選ぶ §9.4)
  confirmSwitch(stageId) {
    const data = Game.stageData(stageId);
    if (data && data.pioneered) {
      Game.selectStage(stageId);
      this.closeModal();
      return;
    }
    const st = stageById(stageId);
    const max = CFG.founderCount;
    this.founderPicks = [];
    this.openModal(`⛏ ${st.icon}「${st.name}」を開拓する`, (body) => this.buildPioneer(body, stageId));
  },

  buildPioneer(body, stageId) {
    const max = CFG.founderCount;
    const picks = this.founderPicks;
    const founders = Game.state.lizards.filter((lz) => Game.canFound(lz, stageId));
    body.innerHTML = `
      <p style="font-size:13px;color:var(--sub);margin-bottom:10px">
        新しい土地の開拓には本部Lv${Game.hqLevel()}の支援(コオロギ・資金・水場/シェルター無償)が付く。<br>
        <b style="color:var(--gold)">創始者の卵</b>: 今のコロニーから血統を最大${max}匹まで連れて行ける(繁殖できるよう2匹推奨。個体自体は移動しない)。</p>
      <div class="breed-filters" style="margin-bottom:10px">
        <button id="pioneer-go" class="primary">${picks.length ? `👑 ${picks.length}匹連れて開拓する` : "この2匹を選んで開拓"}</button>
        <button id="pioneer-skip">連れずに開拓</button>
      </div>
      <div class="breed-grid" id="founder-list" style="max-height:44vh"></div>`;
    body.querySelector("#pioneer-go").addEventListener("click", () => {
      Game.selectStage(stageId, picks.slice());
      this.closeModal();
    });
    body.querySelector("#pioneer-skip").addEventListener("click", () => {
      Game.selectStage(stageId, []);
      this.closeModal();
    });
    const list = body.querySelector("#founder-list");
    for (const lz of founders.slice(0, 60)) {
      const col = Render.lizardColor(lz);
      const sel = picks.includes(lz.id);
      const cell = document.createElement("div");
      cell.className = "breed-cell" + (sel ? " sel" : "");
      cell.innerHTML = `<span class="sw" style="background:${col.css}"></span>
        <div class="nm">${Game.lizardName(lz)}</div>
        <div class="mo">Lv${lz.level}${lz.founder ? " 👑" : ""}</div>`;
      cell.addEventListener("click", () => {
        const i = picks.indexOf(lz.id);
        if (i >= 0) picks.splice(i, 1);
        else if (picks.length < max) picks.push(lz.id);
        else this.toast(`連れて行けるのは${max}匹まで`, true);
        this.buildPioneer(this.els["modal-body"], stageId);
      });
      list.appendChild(cell);
    }
    if (!founders.length) list.innerHTML = `<p style="color:var(--sub);grid-column:1/-1">持ち込めるアダルトがいない(固有種は持ち出せない)</p>`;
  },

  // ---------------- V4 §4-1: 惑星マップ+宇宙船トランジション ----------------
  openMap() {
    this.openModal("🪐 惑星マップ — Planet Reptile", (body) => {
      const s = Game.state;
      const cur = Game.currentStage();
      const pos = {
        1: [7, 58], 2: [17, 26], 3: [27, 62], 4: [37, 24], 5: [47, 58],
        6: [57, 26], 7: [67, 60], 8: [77, 26], 9: [86, 60], 10: [93, 38],
      };
      let html = `<div id="planet-map">`;
      for (const st of STAGES) {
        const unlocked = s.rank >= st.rank;
        const data = st.id === cur.id ? Game.activeStageData() : Game.stageData(st.id);
        const inv = 0; // V4.1: 侵略リング廃止(侵食は全惑星共通)
        const pop = data ? data.lizards.length : 0;
        const badges = unlocked && data ? Game.stageBadges(data).join("") : "";
        const [x, y] = pos[st.id];
        const frontier = st.id === Game.frontierId();
        html += `
          <div class="planet-node ${unlocked ? "" : "locked"} ${st.id === cur.id ? "here" : ""}" data-planet="${st.id}"
            style="left:${x}%;top:${y}%">
            <div class="pn-ring" style="--inv:${inv}">
              <div class="pn-ball" style="background:radial-gradient(circle at 35% 30%, ${st.ground}, ${st.ground2})">${unlocked ? st.icon : "🔒"}</div>
            </div>
            <div class="pn-name">${unlocked ? st.pname : "HQ Lv" + st.rank}${frontier && unlocked ? " ⭐" : ""}</div>
            <div class="pn-sub">${unlocked ? (data && data.pioneered ? `🦎${pop} ${badges}` : "未開拓") : ""}</div>
          </div>`;
      }
      html += `</div>
        <div style="font-size:12px;color:var(--sub);margin-top:8px">
          ⭐=フロンティア(生産・報酬・XPボーナス) / 🪲侵食率は全惑星共通 ${Math.round(Game.state.erosion || 0)}% / タップで宇宙船が出発(クリックでスキップ)</div>`;
      body.innerHTML = html;
      for (const node of body.querySelectorAll(".planet-node")) {
        const id = +node.dataset.planet;
        if (Game.state.rank < stageById(id).rank || id === cur.id) continue;
        node.addEventListener("click", () => this.travelTo(id));
      }
    });
  },

  // 宇宙船トランジション(スキップ可)
  travelTo(id) {
    this.closeModal();
    const from = Game.currentStage();
    const to = stageById(id);
    let ov = document.getElementById("travel-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "travel-overlay";
      document.body.appendChild(ov);
    }
    ov.innerHTML = `
      <div class="tv-stars"></div>
      <div class="tv-from">${from.icon} ${from.pname}</div>
      <div class="tv-ship">🚀</div>
      <div class="tv-to">${to.icon} ${to.pname}</div>
      <div class="tv-skip">クリックでスキップ</div>`;
    ov.classList.add("show");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ov.classList.remove("show");
      this.confirmSwitch(id);
    };
    ov.onclick = finish;
    setTimeout(finish, 1400);
  },

  // ---------------- V3: Stage切替バー (§10.1) ----------------
  updateStageBar() {
    const bar = document.getElementById("stage-bar");
    const cur = Game.currentStage();
    let sig = "";
    const tabs = [];
    for (const st of STAGES) {
      const unlocked = Game.state.rank >= st.rank;
      const data = st.id === cur.id ? Game.activeStageData() : Game.stageData(st.id);
      const badges = unlocked && data ? Game.stageBadges(data).join("") : "";
      const pop = data ? data.lizards.length : 0;
      tabs.push({ st, unlocked, badges, pop });
      sig += `${st.id}:${unlocked}:${badges}:${pop}:${st.id === cur.id};`;
    }
    if (sig === this._stageBarSig) return;
    this._stageBarSig = sig;
    bar.innerHTML = "";
    // V4: 先頭は惑星マップボタン
    const mapBtn = document.createElement("button");
    mapBtn.className = "stage-tab map-tab";
    mapBtn.innerHTML = `<span class="si">🪐</span><span class="sn">マップ</span>`;
    mapBtn.addEventListener("click", () => this.openMap());
    bar.appendChild(mapBtn);
    for (const t of tabs) {
      const el = document.createElement("button");
      el.className = "stage-tab" + (t.st.id === cur.id ? " active" : "") + (t.unlocked ? "" : " locked");
      el.title = t.unlocked ? t.st.envText : `R${t.st.rank}で解放`;
      el.innerHTML = t.unlocked
        ? `<span class="si">${t.st.icon}</span><span class="sn">${PLANET_NAMES[t.st.id]}</span><span class="sp">${t.pop}</span><span class="sb">${t.badges}</span>`
        : `<span class="si">🔒</span><span class="sn">${t.st.name}</span><span class="sp">R${t.st.rank}</span>`;
      if (t.unlocked && t.st.id !== cur.id) el.addEventListener("click", () => this.travelTo(t.st.id));
      bar.appendChild(el);
    }
  },

  // ---------------- V4.1 §4: 巣ネットワーク(蜘蛛の巣状・閲覧専用) ----------------
  // 解放ボタンは存在しない。巣は繁殖の裏で勝手に育つ——眺めて、気づくためのUI。
  openNest() {
    Game.ensureNestWeb();
    const st = Game.currentStage();
    this.openModal(`🕸 巣ネットワーク — 全惑星共通(閲覧専用)`, (body) => this.buildNest(body));
    // 既読化(バッジ解除)
    Game.state.nestWeb.seen = Game.nestWebCounts().open;
  },

  buildNest(body) {
    const web = Game.state.nestWeb;
    const nodes = buildNestWeb();
    const counts = Game.nestWebCounts();
    // 次に開きそうなノード(進捗最大の未解放)
    let next = null, nextP = -1;
    for (const n of nodes) {
      if (n.id === "core" || web.nodes[n.id]) continue;
      const p = Game.nestProgress(n);
      if (p > nextP) { nextP = p; next = n; }
    }
    body.innerHTML = `
      <div class="nest-head">
        <span>解放済み <b>${counts.open}/${counts.total}</b>
          ${next ? ` / 次に開きそう: <b>${next.name}</b>(${Math.floor(nextP * 100)}%)` : ""}
          ${web.surprises ? ` / ✨先行解放 ${web.surprises}回` : ""}</span>
        <span style="font-size:11px;color:var(--sub)">操作は不要。繁殖を続ければ勝手に育つ</span>
      </div>
      <div id="nest-scroll"><div id="nest-web"></div></div>
      <div id="nest-tip" class="hidden"></div>`;
    const wrap = body.querySelector("#nest-web");
    const SIZE = 1100, C = SIZE / 2;
    const R_STEP = 95;
    // 糸(SVG): 各ノード→内側リングの最寄りノード
    let svg = `<svg width="${SIZE}" height="${SIZE}" style="position:absolute;inset:0;pointer-events:none">`;
    const posOf = (n) => n.id === "core"
      ? [C, C]
      : [C + Math.cos(n.angle) * (R_STEP * (n.ring + 1)), C + Math.sin(n.angle) * (R_STEP * (n.ring + 1))];
    for (const n of nodes) {
      if (n.id === "core") continue;
      const [x, y] = posOf(n);
      // 内側の最寄り
      const inner = nodes.filter((m) => (n.ring === 0 ? m.id === "core" : m.ring === n.ring - 1));
      let best = inner[0], bd = 1e9;
      for (const m of inner) {
        const [mx, my] = posOf(m);
        const d = (mx - x) ** 2 + (my - y) ** 2;
        if (d < bd) { bd = d; best = m; }
      }
      const [bx, by] = posOf(best);
      const lit = web.nodes[n.id] && (best.id === "core" || web.nodes[best.id]);
      svg += `<line x1="${bx}" y1="${by}" x2="${x}" y2="${y}" stroke="${lit ? "rgba(242,198,94,.55)" : "rgba(255,255,255,.08)"}" stroke-width="${lit ? 2 : 1}"/>`;
    }
    svg += `</svg>`;
    let html = svg;
    for (const n of nodes) {
      const [x, y] = posOf(n);
      const open = n.id === "core" || web.nodes[n.id];
      const p = open ? 1 : Game.nestProgress(n);
      const near = !open && p >= CFG.nestNearThreshold;
      const cls = n.id === "core" ? "core" : open ? "on" : near ? "near" : "off";
      html += `<div class="wnode ${cls}" data-node="${n.id}" style="left:${x}px;top:${y}px">
        <span>${n.id === "core" ? "🕸" : open ? (oreById(n.reward.ore).icon) : n.icon}</span></div>`;
    }
    wrap.innerHTML = html;
    // タップ=ツールチップのみ(§4.2)。解放操作は存在しない
    const tip = body.querySelector("#nest-tip");
    for (const el of wrap.querySelectorAll(".wnode")) {
      el.addEventListener("click", () => {
        const n = nodes.find((x) => x.id === el.dataset.node);
        if (!n || n.id === "core") { tip.classList.add("hidden"); return; }
        const open = web.nodes[n.id];
        const o = oreById(n.reward.ore);
        const condTxt = n.conds.map((c) => {
          const def = NEST_CONDS.find((d) => d.type === c.type);
          const cur = Math.floor(Game.nestMetric(c.type));
          return `${def.icon}${def.name} ${Math.min(cur, c.need)}/${c.need}${c.type === "dexRate" ? "%" : ""}`;
        }).join(" + ");
        tip.classList.remove("hidden");
        tip.innerHTML = `<b>${n.name}</b> ${open ? "✅解放済み" : ""}<br>
          条件: ${condTxt}<br>報酬: ${o.icon}${o.name}×${n.reward.n}
          ${open ? "" : `<br><span style="color:var(--sub)">いつもの繁殖を続ければ自然に開く</span>`}`;
      });
    }
    // 初期表示は中央へスクロール
    const sc = body.querySelector("#nest-scroll");
    requestAnimationFrame(() => {
      sc.scrollLeft = C - sc.clientWidth / 2;
      sc.scrollTop = C - sc.clientHeight / 2;
    });
    // ドラッグでパン
    let drag = null;
    sc.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; });
    sc.addEventListener("pointermove", (e) => {
      if (!drag) return;
      sc.scrollLeft = drag.l - (e.clientX - drag.x);
      sc.scrollTop = drag.t - (e.clientY - drag.y);
    });
    for (const ev of ["pointerup", "pointerleave"]) sc.addEventListener(ev, () => { drag = null; });
  },

  // ---------------- V4 §3.4: HQ(本部) — 全惑星共通の中枢 ----------------
  openHQ() {
    this.openModal("🏰 HQ(本部) — 惑星ネットワークの中枢", (body) => {
      const s = Game.state;
      const lvl = Game.hqLevel();
      const cur = Game.currentStage();
      const frontier = stageById(Game.frontierId());
      // V4.1: 侵食率(全惑星共通)・宇宙港・遺伝子解析
      const ero = Math.round(s.erosion || 0);
      const eroStage = Game.erosionStage();
      const rocket = Game.ensureRocket();
      const invHtml = `
        <div class="inv-row"><span>🪲 バガー侵食率</span>
          <div class="bar" style="flex:1"><div style="width:${ero}%;background:linear-gradient(90deg,#8a3a2a,#e05b41)"></div></div>
          <b>${ero}%</b></div>
        <div style="font-size:12px;color:${eroStage ? "var(--red)" : "var(--sub)"}">
          ${eroStage === 0 ? "無害な水準。毎日ログインすれば低く保てる" :
            eroStage === 1 ? "⚠ 影響発生中: 生産-5%・繁殖CD+15%・ボス強化。ログインやバガー撃破で下がる" :
            "⚠⚠ 侵食が濃い: 生産-10%・繁殖CD+30%。だが可逆——今日から取り戻せる"}</div>`;
      body.innerHTML = `
        <div class="prestige-box">
          <div class="p-class">HQ Lv${lvl}</div>
          <div class="p-score">全惑星恒久バフ: 生産+${(lvl * 0.2).toFixed(1)}% / 開拓支給の増額 / フロンティア: ${frontier.icon}${frontier.pname}</div>
          <div class="p-rank">HQは全惑星の成果で成長し、決してリセットされない</div>
          <button id="hq-lore" style="margin-top:8px">📖 惑星レプタイル物語(Lore)を読む</button>
        </div>

        <h4 class="hq-h">💱 資源管理 — Gold→資源変換(所持 ${fmt(s.coins)}G)</h4>
        <div class="breed-filters" style="flex-wrap:wrap">
          <button id="cv-food">🍖 食料+${CFG.convertBatch} (${fmt(CFG.goldToFoodRate * CFG.convertBatch)}G)</button>
          <button id="cv-energy">⚡ エネルギー+${CFG.convertBatch} (${fmt(CFG.goldToEnergyRate * CFG.convertBatch)}G)</button>
          <button id="cv-science">🔬 研究力+${CFG.convertBatch} (🧬${fmt(CFG.bioToScienceRate * CFG.convertBatch)})</button>
        </div>
        <div class="rowline" style="font-size:12px;color:var(--sub)">
          所持: 🧬${fmt(Game.res("bio"))} / 🍖${fmt(Game.res("food"))} / ⚡${fmt(Game.res("energy"))} / 🔬${fmt(Game.res("science"))}</div>

        <h4 class="hq-h">🏗 惑星開発 — ${cur.icon}${cur.pname}(Lv${s.devLv || 0}/${CFG.devMaxLv})</h4>
        <div class="list-row">
          <div class="grow"><b>開発度を上げる</b>
            <div class="desc">この惑星の生産+2%/Lv・エネルギー産出+。Goldの大きな使い道</div></div>
          <button id="hq-dev" ${(s.devLv || 0) >= CFG.devMaxLv ? "disabled" : ""}>${fmt(Game.devCost())}G</button>
        </div>

        <h4 class="hq-h">🪲 バガー侵食(全惑星共通・1日1回のログインが特効薬)</h4>
        <div id="hq-invasion">${invHtml}</div>

        <h4 class="hq-h">🚀 宇宙港 — ロケット建造(長期目標)</h4>
        <div class="list-row">
          <span class="fic">${rocket.done ? "🛰" : "🚀"}</span>
          <div class="grow"><b>${rocket.done ? "ロケット完成 — 星の海へ(全惑星の生産+10%)" : `建造 第${rocket.stage + 1}/${CFG.rocketStages.length}段階`}</b>
            <div class="desc">${rocket.done ? "トカゲ文明の新たな章がLoreに刻まれた" : `イリジウム ${rocket.invested}/${Game.rocketStageNeed()}(所持⚙️${fmt(Game.ore("iridium"))})`}</div>
            ${rocket.done ? "" : `<div class="bar"><div style="width:${(rocket.invested / Math.max(1, Game.rocketStageNeed()) * 100).toFixed(0)}%"></div></div>`}</div>
          ${rocket.done ? "" : `<button id="hq-rocket" ${Game.ore("iridium") < 1 ? "disabled" : ""}>⚙️×10投入</button>`}</div>

        <h4 class="hq-h">🧬 遺伝子ラボ(希少鉱石の出口)</h4>
        <div class="breed-filters" style="flex-wrap:wrap">
          <button id="hq-gene" ${Game.ore("amber") < CFG.geneAmberCost ? "disabled" : ""}>🟠琥珀${CFG.geneAmberCost}: 未発見遺伝子を解析</button>
          <button id="hq-meteor" ${Game.ore("meteorite") < 1 ? "disabled" : ""}>☄️隕石を割る(希少個体)</button>
          <button id="hq-amethyst" ${Game.ore("amethyst") < CFG.amethystLegendCost ? "disabled" : ""}>🔮${CFG.amethystLegendCost}: 始祖の卵</button>
        </div>
        <div class="rowline" style="font-size:12px;color:var(--sub)">
          鉱石: ${ORES.map((o) => `${o.icon}${fmt(Game.ore(o.id))}`).join(" ")} — 巣ネットワークが自動で運んでくる</div>

        <h4 class="hq-h">⛏️ チタン鍛造 — 設備を化けさせる(Lv上限+1 / チタン鉱${CFG.forgeTitaniumCost})</h4>
        <div class="breed-filters" style="flex-wrap:wrap" id="hq-forge"></div>

        <h4 class="hq-h">🔬 研究(恒久・全惑星適用) — 🔬${fmt(Game.res("science"))} / 所持${fmt(s.coins)}G</h4>
        <div id="research-list"></div>`;
      body.querySelector("#hq-lore").addEventListener("click", () => { this.dexTab = "lore"; this.openDex(); });
      body.querySelector("#cv-food").addEventListener("click", () => { Game.convertGold("food"); this.openHQ(); });
      body.querySelector("#cv-energy").addEventListener("click", () => { Game.convertGold("energy"); this.openHQ(); });
      body.querySelector("#cv-science").addEventListener("click", () => { Game.convertBio(); this.openHQ(); });
      body.querySelector("#hq-dev").addEventListener("click", () => { Game.buyDev(); this.openHQ(); });
      const rk = body.querySelector("#hq-rocket");
      if (rk) rk.addEventListener("click", () => { Game.investRocket(10); this.openHQ(); });
      const ge = body.querySelector("#hq-gene");
      if (ge) ge.addEventListener("click", () => { Game.geneAnalyze(); this.openHQ(); });
      const mt = body.querySelector("#hq-meteor");
      if (mt) mt.addEventListener("click", () => { Game.crackMeteorite(); this.openHQ(); });
      const am = body.querySelector("#hq-amethyst");
      if (am) am.addEventListener("click", () => { Game.amethystEgg(); this.openHQ(); });
      const forge = body.querySelector("#hq-forge");
      if (forge) {
        for (const f of FACILITIES) {
          const b = document.createElement("button");
          b.textContent = `${f.icon}${f.name}(上限${Game.facMax(f)})`;
          b.disabled = Game.ore("titaniumOre") < CFG.forgeTitaniumCost;
          b.addEventListener("click", () => { Game.forgeFacility(f.id); this.openHQ(); });
          forge.appendChild(b);
        }
      }
      const list = body.querySelector("#research-list");
      for (const r of RESEARCH) {
        const done = s.research[r.id];
        const locked = r.req && !s.research[r.req];
        const row = document.createElement("div");
        row.className = "list-row" + (done ? " done" : "");
        row.innerHTML = `
          <span class="fic">${done ? "✅" : locked ? "🔒" : "🔬"}</span>
          <div class="grow"><b>${r.name}</b><div class="desc">${r.desc}</div></div>
          ${done ? `<span class="lv">済</span>` : locked ? `<span style="color:var(--sub)">要:${researchById(r.req).name}</span>`
            : `<button>${r.cost.orichalcum ? `🔩${r.cost.orichalcum}` : `🔬${r.cost.science || 0}+${fmt(r.cost.coins || 0)}G`}</button>`}`;
        if (!done && !locked) row.querySelector("button").addEventListener("click", () => {
          Game.buyResearch(r.id);
          this.openHQ();
        });
        list.appendChild(row);
      }
    });
  },

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
