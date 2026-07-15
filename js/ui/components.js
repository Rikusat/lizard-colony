// =============================================================
// UI components — 汎用部品(モーダル / トースト / ボタン長押し)
// UISkills.md §8: ui/components相当。画面(screens)から共通利用される。
// =============================================================

Object.assign(UI, {
  // ---------------- モーダル共通 ----------------
  openModal(title, buildBody) {
    this.els["modal-title"].textContent = title;
    this.els["modal-body"].innerHTML = "";
    buildBody(this.els["modal-body"]);
    // Phase 6(§4.3): 開いた瞬間の1回だけstagger入場。タブ切替等の再構築では発火しない
    Motion.stagger(this.els["modal-body"], ".list-row, .breed-card, .dex-cell, .stat-cell");
    this.els["modal"].classList.remove("hidden");
  },

  closeModal() {
    this.els["modal"].classList.add("hidden");
  },

  // ---------------- トースト ----------------
  // type: true/"boss"=危機 / "life"=成功 / "info"=情報 / 省略=報酬(琥珀) §5.5
  toast(msg, type) {
    const el = document.createElement("div");
    const cls = type === true ? "bad" : (type || "");
    el.className = "toast" + (cls ? " " + cls : "");
    el.textContent = msg;
    this.els["toasts"].appendChild(el);
    while (this.els["toasts"].children.length > 5) this.els["toasts"].firstChild.remove();
    setTimeout(() => el.classList.add("out"), 3650);
    setTimeout(() => el.remove(), 4000);
  },
});

function on(id, fn) {
  document.getElementById(id).addEventListener("click", fn);
}

// 長押しオートリピート (GameExpansion_v2 ④)
// fn は成功時 true / 資源枯渇などで false を返す。false で自動停止。
function attachHold(el, fn) {
  let timer = null, count = 0, held = false;
  const stop = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (held && count > 0) UI.toast(`⚡ 連続実行 ×${count}`);
    el.classList.remove("holding");
    el.style.removeProperty("--hold-p");
    const b = el.querySelector(".hold-count");
    if (b) b.remove();
    count = 0;
  };
  const step = () => {
    if (!fn()) { stop(); return; }
    count++;
    el.classList.add("holding");
    let b = el.querySelector(".hold-count");
    if (!b) {
      b = document.createElement("span");
      b.className = "hold-count";
      el.appendChild(b);
    }
    b.textContent = "×" + count;
    // 押し続けるほど加速するオートリピート(加速度合いをリングへ同期 §5.2)
    const iv = Math.max(CFG.holdMin, CFG.holdStart - count * CFG.holdAccel);
    el.style.setProperty("--hold-p", ((CFG.holdStart - iv) / (CFG.holdStart - CFG.holdMin)).toFixed(3));
    timer = setTimeout(step, iv * 1000);
  };
  el.addEventListener("pointerdown", () => {
    held = false;
    timer = setTimeout(() => { held = true; step(); }, CFG.holdDelay * 1000);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    el.addEventListener(ev, stop);
  }
  // 長押し後のclick発火を抑止(誤って単発実行やモーダルを開かない)
  el.addEventListener("click", (e) => {
    if (held) {
      e.stopImmediatePropagation();
      e.preventDefault();
      held = false;
    }
  }, true);
}
