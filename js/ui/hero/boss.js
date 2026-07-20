// =============================================================
// ui/hero/boss — ボス襲来・撃破のヒーロー(§6: 中)
// 襲来はT2+のカットイン枠(1.2秒・戦闘凍結と同期)、
// 撃破はElite/大ボス/T3+のみ(頻発を避ける濃淡)。
// =============================================================

Object.assign(UI, {
  // §9.2: ボス襲来の全画面カットインは撤廃(Render.showCenterNotice=飼育槽中央の軽い通知に置換)。
  // 撃破(msg=リザルト詳細をそのまま掲示)
  heroBossDown(r, msg) {
    const t = r.type;
    const ok = Hero.show({
      cls: "hero-boss down",
      main: `<div class="boss-face down"><span class="burst"></span>${Icon.svg(t.icon)}</div>`,
      info: `<div class="hero-stamp">撃破!!</div>
        <div class="hero-name">${r.elite ? "Elite " : ""}${t.name}${r.tier ? " T" + r.tier : ""}</div>
        <div class="hero-reward">${msg}</div>`,
      total: 1600,
    });
    if (!ok) UI.toast(msg);
  },
});
