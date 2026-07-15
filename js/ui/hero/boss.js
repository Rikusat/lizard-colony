// =============================================================
// ui/hero/boss — ボス襲来・撃破のヒーロー(§6: 中)
// 襲来はT2+のカットイン枠(1.2秒・戦闘凍結と同期)、
// 撃破はElite/大ボス/T3+のみ(頻発を避ける濃淡)。
// =============================================================

Object.assign(UI, {
  // 襲来(1.2秒 = raid.cutinT と同期。既存のCanvasカットインを置換)
  heroBossIn(r) {
    const t = r.type;
    return Hero.show({
      cls: "hero-boss",
      main: `<div class="boss-face">${t.icon}</div>`,
      info: `<div class="hero-stamp boss">${r.elite ? "ELITE BOSS" : "BOSS"}</div>
        <div class="hero-name">${t.name}${r.tier ? " T" + r.tier : ""}</div>
        <div class="hero-reward">${t.threat}!</div>`,
      total: 1200,
    });
  },

  // 撃破(msg=リザルト詳細をそのまま掲示)
  heroBossDown(r, msg) {
    const t = r.type;
    const ok = Hero.show({
      cls: "hero-boss down",
      main: `<div class="boss-face down"><span class="burst"></span>${t.icon}</div>`,
      info: `<div class="hero-stamp">撃破!!</div>
        <div class="hero-name">${r.elite ? "Elite " : ""}${t.name}${r.tier ? " T" + r.tier : ""}</div>
        <div class="hero-reward">${msg}</div>`,
      total: 1600,
    });
    if (!ok) UI.toast(msg);
  },
});
