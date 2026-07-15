// =============================================================
// ui/hero — ヒーローオーバーレイの器(UISkills §5.8 / §6 濃さの原則)
// 暗転→主役→発光→情報ワイプ→退場。クリックで必ずスキップ。
// reduced-motion時はフェードのみ+短縮。演出はこの層に閉じ込め、
// 終わったら完全に消える(平常画面へ残り香を持ち込まない)。
// =============================================================

const Hero = {
  el: null,
  _timer: null,

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement("div");
    el.id = "hero-overlay";
    el.addEventListener("pointerdown", () => this.dismiss()); // どこを押してもスキップ
    document.body.appendChild(el);
    this.el = el;
    return el;
  },

  // opts: { cls, main, info, total(ms), hold(検証用・自動退場なし) }
  show(opts) {
    if (document.hidden) return false; // 非表示タブでは出さない(復帰トーストに任せる)
    const el = this.ensure();
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    el.className = opts.cls || "";
    el.innerHTML = `<div class="hero-main">${opts.main || ""}</div>
      <div class="hero-info">${opts.info || ""}</div>
      <div class="hero-skip">クリックでスキップ</div>`;
    el.classList.add("show");
    const total = Motion.reduced ? Math.min(opts.total || 1600, 1200) : (opts.total || 1600);
    if (!opts.hold) this._timer = setTimeout(() => this.dismiss(), total);
    return true;
  },

  dismiss(immediate) {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const el = this.el;
    if (!el || !el.classList.contains("show")) return;
    if (immediate || Motion.reduced) {
      el.classList.remove("show", "leaving");
      el.innerHTML = "";
    } else {
      el.classList.add("leaving");
      setTimeout(() => { el.classList.remove("show", "leaving"); el.innerHTML = ""; }, 260);
    }
  },
};
