// =============================================================
// screens/main — メイン画面の常設ウィジェット(卵スロット/個体詳細パネル)
// UISkills.md §8: ui/screens/main相当。
// =============================================================

Object.assign(UI, {
  // ---------------- ボスHPバー(Brushup V2 §3.3: 映画的HUD・戦闘中のみ) ----------------
  initBossHud() {
    const center = document.getElementById("center");
    if (!center || document.getElementById("boss-hud")) return;
    const el = document.createElement("div");
    el.id = "boss-hud";
    el.className = "hidden";
    el.innerHTML = `
      <span class="bh-portrait" id="bh-portrait"></span>
      <div class="bh-mid">
        <div class="bh-name"><b id="bh-name"></b><span class="bh-tier hidden" id="bh-tier"></span><span class="bh-elite hidden" id="bh-elite">ELITE</span></div>
        <div class="bh-bar"><div class="bh-fill" id="bh-fill"></div></div>
        <div class="bh-nums"><span id="bh-hp"></span><span id="bh-time"></span></div>
      </div>`;
    center.appendChild(el);
  },

  updateBossHud() {
    const el = document.getElementById("boss-hud");
    if (!el) return;
    const r = Game.raid;
    if (!r) { el.classList.add("hidden"); this._hudTypeId = null; return; }
    el.classList.remove("hidden");
    el.classList.toggle("enraged", !!r.enraged);
    if (this._hudTypeId !== r.typeId) { // 襲撃ごとに1回だけ組み立て
      this._hudTypeId = r.typeId;
      document.getElementById("bh-portrait").innerHTML = Icon.svg(r.type.icon);
      document.getElementById("bh-name").textContent =
        r.typeId === "snake" ? r.snakeTier.name : r.type.name;
      const tier = document.getElementById("bh-tier");
      tier.classList.toggle("hidden", !r.tier);
      tier.textContent = r.tier ? "T" + r.tier : "";
      document.getElementById("bh-elite").classList.toggle("hidden", !r.elite);
    }
    const e = r.snake;
    document.getElementById("bh-fill").style.width = Math.max(0, e.hp / e.maxHp * 100) + "%";
    document.getElementById("bh-hp").textContent = `${fmt(Math.ceil(Math.max(0, e.hp)))} / ${fmt(e.maxHp)}`;
    document.getElementById("bh-time").textContent = e.arrived
      ? (r.stunT > 0 ? `足止め ${r.stunT.toFixed(1)}s` : `去るまで ${Math.ceil(Math.max(0, r.timeLeft))}s`)
      : "接近中…";
  },

  // ---------------- 卵スロット ----------------
  buildEggSlots() {
    const box = this.els["egg-slots"];
    if (!box) return; // V5 3.8: 卵スロットパネル撤廃時はno-op
    box.innerHTML = "";
    for (let i = 0; i < Game.eggSlotCap(); i++) {
      const div = document.createElement("div");
      div.className = "egg-slot";
      div.innerHTML = `<span class="ico"></span><span class="info"></span><span class="t"></span><button data-egg="${i}" class="hidden"><svg class="icon"><use href="#i-gem"/></svg>1</button>`;
      box.appendChild(div);
    }
  },

  updateEggSlots() {
    if (!this.els["egg-slots"]) return; // V5 3.8: 卵スロットパネル撤廃時はno-op
    // 孵化室でスロット数が変わったら作り直す
    if (this.els["egg-slots"].children.length !== Game.eggSlotCap()) this.buildEggSlots();
    const slots = this.els["egg-slots"].children;
    const genelab = Game.nestLv() >= CFG.nestOmenLv; // §8.12: すみか(巣)Lv3でレア予兆(旧・繁殖施設Lv3)
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i], egg = Game.state.eggs[i];
      const btn = el.querySelector("button");
      if (egg) {
        el.classList.add("filled");
        el.querySelector(".ico").innerHTML = Icon.svg("egg", egg.lucky ? "ic-lucky" : "");
        const sp = speciesById(egg.speciesId);
        // 遺伝解析室: レア予兆の表示(演出のみ)
        const omen = genelab && (egg.morphId !== "normal" || sp.stars >= 4) ? " " + Icon.svg("spark") : "";
        el.querySelector(".info").innerHTML = sp.name + "系" + omen; // SVG予兆を含むためinnerHTML
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
    const mo = morphById(lz.morphId); // 種の★(レア度表示)は撤廃=特性カードへ置換(内部数値=経済係数は残置・trait_system判断⑦(i))
    const col = Render.lizardColor(lz);
    const xpMax = lz.stage === "baby" ? CFG.babyXpToAdult : CFG.adultXpPerLevel;
    // S5-a: この個体に創世できる新特性(未所持・上限3未満・非レジェンダリー)。最安コストで活性判定。
    const createable = Game.createableTraits(lz);
    const genesisMinCost = createable.length ? Math.min(...createable.map((k) => Game.stoneGenesisCost(TRAITS[k].tier))) : 0;
    // S5-b: 固定化できる特性(クリア後解禁・この個体が持つ未固定の特性)。
    const fixable = Game.fixUnlocked() ? Game.fixableTraits(lz) : [];
    const fixMinCost = fixable.length ? Math.min(...fixable.map((k) => Game.stoneFixCost(TRAITS[k].tier))) : 0;
    el.innerHTML = `
      <h4><span class="sw" style="display:inline-block;width:20px;height:12px;border-radius:6px;background:${col.css};border:1px solid #0006"></span>
        ${Game.lizardName(lz)}</h4>
      ${mo.legendary
        ? `<div class="legendary-tag">✦ レジェンダリー</div>`
        : this.traitCardsHtml(lz)}
      <div class="stat"><span>${lz.stage === "baby" ? "ベビー" : "アダルト Lv" + lz.level}</span>
        <span>XP ${Math.floor(lz.xp)}/${xpMax}</span></div>
      <div class="bar"><div style="width:${clamp(lz.xp / xpMax * 100, 0, 100)}%"></div></div>
      <div class="stat"><span>攻撃力</span><b>${Game.lizardAtk(lz).toFixed(1)}</b></div>
      <div class="stat"><span>生産/秒</span><b>${Game.lizardIncome(lz).toFixed(2)}G</b></div>
      ${lz.injuredT > 0 ? `<div class="injured">負傷中 (あと${Math.ceil(lz.injuredT)}秒)</div>` : ""}
      ${lz.breedCd > 0 ? `<div style="color:var(--sub)">${Icon.svg("breed")} 繁殖まで ${Math.ceil(lz.breedCd)}秒</div>` : ""}
      ${lz.founder ? `<div style="color:var(--gold)">${Icon.svg("crown")} 創始者 — 旧コロニーの血統</div>` : ""}
            <div class="btns">
        <button data-act="feed">${Icon.svg("cricket")} 餌やり</button>
        ${Game.canBreed(lz) ? `<button data-act="breed" class="cta">${Icon.svg("breed")} 繁殖相手を選ぶ</button>` : ""}
        ${lz.injuredT > 0 ? `<button data-act="heal">${Icon.svg("gem")}1 回復</button>` : ""}
        ${Game.stageSpecificSpecies().length && Game.res("bio") >= CFG.mutateBioCost && speciesById(lz.speciesId).stage !== Game.currentStage().id
          ? `<button data-act="mutate">${Icon.svg("bio")} 変異(${CFG.mutateBioCost})</button>` : ""}
        ${createable.length ? `<button data-act="genesis"${Game.stones() < genesisMinCost ? " disabled" : ""}>${Icon.svg("stone")} 石で創世</button>` : ""}
        ${fixable.length ? `<button data-act="fix"${Game.stones() < fixMinCost ? " disabled" : ""}>${Icon.svg("stone")} 石で固定</button>` : ""}
        <button data-act="close">閉じる</button>
      </div>`;
  },

  // S3③: 繁殖ピッカーの特性チップ(表示のみ・読み取り専用)。相手選択の時点で特性の有無と固定印が見える=2枚持ち=合成への道筋。
  //   仕様: チップ=特性カードの縮小流用(ロゴ+名・最大2枚)/固定印=賢者の石の系譜(fix-seal・深紅・小さく静かに)/
  //   確率・%は一切出さない/特性なし=空欄の領域を保持(行高を揃える)/レジェンダリー=領域ごと不在(横並びの外の別格)。
  breedTraitChips(o) {
    if (o.morphId === "legendary") return ""; // 領域ごと不在
    const ks = (o.traits || []).map((t) => (t && t.key ? t.key : t)).filter((k) => typeof TRAITS !== "undefined" && TRAITS[k]).slice(0, 2);
    const chips = ks.map((k) => {
      const d = TRAITS[k];
      return `<span class="tchip" style="--tc:${d.rim || d.color}">${Icon.svg(d.icon)}<span>${d.name}</span>${Game.isFixed(o, k) ? Icon.svg("fix-seal", "tc-seal") : ""}</span>`;
    }).join("");
    return `<span class="tchips">${chips}</span>`;
  },

  // S3: 個体の特性を「特性カード」で表示(UISkills §12)。各特性=色アクセント＋SVGロゴ＋名＋固定印。無印は控えめに「特性なし」。
  traitCardsHtml(lz) {
    const ks = (lz.traits || []).map((t) => (t && t.key ? t.key : t)).filter((k) => typeof TRAITS !== "undefined" && TRAITS[k]);
    if (!ks.length) return `<div class="trait-empty">特性なし</div>`;
    const cards = ks.map((k) => {
      const d = TRAITS[k], tc = d.rim || d.color || "#7c93d4";
      return `<span class="trait-card" style="--tc:${tc}">`
        + `<span class="tc-ico">${Icon.svg(d.icon || "unknown")}</span>`
        + `<span class="tc-name">${d.name}</span>`
        + (Game.isFixed(lz, k) ? `<span class="tc-fixed" title="固定 — 必ず子へ継がれる">${Icon.svg("lock")}</span>` : "")
        + `</span>`;
    }).join("");
    return `<div class="trait-cards">${cards}</div>`;
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
      case "breed": this.openBreedPicker(lz); return; // 3.11.4: 相手選択ウィンドウへ
      case "genesis": this.openGenesisPicker(lz); return; // S5-a: 賢者の石で特性を創世
      case "fix": this.openFixPicker(lz); return; // S5-b: 賢者の石で遺伝を固定
      case "close": Game.selectedId = null; break;
    }
    this.renderDetail(true);
  },

  // S5-a: 賢者の石=特性の創世。この世界になかった個性を石で1つ生む(繁殖では出ない=石だけの入口)。
  openGenesisPicker(lz) {
    this.openModal(`${Icon.svg("stone")} 創世 — ${Game.lizardName(lz)} に新たな個性を宿す`, (body) => {
      const keys = Game.createableTraits(lz);
      if (!keys.length) {
        body.innerHTML = `<p style="color:var(--sub)">この個体にはこれ以上 特性を宿せません(上限3・レジェンダリーは対象外)。</p>`;
        return;
      }
      body.innerHTML = `<p style="font-size:calc(12px * var(--fs-scale,1));color:var(--sub);margin-bottom:8px">賢者の石を代償に、血統に無い新特性を1つ創世します(繁殖では生まれない)。所持 ${Icon.svg("stone")}<b>${Game.stones()}</b>。</p>`;
      for (const k of keys) {
        const def = TRAITS[k], cost = Game.stoneGenesisCost(def.tier), afford = Game.stones() >= cost;
        const row = document.createElement("div");
        row.className = "list-row";
        row.innerHTML =
          `<span class="sw" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${def.color};border:1px solid #0006"></span>` +
          `<div class="grow"><b>${def.name}</b><div class="desc">${def.desc || ""}</div></div>` +
          `<button${afford ? "" : " disabled"}>${Icon.svg("stone")}${cost}</button>`;
        row.querySelector("button").addEventListener("click", () => {
          if (Game.genesisTrait(lz, k)) { UI.toast(`${def.name} が宿った — この世界に新たな個性が生まれた`); this.closeModal(); this.renderDetail(true); }
          else this.openGenesisPicker(lz); // 失敗時は再描画(状態更新)
        });
        body.appendChild(row);
      }
    });
  },

  // S5-b: 賢者の石で遺伝を固定(p→1.0)。クリア後の天井=努力が必ず報われる救済。両親に固定で2枚持ち確定。
  openFixPicker(lz) {
    this.openModal(`${Icon.svg("stone")} 固定 — ${Game.lizardName(lz)} の特性を必ず継がせる`, (body) => {
      const keys = Game.fixableTraits(lz);
      if (!keys.length) {
        body.innerHTML = `<p style="color:var(--sub)">固定できる特性がありません(この個体が持つ未固定の特性が必要)。</p>`;
        return;
      }
      body.innerHTML = `<p style="font-size:calc(12px * var(--fs-scale,1));color:var(--sub);margin-bottom:8px">石を代償に、この特性を子へ<b>必ず</b>継がせます(遺伝確率→100%)。両親で固定すれば2つ揃った子が確定。所持 ${Icon.svg("stone")}<b>${Game.stones()}</b>。</p>`;
      for (const k of keys) {
        const def = TRAITS[k], cost = Game.stoneFixCost(def.tier), afford = Game.stones() >= cost;
        const row = document.createElement("div");
        row.className = "list-row";
        row.innerHTML =
          `<span class="sw" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${def.color};border:1px solid #0006"></span>` +
          `<div class="grow"><b>${def.name}</b><div class="desc">${def.desc || ""}</div></div>` +
          `<button${afford ? "" : " disabled"}>${Icon.svg("stone")}${cost}</button>`;
        row.querySelector("button").addEventListener("click", () => {
          if (Game.fixTrait(lz, k)) { UI.toast(`${def.name} を固定した — この血を継ぐ子へ必ず渡る`); this.closeModal(); this.renderDetail(true); }
          else this.openFixPicker(lz);
        });
        body.appendChild(row);
      }
    });
  },

  // 3.11.4: トカゲクリック→この個体を親に、相手を選んで繁殖(ルーレットと併存する繁殖経路)
  // trait_system.md の将来の特性表示を載せられるよう、相手を行リストで見せる構造(今は先回りしない=YAGNI)
  openBreedPicker(lz) {
    this.openModal(`${Icon.svg("breed")} 繁殖 — ${Game.lizardName(lz)} の相手を選ぶ`, (body) => {
      const mates = Game.state.lizards.filter((o) => o.id !== lz.id && Game.canBreed(o));
      if (!mates.length) {
        body.innerHTML = `<p style="color:var(--sub)">繁殖できる相手がいません(アダルト・非負傷・クールダウン外・在槽の個体が必要)。</p>`;
        return;
      }
      body.innerHTML = `<p style="font-size:calc(12px * var(--fs-scale,1));color:var(--sub);margin-bottom:8px">相手を選ぶと卵が生まれます(コスト ${Icon.svg("coin")}は種のレア度で変動)。</p>`;
      for (const o of mates) {
        const mo = morphById(o.morphId), col = Render.lizardColor(o); // ★レア度表記は撤去(判断⑦(i)を表示層全体へ・内部数値非接触)
        const cost = Game.breedCost(lz, o);
        const row = document.createElement("div");
        row.className = "list-row breed-cand";
        const isLeg = mo.legendary; // 仕上げ2: レジェンダリー名=虹の系譜(走査性を壊さない微細装飾・案A既定/案Bはstyle.cssに併存=Ric選択後に一本化)
        row.innerHTML =
          `<span class="sw" style="display:inline-block;width:18px;height:12px;border-radius:6px;background:${col.css};border:1px solid #0006"></span>` +
          `<div class="grow"><b class="${isLeg ? "leg-name leg-name--a" : ""}">${Game.lizardName(o)}</b><div class="desc">${mo.name} / Lv${o.level || 1}</div></div>` +
          this.breedTraitChips(o) +
          `<button ${Game.state.coins < cost ? "disabled" : ""}>${Icon.svg("coin")}${fmt(cost)}</button>`;
        row.querySelector("button").addEventListener("click", () => {
          if (Game.breed(lz.id, o.id)) { this.closeModal(); }
          else this.openBreedPicker(lz); // 失敗時は再描画(状態更新)
        });
        body.appendChild(row);
      }
    });
  },
});
