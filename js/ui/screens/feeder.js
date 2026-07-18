// =============================================================
// screens/feeder — 給餌クランクの【操作骨格】(Brushup V2.1→V5.2 §2で引き算UX改訂)
// 操作系: タップ=1掴み / 長押し=連続給餌(=オート高と同速) /
//         レート=タップで低→中→高を循環(広い当たり) / オート=ボタン全体が緑の後光(ランプ/枠なし) /
//         安全装置=同サイズ・在庫僅少で警告ランプ / 群はグリップでドラッグ移動(位置保存)
// 見た目(盤面SVG)は feeder-skins.js の機構スキン層が提供(惑星で差し替え可)。
// 骨格が保証する契約: .fd-wheel に spin/boing/オート回転を適用する。
// 給餌の効果は既存 Game.feedAll() の再利用のみ。数値は CFG.dialRates/dialSpinSec。
// =============================================================

Object.assign(UI, {
  initFeeder() {
    const center = document.getElementById("center");
    if (!center) return; // 検証ページ等でフィールドが無ければ据え付けない
    const el = document.createElement("div");
    el.id = "feeder-dial";
    el.innerHTML = `
      <span id="fd-grip" title="ドラッグで移動" aria-label="給餌盤の移動ハンドル"><i></i><i></i><i></i></span>
      <div class="fd-main">
        <button id="fd-crank" title="タップ=1掴み給餌 / 長押し=連続給餌" aria-label="給餌クランク(タップで1掴み・長押しで連続給餌)">
          ${CrankSkins.current().face()}
        </button>
      </div>
      <div class="fd-lever" id="fd-lever" tabindex="0" role="button"
        aria-label="オート給餌レート(タップで 低→中→高 循環)" aria-valuemin="0" aria-valuemax="2" aria-valuenow="1"
        title="タップで給餌レート循環(低→中→高)">
        <span class="fd-track"></span>
        <span class="fd-notch n2"></span><span class="fd-notch n1"></span><span class="fd-notch n0"></span>
        <span class="fd-lknob" id="fd-lknob"></span>
      </div>
      <div class="fd-side">
        <button id="fd-auto" class="fd-sw fd-glow" role="switch" aria-checked="false"
          title="オート給餌(レート位置で自動給餌)" aria-label="オート給餌">
          <svg class="icon"><use href="#i-auto"/></svg>
        </button>
        <button id="fd-empty" class="fd-sw fd-glow" role="switch" aria-checked="false"
          title="コオロギ切れ時の挙動 — ON:自動停止(安全) / OFF:Gold換算で補充"
          aria-label="コオロギ切れ時トグル(ON=自動停止/OFF=Gold補充)">
          <svg class="icon"><use href="#i-shield"/></svg><span class="fd-warn" title="コオロギ残り僅か"></span>
        </button>
      </div>`;
    center.appendChild(el);
    this.restoreFeederPos(el); // 保存済みのドラッグ位置を復元
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
        UI.toast(Game.state.coins < CFG.feedGoldCost ? "Goldが足りない!" : "餌をあげられるトカゲがいない…", true);
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
    // spin/boingはMotion.playが付けるだけで残留し、スキンのタップルール(ID2つ)が
    // オート回転(ID1つ)を恒久上書きしてしまう。主動作(crank自身か.fd-wheel)の終了時に必ず外す。
    // オート回転は無限ループでanimationendを発火しないため誤除去は起きない
    crank.addEventListener("animationend", (e) => {
      const t = e.target;
      if (t === crank || (t.classList && t.classList.contains("fd-wheel"))) {
        crank.classList.remove("spin", "boing");
      }
    });

    // V5 3.6: 折りたたみ(非表示モード)は撤廃。クランクは常時独立表示

    // ---- レート: ボタン全体タップで 低→中→高 を循環(狭い位置クリック不要・2-1) ----
    const lever = el.querySelector("#fd-lever");
    const setRate = (r) => {
      Game.ensureDial().rate = ((r % 3) + 3) % 3; // 0=低 1=中 2=高
      this.updateFeeder();
    };
    lever.addEventListener("click", () => setRate(Game.ensureDial().rate + 1)); // タップごとに循環
    lever.addEventListener("keydown", (e) => {
      const d = Game.ensureDial();
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRate(d.rate + 1); }
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); setRate(d.rate + 1); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); setRate(d.rate - 1); }
    });

    // ---- オート給餌(ON=ボタン全体が緑の後光。ランプ/囲み枠は廃止・2-2/2-3) ----
    el.querySelector("#fd-auto").addEventListener("click", () => {
      const d = Game.ensureDial();
      d.auto = !d.auto;
      this.updateFeeder();
    });
    this.initFeederDrag(el); // ボタン群を1つの塊としてドラッグ移動(位置保存・2-4)
    // 切れ時トグル: ON=コオロギが尽きたら自動停止(安全) / OFF=Gold換算で補充して継続
    el.querySelector("#fd-empty").addEventListener("click", () => {
      const d = Game.ensureDial();
      d.stopOnEmpty = !d.stopOnEmpty;
      UI.toast(d.stopOnEmpty ? "コオロギ切れ時: 自動停止(安全装置ON)" : "コオロギ切れ時: Goldで補充して継続");
      this.updateFeeder();
    });
    this.updateFeeder();
  },

  // 惑星スキンの適用(Phase 0: 器のみ。惑星移動でスキンIDが変わった時だけ盤面を差し替え)
  applyCrankSkin() {
    const crank = document.getElementById("fd-crank");
    if (!crank) return;
    const skin = CrankSkins.current();
    if (this._crankSkinId === skin.id) return;
    this._crankSkinId = skin.id;
    crank.innerHTML = skin.face();
    const dial = document.getElementById("feeder-dial");
    // fx0=dialレベルの演出抑制クラス(スキンCSSがトグル等の待機演出をこれで止める)
    const fx = CFG.crankFxLevel > 0 ? "" : " fx0";
    dial.className = dial.className.replace(/\bskin-[\w-]+\b|\bfx0\b/g, "").trim() + " " + skin.dialClass + fx;
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
    if (!document.getElementById("fd-crank")) return;
    this.applyCrankSkin(); // 惑星移動でスキンが切り替わる(同一IDなら何もしない)
    const d = Game.ensureDial();
    const dial = document.getElementById("feeder-dial");
    dial.classList.toggle("auto-on", d.auto);
    // V5 3.6: 折りたたみ撤廃(min状態は無視)・Gold駆動概念は消滅
    // オートの回転速度=レートに同期(CFG.dialSpinSec)
    dial.style.setProperty("--fd-spin", (CFG.dialSpinSec[d.rate] || CFG.dialSpinSec[1]) + "s");
    // レバー位置がレートを示す(文字なし)
    const lever = document.getElementById("fd-lever");
    lever.dataset.rate = d.rate;
    lever.setAttribute("aria-valuenow", d.rate);
    lever.setAttribute("aria-valuetext", ["低", "中", "高"][d.rate]);
    const sw = document.getElementById("fd-auto");
    sw.classList.toggle("on", d.auto); // .on=ボタン全体が緑の後光(CSS)
    sw.setAttribute("aria-checked", d.auto);
    const emp = document.getElementById("fd-empty");
    if (emp) {
      emp.classList.toggle("on", !!d.stopOnEmpty); // ON=安全装置(琥珀の後光)
      emp.setAttribute("aria-checked", !!d.stopOnEmpty);
      // 2-5: OFF(=Gold補充で回り続ける)かつ在庫が僅少になったら警告ランプ点灯
      const low = !d.stopOnEmpty && d.auto && Math.floor(Game.state.crickets || 0) < CFG.cricketLowWarn;
      emp.classList.toggle("warn", low);
    }
  },

  // ---- ドラッグ移動(ボタン群を1つの塊として。位置はlocalStorageに保存・2-4) ----
  initFeederDrag(el) {
    const grip = el.querySelector("#fd-grip");
    if (!grip) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      this.placeFeeder(el, nx, ny);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const r = el.getBoundingClientRect(); const pr = el.offsetParent.getBoundingClientRect();
      try { localStorage.setItem("feederPos", JSON.stringify({ x: r.left - pr.left, y: r.top - pr.top })); } catch (err) { /* noop */ }
    };
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), pr = el.offsetParent.getBoundingClientRect();
      ox = r.left - pr.left; oy = r.top - pr.top; sx = e.clientX; sy = e.clientY; dragging = true;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  },
  // 親(#center)内の絶対座標へ。はみ出さないようクランプ
  placeFeeder(el, x, y) {
    const par = el.offsetParent; if (!par) return;
    const maxX = par.clientWidth - el.offsetWidth, maxY = par.clientHeight - el.offsetHeight;
    x = Math.max(0, Math.min(maxX, x)); y = Math.max(0, Math.min(maxY, y));
    el.style.left = x + "px"; el.style.top = y + "px"; el.style.right = "auto"; el.style.bottom = "auto";
  },
  restoreFeederPos(el) {
    let p = null;
    try { p = JSON.parse(localStorage.getItem("feederPos")); } catch (e) { p = null; }
    if (!p) return;
    // レイアウト確定後に配置(offsetParentのサイズが必要)
    requestAnimationFrame(() => this.placeFeeder(el, p.x, p.y));
  },
});
