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
  { // #roster: 初回ロード時+hashchange両対応(同一URLのハッシュ変更はリロードされないため=調査で特定した起動漏れの根治)
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
      // セーブ同定(環境違い事故の30秒切り分け用): キー/origin/ランク/G/惑星数/最終保存+経路自己診断
      let ident = "";
      try {
        const raw = localStorage.getItem(CFG.saveKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const rawRank = parsed && parsed.headquarters ? parsed.headquarters.rank : (parsed ? parsed.rank : null);
        const pathOk = parsed ? (rawRank === Game.state.rank ? "本体経路と一致 ✓" : `⚠不一致(raw=${rawRank}/state=${Game.state.rank})`) : "セーブなし(新規)";
        const savedAt = (Game.world && Game.world.savedAt) ? new Date(Game.world.savedAt).toLocaleString("ja-JP") : "—";
        ident = `<div style="font:11px ui-monospace,monospace;color:#a89a83;margin-bottom:6px">
          SAVE: key=<b>${CFG.saveKey}</b> @ ${location.origin} / ランク <b style="color:#e4bc3a">${Game.state.rank}</b> / ${Math.floor(Game.state.coins).toLocaleString()}G /
          惑星 ${((Game.world && Game.world.stages) || []).length} / 最終保存 ${savedAt} / 読取経路: ${pathOk}</div>`;
      } catch (e) { ident = `<div style="color:#d8404e">SAVE同定失敗: ${e}</div>`; }
      let html = ident + `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
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
    const rosterGate = () => {
      if (location.hash === "#roster") buildRoster();
      else { const h = document.getElementById("dev-roster"); if (h) h.remove(); }
    };
    window.addEventListener("hashchange", rosterGate);
    if (location.hash === "#roster") setTimeout(buildRoster, 400); // boot完了後にスナップショット表示(更新ボタンで再読取り・書き込みなし)

    // dev支援(調査L 2026-07-26): spot挙動デバッグオーバーレイ(?tune=1#spotdebug・読み取り専用・進行非干渉)。
    //   Ricが自分の実セーブで「誰が水場へ向かっているか/水場判定範囲/波紋発生点/集計」を可視化して不出の原因を切り分ける。
    { // #spotdebug: #game上にオーバーレイcanvasを重ね rAF で診断描画(セーブ・確率・戦闘に一切触れない)
      let sdOn = false, sdCanvas = null, sdHud = null, sdRAF = 0;
      const sdLog = { drink: [], ripple: [] }; // 直近1分の到達/波紋のタイムスタンプ(表示専用)
      const gameCv = () => document.getElementById("game");
      const stopSD = () => { sdOn = false; if (sdRAF) cancelAnimationFrame(sdRAF); if (sdCanvas) sdCanvas.remove(); if (sdHud) sdHud.remove(); sdCanvas = sdHud = null; };
      const drawSD = () => {
        if (!sdOn) return;
        const gc = gameCv(); if (!gc || typeof Game === "undefined") { sdRAF = requestAnimationFrame(drawSD); return; }
        const r = gc.getBoundingClientRect();
        if (!sdCanvas) {
          sdCanvas = document.createElement("canvas"); sdCanvas.id = "spotdebug-cv";
          sdCanvas.style.cssText = "position:fixed;pointer-events:none;z-index:9998;";
          document.body.appendChild(sdCanvas);
          sdHud = document.createElement("div"); sdHud.id = "spotdebug-hud";
          sdHud.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9999;background:rgba(10,8,6,.86);color:#e8dccb;font:12px/1.5 system-ui;padding:8px 12px;border-radius:8px;border:1px solid #7a5;max-width:320px;";
          document.body.appendChild(sdHud);
        }
        sdCanvas.style.left = r.left + "px"; sdCanvas.style.top = r.top + "px";
        sdCanvas.style.width = r.width + "px"; sdCanvas.style.height = r.height + "px";
        if (sdCanvas.width !== gc.width) { sdCanvas.width = gc.width; sdCanvas.height = gc.height; }
        const c = sdCanvas.getContext("2d");
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, sdCanvas.width, sdCanvas.height);
        const spots = (typeof Render !== "undefined" && Render.facilitySpots) ? Render.facilitySpots() : [];
        const waterSpots = spots.filter((s) => s.facility === "water");
        // 水場の判定範囲(_nearWater楕円)を描く
        if (typeof waterTierInfo === "function" && typeof FAC_POS !== "undefined") {
          const wi = waterTierInfo(Game.facLv("water"));
          if (wi.tier) {
            const rx = wi.rx * 1.05, ry = Math.max(24, wi.ry) * 1.6;
            c.strokeStyle = "rgba(90,180,230,.9)"; c.lineWidth = 2; c.setLineDash([6, 4]);
            c.beginPath(); c.ellipse(FAC_POS.water.x, FAC_POS.water.y, rx, ry, 0, 0, 7); c.stroke(); c.setLineDash([]);
            c.fillStyle = "rgba(90,180,230,.9)"; c.font = "11px system-ui";
            c.fillText("_nearWater (水場判定・tier" + wi.tier + ")", FAC_POS.water.x - rx, FAC_POS.water.y - ry - 4);
          } else { c.fillStyle = "#e88"; c.font = "13px system-ui"; c.fillText("★水場が未建設(tier0)=水飲み/波紋は出ません", 40, 40); }
        }
        // 各spotの中心
        for (const s of spots) {
          const water = s.facility === "water";
          c.fillStyle = water ? "#5ac8f2" : "rgba(220,200,120,.7)";
          c.beginPath(); c.arc(s.center.x, s.center.y, water ? 6 : 4, 0, 7); c.fill();
          c.fillStyle = "rgba(255,255,255,.7)"; c.font = "10px system-ui"; c.fillText(s.id, s.center.x + 6, s.center.y);
        }
        // 各個体の目的地への線
        let heading = 0, drinking = 0, relaxing = 0, ripplePts = 0;
        for (const lz of Game.state.lizards) {
          if (!Game.isVisible(lz)) continue;
          const to = lz._toSpot && spots.find((s) => s.id === lz._toSpot);
          if (to) {
            const water = to.facility === "water"; if (water) heading++;
            c.strokeStyle = water ? "rgba(90,200,240,.8)" : "rgba(180,170,120,.4)"; c.lineWidth = water ? 2 : 1;
            c.beginPath(); c.moveTo(lz.x, lz.y); c.lineTo(to.center.x, to.center.y); c.stroke();
          }
          if (lz.spot && lz._spotPosture === "drink") { drinking++; c.strokeStyle = "#3ef"; c.lineWidth = 2; c.beginPath(); c.arc(lz.x, lz.y, 12, 0, 7); c.stroke(); }
          if (lz._relaxing) relaxing++;
          // 波紋発生点(足跡波紋の条件を満たす個体)
          if (lz.moving && Render._nearWater && Render._nearWater(lz)) { ripplePts++; c.fillStyle = "rgba(188,214,228,.9)"; c.beginPath(); c.arc(lz.x, lz.y + 8, 5, 0, 7); c.fill(); }
        }
        const now = (Game._motClock || 0);
        if (drinking) sdLog.drink.push(now); if (ripplePts) sdLog.ripple.push(now);
        sdLog.drink = sdLog.drink.filter((t) => now - t < 60); sdLog.ripple = sdLog.ripple.filter((t) => now - t < 60);
        sdHud.innerHTML = "<b>spot診断</b> (?tune=1#spotdebug)<br>"
          + "水場spot数: " + waterSpots.length + " (" + waterSpots.map((s) => s.id).join(",") + ")<br>"
          + "水場へ向かう個体: <b>" + heading + "</b><br>"
          + "水飲み中(青丸): <b>" + drinking + "</b><br>"
          + "くつろぎ中: " + relaxing + " / 表示個体 " + Game.state.lizards.filter((l) => Game.isVisible(l)).length + "<br>"
          + "波紋発生中(白点): <b>" + ripplePts + "</b><br>"
          + "<span style='color:#9c9'>水色破線=水場判定 / 青線=水場へ向かう / 青丸=水飲み / 白点=波紋</span>";
        sdRAF = requestAnimationFrame(drawSD);
      };
      const sdGate = () => {
        if (location.hash === "#spotdebug") { if (!sdOn) { sdOn = true; drawSD(); console.log("[spotdebug] 有効: 水場判定/目的地/波紋を可視化"); } }
        else stopSD();
      };
      window.addEventListener("hashchange", sdGate);
      if (location.hash === "#spotdebug") setTimeout(sdGate, 400);
    }

    // dev支援(7B.1確認 2026-07-27): 四重スリット惑星別意匠の比較ビューア(?tune=1#slitskin・読み取り専用・物理非接触)。
    //   default+展開済み全惑星を横並びで描画=骨格同一・色のみ差替を一目で比較。骨格はCFG幾何で自己完結描画(Slit物理slit.jsは非接触)。
    {
      let ssPanel = null;
      const stopSS = () => { if (ssPanel) ssPanel.remove(); ssPanel = null; };
      const rc = (a, al) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;
      // 骨格をCFG幾何で自己完結描画(color=palette・比較用の固定失敗痕/球)。Slit状態には触れない。
      const drawCell = (cvv, sk, bg) => {
        const ctx = cvv.getContext("2d"), W = cvv.width, H = cvv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
        const N = CFG.slitRings, radii = CFG.slitRadiif, half = CFG.slitHalfDeg, base = CFG.slitBaseAngleDeg, sc = W / 240;
        const pt = (r, thd) => { const t = thd * Math.PI / 180; return [cx + r * R * Math.cos(t), cy - r * R * Math.sin(t)]; };
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); // 惑星背景の薄敷き(馴染み)
        // リング描画は実描画関数(UI._slitRing)をそのまま呼ぶ=ビューアと実機の描画が原理的にズレない(Slit物理には非接触=角度は自前で与える)
        // 各リングの切れ目角=静止スナップショット(物理の独立回転slitSpinDegを6秒相当で位相化=枠が互いにズレて回る様を静止画で読ませる)
        const ang = []; for (let i = 0; i < N; i++) ang.push(base + (CFG.slitSpinDeg && CFG.slitSpinDeg[i] ? CFG.slitSpinDeg[i] * 6 : 0));
        for (let i = 0; i < N; i++) UI._slitRing(ctx, cx, cy, radii[i] * R, ang[i], half[i], rc(sk.rail, 0.5), Math.max(1, 1.15 * sc), sk); // レール(姿形は惑星別・枠ごと位相回転)
        // 角度窓ガイド(物理整合の証明・淡): 各リングの切れ目「中心角」へ中心から極細の破線=見た目の隙間と物理の通過角が一致することを可視化
        ctx.save(); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; for (let i = 0; i < N; i++) { const t = ang[i] * Math.PI / 180, r0 = (i < N - 1 ? radii[i + 1] : 0) * R, r1 = radii[i] * R; ctx.strokeStyle = rc(sk.glow, 0.16); ctx.beginPath(); ctx.moveTo(cx + r0 * Math.cos(t), cy - r0 * Math.sin(t)); ctx.lineTo(cx + r1 * Math.cos(t), cy - r1 * Math.sin(t)); ctx.stroke(); } ctx.restore();
        // 失敗痕(固定・比較用)。実機同様に「弾かれた壁の上」=姿形で変調した半径へ写像=痕が枠から浮かないことも確認できる
        for (let i = 0; i < N; i++) { const thd = 60 + i * 40; const [x, y] = pt(UI._slitShapeR(sk, radii[i], thd, ang[i]), thd); const depth = (i + 1) / N; ctx.beginPath(); ctx.arc(x, y, (2 + depth * 2.8) * sc, 0, 7); ctx.fillStyle = rc(sk.trace, 0.5 + depth * 0.45); ctx.fill(); if (depth >= 0.99) { ctx.beginPath(); ctx.arc(x, y, (2 + depth * 2.8) * sc + 2.2 * sc, 0, 7); ctx.strokeStyle = rc(sk.traceRing, 0.7); ctx.lineWidth = 1.2 * sc; ctx.stroke(); } }
        // 中心(F標識の惑星は三葉=放射線標識)
        ctx.fillStyle = rc(sk.center, 0.7); const cr0 = Math.max(1.6, R * 0.028);
        if (sk.centerShape === "trefoil") { const r0 = ang[0] * Math.PI / 180; for (let t = 0; t < 3; t++) { const a0 = r0 + t * 2 * Math.PI / 3 - 0.42; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, cr0 * 2.6, -a0, -(a0 + 0.84), true); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(cx, cy, cr0 * 0.9, 0, 7); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(cx, cy, cr0, 0, 7); ctx.fill(); }
        const [lx, ly] = pt(0.6, ang[0]), [lx2, ly2] = pt(0.74, ang[0]); const g = ctx.createLinearGradient(lx2, ly2, lx, ly); g.addColorStop(0, rc(sk.laser, 0)); g.addColorStop(1, rc(sk.laser, 0.95)); ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.4, 1.8 * (W / 200)); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(lx, ly); ctx.stroke(); ctx.beginPath(); ctx.arc(lx, ly, Math.max(1.4, 1.6 * (W / 200)), 0, 7); ctx.fillStyle = rc(sk.laser, 0.98); ctx.fill(); // 飛行球
        const bl = R * 0.5, gg = ctx.createRadialGradient(cx, cy, 1, cx, cy, bl); gg.addColorStop(0, rc(sk.bloom, 0.5)); gg.addColorStop(1, rc(sk.bloom, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, bl, 0, 7); ctx.fill(); // 成功ブルーム(色見本)
      };
      const buildSS = () => {
        stopSS();
        const def = CFG.slitSkinDefault, byStage = CFG.slitSkinByStage || {};
        const stName = (id) => { const st = (typeof STAGES !== "undefined") && STAGES.find((s) => s.id === id); return st ? st.name : ("惑星" + id); };
        const stBg = (id) => { const st = (typeof STAGES !== "undefined") && STAGES.find((s) => s.id === id); return st ? (st.sky2 || st.ground2 || "#1a1410") : "#1a1410"; };
        // セル一覧: default + 展開済み全惑星(slitSkinByStageのキー昇順)
        const cells = [{ id: null, label: "default(現行)", sk: def, bg: "#141018" }];
        Object.keys(byStage).map(Number).sort((a, b) => a - b).forEach((id) => cells.push({ id, label: stName(id) + " (" + id + ")", sk: Object.assign({}, def, byStage[id]), bg: stBg(id) }));
        const panel = document.createElement("div"); panel.id = "slitskin-view";
        panel.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(8,6,10,.94);color:#e8dccb;font:13px/1.5 system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;overflow:auto;";
        const title = document.createElement("div"); title.style.cssText = "font-size:15px;font-weight:600;"; title.textContent = "四重スリット 意匠比較 (?tune=1#slitskin) — 骨格同一(半径/切れ目角/回転)・姿形+色を惑星別。破線=切れ目中心角(物理の角度窓と一致)。#で閉じる";
        panel.appendChild(title);
        const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:18px;justify-content:center;"; panel.appendChild(row);
        cells.forEach((c) => {
          const box = document.createElement("div"); box.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;";
          const cvv = document.createElement("canvas"); cvv.width = 240; cvv.height = 240; cvv.style.cssText = "width:240px;height:240px;border-radius:10px;border:1px solid #443;";
          const lab = document.createElement("div"); lab.textContent = c.label;
          box.appendChild(cvv); box.appendChild(lab); row.appendChild(box);
          drawCell(cvv, c.sk, c.bg);
        });
        document.body.appendChild(panel); ssPanel = panel;
      };
      const ssGate = () => { if (location.hash === "#slitskin") { buildSS(); console.log("[slitskin] 意匠比較ビューア表示"); } else stopSS(); };
      window.addEventListener("hashchange", ssGate);
      if (location.hash === "#slitskin") setTimeout(ssGate, 400);
    }
  }
}
