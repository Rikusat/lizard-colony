// =============================================================
// ui/hero/rocket — ロケット発射(§6: 一生に数回級=作り込み。それでもスキップ可)
// 全画面の夜空→カウント判子→CSS製ロケットが炎を噴いて上昇→Lore一行。
// ロケットはCSS造形(絵文字不使用 §9)。
// =============================================================

Object.assign(UI, {
  heroRocketLaunch() {
    const ok = Hero.show({
      cls: "hero-rocket",
      main: `<div class="pad">
          <div class="rocket">
            <span class="nose"></span><span class="body"><i class="window"></i></span>
            <span class="fin l"></span><span class="fin r"></span>
            <span class="flame"></span><span class="smoke"></span>
          </div>
          <div class="beam"></div>
        </div>`,
      info: `<div class="hero-stamp">ROCKET LAUNCH!!</div>
        <div class="hero-name">トカゲ文明、再び星の海へ</div>
        <div class="hero-reward">全惑星の生産+10%(恒久) / アメジスト+20 / Lore「新天地へ」解読</div>`,
      total: 3200,
    });
    if (!ok) UI.toast("ロケット完成!!! 全惑星の生産+10%(恒久) — Lore「新天地へ」");
  },
});
