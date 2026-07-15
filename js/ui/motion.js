// =============================================================
// ui/motion — モーション共通ヘルパ(UISkills §4 / §8: ui/motion相当)
// カウントアップ・ワンショットアニメ再生。reduced-motion時は即時反映へ落とす。
// =============================================================

const Motion = {
  durBase: 200, // --dur-base と同期(参照元: tokens.css)

  get reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  // 数値カウントアップ(§4.3): 直接置換せず短時間で回して着地。
  // el._mv に生値を記憶し、変化した時だけアニメする。書式は fmtFn で毎フレーム適用。
  countUp(el, value, fmtFn) {
    fmtFn = fmtFn || ((v) => fmt(v));
    if (el._mv === undefined || this.reduced || value === el._mv) {
      // 初回・reduced・不変は即時反映
      if (el._mv !== value || el.textContent === "") el.textContent = fmtFn(value);
      el._mv = value;
      return;
    }
    const from = el._mv;
    el._mv = value;
    if (el._mraf) cancelAnimationFrame(el._mraf);
    const t0 = performance.now();
    const stepFn = (t) => {
      const p = Math.min(1, (t - t0) / this.durBase);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = fmtFn(from + (value - from) * eased);
      if (p < 1) el._mraf = requestAnimationFrame(stepFn);
      else el._mraf = null;
    };
    el._mraf = requestAnimationFrame(stepFn);
  },

  // ワンショットのCSSアニメクラスを再生(連続発火でも毎回リスタート)
  play(el, cls) {
    if (this.reduced || !el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflowでアニメをリセット
    el.classList.add(cls);
  },
};
