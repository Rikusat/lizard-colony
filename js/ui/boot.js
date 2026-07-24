// =============================================================
// boot — 起動シーケンス(全UIモジュール読込後に実行する。必ず最後に読み込む)
// =============================================================

// ---- 起動 ----
Game.init();
Render.init();
UI.init();

// 遺伝子ルーレット: 卵生成の注入(ルール層Roulette→Gameの卵システム接続。roulette.md §7)
if (typeof Roulette !== "undefined") {
  Roulette.onEgg = (outcome) => Game.spawnRouletteEgg(outcome);
  // Phase3.13報酬: 景品穴は常に開く(卵はspawnRouletteEggで段階変換=捨てない)。旧②(a)の満杯クローズは撤廃
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
}
