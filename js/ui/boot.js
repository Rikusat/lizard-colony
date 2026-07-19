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
  // ②(a): 景品穴の開閉=スロットに空きがあるか。満杯なら景品穴が閉じ球はハズレに(虹は常に開=レア保護)
  Roulette.canAcceptEgg = () => Game.state.eggs.length < Game.eggSlotCap();
}
