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
            <circle cx="32" cy="32" r="24" class="fd-housing"/>
            <circle cx="32" cy="32" r="24" class="fd-rim"/>
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="17" class="fd-plate"/>
              <path d="M32 17v30M17 32h30M21.4 21.4l21.2 21.2M42.6 21.4 21.4 42.6" class="fd-spokes"/>
              <circle cx="32" cy="32" r="4.6" class="fd-hub"/>
              <circle cx="32" cy="12.5" r="5" class="fd-knob"/>
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
    }, true);

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

  // 毎秒更新(UI.updateから)。数値・クラスの書き換えのみ=平常は静か
  updateFeeder() {
    const c = document.getElementById("fd-crickets");
    if (!c) return;
    Motion.countUp(c, Math.floor(Game.state.crickets), (v) => fmt(Math.floor(v)));
    const d = Game.ensureDial();
    const dial = document.getElementById("feeder-dial");
    const targets = Game.state.lizards.filter((l) => l.injuredT <= 0 && !Game.isAway(l)).length;
    dial.classList.toggle("auto-on", d.auto);
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
