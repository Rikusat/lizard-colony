// =============================================================
// screens/feeder — 給餌クランク(Brushup V2.1 Phase 1: クランク1個への集約)
// 操作系: タップ=1掴み / 長押し=連続給餌(=オート高と同速) /
//         縦レバー=レート(低中高・文字タブなし) / 縦2段トグル=オート・補給(控えめ)
// 給餌の効果は既存 Game.feedAll() の再利用のみ(効果ロジック不変)。
// 数値はすべて CFG.dialRates / CFG.dialSpinSec に集約。
// =============================================================

Object.assign(UI, {
  initFeeder() {
    const center = document.getElementById("center");
    if (!center) return; // 検証ページ等でフィールドが無ければ据え付けない
    const el = document.createElement("div");
    el.id = "feeder-dial";
    el.innerHTML = `
      <div class="fd-main">
        <button id="fd-crank" title="タップ=1掴み給餌 / 長押し=連続給餌" aria-label="給餌クランク(タップで1掴み・長押しで連続給餌)">
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <linearGradient id="fd-brass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:var(--amber-400)"/>
                <stop offset=".55" style="stop-color:var(--amber-500)"/>
                <stop offset="1" style="stop-color:var(--amber-600)"/>
              </linearGradient>
              <radialGradient id="fd-well" cx=".38" cy=".3" r=".9">
                <stop offset="0" style="stop-color:#3a2c16"/>
                <stop offset="1" style="stop-color:#14100a"/>
              </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="25" fill="url(#fd-well)"/>
            <circle cx="32" cy="32" r="25" class="fd-rim"/>
            <circle cx="32" cy="32" r="21.5" fill="none" class="fd-rim-in"/>
            <g class="fd-wheel">
              <g class="fd-teeth" fill="url(#fd-brass)">
                <path d="M32 12l2.2 4h-4.4zM32 52l2.2-4h-4.4zM12 32l4-2.2v4.4zM52 32l-4-2.2v4.4z"/>
                <path d="M18 18l4.4 1.3-3.1 3.1zM46 18l-1.3 4.4 3.1-3.1z" transform="rotate(0 32 32)"/>
                <path d="M18 46l1.3-4.4 3.1 3.1zM46 46l-4.4-1.3 3.1-3.1z"/>
              </g>
              <circle cx="32" cy="32" r="16.5" fill="url(#fd-brass)" class="fd-plate2"/>
              <circle cx="32" cy="32" r="16.5" fill="none" class="fd-plate-line"/>
              <path d="M32 19v26M19 32h26M22.8 22.8l18.4 18.4M41.2 22.8 22.8 41.2" class="fd-spokes"/>
              <circle cx="32" cy="32" r="5" class="fd-hub"/>
              <circle cx="32" cy="32" r="2" class="fd-hub-pin"/>
              <g class="fd-handle">
                <rect x="30.4" y="8" width="3.2" height="9" rx="1.6" class="fd-handle-grip"/>
                <circle cx="32" cy="12.5" r="3" class="fd-handle-cap"/>
              </g>
            </g>
          </svg>
        </button>
        <div class="fd-stock" title="コオロギ在庫"><svg class="icon"><use href="#i-cricket"/></svg><b id="fd-crickets">0</b></div>
      </div>
      <div class="fd-lever" id="fd-lever" tabindex="0" role="slider"
        aria-label="オート給餌レート(上=高/下=低)" aria-valuemin="0" aria-valuemax="2" aria-valuenow="1"
        title="レバー位置=給餌レート(上に引くほど速い)">
        <span class="fd-track"></span>
        <span class="fd-notch n2"></span><span class="fd-notch n1"></span><span class="fd-notch n0"></span>
        <span class="fd-lknob" id="fd-lknob"></span>
      </div>
      <button id="fd-fold" title="たたむ/ひらく" aria-label="給餌クランクをたたむ" aria-expanded="true"><span class="fd-chev"></span></button>
      <div class="fd-side">
        <button id="fd-auto" class="fd-sw" role="switch" aria-checked="false"
          title="オート給餌(レバー位置のレートで自動給餌)" aria-label="オート給餌">
          <svg class="icon"><use href="#i-auto"/></svg><span class="fd-lamp"></span>
        </button>
        <button id="fd-supply" class="fd-sw ghost" role="switch" aria-checked="false"
          title="コオロギ自動補給(不足分をGoldから自動購入・Goldがある限り永続)" aria-label="コオロギ自動補給">
          <svg class="icon"><use href="#i-coin"/></svg><span class="fd-lamp"></span>
        </button>
      </div>`;
    center.appendChild(el);
    // 危機ヴィネット(Brushup V2 §3.1): 飼育槽の縁の内側だけを赤く。魂(Canvas描画)不変
    const frame = document.getElementById("frame");
    if (frame && !document.getElementById("dread-vign")) {
      const dv = document.createElement("div");
      dv.id = "dread-vign";
      frame.appendChild(dv);
    }

    // ---- クランク: タップ=1掴み / 長押し=連続(オート高と同速=CFG.dialRates[2]) ----
    const crank = el.querySelector("#fd-crank");
    let holdTimer = null, held = false;
    const feedOnce = () => {
      const ok = Game.feedAll(true); // 既存の一括餌やり処理を再利用
      if (ok) {
        Motion.play(el, "fed");
        Motion.play(crank, "spin");
      } else if (!held) {
        Motion.play(el, "empty");
        UI.toast(Game.state.crickets < 1 ? "コオロギが足りない! 購入か自動補給(コイン印)を" : "餌をあげられるトカゲがいない…", true);
      }
      this.updateFeeder();
      return ok;
    };
    const holdStep = () => {
      if (!feedOnce()) { stopHold(); return; }
      holdTimer = setTimeout(holdStep, CFG.dialRates[2] * 1000); // 高レートと厳密に同スピード
    };
    const stopHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    crank.addEventListener("pointerdown", () => {
      held = false;
      holdTimer = setTimeout(() => { held = true; crank.classList.add("holding"); holdStep(); }, CFG.holdDelay * 1000);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
      crank.addEventListener(ev, () => { stopHold(); crank.classList.remove("holding"); });
    }
    crank.addEventListener("click", (e) => {
      if (held) { e.stopImmediatePropagation(); e.preventDefault(); held = false; return; } // 長押し後の誤発火防止
      feedOnce(); // タップ=1掴み(オート中でも手動で回せる)
      if (Game.ensureDial().auto) this.crankBoing(); // オート中タップ: ばねで応える(§1.3)
    }, true);

    // 折りたたみ: 最終的に「クランクが回っているのみ」の表示へ
    el.querySelector("#fd-fold").addEventListener("click", () => {
      const d = Game.ensureDial();
      d.min = !d.min;
      this.updateFeeder();
    });

    // ---- 縦レバー: クリック位置/キーボードでレート(0=低,1=中,2=高。上=高) ----
    const lever = el.querySelector("#fd-lever");
    const setRate = (r) => {
      Game.ensureDial().rate = Math.max(0, Math.min(2, r));
      this.updateFeeder();
    };
    lever.addEventListener("pointerdown", (e) => {
      const rect = lever.getBoundingClientRect();
      const t = (e.clientY - rect.top) / rect.height; // 0=上端
      setRate(t < 0.34 ? 2 : t < 0.67 ? 1 : 0);
    });
    lever.addEventListener("keydown", (e) => {
      const d = Game.ensureDial();
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); setRate(d.rate + 1); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); setRate(d.rate - 1); }
    });

    // ---- 縦2段トグル(オート / 控えめな補給) ----
    el.querySelector("#fd-auto").addEventListener("click", () => {
      const d = Game.ensureDial();
      d.auto = !d.auto;
      this.updateFeeder();
    });
    el.querySelector("#fd-supply").addEventListener("click", () => {
      const d = Game.ensureDial();
      d.supply = !d.supply;
      this.updateFeeder();
    });
    this.updateFeeder();
  },

  // オート中タップのばね応答: 一瞬ぐんっと加速して戻る(reduced-motionでは何もしない)
  crankBoing() {
    if (Motion.reduced) return;
    const dial = document.getElementById("feeder-dial");
    const crank = document.getElementById("fd-crank");
    Motion.play(crank, "boing");
    dial.style.setProperty("--fd-spin", "0.22s");
    clearTimeout(this._boingT);
    this._boingT = setTimeout(() => this.updateFeeder(), 650); // 元のレート速度へ戻す
  },

  // 毎秒更新(UI.updateから)。数値・クラスの書き換えのみ=平常は静か
  updateFeeder() {
    const c = document.getElementById("fd-crickets");
    if (!c) return;
    Motion.countUp(c, Math.floor(Game.state.crickets), (v) => fmt(Math.floor(v)));
    const d = Game.ensureDial();
    const dial = document.getElementById("feeder-dial");
    const targets = Game.state.lizards.filter((l) => l.injuredT <= 0 && !Game.isAway(l)).length;
    dial.classList.toggle("auto-on", d.auto);
    dial.classList.toggle("min", !!d.min); // 折りたたみ(クランクのみ表示)
    const fold = document.getElementById("fd-fold");
    fold.setAttribute("aria-expanded", !d.min);
    fold.title = d.min ? "ひらく" : "たたむ";
    dial.classList.toggle("gold-driven", d.supply && d.auto && Math.floor(Game.state.crickets) < targets);
    // オートの回転速度=レートに同期(CFG.dialSpinSec)
    dial.style.setProperty("--fd-spin", (CFG.dialSpinSec[d.rate] || CFG.dialSpinSec[1]) + "s");
    // レバー位置がレートを示す(文字なし)
    const lever = document.getElementById("fd-lever");
    lever.dataset.rate = d.rate;
    lever.setAttribute("aria-valuenow", d.rate);
    lever.setAttribute("aria-valuetext", ["低", "中", "高"][d.rate]);
    const sw = document.getElementById("fd-auto");
    sw.classList.toggle("on", d.auto);
    sw.setAttribute("aria-checked", d.auto);
    const sup = document.getElementById("fd-supply");
    sup.classList.toggle("on", d.supply);
    sup.setAttribute("aria-checked", d.supply);
  },
});
