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

// 二重スリット装置(§9): 成功時に賢者の石を付与(ルール層Slit→Gameの資源。種・卵は生成しない)
if (typeof Slit !== "undefined") {
  Slit.onSuccess = () => {
    Game.addStone(1);
    if (UI.slitSuccessFx) UI.slitSuccessFx(); // C-slit.3: 静かな祝祭
  };
}
