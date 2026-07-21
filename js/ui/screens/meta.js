// =============================================================
// screens/meta — 小型モーダル群(味方/称号/統計/共有/商人/ミッション/設定)
// UISkills.md §8: ui/screens相当(1画面=小規模のため束ねる)。
// =============================================================

Object.assign(UI, {
  // ---------------- 味方 (GameExpansion_v2 ⑩) ----------------
  openAllies() {
    this.openModal(`${Icon.svg("paw")} 味方 (繁殖不可の特別な仲間)`, (body) => {
      body.innerHTML = `<p style="font-size:calc(13px * var(--fs-scale, 1));color:var(--sub);margin-bottom:10px">
        惑星ごとの固有の仲間。その惑星に居ると自動で加わり、生態データでLvアップ。
        所持${Icon.svg("bio")}生態データ: <b style="color:var(--gold)">${fmt(Game.res("bio"))}</b></p>`;
      for (const a of PLANET_ALLIES) {
        const owned = Game.state.allies[a.id];
        const planetName = (STAGES.find((s) => s.id === a.planet) || {}).name || `惑星${a.planet}`;
        const row = document.createElement("div");
        row.className = "list-row" + (owned ? "" : " done");
        if (owned) {
          const maxed = owned.lv >= CFG.allyMaxLv;
          const cost = Game.allyLvUpCost(a.id);
          row.innerHTML = `
            <span class="fic">${Icon.svg(a.icon)}</span>
            <div class="grow"><b>${a.name}</b> <span class="lv">Lv${owned.lv}/${CFG.allyMaxLv}</span>
              <div class="desc">${planetName}の仲間 — ${a.desc}</div></div>
            <button ${maxed || Game.res("bio") < cost ? "disabled" : ""}>${maxed ? "MAX" : `強化 ${Icon.svg("bio")}` + cost}</button>`;
          if (!maxed) row.querySelector("button").addEventListener("click", () => {
            Game.allyLvUp(a.id);
            this.openAllies();
          });
        } else {
          row.innerHTML = `
            <span class="fic">${Icon.svg("unknown")}</span>
            <div class="grow"><b>${a.name}</b>
              <div class="desc">入手条件: ${planetName}に移住すると加わる</div></div>
            <span style="color:var(--sub)">未加入</span>`;
        }
        body.appendChild(row);
      }
    });
  },

  // ---------------- 称号 (⑨-1) ----------------
  openTitles() {
    this.openModal(`${Icon.svg("medal")} 称号`, (body) => {
      body.innerHTML = `<p style="font-size:calc(13px * var(--fs-scale, 1));color:var(--sub);margin-bottom:10px">
        条件を達成すると自動で獲得。好きな称号をコロニーに掲げよう。</p>`;
      for (const t of TITLES) {
        const owned = Game.state.titles[t.id];
        const selected = Game.state.titleSel === t.id;
        const row = document.createElement("div");
        row.className = "list-row" + (owned ? "" : " done");
        row.innerHTML = `
          <span class="fic">${Icon.svg(owned ? "medal" : "lock")}</span>
          <div class="grow"><b>${owned ? t.name : "???"}</b>
            <div class="desc">${t.hint}</div></div>
          ${owned ? (selected ? `<span class="lv">掲示中</span>` : `<button>掲げる</button>`) : ""}`;
        if (owned && !selected) row.querySelector("button").addEventListener("click", () => {
          Game.state.titleSel = t.id;
          this.toast(`${Icon.svg("medal")} 称号「${t.name}」を掲げた!`);
          this.openTitles();
        });
        body.appendChild(row);
      }
    });
  },

  // ---------------- 統計ダッシュボード (⑨-4/20/23/25) ----------------
  openStats() {
    Game._badgeStats = false; // §9-C4 開いたら新着ドットを消す
    this.openModal(`${Icon.svg("stats")} 統計ダッシュボード`, (body) => {
      const s = Game.state;
      const p = Game.prestige();
      const pc = Game.prestigeClass();
      const rows = [
        [`${Icon.svg("crown")} コロニーランク`, s.rank],
        [`${Icon.svg("lizard")} 現在のトカゲ数`, `${s.lizards.length} / ${Game.capacity()}`],
        [`${Icon.svg("egg")} 累計孵化数`, s.stats.hatched],
        [`${Icon.svg("breed")} 累計繁殖回数`, s.stats.bred],
        [`${Icon.svg("feed")} 累計餌やり回数`, fmt(s.stats.fed)],
        [`${Icon.svg("shield")} 撃退数`, s.stats.raidsWon],
        [`${Icon.svg("crown")} ボス撃破数`, s.stats.bossWon],
        [`${Icon.svg("coin")} 売却数`, s.stats.sold],
        [`${Icon.svg("dex")} 図鑑コンプ率`, (Game.dexRate() * 100).toFixed(1) + "%"],
        [`${Icon.svg("medal")} 獲得称号`, `${Object.keys(s.titles).length} / ${TITLES.length}`],
        [`${Icon.svg("calendar")} 連続ログイン`, s.daily.streak + "日"],
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
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button id="btn-titles" style="flex:1;min-width:150px">${Icon.svg("medal")} 称号を変更</button>
          <button id="btn-export" style="flex:1;min-width:150px">${Icon.svg("camera")} 全景を画像で保存</button>
        </div>`;
      body.querySelector("#btn-export").addEventListener("click", () => this.exportShot());
      body.querySelector("#btn-titles").addEventListener("click", () => this.openTitles()); // 3.10.3: 称号は統計へ集約
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
    ctx.fillText("トカゲコロニー", 24, 44);
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
    this.toast(`${Icon.svg("camera")} コロニー全景を保存した!`);
  },

  // V5.2 Phase3.10: 放浪商人は撤廃(3.10.1)

  // ---------------- ミッション ----------------
  openMissions() {
    this.openModal(`${Icon.svg("mission")} ミッション`, (body) => {
      body.innerHTML = "";
      for (const m of MISSIONS) {
        const claimed = Game.state.missionsClaimed[m.id];
        const done = m.check(Game.state);
        const row = document.createElement("div");
        row.className = "list-row" + (claimed ? " done" : "");
        const rewardTxt = [
          m.reward.gems ? `${Icon.svg("gem")}${m.reward.gems}` : "",
          m.reward.coins ? `${fmt(m.reward.coins)}G` : "",
        ].filter(Boolean).join(" ");
        row.innerHTML = `
          <span style="font-size:calc(20px * var(--fs-scale, 1))">${Icon.svg(claimed ? "check" : done ? "gift" : "mission")}</span>
          <div class="grow"><b>${m.name}</b><div class="desc">報酬: ${rewardTxt}</div></div>
          ${claimed ? `<span class="lv">達成済</span>` : done ? `<button>受取</button>` : `<span style="color:var(--sub)">未達成</span>`}`;
        if (!claimed && done) row.querySelector("button").addEventListener("click", (e) => {
          Game.state.missionsClaimed[m.id] = true;
          if (m.reward.gems) Game.state.gems += m.reward.gems;
          if (m.reward.coins) Game.state.coins += m.reward.coins;
          Motion.burstAt(e.currentTarget); // 報酬バースト(§4.3: 取得の瞬間だけ)
          this.toast(`${Icon.svg("gift")} ミッション達成! ${m.name} → ${rewardTxt}`);
          this.openMissions();
        });
        body.appendChild(row);
      }
    });
  },

  // ---------------- 設定 ----------------
  openSettings() {
    this.openModal(`${Icon.svg("settings")} 設定`, (body) => {
      body.innerHTML = `
        <div class="list-row"><div class="grow"><b>セーブ</b><div class="desc">10秒ごとに自動保存されます</div></div>
          <button id="set-save">今すぐ保存</button></div>
        <div class="list-row"><div class="grow"><b>惑星味方 移行前のバックアップから復元</b><div class="desc">Phase6 惑星固有味方への旧味方Lv移送(v14)前のセーブへ巻き戻す(旧味方のLvデータが移送前の状態に戻る)</div></div>
          <button id="set-rollbackV14">復元</button></div>
        <div class="list-row"><div class="grow"><b>餌場・繁殖施設 撤廃前のバックアップから復元</b><div class="desc">餌場/繁殖の巣への統合(v13)前のセーブへ巻き戻す(両施設と投資Lvが戻り、払い戻しGoldは無くなる)</div></div>
          <button id="set-rollbackV13">復元</button></div>
        <div class="list-row"><div class="grow"><b>シェルター撤廃前のバックアップから復元</b><div class="desc">シェルター撤廃(v12)前のセーブへ巻き戻す(シェルターと投資Lvが戻り、払い戻しGoldは無くなる)</div></div>
          <button id="set-rollbackV12">復元</button></div>
        <div class="list-row"><div class="grow"><b>純血化(追補)前のバックアップから復元</b><div class="desc">混入していた他惑星種の再掃除(v10)前のセーブへ巻き戻す</div></div>
          <button id="set-rollbackV10">復元</button></div>
        <div class="list-row"><div class="grow"><b>純血化(Phase4)前のバックアップから復元</b><div class="desc">純血化で消えた他惑星種を含む、移行前のセーブへ巻き戻す</div></div>
          <button id="set-rollbackV9">復元</button></div>
        <div class="list-row"><div class="grow"><b>V4.1移行前のバックアップから復元</b><div class="desc">Idle Nest(V4.1)移行前のセーブへ巻き戻す</div></div>
          <button id="set-rollback41">復元</button></div>
        <div class="list-row"><div class="grow"><b>V4移行前のバックアップから復元</b><div class="desc">Planet Reptile(V4)移行前のセーブへ巻き戻す</div></div>
          <button id="set-rollback">復元</button></div>
        <div class="list-row"><div class="grow"><b>データ初期化</b><div class="desc">すべての進行状況を削除して最初から</div></div>
          <button id="set-reset" class="danger">初期化</button></div>
        <div style="font-size:calc(12px * var(--fs-scale, 1));color:var(--sub);line-height:1.7;margin-top:10px">
          <b style="color:var(--gold)">${Icon.svg("lizard")} 遊び方</b><br>
          1. コオロギを買ってトカゲに餌やり → 成長・レベルアップ<br>
          2. アダルト2匹で繁殖 → 卵が孵化してコロニー拡大<br>
          3. 定期的に蛇が襲来! トカゲたちが自動で戦う<br>
          4. 撃退報酬で設備を強化し、図鑑コンプリートを目指そう!
        </div>`;
      body.querySelector("#set-save").addEventListener("click", () => {
        Game.save(); this.toast(`${Icon.svg("save")} セーブしました`);
      });
      body.querySelector("#set-rollbackV14").addEventListener("click", () => {
        if (confirm("惑星味方への移行前のバックアップへ巻き戻しますか? 旧味方(カメ/ヤモリ等)のLvデータが移送前の状態に戻ります。")) Game.restoreV14Backup();
      });
      body.querySelector("#set-rollbackV13").addEventListener("click", () => {
        if (confirm("餌場・繁殖施設 撤廃前のバックアップへ巻き戻しますか? 両施設と投資Lvが戻り、払い戻しGoldは無くなります。")) Game.restoreV13Backup();
      });
      body.querySelector("#set-rollbackV12").addEventListener("click", () => {
        if (confirm("シェルター撤廃前のバックアップへ巻き戻しますか? シェルターと投資Lvが戻り、払い戻しGoldは無くなります。")) Game.restoreV12Backup();
      });
      body.querySelector("#set-rollbackV10").addEventListener("click", () => {
        if (confirm("純血化(追補)前のバックアップへ巻き戻しますか? 掃除された混入個体が戻ります(その後また掃除されます)。")) Game.restoreV10Backup();
      });
      body.querySelector("#set-rollbackV9").addEventListener("click", () => {
        if (confirm("純血化(Phase4)前のバックアップへ巻き戻しますか? 純血化後の進行は失われ、消えた他惑星種が戻ります。")) Game.restoreV9Backup();
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
});
