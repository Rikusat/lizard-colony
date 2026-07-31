// =============================================================
// screens/planet-map — 惑星マップ/移住確認/開拓/宇宙船トランジション/ステージバー
// UISkills.md §8: ui/screens/planetMap相当。
// =============================================================

Object.assign(UI, {
  // ---------------- V3: Stage切替(独立コロニー) ----------------
  openStages() {
    this.openModal(`${Icon.svg("planet")} コロニー一覧 (各Stageは独立して生き続ける)`, (body) => {
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
            <span class="fic" style="background:${st.ground};border-color:${st.accent}">${Icon.svg(st.icon)}</span>
            <div class="grow"><b>${st.name}</b> ${badges}
              <div class="desc">${extra}</div></div>
            ${here ? `<span class="lv">滞在中</span>` : `<button>${pioneered ? "移動" : Icon.svg("build") + " 開拓"}</button>`}`;
          if (!here) row.querySelector("button").addEventListener("click", () => this.confirmSwitch(st.id));
        } else {
          row.innerHTML = `
            <span class="fic">${Icon.svg("lock")}</span>
            <div class="grow"><b>${st.name}</b>
              <div class="desc">${st.envText}</div></div>
            <span class="lv">R${st.rank}で解放</span>`;
        }
        body.appendChild(row);
      }
    });
  },

  // 切替(未開拓は「開拓する」確認のみ)。Phase4純血: 引き連れ(創始者)は撤廃済=各星は固有2種のみが根付く(生態系を守る)
  confirmSwitch(stageId) {
    const data = Game.stageData(stageId);
    if (data && data.pioneered) {
      Game.selectStage(stageId);
      this.closeModal();
      return;
    }
    const st = stageById(stageId);
    this.openModal(`${Icon.svg("build")} ${Icon.svg(st.icon)}「${st.name}」を開拓する`, (body) => this.buildPioneer(body, stageId));
  },

  // Phase4純血: 引き連れ選択は撤廃。開拓すると その星の固有2種の純血ペアが根付く(selectStageはfounders不使用)
  buildPioneer(body, stageId) {
    const st = stageById(stageId);
    const endemic = Game.endemicSpecies(stageId).map((id) => (speciesById(id) || {}).name || id);
    body.innerHTML = `
      <p style="font-size:calc(13px * var(--fs-scale, 1));color:var(--sub);margin-bottom:12px">
        新しい土地の開拓には本部Lv${Game.hqLevel()}の支援(コオロギ・資金・水場無償)が付く。<br>
        この星には <b style="color:var(--gold)">${st.name}固有の2種</b>(${endemic.join("・")})の純血ペアが根付く。
        <span style="color:var(--sub)">※ 各星の生態系を守るため、他の星から個体を引き連れることはできません。</span></p>
      <div class="breed-filters">
        <button id="pioneer-go" class="primary">${Icon.svg("build")} 開拓する</button>
      </div>`;
    body.querySelector("#pioneer-go").addEventListener("click", () => {
      Game.selectStage(stageId); // 引き連れなし(§Phase4純血): 固有種の純血ペアのみ
      this.closeModal();
    });
  },

  // ---------------- V4 §4-1: 惑星マップ+宇宙船トランジション ----------------
  openMap() {
    if (Game.raid) { this.toast("ボス襲来中は惑星を移動できない! 討伐してから", true); return; } // 3.11.3
    this.openModal(`${Icon.svg("planet")} 惑星マップ — Planet Reptile`, (body) => {
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
          <div class="planet-node ${unlocked ? "" : "locked"} ${st.id === cur.id ? "here" : ""} ${frontier && unlocked ? "frontier" : ""}" data-planet="${st.id}"
            style="left:${x}%;top:${y}%">
            <div class="pn-ring" style="--pa:${UI.planetAccent(st.id)}">
              <div class="pn-ball" style="background:radial-gradient(circle at 35% 30%, ${st.ground}, ${st.ground2})">${Icon.svg(unlocked ? st.icon : "lock")}</div>
            </div>
            <div class="pn-name">${unlocked ? st.pname : "HQ Lv" + st.rank}${frontier && unlocked ? " " + Icon.svg("star") : ""}</div>
            <div class="pn-sub">${unlocked ? (data && data.pioneered ? `${Icon.svg("lizard")}${pop} ${badges}` : "未開拓") : ""}</div>
          </div>`;
      }
      const ero = Math.round(Game.state.erosion || 0);
      html += `</div>
        <div class="map-legend">
          <span>${Icon.svg("star")} フロンティア(生産・報酬・XPボーナス)</span>
          <span>◎ 現在地</span>
          <span class="map-ero">${Icon.svg("erosion")} 侵食率(全惑星共通)
            <span class="bar"><span style="width:${ero}%"></span></span> <b>${ero}%</b></span>
          <span style="color:var(--sub)">タップで宇宙船が出発(航行には時間がかかる)</span>
        </div>`;
      body.innerHTML = html;
      for (const node of body.querySelectorAll(".planet-node")) {
        const id = +node.dataset.planet;
        if (Game.state.rank < stageById(id).rank || id === cur.id) continue;
        node.addEventListener("click", () => this.travelTo(id));
      }
    });
  },

  // ---------------- C2改訂 フェーズ1: 惑星移動 HUDトランジション ----------------
  // 共通様式=Holo.beam(走査ビーム)。惑星移動は頻発するため摩擦にしない: 尺≦CFG.holoTravelMaxSec /
  //   スキップ即時(クリック・タップ・キー) / 初訪は情報表示あり・既訪は短縮 / CFGで完全OFF。
  // 惑星切替の既存処理(confirmSwitch→selectStage→reset群)の**順序は不変**: 従来どおり演出の完了後に呼ぶ。
  // 本編の時間経過・生産はトランジション中も進む(UI.loopは走り続ける)。§判断はHANDOFF参照。
  travelTo(id) {
    this.closeModal();
    if (typeof CFG === "undefined" || CFG.holoTravelOn === false || typeof Holo === "undefined") return this.travelToLegacy(id);
    const info = Holo.travelInfo(id);
    if (!info) return this.travelToLegacy(id);
    const from = Game.currentStage();
    const full = Holo.travelFull(Game.stageData(id));
    const reduced = !!(typeof Motion !== "undefined" && Motion.reduced);
    const dur = Holo.travelDur(full, reduced);

    const stage = Holo.mount("holo-travel");
    if (!stage) return this.travelToLegacy(id);
    const ov = stage.ov, cv = stage.cv;
    Holo.play(cv, {
      total: dur, reduced: reduced, reducedHoldSec: reduced ? dur : 0,
      draw: (c, w, h, t) => Holo.drawTravel(c, w, h, t, info, { dur: dur, full: full, from: from.pname }),
      onEnd: () => { ov.classList.remove("show"); this.confirmSwitch(id); },
    });
  },

  // ⑥ 宇宙船トランジション(スキップ不可=待ち時間で惑星間の距離を想像させる。長さはCFG.planetTravelSec)
  //    CFG.holoTravelOn=false のときの復帰先として残す(可逆性の担保)。
  travelToLegacy(id) {
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
      <div class="tv-from">${Icon.svg(from.icon)} ${from.pname}</div>
      <div class="tv-ship">${Icon.svg("rocket")}</div>
      <div class="tv-to" style="color:${this.planetAccent(to.id)}">${Icon.svg(to.icon)} ${to.pname}</div>
      <div class="tv-skip">航行中… 惑星は遠い</div>`;
    ov.classList.add("show");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ov.classList.remove("show");
      this.confirmSwitch(id);
    };
    // ⑥ スキップ撤廃(ov.onclick を設けない)。待ち時間そのものが宇宙の広さの表現。長さはCFG化。
    setTimeout(finish, (Motion.reduced ? (CFG.planetTravelReducedSec || 1.2) : (CFG.planetTravelSec || 3.0)) * 1000);
  },

  // ---------------- V3: Stage切替バー (§10.1) ----------------
  updateStageBar() {
    const bar = document.getElementById("stage-bar");
    if (!bar) return; // 3.10.2: 惑星バー撤廃(マップボタンへ集約)。要素が無ければ何もしない
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
    mapBtn.innerHTML = `<span class="si">${Icon.svg("planet")}</span><span class="sn">マップ</span>`;
    mapBtn.addEventListener("click", () => this.openMap());
    bar.appendChild(mapBtn);
    for (const t of tabs) {
      const el = document.createElement("button");
      el.className = "stage-tab" + (t.st.id === cur.id ? " active" : "") + (t.unlocked ? "" : " locked");
      el.title = t.unlocked ? `${t.st.pname} — ${t.st.envText}` : `${t.st.name}: R${t.st.rank}で解放`;
      el.innerHTML = t.unlocked
        ? `<span class="si">${Icon.svg(t.st.icon)}</span><span class="sn">${PLANET_NAMES[t.st.id]}</span><span class="sp">${t.pop}</span><span class="sb">${t.badges}</span>`
        : `<span class="si">${Icon.svg("lock")}</span><span class="sn">${t.st.name}</span><span class="sp">R${t.st.rank}</span>`;
      if (t.unlocked && t.st.id !== cur.id) el.addEventListener("click", () => this.travelTo(t.st.id));
      bar.appendChild(el);
    }
  },
});
