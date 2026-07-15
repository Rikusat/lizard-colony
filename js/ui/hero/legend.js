// =============================================================
// ui/hero/legend — 伝説誕生(§6: 一生に数回級。光の柱+称号スタンプ)
// レトロフォント差し色の見せ場(判子「伝説誕生」)。
// =============================================================

Object.assign(UI, {
  heroLegendBirth(lz) {
    const sp = speciesById(lz.speciesId);
    const ok = Hero.show({
      cls: "hero-legend",
      main: `<div class="legend-stage">
          <span class="pillar"></span>
          <span class="halo"></span>
          <span class="orb"></span>
        </div>`,
      info: `<div class="hero-stamp legendbadge">伝 説 誕 生</div>
        <div class="hero-name">${Game.lizardName(lz)}</div>
        <div class="hero-reward">${sp.name} — 唯一無二の輝きがコロニーに宿った</div>`,
      total: 3000,
    });
    if (!ok) UI.toast(`伝説個体が誕生!! ${Game.lizardName(lz)} — 唯一無二の輝き!`);
  },
});
