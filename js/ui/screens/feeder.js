// =============================================================
// screens/feeder — 給餌ダイヤル(UI_Brushup_V2 Phase 1 / UISkills §5.10)
// 飼育槽の右下に据え付けた給餌クランク。給餌の効果は既存の
// Game.feedAll() をそのまま呼ぶ(入力手段の差し替え・結果は不変)。
// クリックだけで操作可能(ドラッグ不要)・キーボード対応・reduced-motionで機能維持。
// =============================================================

Object.assign(UI, {
  initFeeder() {
    const center = document.getElementById("center");
    if (!center) return; // 検証ページ等でフィールドが無ければ据え付けない
    const el = document.createElement("div");
    el.id = "feeder-dial";
    el.innerHTML = `
      <button id="fd-crank" title="クリックで一掴み給餌(全員に1匹ずつ)" aria-label="給餌クランク">
        <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
          <circle cx="32" cy="34" r="21" class="fd-housing"/>
          <circle cx="32" cy="34" r="21" class="fd-rim"/>
          <g class="fd-wheel">
            <circle cx="32" cy="34" r="15" class="fd-plate"/>
            <path d="M32 21v26M19 34h26M22.8 24.8l18.4 18.4M41.2 24.8 22.8 43.2" class="fd-spokes"/>
            <circle cx="32" cy="34" r="4.2" class="fd-hub"/>
            <circle cx="32" cy="16.5" r="4.6" class="fd-knob"/>
          </g>
          <path d="M10 56c4-3 8-3 12 0M42 56c4-3 8-3 12 0" class="fd-feet"/>
        </svg>
      </button>
      <div class="fd-info">
        <div class="fd-title">給餌クランク</div>
        <div class="fd-stock"><svg class="icon"><use href="#i-cricket"/></svg><b id="fd-crickets">0</b>
          <span class="fd-targets">対象 <b id="fd-targets">0</b>匹</span></div>
      </div>`;
    center.appendChild(el);

    const crank = el.querySelector("#fd-crank");
    crank.addEventListener("click", () => {
      const ok = Game.feedAll(true); // 既存の一括餌やり処理を再利用(§Phase1)
      if (ok) {
        Motion.play(el, "fed");
        Motion.play(crank, "spin");
        Motion.burstAt(crank, 5); // コオロギが散るイメージの軽い粒
      } else {
        Motion.play(el, "empty");
        UI.toast(Game.state.crickets < 1 ? "コオロギが足りない! ショップで購入か自動補給を" : "餌をあげられるトカゲがいない…", true);
      }
      this.updateFeeder();
    });
    this.updateFeeder();
  },

  // 毎秒更新(UI.updateから)。数値の書き換えのみ=平常は静か
  updateFeeder() {
    const c = document.getElementById("fd-crickets");
    if (!c) return;
    Motion.countUp(c, Math.floor(Game.state.crickets), (v) => fmt(Math.floor(v)));
    const targets = Game.state.lizards.filter((l) => l.injuredT <= 0 && !Game.isAway(l)).length;
    document.getElementById("fd-targets").textContent = targets;
  },
});
