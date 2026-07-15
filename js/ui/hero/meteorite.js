// =============================================================
// ui/hero/meteorite — 隕石を割る(§6: 中〜重。伝説はさらに大きく)
// 岩が震える→亀裂が走る→閃光→卵のお披露目。
// =============================================================

Object.assign(UI, {
  heroMeteorite(sp, morph, egg) {
    const legend = morph.id === "legendary";
    const eggStyle = legend
      ? "" // 伝説は虹(CSSアニメ)
      : `background: radial-gradient(circle at 38% 30%, hsl(${egg.hue},${egg.sat}%,${Math.min(92, egg.light + 22)}%), hsl(${egg.hue},${egg.sat}%,${egg.light}%));`;
    const ok = Hero.show({
      cls: "hero-meteor" + (legend ? " legend" : ""),
      main: `<div class="meteor">
          <span class="rock"></span>
          <span class="crack c1"></span><span class="crack c2"></span><span class="crack c3"></span>
          <span class="flash"></span>
          <span class="m-egg${legend ? " rainbow" : ""}" style="${eggStyle}"></span>
        </div>`,
      info: `<div class="hero-stamp${legend ? " legendbadge" : ""}">${legend ? "伝説の胎動…!!" : "隕石を割った!!"}</div>
        <div class="hero-name">${morph.name} ${sp.name} の卵</div>
        <div class="hero-reward">${legend ? "唯一無二の輝きが眠っている" : "希少な血統が眠っている"} — 卵スロットへ</div>`,
      total: legend ? 2800 : 2200,
    });
    if (!ok) UI.toast(`☄️ 隕石を割った!! 中から${legend ? "伝説の" : "希少な"}卵が…!`);
  },
});
