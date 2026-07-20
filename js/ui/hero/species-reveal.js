// =============================================================
// ui/hero/species-reveal — C2c 虹の最大ジュース(新種お披露目・§6 一生に数回級)
// 虹ポケット命中で未踏の図鑑エントリ=新種が現れた瞬間、全画面ヒーローで【種族の姿を大きく】お披露目。
// 姿は render の実描画(遺伝子カラー反映)。名前+種族名+★を明示。短く・強く。
// reduced-motion=フェード+静止1枚。盤(#boss-reward z320)より上に出す(CSSで z340)。
// =============================================================

Object.assign(UI, {
  // sp: 種族 / mo: モーフ / gene: {hue,sat,light,pattern}(生まれた卵の遺伝子=姿に反映)
  heroSpeciesReveal(sp, mo, gene) {
    if (!sp || !mo) return;
    const stars = "★".repeat(sp.stars || 1);
    const morphName = mo.id === "normal" ? "" : mo.name + " ";
    const ok = Hero.show({
      cls: "hero-species",
      main: `<div class="species-stage"><span class="species-rays"></span><canvas class="species-cv"></canvas></div>`,
      info: `<div class="hero-stamp speciesbadge">新 種 発 見</div>
        <div class="hero-name">${morphName}${sp.name}</div>
        <div class="hero-reward"><span class="species-stars">${stars}</span> 虹の中から未踏の遺伝子が現れた</div>`,
      total: 2200,
    });
    if (!ok) { UI.toast(`${Icon.svg("spark")} 新種発見! ${morphName}${sp.name} が虹から現れた!`); return; }
    // お披露目の姿を描く(遺伝子カラー反映の実描画)
    const cv = Hero.el && Hero.el.querySelector(".species-cv");
    if (cv && typeof Render !== "undefined" && Render.drawLizard) {
      this._paintRevealLizard(cv, sp, mo, gene || {});
    }
  },

  _paintRevealLizard(cv, sp, mo, gene) {
    const ctx = cv.getContext("2d");
    const crowd = (typeof Game !== "undefined" && Game.crowdScale) ? Game.crowdScale() : 1;
    const baseL = 105 * (sp.size || 1) * crowd;          // drawLizard が使う実効体長(アダルト)
    // お披露目用の表示個体(セーブ非依存の一時オブジェクト)。静止・右向き・遺伝子カラー反映
    const lz = {
      id: 90210, speciesId: sp.id, morphId: mo.id, stage: "adult", level: 1,
      x: 0, y: 0, angle: 0, moving: false, injuredT: 0,
      hue: gene.hue != null ? gene.hue : sp.hue, sat: gene.sat != null ? gene.sat : sp.sat,
      light: gene.light != null ? gene.light : sp.light, pattern: gene.pattern || "none",
    };
    const calm = typeof Motion !== "undefined" && Motion.reduced;
    const draw = () => {
      if (!Hero.el || !Hero.el.classList.contains("show")) return; // 退場したら止める
      // バッファはレイアウト実寸(offsetWidth=transform非依存)へ毎フレーム同期=hero-popのscale中も正しいサイズ
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(cv.offsetWidth * dpr)), ch = Math.max(1, Math.round(cv.offsetHeight * dpr));
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const target = Math.min(cw, ch * 1.4) * 0.52;       // お披露目サイズ(横長スプライトに合わせる)
      const f = target / baseL;
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2, ch * 0.66);                   // 足元アンカーを下寄りに(胴は上へ伸びる)
      ctx.scale(f, f);
      Render.drawLizard(ctx, lz);                         // 遺伝子カラー・種族差を実描画で反映
      ctx.restore();
      if (!calm) this._revealRaf = requestAnimationFrame(draw); // 微かな呼吸(尾の揺れ)。reduced-motion=静止1枚
    };
    draw();
    if (calm) requestAnimationFrame(draw); // 静止でもレイアウト確定後に1回だけ描き直す(初回のoffsetWidth=0対策)
  },
});
