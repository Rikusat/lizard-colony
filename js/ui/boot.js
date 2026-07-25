// =============================================================
// boot — 起動シーケンス(全UIモジュール読込後に実行する。必ず最後に読み込む)
// =============================================================

// ---- 起動 ----
Game.init();
Render.init();
UI.init();

// 遺伝子ルーレット: 卵生成の注入(ルール層Roulette→Gameの卵システム接続。roulette.md §7)
if (typeof Roulette !== "undefined") {
  Roulette.onEgg = (outcome) => Game.spawnRoulettePrize(outcome); // R2-1: 卵→鉱物報酬(コールバック名onEggはルール層API=据置)
  // R2-1: 景品=鉱物(◇/⬡/●)につき満杯概念なし=景品穴は常に開く
  Roulette.canAcceptEgg = null;
}

// 四重スリット装置(§9): 成功時に賢者の石を付与(ルール層Slit→Gameの資源。種・卵は生成しない)
if (typeof Slit !== "undefined") {
  Slit.onSuccess = () => {
    Game.addStone(1);
    if (UI.slitSuccessFx) UI.slitSuccessFx(); // C-slit.3: 静かな祝祭
  };
}

// ---- dev支援(Ric指示 2026-07-24・HANDOFF §5www): ?tune=1 セッション限定のデバッグ資源付与 ----
// 通常アクセスでは Dev は生成しない(undefined)=ゲームUIへの露出ゼロ。記載はHANDOFFのみ。
// 付与は既存の加算関数(正規経路)のみ=整合性・下限0・表示更新を既存ロジックに委ねる。聖域(確率/物理/遺伝/純血/魂)非接触。
if (typeof location !== "undefined" && /[?&]tune=1(?:&|$)/.test(location.search)) {
  window.Dev = {
    grant(o) {
      const paths = {
        stones: (n) => Game.addStone(n),
        coins: (n) => { Game.state.coins += n; },
        gems: (n) => { Game.state.gems += n; },
        crickets: (n) => { Game.state.crickets = (Game.state.crickets || 0) + n; },
        bio: (n) => Game.addRes("bio", n),
        food: (n) => Game.addRes("food", n),
        energy: (n) => Game.addRes("energy", n),
        science: (n) => Game.addRes("science", n),
      };
      for (const o2 of (typeof ORES !== "undefined" ? ORES : [])) paths[o2.id] = (n) => Game.addOre(o2.id, n);
      if (!o || typeof o !== "object") {
        console.log("[Dev.grant] 対応キー: " + Object.keys(paths).join(", ") + ' — 例: Dev.grant({stones:10})');
        return Object.keys(paths);
      }
      const done = {};
      for (const k in o) {
        const n = o[k];
        if (!paths[k]) { console.warn("[Dev.grant] 未知キー:", k); continue; }
        if (typeof n !== "number" || !isFinite(n) || n <= 0 || Math.floor(n) !== n) { console.warn("[Dev.grant] 正の整数のみ:", k, n); continue; }
        paths[k](n);
        done[k] = n;
      }
      if (Object.keys(done).length) {
        console.log("DEV GRANT " + JSON.stringify(done));
        Game.save();
        if (UI.update) UI.update();
      }
      return done;
    },
  };
  console.log("[tune] Dev.grant 有効(引数なしで対応キー一覧)");

  // dev支援(Ric指示 2026-07-25): 個体一覧ビューア(?tune=1#roster・読み取り専用=書き込みコードなし・進行非干渉)。
  // 実セーブの全惑星・全個体をテーブル表示(R5-b意匠判定・[A]詰め・デバッグの基礎資料)。dev道具=ハードコード可。
  if (location.hash === "#roster") {
    const buildRoster = () => {
      let host = document.getElementById("dev-roster");
      if (!host) {
        host = document.createElement("div");
        host.id = "dev-roster";
        host.style.cssText = "position:fixed;inset:0;z-index:99990;background:rgba(10,8,6,.97);color:#e8dccb;overflow:auto;font:13px system-ui;padding:16px 20px";
        document.body.appendChild(host);
      }
      const curId = Game.currentStage().id;
      const rows = [];
      for (const lz of Game.state.lizards) rows.push({ lz, planet: curId });
      for (const st of ((Game.world && Game.world.stages) || [])) {
        if (st.stageId === curId) continue;
        for (const lz of (st.lizards || [])) rows.push({ lz, planet: st.stageId });
      }
      const state = host._rst || (host._rst = { sort: "default", dir: 1, fSp: "", fMo: "", fTr: "" });
      const sorted = rows.slice().sort((a, b) => {
        const key = state.sort;
        const va = key === "lv" ? (a.lz.level || 1) : key === "name" ? Game.lizardName(a.lz) : key === "sp" ? a.lz.speciesId : key === "mo" ? a.lz.morphId : key === "cd" ? (a.lz.breedCd || 0) : 0;
        const vb = key === "lv" ? (b.lz.level || 1) : key === "name" ? Game.lizardName(b.lz) : key === "sp" ? b.lz.speciesId : key === "mo" ? b.lz.morphId : key === "cd" ? (b.lz.breedCd || 0) : 0;
        if (key !== "default" && va !== vb) return (va < vb ? -1 : 1) * state.dir;
        return (a.planet - b.planet) || (a.lz.speciesId < b.lz.speciesId ? -1 : a.lz.speciesId > b.lz.speciesId ? 1 : 0) || ((b.lz.level || 1) - (a.lz.level || 1));
      }).filter((r) =>
        (!state.fSp || r.lz.speciesId === state.fSp) &&
        (!state.fMo || r.lz.morphId === state.fMo) &&
        (state.fTr === "" || (state.fTr === "y") === ((r.lz.traits || []).length > 0)));
      const nTr = rows.filter((r) => (r.lz.traits || []).length > 0).length;
      const nFx = rows.reduce((a2, r) => a2 + ((r.lz.fixedTraits || []).length ? 1 : 0), 0);
      const nLeg = rows.filter((r) => r.lz.morphId === "legendary").length;
      const spOpts = [...new Set(rows.map((r) => r.lz.speciesId))].map((id2) => `<option value="${id2}" ${state.fSp === id2 ? "selected" : ""}>${(speciesById(id2) || {}).name || id2}</option>`).join("");
      const moOpts = MORPHS.map((m) => `<option value="${m.id}" ${state.fMo === m.id ? "selected" : ""}>${m.name}</option>`).join("");
      const th = (key, label) => `<th data-sort="${key}" style="cursor:pointer;text-align:left;padding:4px 8px;border-bottom:1px solid #5a4a33;color:#e4bc3a">${label}${state.sort === key ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
      const thS = (label) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #5a4a33;color:#e4bc3a">${label}</th>`;
      let html = `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <b style="font-size:15px">個体一覧(dev・読み取り専用)</b>
        <span>総数 ${rows.length} / 特性持ち ${nTr} / 固定印 ${nFx} / レジェンダリー ${nLeg}</span>
        <label>種 <select id="rst-sp"><option value="">すべて</option>${spOpts}</select></label>
        <label>モーフ <select id="rst-mo"><option value="">すべて</option>${moOpts}</select></label>
        <label>特性 <select id="rst-tr"><option value="">すべて</option><option value="y" ${state.fTr === "y" ? "selected" : ""}>あり</option><option value="n" ${state.fTr === "n" ? "selected" : ""}>なし</option></select></label>
        <button id="rst-refresh">更新</button>
        <span style="color:#a89a83">表示 ${sorted.length}件</span></div>
        <table style="border-collapse:collapse;width:100%"><thead><tr>
        ${thS("#")}${th("name", "名前")}${th("sp", "種")}${th("mo", "モーフ")}${th("lv", "Lv")}${thS("特性")}${th("cd", "CD残")}${thS("状態")}${thS("惑星")}</tr></thead><tbody>`;
      sorted.forEach((r, i) => {
        const lz = r.lz, mo = morphById(lz.morphId) || { name: lz.morphId };
        const leg = lz.morphId === "legendary";
        const status = lz.injuredT > 0 ? `負傷 ${Math.ceil(lz.injuredT)}s` : lz.tailRegrowT > 0 ? "尾再生中" : lz.poisonT > 0 ? "毒" : "—";
        html += `<tr style="border-bottom:1px solid #2e2418">
          <td style="padding:3px 8px;color:#a89a83">${i + 1}</td>
          <td style="padding:3px 8px"><b class="${leg ? "leg-name" : ""}">${Game.lizardName(lz)}</b></td>
          <td style="padding:3px 8px">${(speciesById(lz.speciesId) || {}).name || lz.speciesId}</td>
          <td style="padding:3px 8px">${mo.name}</td>
          <td style="padding:3px 8px">${lz.stage === "baby" ? "ベビー" : "Lv" + (lz.level || 1)}</td>
          <td style="padding:3px 8px">${UI.breedTraitChips ? UI.breedTraitChips(lz) : ""}</td>
          <td style="padding:3px 8px">${lz.breedCd > 0 ? Math.ceil(lz.breedCd) + "s" : "—"}</td>
          <td style="padding:3px 8px">${status}</td>
          <td style="padding:3px 8px">${(typeof PLANET_NAMES !== "undefined" && PLANET_NAMES[r.planet]) || r.planet}</td></tr>`;
      });
      html += "</tbody></table>";
      host.innerHTML = html;
      host.querySelector("#rst-refresh").addEventListener("click", buildRoster);
      host.querySelector("#rst-sp").addEventListener("change", (e) => { state.fSp = e.target.value; buildRoster(); });
      host.querySelector("#rst-mo").addEventListener("change", (e) => { state.fMo = e.target.value; buildRoster(); });
      host.querySelector("#rst-tr").addEventListener("change", (e) => { state.fTr = e.target.value; buildRoster(); });
      for (const el of host.querySelectorAll("[data-sort]")) el.addEventListener("click", () => {
        const k = el.dataset.sort;
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
        buildRoster();
      });
    };
    setTimeout(buildRoster, 400); // boot完了後にスナップショット表示(更新ボタンで再読取り・書き込みなし)
  }
}
