"use strict";
// ============================================================
// トカゲコロニー: Canvas 描画 (1280x720)
// ============================================================

const HORIZON = 170;

// 設備の配置座標
const FAC_POS = {
  water: { x: 230, y: 610 },
  light: { x: 1010, y: 322 },       // 保温設備(§8.12で旧・展望台位置=右へ移動。ボス側)。名残でキー名はlight
  observatory: { x: 640, y: 300 },  // 展望台(§8.12で中央へ配置し巨大化=中央のランドマーク/ギミック)
  burrow: { x: 185, y: 322 },       // すみか(§8.12で旧・保温設備位置=左へ。ボス登場側の反対=ベビーが逃げ込む)
  fenceX: 1218,                      // フェンス(右端の防柵。ボスの進路)
  watchtower: { x: 1150, y: 254 },  // §8.17 監視塔(右上=ボスの接近を見張る物見櫓)
  trap: { x: 1128, y: 470 },        // §8.17 罠(右のボス進入路=迎え撃つ。ルーレット盤/右端UIを避け y=470 のボスレーンへ)
};
const NEST = { x: 400, y: 512 };  // 卵の巣(§8.12で中央の巨大展望台を避け前景・左下寄りへ)
// Phase6 惑星署名ボス(PLANET_BOSS)は data.js へ移設(単一の真実)。roll(game.js)と描画(render.js)の両方が参照する。
// §8.15 スプライトキャッシュ: アニメ位相をこの粒度(phase単位)で量子化して焼き直す=時間スロットル。
//   小さいほど滑らか(焼き直し頻度up=軽減効果down)、大きいほど軽い(アニメ粗く)。phase=time*8なので 0.28≈2〜3フレームに1回。
const SPRITE_ANIM_Q = 0.28;
const LIZ_CACHE_MAX = 80; // キャッシュ上限(可視~20+袖振り合い。超過分はLRUで破棄=メモリ上限を保証)

// Phase 8: 設備の成長表現。tier算出を一元化(二重管理なし)。thresholds=各tierの上限レベルの配列(例 水場[5,10,15,20])。
// 返り値 tier(1..N・0=未建設) と within(tier内進捗 0..1: そのtierの最初のLv=0/最後のLv=1)。描画と当たり判定で共有。
function facTier(lv, thresholds) {
  if (lv <= 0) return { tier: 0, within: 0 };
  let tier = thresholds.length;
  for (let i = 0; i < thresholds.length; i++) if (lv <= thresholds[i]) { tier = i + 1; break; }
  const lo = tier === 1 ? 0 : thresholds[tier - 2], hi = thresholds[tier - 1];
  const within = (hi - lo) > 1 ? Math.min(1, (lv - lo - 1) / (hi - lo - 1)) : 0;
  return { tier, within };
}
// 水場(水たまり→池→湖→大湖・上限20/4tier)
function waterTierInfo(lv) {
  const { tier, within } = facTier(lv, [5, 10, 15, 20]);
  if (!tier) return { tier: 0, rx: 0, ry: 0, hitR: 0 };
  const rx = [0, 58, 86, 114, 142][tier] + within * [0, 9, 12, 14, 15][tier];
  return { tier, rx, ry: rx * 0.42, hitR: rx * 0.98 };
}
// 保温設備(§8.8 UFO転送ビーム着想・上限20/4tier): 1置き型ライト / 2温室(地上設置の完成形) / 3空中ライト小 / 4空中ライト大+転送。
// tier3+は「群れが入れる広い光の面」(§8.7 収容力)=地上の光面 beamR を持つ。
function heatTierInfo(lv) {
  const { tier, within } = facTier(lv, [5, 10, 15, 20]);
  if (!tier) return { tier: 0, w: 0, h: 0, beamR: 0, hitR: 0 };
  const w = [0, 44, 138, 0, 0][tier] + within * [0, 6, 10, 0, 0][tier];       // tier1-2の設備幅
  const h = [0, 52, 158, 0, 0][tier] + within * [0, 4, 8, 0, 0][tier];        // tier2温室の高さ
  const beamR = tier >= 3 ? ([0, 0, 0, 116, 168][tier] + within * [0, 0, 0, 14, 22][tier]) : 0; // 地上の光面半径(群れの居場所)
  const hitR = tier >= 3 ? beamR * 0.86 : Math.max(58, w * 0.62);
  return { tier, w, h, beamR, hitR };
}
// 展望台(§8.9 観測施設群・上限10/3tier): 1観測台 / 2観測所 / 3観測施設群(大望遠鏡+アンテナ列+観測塔+足場+複数バルコニー)。
// §8.12: 中央のランドマークとして巨大化。群れが集まって空を見上げられる規模。居場所=観測デッキ(§8.5)。
function observatoryTierInfo(lv) {
  const { tier, within } = facTier(lv, [3, 7, 10]);
  if (!tier) return { tier: 0, w: 0, h: 0, hitR: 0 };
  const w = [0, 128, 210, 312][tier] + within * [0, 16, 22, 28][tier];
  const h = [0, 84, 140, 196][tier] + within * [0, 10, 14, 16][tier];
  return { tier, w, h, hitR: Math.max(80, w * 0.46) };
}
// すみか(§8.16 多数が暮らす集合住居/ワレン・住居Lv上限8/3tier)。常に存在(Lv1〜)。
//   §8.12以降: ベビーの避難先・強個体の籠り先=コロニーの中心。複数の入口(entrances)で群れの出入り動線を分散。
function burrowTierInfo(lv) {
  const { tier, within } = facTier(Math.max(1, lv), [3, 5, 8]);
  const t = tier || 1;
  const scale = [1, 1.12, 1.36, 1.6][t] + within * [0, 0.08, 0.1, 0.12][t];
  const entrances = [0, 2, 3, 4][t]; // 入口数(育つほど増える=収容力/動線)
  const gap = 44 * scale;            // 入口の間隔
  // ③ タップ判定は見た目より小さく=実体(中央の入口塊)に近い範囲(旧: 端の入口まで包む193)。トカゲ選択が巣に取られない
  const hitR = Math.max(56, gap);
  return { tier: t, scale, entrances, gap, hitR };
}
// §8.17 防衛設備(ボスは右から来る=右側に迎え撃つ構え。育つほど「守りが堅そう」に見える)
// フェンス(木柵→補強柵→丸太の防柵・上限10/3tier)。垂直帯。tierで高さ/杭/堅牢さが増す。
function fenceTierInfo(lv) {
  const { tier, within } = facTier(lv, [3, 7, 10]);
  if (!tier) return { tier: 0 };
  return { tier, within, spikes: tier >= 2, thick: [0, 5, 7, 10][tier] };
}
// 監視塔(物見櫓・上限10/3tier)。見張りが立つ台=居場所。tierで高く堅牢に+篝火/鐘。
function watchtowerTierInfo(lv) {
  const { tier, within } = facTier(lv, [3, 6, 10]);
  if (!tier) return { tier: 0, h: 0, hitR: 0 };
  const h = [0, 84, 126, 172][tier] + within * [0, 10, 14, 16][tier];
  const tw = [0, 58, 74, 92][tier] + within * [0, 6, 8, 10][tier];
  return { tier, within, h, tw, hitR: Math.max(60, tw * 0.7) };
}
// 罠設備(杭列→落とし穴+網→焼却罠・上限15/3tier)。ボスの進路(右)に牙を向ける。
function trapTierInfo(lv) {
  const { tier, within } = facTier(lv, [5, 10, 15]);
  if (!tier) return { tier: 0, w: 0, hitR: 0 };
  const w = [0, 92, 132, 172][tier] + within * [0, 10, 14, 18][tier];
  return { tier, within, w, hitR: Math.max(58, w * 0.5) };
}

// ID8 氷の前線: 浮遊モノリス(上位存在の技術・中景の異物)の共有ジオメトリ。
// 静的造形はpaintBackground(キャッシュ)へ、動く冷光はRender.drawMonolith8(毎フレーム)へ分離。
const MONO8 = {
  mx: 560,
  base: HORIZON - 18,   // 接地せず浮く(下に隙間=出所不明)
  h: 104,
  wBot: 22, wTop: 16,   // わずかに先細るオベリスク
  splitF: 0.42,         // 浮遊分割の高さ(基部からの割合)
  gap: 7,               // 分割の空隙
  offset: 3,            // 上segの水平ずれ(構造ロジックが通らない=非トカゲ的)
  glyphs: 7,            // 解読不能グリフ列の段数(意味は描かない=模索UX)
};
const COLD8 = "127,199,222"; // 氷水#7FC7DE = 上位存在の冷光(軍用の赤=借り物と階層分離)
// モノリスの断面半幅(基部wBot/2→頂部wTop/2の線形補間)。静的/動的で共有し重複を避ける
function mono8HalfW(y) {
  const t = (MONO8.base - y) / MONO8.h;
  return (MONO8.wBot + (MONO8.wTop - MONO8.wBot) * t) / 2;
}
// ID8 軍事痕跡群(監視柱/六角台座/巡回機残骸)。「与えられた借り物の軍事技術」=非トカゲ的な精度×放棄・埋没。
// 位置は静的body(paintBackground=キャッシュ)と動く赤い光学(drawMonolith8=毎フレーム)で共有する。
const GRAKIS8 = {
  pylons: [{ x: 214, h: 104, s: 1 }, { x: 858, h: 86, s: 0.92 }, { x: 1176, h: 58, s: 0.68 }], // s=奥行き縮尺
  hexes: [{ x: 1052, y: 0, r: 27 }, { x: 1104, y: 0, r: 15 }], // yはpaint時にHORIZON基準で確定
  wreck: { x: 332 },
};
// 赤い光学(監視柱の単眼・六角の休眠コア・残骸の消えかけの眼)の位置。静的な暗点と脈動グローで共有
function grakisEyes() {
  const H8 = (typeof HORIZON === "number") ? HORIZON : 0;
  const eyes = [];
  for (const p of GRAKIS8.pylons) eyes.push({ x: p.x, y: H8 - p.h - 8 * p.s, r: 9 * p.s, a: 0.9 });
  for (const hx of GRAKIS8.hexes) eyes.push({ x: hx.x, y: H8 + 66, r: 4.5, a: 0.4 });
  eyes.push({ x: GRAKIS8.wreck.x + 11, y: H8 + 98, r: 3.5, a: 0.32 }); // 消えかけ
  return eyes;
}
// ID9 廃原子炉: チェレンコフ冷光の脈動点(静的ベースはpaintBackground・呼吸はdrawReactor9)。死にかけの炉は不規則明滅
const REACTOR9 = {
  vents: [
    { x: 400, y: HORIZON - 12, r: 22, a: 0.5 },   // 格納容器の開いた扉
    { x: 1145, y: HORIZON - 14, r: 11, a: 0.5 },  // モジュール炉0
    { x: 1187, y: HORIZON - 14, r: 11, a: 0.14 }, // モジュール炉1(死にかけ)
    { x: 1229, y: HORIZON - 14, r: 11, a: 0.5 },  // モジュール炉2
  ],
};

const Render = {
  ctx: null,
  time: 0,
  _bgCache: null,   // 背景は重いのでオフスクリーンにキャッシュ
  _bgStage: 0,

  init() {
    this.ctx = document.getElementById("game").getContext("2d");
  },

  lizardColor(lz) {
    // 伝説モーフは虹色に変化し続ける
    if (lz.morphId === "legendary") {
      const h = Math.floor((this.time * 50 + lz.id * 47) % 360);
      return { h, s: 85, l: 60, css: `hsl(${h},85%,60%)` };
    }
    const [h, s, l] = morphById(lz.morphId).recolor(lz.hue, lz.sat, lz.light);
    return { h, s, l, css: `hsl(${h},${s}%,${l}%)` };
  },

  draw() {
    const ctx = this.ctx;
    Game.refreshCrowdScale();
    this.drawStage(ctx);
    if (Game.currentStage().id === 8) this.drawMonolith8(ctx); // 氷の前線: モノリスの冷光(背景層)
    if (Game.currentStage().id === 9) this.drawReactor9(ctx); // 廃原子炉: チェレンコフ冷光の脈動(背景層)
    if (Game.currentStage().id === 7) this.drawAbyss7(ctx); // 水中都市: 気泡/海藻/コースティクス/深海の影(背景層)
    if (Game.currentStage().id === 6) this.drawJungle6(ctx); // 密林: 篝火の炎/火の粉・御神体の翡翠脈動・緑の木漏れ日(背景層)
    if (Game.currentStage().id === 4) this.drawTomb4(ctx); // 古代古墳: 玄室の金の脈動・燐火(緑の鬼火)・水面のゆらぎ(背景層)
    if (Game.currentStage().id === 5) this.drawFurnace5(ctx); // 火山: 溶鉱炉の赤熱脈動・火の粉・溶岩の明滅(ふいご・背景層)
    if (Game.currentStage().id === 3) this.drawForest3(ctx); // 森林: からくり時計の振り子・木漏れ日・蛍(背景層)
    if (Game.currentStage().id === 1) this.drawDawn1(ctx); // 始まりの地: 朝の光にただよう花粉(希望の粒・背景層)
    if (Game.currentStage().id === 2) this.drawSlum2(ctx); // 摩天楼スラム: ネオンの明滅/サーチライト/雨/企業ホログラム(背景層)
    this.drawNest(ctx);
    this.drawFacilities(ctx);
    this.drawSmallFacilities(ctx);
    this.drawPlanetAllies(ctx); // Phase6: 現在の惑星の固有味方(コロニー側に常駐・観賞/戦力)
    this.drawBurrow(ctx);
    this.drawAutotomyTails(ctx); // §9.1 切り離された尾(地面・トカゲの下)
    // y座標順に描画(奥行き)。さらわれ中・休憩中の個体は描かない
    this._frameCount = (this._frameCount || 0) + 1; // §8.15 スプライトキャッシュのLRU用
    const sorted = Game.state.lizards.filter((lz) => Game.isVisible(lz)).sort((a, b) => a.y - b.y);
    for (const lz of sorted) this.drawLizard(ctx, lz);
    this._pruneLizCache();
    this.drawSpawnFx(ctx); // §9-C2 誕生の登場エフェクト(生き物の上に重ねる祝祭)
    this.drawGenesisFx(ctx); // S5 創世エフェクト(賢者の石の錬成=深紅の静かな重み)
    if (Game.raid) this.drawBoss(ctx, Game.raid);
    else if (Game.corpse) this.drawCorpse(ctx, Game.corpse);
    if (Game.currentStage().id === 8) this.drawBugSweep(ctx); // 氷の前線: 自動掃討(純演出)
    this.drawPopups(ctx);
    this.drawVignette(ctx);
    // イベント中の表示
    if (Game.event) {
      ctx.font = "bold 16px sans-serif";
      this.centerLabel(ctx, `${Game.event.def.name} 残り${Math.ceil(Game.event.t)}秒 — ${Game.event.def.desc}`,
        W / 2, H - 26, "rgba(60,40,10,.7)", "#ffe9b0");
    }
    this.drawCenterNotice(ctx); // §9.2 飼育槽中央の軽い通知(ボス出現ほか・タップ不要・全画面カットイン撤廃)
    // 伝説誕生などのフラッシュ
    if (Game.flashT > 0) {
      ctx.fillStyle = `rgba(255,250,230,${Math.min(0.85, Game.flashT)})`;
      ctx.fillRect(0, 0, W, H);
    }
  },


  // ---------------- 背景(キャッシュ) ----------------
  drawStage(ctx) {
    const st = Game.currentStage();
    if (!this._bgCache || this._bgStage !== st.id) {
      this._bgStage = st.id;
      this._bgCache = document.createElement("canvas");
      this._bgCache.width = W; this._bgCache.height = H;
      this.paintBackground(this._bgCache.getContext("2d"), st);
    }
    ctx.drawImage(this._bgCache, 0, 0);
    // ステージ名プレート(動的でないが軽いので直描き)
    // 3.11.1: 現在地表示(全惑星統一・STAGE後の数字は付けない)。トカゲ数を下に併記(3.10.3)
    this.pill(ctx, 20, 18, `${st.pname} ${st.name} STAGE`, "rgba(0,0,0,.45)", "rgba(255,255,255,.82)", 15);
    this.pill(ctx, 20, 46, `${Game.state.lizards.length} / ${Game.capacity()} 匹`, "rgba(0,0,0,.36)", "rgba(210,230,200,.8)", 13);
  },

  paintBackground(ctx, st) {
    const rand = lcg(st.id * 7919);
    // 空
    let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, st.sky); g.addColorStop(1, st.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON);

    // 太陽 / 火山の赤い光 (廃原子炉は粉塵で霞んだ弱い太陽)
    if (st.id === 9) {
      const haze = ctx.createRadialGradient(1080, 70, 6, 1080, 70, 70);
      haze.addColorStop(0, "rgba(220,228,235,.30)");
      haze.addColorStop(1, "rgba(220,228,235,0)");
      ctx.fillStyle = haze; ctx.fillRect(1000, 0, 200, 150);
    } else if (st.id !== 5) {
      const glow = ctx.createRadialGradient(1080, 70, 8, 1080, 70, 90);
      glow.addColorStop(0, "rgba(255,245,200,.95)");
      glow.addColorStop(0.25, "rgba(255,235,170,.5)");
      glow.addColorStop(1, "rgba(255,235,170,0)");
      ctx.fillStyle = glow; ctx.fillRect(960, 0, 320, 190);
      ctx.fillStyle = "#fff3cf";
      ctx.beginPath(); ctx.arc(1080, 70, 26, 0, 7); ctx.fill();
    } else {
      const glow = ctx.createRadialGradient(1080, 90, 10, 1080, 90, 130);
      glow.addColorStop(0, "rgba(255,110,50,.8)");
      glow.addColorStop(1, "rgba(255,110,50,0)");
      ctx.fillStyle = glow; ctx.fillRect(920, 0, 360, 230);
    }

    // 遠景の山(2層シルエット)
    ctx.fillStyle = hexA(st.accent, 0.45);
    this.ridge(ctx, rand, HORIZON, 55, 5);
    ctx.fillStyle = hexA(st.accent, 0.75);
    this.ridge(ctx, rand, HORIZON, 30, 7);

    // 地面
    g = ctx.createLinearGradient(0, HORIZON - 10, 0, H);
    g.addColorStop(0, st.ground); g.addColorStop(1, st.ground2);
    ctx.fillStyle = g; ctx.fillRect(0, HORIZON, W, H - HORIZON);
    ctx.fillStyle = hexA("#000000", 0.25);
    ctx.fillRect(0, HORIZON, W, 3);

    // 地面の色ムラ(大きめパッチ・はっきりと)
    for (let i = 0; i < 30; i++) {
      const x = rand() * W, y = HORIZON + 40 + rand() * (H - HORIZON - 60);
      const r = 24 + rand() * 60;
      ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,.07)" : "rgba(255,230,200,.05)";
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.5, 0, 0, 7); ctx.fill();
    }
    // 太陽の側からの環境光(地面に落ちる暖色)
    const warm = ctx.createRadialGradient(1080, HORIZON + 60, 30, 1080, HORIZON + 60, 620);
    warm.addColorStop(0, st.id === 5 ? "rgba(255,120,60,.10)" : "rgba(255,235,170,.08)");
    warm.addColorStop(1, "rgba(255,235,170,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    // 地面の細かいノイズ(土の粒感)
    for (let i = 0; i < 380; i++) {
      const x = rand() * W, y = HORIZON + 10 + rand() * (H - HORIZON - 20);
      ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.07 + rand() * 0.07})` : `rgba(255,235,210,${0.05 + rand() * 0.06})`;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 2, 0, 7); ctx.fill();
    }
    // 立体感のある小石(ステージ対比色ではっきり見せる)
    for (let i = 0; i < 90; i++) {
      const x = rand() * W, y = HORIZON + 30 + rand() * (H - HORIZON - 50);
      const r = 2 + rand() * 5;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.45, r * 1.6, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = st.pebble;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.9, rand() * 0.6 - 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.7, r * 0.35, 0, 0, 7); ctx.fill();
    }
    // 大きな岩(中〜大サイズを全体に散らす)
    for (let i = 0; i < 13; i++) {
      const edge = rand() < 0.45;
      const x = edge ? (rand() < 0.5 ? rand() * 200 : W - rand() * 200) : rand() * W;
      const y = HORIZON + 40 + rand() * (H - HORIZON - 70);
      this.boulder(ctx, rand, x, y, 12 + rand() * 24, st.rock);
    }
    // ステージ固有の装飾
    this.paintDeco(ctx, st, rand);
  },

  ridge(ctx, rand, baseY, height, n) {
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    let x = 0;
    while (x < W) {
      const w2 = 90 + rand() * 200;
      const peak = baseY - 10 - rand() * height;
      ctx.quadraticCurveTo(x + w2 / 2, peak, x + w2, baseY);
      x += w2;
    }
    ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
  },

  paintDeco(ctx, st, rand) {
    const groundY = () => HORIZON + 50 + rand() * (H - HORIZON - 80);
    if (st.id === 1) { // 乾燥地帯=始まりの地(素朴で温かい文明の起点。教科書ゆえ賑やかにせず、気配だけ足す)
      // 遠景のメサ(広い始まりの大地=希望の地平)
      for (const [mx, mw, mh] of [[210, 170, 30], [1130, 200, 38]]) {
        ctx.fillStyle = "rgba(176,126,78,.4)";
        ctx.beginPath(); ctx.moveTo(mx - mw / 2, HORIZON); ctx.lineTo(mx - mw / 2 + 14, HORIZON - mh); ctx.lineTo(mx + mw / 2 - 18, HORIZON - mh); ctx.lineTo(mx + mw / 2, HORIZON); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(214,164,104,.3)"; ctx.fillRect(mx - mw / 2 + 14, HORIZON - mh, mw - 32, 2); // 頂の朝陽
      }
      // 朝の温かい帯(始まりの光・希望)
      { const dawn = ctx.createLinearGradient(0, HORIZON - 40, 0, HORIZON + 40); dawn.addColorStop(0, "rgba(255,210,140,0)"); dawn.addColorStop(0.5, "rgba(255,205,140,.10)"); dawn.addColorStop(1, "rgba(255,205,140,0)"); ctx.fillStyle = dawn; ctx.fillRect(0, HORIZON - 40, W, 80); }
      // 原初の給餌機(全ての精巧なクランクの祖=素朴な木と石の手回し装置。ここで物語が始まった・説明しない)
      {
        const px = 980, py = HORIZON + 64;
        ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 5; ctx.lineCap = "round"; // 木のA字架
        ctx.beginPath(); ctx.moveTo(px - 22, py); ctx.lineTo(px, py - 34); ctx.lineTo(px + 22, py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - 13, py - 17); ctx.lineTo(px + 13, py - 17); ctx.stroke(); // 貫
        ctx.fillStyle = "#9a8c74"; ctx.beginPath(); ctx.arc(px, py - 20, 15, 0, 7); ctx.fill(); // 石の車輪(挽き臼のよう)
        ctx.strokeStyle = "#6f6350"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py - 20, 15, 0, 7); ctx.stroke();
        ctx.fillStyle = "#6f6350"; ctx.beginPath(); ctx.arc(px, py - 20, 3, 0, 7); ctx.fill(); // 軸
        ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, py - 20); ctx.lineTo(px + 18, py - 13); ctx.stroke(); // 手回しハンドル(=精巧なクランクの祖形)
        ctx.fillStyle = "#8a6a3c"; ctx.beginPath(); ctx.arc(px + 18, py - 13, 3, 0, 7); ctx.fill(); // 握り
        ctx.strokeStyle = "rgba(120,96,60,.6)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(px, py - 20, 9, 0.5, 4); ctx.stroke(); // 巻かれた縄
        ctx.fillStyle = "#8f8168"; ctx.beginPath(); ctx.ellipse(px - 6, py, 10, 4, 0, 0, 7); ctx.fill(); // 足元の石
      }
      for (let i = 0; i < 4; i++) {
        const x = 80 + rand() * (W - 160), y = groundY();
        this.cactus(ctx, x, y, 0.7 + rand() * 0.6);
      }
      for (let i = 0; i < 18; i++) this.tuft(ctx, rand() * W, groundY(), "#8a7040", rand);
    } else if (st.id === 2) { // 摩天楼スラム: 夜のスカイライン・ネオン・経済格差
      // 光害グロー: 高層側の空がネオンで滲む(シルエットを浮かせる下地)
      const glow = ctx.createLinearGradient(0, HORIZON - 150, 0, HORIZON);
      glow.addColorStop(0, "rgba(217,87,176,0)");
      glow.addColorStop(0.7, "rgba(120,80,150,.10)");
      glow.addColorStop(1, "rgba(255,170,120,.16)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, HORIZON - 150, W, 150);
      // 左=高層(煌びやか) → 右=スラム(暗い)のグラデーションで格差を描く
      let bx = -20;
      let sign = 0;
      while (bx < W) {
        const highSide = bx < W * 0.55;
        const bw = highSide ? 46 + rand() * 40 : 34 + rand() * 30;
        const bh = highSide ? 90 + rand() * 130 : 24 + rand() * 46;
        const top = HORIZON - bh;
        ctx.fillStyle = highSide ? "#232c4a" : "#262530";
        ctx.fillRect(bx, top, bw, bh);
        ctx.fillStyle = highSide ? "rgba(159,208,255,.25)" : "rgba(216,195,165,.12)";
        ctx.fillRect(bx, top, bw, 1.5); // 屋上の縁明かり
        // 窓明かり: 高層=多く暖色/寒色、スラム=まばらで薄暗い
        const litRate = highSide ? 0.5 : 0.12;
        for (let wy = top + 6; wy < HORIZON - 6; wy += 9) {
          for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) {
            if (rand() < litRate) {
              ctx.fillStyle = highSide
                ? (rand() < 0.5 ? "rgba(255,217,138,.85)" : "rgba(159,208,255,.8)")
                : "rgba(201,162,94,.4)";
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
        // 高層のみ: 屋上ネオン(惑星アクセントのネオンピンク+シアン・1本は明滅)
        if (highSide && rand() < 0.6) {
          const nx = bx + 4 + rand() * (bw - 12);
          const neon = rand() < 0.5 ? "217,87,176" : "95,204,217";
          const pulse = sign++ === 1 ? 0.55 + Math.sin(this.time * 2.2) * 0.3 : 0.8;
          ctx.fillStyle = `rgba(${neon},${0.16 * pulse})`;
          ctx.fillRect(nx - 4, top - 8, 14, 12); // ハロー
          ctx.fillStyle = `rgba(${neon},${pulse})`;
          ctx.fillRect(nx, top - 5, 6, 3);
          ctx.fillRect(nx + 8, top - 4, 2, 2);
        }
        // スラムのみ: トタン屋根の段差
        if (!highSide) {
          ctx.fillStyle = "#22222c";
          ctx.fillRect(bx - 3, top - 3, bw * 0.6, 4);
        }
        bx += bw + (highSide ? 6 : 3);
      }
      // 地面: 廃材・水たまりのネオン反射(軽め)
      for (let i = 0; i < 8; i++) {
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "#22222a";
        ctx.fillRect(x, y - 3, 10 + rand() * 14, 5);
      }
      for (let i = 0; i < 3; i++) {
        const x = W * 0.15 + rand() * W * 0.45, y = groundY();
        ctx.fillStyle = "rgba(217,87,176,.10)";
        ctx.beginPath(); ctx.ellipse(x, y, 26 + rand() * 18, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(159,208,255,.07)";
        ctx.beginPath(); ctx.ellipse(x + 8, y + 2, 14, 3.5, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 3) { // 森林: 木製からくり時計の民=シルヴァ(時計職人の気配。森に機構が溶け込む)
      // 遠景の木立(霞む層=奥行き)
      for (let i = 0; i < 7; i++) {
        const x = (i * 188 + 50) % W;
        ctx.fillStyle = "rgba(40,64,38,.5)";
        ctx.fillRect(x - 3, HORIZON - 22, 6, 22);
        ctx.beginPath(); ctx.arc(x, HORIZON - 24, 16, 0, 7); ctx.fill();
      }
      // からくり時計の大樹(時計職人の心臓): 幹に木の文字盤・歯車の歯・振り子。森に溶け込む=気配
      {
        const cx2 = 636, cb = HORIZON;
        ctx.fillStyle = "#4a3a28"; ctx.fillRect(cx2 - 30, cb - 150, 60, 150); // 幹
        ctx.fillStyle = "#3a2e1e"; ctx.fillRect(cx2 - 30, cb - 150, 10, 150); // 陰
        ctx.strokeStyle = "rgba(30,22,14,.4)"; ctx.lineWidth = 1; // 木目
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx2 - 22 + k * 14, cb); ctx.quadraticCurveTo(cx2 - 18 + k * 14, cb - 80, cx2 - 22 + k * 14, cb - 148); ctx.stroke(); }
        ctx.fillStyle = "#2e4a26"; // 樹冠
        ctx.beginPath(); ctx.arc(cx2, cb - 158, 56, 0, 7); ctx.arc(cx2 - 40, cb - 140, 34, 0, 7); ctx.arc(cx2 + 42, cb - 144, 32, 0, 7); ctx.fill();
        const fy = cb - 88;
        ctx.fillStyle = "#6b5436"; ctx.beginPath(); ctx.arc(cx2, fy, 24, 0, 7); ctx.fill(); // 木の文字盤
        ctx.strokeStyle = "#4a3a24"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx2, fy, 24, 0, 7); ctx.stroke();
        ctx.fillStyle = "#5a462c"; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.fillRect(cx2 + Math.cos(a) * 26 - 1.5, fy + Math.sin(a) * 26 - 1.5, 3, 3); } // 歯車の歯
        ctx.strokeStyle = "rgba(40,30,18,.6)"; ctx.lineWidth = 1; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx2 + Math.cos(a) * 20, fy + Math.sin(a) * 20); ctx.lineTo(cx2 + Math.cos(a) * 23, fy + Math.sin(a) * 23); ctx.stroke(); } // 刻み
        ctx.strokeStyle = "#3a2e1e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx2, fy); ctx.lineTo(cx2 + 8, fy - 12); ctx.moveTo(cx2, fy); ctx.lineTo(cx2 - 10, fy + 4); ctx.stroke(); // 針
        ctx.fillStyle = "#c9a86a"; ctx.beginPath(); ctx.arc(cx2, fy, 3, 0, 7); ctx.fill(); // 中心の真鍮ハブ(職人の芯)
      }
      // 中景の木立
      for (let i = 0; i < 6; i++) {
        const x = rand() * W, s = 0.7 + rand() * 0.6;
        ctx.fillStyle = "#233a1e";
        ctx.fillRect(x - 4 * s, HORIZON - 46 * s, 8 * s, 46 * s);
        ctx.beginPath(); ctx.arc(x, HORIZON - 52 * s, 26 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#2e4a26";
        ctx.beginPath(); ctx.arc(x - 10 * s, HORIZON - 44 * s, 16 * s, 0, 7); ctx.arc(x + 10 * s, HORIZON - 46 * s, 15 * s, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 20; i++) this.tuft(ctx, rand() * W, groundY(), "#2c4a22", rand);
    } else if (st.id === 4) { // 古代古墳: 湿地の水鏡に王墓が浮かぶ(悼みの地・水たまり・葦は残す)
      // 遠景の墳墓群(霞む前方後円墳の影=歴代の王が眠る=悼みの重なり・気配)
      for (const [nx, ns] of [[150, 0.5], [280, 0.36], [1000, 0.44], [1130, 0.32]]) {
        ctx.fillStyle = "rgba(60,78,64,.5)";
        ctx.beginPath(); ctx.ellipse(nx, HORIZON - 2, 90 * ns, 24 * ns, 0, Math.PI, 0); ctx.fill(); // 後円部
        ctx.beginPath(); ctx.moveTo(nx + 60 * ns, HORIZON); ctx.lineTo(nx + 110 * ns, HORIZON); ctx.lineTo(nx + 96 * ns, HORIZON - 16 * ns); ctx.lineTo(nx + 74 * ns, HORIZON - 16 * ns); ctx.closePath(); ctx.fill(); // 前方部
      }
      // 周濠(王墓を巡る水の帯)と、その水鏡に映る墳丘
      {
        const kx = 640, base = HORIZON;
        ctx.fillStyle = "rgba(120,160,170,.35)"; // 周濠の水
        ctx.beginPath(); ctx.ellipse(kx, base + 4, 230, 12, 0, 0, 7); ctx.fill();
        // 墳丘(二段・苔むした緑) — かつて王とされたトカゲの眠る場所
        ctx.fillStyle = "#46604a";
        ctx.beginPath(); ctx.ellipse(kx, base, 170, 46, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#527056";
        ctx.beginPath(); ctx.ellipse(kx, base - 26, 110, 32, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "rgba(30,45,32,.5)"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(kx, base, 170, 46, 0, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(kx, base - 26, 110, 32, 0, Math.PI, 0); ctx.stroke();
        // 玄室の入口(石組み)。副葬の金の脈動・燐火(緑の鬼火)はdrawTomb4が毎フレーム描く(キャッシュで凍結させない)
        ctx.fillStyle = "#3a3428";
        ctx.fillRect(kx - 13, base - 22, 26, 22);
        ctx.strokeStyle = "#241f14"; ctx.lineWidth = 1.6;
        ctx.strokeRect(kx - 13, base - 22, 26, 22);
        ctx.fillStyle = "#1c1810";
        ctx.fillRect(kx - 8, base - 16, 16, 16);
        // 玄室の入口に垂れる金鈴(2つ・クランクの金鈴と呼応=王墓の音の記憶)
        ctx.strokeStyle = "#8f7a4a"; ctx.lineWidth = 1;
        for (const bx of [kx - 10, kx + 10]) {
          ctx.beginPath(); ctx.moveTo(bx, base - 22); ctx.lineTo(bx, base - 14); ctx.stroke();
          ctx.fillStyle = "#c9a86a"; ctx.beginPath(); ctx.arc(bx, base - 12, 2.4, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(255,240,190,.5)"; ctx.beginPath(); ctx.arc(bx - 0.7, base - 12.7, 0.9, 0, 7); ctx.fill();
        }
        // 水鏡の反映(墳丘がぼんやり映る)
        ctx.save(); ctx.globalAlpha = 0.16; ctx.scale(1, -0.32); ctx.translate(0, -base * 2 / 0.32 * 0.32 - base * 2);
        ctx.fillStyle = "#46604a";
        ctx.beginPath(); ctx.ellipse(kx, -base * 2, 170, 46, 0, Math.PI, 0); ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(140,175,180,.18)"; // 反映の上の水面のゆらぎ
        ctx.beginPath(); ctx.ellipse(kx, base + 10, 150, 6, 0, 0, 7); ctx.fill();
      }
      // 埴輪の列(副葬の気配・うつろな目=悼み)
      for (const [hx2, hs] of [[330, 1], [432, 0.85], [878, 0.9], [975, 1]]) {
        const hy = HORIZON + 30;
        ctx.fillStyle = "#a89070";
        ctx.fillRect(hx2 - 6 * hs, hy - 22 * hs, 12 * hs, 22 * hs);
        ctx.beginPath(); ctx.arc(hx2, hy - 24 * hs, 6 * hs, 0, 7); ctx.fill();
        ctx.strokeStyle = "#5f5140"; ctx.lineWidth = 1;
        ctx.strokeRect(hx2 - 6 * hs, hy - 22 * hs, 12 * hs, 22 * hs);
        ctx.fillStyle = "#2c261c"; // うつろな目と口
        ctx.beginPath(); ctx.arc(hx2 - 2.2 * hs, hy - 25 * hs, 1.3 * hs, 0, 7); ctx.arc(hx2 + 2.2 * hs, hy - 25 * hs, 1.3 * hs, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx2, hy - 21.5 * hs, 1.4 * hs, 1.8 * hs, 0, 0, 7); ctx.fill();
      }

      for (let i = 0; i < 6; i++) {
        const x = 80 + rand() * (W - 160), y = groundY(), r = 26 + rand() * 44;
        ctx.fillStyle = "rgba(70,110,125,.65)";
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.42, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(160,210,220,.3)";
        ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.08, r * 0.9, r * 0.2, 0, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = rand() * W, y = groundY();
        ctx.strokeStyle = "#3a5a3a"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 22, x + 2, y - 34); ctx.stroke();
        ctx.fillStyle = "#6a5636";
        ctx.beginPath(); ctx.ellipse(x + 2, y - 34, 3, 8, 0.2, 0, 7); ctx.fill();
      }
    } else if (st.id === 5) { // 火山: 溶鉱炉文明(金属を鍛えた文明の心臓。神器/クランクはここで生まれた)
      // 遠景の火山(炉に取り込んだ火の源。クレーターの赤熱・山肌を流れ落ちる溶岩筋)
      {
        const vx = 1058;
        ctx.fillStyle = "#2a2018";
        ctx.beginPath(); ctx.moveTo(vx - 150, HORIZON); ctx.lineTo(vx - 26, HORIZON - 128); ctx.lineTo(vx + 30, HORIZON - 128); ctx.lineTo(vx + 158, HORIZON); ctx.closePath(); ctx.fill();
        const cr = ctx.createRadialGradient(vx, HORIZON - 126, 2, vx, HORIZON - 126, 30);
        cr.addColorStop(0, "rgba(255,120,50,.55)"); cr.addColorStop(1, "rgba(255,120,50,0)");
        ctx.fillStyle = cr; ctx.fillRect(vx - 30, HORIZON - 150, 60, 42);
        ctx.strokeStyle = "rgba(255,120,40,.45)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(vx - 6, HORIZON - 124); ctx.lineTo(vx - 32, HORIZON - 56); ctx.lineTo(vx - 22, HORIZON); ctx.stroke();
      }
      // 大溶鉱炉(鋳鉄の高炉・支持架構・リベット・出湯口が赤熱・煙突)
      {
        const fx = 372, fb = HORIZON;
        ctx.strokeStyle = "#241e1a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(fx - 44, fb); ctx.lineTo(fx - 28, fb - 92); ctx.moveTo(fx + 44, fb); ctx.lineTo(fx + 28, fb - 92); ctx.stroke();
        ctx.fillStyle = "#3a322c";
        ctx.beginPath(); ctx.moveTo(fx - 34, fb); ctx.lineTo(fx - 26, fb - 96); ctx.lineTo(fx + 26, fb - 96); ctx.lineTo(fx + 34, fb); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#4a4038"; ctx.fillRect(fx - 30, fb - 108, 60, 14); // 上部の口
        ctx.fillStyle = "rgba(18,14,10,.6)"; for (let ry = fb - 84; ry < fb - 4; ry += 20) ctx.fillRect(fx - 32, ry, 64, 3); // リベット帯
        ctx.fillStyle = "rgba(190,160,120,.4)"; for (let rx = fx - 28; rx < fx + 28; rx += 12) { ctx.beginPath(); ctx.arc(rx, fb - 74, 1.2, 0, 7); ctx.fill(); }
        ctx.fillStyle = "rgba(255,140,50,.45)"; ctx.fillRect(fx - 8, fb - 22, 16, 20); // 出湯口(静的ベース・脈動はdrawFurnace5)
        ctx.fillStyle = "#241e1a"; ctx.fillRect(fx + 20, fb - 152, 12, 56); // 煙突
      }
      // 鋳型の中で半分だけ鋳込まれた大歯車(=御神体/クランクの祖型。金属を神器へ鍛えた文明の匂わせ・説明しない)
      {
        const cx2 = 764, cy2 = HORIZON - 4;
        ctx.fillStyle = "#2c2620"; // 鋳型の台
        ctx.fillRect(cx2 - 40, cy2 - 6, 80, 6);
        ctx.save(); ctx.translate(cx2, cy2 - 34); ctx.rotate(-0.12);
        ctx.strokeStyle = "#3a332c"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke(); // 歯車の外環(鋳鉄)
        ctx.fillStyle = "#3a332c"; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.fillRect(Math.cos(a) * 28 - 2.5, Math.sin(a) * 28 - 2.5, 5, 5); } // 歯
        // 下半分は溶けた金属で満ちる(鋳込み中・静的ベース、輝きの脈動はdrawFurnace5)
        ctx.fillStyle = "rgba(255,150,60,.5)"; ctx.beginPath(); ctx.arc(0, 0, 22, 0.15, Math.PI - 0.15); ctx.fill();
        ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke(); // 真鍮色の縁(=真鍮クランクの祖)
        ctx.restore();
      }
      // 溶岩流(中景を横切る溶けた川・へりが赤熱)
      {
        const ly = HORIZON + 96;
        ctx.fillStyle = "#3a1c12";
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.bezierCurveTo(W * 0.3, ly - 14, W * 0.6, ly + 16, W, ly - 6); ctx.lineTo(W, ly + 22); ctx.bezierCurveTo(W * 0.6, ly + 34, W * 0.3, ly + 8, 0, ly + 26); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,120,40,.35)";
        ctx.beginPath(); ctx.moveTo(0, ly + 8); ctx.bezierCurveTo(W * 0.3, ly - 2, W * 0.6, ly + 22, W, ly + 4); ctx.lineTo(W, ly + 12); ctx.bezierCurveTo(W * 0.6, ly + 28, W * 0.3, ly + 6, 0, ly + 16); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 7; i++) {
        let x = rand() * W, y = groundY();
        ctx.strokeStyle = "rgba(255,120,40,.85)"; ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255,100,30,.9)"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let p = 0; p < 4; p++) { x += 18 + rand() * 30; y += (rand() - 0.5) * 26; ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (let i = 0; i < 8; i++) {
        const x = rand() * W, y = groundY(), r = 12 + rand() * 20;
        ctx.fillStyle = "#241814";
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r * 0.8, y + 4, r * 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.06)";
        ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.5, 0, 7); ctx.fill();
      }
    } else if (st.id === 6) { // 密林: 祭祀文明の森(蔦・シダは残し、食料神を祀る気配を載せる)
      // ドクロ調のトーテムポール(古代民族の死生観=神への畏敬)
      for (const [tx, th, tilt] of [[150, 92, -0.03], [1105, 78, 0.04]]) {
        ctx.save(); ctx.translate(tx, HORIZON + 8); ctx.rotate(tilt);
        ctx.fillStyle = "#4a3a26";
        ctx.fillRect(-9, -th, 18, th);
        ctx.strokeStyle = "#2c2114"; ctx.lineWidth = 1.4;
        ctx.strokeRect(-9, -th, 18, th);
        // 段ごとの彫り顔(最上段=ドクロ)
        for (let k = 0; k < 3; k++) {
          const sy = -th + 10 + k * 26;
          if (k === 0) { // ドクロ
            ctx.fillStyle = "#d8cfb8";
            ctx.beginPath(); ctx.arc(0, sy + 4, 7.5, 0, 7); ctx.fill();
            ctx.fillStyle = "#2c2114";
            ctx.beginPath(); ctx.arc(-3, sy + 3, 2, 0, 7); ctx.arc(3, sy + 3, 2, 0, 7); ctx.fill();
            ctx.fillRect(-3.5, sy + 8, 7, 2);
          } else {
            ctx.strokeStyle = "#2c2114"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(-3.5, sy + 3, 2.2, 0, 7); ctx.moveTo(6, sy + 3); ctx.arc(3.5, sy + 3, 2.2, 0, 7); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-5, sy + 10); ctx.lineTo(5, sy + 10); ctx.stroke();
          }
        }
        // 羽飾り
        ctx.strokeStyle = "#b8563a"; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-9, -th + 2); ctx.lineTo(-16, -th - 10); ctx.moveTo(9, -th + 2); ctx.lineTo(16, -th - 10); ctx.stroke();
        ctx.restore();
      }
      // 祭祀の篝火(台座+灯りのハロー。ゆれる炎・火の粉はdrawJungle6が毎フレーム描く=キャッシュで凍結させない)
      for (const fx2 of [420, 860]) {
        const fy = HORIZON + 26;
        ctx.fillStyle = "#4a3a26"; ctx.fillRect(fx2 - 7, fy - 12, 14, 12);
        ctx.strokeStyle = "#2c2114"; ctx.lineWidth = 1.2; ctx.strokeRect(fx2 - 7, fy - 12, 14, 12);
        const glow = ctx.createRadialGradient(fx2, fy - 20, 2, fx2, fy - 20, 24);
        glow.addColorStop(0, "rgba(255,180,90,.22)"); glow.addColorStop(1, "rgba(255,180,90,0)");
        ctx.fillStyle = glow; ctx.fillRect(fx2 - 24, fy - 44, 48, 48);
      }
      // 食料神を祀る祭壇(中央): 御神体=金環4スポークの車輪(=クランクの御神体車輪と同意匠=崇拝対象を絵で示す)。神の座す社として荘厳に
      {
        const ax = 640, ay = HORIZON + 14;
        // 参道: 祭壇へ続く踏み固められた道(多くが祈りに来た証・気配)
        ctx.fillStyle = "rgba(120,96,60,.20)";
        ctx.beginPath(); ctx.moveTo(ax - 58, HORIZON + 210); ctx.lineTo(ax - 22, ay + 3); ctx.lineTo(ax + 22, ay + 3); ctx.lineTo(ax + 58, HORIZON + 210); ctx.closePath(); ctx.fill();
        // 石の社(御神体を囲む祠のアーチ=神域)
        ctx.fillStyle = "#5a5142";
        ctx.fillRect(ax - 34, ay - 52, 8, 52); ctx.fillRect(ax + 26, ay - 52, 8, 52); // 二本柱
        ctx.beginPath(); ctx.moveTo(ax - 38, ay - 50); ctx.quadraticCurveTo(ax, ay - 72, ax + 38, ay - 50);
        ctx.lineTo(ax + 34, ay - 44); ctx.quadraticCurveTo(ax, ay - 62, ax - 34, ay - 44); ctx.closePath(); ctx.fill(); // 笠木
        ctx.strokeStyle = "#3a3428"; ctx.lineWidth = 1.2; ctx.strokeRect(ax - 34, ay - 52, 8, 52); ctx.strokeRect(ax + 26, ay - 52, 8, 52);
        ctx.fillStyle = "rgba(184,58,42,.7)"; ctx.fillRect(ax - 33, ay - 48, 6, 22); ctx.fillRect(ax + 27, ay - 48, 6, 22); // 奉納の赤布
        // 段状の基壇
        ctx.fillStyle = "#6a6152"; ctx.fillRect(ax - 26, ay - 8, 52, 8);
        ctx.fillStyle = "#7d745f"; ctx.fillRect(ax - 20, ay - 15, 40, 7);
        ctx.strokeStyle = "#3a3428"; ctx.lineWidth = 1.2; ctx.strokeRect(ax - 26, ay - 8, 52, 8); ctx.strokeRect(ax - 20, ay - 15, 40, 7);
        // 御神体=車輪(金環4スポーク)。翡翠の宝玉を中心に(脈動はdrawJungle6)
        ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(ax, ay - 27, 11, 0, 7); ctx.stroke();
        ctx.lineWidth = 1.8;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(ax, ay - 27); ctx.lineTo(ax + Math.cos(a) * 11, ay - 27 + Math.sin(a) * 11); ctx.stroke(); }
        ctx.fillStyle = "rgba(47,169,138,.55)"; ctx.beginPath(); ctx.arc(ax, ay - 27, 3.4, 0, 7); ctx.fill();
        // 供物(果実と虫かご=食料神への捧げ物)
        ctx.fillStyle = "#c9563a"; ctx.beginPath(); ctx.arc(ax - 13, ay - 18, 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#d9a13a"; ctx.beginPath(); ctx.arc(ax - 7, ay - 17, 2.6, 0, 7); ctx.fill();
        ctx.strokeStyle = "#4a3a26"; ctx.lineWidth = 1; ctx.strokeRect(ax + 7, ay - 21, 8, 6);
        ctx.beginPath(); ctx.moveTo(ax + 9, ay - 21); ctx.lineTo(ax + 9, ay - 15); ctx.moveTo(ax + 12, ay - 21); ctx.lineTo(ax + 12, ay - 15); ctx.stroke();
        // 祭壇の前の敷布
        ctx.fillStyle = "rgba(184,86,58,.35)";
        ctx.fillRect(ax - 18, ay, 36, 5);
      }

      for (let i = 0; i < 10; i++) { // 上から垂れる蔦
        const x = rand() * W;
        ctx.strokeStyle = "#2a4222"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 15, 40 + rand() * 40, x - 5, 70 + rand() * 80);
        ctx.stroke();
        ctx.fillStyle = "#3a5a2c";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.ellipse(x + (rand() - 0.5) * 16, 25 + k * 28, 7, 3.5, rand() * 2, 0, 7); ctx.fill();
        }
      }
      for (let i = 0; i < 14; i++) { // シダ
        const x = rand() * W, y = groundY(), s2 = 0.7 + rand() * 0.8;
        ctx.strokeStyle = "#39592c"; ctx.lineWidth = 2;
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + b * 12 * s2, y - 22 * s2, x + b * 20 * s2, y - 14 * s2);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 5; i++) { // 木漏れ日
        const x = rand() * W, y = HORIZON + 60 + rand() * 300;
        ctx.fillStyle = "rgba(255,250,190,.05)";
        ctx.beginPath(); ctx.ellipse(x, y, 60 + rand() * 60, 20 + rand() * 15, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 7) { // 水中都市: 水底に安らう静かな都(静寂・安寧=引き算の演出)
      // やわらかな水中光のシャフト(ゆっくり明滅する呼吸)
      for (const [sx, sw2, ph] of [[280, 90, 0], [640, 130, 2.1], [980, 70, 4.2]]) {
        const breathe = 0.05 + Math.sin(this.time * 0.35 + ph) * 0.02;
        const g2 = ctx.createLinearGradient(sx, 0, sx + 40, H * 0.8);
        g2.addColorStop(0, `rgba(190,225,240,${breathe * 2})`);
        g2.addColorStop(1, "rgba(190,225,240,0)");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(sx - sw2 * 0.3, 0); ctx.lineTo(sx + sw2 * 0.3, 0);
        ctx.lineTo(sx + sw2, H * 0.82); ctx.lineTo(sx - sw2, H * 0.82);
        ctx.closePath(); ctx.fill();
      }
      // 耐圧ドームの都(水底に静かに座る。窓の灯りは温かく安らぐ)
      const domes = [[180, 74, 0], [340, 40, 1], [780, 52, 0], [1080, 88, 2], [935, 34, 1]];
      for (const [dx, dr, kind] of domes) {
        ctx.fillStyle = kind === 2 ? "#2c4a58" : "#274250";
        ctx.beginPath(); ctx.arc(dx, HORIZON, dr, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "rgba(160,210,230,.28)"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(dx, HORIZON, dr, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = "rgba(160,210,230,.12)";
        ctx.beginPath(); ctx.arc(dx, HORIZON, dr * 0.66, Math.PI, 0); ctx.stroke();
        // 窓の灯り(温かい琥珀=眠る前の家の光)
        ctx.fillStyle = "rgba(255,214,150,.55)";
        const nw = Math.max(2, Math.floor(dr / 22));
        for (let k = 0; k < nw; k++) {
          const a = Math.PI + (Math.PI * (k + 1)) / (nw + 1);
          ctx.fillRect(dx + Math.cos(a) * dr * 0.55 - 2, HORIZON + Math.sin(a) * dr * 0.55 - 2, 4, 3);
        }
      }
      // ドームを結ぶ連絡通路(静かな都の生活動線)
      ctx.strokeStyle = "#274250"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(252, HORIZON - 8); ctx.lineTo(302, HORIZON - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(830, HORIZON - 10); ctx.lineTo(902, HORIZON - 10); ctx.stroke();
      ctx.strokeStyle = "rgba(255,214,150,.30)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(252, HORIZON - 8); ctx.lineTo(302, HORIZON - 8); ctx.stroke();
      // 気泡・海藻・コースティクス・深海の影は drawAbyss7(毎フレーム)で描く(paintBackgroundはキャッシュ=this.timeが凍結するため)
      // 水底: 真珠色の貝と丸石(静かな床)
      for (let i = 0; i < 7; i++) {
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "rgba(220,230,235,.5)";
        ctx.beginPath(); ctx.ellipse(x, y, 5 + rand() * 4, 3, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "rgba(120,150,160,.4)"; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 3.4); ctx.moveTo(x, y); ctx.lineTo(x + 2.6, y - 3); ctx.stroke();
      }
    } else if (st.id === 8) { // 氷の前線: 雪原の上に「与えられた」軍事技術の痕跡(気配まで・説明しない)
      const BLACK = "#14161a", BLACK2 = "#1d2026", RED = "224,64,64";
      // 監視柱(センサーパイロン): 非トカゲ的な完璧な直立・分節装甲・機械加工の精度。半分は雪と風化に呑まれ始めた
      const pylon = (px, ph, s) => {
        ctx.save();
        if (s < 1) ctx.globalAlpha = 0.5 + s * 0.45; // 奥は大気で霞む(パララックス)
        const w = 7 * s, hy = HORIZON - ph;
        // 半埋没の基部プレート(暗い断面)+風下の吹き溜まり
        ctx.fillStyle = BLACK2;
        ctx.beginPath(); ctx.ellipse(px, HORIZON + 3, 15 * s, 5 * s, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(221,232,242,.8)";
        ctx.beginPath(); ctx.ellipse(px - 10 * s, HORIZON + 4, 9 * s, 3 * s, 0, 0, 7); ctx.fill();
        // 分節装甲ポスト(3節・わずかに先細り・節ごとの目地)
        const segs = 3, segH = ph / segs;
        for (let i = 0; i < segs; i++) {
          const y0 = HORIZON - (i + 1) * segH, ww = w * (1 - i * 0.07);
          ctx.fillStyle = i % 2 ? BLACK : BLACK2;
          ctx.fillRect(px - ww, y0, ww * 2, segH - 1.2 * s);
          ctx.fillStyle = "rgba(0,0,0,.5)";
          ctx.fillRect(px - ww, HORIZON - i * segH - 1.2 * s, ww * 2, 1.2 * s);
        }
        // 左稜=機械加工の冷光シーム(精度が高すぎる)
        ctx.strokeStyle = `rgba(${COLD8},.4)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px - w + 0.5, hy); ctx.lineTo(px - w + 0.5, HORIZON - 2); ctx.stroke();
        // センサーヘッド(角ばった装甲筐体+くぼんだレンズソケット+アンテナ)
        ctx.fillStyle = BLACK2;
        ctx.beginPath();
        ctx.moveTo(px - 8 * s, hy); ctx.lineTo(px + 8 * s, hy);
        ctx.lineTo(px + 6.5 * s, hy - 11 * s); ctx.lineTo(px - 6.5 * s, hy - 11 * s); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(${COLD8},.3)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px - 6.5 * s, hy - 11 * s); ctx.lineTo(px + 6.5 * s, hy - 11 * s); ctx.stroke();
        ctx.fillStyle = "#0c0e12"; // レンズソケット(暗)
        ctx.beginPath(); ctx.arc(px, hy - 8 * s, 3.2 * s, 0, 7); ctx.fill();
        ctx.fillStyle = BLACK; // アンテナ
        ctx.fillRect(px + 5 * s, hy - 18 * s, 1.4 * s, 8 * s);
        // 静的な暗い単眼(呼吸する脈動グローはdrawMonolith8が重ねる)
        ctx.fillStyle = `rgba(${RED},.5)`;
        ctx.beginPath(); ctx.arc(px, hy - 8 * s, 1.5 * s, 0, 7); ctx.fill();
        ctx.restore();
      };
      for (const p of GRAKIS8.pylons) pylon(p.x, p.h, p.s);
      // 浮遊する黒いモノリス(接地しない=出所不明のオーバーテクノロジー・中景の異物)。
      // トカゲ文明の他の建造物(半埋没・風化した監視柱/巡回機)と精度が違いすぎる不気味さを担保する。
      {
        const M = MONO8, mx = M.mx, base = M.base, top = base - M.h;
        const splitY = base - M.h * M.splitF;

        // 真下の影(浮いている証拠)+ 雪の空白環(場が雪をはじく=異常)
        ctx.fillStyle = "rgba(0,0,0,.22)";
        ctx.beginPath(); ctx.ellipse(mx, HORIZON + 6, 30, 6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(${COLD8},.13)`; ctx.lineWidth = 1; // 同心の圧痕リング
        for (const rr of [40, 54]) { ctx.beginPath(); ctx.ellipse(mx, HORIZON + 6, rr, rr * 0.16, 0, 0, 7); ctx.stroke(); }

        // 全体を包むごく淡い冷たいリムグロー(異物感のベースライン・本体の背後)
        const rim = ctx.createRadialGradient(mx, (base + top) / 2, 6, mx, (base + top) / 2, M.h * 0.62);
        rim.addColorStop(0, `rgba(${COLD8},.10)`); rim.addColorStop(1, `rgba(${COLD8},0)`);
        ctx.fillStyle = rim; ctx.fillRect(mx - 46, top - 16, 92, M.h + 32);

        // 下seg・上seg(上segは水平にずれて浮く=作れるはずのない造形)。非侵食の完璧な稜線を面取りで示す
        const drawSeg = (y0, y1, dx) => {
          const h0 = mono8HalfW(y0), h1 = mono8HalfW(y1);
          ctx.fillStyle = BLACK;
          ctx.beginPath();
          ctx.moveTo(mx + dx - h0, y0); ctx.lineTo(mx + dx + h0, y0);
          ctx.lineTo(mx + dx + h1, y1); ctx.lineTo(mx + dx - h1, y1);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `rgba(${COLD8},.5)`; ctx.lineWidth = 1; // 左稜線=加工精度が高すぎる面取り光
          ctx.beginPath(); ctx.moveTo(mx + dx - h0, y0); ctx.lineTo(mx + dx - h1, y1); ctx.stroke();
          ctx.strokeStyle = `rgba(${COLD8},.16)`; // 右稜線のごく淡い反射
          ctx.beginPath(); ctx.moveTo(mx + dx + h0, y0); ctx.lineTo(mx + dx + h1, y1); ctx.stroke();
        };
        drawSeg(base, splitY, 0);                 // 下seg(接地せず浮く)
        drawSeg(splitY - M.gap, top, M.offset);   // 上seg(ずれて浮遊)

        // 頂部の斜め切り(非トカゲ的幾何)
        {
          const h1 = mono8HalfW(top), dx = M.offset;
          ctx.fillStyle = BLACK2;
          ctx.beginPath();
          ctx.moveTo(mx + dx - h1, top); ctx.lineTo(mx + dx + h1, top);
          ctx.lineTo(mx + dx + h1, top - 9); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `rgba(${COLD8},.4)`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mx + dx - h1, top); ctx.lineTo(mx + dx + h1, top - 9); ctx.stroke();
        }

        // 分割の空隙の冷光シーム(静的ベースライン。呼吸する冷光はdrawMonolith8)
        {
          const h = mono8HalfW(splitY);
          const seam = ctx.createLinearGradient(mx - h, splitY, mx + h, splitY);
          seam.addColorStop(0, `rgba(${COLD8},0)`); seam.addColorStop(0.5, `rgba(${COLD8},.30)`); seam.addColorStop(1, `rgba(${COLD8},0)`);
          ctx.fillStyle = seam; ctx.fillRect(mx - h, splitY - M.gap, h * 2 + M.offset, M.gap);
        }

        // 解読不能グリフ列(意味は描かない・等間隔で幾何学的=非トカゲ的な記号)
        ctx.fillStyle = `rgba(${COLD8},.22)`;
        for (let k = 0; k < M.glyphs; k++) {
          const y = base - 12 - k * ((M.h - 22) / (M.glyphs - 1));
          const seg = (y < splitY) ? 0 : M.offset;
          const gw = Math.max(3, mono8HalfW(y) * 0.7);
          ctx.fillRect(mx + seg - gw / 2, y, gw, 1.4);
        }
      }
      // 六角の黒い台座が雪に埋まる(精確すぎる幾何・グリッド状に配置=施工計画の痕跡)。休眠エミッタ核・ボルト・薄いグリフ
      const hexPad = (hx, r) => {
        const hy = HORIZON + 66;
        const vert = (rr) => { const pts = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.26; pts.push([hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.4]); } return pts; };
        const outer = vert(r);
        ctx.fillStyle = BLACK2; ctx.beginPath();
        outer.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = BLACK; ctx.beginPath(); // くぼんだ内パネル(同心六角)
        vert(r * 0.6).forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(180,196,210,.5)"; // 頂点のボルト
        for (const pt of outer) { ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.1, 0, 7); ctx.fill(); }
        ctx.strokeStyle = `rgba(${COLD8},.18)`; ctx.lineWidth = 1; // 薄いグリフ刻印(意味は描かない)
        ctx.beginPath(); ctx.moveTo(hx - r * 0.3, hy - r * 0.04); ctx.lineTo(hx + r * 0.3, hy - r * 0.04);
        ctx.moveTo(hx, hy - r * 0.12); ctx.lineTo(hx, hy + r * 0.08); ctx.stroke();
        ctx.fillStyle = `rgba(${RED},.3)`; // 休眠コア(静的暗点・脈動はdrawMonolith8)
        ctx.beginPath(); ctx.arc(hx, hy, 2, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(221,232,242,.85)"; // 縁の吹き溜まり
        ctx.beginPath(); ctx.ellipse(hx - r * 0.6, hy + 4, r * 0.5, 4, 0, 0, 7); ctx.fill();
      };
      for (const hx of GRAKIS8.hexes) hexPad(hx.x, hx.r);
      // 半分雪に埋もれた巡回機の残骸: 割れたセンサードーム・折れた脚・剥き出し配線・消えかけの眼。雪上に幾何学的な引き摺り痕
      {
        const wx = GRAKIS8.wreck.x, wy = HORIZON + 108;
        ctx.strokeStyle = "rgba(150,168,182,.18)"; ctx.lineWidth = 2; // 巡回痕(残骸へ続く2条=かつて動いていた)
        ctx.beginPath(); ctx.moveTo(wx + 122, wy + 20); ctx.lineTo(wx + 14, wy + 4);
        ctx.moveTo(wx + 124, wy + 26); ctx.lineTo(wx + 16, wy + 9); ctx.stroke();
        ctx.save(); ctx.translate(wx, wy); ctx.rotate(-0.16);
        ctx.fillStyle = BLACK; ctx.beginPath(); // 胴体(角ばった装甲・傾いて突き刺さる)
        ctx.moveTo(-22, 2); ctx.lineTo(20, -2); ctx.lineTo(18, -13); ctx.lineTo(-18, -11); ctx.closePath(); ctx.fill();
        ctx.fillStyle = BLACK2; ctx.beginPath(); ctx.arc(6, -13, 7, Math.PI, 0); ctx.fill(); // 割れたセンサードーム
        ctx.strokeStyle = `rgba(${COLD8},.25)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, -18); ctx.lineTo(6, -13); ctx.lineTo(4, -20); ctx.stroke(); // 亀裂
        ctx.strokeStyle = BLACK; ctx.lineWidth = 3; // 折れて突き出す脚
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-30, 10); ctx.lineTo(-26, 20); ctx.stroke();
        ctx.strokeStyle = "rgba(120,90,60,.6)"; ctx.lineWidth = 1.2; // 剥き出しの配線
        ctx.beginPath(); ctx.moveTo(18, -6); ctx.quadraticCurveTo(28, -2, 24, 6); ctx.stroke();
        ctx.fillStyle = `rgba(${RED},.3)`; ctx.beginPath(); ctx.arc(12, -8, 1.5, 0, 7); ctx.fill(); // 消えかけの眼
        ctx.restore();
        ctx.fillStyle = "rgba(221,232,242,.95)"; // 残骸に積もる雪
        ctx.beginPath(); ctx.ellipse(wx - 6, wy - 12, 17, 5, -0.16, 0, 7); ctx.fill();
      }
      // ---- 以下は元の雪原(オーロラ・雪・吹き溜まり) ----
      for (let i = 0; i < 3; i++) { // オーロラ
        const x0 = rand() * W;
        const grad = ctx.createLinearGradient(x0, 0, x0 + 200, HORIZON);
        grad.addColorStop(0, "rgba(120,255,190,.16)");
        grad.addColorStop(0.5, "rgba(140,180,255,.1)");
        grad.addColorStop(1, "rgba(120,255,190,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.quadraticCurveTo(x0 + 100, HORIZON * 0.5, x0 + 60, HORIZON - 20);
        ctx.lineTo(x0 + 140, HORIZON - 30);
        ctx.quadraticCurveTo(x0 + 190, HORIZON * 0.4, x0 + 90, 0);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 60; i++) { // 粉雪
        ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
        ctx.beginPath(); ctx.arc(rand() * W, rand() * H, 1 + rand() * 1.8, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 6; i++) { // 吹き溜まり
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.beginPath(); ctx.ellipse(x, y, 50 + rand() * 60, 10 + rand() * 8, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 9) { // 廃原子炉: 形の異なる原子炉モデル群(文明がもがいた試行錯誤の痕跡)
      const CHER = "111,184,160"; // チェレンコフ光
      const body = "#454e56", body2 = "#3d454d", edge = "rgba(255,255,255,.10)", rust = "rgba(150,90,55,.35)";
      // 遠景: 地平線まで連なる原子炉の影(形が全部違う=あらゆるモデルを試した=もがいた量)。霞ませて奥行き
      {
        let fx = 30;
        while (fx < W - 20) {
          const t = (fx * 0.013 + 1) % 4 | 0, fh = 26 + ((fx * 7) % 22);
          ctx.fillStyle = "rgba(58,66,74,.5)";
          if (t === 0) { ctx.beginPath(); ctx.moveTo(fx, HORIZON); ctx.quadraticCurveTo(fx + 5, HORIZON - fh * 0.6, fx + 3, HORIZON - fh); ctx.lineTo(fx + 15, HORIZON - fh); ctx.quadraticCurveTo(fx + 13, HORIZON - fh * 0.6, fx + 18, HORIZON); ctx.closePath(); ctx.fill(); } // 冷却塔
          else if (t === 1) { ctx.fillRect(fx, HORIZON - fh, 20, fh); ctx.beginPath(); ctx.arc(fx + 10, HORIZON - fh, 10, Math.PI, 0); ctx.fill(); } // ドーム
          else if (t === 2) { ctx.fillRect(fx, HORIZON - fh * 0.8, 24, fh * 0.8); ctx.fillRect(fx + 4, HORIZON - fh, 5, fh * 0.3); } // 角型+煙突
          else { ctx.beginPath(); ctx.arc(fx + 11, HORIZON - fh * 0.7, 11, 0, 7); ctx.fill(); ctx.fillRect(fx + 8, HORIZON - fh * 0.4, 6, fh * 0.4); } // 球形
          if ((fx * 13) % 5 === 0) { ctx.fillStyle = `rgba(${CHER},.14)`; ctx.fillRect(fx + 7, HORIZON - fh * 0.5, 3, 3); } // ごく淡い冷却光
          fx += 22 + ((fx * 3) % 16);
        }
        ctx.fillStyle = "rgba(30,36,42,.35)"; ctx.fillRect(0, HORIZON - 2, W, 4); // 遠景を沈める地平の帯
      }
      // 放射能トレフォイル(退色)を痕跡に忍ばせる(意味は説明しない・古い警告)
      const trefoil = (tx, ty, s, alpha) => {
        ctx.fillStyle = `rgba(210,180,60,${alpha})`;
        ctx.beginPath(); ctx.arc(tx, ty, s * 0.28, 0, 7); ctx.fill();
        for (let k = 0; k < 3; k++) {
          const a = k / 3 * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(tx, ty);
          ctx.arc(tx, ty, s, a - 0.52, a + 0.52); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = "rgba(20,22,26,.5)"; ctx.beginPath(); ctx.arc(tx, ty, s * 0.16, 0, 7); ctx.fill();
      };
      // a) 冷却塔(双曲面・ひび割れ) — 左
      {
        const x = 120, y = HORIZON, h2 = 120, wTop = 34, wMid = 22, wBot = 40;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(x - wBot, y);
        ctx.bezierCurveTo(x - wMid, y - h2 * 0.55, x - wMid, y - h2 * 0.6, x - wTop, y - h2);
        ctx.lineTo(x + wTop, y - h2);
        ctx.bezierCurveTo(x + wMid, y - h2 * 0.6, x + wMid, y - h2 * 0.55, x + wBot, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = edge; ctx.fillRect(x - wTop, y - h2, wTop * 2, 3);
        ctx.strokeStyle = rust; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 8, y - h2 + 4); ctx.lineTo(x - 12, y - 30); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 14, y - 20); ctx.lineTo(x + 6, y - 58); ctx.lineTo(x + 16, y - 74); ctx.stroke(); // ひび
        trefoil(x, y - 46, 8, 0.32); // 退色した放射能警告(意味は説明しない)
      }
      // b) 格納容器ドーム(円筒+ドーム・扉から冷却光が漏れる) — 中央左
      {
        const x = 400, y = HORIZON, w2 = 46, h2 = 52;
        ctx.fillStyle = body2; ctx.fillRect(x - w2 / 2, y - h2, w2, h2);
        ctx.beginPath(); ctx.arc(x, y - h2, w2 / 2, Math.PI, 0); ctx.fill();
        ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(x, y - h2, w2 / 2, Math.PI, Math.PI * 1.5); ctx.lineTo(x, y - h2); ctx.fill();
        const gl = ctx.createRadialGradient(x, y - 10, 2, x, y - 10, 26);
        gl.addColorStop(0, `rgba(${CHER},.55)`); gl.addColorStop(1, `rgba(${CHER},0)`);
        ctx.fillStyle = gl; ctx.fillRect(x - 26, y - 36, 52, 40);
        ctx.fillStyle = `rgba(${CHER},.75)`; ctx.fillRect(x - 5, y - 18, 10, 18); // 開いた扉
      }
      // c) 角型炉(排気筒2本・警告ストライプ・傾いて廃棄) — 中央右
      {
        const x = 700, y = HORIZON;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.05);
        ctx.fillStyle = body; ctx.fillRect(-52, -64, 104, 64);
        ctx.fillStyle = body2; ctx.fillRect(-38, -96, 12, 32); ctx.fillRect(12, -88, 12, 24);
        ctx.fillStyle = edge; ctx.fillRect(-52, -64, 104, 3);
        for (let k = 0; k < 5; k++) { // 剥げかけ警告ストライプ
          ctx.fillStyle = k % 2 ? "rgba(201,162,39,.5)" : "rgba(30,30,30,.5)";
          ctx.fillRect(-52 + k * 21, -12, 18, 12);
        }
        // 応急修理: 規格違いの継ぎ板+黄テープ(ちゃちさ=クランクの布石。技量があるのに雑に直した痕跡)
        ctx.fillStyle = "#5c6570"; ctx.fillRect(-20, -50, 26, 20); // 色違いの継ぎ板
        ctx.strokeStyle = "rgba(30,34,40,.6)"; ctx.lineWidth = 1; ctx.strokeRect(-20, -50, 26, 20);
        ctx.fillStyle = "rgba(214,184,66,.75)"; // 黄テープ(斜めに雑)
        ctx.save(); ctx.translate(-7, -40); ctx.rotate(0.32); ctx.fillRect(-16, -3, 32, 6); ctx.restore();
        ctx.fillStyle = `rgba(${CHER},.5)`;
        ctx.fillRect(-30, -46, 7, 5); ctx.fillRect(6, -40, 7, 5); // 窓の冷却光
        ctx.restore();
      }
      // d) 球形炉(架台の球・半分だけ光る) — 右
      {
        const x = 980, y = HORIZON, r = 30;
        ctx.strokeStyle = body2; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x - 8, y - 34); ctx.moveTo(x + 20, y); ctx.lineTo(x + 8, y - 34); ctx.stroke();
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(x, y - 56, r, 0, 7); ctx.fill();
        ctx.fillStyle = edge;
        ctx.beginPath(); ctx.arc(x - 8, y - 64, r * 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${CHER},.35)`;
        ctx.beginPath(); ctx.arc(x, y - 56, r, Math.PI * 0.25, Math.PI * 0.75); ctx.lineTo(x, y - 56); ctx.fill();
      }
      // e) 小型モジュール炉の列(量産型=使い捨て文明の気配) — 右端
      for (let k = 0; k < 3; k++) {
        const x = 1130 + k * 42, y = HORIZON;
        ctx.fillStyle = k === 1 ? body2 : body;
        ctx.fillRect(x, y - 30, 30, 30);
        ctx.beginPath(); ctx.arc(x + 15, y - 30, 15, Math.PI, 0); ctx.fill();
        ctx.fillStyle = `rgba(${CHER},${k === 1 ? .15 : .55})`; // 1基は死んでいる
        ctx.fillRect(x + 11, y - 14, 8, 6);
      }
      // 地面: 廃棄ドラム缶+冷却水たまりの反射
      for (let i = 0; i < 6; i++) {
        const x = rand() * W, y = groundY();
        ctx.fillStyle = i % 2 ? "#4e565e" : "#5a4a3a";
        ctx.fillRect(x, y - 9, 8, 9);
        ctx.fillStyle = edge; ctx.fillRect(x, y - 9, 8, 2);
      }
      for (let i = 0; i < 4; i++) {
        const x = rand() * W, y = groundY();
        const gl = ctx.createRadialGradient(x, y, 2, x, y, 30);
        gl.addColorStop(0, `rgba(${CHER},.22)`); gl.addColorStop(1, `rgba(${CHER},0)`);
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.ellipse(x, y, 30, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${CHER},.30)`;
        ctx.beginPath(); ctx.ellipse(x, y, 14, 3.5, 0, 0, 7); ctx.fill();
      }
    } else if (st.id === 10) { // 古代遺跡: 文明の末路・原点回帰(発展を極めて、静寂へ還った地)。閑散=あえて動かさない
      // 黄昏の帯(地平に沈む金・長い静けさ)
      {
        const dusk = ctx.createLinearGradient(0, HORIZON - 60, 0, HORIZON);
        dusk.addColorStop(0, "rgba(201,162,39,0)"); dusk.addColorStop(1, "rgba(201,162,39,.12)");
        ctx.fillStyle = dusk; ctx.fillRect(0, HORIZON - 60, W, 60);
      }
      // 崩れた渾天儀(天文台の遺構=この文明が星を極めた証・羅針盤クランクと同じ天測の科学。今は静止し苔むす)
      {
        const ox = 648, oy = HORIZON - 4;
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(ox, oy + 3, 54, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#8f8168"; ctx.fillRect(ox - 48, oy - 14, 96, 14); // 段状の石基壇
        ctx.fillStyle = "#a2937a"; ctx.fillRect(ox - 38, oy - 25, 76, 12);
        ctx.fillStyle = "#b3a58c"; ctx.fillRect(ox - 28, oy - 34, 56, 10);
        const cy = oy - 74;
        ctx.strokeStyle = "#9a8c74"; ctx.lineWidth = 6; ctx.lineCap = "round"; // 外環(傾き・一部欠け=時が壊した)
        ctx.beginPath(); ctx.ellipse(ox, cy, 40, 38, 0.16, -Math.PI * 0.12, Math.PI * 1.62); ctx.stroke();
        ctx.strokeStyle = "#b3a58c"; ctx.lineWidth = 3; // 内環(交差=精緻な天球の骨組み)
        ctx.beginPath(); ctx.ellipse(ox, cy, 40, 15, 0.16, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(ox, cy, 15, 38, 0.16, 0, 7); ctx.stroke();
        ctx.fillStyle = "#c9a86a"; ctx.beginPath(); ctx.arc(ox, cy, 6, 0, 7); ctx.fill(); // 中心の天球儀(金)
        ctx.fillStyle = "rgba(255,240,180,.6)"; ctx.beginPath(); ctx.arc(ox - 2, cy - 2, 2, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(90,130,70,.5)"; // 苔
        ctx.beginPath(); ctx.ellipse(ox - 30, oy - 8, 10, 4, 0.3, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ox + 22, cy + 20, 6, 8, 0.2, 0, 7); ctx.fill();
        ctx.fillStyle = "#9a8c74"; // 折れて倒れた支柱の破片
        ctx.save(); ctx.translate(ox + 60, oy - 6); ctx.rotate(0.5); ctx.fillRect(-4, -30, 8, 30); ctx.restore();
      }
      for (let i = 0; i < 7; i++) { // 崩れた石柱
        const x = 60 + rand() * (W - 120), y = groundY();
        const h2 = 40 + rand() * 70, w2 = 16 + rand() * 8;
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath(); ctx.ellipse(x, y + 4, w2 * 1.3, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#9a8c74";
        ctx.fillRect(x - w2 / 2, y - h2, w2, h2);
        ctx.fillStyle = "#b3a58c";
        ctx.fillRect(x - w2 / 2 - 3, y - h2 - 8, w2 + 6, 9);
        ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1.5;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath(); ctx.moveTo(x - w2 / 2, y - (h2 / 4) * k); ctx.lineTo(x + w2 / 2, y - (h2 / 4) * k); ctx.stroke();
        }
        ctx.fillStyle = "rgba(90,130,70,.5)"; // 苔
        ctx.beginPath(); ctx.ellipse(x - w2 / 4, y - h2 + 6, w2 / 3, 5, 0.4, 0, 7); ctx.fill();
      }
      // 倒れた巨像(かつて王とされたトカゲの石像・横倒し半埋没=王の末路。目の窪みは空、王冠は折れて半分だけ金)
      {
        const sx = 268, sy = HORIZON + 56;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.07);
        ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(4, 10, 66, 10, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#9a8c74"; // 横たわる胴(石)
        ctx.beginPath(); ctx.moveTo(-60, 8); ctx.lineTo(28, 5); ctx.quadraticCurveTo(52, 2, 58, -8);
        ctx.lineTo(46, -16); ctx.quadraticCurveTo(18, -12, -60, -4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#a2937a"; ctx.beginPath(); ctx.ellipse(52, -10, 15, 11, 0, 0, 7); ctx.fill(); // 頭
        ctx.fillStyle = "rgba(28,24,18,.65)"; ctx.beginPath(); ctx.arc(56, -12, 2.3, 0, 7); ctx.fill(); // 空の眼窩
        ctx.fillStyle = "#c9a86a"; // 折れた金の王冠(半分だけ残る)
        ctx.beginPath(); ctx.moveTo(44, -20); ctx.lineTo(48, -28); ctx.lineTo(52, -20); ctx.lineTo(56, -27); ctx.lineTo(59, -19); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-2, 6); ctx.stroke(); // ひび
        ctx.fillStyle = "rgba(90,130,70,.5)"; ctx.beginPath(); ctx.ellipse(-28, 0, 11, 5, 0.2, 0, 7); ctx.fill(); // 苔
        ctx.restore();
        ctx.fillStyle = "rgba(180,165,130,.45)"; ctx.beginPath(); ctx.ellipse(sx - 36, sy + 8, 38, 7, 0, 0, 7); ctx.fill(); // 吹き溜まった砂
      }
      for (let i = 0; i < 8; i++) { // 金の遺物のきらめき
        const x = rand() * W, y = groundY();
        ctx.fillStyle = "#d9b45a";
        ctx.beginPath(); ctx.arc(x, y, 3 + rand() * 3, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,240,180,.8)";
        ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.2, 0, 7); ctx.fill();
      }
      // 文明の全所業を象る金の遺物(辿ってきた全ての惑星の記憶を静かに納める=原点回帰の暗示・説明しない)
      {
        const relic = (rx, ry, kind) => {
          ctx.fillStyle = "#c9a86a";
          if (kind === 0) { ctx.fillRect(rx - 2, ry - 13, 4, 13); ctx.fillRect(rx - 1, ry - 17, 3, 4); }         // モノリス片
          else if (kind === 1) { ctx.fillRect(rx - 6, ry - 5, 12, 5); ctx.beginPath(); ctx.arc(rx, ry - 5, 6, Math.PI, 0); ctx.fill(); } // 格納容器ドーム
          else { ctx.beginPath(); ctx.arc(rx, ry - 6, 6, 0, 7); ctx.fill(); ctx.fillStyle = "#8f8168"; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.fillRect(rx + Math.cos(a) * 6 - 0.6, ry - 6 + Math.sin(a) * 6 - 0.6, 1.2, 1.2); } } // 羅針盤/歯車
          ctx.fillStyle = "rgba(255,240,180,.5)"; ctx.beginPath(); ctx.arc(rx - 1, ry - 8, 1, 0, 7); ctx.fill();
        };
        relic(150, HORIZON + 150, 0); relic(556, HORIZON + 210, 1); relic(910, HORIZON + 250, 2);
      }
    }
  },

  cactus(ctx, x, y, s) {
    ctx.fillStyle = "#4e7a35";
    ctx.strokeStyle = "#33511f"; ctx.lineWidth = 2;
    rr(ctx, x - 9 * s, y - 62 * s, 18 * s, 62 * s, 9 * s); ctx.fill(); ctx.stroke();
    rr(ctx, x - 30 * s, y - 48 * s, 12 * s, 26 * s, 6 * s); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 30 * s, y - 26 * s, 22 * s, 8 * s);
    rr(ctx, x + 18 * s, y - 40 * s, 12 * s, 20 * s, 6 * s); ctx.fill(); ctx.stroke();
    ctx.fillRect(x + 8 * s, y - 24 * s, 22 * s, 8 * s);
  },

  tuft(ctx, x, y, color, rand) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let b = -3; b <= 3; b++) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + b * 3, y - 8, x + b * 5, y - 13 - Math.abs(b));
    }
    ctx.stroke();
  },

  // 立体感のある岩(不規則多角形+接地影+ハイライト面)
  boulder(ctx, rand, x, y, r, baseCol) {
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.beginPath(); ctx.ellipse(x + r * 0.12, y + r * 0.42, r * 1.15, r * 0.4, 0, 0, 7); ctx.fill();
    const nv = 8, vx = [], vy = [];
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * Math.PI * 2;
      const rr2 = r * (0.75 + rand() * 0.4) * (Math.sin(a) > 0 ? 0.82 : 1);
      vx.push(x + Math.cos(a) * rr2);
      vy.push(y + Math.sin(a) * rr2 * 0.82);
    }
    ctx.fillStyle = baseCol || "#4a4034";
    ctx.beginPath(); ctx.moveTo(vx[0], vy[0]);
    for (let i = 1; i < nv; i++) ctx.lineTo(vx[i], vy[i]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    // 左上のハイライト面
    ctx.fillStyle = "rgba(255,255,255,.13)";
    ctx.beginPath();
    ctx.moveTo(vx[4], vy[4]); ctx.lineTo(vx[5], vy[5]); ctx.lineTo(vx[6], vy[6]); ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill();
  },

  // ---------------- 設備 ----------------
  // Phase8: 水場をtierで育てる(水たまり→池→湖→大湖)。定位置(P.water)で規模と生態系が育ち、背景と融合する。
  // 骨格は共通・惑星別意匠は後日(色/植生をここに集約すれば差し替え可能)。per-frameで軽量に。
  _drawWater(ctx, p, lv) {
    const info = waterTierInfo(lv), rx = info.rx, ry = info.ry, tier = info.tier;
    if (tier >= 4) { this._drawGrandLake(ctx); return; } // 大湖(§8.6): 画面左下へ広がる巨大な湖(別レイアウト)
    // 岸(砂/土の縁=地面と馴染む)
    ctx.fillStyle = "#8a7350"; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 1.14, ry * 1.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + ry * 0.06, rx * 1.05, ry * 1.05, 0, 0, 7); ctx.fill();
    if (tier >= 4) this._waterShore(ctx, p, rx, ry);       // 大湖: 豊かな岸辺(草・花)を水の外側に敷く
    // 水本体(深→浅・tierで層を増やす)
    ctx.fillStyle = "#20415a"; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#356485"; ctx.beginPath(); ctx.ellipse(p.x - rx * 0.04, p.y - ry * 0.08, rx * 0.78, ry * 0.76, 0, 0, 7); ctx.fill();
    if (tier >= 2) { ctx.fillStyle = "#5b93b5"; ctx.beginPath(); ctx.ellipse(p.x - rx * 0.1, p.y - ry * 0.16, rx * 0.5, ry * 0.5, 0, 0, 7); ctx.fill(); }
    if (tier >= 3) { ctx.fillStyle = "rgba(150,205,228,.55)"; ctx.beginPath(); ctx.ellipse(p.x - rx * 0.14, p.y - ry * 0.2, rx * 0.26, ry * 0.28, 0, 0, 7); ctx.fill(); }
    // 波紋(per-frame)
    ctx.strokeStyle = "rgba(210,240,252,.3)"; ctx.lineWidth = 1.6;
    for (const off of [0, 1.5]) { const w = ((this.time + off) % 3) / 3; ctx.globalAlpha = 1 - w; ctx.beginPath(); ctx.ellipse(p.x, p.y - ry * 0.1, rx * 0.5 * w + 6, (rx * 0.5 * w + 6) * 0.4, 0, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // きらめき
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(p.x - rx * 0.3, p.y - ry * 0.35, Math.max(5, rx * 0.1), 2, -0.2, 0, 7); ctx.fill();
    if (tier >= 3) { ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(p.x + rx * 0.2, p.y + ry * 0.2, rx * 0.07, 1.5, 0.15, 0, 7); ctx.fill(); }
    // 睡蓮(tier2+・tierで数増。最内の1枚はtier4で花が咲く)
    if (tier >= 2) { const pads = [[-.3, -.1], [.35, .12], [.08, .34], [-.12, -.32]]; for (let i = 0; i < tier - 1 && i < pads.length; i++) this._lilyPad(ctx, p.x + pads[i][0] * rx, p.y + pads[i][1] * ry, Math.max(6, rx * 0.11), tier >= 4 && i === 0); }
    if (tier >= 3) this.boulder(ctx, lcg(555), p.x + rx * 0.9, p.y - ry * 0.3, Math.max(10, rx * 0.14), "#6b5c4a"); // 岸辺の岩
    if (tier >= 2) this._reeds(ctx, p, rx, ry, tier);       // 葦(奥の縁・tierで本数増・微揺れ)
    if (tier >= 4) this._spring(ctx, p, rx, ry);            // 大湖: 泉の流れ込み+着水の波紋+靄
  },
  _lilyPad(ctx, x, y, r, flower) {
    ctx.fillStyle = "#3f7a3c"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0.5, Math.PI * 2 - 0.5); ctx.fill(); // 切れ込みのある葉
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.14, r * 0.4, r * 0.2, 0, 0, 7); ctx.fill();
    if (flower) {
      ctx.fillStyle = "#e8a0c0"; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.16, r * 0.18, r * 0.1, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#f5d76e"; ctx.beginPath(); ctx.arc(x, y, r * 0.13, 0, 7); ctx.fill();
    }
  },
  _reeds(ctx, p, rx, ry, tier) {
    const n = tier + 1, bx = p.x - rx * 0.5, by = p.y - ry * 0.72;
    ctx.strokeStyle = "#4a7a3a"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = bx + i * 6 - n * 3, h = 24 + (i % 3) * 8, sway = Math.sin(this.time * 1.2 + i) * 3;
      ctx.strokeStyle = "#4a7a3a"; ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + sway * 0.5, by - h * 0.6, x + sway, by - h); ctx.stroke();
      ctx.fillStyle = "#6b4a2a"; ctx.beginPath(); ctx.ellipse(x + sway, by - h, 2.2, 6, 0, 0, 7); ctx.fill(); // 穂
    }
  },
  _spring(ctx, p, rx, ry) {
    const sx = p.x - rx * 0.18, sy = p.y - ry - 8;
    this.boulder(ctx, lcg(888), sx, sy, 14, "#5d5142"); // 湧き出す小岩
    ctx.strokeStyle = "rgba(200,235,250,.6)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(sx, sy + 4); ctx.lineTo(sx + 2, p.y - ry * 0.4); ctx.stroke(); // 流れ落ちる水
    const w = (this.time % 1);
    ctx.strokeStyle = `rgba(220,245,255,${0.5 * (1 - w)})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(sx + 2, p.y - ry * 0.4, 6 + w * 10, (6 + w * 10) * 0.4, 0, 0, 7); ctx.stroke(); // 着水の波紋
    ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.beginPath(); ctx.ellipse(p.x, p.y - ry * 0.5, rx * 0.6, ry * 0.5, 0, 0, 7); ctx.fill(); // 靄
  },
  _waterShore(ctx, p, rx, ry) {
    const rand = lcg(333);
    for (let i = 0; i < 11; i++) {
      const a = rand() * Math.PI * 2, d = rx * (1.02 + rand() * 0.14);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.42;
      this.tuft(ctx, x, y, "#4a7a3a", rand);
      if (rand() < 0.28) { ctx.fillStyle = rand() < 0.5 ? "#e8a0c0" : "#f5d76e"; ctx.beginPath(); ctx.arc(x + rand() * 8 - 4, y - 6, 2, 0, 7); ctx.fill(); }
    }
  },
  _reedCluster(ctx, bx, by, n) {
    ctx.lineWidth = 2.4; ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = bx + i * 5 - n * 2.5, h = 22 + (i % 3) * 9, sway = Math.sin(this.time * 1.2 + i + bx * 0.1) * 3;
      ctx.strokeStyle = "#4a7a3a"; ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + sway * 0.5, by - h * 0.6, x + sway, by - h); ctx.stroke();
      ctx.fillStyle = "#6b4a2a"; ctx.beginPath(); ctx.ellipse(x + sway, by - h, 2.2, 6, 0, 0, 7); ctx.fill();
    }
  },
  // Phase8.6: 大湖=画面左下の隅へ沈み画面外へ広がる巨大な湖。さざ波が流れ、岸辺=浅瀬でトカゲが水浴び(§8.5スポット)。
  // 水浴びスポット(§8.5・記録): 浅瀬 ≈ (300,620)・岸へ歩いて入れる。飛び石 (340,618)/(250,648)。
  _drawGrandLake(ctx) {
    const lcx = 120, lcy = 702, lrx = 360, lry = 156;
    ctx.fillStyle = "#8a7350"; ctx.beginPath(); ctx.ellipse(lcx, lcy, lrx + 20, lry + 18, 0, 0, 7); ctx.fill(); // 砂/土の岸
    ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.beginPath(); ctx.ellipse(lcx, lcy - 2, lrx + 8, lry + 6, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(lcx, lcy, lrx, lry, 0, 0, 7); ctx.clip();
    const wg = ctx.createLinearGradient(lcx + lrx * 0.7, lcy - lry * 0.7, lcx - lrx * 0.6, lcy + lry * 0.6);
    wg.addColorStop(0, "#5a97b8"); wg.addColorStop(0.42, "#356883"); wg.addColorStop(1, "#173245"); // 岸=明/奥=深
    ctx.fillStyle = wg; ctx.fillRect(lcx - lrx, lcy - lry, lrx * 2, lry * 2);
    ctx.fillStyle = "rgba(150,205,225,.4)"; ctx.beginPath(); ctx.ellipse(lcx + lrx * 0.5, lcy - lry * 0.42, lrx * 0.5, lry * 0.42, -0.35, 0, 7); ctx.fill(); // 浅瀬
    ctx.fillStyle = "rgba(195,228,242,.32)"; ctx.beginPath(); ctx.ellipse(lcx + lrx * 0.62, lcy - lry * 0.5, lrx * 0.3, lry * 0.26, -0.35, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(210,238,250,.16)"; ctx.lineWidth = 1.3; // さざ波(per-frame)
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); const baseY = lcy - lry * 0.85 + i * 24;
      for (let x = lcx - lrx; x <= lcx + lrx; x += 22) { const yy = baseY + Math.sin(x * 0.04 + this.time * 1.3 + i * 0.6) * 3.5 + Math.sin(this.time * 0.7 + i) * 2; x === lcx - lrx ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,.4)"; // きらめき
    for (const [sx, sy] of [[260, 600], [180, 662], [330, 632]]) { ctx.globalAlpha = 0.4 + Math.sin(this.time * 3 + sx) * 0.4; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 1.6, 0.2, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 岸辺の植生(land側=上右の弧)+ 浅瀬の飛び石(水遊びの足場)+ 睡蓮
    const shore = (a) => [lcx + Math.cos(a) * (lrx + 6), lcy + Math.sin(a) * (lry + 4)];
    for (const a of [-0.2, -0.42, -0.62]) { const [sx, sy] = shore(a); this._reedCluster(ctx, sx, sy, 4); }
    const gr = lcg(717); for (let i = 0; i < 9; i++) { const a = -0.1 - gr() * 0.62; const [sx, sy] = shore(a); this.tuft(ctx, sx + (gr() - 0.5) * 20, sy + 3, "#4a7a3a", gr); if (gr() < 0.3) { ctx.fillStyle = gr() < 0.5 ? "#e8a0c0" : "#f5d76e"; ctx.beginPath(); ctx.arc(sx, sy - 6, 2, 0, 7); ctx.fill(); } }
    this.boulder(ctx, lcg(88), 340, 618, 14, "#6b5c4a"); // 飛び石(足場)
    this.boulder(ctx, lcg(89), 250, 648, 10, "#5d5142");
    this._lilyPad(ctx, 200, 622, 12, true); this._lilyPad(ctx, 300, 662, 11, false); this._lilyPad(ctx, 140, 642, 10, false);
  },

  // Phase8.8: 保温設備(UFO転送ビーム着想・文明の叡智)。1置き型ライト/2温室/3空中ライト小/4空中ライト大+転送。
  // §8.5 居場所(群れが集まる面): tier1-2=温床の床、tier3-4=地上の広い光面 ≈ (P.light.x, P.light.y+44)・半径 beamR。
  _drawHeat(ctx, p, lv) {
    const info = heatTierInfo(lv), tier = info.tier;
    const cx = p.x, gy = p.y + 44, flick = 0.85 + Math.sin(this.time * 6) * 0.1;
    if (tier === 1) { // 置き型ライト: 地上の素朴な照明+暖かい光だまり(バスキング面)
      ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.beginPath(); ctx.ellipse(cx, gy + 4, 72, 20, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,206,110,${0.16 * flick})`; ctx.beginPath(); ctx.ellipse(cx, gy, 78, 22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4a4640"; rr(ctx, cx - 12, gy - 3, 24, 7, 2); ctx.fill();
      ctx.strokeStyle = "#3d3830"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx, gy - 3); ctx.lineTo(cx, gy - 44); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, gy - 44); ctx.lineTo(cx - 18, gy - 50); ctx.stroke();
      this._heatLamp(ctx, cx - 20, gy - 48, flick);
      return;
    }
    if (tier === 2) { this._drawGreenhouse(ctx, cx, gy, info, flick); return; } // 温室(地上設置の完成形)
    this._drawAerialLight(ctx, cx, gy, info, flick); // tier3-4: 空中ライト(科学が地面を離れた証)
  },
  // 温室(tier2): ガラスの叡智+中央の広い温床の床(群れが集まる)。§8.5 居場所=温床の床。
  _drawGreenhouse(ctx, cx, gy, info, flick) {
    const w = info.w, h = info.h, hw = w / 2, top = gy - h, eaveY = top + h * 0.36;
    ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.ellipse(cx, gy + 5, hw * 1.05, hw * 0.24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a4038"; ctx.fillRect(cx - hw - 2, gy - 5, w + 4, 7);
    ctx.fillStyle = "rgba(200,224,233,.16)"; ctx.fillRect(cx - hw, eaveY, w, gy - eaveY);
    const ig = ctx.createLinearGradient(cx, eaveY, cx, gy); ig.addColorStop(0, `rgba(255,196,120,${0.14 * flick})`); ig.addColorStop(1, `rgba(255,168,88,${0.08 * flick})`);
    ctx.fillStyle = ig; ctx.fillRect(cx - hw, eaveY, w, gy - eaveY);
    ctx.fillStyle = "rgba(200,224,233,.2)"; ctx.beginPath(); ctx.moveTo(cx - hw, eaveY); ctx.lineTo(cx, top); ctx.lineTo(cx + hw, eaveY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6b5a48"; ctx.beginPath(); ctx.ellipse(cx, gy - 3, hw * 0.82, hw * 0.15, 0, 0, 7); ctx.fill(); // 広い温床の床(群れ)
    ctx.fillStyle = `rgba(255,150,70,${0.15 + Math.sin(this.time * 3) * 0.05})`; ctx.beginPath(); ctx.ellipse(cx, gy - 4, hw * 0.72, hw * 0.11, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#4a4640"; ctx.lineWidth = 3.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx - hw, gy); ctx.lineTo(cx - hw, eaveY); ctx.lineTo(cx, top); ctx.lineTo(cx + hw, eaveY); ctx.lineTo(cx + hw, gy); ctx.stroke();
    ctx.strokeStyle = "rgba(170,196,208,.55)"; ctx.lineWidth = 1.4;
    for (const fx of [-0.6, -0.3, 0, 0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(cx + fx * hw, eaveY); ctx.lineTo(cx + fx * hw, gy); ctx.stroke(); }
    for (const fy of [0.4, 0.72]) { const yy = eaveY + (gy - eaveY) * fy; ctx.beginPath(); ctx.moveTo(cx - hw, yy); ctx.lineTo(cx + hw, yy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, eaveY); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * hw * 0.5, eaveY); ctx.lineTo(cx + s * hw * 0.25, (top + eaveY) / 2); ctx.stroke(); }
    ctx.strokeStyle = "#4a4640"; ctx.lineWidth = 2; ctx.strokeRect(cx + hw * 0.5 - 11, gy - 30, 22, 30); // ドア
    ctx.fillStyle = "#6a665e"; ctx.beginPath(); ctx.arc(cx + hw * 0.5 - 7, gy - 15, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a3630"; ctx.save(); ctx.translate(cx - hw * 0.28, eaveY - (eaveY - top) * 0.32); ctx.rotate(-0.5); ctx.fillRect(0, -3, 18, 6); ctx.restore(); // 換気窓
    const barY = top + h * 0.22, bulbs = 4; // 天井の吊りランプ列
    ctx.strokeStyle = "#3d3830"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - hw * 0.7, barY); ctx.lineTo(cx + hw * 0.7, barY); ctx.stroke();
    for (let i = 0; i < bulbs; i++) this._heatLamp(ctx, cx + (i - (bulbs - 1) / 2) * Math.min(38, w / (bulbs + 1)), barY + 3, flick);
    const tx = cx + hw * 0.82; ctx.strokeStyle = "#5a564e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, gy); ctx.lineTo(tx, gy - 22); ctx.stroke(); // 温度計
    ctx.fillStyle = "#e8e4dc"; ctx.beginPath(); ctx.arc(tx, gy - 25, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx, gy - 25); ctx.lineTo(tx + 3, gy - 29); ctx.stroke();
    for (const dx of [-hw * 0.8, hw * 0.74]) { ctx.fillStyle = "#7a4a2a"; rr(ctx, cx + dx - 7, gy - 11, 14, 11, 2); ctx.fill(); ctx.fillStyle = "#8a5a34"; ctx.fillRect(cx + dx - 7, gy - 11, 14, 3); ctx.strokeStyle = "#3f7a3a"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; for (const a of [-0.6, -0.1, 0.5]) { ctx.beginPath(); ctx.moveTo(cx + dx, gy - 11); ctx.quadraticCurveTo(cx + dx + a * 16, gy - 30, cx + dx + a * 24, gy - 34); ctx.stroke(); } }
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - hw * 0.5, top + h * 0.2); ctx.lineTo(cx - 4, top + 6); ctx.stroke();
    for (let k = 0; k < 3; k++) { const t2 = ((this.time * 0.4 + k * 0.34) % 1); ctx.fillStyle = `rgba(255,255,255,${0.13 * (1 - t2)})`; ctx.beginPath(); ctx.arc(cx - hw * 0.28 + Math.sin(this.time + k) * 5, top - t2 * 24, 3 + t2 * 2, 0, 7); ctx.fill(); }
  },
  // 空中ライト(tier3小/tier4大): 空中の浮遊エミッターから地上へ広い光面(群れのバスキング面)。tier4は転送の遊び演出。
  // §8.5 居場所=地上の光面(cx,gy,半径 beamR)。UFO転送ビュー着想だがトカゲ文明製(真鍮/技術)。
  _drawAerialLight(ctx, cx, gy, info, flick) {
    const tier = info.tier, R = info.beamR, eh = tier === 4 ? 234 : 198;
    const ey = gy - eh + Math.sin(this.time * 0.8) * 4, rot = this.time * (tier === 4 ? 0.5 : 0.35);
    // 地上の光面(広い暖光=群れの居場所)
    const gg = ctx.createRadialGradient(cx, gy, 2, cx, gy, R);
    gg.addColorStop(0, `rgba(255,214,130,${0.3 * flick})`); gg.addColorStop(0.6, `rgba(255,200,110,${0.15 * flick})`); gg.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(cx, gy, R, R * 0.34, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,224,150,${0.2 * flick})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, gy, R * 0.9, R * 0.3, 0, 0, 7); ctx.stroke();
    // ビームの円錐(エミッター→地上)
    const bg = ctx.createLinearGradient(cx, ey, cx, gy); bg.addColorStop(0, `rgba(255,220,150,${0.16 * flick})`); bg.addColorStop(1, "rgba(255,214,130,0.02)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - R * 0.16, ey + 6); ctx.lineTo(cx + R * 0.16, ey + 6); ctx.lineTo(cx + R * 0.9, gy); ctx.lineTo(cx - R * 0.9, gy); ctx.closePath(); ctx.fill();
    // ビーム内の光の粒(上昇)
    for (let k = 0; k < (tier === 4 ? 8 : 5); k++) { const t2 = ((this.time * 0.3 + k * 0.2) % 1); ctx.fillStyle = `rgba(255,235,180,${0.4 * (1 - t2)})`; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 2 + this.time) * R * 0.4 * (1 - t2), gy - t2 * (eh - 20), 1 + (1 - t2), 0, 7); ctx.fill(); }
    if (tier === 4) this._beamTransport(ctx, cx, gy, eh, R); // 転送の遊び演出
    this._aerialEmitter(ctx, cx, ey, tier, rot, flick); // 空中エミッター(浮遊)
  },
  _aerialEmitter(ctx, ex, ey, tier, rot, flick) {
    const er = tier === 4 ? 48 : 32;
    ctx.save(); ctx.translate(ex, ey);
    if (tier === 4) { ctx.strokeStyle = "#5a4f38"; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * er * 0.7, -er * 0.2); ctx.lineTo(s * er * 1.12, -er * 0.66); ctx.stroke(); ctx.fillStyle = "#6b5c3a"; ctx.beginPath(); ctx.arc(s * er * 1.12, -er * 0.66, 4, 0, 7); ctx.fill(); } } // 上部アーム(大規模感)
    ctx.fillStyle = "#3a352c"; ctx.beginPath(); ctx.ellipse(0, 4, er, er * 0.34, 0, 0, 7); ctx.fill(); // 厚み(下)
    ctx.fillStyle = "#6b5c3a"; ctx.beginPath(); ctx.ellipse(0, 0, er, er * 0.36, 0, 0, 7); ctx.fill(); // 上面(真鍮=トカゲ文明製)
    ctx.fillStyle = "#8a7446"; ctx.beginPath(); ctx.ellipse(-er * 0.2, -2, er * 0.7, er * 0.22, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#4a3f28"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, er, er * 0.36, 0, 0, 7); ctx.stroke();
    const n = tier === 4 ? 10 : 7; // 縁のエミッター光(回転)
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2, lit = 0.5 + 0.5 * Math.sin(a + this.time * 3); ctx.fillStyle = `rgba(255,224,140,${0.5 + lit * 0.5})`; ctx.beginPath(); ctx.arc(Math.cos(a) * er * 0.92, Math.sin(a) * er * 0.32, 2, 0, 7); ctx.fill(); }
    const cg = ctx.createRadialGradient(0, 2, 1, 0, 2, er * 0.42); cg.addColorStop(0, `rgba(255,238,180,${flick})`); cg.addColorStop(1, "rgba(255,220,140,0)"); // 中央レンズ
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 2, er * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff2c8"; ctx.beginPath(); ctx.arc(0, 2, er * 0.16, 0, 7); ctx.fill();
    ctx.restore();
  },
  _beamTransport(ctx, cx, gy, eh, R) {
    for (let k = 0; k < 2; k++) { // トカゲのシルエットがふわりと持ち上がる(遊びの演出・魂の描画とは別のシルエット)
      const t2 = ((this.time * 0.14 + k * 0.5) % 1), ly = gy - t2 * (eh - 34), lx = cx + Math.sin(k * 3) * R * 0.14, a = Math.sin(t2 * Math.PI) * 0.7;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(58,44,28,.85)"; ctx.beginPath(); ctx.ellipse(lx, ly, 12, 5, 0.08, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 11, ly - 2, 5, 3, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(58,44,28,.85)"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx - 20, ly + 3); ctx.stroke();
      ctx.fillStyle = `rgba(255,240,190,${a * 0.55})`; ctx.beginPath(); ctx.ellipse(lx, ly + 6, 11, 3, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
  },
  _heatLamp(ctx, bx, by, flick) {
    ctx.fillStyle = "#8a857a"; ctx.beginPath(); ctx.moveTo(bx - 11, by); ctx.lineTo(bx + 11, by); ctx.lineTo(bx + 6, by - 10); ctx.lineTo(bx - 6, by - 10); ctx.closePath(); ctx.fill(); // 反射笠(金属)
    ctx.fillStyle = "#6a655c"; ctx.fillRect(bx - 6, by - 12, 12, 3); // 口金
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - 9, by - 1); ctx.lineTo(bx - 5, by - 8); ctx.stroke(); // 笠のハイライト
    const glow = ctx.createRadialGradient(bx, by + 5, 3, bx, by + 5, 40); glow.addColorStop(0, `rgba(255,214,120,${0.7 * flick})`); glow.addColorStop(1, "rgba(255,214,120,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(bx, by + 5, 40, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffedb0"; ctx.beginPath(); ctx.arc(bx, by + 4, 6, 0, 7); ctx.fill(); // 電球
    ctx.strokeStyle = `rgba(255,176,76,${flick})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - 2, by + 4); ctx.lineTo(bx, by + 2); ctx.lineTo(bx + 2, by + 4); ctx.stroke(); // フィラメント
  },

  // Phase8.9: 展望台 = 観測施設群(スケールの追求)。1観測台 → 2観測所 → 3観測施設群
  //   (大型ドーム天文台+パラボラアンテナ列+格子アンテナ塔+観測塔の足場/階段+複数バルコニー)。
  //   §8.5 居場所: 群れが集まって空を見上げる【観測デッキ】(前面の広い面)+塔上バルコニー。
  //   物語の含み(説明しない・気配だけ): 皿と鏡筒はみな空へ向く=観測している者を観測し返そうとしている。
  _drawObservatory(ctx, spot, lv) {
    const info = observatoryTierInfo(lv), tier = info.tier, w = info.w, h = info.h, cx = spot[0], gy = spot[1], hw = w / 2;
    const calm = window.Motion && Motion.reduced, T = calm ? 0 : this.time;
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.beginPath(); ctx.ellipse(cx, gy + 9, hw * 0.99, 11, 0, 0, 7); ctx.fill();

    // ---- 観測デッキ(§8.5 群れが集まって見上げる面・全tier共通、tierで拡張) ----
    const deckL = cx - hw * (tier >= 3 ? 0.74 : tier >= 2 ? 0.62 : 0.52);
    const deckR = cx + hw * (tier >= 3 ? 0.46 : 0.42);
    this._obsDeck(ctx, deckL, deckR, gy);

    // ---- 左: アンテナ列(空を仰ぐ皿=気配) ----
    if (tier >= 2) {
      const ax = cx - hw * (tier >= 3 ? 0.86 : 0.66);
      if (tier >= 3) { this._obsMast(ctx, ax - 20, gy, h * 0.72, T); this._obsAntenna(ctx, ax + 24, gy, 0.72, T + 1.4); }
      this._obsAntenna(ctx, ax, gy, tier >= 3 ? 1 : 0.74, T);
    }

    // ---- 中央: ドーム天文台(t3) / 観測所の小屋(t2) / 三脚望遠鏡(t1) ----
    if (tier >= 3) {
      const dcx = cx - hw * 0.08, bH = h * 0.46, bTop = gy - bH;
      ctx.fillStyle = "#4a4640"; ctx.fillRect(dcx - hw * 0.56, gy - 4, hw * 1.12, 5); // 基礎
      ctx.fillStyle = "#6b6258"; rr(ctx, dcx - hw * 0.5, bTop, hw * 1.0, bH, 3); ctx.fill(); // 円筒基部
      ctx.fillStyle = "#5f574e"; rr(ctx, dcx - hw * 0.5, bTop, hw * 0.22, bH, 3); ctx.fill(); // 陰
      ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1;
      for (const yy of [0.34, 0.68]) { ctx.beginPath(); ctx.moveTo(dcx - hw * 0.5, bTop + bH * yy); ctx.lineTo(dcx + hw * 0.5, bTop + bH * yy); ctx.stroke(); }
      for (const xx of [-0.24, 0.08, 0.36]) { ctx.beginPath(); ctx.moveTo(dcx + hw * xx, bTop); ctx.lineTo(dcx + hw * xx, gy); ctx.stroke(); }
      ctx.strokeStyle = "#4a4640"; ctx.lineWidth = 2; ctx.strokeRect(dcx + hw * 0.28 - 8, gy - 24, 16, 24); // ドア
      ctx.fillStyle = "rgba(255,200,120,.55)"; ctx.fillRect(dcx - hw * 0.34, gy - bH * 0.62, 9, 9); // 窓の暖光
      ctx.strokeStyle = "rgba(90,80,64,.6)"; ctx.lineWidth = 1; ctx.strokeRect(dcx - hw * 0.34, gy - bH * 0.62, 9, 9);
      const domeCy = bTop, domeR = hw * 0.54; // ドーム
      ctx.fillStyle = "#8f877c"; ctx.beginPath(); ctx.arc(dcx, domeCy, domeR, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#7d746a"; ctx.beginPath(); ctx.arc(dcx + domeR * 0.2, domeCy, domeR, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1; for (const a of [Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75]) { ctx.beginPath(); ctx.moveTo(dcx, domeCy); ctx.lineTo(dcx + Math.cos(a) * domeR, domeCy + Math.sin(a) * domeR); ctx.stroke(); }
      ctx.fillStyle = "#23201b"; ctx.save(); ctx.beginPath(); ctx.arc(dcx, domeCy, domeR, Math.PI, 0); ctx.clip(); ctx.fillRect(dcx - 5, domeCy - domeR - 4, 10, domeR + 6); ctx.restore(); // スリット
      ctx.strokeStyle = "#3a3630"; ctx.lineWidth = 6; ctx.lineCap = "round"; // 赤道儀の望遠鏡
      ctx.beginPath(); ctx.moveTo(dcx - 2, domeCy - domeR * 0.3); ctx.lineTo(dcx + 11, domeCy - domeR - 12); ctx.stroke();
      ctx.fillStyle = "#5a5148"; ctx.beginPath(); ctx.arc(dcx + 11, domeCy - domeR - 12, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#2c2822"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(dcx - 2, domeCy - domeR * 0.3); ctx.lineTo(dcx - 8, domeCy - domeR * 0.05); ctx.stroke();
    } else if (tier >= 2) { // ===== 観測所: 高床の小屋+スリット窓+望遠鏡 =====
      const pw = hw * 0.8, ph = h * 0.42, ptop = gy - ph - 10;
      ctx.strokeStyle = "#3a352e"; ctx.lineWidth = 3; ctx.lineCap = "round"; // 高床の柱
      for (const sx of [-pw * 0.82, -pw * 0.28, pw * 0.28, pw * 0.82]) { ctx.beginPath(); ctx.moveTo(cx + sx * 0.5, gy); ctx.lineTo(cx + sx * 0.5, ptop + ph); ctx.stroke(); }
      ctx.fillStyle = "#6b6258"; rr(ctx, cx - pw * 0.5, ptop, pw, ph, 3); ctx.fill(); // 小屋本体
      ctx.fillStyle = "#5a5249"; rr(ctx, cx - pw * 0.5, ptop, pw * 0.24, ph, 3); ctx.fill();
      ctx.fillStyle = "#4d4640"; ctx.beginPath(); ctx.moveTo(cx - pw * 0.56, ptop + 2); ctx.lineTo(cx, ptop - ph * 0.4); ctx.lineTo(cx + pw * 0.56, ptop + 2); ctx.closePath(); ctx.fill(); // 傾いた屋根
      ctx.fillStyle = "#20241e"; ctx.fillRect(cx - 4, ptop - ph * 0.3, 8, ph * 0.8); // 観測スリット
      ctx.fillStyle = "rgba(255,200,120,.5)"; ctx.fillRect(cx + pw * 0.2, ptop + ph * 0.4, 8, 8); // 窓
      ctx.strokeStyle = "#3a3630"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, ptop + ph * 0.1); ctx.lineTo(cx + 10, ptop - ph * 0.5); ctx.stroke(); // 鏡筒
      ctx.fillStyle = "#5a5148"; ctx.beginPath(); ctx.arc(cx + 10, ptop - ph * 0.5, 3.5, 0, 7); ctx.fill();
    } else { // ===== 観測台: デッキ上の三脚望遠鏡+見晴らし =====
      const tpx = cx + hw * 0.1, ty = gy - 4;
      ctx.strokeStyle = "#2c2822"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      for (const a of [-0.42, 0.05, 0.42]) { ctx.beginPath(); ctx.moveTo(tpx, ty - 20); ctx.lineTo(tpx + Math.sin(a) * 16, gy - 2); ctx.stroke(); }
      ctx.fillStyle = "#5a564e"; ctx.beginPath(); ctx.arc(tpx, ty - 20, 3, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(tpx, ty - 20); ctx.rotate(-0.7);
      ctx.fillStyle = "#4a4640"; rr(ctx, -4, -3, 28, 7, 2); ctx.fill();
      ctx.fillStyle = "#5f5a52"; rr(ctx, -4, -3, 8, 7, 2); ctx.fill();
      ctx.fillStyle = "#2c2822"; rr(ctx, 24, -4, 5, 9, 1); ctx.fill(); // フード
      ctx.fillStyle = "#3a3630"; rr(ctx, -10, -1.5, 7, 4, 1); ctx.fill(); // 接眼
      ctx.fillStyle = "#6a655c"; ctx.beginPath(); ctx.arc(8, 5, 2, 0, 7); ctx.fill();
      ctx.restore();
    }

    // ---- 右: 観測塔(足場/階段+塔上バルコニー=もう一つの見張り所) ----
    if (tier >= 3) this._obsTower(ctx, cx + hw * 0.72, gy, hw * 0.5, h * 0.92, T);

    // ---- 標本棚(t2+) ----
    if (tier >= 2) {
      const shx = cx - hw * (tier >= 3 ? 0.62 : 0.86), shy = gy;
      ctx.fillStyle = "#5a4128"; rr(ctx, shx - 15, shy - 32, 30, 34, 2); ctx.fill();
      ctx.fillStyle = "#4a3420"; ctx.fillRect(shx - 15, shy - 32, 30, 3);
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(shx - 15, shy - 16); ctx.lineTo(shx + 15, shy - 16); ctx.stroke();
      for (const [jx, jy, c] of [[-9, -24, "143,208,192"], [-1, -24, "232,192,96"], [7, -24, "208,144,176"], [-6, -8, "144,176,208"], [3, -8, "192,208,144"]]) {
        ctx.fillStyle = `rgb(${c})`; rr(ctx, shx + jx - 2.5, shy + jy - 5, 6, 7, 1); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(shx + jx - 1.5, shy + jy - 2, 4, 1.2);
      }
      ctx.fillStyle = "#8a5a34"; rr(ctx, shx + 7, shy - 8, 7, 5, 1); ctx.fill(); // ノート
    }

    // ---- 観測コンソール: 星図スクリーン(t3・微かなモノリスの影=気配だけ) ----
    if (tier >= 3) {
      const chx = cx + hw * 0.22, chy = gy - 34;
      ctx.fillStyle = "#3a3226"; rr(ctx, chx - 1, chy - 1, 28, 26, 2); ctx.fill(); // 枠
      ctx.fillStyle = "#141c28"; rr(ctx, chx + 1, chy + 1, 24, 22, 1); ctx.fill();
      const sr = lcg(717); ctx.fillStyle = "rgba(210,225,255,.8)"; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(chx + 3 + sr() * 20, chy + 3 + sr() * 18, 0.8, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(120,150,190,.28)"; ctx.fillRect(chx + 11, chy + 3, 3, 18); // 画面中央の細い縦影=モノリス(説明しない)
      if (!calm) { const sy = chy + 2 + ((T * 6) % 22); ctx.strokeStyle = "rgba(150,210,190,.5)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(chx + 1, sy); ctx.lineTo(chx + 25, sy); ctx.stroke(); } // 走査線
    }
  },

  // 観測デッキ+観測広場(§8.5 群れの居場所): 手前に開けた広い舗装の面(見上げる群れが集まる)+奥に板張り縁と低い手すり
  _obsDeck(ctx, x0, x1, gy) {
    const dw = x1 - x0, cx = (x0 + x1) / 2, pr = dw * 0.66;
    // 観測広場: 手前へ開ける淡い舗装の面(=群れのバスキング/見上げ面。大湖の浅瀬・保温の光面に相当)
    const pg = ctx.createRadialGradient(cx, gy + 16, 6, cx, gy + 16, pr);
    pg.addColorStop(0, "rgba(150,140,120,.30)"); pg.addColorStop(0.7, "rgba(150,140,120,.16)"); pg.addColorStop(1, "rgba(150,140,120,0)");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, gy + 16, pr, pr * 0.42, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(60,52,40,.16)"; ctx.lineWidth = 1; // 敷石の目地(同心の弧)
    for (const rf of [0.42, 0.72]) { ctx.beginPath(); ctx.ellipse(cx, gy + 16, pr * rf, pr * rf * 0.42, 0, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke(); }
    // 奥の板張り縁(構造物が乗る土台)+低い手すり(群れはこの手前=広場に立つ)
    ctx.fillStyle = "#6b5c4a"; rr(ctx, x0, gy - 3, dw, 7, 2); ctx.fill();
    ctx.fillStyle = "#5a4c3c"; ctx.fillRect(x0, gy + 2, dw, 2);
    ctx.strokeStyle = "rgba(0,0,0,.16)"; ctx.lineWidth = 1;
    for (let x = x0 + 13; x < x1 - 2; x += 14) { ctx.beginPath(); ctx.moveTo(x, gy - 3); ctx.lineTo(x, gy + 4); ctx.stroke(); }
    ctx.strokeStyle = "#4a4038"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
    const n = 5; for (let i = 0; i <= n; i++) { const x = x0 + 5 + (dw - 10) * i / n; ctx.beginPath(); ctx.moveTo(x, gy - 2); ctx.lineTo(x, gy - 12); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0 + 5, gy - 11); ctx.lineTo(x1 - 5, gy - 11); ctx.stroke();
  },

  // パラボラアンテナ(空を仰いでゆっくり掃く=気配)
  _obsAntenna(ctx, bx, gy, s, T) {
    const mh = 52 * s;
    ctx.fillStyle = "#4a4640"; ctx.beginPath(); ctx.ellipse(bx, gy, 9 * s, 3 * s, 0, 0, 7); ctx.fill(); // 基部
    ctx.strokeStyle = "#3a352e"; ctx.lineWidth = 4 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx, gy - mh); ctx.stroke(); // 支柱
    ctx.save(); ctx.translate(bx, gy - mh); ctx.rotate(Math.sin(T * 0.2 + bx * 0.01) * 0.32); // 皿の首振り
    const dr = 17 * s;
    ctx.fillStyle = "#9a938a"; ctx.beginPath(); ctx.ellipse(0, 0, dr, dr * 0.44, 0, 0, 7); ctx.fill(); // 皿面
    ctx.fillStyle = "#6f685f"; ctx.beginPath(); ctx.ellipse(0, dr * 0.16, dr * 0.84, dr * 0.3, 0, 0, 7); ctx.fill(); // 凹みの陰
    ctx.strokeStyle = "#3a352e"; ctx.lineWidth = 1.3; // フィードホーンの支柱
    ctx.beginPath(); ctx.moveTo(-dr * 0.5, dr * 0.06); ctx.lineTo(0, -dr * 0.72); ctx.moveTo(dr * 0.5, dr * 0.06); ctx.lineTo(0, -dr * 0.72); ctx.stroke();
    ctx.fillStyle = "#c9a24c"; ctx.beginPath(); ctx.arc(0, -dr * 0.72, 2.4 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // 格子アンテナ塔(頂に赤い明滅ビーコン)
  _obsMast(ctx, bx, gy, hh, T) {
    ctx.strokeStyle = "#4a4640"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(bx - 7, gy); ctx.lineTo(bx, gy - hh); ctx.moveTo(bx + 7, gy); ctx.lineTo(bx, gy - hh); ctx.stroke(); // 脚
    ctx.lineWidth = 1; for (let i = 1; i <= 6; i++) { const yy = gy - hh * i / 7, ww = 7 * (1 - i / 7); ctx.beginPath(); ctx.moveTo(bx - ww, yy); ctx.lineTo(bx + ww, yy); ctx.stroke(); } // 横桟
    const bl = 0.5 + 0.5 * Math.sin(T * 3);
    ctx.fillStyle = `rgba(255,96,72,${0.4 + 0.5 * bl})`; ctx.beginPath(); ctx.arc(bx, gy - hh, 2.6, 0, 7); ctx.fill(); // ビーコン
  },

  // 観測塔(格子の足場+ジグザグ階段+塔上バルコニー=もう一つの見張り所)
  _obsTower(ctx, bx, gy, tw, th, T) {
    const levels = 3;
    ctx.strokeStyle = "#4a423a"; ctx.lineWidth = 3; ctx.lineCap = "round"; // 4本脚(先細り)
    ctx.beginPath(); ctx.moveTo(bx - tw * 0.5, gy); ctx.lineTo(bx - tw * 0.3, gy - th); ctx.moveTo(bx + tw * 0.5, gy); ctx.lineTo(bx + tw * 0.3, gy - th); ctx.stroke();
    ctx.strokeStyle = "#5a5048"; ctx.lineWidth = 1.5; // 段ごとのXブレース+踏み段(足場/階段)
    for (let i = 0; i < levels; i++) {
      const y0 = gy - th * i / levels, y1 = gy - th * (i + 1) / levels;
      const w0 = tw * 0.5 * (1 - i * 0.16), w1 = tw * 0.5 * (1 - (i + 1) * 0.16);
      ctx.beginPath(); ctx.moveTo(bx - w0, y0); ctx.lineTo(bx + w1, y1); ctx.moveTo(bx + w0, y0); ctx.lineTo(bx - w1, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - w1, y1); ctx.lineTo(bx + w1, y1); ctx.stroke(); // 踏み段
    }
    const py = gy - th, pw = tw * 0.5; // 塔上バルコニー
    ctx.fillStyle = "#6b5c4a"; rr(ctx, bx - pw, py - 3, pw * 2, 6, 2); ctx.fill();
    ctx.strokeStyle = "#4a4038"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    for (const rx of [bx - pw, bx - pw * 0.4, bx + pw * 0.4, bx + pw]) { ctx.beginPath(); ctx.moveTo(rx, py - 3); ctx.lineTo(rx, py - 12); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(bx - pw, py - 11); ctx.lineTo(bx + pw, py - 11); ctx.stroke();
    ctx.strokeStyle = "#3a352e"; ctx.lineWidth = 3; // バルコニーの小望遠鏡(空へ・ゆっくり傾ぐ)
    ctx.save(); ctx.translate(bx + pw * 0.2, py - 6); ctx.rotate(-0.9 + Math.sin(T * 0.18) * 0.12); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.fillStyle = "#5a5148"; ctx.beginPath(); ctx.arc(16, 0, 3, 0, 7); ctx.fill(); ctx.restore();
  },

  drawFacilities(ctx) {
    const lv = (id) => Game.facLv(id);
    const P = FAC_POS;

    if (lv("water")) this._drawWater(ctx, P.water, lv("water")); // Phase8: tierで水たまり→池→湖→大湖(定位置で規模が育つ)

    if (lv("heat")) this._drawHeat(ctx, P.light, lv("heat")); // Phase8: tierで保温ライト→温室→空中ライト(§8.10で左=旧シェルター位置へ移動)

    if (lv("fence")) this._drawFence(ctx, P.fenceX, lv("fence")); // §8.17: tierで木柵→補強柵→丸太の防柵(右端・ボスを迎え撃つ)
  },

  // §8.17 フェンス: 右端の防柵。tierで高く・太く・杭(右=ボス側)・横桟増・土塁+旗=「守りが堅そう」に育つ。
  _drawFence(ctx, x, lv) {
    const info = fenceTierInfo(lv), tier = info.tier, th = info.thick;
    const top = tier >= 3 ? 214 : tier >= 2 ? 224 : 232, bot = 692;
    ctx.strokeStyle = "#4d3d24"; ctx.lineWidth = th; ctx.lineCap = "round"; // 縦の丸太(手前)
    ctx.beginPath(); ctx.moveTo(x - 1, top + 12); ctx.lineTo(x - 1, bot); ctx.stroke();
    ctx.strokeStyle = "#5f4c2d"; ctx.lineWidth = Math.max(3, th - 2);
    ctx.beginPath(); ctx.moveTo(x + th * 1.3, top + 16); ctx.lineTo(x + th * 1.3, bot - 4); ctx.stroke();
    for (let y = top; y <= bot - 40; y += tier >= 3 ? 38 : 46) { // 支柱(丸頭・tierで尖った杭を右へ)
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 40, 9, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#6b5433"; rr(ctx, x - th * 0.6, y, th * 1.2, 42, 4); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.2; rr(ctx, x - th * 0.6, y, th * 1.2, 42, 4); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.14)"; rr(ctx, x - th * 0.4, y + 1.5, 3, 38, 2); ctx.fill();
      if (info.spikes) { ctx.fillStyle = "#7a6238"; ctx.beginPath(); ctx.moveTo(x - th * 0.6, y); ctx.lineTo(x + th * 0.6, y); ctx.lineTo(x + th * 0.6 + (tier >= 3 ? 11 : 6), y - (tier >= 3 ? 13 : 8)); ctx.closePath(); ctx.fill(); }
    }
    ctx.strokeStyle = "#5a4025"; ctx.lineWidth = tier >= 3 ? 5 : 3.5; // 横桟(tierで本数)
    const rails = tier >= 3 ? [0.2, 0.5, 0.8] : tier >= 2 ? [0.3, 0.7] : [0.35, 0.75];
    for (const r of rails) { const yy = top + (bot - top) * r; ctx.beginPath(); ctx.moveTo(x - th, yy); ctx.lineTo(x + th + 8, yy); ctx.stroke(); }
    if (tier >= 3) { // 土塁の基部+旗(右へなびく)
      ctx.strokeStyle = "#3a2e1a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x, top - 26); ctx.stroke();
      const fl = Math.sin(this.time * 3) * 3; ctx.fillStyle = "#9a3b2e";
      ctx.beginPath(); ctx.moveTo(x, top - 26); ctx.lineTo(x + 22, top - 22 + fl); ctx.lineTo(x, top - 13); ctx.closePath(); ctx.fill();
    }
  },

  // §8.17 監視塔(物見櫓): tierで高く堅牢に。見張り台(手すり付き)=居場所。tier3で鐘+右へ向くサーチライト。
  _drawWatchtower(ctx, x, gy, lv) {
    const info = watchtowerTierInfo(lv), tier = info.tier, h = info.h, tw = info.tw, hw = tw / 2, topW = hw * 0.5;
    ctx.fillStyle = "rgba(0,0,0,.26)"; ctx.beginPath(); ctx.ellipse(x, gy + 8, hw * 0.9, 9, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#463522"; ctx.lineWidth = tier >= 3 ? 5 : 4; ctx.lineCap = "round"; // 奥の2脚
    ctx.beginPath(); ctx.moveTo(x - hw * 0.6, gy); ctx.lineTo(x - topW * 0.6, gy - h); ctx.moveTo(x + hw * 0.6, gy); ctx.lineTo(x + topW * 0.6, gy - h); ctx.stroke();
    const lvl = tier >= 3 ? 4 : 3;
    ctx.strokeStyle = "#6b5636"; ctx.lineWidth = 2; // 段ごとのXブレース+踏み桟
    for (let i = 0; i < lvl; i++) { const y0 = gy - h * i / lvl, y1 = gy - h * (i + 1) / lvl, w0 = hw * (1 - i / lvl * 0.5), w1 = hw * (1 - (i + 1) / lvl * 0.5);
      ctx.beginPath(); ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1); ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - w1, y1); ctx.lineTo(x + w1, y1); ctx.stroke(); }
    ctx.strokeStyle = "#5a4630"; ctx.lineWidth = tier >= 3 ? 6 : 5; // 手前の2脚(明るく)
    ctx.beginPath(); ctx.moveTo(x - hw, gy); ctx.lineTo(x - topW, gy - h); ctx.moveTo(x + hw, gy); ctx.lineTo(x + topW, gy - h); ctx.stroke();
    ctx.strokeStyle = "#7a6238"; ctx.lineWidth = 1.6; // 梯子
    for (let ry = gy - 10; ry > gy - h + 10; ry -= 12) { ctx.beginPath(); ctx.moveTo(x - 6, ry); ctx.lineTo(x + 6, ry); ctx.stroke(); }
    const py = gy - h, pw = hw * 0.66; // 見張り台(居場所)+手すり
    ctx.fillStyle = "#6b5c4a"; rr(ctx, x - pw, py - 4, pw * 2, 8, 2); ctx.fill();
    ctx.strokeStyle = "#4a4038"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (const rx of [x - pw, x - pw * 0.33, x + pw * 0.33, x + pw]) { ctx.beginPath(); ctx.moveTo(rx, py - 4); ctx.lineTo(rx, py - 15); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - pw, py - 14); ctx.lineTo(x + pw, py - 14); ctx.stroke();
    if (tier >= 2) { ctx.fillStyle = "#5a4128"; ctx.beginPath(); ctx.moveTo(x - pw - 4, py - 15); ctx.lineTo(x, py - 15 - tw * 0.36); ctx.lineTo(x + pw + 4, py - 15); ctx.closePath(); ctx.fill(); } // 屋根
    if (tier >= 3) { // 鐘+右へ向くサーチライト(ボスを睨む)
      ctx.fillStyle = "#b8892e"; ctx.beginPath(); ctx.arc(x + pw * 0.55, py - 7, 5, Math.PI, 0); ctx.fill();
      const lg = ctx.createLinearGradient(x + pw, py - 8, x + pw + 130, py - 8); lg.addColorStop(0, "rgba(255,235,150,.22)"); lg.addColorStop(1, "rgba(255,235,150,0)");
      ctx.save(); ctx.translate(x + pw, py - 8); ctx.rotate(0.4 + Math.sin(this.time * 0.6) * 0.12); ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(130, -18); ctx.lineTo(130, 26); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  },

  // §8.17 罠設備: ボスの進路(右)へ牙。tierで杭列→落とし穴+網→焼却罠(篝火)。
  _drawTrap(ctx, x, gy, lv) {
    const info = trapTierInfo(lv), tier = info.tier, w = info.w, hw = w / 2;
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.beginPath(); ctx.ellipse(x, gy + 6, hw * 0.9, 8, 0, 0, 7); ctx.fill();
    if (tier >= 2) { // 落とし穴+網
      const pg = ctx.createRadialGradient(x, gy, 4, x, gy, hw * 0.8); pg.addColorStop(0, "#120c06"); pg.addColorStop(1, "rgba(60,44,26,0)");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(x, gy, hw * 0.8, hw * 0.34, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(180,190,170,.32)"; ctx.lineWidth = 1;
      for (let gx = -hw * 0.7; gx <= hw * 0.7; gx += 12) { ctx.beginPath(); ctx.moveTo(x + gx, gy - hw * 0.28); ctx.lineTo(x + gx, gy + hw * 0.28); ctx.stroke(); }
      for (let gyy = -hw * 0.28; gyy <= hw * 0.28; gyy += 8) { ctx.beginPath(); ctx.moveTo(x - hw * 0.7, gy + gyy); ctx.lineTo(x + hw * 0.7, gy + gyy); ctx.stroke(); }
    }
    const n = tier >= 3 ? 7 : tier >= 2 ? 5 : 4; // 杭列(右へ傾ける牙)
    for (let i = 0; i < n; i++) {
      const sx = x - hw * 0.7 + (hw * 1.4) * i / (n - 1), sh = tier >= 3 ? 26 : tier >= 2 ? 20 : 15, tip = tier >= 2 ? 9 : 6;
      ctx.fillStyle = "#3a2c1a"; ctx.strokeStyle = "#5a4630"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - 4, gy + 4); ctx.lineTo(sx + tip, gy - sh); ctx.lineTo(sx + 4, gy + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.moveTo(sx - 1, gy); ctx.lineTo(sx + tip * 0.8, gy - sh * 0.85); ctx.lineTo(sx + 1, gy); ctx.closePath(); ctx.fill();
    }
    if (tier >= 3) { // 焼却罠(篝火=ウェブ自動焼却)
      const fx = x + hw * 0.72, fy = gy - 4, fl = Math.sin(this.time * 9) * 3;
      const g = ctx.createRadialGradient(fx, fy - 8, 2, fx, fy - 8, 24); g.addColorStop(0, "rgba(255,150,60,.7)"); g.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy - 8, 24, 0, 7); ctx.fill();
      ctx.fillStyle = "#ff9a40"; ctx.beginPath(); ctx.moveTo(fx - 6, fy); ctx.quadraticCurveTo(fx - 2 + fl, fy - 18, fx, fy - 22 + fl); ctx.quadraticCurveTo(fx + 4 - fl, fy - 14, fx + 6, fy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#3a2a16"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx - 7, fy + 2); ctx.lineTo(fx + 7, fy - 1); ctx.moveTo(fx - 6, fy - 1); ctx.lineTo(fx + 7, fy + 2); ctx.stroke();
    }
  },

  // §8.16 入口の world 座標(描画と §8.14 の出入り動線で共有)。中心=FAC_POS.burrow、育つほど横に増える。
  burrowEntrances(lv) {
    const info = burrowTierInfo(lv), n = info.entrances, gap = info.gap;
    const x0 = FAC_POS.burrow.x, y0 = FAC_POS.burrow.y;
    const start = x0 - gap * (n - 1) / 2;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: Math.round(start + i * gap), y: Math.round(y0 + (i % 2 ? 5 : 0) * info.scale) });
    return pts;
  },

  // §8.5 トカゲの居場所(スポット)レジストリ ★モーションの下ごしらえ(2026-07-21)。
  //   各設備が形状に確保した「居場所」の live world 座標を、既存の tierInfo/FAC_POS/burrowEntrances
  //   から重複なく算出して返す(台帳=docs/facility_spots.md をコード化した単一の真実)。
  //   純粋な読み取り専用=描画ループから呼ばれず挙動を一切変えない(=不活性)。
  //   【未実装】個体の割当(capacityに応じた安定配置=nestEntryForの一般化)と実アニメーション(drink/bask/wade/lookout)。
  //   将来のモーション実装はこの座標を消費して各個体に spot を割り当てる(docs/facility_spots.md §割当設計)。
  //   返り値: [{ id, facility, action, posture, capacity, facing, center:{x,y}, radius, tier }]
  //   facing: 'right'|'left'|'both'|'up' / posture: 姿勢名(将来のmotion名の目安) / capacity: 同時に居られる目安人数。
  facilitySpots() {
    const G = (typeof Game !== "undefined") ? Game : null;
    if (!G) return [];
    const spots = [];
    const push = (id, facility, action, posture, capacity, facing, cx, cy, radius, tier) =>
      spots.push({ id, facility, action, posture, capacity, facing, center: { x: Math.round(cx), y: Math.round(cy) }, radius: Math.round(radius), tier });

    // 水場: tier1-3=手前の縁で水を飲む / tier4=浅瀬で水浴び
    const w = waterTierInfo(G.facLv("water"));
    if (w.tier) {
      push("water-drink", "water", "水を飲む", "drink", 3, "both", FAC_POS.water.x, FAC_POS.water.y + w.ry * 0.85, w.rx * 0.5, w.tier);
      if (w.tier >= 4) push("water-wade", "water", "水浴び/水遊び", "wade", 5, "left", 300, 600, 55, w.tier); // 岸の浅瀬帯(代表座標)
    }
    // 保温設備: tier1-2=温床/ランプ直下 / tier3-4=空中ビームの広い光面(群れのバスキング面)
    const h = heatTierInfo(G.facLv("heat"));
    if (h.tier) {
      if (h.tier >= 3) push("heat-bask", "heat", "暖をとる(群れ)", "bask", 8, "up", FAC_POS.light.x, FAC_POS.light.y, h.beamR, h.tier);
      else push("heat-bask", "heat", "暖をとる", "bask", 2, "up", FAC_POS.light.x, FAC_POS.light.y + 44, Math.max(20, h.w * 0.4), h.tier);
    }
    // 展望台: 手前の観測広場で空を見上げる(群れ) / tier3=塔上バルコニーで見張る(1匹)
    const o = observatoryTierInfo(G.facLv("observatory"));
    if (o.tier) {
      push("obs-lookup", "observatory", "空を見上げる(群れ)", "lookup", 8, "up", FAC_POS.observatory.x, FAC_POS.observatory.y + 16, o.w * 0.33, o.tier);
      if (o.tier >= 3) push("obs-lookout", "observatory", "塔上で見張る", "lookout", 1, "up", FAC_POS.observatory.x + (o.w / 2) * 0.72, FAC_POS.observatory.y - o.h * 0.92, 14, o.tier);
    }
    // すみか: 複数の入口(既存 burrowEntrances を再利用=二重管理なし)。各入口が出入り/日向ぼっこのスポット
    const nlv = G.nestLv();
    const ents = this.burrowEntrances(nlv), bt = burrowTierInfo(nlv);
    ents.forEach((e, i) => push("burrow-entry-" + i, "burrow", "入口の出入り/日向ぼっこ", "emerge", 2, "both", e.x, e.y, Math.max(16, bt.gap * 0.4), bt.tier));
    // 監視塔: 塔上の見張り台(1匹・高所)
    const wt = watchtowerTierInfo(G.facLv("watchtower"));
    if (wt.tier) push("watch-lookout", "watchtower", "塔上で見張る(ボス側)", "lookout", 1, "right", FAC_POS.watchtower.x, FAC_POS.watchtower.y - wt.h, 14, wt.tier);
    // フェンス/罠は構造物=居場所なし(スポット無し)
    return spots;
  },

  // すみか(§8.16): 多数が暮らす集合住居/ワレン。大きな盛り土に複数の入口=群れの避難・籠りの動線が詰まらない。
  drawBurrow(ctx) {
    const resting = Game.state.lizards.filter((l) => l.resting).length;
    const bx = FAC_POS.burrow.x, by = FAC_POS.burrow.y;
    const nlv = (Game.state.nest && Game.state.nest.lv) || 1;
    const info = burrowTierInfo(nlv), tier = info.tier, s = info.scale;
    const ents = this.burrowEntrances(nlv);
    const halfW = info.gap * (ents.length - 1) / 2 + 42 * s; // 盛り土の半幅

    // 接地影(住居全体)
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(bx, by + 11, halfW + 6, 16 * s, 0, 0, 7); ctx.fill();
    // 大きな盛り土のドーム(住居)
    ctx.fillStyle = "#6a5334"; ctx.beginPath(); ctx.ellipse(bx, by - 2, halfW, 42 * s, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#5c4a2c"; ctx.beginPath(); ctx.ellipse(bx + halfW * 0.16, by - 2, halfW * 0.72, 32 * s, 0, Math.PI, 0); ctx.fill(); // 陰
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.beginPath(); ctx.ellipse(bx - halfW * 0.32, by - 24 * s, halfW * 0.34, 10 * s, 0, Math.PI, 0); ctx.fill(); // 陽の当たり
    // 定着の草(tier2+)
    if (tier >= 2) { const gr = lcg(202); for (let i = 0; i < 4 + tier * 2; i++) this.tuft(ctx, bx - halfW * 0.9 + gr() * halfW * 1.8, by - 8 * s - gr() * 12 * s, "#4a6a2c", gr); }
    // 煙突+煙(tier3=定住の暮らし)
    if (tier >= 3) {
      ctx.fillStyle = "#4a3a26"; rr(ctx, bx + halfW * 0.52, by - 42 * s, 8 * s, 13 * s, 1); ctx.fill();
      for (let k = 0; k < 2; k++) { const t2 = ((this.time * 0.3 + k * 0.5) % 1); ctx.fillStyle = `rgba(220,220,220,${0.1 * (1 - t2)})`; ctx.beginPath(); ctx.arc(bx + halfW * 0.52 + 4 * s + Math.sin(this.time + k) * 4, by - 42 * s - t2 * 22, 2.5 + t2 * 2.5, 0, 7); ctx.fill(); }
    }
    // 掘り出した土の縁(前面・入口の手前)
    ctx.fillStyle = "#57452c"; ctx.beginPath(); ctx.ellipse(bx, by + 5, halfW * 0.96, 17 * s, 0, Math.PI, 0); ctx.fill();

    // 各入口: 穴+暖光+木枠+玄関マット+覗く目。resting数を入口へ配分(詰まらず賑わって見える)
    let eyesLeft = Math.min(ents.length * 2, Math.ceil(resting / 22));
    for (let e = 0; e < ents.length; e++) {
      const ex = ents[e].x, ey = ents[e].y;
      const hg = ctx.createRadialGradient(ex, ey, 2, ex, ey, 24 * s);
      if (tier >= 2) { hg.addColorStop(0, "#3a2a12"); hg.addColorStop(0.55, "#1a1208"); hg.addColorStop(1, "#241a10"); }
      else { hg.addColorStop(0, "#000"); hg.addColorStop(1, "#241a10"); }
      ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(ex, ey, 21 * s, 13 * s, 0, 0, 7); ctx.fill();
      if (tier >= 2) { // 奥の暖光=住まいの気配
        const wg = ctx.createRadialGradient(ex, ey, 1, ex, ey, 12 * s);
        wg.addColorStop(0, `rgba(255,190,110,${0.26 + Math.sin(this.time * 2 + e) * 0.06})`); wg.addColorStop(1, "rgba(255,190,110,0)");
        ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(ex, ey, 12 * s, 6 * s, 0, 0, 7); ctx.fill();
        // 木枠(2本柱+まぐさ)
        ctx.strokeStyle = "#5a4128"; ctx.lineWidth = 3.4 * s; ctx.lineCap = "round";
        for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ex + sgn * 19 * s, ey + 3); ctx.lineTo(ex + sgn * 16 * s, ey - 12 * s); ctx.stroke(); }
        ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(ex - 17 * s, ey - 11 * s); ctx.quadraticCurveTo(ex, ey - 18 * s, ex + 17 * s, ey - 11 * s); ctx.stroke();
      }
      if (tier >= 3) { ctx.fillStyle = "rgba(150,110,70,.5)"; rr(ctx, ex - 13 * s, ey + 6, 26 * s, 4 * s, 2); ctx.fill(); } // 玄関マット
      // 覗く目(この入口ぶん)
      const eyesHere = Math.min(2, eyesLeft); eyesLeft -= eyesHere;
      for (let i = 0; i < eyesHere; i++) {
        const gxp = ex - 6 * s + i * 12 * s, blink = Math.sin(this.time * 2 + e * 1.7 + i * 2.1) > -0.85;
        if (!blink) continue;
        ctx.fillStyle = "#ffcc44"; ctx.beginPath(); ctx.arc(gxp, ey - 1, 2, 0, 7); ctx.arc(gxp + 4.5, ey - 1, 2, 0, 7); ctx.fill();
      }
    }
    // ラベル: 巣の名(+休息数)。「タップで巣」は控えめ(アフォーダンスは残しつつ主張を下げる・Ric要望)
    const st = Game.currentStage(), yo = by + 20 + (s - 1) * 10;
    this.pill(ctx, bx - 40, yo, `${st.nest}${resting > 0 ? ` 休${resting}` : ""}`, "rgba(0,0,0,.34)", "rgba(255,255,255,.8)", 12);
    this.pill(ctx, bx - 16, yo + 18, "タップで巣", "rgba(0,0,0,.22)", "rgba(210,225,235,.55)", 9);
  },

  // 展望台+防衛設備(§8.17でそれぞれ独自tier=一目で分かるのでラベルなし)
  drawSmallFacilities(ctx) {
    const lv = (id) => Game.facLv(id);
    if (lv("observatory")) this._drawObservatory(ctx, [FAC_POS.observatory.x, FAC_POS.observatory.y], lv("observatory")); // §8.12 中央の巨大展望台
    if (lv("watchtower")) this._drawWatchtower(ctx, FAC_POS.watchtower.x, FAC_POS.watchtower.y, lv("watchtower"));         // §8.17 右上の物見櫓
    if (lv("trap")) this._drawTrap(ctx, FAC_POS.trap.x, FAC_POS.trap.y, lv("trap"));                                       // §8.17 右下の罠
  },

  // 半透明ラベル
  pill(ctx, x, y, txt, bg, fg, size) {
    ctx.font = `${size || 12}px sans-serif`;
    const w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = bg || "rgba(0,0,0,.38)";
    rr(ctx, x, y, w, (size || 12) + 10, 7); ctx.fill();
    ctx.fillStyle = fg || "rgba(255,255,255,.85)";
    ctx.textAlign = "left";
    ctx.fillText(txt, x + 7, y + (size || 12) + 2);
  },

  // ---------------- 巣(卵) ----------------
  drawNest(ctx) {
    const eggs = Game.state.eggs;
    const n = NEST;
    const rand = lcg(1234);
    // 接地影と土の盛り上がり
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 12, 86, 22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#5d4a30";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 4, 80, 30, 0, 0, 7); ctx.fill();
    // 放射状の藁(2トーン)
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r1 = 26 + rand() * 10, r2 = 58 + rand() * 22;
      ctx.strokeStyle = rand() < 0.5 ? "#a8854a" : "#78592e";
      ctx.lineWidth = 1.6 + rand() * 1.8;
      ctx.beginPath();
      ctx.moveTo(n.x + Math.cos(a) * r1, n.y + Math.sin(a) * r1 * 0.5);
      ctx.quadraticCurveTo(
        n.x + Math.cos(a) * (r1 + r2) * 0.55, n.y + Math.sin(a) * (r1 + r2) * 0.28 - 3,
        n.x + Math.cos(a) * r2, n.y + Math.sin(a) * r2 * 0.48 - rand() * 3,
      );
      ctx.stroke();
    }
    // 内側のくぼみ
    ctx.fillStyle = "#42301a";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 36, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#59452a";
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 3, 30, 12, 0, 0, 7); ctx.fill();
    // 卵(白くつややかに・孵化プログレスリング付き。ラッキー卵は虹色)
    for (let i = 0; i < eggs.length; i++) {
      const egg = eggs[i];
      const x = n.x - 24 + i * 24, y = n.y + 1;
      const wob = egg.t < 8 && egg.t > 0 ? Math.sin(this.time * 18 + i) * 2.5 : 0;
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(x + wob, y + 10, 11, 4, 0, 0, 7); ctx.fill();
      if (egg.lucky) {
        const hh = Math.floor((this.time * 70 + i * 60) % 360);
        ctx.shadowColor = `hsl(${hh},90%,65%)`; ctx.shadowBlur = 14;
        ctx.fillStyle = `hsl(${hh},70%,72%)`;
      } else {
        ctx.fillStyle = "#f6efdd";
      }
      ctx.beginPath(); ctx.ellipse(x + wob, y, 11, 14, 0, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(190,170,130,.5)";
      ctx.beginPath(); ctx.ellipse(x + wob + 3, y + 4, 6, 8, -0.3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath(); ctx.ellipse(x + wob - 3.5, y - 5, 3.5, 5.5, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(120,100,70,.6)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x + wob, y, 11, 14, 0, 0, 7); ctx.stroke();
      // 進捗リング
      const prog = 1 - egg.t / egg.total;
      ctx.strokeStyle = "rgba(242,198,94,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 19, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    }
    // Phase8: 「卵の巣」ラベルは撤去(見れば分かる=自明)
  },

  // ---------------- トカゲ(横向き・オオトカゲスタイル) ----------------
  // 参照: 頭を高く上げた立ち姿 / 高く跳ね上がる鞭状の尾 / 爪のある四肢 / 喉のたるみ
  // §8.15 スプライトキャッシュ: 生き物本体(魂)を offscreen に焼いて blit する。
  //   本体描画は _paintLizardBody(魂・不変)、状態表示(選択/毒/負傷/BABY等・動的)は _paintLizardState に分離。
  //   drawLizard がキャッシュ経由か直接手続きかを振り分ける(発光/伝説はぼかしのため常に手続き)。
  drawLizard(ctx, lz, noCache) {
    const sp = speciesById(lz.speciesId);
    const glowy = sp.glow || lz.morphId === "legendary";
    // モーション(§8.5): 居場所で留まる個体に姿勢の"揺れ"を付ける。魂ピクセルは不変=配置トランスフォーム(整数bob)のみ。
    const pb = this._poseBob(lz);
    if (pb) { ctx.save(); ctx.translate(pb.dx, pb.dy); }
    // 発光/伝説=ぼかしのため常に手続き。noCache=拡大描画(ヌシ等・変形ctx内)はキャッシュを迂回。
    if (glowy || noCache || Render._lizCacheOn === false) {
      this._paintLizardBody(ctx, lz); // _paintLizardBody が内部で lz.x,lz.y へ translate する
    } else {
      this._blitLizardCached(ctx, lz);
    }
    this._paintLizardState(ctx, lz);
    if (pb) ctx.restore();
  },

  // モーション(§8.5): 居場所(lz.spot)で静止中の姿勢の揺れを整数px平行移動で表現(魂ピクセル不変・crisp維持・キャッシュ無効化なし)。
  //   posture別に drink=水面へ頭を沈める上下 / bask=ゆっくり呼吸 / wade=尾で水を跳ねる左右 / lookup/lookout=見上げてわずかに浮く / emerge=入口で軽い上下。
  //   reduced-motion/移動中/非スポットでは null(静止)=fable1(reduced-motion停止・静的滞在は残る)。★Ric実機で振幅/速さ(CFG)を調整。
  _poseBob(lz) {
    if (!lz.spot || lz.moving) return null;
    if (window.Motion && Motion.reduced) return null;
    const amp = CFG.poseBobPx || 3, sp = CFG.poseBobSpeed || 1.2;
    const t = this.time * sp + (lz.id % 100) * 0.137; // idで位相をずらす(群れが揃って動かない)
    const p = lz._spotPosture;
    let dx = 0, dy = 0;
    if (p === "drink") dy = Math.max(0, Math.sin(t)) * Math.max(0, Math.sin(t)) * amp;      // 周期的に頭を水面へ沈める(下)
    else if (p === "bask") dy = 1 + Math.sin(t * 0.8) * amp * 0.5;                            // 伏せて呼吸(わずかに沈む+上下)
    else if (p === "wade") { dx = Math.sin(t * 1.4) * amp; dy = Math.abs(Math.sin(t)) * amp * 0.4; } // 尾で水を跳ねる左右+軽い上下
    else if (p === "lookup" || p === "lookout") dy = -1 - Math.abs(Math.sin(t * 0.7)) * amp * 0.4; // 見上げてわずかに浮く
    else if (p === "emerge") dy = Math.sin(t * 0.9) * amp * 0.5;                              // 入口で軽い日向ぼっこの上下
    else dy = Math.sin(t * 0.8) * amp * 0.4;                                                  // 既定=穏やかな呼吸
    return { dx: Math.round(dx), dy: Math.round(dy) };
  },

  // 生き物本体(魂)。呼び出し側で lz.x,lz.y へ translate 済みの前提はなく、ここで translate する。
  // ※ this.time を使う動的アニメ(尾のしなり・歩行・アオジタの舌)を含むが、"呼ばれた瞬間の this.time" で描くため
  //   直接描画でもキャッシュ焼き込みでも、同一時刻なら出力はピクセル一致(キャッシュは焼く/blitの振り分けのみ)。
  _paintLizardBody(ctx, lz) {
    const sp = speciesById(lz.speciesId);
    const col = this.lizardColor(lz);
    // 群衆スケール: 表示数が多いほど縮小して見通しを確保
    const scale = sp.size * (lz.stage === "baby" ? 0.5 : 1) * Game.crowdScale();
    const L = 105 * scale;                    // 体格スケール
    const injured = lz.injuredT > 0;
    // §9.1 自切/再生: 負傷=尾を切り離す→回復とともに尾が再生。tailRegen(0=断端/直後 … 1=全長)は injuredT からの派生(魂の状態)。
    //   回復速度は既存の負傷回復(injuredTの減少・保温設備で加速)に自然同期。非負傷=1で従来と完全同一描画。
    const AUTO_CUT = 0.4; // 尾の自切面(背骨 t。0=尾先/この手前が尾)
    const tailRegen = injured ? clamp(1 - lz.injuredT / (CFG.injuryTime || 10), 0, 1) : 1;
    const tailCutStart = AUTO_CUT * (1 - tailRegen); // 尾の生えている根元側の開始t(=断面)
    const moving = lz.moving && !injured;
    const phase = this.time * 8 + lz.id * 1.31;
    const face = Math.cos(lz.angle) >= 0 ? 1 : -1; // 横向きスプライトは左右反転のみ
    const baseAlpha = injured ? 0.55 : 1;

    const outline = "rgba(18,10,4,.6)";
    const darker = `hsl(${col.h},${Math.min(100, col.s + 5)}%,${Math.max(6, col.l - 22)}%)`;
    const darkest = `hsl(${col.h},${Math.min(100, col.s + 5)}%,${Math.max(4, col.l - 34)}%)`;
    const lighter = `hsl(${col.h},${Math.max(0, col.s - 14)}%,${Math.min(93, col.l + 16)}%)`;

    ctx.save();
    ctx.translate(lz.x, lz.y);
    if (injured) ctx.globalAlpha = 0.55;

    // 地面の影
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath(); ctx.ellipse(-L * 0.06 * face, L * 0.01, L * 0.42, L * 0.06, 0, 0, 7); ctx.fill();

    ctx.scale(face, 1);
    if (moving) {
      ctx.rotate(clamp(Math.sin(lz.angle), -1, 1) * 0.1 * face); // 縦移動でわずかに傾く
      ctx.translate(0, Math.sin(phase * 2) * L * 0.008);          // 歩行の上下動
    }
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    // --- 背骨サンプリング (t=0 尾先 → 1 鼻先、地面が y=0) ---
    const N = 34;
    const pts = [], nrm = [], wid = [];
    const tailAmp = L * (moving ? 0.05 : 0.02);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // §9.1 自切: 再生していない尾先側(t<tailCutStart)は断面(tailCutStart)へ畳む=尾が短い断端に見える
      const te = (tailRegen < 1 && t < AUTO_CUT) ? Math.max(t, tailCutStart) : t;
      const k = lizSideSample(te);
      let w = k.w * L;
      let y = k.y * L;
      // 尾のしなり(先端ほど大きく)
      if (te < 0.42) y += Math.sin(phase * 0.8 - te * 9) * tailAmp * Math.pow((0.42 - te) / 0.42, 1.6);
      // 種族ごとの体型(尾に掛かるものは te=自切反映後のtで判定=断端でも整合)
      if (sp.id === "leopa" && te > 0.14 && te < 0.48) w *= 1.8;   // 脂肪を蓄えた太い尾
      if (sp.id === "futoago" && t > 0.5 && t < 0.8) w *= 1.18;  // 幅広の胴
      if (sp.id === "komodo") w *= 1.15;                          // 重量級
      if (sp.id === "kanahebi" && te < 0.48) w *= 0.7;             // 細い尾
      pts.push({ x: k.x * L, y }); wid.push(w);
    }
    // 平滑化(キーポイント折れ線の角を落とす)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < N; i++) {
        pts[i].x = (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4;
        pts[i].y = (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4;
      }
    }
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      nrm.push({ x: -dy / d, y: dx / d });
    }
    // 各サンプルの「背側」がどちらかを判定(+n*u が上)
    const up = [];
    for (let i = 0; i <= N; i++) up.push(nrm[i].y < 0 ? 1 : -1);
    const S = (t) => {
      const i = Math.round(clamp(t, 0, 1) * N);
      return { p: pts[i], n: nrm[i], w: wid[i], u: up[i], i };
    };

    // --- 輪郭パス(ごつごつの隆起付き) ---
    const orand = lcg(lz.id * 977 + 3);
    const jagA = [], jagB = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = 0.12 * (t < 0.82 ? 1 : 0.4); // 頭部は鱗が細かい
      jagA.push(1 + (orand() * 2 - 1) * a);
      jagB.push(1 + (orand() * 2 - 1) * a);
    }
    const body = new Path2D();
    body.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= N; i++) body.lineTo(pts[i].x + nrm[i].x * wid[i] * jagA[i], pts[i].y + nrm[i].y * wid[i] * jagA[i]);
    for (let i = N; i >= 0; i--) body.lineTo(pts[i].x - nrm[i].x * wid[i] * jagB[i], pts[i].y - nrm[i].y * wid[i] * jagB[i]);
    body.closePath();

    // --- 脚(爪のある四肢): 奥側 → 体 → 手前側の順で奥行きを出す ---
    const legSegs = []; // 特性描画用: 手前側の脚セグメント(歩行スイングに追従・trait roster §3)
    const claws = (toe, dir) => {
      ctx.strokeStyle = "#1a120a";
      ctx.lineWidth = Math.max(1.2, L * 0.012);
      for (const [dx2, dy2] of [[L * 0.036, L * 0.012], [L * 0.042, -L * 0.002], [L * 0.033, -L * 0.016]]) {
        ctx.beginPath();
        ctx.moveTo(toe.x, toe.y);
        ctx.quadraticCurveTo(toe.x + dx2 * 0.7 * dir, toe.y + dy2 - L * 0.01, toe.x + dx2 * dir, toe.y + dy2 + L * 0.006);
        ctx.stroke();
      }
    };
    const legPair = (isFar) => {
      const shift = isFar ? L * 0.035 : 0;
      const c = isFar ? darkest : col.css;
      const phOff = isFar ? Math.PI : 0;
      // --- 後脚(筋肉質の太もも) ---
      const hip = { x: -L * 0.06 + shift, y: -L * 0.1 };
      const swH = moving ? Math.sin(phase + phOff) * L * 0.05 : 0;
      const liftH = moving ? Math.max(0, Math.sin(phase + phOff + 0.7)) * L * 0.04 : 0;
      const kneeH = { x: hip.x + L * 0.09 + swH * 0.6, y: -L * 0.055 };
      const ankH = { x: hip.x - L * 0.04 + swH, y: -L * 0.012 - liftH };
      const toeH = { x: ankH.x + L * 0.12 + swH * 0.3, y: -L * 0.004 - liftH * 0.6 };
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse((hip.x + kneeH.x) / 2, (hip.y + kneeH.y) / 2 + L * 0.012, L * 0.08, L * 0.055, 0.5, 0, 7); ctx.fill();
      if (!isFar) {
        ctx.strokeStyle = outline; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse((hip.x + kneeH.x) / 2, (hip.y + kneeH.y) / 2 + L * 0.012, L * 0.08, L * 0.055, 0.5, 0, 7); ctx.stroke();
      }
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(3, L * 0.042);
      ctx.beginPath(); ctx.moveTo(kneeH.x, kneeH.y); ctx.lineTo(ankH.x, ankH.y); ctx.stroke();
      ctx.lineWidth = Math.max(2.4, L * 0.028);
      ctx.beginPath(); ctx.moveTo(ankH.x, ankH.y); ctx.lineTo(toeH.x, toeH.y); ctx.stroke();
      if (!isFar) claws(toeH, 1);
      // --- 前脚 ---
      const sh = { x: L * 0.2 + shift, y: -L * 0.14 };
      const swF = moving ? Math.sin(phase + phOff + Math.PI) * L * 0.045 : 0;
      const liftF = moving ? Math.max(0, Math.sin(phase + phOff + Math.PI + 0.7)) * L * 0.035 : 0;
      const elb = { x: sh.x - L * 0.025 + swF * 0.5, y: -L * 0.07 };
      const wri = { x: sh.x + L * 0.008 + swF, y: -L * 0.012 - liftF };
      const toeF = { x: wri.x + L * 0.08 + swF * 0.3, y: -L * 0.004 - liftF * 0.6 };
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse((sh.x + elb.x) / 2, (sh.y + elb.y) / 2, L * 0.055, L * 0.042, 1.25, 0, 7); ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(3, L * 0.038);
      ctx.beginPath(); ctx.moveTo(elb.x, elb.y); ctx.lineTo(wri.x, wri.y); ctx.stroke();
      ctx.lineWidth = Math.max(2.4, L * 0.026);
      ctx.beginPath(); ctx.moveTo(wri.x, wri.y); ctx.lineTo(toeF.x, toeF.y); ctx.stroke();
      if (!isFar) claws(toeF, 1);
      if (!isFar) legSegs.push({ a: kneeH, b: ankH }, { a: ankH, b: toeH }, { a: elb, b: wri }, { a: wri, b: toeF }); // 特性用(歩行追従)
    };
    legPair(true); // 奥側の脚

    // エリマキトカゲのフリルは首の後ろ(体より奥)に描く
    if (sp.id === "erimaki") {
      const nk = S(0.86);
      ctx.fillStyle = `hsl(${col.h},${Math.min(100, col.s + 12)}%,${Math.max(10, col.l - 10)}%)`;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(nk.p.x - L * 0.03, nk.p.y + L * 0.03, L * 0.15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = darker; ctx.lineWidth = 1.2;
      for (let a = 0; a < 6.2; a += 0.52) {
        ctx.beginPath();
        ctx.moveTo(nk.p.x - L * 0.03, nk.p.y + L * 0.03);
        ctx.lineTo(nk.p.x - L * 0.03 + Math.cos(a) * L * 0.145, nk.p.y + L * 0.03 + Math.sin(a) * L * 0.145);
        ctx.stroke();
      }
    }

    // --- 胴体+尾+首+頭(一体の輪郭) ---
    if (sp.glow || lz.morphId === "legendary") { // 発光系統・伝説個体
      ctx.shadowColor = `hsla(${col.h},95%,65%,${0.75 + Math.sin(this.time * 3 + lz.id) * 0.2})`;
      ctx.shadowBlur = lz.morphId === "legendary" ? 30 : 24;
    }
    ctx.fillStyle = col.css;
    ctx.fill(body);
    ctx.shadowBlur = 0;

    // --- 陰影・質感・模様(体内にクリップ) ---
    ctx.save();
    ctx.clip(body);

    // 縁の内側を暗く(立体感)
    ctx.strokeStyle = darker; ctx.globalAlpha = baseAlpha * 0.4;
    ctx.lineWidth = L * 0.05;
    ctx.stroke(body);
    ctx.globalAlpha = baseAlpha;

    // 背側を暗く・腹側を明るく(写真の上下トーン)
    const edgePath = (sign, k) => {
      ctx.beginPath();
      for (let i = 1; i <= N - 1; i++) {
        const m = i === 1 ? "moveTo" : "lineTo";
        ctx[m](pts[i].x + nrm[i].x * wid[i] * k * sign * up[i], pts[i].y + nrm[i].y * wid[i] * k * sign * up[i]);
      }
    };
    ctx.strokeStyle = darkest; ctx.globalAlpha = baseAlpha * 0.3;
    ctx.lineWidth = L * 0.05; edgePath(1, 0.72); ctx.stroke();
    ctx.strokeStyle = lighter; ctx.globalAlpha = baseAlpha * 0.42;
    ctx.lineWidth = L * 0.06; edgePath(-1, 0.66); ctx.stroke();
    ctx.globalAlpha = baseAlpha;

    // ごつごつしたイボ状の鱗
    const trand = lcg(lz.id * 331 + 7);
    for (let i = 0; i < 34; i++) {
      const t = 0.08 + trand() * 0.88;
      const lat = (trand() * 2 - 1) * 0.8;
      const s0 = S(t);
      const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
      const r = L * (0.007 + trand() * 0.01);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.45, r, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.85, 0, 7); ctx.fill();
    }
    // 大きめの結節
    for (let i = 0; i < 6; i++) {
      const t = 0.45 + trand() * 0.33;
      const lat = (trand() * 2 - 1) * 0.55;
      const s0 = S(t);
      const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
      const r = L * (0.013 + trand() * 0.009);
      ctx.fillStyle = "rgba(0,0,0,.32)";
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.5, r, 0, 7); ctx.fill();
      ctx.fillStyle = darker;
      ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.32, 0, 7); ctx.fill();
    }

    // 遺伝模様
    const prand = lcg(lz.id * 7919 + 17);
    ctx.fillStyle = darker; ctx.strokeStyle = darker;
    if (lz.pattern === "bands") {
      // 体を縦に横切るバンド(オオトカゲの縞)
      for (let t = 0.06; t <= 0.78; t += 0.075) {
        const s0 = S(t);
        const w = s0.w + 2;
        ctx.lineWidth = L * (0.028 + prand() * 0.018);
        ctx.beginPath();
        ctx.moveTo(s0.p.x + s0.n.x * w, s0.p.y + s0.n.y * w);
        ctx.lineTo(s0.p.x - s0.n.x * w, s0.p.y - s0.n.y * w);
        ctx.stroke();
      }
    } else if (lz.pattern === "spots") {
      for (let i = 0; i < 18; i++) {
        const onHead = prand() < 0.3;
        const t = onHead ? 0.82 + prand() * 0.15 : 0.06 + prand() * 0.72;
        const lat = (prand() * 2 - 1) * 0.72;
        const s0 = S(t);
        const x = s0.p.x + s0.n.x * s0.w * lat, y = s0.p.y + s0.n.y * s0.w * lat;
        const r = L * (onHead ? 0.01 + prand() * 0.01 : 0.018 + prand() * 0.02);
        ctx.beginPath();
        ctx.ellipse(x, y, r * (0.8 + prand() * 0.5), r, prand() * 3, 0, 7);
        ctx.fill();
      }
    } else if (lz.pattern === "stripe") {
      // 体側に走る2本のストライプ
      for (const k of [0.15, -0.3]) {
        ctx.lineWidth = L * (k > 0 ? 0.024 : 0.016);
        ctx.beginPath();
        for (let i = 2; i <= N - 2; i++) {
          const m = i === 2 ? "moveTo" : "lineTo";
          ctx[m](pts[i].x + nrm[i].x * wid[i] * k * up[i], pts[i].y + nrm[i].y * wid[i] * k * up[i]);
        }
        ctx.stroke();
      }
    } else {
      // 無地でも鱗の質感を少し
      for (let i = 0; i < 8; i++) {
        const t = 0.3 + prand() * 0.55;
        const lat = (prand() * 2 - 1) * 0.5;
        const s0 = S(t);
        ctx.globalAlpha = baseAlpha * 0.35;
        ctx.beginPath(); ctx.arc(s0.p.x + s0.n.x * s0.w * lat, s0.p.y + s0.n.y * s0.w * lat, L * 0.011, 0, 7); ctx.fill();
        ctx.globalAlpha = baseAlpha;
      }
    }
    ctx.restore();

    // --- 喉のたるんだ皮(デューラップ) ---
    const d1 = S(0.9), d2 = S(0.79);
    const v1 = { x: d1.p.x - d1.n.x * d1.w * d1.u * 0.85, y: d1.p.y - d1.n.y * d1.w * d1.u * 0.85 };
    const v2 = { x: d2.p.x - d2.n.x * d2.w * d2.u * 0.85, y: d2.p.y - d2.n.y * d2.w * d2.u * 0.85 };
    const sag = L * (sp.id === "komodo" || sp.id === "futoago" ? 0.085 : 0.055);
    ctx.fillStyle = col.css;
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag, v2.x, v2.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = Math.max(1.4, L * 0.016);
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag, v2.x, v2.y);
    ctx.stroke();
    // 喉のしわ
    ctx.strokeStyle = darker; ctx.lineWidth = 1;
    for (const k of [0.55, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y + 2);
      ctx.quadraticCurveTo((v1.x + v2.x) / 2, Math.max(v1.y, v2.y) + sag * k, v2.x, v2.y + 2);
      ctx.stroke();
    }
    // フトアゴのあごヒゲ棘
    if (sp.id === "futoago") {
      ctx.fillStyle = darker;
      for (let k = 0.1; k <= 0.9; k += 0.16) {
        const bx = v1.x + (v2.x - v1.x) * k;
        const by = Math.max(v1.y, v2.y) + sag * (1 - Math.abs(k - 0.5) * 1.6) * 0.9;
        ctx.beginPath();
        ctx.moveTo(bx - L * 0.008, by - L * 0.01);
        ctx.lineTo(bx, by + L * 0.028);
        ctx.lineTo(bx + L * 0.008, by - L * 0.01);
        ctx.closePath(); ctx.fill();
      }
    }

    // --- 輪郭線 ---
    ctx.strokeStyle = outline; ctx.lineWidth = Math.max(1.6, L * 0.018);
    ctx.stroke(body);

    // --- 背中のクレスト(背側の縁に沿った鋸歯) ---
    const srand = lcg(lz.id * 53 + 9);
    const crestAmp = (sp.id === "futoago" || sp.id === "komodo") ? 0.03 : 0.021;
    ctx.fillStyle = darker;
    for (let t = 0.05; t <= 0.9; t += 0.032) {
      const s0 = S(t);
      const w = s0.w * jagA[s0.i];
      const bx = s0.p.x + s0.n.x * w * s0.u, by = s0.p.y + s0.n.y * w * s0.u;
      const a = pts[Math.min(N, s0.i + 1)], b = pts[Math.max(0, s0.i - 1)];
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      const spk = L * crestAmp * (0.5 + srand() * 0.7) * (t < 0.45 ? 0.75 : 1);
      ctx.beginPath();
      ctx.moveTo(bx - (dx / d) * L * 0.012, by - (dy / d) * L * 0.012);
      ctx.lineTo(bx + s0.n.x * spk * s0.u - (dx / d) * L * 0.002, by + s0.n.y * spk * s0.u - (dy / d) * L * 0.002);
      ctx.lineTo(bx + (dx / d) * L * 0.012, by + (dy / d) * L * 0.012);
      ctx.closePath(); ctx.fill();
    }

    // --- 手前側の脚(体の上に重ねる) ---
    legPair(false);

    // --- 頭部ディテール ---
    const he = S(0.93);
    const ex = he.p.x + he.n.x * he.w * 0.15 * he.u, ey = he.p.y + he.n.y * he.w * 0.15 * he.u;
    const eyeR = Math.max(1.8, L * 0.022);
    // 眉の隆起
    ctx.strokeStyle = darkest; ctx.lineWidth = Math.max(1.4, L * 0.014);
    ctx.beginPath(); ctx.moveTo(ex - eyeR * 2, ey - eyeR * 1.3); ctx.lineTo(ex + eyeR * 1.6, ey - eyeR * 1.5); ctx.stroke();
    // 目(横向きなので1つ)
    ctx.fillStyle = lz.morphId === "albino" ? "#8f3030" : "#17100a";
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath(); ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.35, eyeR * 0.3, 0, 7); ctx.fill();
    // 特性(trait)の見た目=体/顔に上乗せ(魂の骨格は不変)。通常個体は lz.traits 未定義でスキップ。
    //   レジェンダリーは特性の対象外(虹発光そのものが最上の個性=徴を描かない・§16/①)。既存の morphId フラグで判定(新ロジックなし)。
    //   g=頭部(ex/ey/eyeR)+体ジオメトリ(S=背骨サンプラ/body=輪郭Path/legs=手前脚セグメント)。ロスター拡張(§3)は全てこの窓口経由で描く。
    if (lz.morphId !== "legendary" && lz.traits && lz.traits.length && typeof TRAITS !== "undefined") this._paintTraits(ctx, lz, { ex, ey, eyeR, L, col, S, body, legs: legSegs });
    // 耳の穴(あごの後ろ)
    const ea = S(0.875);
    ctx.fillStyle = "rgba(18,10,4,.5)";
    ctx.beginPath(); ctx.ellipse(ea.p.x - L * 0.012, ea.p.y + ea.w * 0.25, L * 0.007, L * 0.014, 0.2, 0, 7); ctx.fill();
    // 口のライン(鼻先から後ろへ)
    const m1 = S(0.995), m2 = S(0.885);
    const mv1 = { x: m1.p.x - m1.n.x * m1.w * m1.u * 0.5, y: m1.p.y - m1.n.y * m1.w * m1.u * 0.5 };
    const mv2 = { x: m2.p.x - m2.n.x * m2.w * m2.u * 0.8, y: m2.p.y - m2.n.y * m2.w * m2.u * 0.8 };
    ctx.strokeStyle = "rgba(18,10,4,.55)"; ctx.lineWidth = Math.max(1.1, L * 0.011);
    ctx.beginPath();
    ctx.moveTo(mv1.x, mv1.y);
    ctx.quadraticCurveTo((mv1.x + mv2.x) / 2, Math.max(mv1.y, mv2.y) + L * 0.012, mv2.x, mv2.y);
    ctx.stroke();
    // 鼻孔
    const no = S(0.985);
    ctx.fillStyle = "rgba(18,10,4,.6)";
    ctx.beginPath(); ctx.arc(no.p.x, no.p.y - no.w * 0.2, Math.max(0.9, L * 0.008), 0, 7); ctx.fill();
    // アオジタの青い舌
    if (sp.id === "aojita" && (this.time * 0.7 + lz.id) % 2.4 < 0.45) {
      ctx.strokeStyle = "#4a7fd9"; ctx.lineWidth = Math.max(2, L * 0.02);
      ctx.beginPath();
      ctx.moveTo(mv1.x, mv1.y);
      ctx.lineTo(mv1.x + L * 0.1, mv1.y + L * 0.02 + Math.sin(this.time * 20) * 2);
      ctx.stroke();
    }

    ctx.restore();
  },

  // 状態表示オーバーレイ(選択リング/毒/負傷/BABY/創始者)。動的(明滅・選択)なのでキャッシュせず毎フレーム描画。
  _paintLizardState(ctx, lz) {
    const sp = speciesById(lz.speciesId);
    const L = 105 * sp.size * (lz.stage === "baby" ? 0.5 : 1) * Game.crowdScale();
    // --- 状態表示(反転なし) ---
    ctx.save();
    ctx.translate(lz.x, lz.y);
    if (Game.selectedId === lz.id) {
      ctx.strokeStyle = "#ffd24c"; ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -this.time * 24;
      ctx.beginPath(); ctx.ellipse(-L * 0.06, 0, L * 0.55, L * 0.12, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.textAlign = "center";
    if (lz.founder) { // 創始者マーク (V3 §9.4)
      ctx.font = "13px sans-serif";
      this.glyphCrown(ctx, L * 0.3, -L * 0.42 - 6, 11);
    }
    if (lz.poisonT > 0) { // サソリの毒: 紫の明滅
      ctx.fillStyle = `rgba(180,90,220,${0.4 + Math.sin(this.time * 10) * 0.25})`;
      ctx.beginPath(); ctx.ellipse(0, -L * 0.15, L * 0.4, L * 0.28, 0, 0, 7); ctx.fill();
      ctx.font = "13px sans-serif";
      this.glyphSkull(ctx, 0, -L * 0.52 - 6, 9);
    }
    if (lz.stage === "baby") { // §9.1 負傷マーカー(赤十字)は撤廃=尾の断端+再生で伝える
      ctx.fillStyle = "rgba(0,0,0,.45)";
      rr(ctx, -19, -L * 0.52 - 13, 38, 15, 7); ctx.fill();
      ctx.fillStyle = "#ffe9b0"; ctx.font = "bold 10px sans-serif";
      ctx.fillText("BABY", 0, -L * 0.52 - 2);
    }
    ctx.restore();
  },

  // §8.15: 生き物本体をキャッシュ経由で blit。sig(位相ステップ/向き/群衆スケール/歩行/負傷)が変わったときだけ焼き直す。
  //   焼き込みは _paintLizardBody(魂・不変)そのもの=同一時刻なら手続き描画とピクセル一致。位置は整数へ丸めて等倍・スムージング無効。
  _blitLizardCached(ctx, lz) {
    if (!this._lizCache) this._lizCache = new Map();
    const sp = speciesById(lz.speciesId);
    const scale = sp.size * (lz.stage === "baby" ? 0.5 : 1) * Game.crowdScale();
    const L = 105 * scale;
    const injured = lz.injuredT > 0;
    const moving = lz.moving && !injured;
    const face = Math.cos(lz.angle) >= 0 ? 1 : -1;
    const phaseStep = Math.round((this.time * 8 + lz.id * 1.31) / SPRITE_ANIM_Q);
    const crowdB = Math.round(Game.crowdScale() * 1000);
    // §9.1 尾の再生率を sig に含める(負傷個体は再生段階ごとに焼き直し=性能維持しつつ尾が伸びる)
    const trB = injured ? Math.round(clamp(1 - lz.injuredT / (CFG.injuryTime || 10), 0, 1) * 6) : 6;
    // 特性(S4): 見た目が特性で変わる個体はキャッシュを分ける(古い姿の焼き残り防止)。無印/レジェンダリーは "" =従来と同一描画。
    const sig = phaseStep + "|" + face + "|" + crowdB + "|" + (moving ? 1 : 0) + "|" + (injured ? 1 : 0) + "|" + trB + "|" + this._traitSig(lz);
    // スプライト外接box: 魂の最大範囲(尾先x=-0.80L・鼻先+0.485L、幅/クレスト/脚/デューラップ/尾のしなり)を余裕を持って包む。
    // 左右反転(face)で尾は±0.80Lに振れるため x は対称に確保。原点(lz基準)=(ox,oyTop)
    const ox = Math.ceil(L * 0.98) + 3, oyTop = Math.ceil(L * 0.7) + 3, oyBot = Math.ceil(L * 0.3) + 3;
    const cw = ox * 2, ch = oyTop + oyBot;
    let e = this._lizCache.get(lz.id);
    if (!e || e.sig !== sig) {
      const cv = (e && e.canvas) || document.createElement("canvas");
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const g = cv.getContext("2d");
      g.clearRect(0, 0, cw, ch);
      g.save(); g.translate(ox - lz.x, oyTop - lz.y); // _paintLizardBody内部の translate(lz.x,lz.y) と相殺し原点を(ox,oyTop)へ
      this._paintLizardBody(g, lz);
      g.restore();
      e = { canvas: cv, sig, ox, oy: oyTop };
      this._lizCache.set(lz.id, e);
    }
    e.used = this._frameCount || 0;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.canvas, Math.round(lz.x) - e.ox, Math.round(lz.y) - e.oy);
    ctx.imageSmoothingEnabled = prev;
  },

  // §8.15: キャッシュのLRU破棄(毎フレーム末に呼ぶ)。上限超過分と長く未使用の個体を捨ててメモリ上限を保証。
  _pruneLizCache() {
    const c = this._lizCache;
    if (!c || c.size <= LIZ_CACHE_MAX) return;
    const ents = [...c.entries()].sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
    for (let i = 0; i < ents.length - LIZ_CACHE_MAX; i++) c.delete(ents[i][0]);
  },

  // ---------------- ボス共通ディスパッチ (GameExpansion_v2 ①②) ----------------
  // ボス級の拡大率(Brushup V2 §3.2)。描画のみ・座標や当たり判定は不変
  bossScale(raid) {
    const big = raid.tier || raid.boss || raid.elite;
    let k = big ? CFG.bossScaleBoss + (raid.tier || 0) * CFG.bossScaleTier : CFG.bossScaleSnake;
    if (raid.elite) k *= (CFG.eliteScale || 1.15); // Phase6: 大ボスは一回り大きい
    if (!raid.snake.arrived && !raid.type.flying) k *= CFG.bossApproach; // 迫り=より大きな影
    if (raid.snake.arrived) {
      k *= 1 + Math.sin(this.time * 2.1) * CFG.bossBreath;              // 呼吸
      const lunge = Math.max(0, Math.sin(this.time * 0.9));             // 時折の威嚇(鎌首)
      k *= 1 + Math.pow(lunge, 14) * 0.09;
    }
    return k;
  },

  // 撃破の死に様(§3.3): のけぞり→崩壊→消滅。座標・ロジックには関与しない
  drawCorpse(ctx, c) {
    const e = c.snake;
    const T = 1.15, p = clamp(1 - c.dyingT / T, 0, 1);
    const big = c.tier || c.boss || c.elite;
    const k = big ? CFG.bossScaleBoss + (c.tier || 0) * CFG.bossScaleTier : CFG.bossScaleSnake;
    const rear = Math.sin(Math.min(p / 0.28, 1) * Math.PI) * -0.38;      // のけぞり
    const collapse = clamp((p - 0.3) / 0.5, 0, 1);                       // 崩壊
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(rear + collapse * 0.22);
    ctx.scale(k * (1 + collapse * 0.08), k * (1 - collapse * 0.85));
    ctx.globalAlpha = 1 - clamp((p - 0.55) / 0.45, 0, 1);
    ctx.filter = `saturate(${(1 - collapse * 0.7).toFixed(2)}) brightness(${(1 - collapse * 0.4).toFixed(2)})`;
    ctx.translate(-e.x, -e.y);
    switch (c.typeId) {
      case "hawk": this.drawHawk(ctx, c); break;
      case "crow": this.drawCrow(ctx, c); break;
      case "monitor": this.drawMonitor(ctx, c); break;
      case "scorpion": this.drawScorpion(ctx, c); break;
      case "spider": this.drawSpider(ctx, c); break;
      case "bugger": this.drawBugger(ctx, c); break;
      default: this.drawSnake(ctx, c);
    }
    ctx.restore();
    // 崩壊の土煙(簡素な粒・描画のみ)
    if (collapse > 0 && collapse < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - collapse) * 0.5;
      ctx.fillStyle = "rgba(216, 195, 165, .5)";
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + p * 3;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * (30 + collapse * 70), e.y + 20 - Math.sin(a) * 10 * collapse, 5 + collapse * 6, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  // Phase6: 現在の惑星の署名ボス描画メソッド名を返す。raid.boss かつ 脅威型が一致するときのみ(通常襲来/不一致はnull=既存描画)。
  planetBossDraw(raid) {
    if (!raid.boss) return null;
    const st = Game.currentStage && Game.currentStage();
    const pb = st && PLANET_BOSS[st.id];
    // Phase6: 署名惑星でボス時は常に署名の姿(汎用の姿をフィールドに出さない)。
    //   R30+はtypeId=pb.threat一致で挙動も署名。pre-R30はtypeId=snakeでも署名の姿+snake挙動(案B=序盤を過酷にしない)。
    return (pb && typeof this[pb.draw] === "function") ? pb.draw : null;
  },

  drawBoss(ctx, raid) {
    const e = raid.snake;
    if (raid.typeId === "spider") this.drawWebs(ctx, raid); // ウェブ/蔓=盤の実座標(ボスのscale外)。署名ボス描画時も必ず出す
    const k = this.bossScale(raid);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(k, k);
    ctx.translate(-e.x, -e.y);
    // 迫り(未到着): 大きな影/シルエットとして進入(§3.1)
    if (!e.arrived && !raid.type.flying) {
      ctx.filter = "brightness(0.32) saturate(0.5)";
      ctx.globalAlpha = 0.9;
    } else if (raid.hitT > 0) {
      ctx.filter = "brightness(2) saturate(1.4)"; // 被弾フラッシュ(§3.3)
    } else if (raid.enraged) {
      // Enrage: ボス本体が赤く明滅(既存判定に同期・§3.3)
      const p = 0.5 + Math.sin(this.time * 12) * 0.5;
      ctx.filter = `brightness(${(1.05 + p * 0.35).toFixed(2)}) saturate(${(1.2 + p * 0.5).toFixed(2)}) hue-rotate(-${Math.round(p * 14)}deg)`;
    }
    // ティアオーラ (T3+)
    if (raid.tierDef && raid.tierDef.aura) {
      const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 130);
      g.addColorStop(0, hexA(raid.tierDef.aura, 0.28 + Math.sin(this.time * 5) * 0.08));
      g.addColorStop(1, hexA(raid.tierDef.aura, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, 130, 0, 7); ctx.fill();
    }
    // Phase6: 大ボス(elite)は脅威色の濃いオーラ+脈動(通常ボスとの格差を視覚化)
    if (raid.elite) {
      const ec = (raid.tierDef && raid.tierDef.aura) || "#ffd700";
      const pa = (CFG.eliteAuraA || 0.34) + Math.sin(this.time * 4) * 0.14, R = CFG.eliteAuraR || 168;
      const g2 = ctx.createRadialGradient(e.x, e.y, 20, e.x, e.y, R);
      g2.addColorStop(0, hexA(ec, pa)); g2.addColorStop(0.7, hexA(ec, pa * 0.4)); g2.addColorStop(1, hexA(ec, 0));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, 7); ctx.fill();
    }
    // Phase6 惑星署名ボス: raid.boss時のみ、その惑星の脅威型が一致すれば固有の姿で描画(通常襲来/不一致は既存脅威型のまま)
    const sig = this.planetBossDraw(raid);
    if (sig) this[sig](ctx, raid);
    else switch (raid.typeId) {
      case "hawk": this.drawHawk(ctx, raid); break;
      case "crow": this.drawCrow(ctx, raid); break;
      case "monitor": this.drawMonitor(ctx, raid); break;
      case "scorpion": this.drawScorpion(ctx, raid); break;
      case "spider": this.drawSpider(ctx, raid); break;
      case "bugger": this.drawBugger(ctx, raid); break;
      default: this.drawSnake(ctx, raid);
    }
    // Elite金縁
    if (raid.elite) {
      ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]); ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath(); ctx.ellipse(e.x + (raid.typeId === "snake" ? 90 : 0), e.y, 120, 60, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      this.pill(ctx, e.x - 30, e.y - 105, "ELITE", "rgba(120,90,10,.75)", "#ffe9a0");
    }
    // Enrage: 赤い明滅
    if (raid.enraged) {
      ctx.strokeStyle = `rgba(255,60,40,${0.5 + Math.sin(this.time * 12) * 0.4})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(e.x + (raid.typeId === "snake" ? 90 : 0), e.y, 105, 52, 0, 0, 7); ctx.stroke();
    }
    ctx.restore(); // 変換ここまで
    // HPバー・残り時間はDOMのボスHUD(§3.3)へ移設。Canvasには描かない
  },



  // 登場カットイン (T2+)
  // §9.2/§9-C4 飼育槽中央の軽い通知(ボス出現・進行マイルストーン等)。タップ不要・暗転なし・自動フェード。
  //   【トースト化しない設計】同時表示は1件のみ / 短時間 / キューは古いものを捨てて伸ばさない(CFG上限)。
  //   accent: "boss"=赤系 / "info"=既定。sub=副題。
  showCenterNotice(text, sub, accent) {
    const n = { text: text || "", sub: sub || "", accent: accent || "info", dur: CFG.centerNoticeSec || 1.6 };
    if (!this._notice) { n.t0 = this.time; this._notice = n; return; }
    this._noticeQ = this._noticeQ || [];
    this._noticeQ.push(n);
    const cap = CFG.centerNoticeQueue || 1;
    while (this._noticeQ.length > cap) this._noticeQ.shift(); // 古いものを捨てる=待ち行列が伸びない
  },
  drawCenterNotice(ctx) {
    const n = this._notice; if (!n) return;
    const e = this.time - n.t0;
    if (e > n.dur) {
      this._notice = null;
      if (this._noticeQ && this._noticeQ.length) { const nx = this._noticeQ.shift(); nx.t0 = this.time; this._notice = nx; }
      return;
    }
    const k = e / n.dur; // 0..1: フェードイン(〜0.15)→保持→フェードアウト(0.72〜)
    const alpha = k < 0.15 ? k / 0.15 : k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
    const cx = W / 2, cy = 150, slide = (1 - Math.min(1, k / 0.15)) * 16;
    const boss = n.accent === "boss";
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "bold 26px sans-serif";
    const w = Math.max(220, ctx.measureText(n.text).width + 64), h = n.sub ? 56 : 42, x0 = cx - w / 2, y0 = cy - 26;
    ctx.fillStyle = boss ? "rgba(34,10,8,.6)" : "rgba(18,16,12,.56)"; rr(ctx, x0, y0, w, h, 11); ctx.fill();
    ctx.strokeStyle = boss ? "rgba(230,90,70,.55)" : "rgba(200,180,140,.4)"; ctx.lineWidth = 2; rr(ctx, x0, y0, w, h, 11); ctx.stroke();
    ctx.fillStyle = boss ? "#ffcbb6" : "#f2e6c8"; ctx.fillText(n.text, cx + slide, cy);
    if (n.sub) { ctx.font = "13px sans-serif"; ctx.fillStyle = boss ? "rgba(255,200,180,.85)" : "rgba(240,225,190,.8)"; ctx.fillText(n.sub, cx, cy + 20); }
    ctx.restore();
  },

  // ---------------- 新ボス (GameExpansion_v2 ②) ----------------
  // B-1 オオタカ
  drawHawk(ctx, raid) {
    const e = raid.snake;
    // 急降下予告: ターゲットに影+赤リング
    if (raid.dive) {
      const tgt = Game.state.lizards.find((l) => l.id === raid.dive.targetId);
      if (tgt) {
        const pu = 0.7 + Math.sin(this.time * 14) * 0.3;
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath(); ctx.ellipse(tgt.x, tgt.y + 6, 46, 15, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,60,40,${pu})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(tgt.x, tgt.y + 4, 62, 24, 0, 0, 7); ctx.stroke();
        this.pill(ctx, tgt.x - 58, tgt.y - 58, "タップ連打で追い払え!", "rgba(120,20,10,.8)", "#ffd0c0");
      }
    }
    this.drawBird(ctx, e.x, e.y, 1.7, "#8a6432", "#6d4d24", "#e8c46a", false);
  },

  // B-2 オオガラス
  drawCrow(ctx, raid) {
    const e = raid.snake;
    this.drawBird(ctx, e.x, e.y, 1.35, "#2b2d36", "#1c1e26", "#4a4d5a", raid.fleeing);
    if (raid.stolenEgg) { // くわえた卵
      ctx.fillStyle = "#f6efdd";
      ctx.beginPath(); ctx.ellipse(e.x - 34 * 1.35, e.y + 6, 9, 12, 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(120,100,70,.6)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(e.x - 34 * 1.35, e.y + 6, 9, 12, 0.2, 0, 7); ctx.stroke();
    }
  },

  // 鳥の共通描画(左向き)
  drawBird(ctx, x, y, s, body, wing, beak, fleeRight) {
    ctx.save();
    ctx.translate(x, y);
    if (fleeRight) ctx.scale(-1, 1);
    const flap = Math.sin(this.time * 9) * 0.55;
    // 地面の影
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(0, (SNAKE_HOME.y + 160 - y) * 0.9, 34 * s, 8 * s, 0, 0, 7); ctx.fill();
    ctx.lineJoin = "round";
    // 両翼(羽ばたき)
    for (const side of [-1, 1]) {
      ctx.fillStyle = wing;
      ctx.strokeStyle = "rgba(10,8,4,.5)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2 * s, 0);
      ctx.quadraticCurveTo(14 * s * side + 8 * s, -18 * s - flap * 16 * s * side, 44 * s * side + 6 * s, -26 * s * side * flap - 14 * s);
      // 羽の切れ込み
      ctx.lineTo(38 * s * side + 6 * s, -8 * s * side * flap - 6 * s);
      ctx.lineTo(30 * s * side + 6 * s, -10 * s * side * flap - 2 * s);
      ctx.lineTo(20 * s * side + 6 * s, -4 * s * side * flap + 2 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 尾羽
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(16 * s, 0);
    ctx.lineTo(34 * s, -6 * s); ctx.lineTo(36 * s, 6 * s);
    ctx.closePath(); ctx.fill();
    // 胴体
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(10,8,4,.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 20 * s, 11 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    // 頭+くちばし
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(-18 * s, -4 * s, 8.5 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = beak;
    ctx.beginPath();
    ctx.moveTo(-25 * s, -6 * s); ctx.lineTo(-34 * s, -2 * s); ctx.lineTo(-25 * s, -1 * s);
    ctx.closePath(); ctx.fill();
    // 目
    ctx.fillStyle = "#ffcc44";
    ctx.beginPath(); ctx.arc(-20 * s, -6 * s, 2.4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(-20.5 * s, -6 * s, 1.2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // B-3 ヌシオオトカゲ(トカゲ描画を巨大化して再利用)
  drawMonitor(ctx, raid) {
    const e = raid.snake;
    if (!raid._fake) {
      raid._fake = {
        id: 999983, speciesId: "komodo", morphId: "melanistic",
        hue: 0, sat: 20, light: 26, pattern: "bands", stage: "adult", level: 50,
        xp: 0, injuredT: 0, breedCd: 0, hiddenT: 0, poisonT: 0,
        x: 0, y: 0, tx: 0, ty: 0, angle: Math.PI * 0.999, wanderT: 0, moving: false,
      };
    }
    const f = raid._fake;
    f.x = e.x; f.y = e.y;
    f.moving = !e.arrived;
    ctx.save();
    ctx.translate(e.x, e.y); ctx.scale(1.9, 1.9); ctx.translate(-e.x, -e.y);
    this.drawLizard(ctx, f, true); // §8.15: 拡大描画はキャッシュ迂回(変形ctx内でblitすると崩れるため)
    ctx.restore();
    // 威嚇の圧(生産低下中の表示)
    if (e.arrived) {
      this.pill(ctx, e.x - 96, e.y - 150, "威嚇中: 生産低下・繁殖不可!", "rgba(90,30,10,.75)", "#ffd0b0");
    }
  },

  // B-4 オオサソリ
  drawScorpion(ctx, raid) {
    const e = raid.snake;
    const s = 1.5;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // 影
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(10 * s, 14 * s, 55 * s, 12 * s, 0, 0, 7); ctx.fill();
    const body = "#6d3226", dark = "#48201a";
    // 脚8本
    ctx.strokeStyle = dark; ctx.lineWidth = 3 * s;
    for (let i = 0; i < 4; i++) {
      const bx = -8 * s + i * 12 * s;
      const step = Math.sin(this.time * 8 + i) * 3 * s;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(bx, side * 6 * s);
        ctx.lineTo(bx + step, side * 16 * s);
        ctx.lineTo(bx + step + 4 * s, side * 22 * s);
        ctx.stroke();
      }
    }
    // 胴体(3節)
    ctx.fillStyle = body; ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 26 * s, 13 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(20 * s, 0, 15 * s, 10 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-6 * s, -4 * s, 18 * s, 5 * s, 0, 0, 7); ctx.fill();
    // ハサミ(左前方に2本)
    for (const side of [1, -1]) {
      ctx.strokeStyle = body; ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(-20 * s, side * 5 * s);
      ctx.lineTo(-34 * s, side * 13 * s);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(-42 * s, side * 15 * s, 10 * s, 6.5 * s, side * 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-48 * s, side * 12 * s); ctx.lineTo(-36 * s, side * 15 * s); ctx.stroke();
    }
    // 尾(上に巻く5節+毒針)
    const curl = Math.sin(this.time * 3) * 0.1;
    let tx = 32 * s, ty = -4 * s;
    ctx.fillStyle = body;
    for (let i = 0; i < 5; i++) {
      const a = -0.5 - i * (0.42 + curl);
      tx += Math.cos(a) * 11 * s;
      ty += Math.sin(a) * 11 * s;
      ctx.beginPath(); ctx.arc(tx, ty, (7 - i * 0.8) * s, 0, 7); ctx.fill();
    }
    // 毒針
    ctx.fillStyle = "#e0b13a";
    ctx.beginPath();
    ctx.moveTo(tx - 3 * s, ty - 3 * s);
    ctx.lineTo(tx - 12 * s, ty - 10 * s);
    ctx.lineTo(tx + 2 * s, ty - 6 * s);
    ctx.closePath(); ctx.fill();
    // 目
    ctx.fillStyle = "#ffcc44";
    ctx.beginPath(); ctx.arc(-22 * s, -3 * s, 2 * s, 0, 7); ctx.arc(-22 * s, 3 * s, 2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // spider脅威の設置物(ウェブ)。惑星でスキン差し替え=ID6ユンガは蔓/翡翠紐(大蛇の締め付け=絡めて拘束)。
  //   drawBossの冒頭(ボスのscale外=盤の実座標)で呼ぶ。署名ボス(アナコンダ)描画時も必ずwebが出る。
  drawWebs(ctx, raid) {
    const st = Game.currentStage && Game.currentStage();
    const jungle = !!(st && st.id === 6); // ユンガ=蔓/翡翠紐リスキン
    for (const w of raid.webs) {
      if (w.hp <= 0) continue;
      const a = 0.28 + (w.hp / CFG.webHp) * 0.3;
      if (jungle) {
        // うねる蔓(緑)+絡みの輪+翡翠の結び目(#2FA98A)=蛇が絡めて拘束する意匠(クモの巣ではない)
        ctx.strokeStyle = `rgba(96,152,88,${a + 0.12})`; ctx.lineWidth = 2.6; ctx.lineCap = "round";
        for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + w.x * 0.01; const ex = w.x + Math.cos(ang) * 54, ey = w.y + Math.sin(ang) * 33; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.quadraticCurveTo(w.x + Math.cos(ang) * 30 + Math.sin(k + this.time) * 7, w.y + Math.sin(ang) * 18 - 6, ex, ey); ctx.stroke(); }
        ctx.strokeStyle = `rgba(70,120,70,${a})`; ctx.lineWidth = 2; for (let ring = 1; ring <= 2; ring++) { ctx.beginPath(); ctx.ellipse(w.x, w.y, ring * 20, ring * 12, 0, 0, 7); ctx.stroke(); }
        ctx.fillStyle = `rgba(47,169,138,.8)`; for (let k = 0; k < 4; k++) { const ang = k / 4 * Math.PI * 2; ctx.beginPath(); ctx.arc(w.x + Math.cos(ang) * 24, w.y + Math.sin(ang) * 15, 2.6, 0, 7); ctx.fill(); }
      } else {
        ctx.strokeStyle = `rgba(240,240,250,${a})`; ctx.lineWidth = 1.5;
        for (let ring = 1; ring <= 3; ring++) { ctx.beginPath(); ctx.ellipse(w.x, w.y, ring * 18, ring * 11, 0, 0, 7); ctx.stroke(); }
        for (let k = 0; k < 8; k++) { const ang = k / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(ang) * 54, w.y + Math.sin(ang) * 33); ctx.stroke(); }
      }
      if (w.burnT > 0) this.pill(ctx, w.x - 22, w.y + 36, (jungle ? "焼き払う " : "焼却 ") + Math.ceil(w.burnT) + "s");
      else this.pill(ctx, w.x - 30, w.y + 36, "タップ ×" + w.hp);
    }
  },

  // B-5 オオグモ本体(ウェブは drawWebs でボスのscale外に描く)
  drawSpider(ctx, raid) {
    const e = raid.snake;
    const s = 1.5;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(6 * s, 16 * s, 46 * s, 11 * s, 0, 0, 7); ctx.fill();
    const body = "#3a2c38", dark = "#241a24";
    // 脚8本(2関節)
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
    for (let i = 0; i < 4; i++) {
      const ang0 = -0.9 + i * 0.55;
      const step = Math.sin(this.time * 7 + i * 1.3) * 0.12;
      for (const side of [1, -1]) {
        const a1 = side * (ang0 + step);
        const kx = -6 * s + Math.cos(a1) * 26 * s * (side > 0 ? 1 : 1);
        const ky = Math.sin(a1) * 26 * s;
        ctx.beginPath();
        ctx.moveTo(-6 * s, 0);
        ctx.lineTo(kx - 6 * s, ky - side * 8 * s);
        ctx.lineTo(kx - 2 * s, ky + side * 14 * s);
        ctx.stroke();
      }
    }
    // 腹部(大)+頭胸部
    ctx.fillStyle = body; ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(14 * s, 0, 24 * s, 17 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-14 * s, 0, 12 * s, 9 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    // 腹の模様
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(6 * s, -8 * s); ctx.lineTo(22 * s, 0); ctx.lineTo(6 * s, 8 * s); ctx.lineTo(12 * s, 0);
    ctx.closePath(); ctx.fill();
    // 目(4つ赤く光る)+牙
    ctx.fillStyle = "#ff4438";
    for (const [ox, oy] of [[-22, -3], [-24, 1], [-20, -6], [-19, 2]]) {
      ctx.beginPath(); ctx.arc(ox * s, oy * s, 1.6 * s, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "#c8c0b0"; ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-25 * s, 4 * s); ctx.lineTo(-28 * s, 9 * s);
    ctx.moveTo(-21 * s, 6 * s); ctx.lineTo(-23 * s, 11 * s);
    ctx.stroke();
    ctx.restore();
  },

  // ---- ID8氷の前線: 浮遊モノリスの冷光(超低速・待機微動) ----
  // 静的造形はpaintBackground(キャッシュ)に焼く。ここは動く冷光だけを毎フレーム重ねる。
  // 平常は静か(UISkills)を守り、reduced-motionで停止(静的ベースラインが残るので暗転しない)。
  drawMonolith8(ctx) {
    if (window.Motion && Motion.reduced) return;
    const M = MONO8, mx = M.mx, base = M.base;
    const splitY = base - M.h * M.splitF;

    // 分割シームの呼吸(約9s周期)
    const br = 0.16 + Math.sin(this.time * 0.7) * 0.14;
    const h = mono8HalfW(splitY);
    const g = ctx.createLinearGradient(mx - h, splitY, mx + h, splitY);
    g.addColorStop(0, `rgba(${COLD8},0)`); g.addColorStop(0.5, `rgba(${COLD8},${br})`); g.addColorStop(1, `rgba(${COLD8},0)`);
    ctx.fillStyle = g; ctx.fillRect(mx - h - 3, splitY - M.gap - 1, h * 2 + M.offset + 6, M.gap + 2);

    // グリフ列を一段ずつ上昇スキャンする冷光(約11s周期・1段≒1.57s)
    const phase = (this.time * (M.glyphs / 11)) % M.glyphs;
    for (let k = 0; k < M.glyphs; k++) {
      const d = (k - phase + M.glyphs) % M.glyphs;
      const near = Math.max(0, 1 - Math.min(d, M.glyphs - d) * 1.4);
      if (near <= 0.02) continue;
      const y = base - 12 - k * ((M.h - 22) / (M.glyphs - 1));
      const seg = (y < splitY) ? 0 : M.offset;
      const gw = Math.max(3, mono8HalfW(y) * 0.7);
      ctx.fillStyle = `rgba(${COLD8},${0.4 * near})`;
      ctx.fillRect(mx + seg - gw / 2, y - 0.3, gw, 2);
    }

    // 軍事痕跡の赤い光学が静かに脈動(監視柱の単眼・六角の休眠コア・残骸の消えかけの眼=まだ全て見ている気配)。
    // 静的な暗点はpaintBackground(キャッシュ)に焼き済み。ここは呼吸するグローだけを重ねる(reduced-motionは上でreturn)
    const pr = 0.5 + Math.sin(this.time * 1.6) * 0.42;
    for (const e of grakisEyes()) {
      const gg = ctx.createRadialGradient(e.x, e.y, 0.4, e.x, e.y, e.r * 1.8);
      gg.addColorStop(0, `rgba(224,64,64,${e.a * pr})`); gg.addColorStop(1, "rgba(224,64,64,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.8, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,128,128,${e.a * (0.45 + pr * 0.5)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.26, 0, 7); ctx.fill();
    }
  },

  // ---- ID2摩天楼スラム: ネオンの明滅・サーチライト・ネオン雨・見下ろす企業ホログラム。格差の夜 ----
  // 静的なスカイライン(高層/スラム)はpaintBackground(キャッシュ)。ここは生きた都市の光だけを毎フレーム重ねる。
  drawSlum2(ctx) {
    const calm = window.Motion && Motion.reduced;
    // 高層側の空に浮かぶ巨大企業ホログラム(格差を生む"上"の力=見下ろす眼。グリッチする)=気配・説明しない
    {
      const hx = 340, hy = 56, base = 0.10 + (calm ? 0 : Math.abs(Math.sin(this.time * 0.5)) * 0.05);
      const jit = calm ? 0 : (Math.sin(this.time * 9) > 0.62 ? 2 : 0); // グリッチの横ずれ
      ctx.save(); ctx.globalAlpha = base;
      ctx.strokeStyle = "rgba(95,204,217,1)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx + jit, hy, 42, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(hx + jit, hy, 24, 11, 0, 0, 7); ctx.stroke(); // 眼の輪郭
      ctx.fillStyle = "rgba(95,204,217,1)"; ctx.beginPath(); ctx.arc(hx + jit, hy, 5, 0, 7); ctx.fill(); // 瞳
      if (jit) { ctx.globalAlpha = base * 0.6; ctx.strokeStyle = "rgba(217,87,176,1)"; ctx.beginPath(); ctx.arc(hx - jit, hy, 42, 0, 7); ctx.stroke(); } // RGBずれ(ピンク)
      ctx.restore();
    }
    if (calm) return; // 以下は微動(reduced-motionは静的なスカイライン+静止ホログラムのまま)
    // ネオンの明滅(高層側の数点=生きた街灯)
    for (const [nx, ny, c, sp] of [[120, HORIZON - 120, "217,87,176", 3], [430, HORIZON - 150, "95,204,217", 4.5], [560, HORIZON - 90, "217,87,176", 6]]) {
      const p = 0.4 + Math.abs(Math.sin(this.time * sp)) * 0.6;
      ctx.fillStyle = `rgba(${c},${p})`; ctx.fillRect(nx, ny, 6, 3);
      const g = ctx.createRadialGradient(nx + 3, ny + 1, 1, nx + 3, ny + 1, 10); g.addColorStop(0, `rgba(${c},${p * 0.5})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(nx - 7, ny - 9, 20, 20);
    }
    // サーチライトの掃引(高塔から・ゆっくり)
    {
      const ang = -1.2 + Math.sin(this.time * 0.3) * 0.4;
      ctx.save(); ctx.globalAlpha = 0.06; ctx.translate(470, HORIZON - 150); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 300, 0); g.addColorStop(0, "rgba(255,245,210,1)"); g.addColorStop(1, "rgba(255,245,210,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, -26); ctx.lineTo(300, 26); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // ネオン雨(細い斜線=生活の湿り)
    ctx.strokeStyle = "rgba(150,180,210,.12)"; ctx.lineWidth = 1;
    for (let k = 0; k < 24; k++) {
      const rx = ((k * 137 + this.time * 320) % (W + 60)) - 30, ry = ((k * 89 + this.time * 620) % H);
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 12); ctx.stroke();
    }
  },

  // ---- ID1始まりの地: 朝の光にただよう花粉/塵(素朴で温かい・希望の粒)。教科書ゆえ最小限 ----
  drawDawn1(ctx) {
    if (window.Motion && Motion.reduced) return;
    for (let k = 0; k < 7; k++) {
      const x = ((k * 197 + this.time * 5) % (W + 40)) - 20;
      const y = HORIZON - 6 + Math.sin(this.time * 0.5 + k * 1.3) * 26;
      const a = 0.12 + Math.abs(Math.sin(this.time * 0.8 + k)) * 0.22;
      ctx.fillStyle = `rgba(255,235,180,${a})`;
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill();
    }
  },

  // ---- ID3森林: からくり時計の振り子(木製時計文明)・緑の木漏れ日・蛍。時計職人の森 ----
  // 静的な大樹/文字盤/歯車はpaintBackground(キャッシュ)。ここは時を刻む振り子と森の灯だけを毎フレーム重ねる。
  drawForest3(ctx) {
    const calm = window.Motion && Motion.reduced;
    const cx2 = 636, fy = HORIZON - 88, piv = fy + 24;
    // 振り子(からくり時計の錘がゆっくり時を刻む=等時性の拍)
    const ang = calm ? 0.22 : Math.sin(this.time * 1.4) * 0.32;
    const len = 40, bx = cx2 + Math.sin(ang) * len, by = piv + Math.cos(ang) * len;
    ctx.strokeStyle = "#4a3a24"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx2, piv); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = "#c9a86a"; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill(); // 真鍮の錘
    ctx.fillStyle = "rgba(255,240,190,.5)"; ctx.beginPath(); ctx.arc(bx - 1.4, by - 1.4, 1.6, 0, 7); ctx.fill();
    if (calm) return; // 以下は微動(reduced-motionは静的な森+振り子静止のまま)
    for (const [sx, ph] of [[300, 0], [820, 2.4]]) { // 緑の木漏れ日(ゆっくり呼吸)
      const br = 0.05 + Math.sin(this.time * 0.35 + ph) * 0.02;
      const g = ctx.createLinearGradient(sx, 0, sx + 30, HORIZON + 120);
      g.addColorStop(0, `rgba(200,235,150,${br})`); g.addColorStop(1, "rgba(200,235,150,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 20, 0); ctx.lineTo(sx + 20, 0); ctx.lineTo(sx + 50, HORIZON + 120); ctx.lineTo(sx - 30, HORIZON + 120); ctx.closePath(); ctx.fill();
    }
    for (const [fx0, fy0, sp, ph] of [[200, HORIZON + 80, 0.5, 0], [900, HORIZON + 140, 0.4, 2], [500, HORIZON + 46, 0.45, 4]]) { // 蛍(森の灯)
      const gx = fx0 + Math.sin(this.time * sp + ph) * 40, gy = fy0 + Math.cos(this.time * sp * 0.7 + ph) * 20;
      const a = 0.3 + Math.abs(Math.sin(this.time * 1.5 + ph)) * 0.5;
      ctx.fillStyle = `rgba(190,240,130,${a})`; ctx.beginPath(); ctx.arc(gx, gy, 1.6, 0, 7); ctx.fill();
    }
  },

  // ---- ID5火山: 溶鉱炉の赤熱の脈動(ふいごの吹き上がり)・火の粉・溶岩流の明滅。金属を鍛える文明の熱 ----
  // 静的な高炉/鋳型/火山はpaintBackground(キャッシュ)。ここは炉の赤熱と火の粉だけを毎フレーム重ねる。
  drawFurnace5(ctx) {
    const calm = window.Motion && Motion.reduced;
    const breath = calm ? 0.6 : 0.55 + Math.sin(this.time * 1.3) * 0.35; // ふいごの吹き上がり
    const glow = (gx, gy, r, c, a) => { const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.fill(); };
    glow(372, HORIZON - 12, 22, "255,140,50", breath * 0.7); // 高炉の出湯口
    glow(764, HORIZON - 38, 24, "255,150,60", breath * 0.55); // 鋳型の溶鉄
    if (calm) return; // 以下は微動(reduced-motionは静的な赤熱ベースのまま)
    for (const [ex, ey] of [[372, HORIZON - 20], [764, HORIZON - 40], [1058, HORIZON - 126]]) { // 火の粉が昇る
      for (let k = 0; k < 4; k++) {
        const et = ((this.time * 0.4 + k * 0.27 + ex * 0.01) % 1);
        ctx.fillStyle = `rgba(255,${140 + k * 20},70,${0.6 * (1 - et)})`;
        ctx.beginPath(); ctx.arc(ex + Math.sin(this.time * 2 + k + ex) * 6, ey - et * 46, 1 + (1 - et), 0, 7); ctx.fill();
      }
    }
    const lg = 0.3 + Math.sin(this.time * 0.9) * 0.12; // 溶岩流のへりの明滅
    ctx.strokeStyle = `rgba(255,150,60,${lg})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, HORIZON + 100); ctx.bezierCurveTo(W * 0.3, HORIZON + 90, W * 0.6, HORIZON + 114, W, HORIZON + 98); ctx.stroke();
  },

  // ---- ID4古代古墳: 玄室の金の脈動・燐火(緑の鬼火=クランクの緑の先触れ)・水鏡のゆらぎ。悼みの静けさ ----
  // 静的な墳丘/玄室/埴輪/金鈴はpaintBackground(キャッシュ)。ここは金の輝きと漂う魂だけを毎フレーム重ねる。
  drawTomb4(ctx) {
    const calm = window.Motion && Motion.reduced;
    const kx = 640, base = HORIZON;
    // 玄室の奥に眠る副葬の金(暗がりでゆっくり明滅=「これは何だ」)
    const gl = calm ? 0.4 : 0.35 + Math.sin(this.time * 0.9) * 0.16;
    ctx.fillStyle = `rgba(201,168,106,${gl})`; ctx.fillRect(kx - 3, base - 7, 6, 4);
    const gg = ctx.createRadialGradient(kx, base - 8, 0.5, kx, base - 8, 9);
    gg.addColorStop(0, `rgba(201,168,106,${gl * 0.5})`); gg.addColorStop(1, "rgba(201,168,106,0)");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(kx, base - 8, 9, 0, 7); ctx.fill();
    if (calm) return; // 以下は微動(reduced-motionは静的な墓のまま)
    // 燐火(緑の鬼火)が墳丘の周りを漂う=悼む魂/クランクの緑の先触れ。数を抑えて静か
    for (const [ox, oy, sp, ph] of [[34, -34, 0.5, 0], [-60, -20, 0.42, 2.3], [90, -12, 0.36, 4.1]]) {
      const wx = kx + ox + Math.sin(this.time * sp + ph) * 10, wy = base + oy + Math.sin(this.time * (sp + 0.3) + ph) * 6;
      const wisp = ctx.createRadialGradient(wx, wy, 1, wx, wy, 10);
      wisp.addColorStop(0, "rgba(123,217,134,.5)"); wisp.addColorStop(1, "rgba(123,217,134,0)");
      ctx.fillStyle = wisp; ctx.beginPath(); ctx.arc(wx, wy, 10, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(180,240,190,.8)"; ctx.beginPath(); ctx.arc(wx, wy, 1.5, 0, 7); ctx.fill();
    }
    // 周濠の水面がかすかにゆらぐ
    const sh = 0.12 + Math.sin(this.time * 0.6) * 0.05;
    ctx.fillStyle = `rgba(160,195,200,${sh})`;
    ctx.beginPath(); ctx.ellipse(kx, base + 8, 150 + Math.sin(this.time * 0.4) * 8, 5, 0, 0, 7); ctx.fill();
  },

  // ---- ID6密林: 祭祀の躍動(篝火の炎/火の粉・御神体の翡翠の脈動・緑の木漏れ日)。神聖な祝祭の気配 ----
  // 静的な社/御神体/供物/篝火台はpaintBackground(キャッシュ)。ここは"生きた祭祀"だけを毎フレーム重ねる。
  drawJungle6(ctx) {
    const calm = window.Motion && Motion.reduced;
    // 御神体の翡翠が静かに脈打つ(神の宿り・翡翠#2FA98A=オート/アクセント/固有種の三重の緑)
    const ax = 640, jy = HORIZON - 13;
    const jd = calm ? 0.6 : 0.55 + Math.sin(this.time * 1.2) * 0.28;
    const jg = ctx.createRadialGradient(ax, jy, 1, ax, jy, 13);
    jg.addColorStop(0, `rgba(47,169,138,${jd * 0.55})`); jg.addColorStop(1, "rgba(47,169,138,0)");
    ctx.fillStyle = jg; ctx.beginPath(); ctx.arc(ax, jy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(47,169,138,${jd})`; ctx.beginPath(); ctx.arc(ax, jy, 3.4, 0, 7); ctx.fill();
    if (calm) return; // 以下は微動(reduced-motionは静的な社のまま)
    // 篝火の炎+火の粉(奉納の灯)
    for (const [fx2, ph] of [[420, 0], [860, 2.4]]) {
      const fy = HORIZON + 26, fl = Math.sin(this.time * 5 + ph) * 2.5;
      ctx.fillStyle = "#e8853a";
      ctx.beginPath(); ctx.moveTo(fx2 - 5, fy - 12); ctx.quadraticCurveTo(fx2 - 4 + fl, fy - 24, fx2 + fl * 0.6, fy - 30); ctx.quadraticCurveTo(fx2 + 5 + fl, fy - 22, fx2 + 5, fy - 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffce6b";
      ctx.beginPath(); ctx.moveTo(fx2 - 2.5, fy - 12); ctx.quadraticCurveTo(fx2 + fl * 0.5, fy - 19, fx2 + fl * 0.4, fy - 22); ctx.quadraticCurveTo(fx2 + 2.5 + fl * 0.4, fy - 17, fx2 + 2.5, fy - 12); ctx.closePath(); ctx.fill();
      for (let k = 0; k < 3; k++) { // 火の粉が昇る
        const et = ((this.time * 0.5 + k * 0.34 + ph) % 1);
        ctx.fillStyle = `rgba(255,190,110,${0.6 * (1 - et)})`;
        ctx.beginPath(); ctx.arc(fx2 + Math.sin(this.time * 2 + k) * 4, fy - 24 - et * 30, 1, 0, 7); ctx.fill();
      }
    }
    // 緑の木漏れ日(祭祀の森の聖なる光・ゆっくり呼吸)
    for (const [sx, ph] of [[300, 0], [780, 2]]) {
      const br = 0.05 + Math.sin(this.time * 0.4 + ph) * 0.02;
      const g = ctx.createLinearGradient(sx, 0, sx + 30, HORIZON + 100);
      g.addColorStop(0, `rgba(150,220,120,${br})`); g.addColorStop(1, "rgba(150,220,120,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 20, 0); ctx.lineTo(sx + 20, 0); ctx.lineTo(sx + 50, HORIZON + 100); ctx.lineTo(sx - 30, HORIZON + 100); ctx.closePath(); ctx.fill();
    }
  },

  // ---- ID7水中都市: 静寂の水(気泡/海藻/コースティクス)+深海を横切る巨大な影(引き算の気配) ----
  // 静的な都(耐圧ドーム/通路/貝)はpaintBackground(キャッシュ)。ここは"生きた静けさ"だけを毎フレーム重ねる。
  drawAbyss7(ctx) {
    const calm = window.Motion && Motion.reduced;
    // 深海の水柱をゆっくり横切る巨大な影(何かがいる=説明しない・引き算で極薄)。都の背後(HORIZONより上の水)
    {
      const t = calm ? 0.34 : ((this.time * 0.007) % 1); // 極めて遅い(1周≒140s)
      const lx = -320 + t * (W + 640), ly = HORIZON * 0.5;
      const g = ctx.createRadialGradient(lx, ly, 16, lx, ly, 230);
      g.addColorStop(0, "rgba(14,30,40,.26)"); g.addColorStop(1, "rgba(14,30,40,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(lx, ly, 230, 46, 0.05, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(10,24,32,.16)"; // 頭部の気配(かすかな輪郭)
      ctx.beginPath(); ctx.ellipse(lx + 150, ly - 14, 44, 16, 0.15, 0, 7); ctx.fill();
    }
    if (calm) return; // 以下は微動(reduced-motionは静的な床のまま=暗転しない)
    // 水底のコースティクス(網目の光がゆっくり揺れる・極薄=床/生き物を汚さない)
    for (const [cx0, ph] of [[300, 0], [700, 2.5], [1050, 5]]) {
      const dx = Math.sin(this.time * 0.4 + ph) * 30;
      ctx.fillStyle = "rgba(190,225,240,.04)";
      ctx.beginPath(); ctx.ellipse(cx0 + dx, HORIZON + 130, 92, 26, 0, 0, 7); ctx.fill();
    }
    // 気泡がゆっくり昇る(せわしなくしない)
    for (const [bx, sp, ph, r] of [[240, 9, 0, 2], [610, 7, 3, 1.6], [1010, 8, 5.4, 2.2], [450, 6, 8, 1.4]]) {
      const cyc = 34, t = ((this.time * sp / cyc + ph / cyc) % 1);
      const by = HORIZON + 20 - t * (HORIZON + 40);
      ctx.strokeStyle = `rgba(200,230,245,${0.35 * (1 - t)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx + Math.sin(this.time * 0.8 + ph) * 6, by, r, 0, 7); ctx.stroke();
    }
    // 海藻がゆらぐ(やわらかい呼吸)
    for (const [kx, kh, ph] of [[95, 46, 0], [520, 34, 2], [1180, 52, 4]]) {
      const swy = Math.sin(this.time * 0.6 + ph) * 5;
      ctx.strokeStyle = "rgba(90,150,130,.5)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(kx, HORIZON + 6); ctx.quadraticCurveTo(kx + swy * 0.5, HORIZON - kh * 0.5, kx + swy, HORIZON - kh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx + 7, HORIZON + 6); ctx.quadraticCurveTo(kx + 7 + swy * 0.4, HORIZON - kh * 0.35, kx + 7 + swy * 0.8, HORIZON - kh * 0.7); ctx.stroke();
    }
    // 都の窓の灯りが一つ、ゆっくり呼吸(眠る前の家=安寧)
    const bl = 0.4 + Math.sin(this.time * 0.5) * 0.22;
    ctx.fillStyle = `rgba(255,214,150,${bl})`; ctx.fillRect(1078, HORIZON - 44, 4, 3);
  },

  // ---- ID9廃原子炉: チェレンコフ冷光のゆっくりした呼吸+死にかけの炉の不規則明滅(待機微動) ----
  // 静的な炉体・扉・排気窓はpaintBackground(キャッシュ)。ここは冷光の脈動だけを毎フレーム重ねる。
  drawReactor9(ctx) {
    if (window.Motion && Motion.reduced) return;
    const pr = 0.6 + Math.sin(this.time * 1.1) * 0.3; // 冷却光のゆっくりした呼吸
    for (const v of REACTOR9.vents) {
      const flick = v.a < 0.2 ? (0.35 + 0.65 * Math.abs(Math.sin(this.time * 5.3 + v.x))) : 1; // 死にかけは不規則明滅
      const al = v.a * pr * flick;
      const gg = ctx.createRadialGradient(v.x, v.y, 1, v.x, v.y, v.r);
      gg.addColorStop(0, `rgba(111,184,160,${al})`); gg.addColorStop(1, "rgba(111,184,160,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, 7); ctx.fill();
    }
  },

  // ---- ID8氷の前線: 槽外バガー自動掃討(crank.md §3.4・純演出・メタ構図) ----
  // 小バガーは飼育槽の"外側"=ガラス面の外周に張り付いて這う(標的は槽の中でなく、その先)。
  // Render内部だけで完結し、侵食率・ボス・生産・セーブに一切影響しない。説明テキストは出さない
  _swPerim() { return 2 * ((W - 56) + (H - 56)); },
  _swPos(b) {
    const x0 = 28, y0 = 28, w = W - 56, h = H - 56;
    let p = ((b.p % this._swPerim()) + this._swPerim()) % this._swPerim();
    if (p < w) return { x: x0 + p, y: y0, a: 0 };
    p -= w;
    if (p < h) return { x: x0 + w, y: y0 + p, a: Math.PI / 2 };
    p -= h;
    if (p < w) return { x: x0 + w - p, y: y0 + h, a: Math.PI };
    p -= w;
    return { x: x0, y: y0 + h - p, a: -Math.PI / 2 };
  },
  _swSpawnP() {
    // クランク(右下)付近は避けて外周のどこかに湧く
    for (let i = 0; i < 10; i++) {
      const p = Math.random() * this._swPerim();
      const pos = this._swPos({ p });
      if (!(pos.x > W - 320 && pos.y > H - 240)) return p;
    }
    return 0;
  },
  drawBugSweep(ctx) {
    if ((window.Motion && Motion.reduced) || CFG.crankFxLevel === 0) { this._sw = null; return; } // 演出全停止
    const sw = this._sw || (this._sw = { bugs: [], spawnT: 3, purgeT: CFG.bugSweepEverySec, purging: false, target: null, lockT: 0, beamT: 0, ashes: [], t: this.time });
    const dt = Math.min(0.1, Math.max(0, this.time - sw.t));
    sw.t = this.time;
    // 出現: 絶え間なく近づき、外周に徐々に溜まる
    sw.spawnT -= dt;
    if (sw.spawnT <= 0 && sw.bugs.length < CFG.bugSweepMax) {
      sw.bugs.push({ p: this._swSpawnP(), v: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9), ph: Math.random() * 7, pause: 0 });
      sw.spawnT = CFG.bugSweepSpawnSec * (0.5 + Math.random());
    }
    // ガラス面を這う(フチ沿いにゆっくり・時々立ち止まる)
    for (const b of sw.bugs) {
      b.ph += dt * 3;
      if (b.pause > 0) b.pause -= dt;
      else {
        b.p += b.v * dt;
        if (Math.random() < dt * 0.25) b.pause = 0.6 + Math.random() * 1.8;
      }
      this.drawGlassBugger(ctx, b);
    }
    // 掃討=オートの副次機能。溜まった頃に一掃(順次高速ロック→レーザー)
    const auto = Game.state.dial && Game.state.dial.auto;
    if (!auto) { sw.target = null; sw.beamT = 0; sw.purging = false; }
    else if (!sw.target) {
      if (sw.purging) {
        if (sw.bugs.length) { sw.target = sw.bugs[0]; sw.lockT = CFG.bugSweepLockSec; }
        else { sw.purging = false; sw.purgeT = CFG.bugSweepEverySec; } // 一掃完了→安心の静けさ
      } else {
        sw.purgeT -= dt;
        if (sw.purgeT <= 0 && sw.bugs.length >= CFG.bugSweepMinPurge) sw.purging = true;
      }
    } else if (sw.lockT > 0) {
      // 照準ロック(高速・軍用の淡々とした精度)
      sw.lockT -= dt;
      const pos = this._swPos(sw.target);
      const f = Math.max(0, sw.lockT / CFG.bugSweepLockSec);
      const r = (6 + 10 * f) * (CFG.bugSweepScale || 1);
      ctx.strokeStyle = `rgba(224,64,64,${0.9 - f * 0.35})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 7); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + f * 1.2;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * (r + 1), pos.y + Math.sin(a) * (r + 1));
        ctx.lineTo(pos.x + Math.cos(a) * (r + 4), pos.y + Math.sin(a) * (r + 4));
        ctx.stroke();
      }
      if (sw.lockT <= 0) sw.beamT = CFG.bugSweepBeamSec;
    } else if (sw.beamT > 0) {
      // レーザー射出: クランクから"外側の脅威"へ(細く正確・派手にしない)
      sw.beamT -= dt;
      const pos = this._swPos(sw.target);
      const ox = W - 104, oy = H - 78;
      ctx.strokeStyle = "rgba(224,64,64,.28)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,150,140,.95)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      ctx.fillStyle = "rgba(255,190,180,.9)";
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 3, 0, 7); ctx.fill();
      if (sw.beamT <= 0) {
        sw.ashes.push({ x: pos.x, y: pos.y, t: 0.4 });
        sw.bugs = sw.bugs.filter((b) => b !== sw.target);
        sw.target = null; // purging継続なら次の標的へ間髪入れず移る
      }
    }
    // 消去の残滓(ガラスに残る紫の霧が淡々と消える)
    for (const a of sw.ashes) {
      a.t -= dt;
      const f = Math.max(0, a.t / 0.4);
      ctx.fillStyle = `rgba(180,90,220,${0.35 * f})`;
      ctx.beginPath(); ctx.arc(a.x, a.y, 4 * (1.4 - f * 0.4), 0, 7); ctx.fill();
    }
    sw.ashes = sw.ashes.filter((a) => a.t > 0);
  },

  // ガラスの向こうに張り付く小バガー(減光+反射の照りで"外側"を絵で示す・説明しない)
  drawGlassBugger(ctx, b) {
    const pos = this._swPos(b);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.a + (b.v < 0 ? Math.PI : 0));
    ctx.scale(CFG.bugSweepScale || 1, CFG.bugSweepScale || 1);
    ctx.globalAlpha = 0.72; // ガラス越しの減光
    ctx.strokeStyle = "#1b221d"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { // 脚(張り付いてカサカサ)
      const lx = -2.5 + i * 2.5, step = (b.pause > 0 ? 0.3 : 1) * Math.sin(b.ph * 4 + i * 2) * 1.4;
      ctx.beginPath(); ctx.moveTo(lx, 1); ctx.lineTo(lx + step, 4.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, -1); ctx.lineTo(lx - step, -1.8); ctx.stroke();
    }
    ctx.fillStyle = "#1b221d";
    ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 2.9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#31402e";
    ctx.beginPath(); ctx.ellipse(0.8, -0.4, 3.8, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(180,90,220,${0.4 + Math.sin(b.ph * 2) * 0.2})`;
    ctx.beginPath(); ctx.arc(1.2, -0.6, 1, 0, 7); ctx.fill();
    ctx.fillStyle = "#1b221d";
    ctx.beginPath(); ctx.arc(-5.4, 0, 1.7, 0, 7); ctx.fill();
    ctx.restore();
    // ガラス面の反射(バガーの手前に走る照り=向こう側にいる証拠)
    ctx.strokeStyle = "rgba(210,225,245,.18)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pos.x - 6, pos.y - 5); ctx.lineTo(pos.x + 4, pos.y + 4); ctx.stroke();
  },

  // V4 §3.5.3: バガー(惑星を侵食する実験生命体・甲虫型)
  drawBugger(ctx, raid) {
    const e = raid.snake;
    const s = 1.6;
    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2, 2), rnd(-2, 2)); raid.shake = Math.max(0, raid.shake - 0.2); }
    ctx.translate(e.x, e.y);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // 影
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(4 * s, 16 * s, 42 * s, 10 * s, 0, 0, 7); ctx.fill();
    const shell = "#3a4a2c", shellHi = "#55663a", dark = "#222c18";
    // 脚6本(カサカサ動く)
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
    for (let i = 0; i < 3; i++) {
      const bx = -10 * s + i * 14 * s;
      const step = Math.sin(this.time * 12 + i * 2) * 4 * s;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(bx, side * 8 * s);
        ctx.lineTo(bx + step, side * 17 * s);
        ctx.lineTo(bx + step + 5 * s, side * 22 * s);
        ctx.stroke();
      }
    }
    // 腹部+前胸
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 0, 30 * s, 16 * s, 0, 0, 7); ctx.fill();
    // 鞘翅(ドーム・真ん中に割れ目)
    ctx.fillStyle = shell; ctx.strokeStyle = "rgba(10,14,6,.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(4 * s, 0, 26 * s, 14 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shellHi;
    ctx.beginPath(); ctx.ellipse(0, -4 * s, 18 * s, 6 * s, -0.15, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(-20 * s, 0); ctx.lineTo(30 * s, 0); ctx.stroke();
    // 病斑(侵食の証・不気味な紫の点)
    ctx.fillStyle = `rgba(180,90,220,${0.5 + Math.sin(this.time * 5) * 0.25})`;
    for (const [ox, oy] of [[-8, -6], [6, 5], [14, -4], [-2, 8]]) {
      ctx.beginPath(); ctx.arc(ox * s, oy * s, 2.4 * s, 0, 7); ctx.fill();
    }
    // 頭+大顎
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(-27 * s, 0, 8 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 3 * s;
    const jaw = Math.sin(this.time * 8) * 0.2;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(-33 * s, side * 3 * s);
      ctx.quadraticCurveTo(-42 * s, side * (8 + jaw * 10) * s, -45 * s, side * 3 * s);
      ctx.stroke();
    }
    // 触角
    ctx.lineWidth = 1.8 * s;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(-30 * s, side * 5 * s);
      ctx.quadraticCurveTo(-40 * s, side * 14 * s, -36 * s, side * 20 * s);
      ctx.stroke();
    }
    // 目(赤)
    ctx.fillStyle = "#ff4438";
    ctx.beginPath(); ctx.arc(-30 * s, -4 * s, 2.2 * s, 0, 7); ctx.arc(-30 * s, 4 * s, 2.2 * s, 0, 7); ctx.fill();
    ctx.restore();
  },

  // ---------------- 味方 (3.11.5で撤去) ----------------
  // 汎用味方(ヤモリ/カメ/ミーアキャット/フクロウ/フェレット/ワシ)の描画は撤去。
  // Phase 6で惑星固有味方を新設予定。state.alliesのLvは休眠保持(Game.allyLvRawで参照可・資産振替用)。

  // ---------------- Phase6 ID1 アリド: ドロヌマ・ワーム(泥沼蟲) ----------------
  // 敵ボス=砂まみれの巨大ミミズ。地中から突き上げて現れる(snake脅威を再利用・描画のみ差替)。
  // 「間抜けな土管」の姿(ずんぐり・環節・鈍い頭)なのに神出鬼没=登場の驚き。
  drawDoronumaWorm(ctx, raid) {
    const s = raid.snake;
    const P = (typeof SIG_PAL !== "undefined" && SIG_PAL.doronumaWorm) || { skin: "#7a6647", skinDk: "#4e3d28", band: "#94805c", saddle: "#ad9c7e", sand: "#8f7850", maw: "#2e1d10", bossScale: 1.72, girth: 19 };
    const tier = snakeTierFor(Game.state.rank);
    const scale = tier.scale * (raid.boss ? P.bossScale : 1.15); // 土中突き上げの巨大な脅威=スケール増
    const skin = P.skin, skinDk = P.skinDk, band = P.band, saddle = P.saddle, maw = P.maw, sand = P.sand;
    const G = P.girth;

    // 背骨: 砂山(埋没端)から立ち上がり、鈍い頭を上へ突き上げる弧
    const segs = 16, segLen = 15 * scale;
    const bx = s.x + 34 * scale, by = s.y + 14 * scale; // 埋没端(砂山の中)
    const bob = Math.sin(this.time * 2.2 + s.phase) * 3 * scale; // ゆっくりうねる(蠕動)
    const pts = [], wid = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // 弧: 右下の砂山から、左上へ鈍く反り返る(頭=突き上げ)
      const ang = Math.PI * 1.15 - t * Math.PI * 0.62;
      const reach = t * segs * segLen * 0.62;
      const crawl = Math.sin(this.time * 3.2 - i * 0.7) * 2.2 * scale * Math.min(1, i / 2); // 蠕動の波
      pts.push({ x: bx + Math.cos(ang) * reach, y: by + Math.sin(ang) * reach - t * 8 * scale + bob * t + crawl });
      // 太い胴・両端だけ細る(ミミズ=ほぼ均一の寸胴)。girth=G(SIG_PALで太さ調整可)
      const w = (t < 0.12 ? G * 0.4 + (t / 0.12) * (G * 0.6) : t > 0.86 ? G - ((t - 0.86) / 0.14) * (G * 0.44) : G) * scale;
      wid.push(Math.max(2, w));
    }
    const nrm = [];
    for (let i = 0; i <= segs; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      nrm.push({ x: -dy / d, y: dx / d });
    }

    // 砂山(掘り出し口)+接地影
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath(); ctx.ellipse(bx, by + 10 * scale, 40 * scale, 12 * scale, 0, 0, 7); ctx.fill();
    ctx.fillStyle = sand;
    ctx.beginPath(); ctx.ellipse(bx, by + 4 * scale, 38 * scale, 18 * scale, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.beginPath(); ctx.ellipse(bx, by, 20 * scale, 8 * scale, 0, 0, 7); ctx.fill(); // 掘り穴の陰

    // 胴体(寸胴チューブ)
    const body = new Path2D();
    body.moveTo(pts[0].x + nrm[0].x * wid[0], pts[0].y + nrm[0].y * wid[0]);
    for (let i = 0; i <= segs; i++) body.lineTo(pts[i].x + nrm[i].x * wid[i], pts[i].y + nrm[i].y * wid[i]);
    for (let i = segs; i >= 0; i--) body.lineTo(pts[i].x - nrm[i].x * wid[i], pts[i].y - nrm[i].y * wid[i]);
    body.closePath();
    ctx.fillStyle = skin; ctx.fill(body);

    ctx.save(); ctx.clip(body);
    // 背側の陰・腹側の照り
    ctx.strokeStyle = skinDk; ctx.globalAlpha = 0.5; ctx.lineWidth = 10 * scale;
    ctx.beginPath(); for (let i = 0; i <= segs; i++) { const m = i ? "lineTo" : "moveTo"; ctx[m](pts[i].x + nrm[i].x * wid[i] * 0.5, pts[i].y + nrm[i].y * wid[i] * 0.5); } ctx.stroke();
    ctx.globalAlpha = 1;
    // 環節(ミミズの体節リング)=法線方向の横筋
    ctx.strokeStyle = "rgba(60,38,22,.4)"; ctx.lineWidth = 2 * scale;
    for (let i = 2; i < segs - 1; i++) {
      const p = pts[i], n = nrm[i], w = wid[i];
      ctx.beginPath(); ctx.moveTo(p.x - n.x * w, p.y - n.y * w); ctx.lineTo(p.x + n.x * w, p.y + n.y * w); ctx.stroke();
    }
    // 環帯(クリテルム=ミミズの淡い鞍状の帯・ミミズの証)
    const si = Math.round(segs * 0.5);
    ctx.fillStyle = saddle; ctx.globalAlpha = 0.7;
    for (let i = si - 1; i <= si + 1; i++) { const p = pts[i], n = nrm[i], w = wid[i]; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 0.5, w * 1.02, Math.atan2(n.y, n.x), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // 砂粒(乾いた大地をまとう)
    const g = lcg(41);
    for (let i = 0; i < 26; i++) { const p = pts[Math.floor(g() * segs)]; ctx.fillStyle = g() < 0.5 ? "rgba(210,180,130,.5)" : "rgba(50,32,18,.3)"; ctx.beginPath(); ctx.arc(p.x + rnd(-8, 8) * scale, p.y + rnd(-8, 8) * scale, (0.8 + g() * 1.4) * scale, 0, 7); ctx.fill(); }
    ctx.restore();

    // 鈍い頭(土管)+放射状の口
    const hp = pts[segs], hw = wid[segs] * 1.15;
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hp.x, hp.y, hw, 0, 7); ctx.fill();
    ctx.fillStyle = skinDk; ctx.beginPath(); ctx.arc(hp.x, hp.y, hw * 0.62, 0, 7); ctx.fill(); // 口の縁の陰
    ctx.fillStyle = maw; ctx.beginPath(); ctx.arc(hp.x, hp.y, hw * 0.44, 0, 7); ctx.fill();     // 円い口(土管)
    // 放射状の口ヒダ
    ctx.strokeStyle = "rgba(20,10,6,.6)"; ctx.lineWidth = 1.5 * scale;
    for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(hp.x + Math.cos(an) * hw * 0.44, hp.y + Math.sin(an) * hw * 0.44); ctx.lineTo(hp.x + Math.cos(an) * hw * 0.62, hp.y + Math.sin(an) * hw * 0.62); ctx.stroke(); }
    // 頭の照り
    ctx.fillStyle = "rgba(255,240,210,.18)"; ctx.beginPath(); ctx.arc(hp.x - hw * 0.3, hp.y - hw * 0.35, hw * 0.3, 0, 7); ctx.fill();
  },

  // Phase6 ID2 ネオヴェルデ: サイバー・スコルピオ(電脳蠍)。スマートグラス+尾のレーザー照準(scorpion脅威)。
  drawCyberScorpio(ctx, raid) {
    const e = raid.snake, s = 1.5 * (raid.boss ? 1.15 : 1);
    const P = (typeof SIG_PAL !== "undefined" && SIG_PAL.cyberScorpio) || { body: "#433f68", plate: "#5a5690", head: "#4b4775", cyan: "#8bf0fb", edge: "#a6f4ff", edgeW: 2.4, red: "#ff5f7c", reticleR: 12, reticleW: 2.6, visorGlow: 8, rim: 0.5 };
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(6 * s, 17 * s, 48 * s, 11 * s, 0, 0, 7); ctx.fill();
    // 脚8本(機械的な段付き)。夜景で沈まないよう脚もやや明るい鋼色
    ctx.strokeStyle = "#2b2b45"; ctx.lineWidth = 3.2 * s;
    for (let i = 0; i < 4; i++) { const a0 = -0.8 + i * 0.5, st = Math.sin(this.time * 6 + i) * 0.1; for (const sd of [1, -1]) { const a = sd * (a0 + st), kx = -4 * s + Math.cos(a) * 24 * s, ky = Math.sin(a) * 24 * s; ctx.beginPath(); ctx.moveTo(-4 * s, 0); ctx.lineTo(kx, ky - sd * 7 * s); ctx.lineTo(kx + 3 * s, ky + sd * 13 * s); ctx.stroke(); } }
    // 腹部(装甲プレートの節)。縁=シアンのリム光でシルエットを夜景から浮かせる
    ctx.fillStyle = P.body; ctx.strokeStyle = P.edge; ctx.lineWidth = P.edgeW * s; ctx.globalAlpha = P.rim;
    ctx.beginPath(); ctx.ellipse(12 * s, 0, 24 * s, 16 * s, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = P.plate; for (let i = -1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(12 * s + i * 8 * s, -1 * s, 5 * s, 12 * s, 0, 0, 7); ctx.fill(); }
    // 頭胸部
    ctx.fillStyle = P.head; ctx.strokeStyle = P.edge; ctx.lineWidth = P.edgeW * s; ctx.globalAlpha = P.rim;
    ctx.beginPath(); ctx.ellipse(-16 * s, 0, 14 * s, 11 * s, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    // ハサミ(前方=左)
    ctx.strokeStyle = P.head; ctx.lineWidth = 6 * s;
    for (const sd of [1, -1]) { ctx.beginPath(); ctx.moveTo(-24 * s, sd * 6 * s); ctx.lineTo(-38 * s, sd * 10 * s); ctx.stroke(); ctx.fillStyle = P.plate; ctx.beginPath(); ctx.ellipse(-42 * s, sd * 11 * s, 7 * s, 4 * s, sd * 0.5, 0, 7); ctx.fill(); }
    // スマートグラス(頭部のシアンのバイザー=気取り)。発光を強めて視認の要に
    ctx.save(); ctx.shadowColor = P.cyan; ctx.shadowBlur = P.visorGlow;
    ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-27 * s, -7 * s, 20 * s, 8 * s, 3 * s) : ctx.rect(-27 * s, -7 * s, 20 * s, 8 * s); ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
    ctx.strokeStyle = "#0a1a1e"; ctx.lineWidth = 1; ctx.stroke();
    // 尾(背中を越えて弧・節)+毒針。縁シアンで尾も浮かせる
    ctx.strokeStyle = P.body; ctx.lineWidth = 9 * s;
    ctx.beginPath(); ctx.moveTo(30 * s, -4 * s); ctx.quadraticCurveTo(52 * s, -30 * s, 34 * s, -44 * s); ctx.stroke();
    ctx.strokeStyle = P.edge; ctx.lineWidth = 1.4 * s; ctx.globalAlpha = P.rim; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = P.plate; for (let i = 0; i < 4; i++) { const t = i / 4; ctx.beginPath(); ctx.arc(30 * s + Math.sin(t * 2) * 14 * s, -4 * s - t * 34 * s, 4.5 * s, 0, 7); ctx.fill(); }
    // 針=レーザーポインタ(赤の照準ビーム+ロックオンのレティクル)。主張=脈動グロー+外環+回転十字
    const tx = 34 * s, ty = -46 * s, gx = -80 * s, gy = 40 * s;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
    ctx.strokeStyle = "rgba(255,95,124,.7)"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.save(); ctx.shadowColor = P.red; ctx.shadowBlur = 6; ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(tx, ty, 3.8 * s, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(gx, gy); ctx.shadowColor = P.red; ctx.shadowBlur = 5 + pulse * 6;
    ctx.strokeStyle = P.red; ctx.lineWidth = P.reticleW; const rr2 = P.reticleR;
    ctx.globalAlpha = 0.5 + pulse * 0.5; ctx.beginPath(); ctx.arc(0, 0, rr2 + pulse * 3, 0, 7); ctx.stroke(); // 脈動する外環
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, rr2 * 0.6, 0, 7); ctx.stroke();
    ctx.rotate(this.time * 0.8); ctx.beginPath(); ctx.moveTo(-rr2 - 4, 0); ctx.lineTo(rr2 + 4, 0); ctx.moveTo(0, -rr2 - 4); ctx.lineTo(0, rr2 + 4); ctx.stroke(); // 回転十字
    ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  // Phase6 ID3 シルヴァ: クロノ・マンティス(時計蟷螂)。木製歯車のカマキリ・胸に文字盤(snake脅威=緩急)。
  drawChronoMantis(ctx, raid) {
    const e = raid.snake, s = 1.35 * (raid.boss ? 1.15 : 1);
    const MP = (typeof SIG_PAL !== "undefined" && SIG_PAL.chronoMantis) || { eye: "#eca63a", eyeGlow: 5 };
    const wood = "#6e5230", woodL = "#8a6a40", brass = "#b8955a", eye = MP.eye, dark = "#3e2e18";
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(-1, 1); ctx.lineJoin = "round"; ctx.lineCap = "round"; // 左(コロニー)向き
    const flying = !!(raid.type && raid.type.flying); // hawk脅威=飛翔(舞い降りて鎌でさらう)
    if (!flying) { ctx.fillStyle = "rgba(0,0,0,.26)"; ctx.beginPath(); ctx.ellipse(0, 20 * s, 40 * s, 9 * s, 0, 0, 7); ctx.fill(); }
    const sway = Math.sin(this.time * 1.6) * 0.06; ctx.rotate(sway); // ゆっくり揺れる(等時性)
    // 飛翔: 半透明の翅(はばたき)。上空/急降下で"飛べる姿"として機能させる(hawk適応)
    if (flying) {
      const beat = Math.abs(Math.sin(this.time * 10)) * 0.5 + 0.3;
      ctx.save(); ctx.globalAlpha = 0.55;
      for (const dy of [4 * s, 0]) { ctx.fillStyle = dy ? "rgba(176,198,138,.34)" : "rgba(212,228,172,.42)"; ctx.beginPath(); ctx.moveTo(6 * s, -14 * s + dy); ctx.quadraticCurveTo(40 * s, (-30 - beat * 18) * s + dy, 52 * s, (-6 - beat * 6) * s + dy); ctx.quadraticCurveTo(30 * s, -4 * s + dy, 6 * s, -8 * s + dy); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(90,80,40,.4)"; ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(8 * s, -12 * s); ctx.lineTo((30 + i * 8) * s, (-24 + i * 6 - beat * 14) * s); ctx.stroke(); }
      ctx.restore();
    }
    // 後脚2対(接地)
    ctx.strokeStyle = dark; ctx.lineWidth = 3.4 * s;
    for (const o of [8, 20]) { ctx.beginPath(); ctx.moveTo(o * s, 6 * s); ctx.lineTo((o + 14) * s, 18 * s); ctx.lineTo((o + 8) * s, 22 * s); ctx.stroke(); }
    // 腹部(後方へ反る節)
    ctx.fillStyle = wood; ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6 * s, 6 * s); ctx.quadraticCurveTo(40 * s, 2 * s, 46 * s, -20 * s); ctx.quadraticCurveTo(34 * s, -8 * s, 8 * s, -2 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 1; i <= 4; i++) { const t = i / 5; ctx.strokeStyle = "rgba(40,28,12,.4)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(6 * s + t * 34 * s, 4 * s - t * 4 * s); ctx.lineTo(8 * s + t * 30 * s, -6 * s - t * 12 * s); ctx.stroke(); }
    // 胸(立ち上がる長い前胸)+埋め込みの木歯車(文字盤)
    ctx.fillStyle = woodL; ctx.beginPath(); ctx.moveTo(2 * s, 2 * s); ctx.lineTo(-8 * s, -34 * s); ctx.lineTo(-2 * s, -36 * s); ctx.lineTo(8 * s, -2 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 木歯車(胸の機構)
    const gx = -3 * s, gy = -16 * s, gr = 9 * s, ga = this.time * 0.8;
    ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.4; for (let i = 0; i < 8; i++) { const a = ga + i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr); ctx.lineTo(gx + Math.cos(a) * (gr + 2.5 * s), gy + Math.sin(a) * (gr + 2.5 * s)); ctx.stroke(); }
    ctx.fillStyle = woodL; ctx.beginPath(); ctx.arc(gx, gy, gr * 0.6, 0, 7); ctx.fill();
    // 時計の針(文字盤=クロノ)
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ga * 2) * gr * 0.5, gy + Math.sin(ga * 2) * gr * 0.5); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(-ga) * gr * 0.35, gy + Math.sin(-ga) * gr * 0.35); ctx.stroke();
    // 頭(三角+複眼)
    ctx.fillStyle = wood; ctx.beginPath(); ctx.moveTo(-8 * s, -34 * s); ctx.lineTo(-20 * s, -40 * s); ctx.lineTo(-10 * s, -44 * s); ctx.lineTo(-2 * s, -38 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.shadowColor = eye; ctx.shadowBlur = MP.eyeGlow || 5;
    ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(-16 * s, -41 * s, 3.4 * s, 0, 7); ctx.arc(-7 * s, -40 * s, 3 * s, 0, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(-16 * s, -41 * s, 1.3 * s, 0, 7); ctx.fill();
    // 触角
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-14 * s, -44 * s); ctx.quadraticCurveTo(-24 * s, -54 * s, -30 * s, -50 * s); ctx.stroke();
    // 鎌の前脚(折り畳んで構える)
    ctx.strokeStyle = woodL; ctx.lineWidth = 4.5 * s;
    const scy = Math.sin(this.time * 1.6 + 1) * 0.1;
    for (const o of [0, 3]) { ctx.save(); ctx.translate(-4 * s + o * s, -30 * s); ctx.rotate(scy); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16 * s, 6 * s); ctx.stroke(); ctx.strokeStyle = brass; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-16 * s, 6 * s); ctx.lineTo(-6 * s, 16 * s); ctx.stroke(); ctx.restore(); ctx.strokeStyle = woodL; ctx.lineWidth = 4.5 * s; }
    ctx.restore();
  },

  // Phase6 ID4 パルス: ハニワ・ゴーレム/墳王。埴輪が積み上がった土偶の巨人・うつろな目(monitor脅威=居座り)。
  drawHaniwaGolem(ctx, raid) {
    const e = raid.snake, s = 1.3 * (raid.boss ? 1.2 : 1);
    const clay = "#b07a50", clayD = "#7a4e30", clayL = "#c89468", hollow = "#241408", gold = "#c9a84e", life = "#8fe0a0";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 34 * s, 44 * s, 11 * s, 0, 0, 7); ctx.fill();
    const cyl = (cx, cy, w, h, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy + h / 2, w / 2, w * 0.16, 0, 0, 7); ctx.fill(); ctx.fillRect(cx - w / 2, cy - h / 2, w, h); ctx.beginPath(); ctx.ellipse(cx, cy - h / 2, w / 2, w * 0.16, 0, 0, 7); ctx.fill(); };
    // 脚(2本の埴輪筒)
    cyl(-14 * s, 24 * s, 16 * s, 24 * s, clayD); cyl(14 * s, 24 * s, 16 * s, 24 * s, clayD);
    // 胴(大きな埴輪の重なり)
    cyl(0, 0, 52 * s, 40 * s, clay);
    ctx.strokeStyle = clayD; ctx.lineWidth = 2; for (const yy of [-8, 6]) { ctx.beginPath(); ctx.ellipse(0, yy * s, 26 * s, 4.2 * s, 0, 0, 7); ctx.stroke(); } // 積み目
    // 金の帯(玄室の金・墳王の証)
    ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -2 * s, 26 * s, 4.2 * s, 0, 0, 7); ctx.stroke();
    // ひび
    ctx.strokeStyle = "rgba(40,20,10,.5)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8 * s, -16 * s); ctx.lineTo(-4 * s, -2 * s); ctx.lineTo(-10 * s, 12 * s); ctx.stroke();
    // 肩+腕(埴輪筒)
    cyl(-34 * s, -8 * s, 15 * s, 30 * s, clay); cyl(34 * s, -8 * s, 15 * s, 30 * s, clay);
    ctx.fillStyle = clayL; ctx.beginPath(); ctx.arc(-34 * s, 10 * s, 8 * s, 0, 7); ctx.arc(34 * s, 10 * s, 8 * s, 0, 7); ctx.fill(); // こぶし
    // 頭(埴輪の頭・うつろな目と口)
    cyl(0, -38 * s, 26 * s, 26 * s, clayL);
    ctx.fillStyle = hollow; // うつろな目(縦長の穴)
    ctx.beginPath(); ctx.ellipse(-8 * s, -40 * s, 3.6 * s, 6 * s, 0, 0, 7); ctx.ellipse(8 * s, -40 * s, 3.6 * s, 6 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -30 * s, 4 * s, 3 * s, 0, 0, 7); ctx.fill(); // 口
    // 目の奥の燐火(悼む魂・かすかに揺れる)
    const g = 0.4 + Math.sin(this.time * 2) * 0.3; ctx.fillStyle = life; ctx.globalAlpha = g;
    ctx.beginPath(); ctx.arc(-8 * s, -40 * s, 1.8 * s, 0, 7); ctx.arc(8 * s, -40 * s, 1.8 * s, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    // 頭頂の冠(前方後円の意匠・小)
    ctx.fillStyle = gold; ctx.beginPath(); ctx.ellipse(0, -52 * s, 7 * s, 3 * s, 0, 0, 7); ctx.fill();
    ctx.restore();
  },

  // Phase6 ID5 イグニス: スラグ・ヒドラ(鉱滓の多頭竜)。溶鉄スラグの多頭・炉熱で再生(snake脅威=多頭)。
  drawSlagHydra(ctx, raid) {
    const e = raid.snake, s = 1.35 * (raid.boss ? 1.15 : 1);
    const slag = "#2a1c16", molten = "#ff6a24", glow = "#ffb24a", crust = "#392620";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 26 * s, 48 * s, 11 * s, 0, 0, 7); ctx.fill();
    // 溶岩溜まりの土台(本体)
    ctx.fillStyle = slag; ctx.beginPath(); ctx.ellipse(0, 12 * s, 40 * s, 20 * s, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = crust; ctx.beginPath(); ctx.ellipse(0, 14 * s, 40 * s, 8 * s, 0, 0, 7); ctx.fill();
    // 溶けた割れ目(下から発光)
    const pmol = 0.6 + Math.sin(this.time * 3) * 0.25; ctx.strokeStyle = molten; ctx.globalAlpha = pmol; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-24 * s, 12 * s); ctx.lineTo(-10 * s, 4 * s); ctx.moveTo(6 * s, 14 * s); ctx.lineTo(22 * s, 6 * s); ctx.stroke(); ctx.globalAlpha = 1;
    // 3本の首(セグメントの蛇状)+頭
    const necks = [{ bx: -20, ph: 0 }, { bx: 2, ph: 2.1 }, { bx: 22, ph: 4.2 }];
    for (const nk of necks) {
      const wob = Math.sin(this.time * 2.4 + nk.ph) * 8 * s;
      const hx = nk.bx * s + wob, hy = -40 * s;
      // 首(下から頭へ)
      ctx.strokeStyle = slag; ctx.lineWidth = 11 * s;
      ctx.beginPath(); ctx.moveTo(nk.bx * s, 8 * s); ctx.quadraticCurveTo(nk.bx * s + wob * 0.5, -18 * s, hx, hy); ctx.stroke();
      // 首の溶接目(発光)
      ctx.strokeStyle = molten; ctx.globalAlpha = 0.5 * pmol; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nk.bx * s, 8 * s); ctx.quadraticCurveTo(nk.bx * s + wob * 0.5, -18 * s, hx, hy); ctx.stroke(); ctx.globalAlpha = 1;
      // 頭(角ばったスラグ塊)
      ctx.fillStyle = crust; ctx.beginPath(); ctx.moveTo(hx - 10 * s, hy); ctx.lineTo(hx - 14 * s, hy - 8 * s); ctx.lineTo(hx - 2 * s, hy - 10 * s); ctx.lineTo(hx + 12 * s, hy - 4 * s); ctx.lineTo(hx + 8 * s, hy + 6 * s); ctx.lineTo(hx - 6 * s, hy + 6 * s); ctx.closePath(); ctx.fill();
      // 口の中(溶鉄の輝き)
      ctx.fillStyle = glow; ctx.globalAlpha = pmol; ctx.beginPath(); ctx.ellipse(hx - 2 * s, hy, 4 * s, 2.4 * s, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      // 目(溶けた点)
      ctx.fillStyle = molten; ctx.beginPath(); ctx.arc(hx + 2 * s, hy - 4 * s, 1.8 * s, 0, 7); ctx.fill();
    }
    // 火の粉
    const g = lcg(77); ctx.fillStyle = glow;
    for (let i = 0; i < 8; i++) { const a = (this.time * 0.6 + g() * 6) % 1; ctx.globalAlpha = (1 - a) * 0.6; ctx.beginPath(); ctx.arc((-30 + g() * 60) * s, (10 - a * 50) * s, 1.4 * s, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  // Phase6 ID6 ユンガ: ドクロ・アナコンダ/贄蛇。トカゲ髑髏の首飾りを巻いた大蛇(monitor脅威=居座り)。
  drawSkullAnaconda(ctx, raid) {
    const e = raid.snake, s = 1.4 * (raid.boss ? 1.15 : 1);
    const body = "#46603a", belly = "#8a9a58", dark = "#26331e", bone = "#dccdb0", jade = "#2fa98a";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 22 * s, 52 * s, 12 * s, 0, 0, 7); ctx.fill();
    // とぐろ(太い胴の重なり)
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(6 * s, 8 * s, 46 * s, 20 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(6 * s, 4 * s, 44 * s, 17 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(14 * s, 2 * s, 30 * s, 11 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(18 * s, 0, 24 * s, 8 * s, 0, 0, 7); ctx.fill();
    // 鱗の斑(暗い菱形)
    ctx.fillStyle = dark; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(6 * s + i * 12 * s, 4 * s, 4 * s, 6 * s, 0, 0, 7); ctx.fill(); }
    // 首を持ち上げて頭(左=コロニー向き)
    const wob = Math.sin(this.time * 1.8) * 6 * s;
    ctx.strokeStyle = body; ctx.lineWidth = 15 * s;
    ctx.beginPath(); ctx.moveTo(-24 * s, 0); ctx.quadraticCurveTo(-44 * s, -14 * s + wob, -50 * s, -34 * s + wob); ctx.stroke();
    // 頭
    const hx = -50 * s, hy = -38 * s + wob;
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(hx, hy, 12 * s, 8 * s, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(hx - 4 * s, hy + 2 * s, 8 * s, 4 * s, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#d0b020"; ctx.beginPath(); ctx.arc(hx - 3 * s, hy - 4 * s, 2.4 * s, 0, 7); ctx.fill(); // 目
    ctx.fillStyle = dark; ctx.fillRect(hx - 4 * s, hy - 5 * s, 1 * s, 3 * s); // 縦瞳
    // 舌(二又)
    ctx.strokeStyle = "#c04040"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx - 10 * s, hy); ctx.lineTo(hx - 20 * s, hy - 2 * s); ctx.moveTo(hx - 16 * s, hy - 1.4 * s); ctx.lineTo(hx - 22 * s, hy - 5 * s); ctx.moveTo(hx - 16 * s, hy - 1.4 * s); ctx.lineTo(hx - 22 * s, hy + 1 * s); ctx.stroke();
    // トカゲの髑髏の首飾り(胴に沿って数珠)
    const skulls = [[-26, -4], [-8, -8], [10, -6], [28, -3], [-40, -20]];
    for (const [sx, sy] of skulls) {
      const x = sx * s, y = sy * s;
      ctx.fillStyle = bone; ctx.beginPath(); ctx.ellipse(x, y, 4.4 * s, 3.8 * s, 0, 0, 7); ctx.fill(); // 頭骨
      ctx.beginPath(); ctx.moveTo(x - 2 * s, y + 2 * s); ctx.lineTo(x, y + 6 * s); ctx.lineTo(x + 2 * s, y + 2 * s); ctx.fill(); // 顎
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x - 1.6 * s, y - 0.5 * s, 1.2 * s, 0, 7); ctx.arc(x + 1.6 * s, y - 0.5 * s, 1.2 * s, 0, 7); ctx.fill(); // 眼窩
    }
    // 紐(翡翠の玉=神使への冒涜の対比)
    ctx.strokeStyle = jade; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-40 * s, -20 * s); for (const [sx, sy] of [[-26, -4], [-8, -8], [10, -6], [28, -3]]) ctx.lineTo(sx * s, sy * s); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
  },

  // Phase6 ID7 メアリス: マグマ・シャーク/熔鮫。溶岩泥を纏い津波に乗って突進する巨大鮫(snake脅威=突進)。
  drawMagmaShark(ctx, raid) {
    const e = raid.snake, s = 1.45 * (raid.boss ? 1.15 : 1);
    const shark = "#33454c", belly = "#769097", mud = "#b5502a", molten = "#ff6a28", teeth = "#ece4d6";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    const lunge = Math.sin(this.time * 2) * 6 * s;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(6 * s, 22 * s, 54 * s, 10 * s, 0, 0, 7); ctx.fill();
    // 尾びれ(右)
    ctx.fillStyle = shark; ctx.beginPath(); ctx.moveTo(44 * s, 0); ctx.lineTo(64 * s, -18 * s); ctx.lineTo(56 * s, 0); ctx.lineTo(64 * s, 16 * s); ctx.closePath(); ctx.fill();
    // 胴(流線・左が頭)
    ctx.fillStyle = shark; ctx.beginPath(); ctx.moveTo(-52 * s + lunge, 0); ctx.quadraticCurveTo(-20 * s, -22 * s, 46 * s, -6 * s); ctx.quadraticCurveTo(50 * s, 0, 46 * s, 6 * s); ctx.quadraticCurveTo(-20 * s, 20 * s, -52 * s + lunge, 0); ctx.closePath(); ctx.fill();
    // 腹(明色)
    ctx.fillStyle = belly; ctx.beginPath(); ctx.moveTo(-40 * s + lunge, 6 * s); ctx.quadraticCurveTo(0, 18 * s, 40 * s, 5 * s); ctx.quadraticCurveTo(0, 12 * s, -40 * s + lunge, 6 * s); ctx.fill();
    // 背びれ
    ctx.fillStyle = shark; ctx.beginPath(); ctx.moveTo(4 * s, -14 * s); ctx.lineTo(16 * s, -34 * s); ctx.lineTo(22 * s, -12 * s); ctx.closePath(); ctx.fill();
    // 胸びれ
    ctx.beginPath(); ctx.moveTo(-12 * s, 10 * s); ctx.lineTo(-4 * s, 26 * s); ctx.lineTo(6 * s, 12 * s); ctx.closePath(); ctx.fill();
    // 溶土化(背側後半に溶岩泥の殻+発光する割れ目)
    ctx.fillStyle = mud; ctx.beginPath(); ctx.moveTo(6 * s, -13 * s); ctx.quadraticCurveTo(30 * s, -18 * s, 46 * s, -5 * s); ctx.quadraticCurveTo(30 * s, -2 * s, 8 * s, -4 * s); ctx.closePath(); ctx.fill();
    const pm = 0.6 + Math.sin(this.time * 3.5) * 0.3; ctx.strokeStyle = molten; ctx.globalAlpha = pm; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(14 * s, -12 * s); ctx.lineTo(22 * s, -6 * s); ctx.moveTo(30 * s, -12 * s); ctx.lineTo(36 * s, -6 * s); ctx.stroke(); ctx.globalAlpha = 1;
    // 頭部・エラ
    ctx.strokeStyle = "rgba(20,30,34,.6)"; ctx.lineWidth = 1.4; for (const gx of [-28, -24, -20]) { ctx.beginPath(); ctx.moveTo((gx) * s + lunge, -6 * s); ctx.lineTo((gx) * s + lunge, 6 * s); ctx.stroke(); }
    // 口(大きく開く+歯)
    const mx = -52 * s + lunge;
    ctx.fillStyle = "#1a0d0a"; ctx.beginPath(); ctx.moveTo(mx, 2 * s); ctx.quadraticCurveTo(mx + 16 * s, 14 * s, mx + 26 * s, 8 * s); ctx.lineTo(mx + 22 * s, 2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = teeth; for (let i = 0; i < 6; i++) { const tx = mx + 4 * s + i * 3.6 * s; ctx.beginPath(); ctx.moveTo(tx, 5 * s); ctx.lineTo(tx + 1.6 * s, 9 * s); ctx.lineTo(tx + 3.2 * s, 5 * s); ctx.fill(); }
    // 目
    ctx.fillStyle = "#0a0e10"; ctx.beginPath(); ctx.arc(mx + 14 * s, -4 * s, 2.6 * s, 0, 7); ctx.fill();
    ctx.fillStyle = molten; ctx.globalAlpha = pm; ctx.beginPath(); ctx.arc(mx + 14 * s, -4 * s, 1.2 * s, 0, 7); ctx.fill(); ctx.globalAlpha = 1; // 溶けた眼光
    ctx.restore();
  },

  // Phase6 ID8 グラキス: ヌシ・バガー/親個体。既存bagger描画を流用した大型のelite変種(bugger脅威)。
  //   設計=名前付きelite変種。"外側へ抜けようと飼育槽のガラスを内側から叩く"メタの気配を薄く添える(侵食連動は別スプリント)。
  drawBaggerParent(ctx, raid) {
    const e = raid.snake, p = 0.4 + Math.sin(this.time * 4) * 0.2;
    // 親個体の圧=強い紫のオーラ
    const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 150);
    g.addColorStop(0, `rgba(150,70,200,${0.2 * p + 0.08})`); g.addColorStop(1, "rgba(150,70,200,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, 150, 0, 7); ctx.fill();
    // 大型化して既存bagger描画を再利用(=elite変種・視覚言語を継承)
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1.5, 1.5); ctx.translate(-e.x, -e.y);
    this.drawBugger(ctx, raid);
    ctx.restore();
    const BP = (typeof SIG_PAL !== "undefined" && SIG_PAL.baggerParent) || { crack: "220,228,240", crackAlpha: 0.34, sac: "#6a4a86", sacEgg: "#c9a8e6", sacGlow: "#b070e0" };
    // 親個体固有の意匠=卵嚢(brood sac): 体の下に半透明のゼリー嚢＋透ける卵。親個体の"格"を立てる
    ctx.save(); ctx.translate(e.x - 18, e.y + 30);
    const ps = 0.6 + Math.sin(this.time * 2.2) * 0.25;
    const sg = ctx.createRadialGradient(0, 0, 2, 0, 0, 30); sg.addColorStop(0, `rgba(176,112,224,${0.22 * ps})`); sg.addColorStop(1, "rgba(176,112,224,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
    ctx.fillStyle = BP.sac; ctx.globalAlpha = 0.72; ctx.beginPath(); ctx.ellipse(0, 4, 24, 15, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; // ゼリー嚢
    ctx.fillStyle = BP.sacEgg; for (const [ex, ey] of [[-13, 2], [-4, 6], [6, 3], [14, 7], [-8, -3], [3, -2], [11, -4]]) { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex - 1, ey - 1, 1, 0, 7); ctx.fill(); ctx.fillStyle = BP.sacEgg; } // 透ける卵+ハイライト
    ctx.globalAlpha = 1; ctx.restore();
    // ガラスを内側から叩くヒビ=槽面(右のガラス壁)に固定。空中に浮かせない(§8.12 ボスは右=外へ抜けようと叩く)
    ctx.save(); ctx.strokeStyle = `rgba(${BP.crack},${BP.crackAlpha + Math.sin(this.time * 6) * 0.16})`; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    const cx = FIELD.x2 - 3, cy = clamp(e.y - 10, FIELD.y1 + 50, FIELD.y2 - 50); // 右のガラス壁の一点(槽面)
    for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 6 * Math.PI - Math.PI / 2) * 0.9; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (12 + i * 5), cy + Math.sin(a) * (12 + i * 5)); ctx.stroke(); } // 内側(左)へ放射するヒビ
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.stroke(); // 打撃点
    ctx.restore();
  },

  // Phase6 ID9 ヴォルタ: メルト・ゴーレム/臨界獣。廃炉パーツの寄せ集め+熱暴走ゲージ(scorpion脅威=範囲弱体)。
  drawMeltGolem(ctx, raid) {
    const e = raid.snake, s = 1.35 * (raid.boss ? 1.15 : 1);
    const junk = "#464b50", junkD = "#2b2f33", junkL = "#5e646a", core = "#7affd0", heat = "#ff5424", tape = "#d8c828";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(0, 30 * s, 46 * s, 11 * s, 0, 0, 7); ctx.fill();
    // 脚(不揃いのパーツ)
    ctx.fillStyle = junkD; ctx.fillRect(-22 * s, 12 * s, 14 * s, 22 * s); ctx.fillRect(8 * s, 14 * s, 16 * s, 20 * s);
    // 胴(いびつな寄せ集めの塊)
    ctx.fillStyle = junk; ctx.beginPath();
    ctx.moveTo(-30 * s, -18 * s); ctx.lineTo(-8 * s, -30 * s); ctx.lineTo(22 * s, -24 * s); ctx.lineTo(32 * s, -2 * s); ctx.lineTo(26 * s, 18 * s); ctx.lineTo(-24 * s, 16 * s); ctx.lineTo(-34 * s, -2 * s); ctx.closePath(); ctx.fill();
    // パネルの継ぎ目(色違いプラ/金属)
    ctx.fillStyle = junkL; ctx.fillRect(-6 * s, -26 * s, 24 * s, 14 * s);
    ctx.fillStyle = junkD; ctx.fillRect(-28 * s, -6 * s, 16 * s, 18 * s);
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1.4; ctx.strokeRect(-6 * s, -26 * s, 24 * s, 14 * s);
    // 剥き出しの配線(3色)
    for (const [c, oy] of [["#c04040", -8], ["#3a6ad0", -2], ["#d0b030", 4]]) { ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(24 * s, oy * s); ctx.quadraticCurveTo(34 * s, (oy + 6) * s, 30 * s, (oy + 12) * s); ctx.stroke(); }
    // 臨界コア(胸で脈動する発光)
    const pc = 0.55 + Math.sin(this.time * 3) * 0.35;
    const cg = ctx.createRadialGradient(0, -2 * s, 1, 0, -2 * s, 16 * s);
    cg.addColorStop(0, `rgba(122,255,208,${pc})`); cg.addColorStop(1, "rgba(122,255,208,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, -2 * s, 16 * s, 0, 7); ctx.fill();
    ctx.fillStyle = core; ctx.globalAlpha = pc; ctx.beginPath(); ctx.arc(0, -2 * s, 6 * s, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    // 腕(不格好・片方は応急テープ)
    ctx.strokeStyle = junk; ctx.lineWidth = 8 * s; ctx.beginPath(); ctx.moveTo(-28 * s, -8 * s); ctx.lineTo(-40 * s, 8 * s); ctx.stroke();
    ctx.strokeStyle = junk; ctx.beginPath(); ctx.moveTo(28 * s, -6 * s); ctx.lineTo(42 * s, 10 * s); ctx.stroke();
    ctx.strokeStyle = tape; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-34 * s, 0); ctx.lineTo(-38 * s, 6 * s); ctx.stroke(); // 黄テープ補修
    // 頭(小・単眼)
    ctx.fillStyle = junkD; ctx.fillRect(-8 * s, -40 * s, 16 * s, 12 * s);
    ctx.fillStyle = heat; ctx.globalAlpha = pc; ctx.beginPath(); ctx.arc(0, -34 * s, 3 * s, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    // 熱暴走ゲージ(雑に斜めに貼られた温度ストリップ)
    ctx.save(); ctx.translate(30 * s, -20 * s); ctx.rotate(0.22);
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, 0, 7 * s, 30 * s);
    const hl = (0.4 + Math.sin(this.time * 0.8) * 0.4); // メラメラ上昇(演出)
    ctx.fillStyle = heat; ctx.fillRect(1 * s, 30 * s - 28 * s * hl, 5 * s, 28 * s * hl);
    ctx.strokeStyle = tape; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 7 * s, 30 * s);
    ctx.restore();
    ctx.restore();
  },

  // Phase6 ID10 オリジン: レリック・スフィンクス/守墓像。渾天儀の遺構に宿った石の守護像(monitor脅威=居座り)。
  drawRelicSphinx(ctx, raid) {
    const e = raid.snake, s = 1.4 * (raid.boss ? 1.15 : 1);
    const stone = "#8a8072", stoneD = "#5f574c", stoneL = "#a49a8a", gold = "#c9a84e", moss = "#6a7a4a", glow = "#ffcf6a";
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round";
    const flying = !!(raid.type && raid.type.flying); // crow脅威=有翼で舞い降り、卵=系譜を収める
    // 有翼(飛翔): 石の翼をゆったり羽ばたく(ゆっくり=威厳・収蔵の所作。軽薄な逃走に見せない)
    if (flying) {
      const beat = Math.sin(this.time * 2.2) * 0.5;
      ctx.save();
      for (const sd of [1, -1]) { ctx.fillStyle = sd > 0 ? "#7c7264" : "#6a6155"; ctx.beginPath(); ctx.moveTo(6 * s, -18 * s); ctx.quadraticCurveTo((30 + sd * 6) * s, (-46 - beat * 10) * s, (48 + sd * 4) * s, (-20 - beat * 14) * s); ctx.quadraticCurveTo(26 * s, -14 * s, 6 * s, -10 * s); ctx.fill(); }
      ctx.strokeStyle = "#c9a84e"; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(8 * s, -16 * s); ctx.lineTo((22 + i * 7) * s, (-30 - i * 4 - beat * 10) * s); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.restore();
    } else {
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 28 * s, 54 * s, 12 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = stoneD; ctx.fillRect(-46 * s, 22 * s, 92 * s, 10 * s); // 台座(接地時のみ)
    }
    // うずくまる獅子身(石)
    ctx.fillStyle = stone; ctx.beginPath(); ctx.moveTo(-46 * s, 22 * s); ctx.lineTo(-40 * s, -6 * s); ctx.quadraticCurveTo(-10 * s, -16 * s, 30 * s, -6 * s); ctx.lineTo(40 * s, 22 * s); ctx.closePath(); ctx.fill();
    // 前脚(前方=左へ伸ばす)
    ctx.fillStyle = stoneL; ctx.fillRect(-48 * s, 8 * s, 40 * s, 14 * s);
    ctx.strokeStyle = stoneD; ctx.lineWidth = 1.6; for (const lx of [-44, -34, -24]) { ctx.beginPath(); ctx.moveTo(lx * s, 12 * s); ctx.lineTo(lx * s, 22 * s); ctx.stroke(); } // 爪の彫り
    // 風化のひび+苔
    ctx.strokeStyle = "rgba(40,34,26,.5)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-20 * s, -8 * s); ctx.lineTo(-14 * s, 10 * s); ctx.moveTo(10 * s, -6 * s); ctx.lineTo(16 * s, 16 * s); ctx.stroke();
    ctx.fillStyle = moss; ctx.globalAlpha = 0.5; for (const [mx, my] of [[-30, 18], [24, 16], [-6, 20]]) { ctx.beginPath(); ctx.ellipse(mx * s, my * s, 6 * s, 2.4 * s, 0, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    // 頭(守護像の顔・幅広)+ネメス頭巾風の金の帯
    ctx.fillStyle = stone; ctx.beginPath(); ctx.ellipse(-30 * s, -22 * s, 18 * s, 17 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(-46 * s, -30 * s); ctx.quadraticCurveTo(-30 * s, -42 * s, -14 * s, -30 * s); ctx.lineTo(-16 * s, -22 * s); ctx.quadraticCurveTo(-30 * s, -30 * s, -44 * s, -22 * s); ctx.closePath(); ctx.fill(); // 頭巾
    ctx.strokeStyle = stoneD; ctx.lineWidth = 1.4; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-30 * s + i * 6 * s, -34 * s); ctx.lineTo(-30 * s + i * 5 * s, -26 * s); ctx.stroke(); }
    // 顔の彫り(鼻・口)
    ctx.strokeStyle = stoneD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-40 * s, -22 * s); ctx.lineTo(-44 * s, -18 * s); ctx.moveTo(-42 * s, -14 * s); ctx.lineTo(-34 * s, -14 * s); ctx.stroke();
    // 光る眼(「問い」=最後の理性・静かに脈動)
    const pe = 0.5 + Math.sin(this.time * 1.6) * 0.4; ctx.fillStyle = glow; ctx.globalAlpha = pe;
    ctx.beginPath(); ctx.ellipse(-34 * s, -22 * s, 2.6 * s, 3.4 * s, 0, 0, 7); ctx.ellipse(-24 * s, -22 * s, 2.6 * s, 3.4 * s, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    // 背後に渾天儀の環(遺構・ゆっくり回る金の環)
    ctx.save(); ctx.translate(20 * s, -36 * s); ctx.strokeStyle = gold; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
    ctx.rotate(this.time * 0.2); ctx.beginPath(); ctx.ellipse(0, 0, 20 * s, 8 * s, 0, 0, 7); ctx.stroke();
    ctx.rotate(1.1); ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 20 * s, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, 0, 3 * s, 0, 7); ctx.fill(); ctx.restore();
    // 収蔵の所作: さらった卵を金の厨子の光に収める(盗む=軽薄ではなく、系譜=未来を過去へ収める荘厳さ)
    if (flying && raid.stolenEgg) {
      ctx.save(); ctx.translate(-6 * s, 4 * s);
      const gp2 = 0.5 + Math.sin(this.time * 2) * 0.3; const rg = ctx.createRadialGradient(0, 0, 1, 0, 0, 16 * s); rg.addColorStop(0, `rgba(255,207,106,${0.5 * gp2})`); rg.addColorStop(1, "rgba(255,207,106,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 16 * s, 0, 7); ctx.fill();
      ctx.fillStyle = "#f0e6d0"; ctx.beginPath(); ctx.ellipse(0, 0, 5 * s, 6.5 * s, 0, 0, 7); ctx.fill(); // 収める卵
      ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.globalAlpha = gp2; ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();
    }
    ctx.restore();
  },

  // Phase6 ID2 電脳ファルコン(owl型): 廃基板を纏う隼。上空を舞う(1-2羽)。※姿は後で個別修正可。
  drawFalcon(ctx, lv) {
    const n = Math.min(2, 1 + Math.floor((lv || 1) / 3));
    const air = [[330, 250], [240, 300]];
    for (let i = 0; i < n; i++) { const t = this.time * 1.4 + i * 2.2, bx = air[i][0], by = air[i][1]; this._falcon(ctx, bx + Math.sin(t) * 34, by + Math.sin(t * 1.3) * 12, Math.sin(t) >= 0 ? 1 : -1); }
  },
  _falcon(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const P = (typeof SIG_PAL !== "undefined" && SIG_PAL.falcon) || { body: "#5f7391", edge: "#a6f4ff", cyan: "#9df2fd", glow: 0.26, glowR: 27, eyeR: 1.5 };
    const flap = Math.sin(this.time * 9) * 0.6;
    // 夜空で沈まないよう視認グローを強める(半径/濃さCFG化)
    const rgb = "157,242,253"; ctx.fillStyle = `rgba(${rgb},${P.glow})`; ctx.beginPath(); ctx.ellipse(0, 0, P.glowR, P.glowR * 0.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = P.body; ctx.strokeStyle = P.edge; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-16, -6 - flap * 12, -26, 0); ctx.quadraticCurveTo(-14, 3, 0, 3); ctx.fill(); ctx.stroke(); // 後翼(縁シアン)
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12, -6 - flap * 12, 22, 0); ctx.quadraticCurveTo(12, 3, 0, 3); ctx.fill(); ctx.stroke(); // 前翼(縁シアン)
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(3, 1, 8, 4, 0, 0, 7); ctx.fill(); // 胴
    ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(-15, 4); ctx.lineTo(-6, 4); ctx.fill(); // 尾
    ctx.beginPath(); ctx.arc(10, 0, 3.2, 0, 7); ctx.fill(); // 頭
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(17, 1); ctx.lineTo(13, 2); ctx.fill(); // くちばし
    ctx.save(); ctx.shadowColor = P.cyan; ctx.shadowBlur = 5; ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(11, -1, P.eyeR, 0, 7); ctx.fill(); ctx.fillRect(-1, 0, 5, 1.2); ctx.restore(); // サイバー目(発光)+基板
    ctx.restore();
  },

  // Phase6 ID3 ゼンマイ・ヤマネ部隊(新arch・効果は今後): 眠そうなヤマネ+背にゼンマイの鍵。
  drawDormouse(ctx, lv) { const k = this._allyK("dormouse", 1.44); this._allySquad(ctx, lv, (c, x, y, dir) => this._allyBoost(c, x, y, k, () => this._dormouse(c, 0, 0, dir))); },
  _dormouse(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const fur = "#8a6a44", furL = "#a8865a", brass = "#b8955a";
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(0, 9, 13, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = fur; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-18, 0, -16, -8); ctx.stroke(); // 尾
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(0, 2, 11, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = furL; ctx.beginPath(); ctx.ellipse(-1, 1, 8, 6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = brass; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -9, 3, 0, 7); ctx.moveTo(2, -9); ctx.lineTo(2, -3); ctx.stroke(); // ゼンマイの鍵
    ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(9, -1, 6, 0, 7); ctx.fill(); // 頭
    ctx.beginPath(); ctx.arc(7, -7, 2.4, 0, 7); ctx.fill(); // 耳
    ctx.strokeStyle = "#241a10"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(13, -2); ctx.stroke(); // 寝ぼけ半目
    ctx.fillStyle = "#3a2418"; ctx.beginPath(); ctx.arc(14, 0, 1.2, 0, 7); ctx.fill(); // 鼻
    ctx.restore();
  },

  // Phase6 ID4 トムライ・ホタルジャコ(新arch・効果は今後): 地味な小鳥+緑の鬼火(燐火)。
  drawFireflyBird(ctx, lv) {
    const spots = [[300, 455], [360, 478]], n = Math.min(2, 1 + Math.floor((lv || 1) / 3)), k = this._allyK("firefly", 1.5);
    for (let i = 0; i < n; i++) this._allyBoost(ctx, spots[i][0], spots[i][1], k, () => this._fireflyBird(ctx, 0, 0, i % 2 ? 1 : -1));
  },
  _fireflyBird(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const drab = "#5a5348", drabL = "#726a5a";
    const gp = 0.5 + Math.sin(this.time * 2.4) * 0.4, fx = -12, fy = -14 - Math.sin(this.time * 1.6) * 3;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 11); g.addColorStop(0, `rgba(143,224,160,${gp})`); g.addColorStop(1, "rgba(143,224,160,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, 11, 0, 7); ctx.fill(); // 鬼火
    ctx.fillStyle = "#8fe0a0"; ctx.globalAlpha = gp; ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(0, 8, 10, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = drab; ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = drabL; ctx.beginPath(); ctx.ellipse(-1, 1, 6, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = drab; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.quadraticCurveTo(-12, 0, -8, 4); ctx.fill(); // 翼
    ctx.beginPath(); ctx.arc(7, -3, 4, 0, 7); ctx.fill(); // 頭
    ctx.fillStyle = "#c0a030"; ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(14, -2); ctx.lineTo(10, -1); ctx.fill(); // くちばし
    ctx.fillStyle = "#1a140c"; ctx.beginPath(); ctx.arc(8, -4, 1, 0, 7); ctx.fill();
    ctx.restore();
  },

  // Phase6 ID5 カジ・モグラ(新arch・効果は今後): 頭が金床の不格好なモグラ。
  drawAnvilMole(ctx, lv) { const k = this._allyK("mole", 1.42); this._allySquad(ctx, lv, (c, x, y, dir) => this._allyBoost(c, x, y, k, () => this._anvilMole(c, 0, 0, dir))); },
  _anvilMole(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const fur = "#4a4038", furL = "#5e5248", iron = "#6a6e74", ironD = "#3e4247";
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.beginPath(); ctx.ellipse(0, 10, 14, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(-2, 2, 13, 9, 0, 0, 7); ctx.fill(); // 胴
    ctx.fillStyle = furL; ctx.beginPath(); ctx.ellipse(-3, 1, 9, 6, 0, 0, 7); ctx.fill();
    // 掘る前脚(大きな爪)
    ctx.fillStyle = "#c9b088"; ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(14, 8); ctx.lineTo(12, 12); ctx.lineTo(6, 10); ctx.fill();
    // 頭=金床(アンビル)
    ctx.fillStyle = iron; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(20, -8); ctx.lineTo(20, -2); ctx.lineTo(14, 0); ctx.lineTo(14, 4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ironD; ctx.fillRect(8, 3, 6, 3); // 金床の脚
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(18, -7); ctx.lineTo(18, -5); ctx.lineTo(8, -4); ctx.fill(); // 金床のハイライト
    ctx.fillStyle = "#1a140c"; ctx.beginPath(); ctx.arc(10, -1, 1, 0, 7); ctx.fill(); // 目(小)
    ctx.restore();
  },

  // Phase6 ID6 クロスボウ・マングース部隊(ferret型): 弩を構える小柄な兵団。
  drawMangooseSquad(ctx, lv) { this._allySquad(ctx, lv, (c, x, y, dir) => this._mangoose(c, x, y, dir)); },
  _mangoose(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const fur = "#9a8258", furL = "#b09a70", wood = "#6e5230";
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 12, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = fur; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(-17, 4, -17, -6); ctx.stroke(); // 尾
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(-1, 3, 8, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = furL; ctx.beginPath(); ctx.ellipse(-2, 4, 5, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = fur; ctx.fillRect(-4, 11, 3, 4); ctx.fillRect(2, 11, 3, 4); // 後脚
    ctx.beginPath(); ctx.arc(2, -8, 5, 0, 7); ctx.fill(); // 頭
    ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(11, -7); ctx.lineTo(6, -6); ctx.fill(); // 鼻先
    ctx.fillStyle = "#1a140c"; ctx.beginPath(); ctx.arc(4, -9, 1, 0, 7); ctx.fill();
    ctx.strokeStyle = wood; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(15, -2); ctx.stroke(); // 弩の台
    ctx.beginPath(); ctx.moveTo(15, -6); ctx.lineTo(15, 2); ctx.stroke(); // 弓
    ctx.strokeStyle = "#d8cbb0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15, -6); ctx.lineTo(7, -2); ctx.lineTo(15, 2); ctx.stroke(); // 弦
    ctx.restore();
  },
  // Phase6 ID7 碩学蛸(turtle型): 眼鏡+錨を巻いた理屈屋タコ。
  drawOctopus(ctx, lv) { const n = Math.min(2, 1 + Math.floor((lv || 1) / 3)), sp = [[300, 468], [362, 452]]; for (let i = 0; i < n; i++) this._octopus(ctx, sp[i][0], sp[i][1], i % 2 ? 1 : -1); },
  _octopus(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const skin = "#8a5a7a", skinL = "#a87696", glass = "#cfe6ee", anchor = "#8a8f96";
    ctx.strokeStyle = skin; ctx.lineWidth = 3.5; ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6, w = Math.sin(this.time * 2 + i) * 4; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(Math.cos(a) * 14, 11 + w, Math.cos(a) * 20, 17); ctx.stroke(); } // 触腕
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, -4, 14, 15, 0, 0, 7); ctx.fill(); // マント
    ctx.fillStyle = skinL; ctx.beginPath(); ctx.ellipse(-2, -8, 8, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#2a2e33"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-4, -2, 3.4, 0, 7); ctx.arc(5, -2, 3.4, 0, 7); ctx.moveTo(-0.6, -2); ctx.lineTo(1.6, -2); ctx.stroke(); // 眼鏡
    ctx.fillStyle = glass; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(-4, -2, 3, 0, 7); ctx.arc(5, -2, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1418"; ctx.beginPath(); ctx.arc(-4, -2, 1.2, 0, 7); ctx.arc(5, -2, 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = anchor; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(-16, 14); ctx.moveTo(-20, 10); ctx.quadraticCurveTo(-16, 18, -12, 10); ctx.moveTo(-20, 2); ctx.lineTo(-12, 2); ctx.stroke(); // 錨
    ctx.restore();
  },

  // Phase6 ID8 ジャンク・ペンギン・サーボ隊(eagle型): 軍用サーボを背負ったペンギン。
  drawServoPenguin(ctx, lv) { this._allySquad(ctx, lv, (c, x, y, dir) => this._penguin(c, x, y, dir)); },
  _penguin(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const black = "#2a2e34", white = "#e8ecf0", beak = "#d8a030", steel = "#6a6e74", red = "#ff4030";
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 13, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = black; ctx.beginPath(); ctx.ellipse(0, 2, 10, 13, 0, 0, 7); ctx.fill(); // 体
    ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(-1, 4, 6, 9, 0, 0, 7); ctx.fill(); // 腹
    ctx.fillStyle = beak; ctx.beginPath(); ctx.moveTo(-5, 14); ctx.lineTo(-1, 14); ctx.lineTo(-3, 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(6, 14); ctx.lineTo(4, 10); ctx.fill(); // 足
    ctx.fillStyle = black; ctx.beginPath(); ctx.arc(0, -10, 7, 0, 7); ctx.fill(); // 頭
    ctx.fillStyle = beak; ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(11, -9); ctx.lineTo(6, -8); ctx.fill(); // くちばし
    ctx.fillStyle = white; ctx.beginPath(); ctx.arc(3, -12, 1.6, 0, 7); ctx.fill(); ctx.fillStyle = "#1a1418"; ctx.beginPath(); ctx.arc(3.4, -12, 0.9, 0, 7); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-16, -8); ctx.lineTo(-10, -14); ctx.stroke(); // サーボアーム
    ctx.fillStyle = steel; ctx.fillRect(-14, -16, 8, 4);
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(-6, -15, 1.4, 0, 7); ctx.fill(); // 赤単眼(照準)
    ctx.restore();
  },
  // Phase6 ID9 ジャンク・ラクーン整備班(gecko型): 応急テープだらけのアライグマ。※代替=廃炉山椒魚(姿は後で個別修正可)。
  // Phase6 ID9 ヴォルタ: 廃炉山椒魚(ラクーンから差し替え)。被曝白化の再生両生類(ウーパールーパー系)。
  //   四肢を失っても即再生(=1本を半透明の再生肢で表現)。黄テープ意匠は尾に残す。役割/引き継ぎ(gecko)は不変=姿のみ。
  drawHairoSalamander(ctx, lv) { const k = this._allyK("salamander", 1.28); this._allySquad(ctx, lv, (c, x, y, dir) => this._allyBoost(c, x, y, k, () => this._hairoSalamander(c, 0, 0, dir))); },
  _hairoSalamander(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const S = (typeof SIG_PAL !== "undefined" && SIG_PAL.hairoSalamander) || { body: "#e6e0d6", bodyL: "#f2eee6", belly: "#f0dcd8", gill: "#e2909a", gillL: "#f0b0b6", tape: "#d8c828", glow: "#8fe0c0", regen: "rgba(232,226,216,.5)" };
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(0, 10, 13, 3.5, 0, 0, 7); ctx.fill();
    // 被曝適応の淡い冷光(わずか)
    const gp = 0.14 + Math.sin(this.time * 1.8) * 0.06; const gg = ctx.createRadialGradient(0, 2, 2, 0, 2, 20); gg.addColorStop(0, `rgba(143,224,192,${gp})`); gg.addColorStop(1, "rgba(143,224,192,0)"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 2, 20, 0, 7); ctx.fill();
    // 尾(ひれ付き)＋黄テープの目印
    ctx.fillStyle = S.body; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-22, -4, -24, 3); ctx.quadraticCurveTo(-18, 8, -6, 6); ctx.fill(); // 尾ひれ
    ctx.strokeStyle = S.tape; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-16, 1); ctx.lineTo(-13, 5); ctx.stroke();
    // 後脚(片方は半透明=再生中の四肢)
    ctx.strokeStyle = S.body; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(-6, 13); ctx.stroke();
    ctx.strokeStyle = S.regen; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(5, 12); ctx.stroke(); // 再生肢(淡い)
    // 胴(ずんぐり両生類)
    ctx.fillStyle = S.body; ctx.beginPath(); ctx.ellipse(-1, 3, 11, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = S.belly; ctx.beginPath(); ctx.ellipse(-1, 5, 8, 4.5, 0, 0, 7); ctx.fill(); // 腹
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(-3, 0, 5, 2.4, 0, 0, 7); ctx.fill(); // 湿った照り
    // 前脚
    ctx.strokeStyle = S.body; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(9, 12); ctx.stroke();
    // 幅広の頭
    ctx.fillStyle = S.bodyL; ctx.beginPath(); ctx.ellipse(9, -1, 8, 6, 0, 0, 7); ctx.fill();
    // 外鰓(ウーパールーパーの羽状の鰓=3本×上下)
    ctx.lineCap = "round";
    for (const sd of [-1, 1]) { for (let i = 0; i < 3; i++) { const gy = -1 + sd * (2 + i * 2.4); ctx.strokeStyle = i === 1 ? S.gillL : S.gill; ctx.lineWidth = 2.2 - i * 0.3; ctx.beginPath(); ctx.moveTo(6, -1); ctx.quadraticCurveTo(10, gy, 15 + i, gy + sd * 2); ctx.stroke(); } }
    // 目(小・つぶら)＋のんびりした口
    ctx.fillStyle = "#2a2620"; ctx.beginPath(); ctx.arc(11, -3, 1.2, 0, 7); ctx.arc(14, -2, 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(140,110,110,.6)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(12, 2); ctx.quadraticCurveTo(15, 3, 17, 1.5); ctx.stroke();
    ctx.restore();
  },

  // Phase6 ID10 記録係アノール(新arch・効果は今後): 石板を抱えた学者肌の小トカゲ。
  drawArchivistAnole(ctx, lv) { const n = Math.min(2, 1 + Math.floor((lv || 1) / 3)), sp = [[300, 466], [362, 452]], k = this._allyK("anole", 1.42); for (let i = 0; i < n; i++) this._allyBoost(ctx, sp[i][0], sp[i][1], k, () => this._anole(ctx, 0, 0, i % 2 ? 1 : -1)); },
  _anole(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const skin = "#7a8a6a", skinL = "#9aac86", tablet = "#8a8072", gold = "#c9a84e";
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(0, 10, 13, 3.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.quadraticCurveTo(-20, 6, -24, 0); ctx.stroke(); // 尾
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(-2, 4, 10, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = skinL; ctx.beginPath(); ctx.ellipse(-3, 3, 6, 4, 0, 0, 7); ctx.fill();
    // 学者服(肩マント)=記録係の証(トカゲと差別化)
    ctx.fillStyle = "#3f4e74"; ctx.beginPath(); ctx.moveTo(-8, -1); ctx.quadraticCurveTo(-10, 9, -2, 10); ctx.quadraticCurveTo(4, 9, 5, 1); ctx.quadraticCurveTo(-1, -3, -8, -1); ctx.fill();
    ctx.fillStyle = "#2c3856"; ctx.fillRect(-1, -1, 2, 10); // 前立て
    ctx.strokeStyle = skin; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(-7, 13); ctx.moveTo(2, 9); ctx.lineTo(4, 13); ctx.stroke(); // 後脚
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(7, -1, 6, 4.5, 0, 0, 7); ctx.fill(); // 頭
    ctx.fillStyle = "#1a140c"; ctx.beginPath(); ctx.arc(9, -2, 1.2, 0, 7); ctx.fill();
    // 丸眼鏡(学者)=記録係の証
    ctx.strokeStyle = "#241a12"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(9, -2, 2.6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(11.5, -2); ctx.lineTo(13.5, -1); ctx.stroke();
    ctx.fillStyle = "rgba(205,232,255,.45)"; ctx.beginPath(); ctx.arc(9, -2, 2.1, 0, 7); ctx.fill(); // レンズの光
    ctx.fillStyle = tablet; ctx.fillRect(0, -2, 11, 12); ctx.strokeStyle = "#5f574c"; ctx.lineWidth = 1; ctx.strokeRect(0, -2, 11, 12); // 石板
    const gp = 0.5 + Math.sin(this.time * 2) * 0.3; ctx.strokeStyle = gold; ctx.globalAlpha = gp; ctx.lineWidth = 1;
    for (const ly of [1, 5, 8]) { ctx.beginPath(); ctx.moveTo(2, ly); ctx.lineTo(9, ly); ctx.stroke(); } // 金の刻印(閲覧)
    ctx.globalAlpha = 1;
    ctx.strokeStyle = skinL; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-1, 6); ctx.lineTo(1, 10); ctx.stroke(); // 抱える前足
    ctx.restore();
  },

  // ---------------- Phase6 惑星固有の味方 ----------------
  // 現在の惑星の味方をコロニー側(左)に描画。owned(state.allies)があるときのみ。惑星ごとに描画分岐を足す。
  // ---------------- 特性(Trait)の見た目 — trait_system.md S1(見た目試作・付与なし) ----------------
  // 通常個体は lz.traits を持たない(S1=付与なし)。プレビュー(test-traits.html)が traits 付き個体を描いて見た目を確認する。
  //   魂(骨格)は不変=顔/体に"上乗せ"で描くのみ。データ駆動: TRAITS[key].draw がメソッド名。g=頭部ジオメトリ(scale(face,1)後の局所空間)。
  _paintTraits(ctx, lz, g) {
    for (const t of lz.traits) {
      const def = TRAITS[t && t.key ? t.key : t];
      if (def && def.draw && typeof this[def.draw] === "function") this[def.draw](ctx, g, def);
    }
  },
  // スプライトキャッシュ署名の特性成分。無印/レジェンダリー(徴を描かない)は "" =従来と同一=無印個体のピクセル不変。
  _traitSig(lz) {
    if (lz.morphId === "legendary" || !lz.traits || !lz.traits.length) return "";
    return lz.traits.map((t) => (t && t.key ? t.key : t)).join(",");
  },
  // ミミカクシ: 眼〜頬を仮面状の帯で覆う。地=体色を大きく暗く落とし、上縁に特性色(藍/鈍色)の徴。眼は仮面の穴から覗く。
  traitMimikakushi(ctx, g, def) {
    const { ex, ey, eyeR, col } = g;
    const hw = eyeR * 3.4, hh = eyeR * 2.0;           // 帯の半径(頭軸方向×縦)
    const cx = ex + eyeR * 0.2, cy = ey + eyeR * 0.15; // 眼をやや下寄りに包む中心
    const rot = -0.12;
    ctx.save();
    // 地=体色を暗く落とした帯(仮面)
    ctx.fillStyle = `hsl(${col.h}, ${Math.min(100, col.s + 8)}%, ${Math.max(5, col.l - 42)}%)`;
    ctx.beginPath(); ctx.ellipse(cx, cy, hw, hh, rot, 0, 7); ctx.fill();
    // 特性色(藍)の上縁=仮面の徴(個体の体色上でも特性色が読めるよう一段明るい藍)
    ctx.strokeStyle = def.rim || def.color || "#7c93d4"; ctx.lineWidth = Math.max(1.4, eyeR * 0.7);
    ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.96, hh * 0.96, rot, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    // 眼は穴から覗く(仮面の上へ再スタンプ)
    ctx.fillStyle = "#0d0906";
    ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.92, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.beginPath(); ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.32, eyeR * 0.28, 0, 7); ctx.fill();
    ctx.restore();
  },

  // ネオン(tier1): 手前側の四肢に沿って細い蛍光の線(既存の脚ストロークの上に細い明線=配管ライト)。
  //   legSegs は歩行スイングに追従した実座標=線が脚から剥がれない。暗色種でも蛍光ピンクが浮く。
  traitNeon(ctx, g, def) {
    const { legs, L } = g; if (!legs || !legs.length) return;
    const c = def.rim || "#D957B0";
    ctx.save();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, L * 0.014); ctx.lineCap = "round";
    ctx.shadowColor = c; ctx.shadowBlur = 4; ctx.globalAlpha = 0.92;
    for (const s of legs) { ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke(); }
    ctx.restore();
  },

  // ハクシ(tier1): 体色が抜け落ちた白斑(2大1小)。輪郭Pathでclip=シルエットからはみ出さない。
  //   淡い縁取りで「抜けた」境界を立てる=白っぽい種(アルビノ等)でも判別可。位置は固定(特性の同一性=個体差なし)。
  traitHakushi(ctx, g, def) {
    const { S, body, L } = g; if (!S || !body) return;
    ctx.save(); ctx.clip(body);
    for (const [t, dy, rx, ry, rot] of [[0.56, 0.15, 0.085, 0.058, 0.3], [0.70, -0.1, 0.062, 0.044, -0.2], [0.35, 0, 0.045, 0.032, 0.5]]) {
      const s = S(t), px = s.p.x, py = s.p.y + dy * s.w;
      ctx.globalAlpha = 0.9; ctx.fillStyle = def.rim || "#EFE8DA";
      ctx.beginPath(); ctx.ellipse(px, py, L * rx, L * ry, rot, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = "#b7ab97"; ctx.lineWidth = Math.max(1, L * 0.008);
      ctx.beginPath(); ctx.ellipse(px, py, L * rx, L * ry, rot, 0, 7); ctx.stroke();
    }
    ctx.restore();
  },

  // トライアド(tier2): 背の縁に沿って三連の菱紋(砂金)。背側=S(t)の+n*u側。暗い縁取りで明色種でも沈まない。
  traitTriad(ctx, g, def) {
    const { S, L } = g; if (!S) return;
    const c = def.rim || "#D9A441";
    ctx.save();
    for (const t of [0.52, 0.61, 0.70]) {
      const s = S(t);
      const bx = s.p.x + s.n.x * s.w * 0.42 * s.u, by = s.p.y + s.n.y * s.w * 0.42 * s.u;
      const r = Math.max(2.2, L * 0.032);
      ctx.fillStyle = c; ctx.strokeStyle = "rgba(18,10,4,.65)"; ctx.lineWidth = Math.max(1, L * 0.009);
      ctx.beginPath(); ctx.moveTo(bx, by - r); ctx.lineTo(bx + r * 0.72, by); ctx.lineTo(bx, by + r); ctx.lineTo(bx - r * 0.72, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,250,235,.55)"; // 紋の芯(小さな光)
      ctx.beginPath(); ctx.arc(bx, by - r * 0.25, r * 0.2, 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  // オウゴンヅカ(tier2): 眼のまわりの金の縁取り(二重環+下瞼の小さな金)。顔=頭部ジオメトリのみ使用。
  traitOugon(ctx, g, def) {
    const { ex, ey, eyeR, L } = g;
    const c = def.rim || "#C9A227";
    ctx.save();
    ctx.strokeStyle = "rgba(18,10,4,.6)"; ctx.lineWidth = Math.max(1.6, eyeR * 0.62);
    ctx.beginPath(); ctx.arc(ex, ey, eyeR * 1.75, 0, 7); ctx.stroke(); // 暗い下地(明色種で沈まない)
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.1, eyeR * 0.42);
    ctx.beginPath(); ctx.arc(ex, ey, eyeR * 1.75, 0, 7); ctx.stroke(); // 金環
    ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(0.8, eyeR * 0.22);
    ctx.beginPath(); ctx.arc(ex, ey + eyeR * 0.4, eyeR * 2.45, 0.45, 2.0); ctx.stroke(); // 下瞼へ流れる金線
    ctx.restore();
  },

  // シンカイ(tier2): 体側(尾の付け根〜肩)に生体発光の点列(微グロー)。腹側寄り=クレスト/トライアド(背)と部位が被らない。
  traitShinkai(ctx, g, def) {
    const { S, L } = g; if (!S) return;
    const c = def.rim || "#5FA8C9";
    ctx.save();
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 3;
    for (let i = 0; i < 6; i++) {
      const t = 0.40 + i * 0.072; // 尾の付け根→肩
      const s = S(t);
      const bx = s.p.x - s.n.x * s.w * 0.5 * s.u, by = s.p.y - s.n.y * s.w * 0.5 * s.u; // 腹側の縁近く
      ctx.globalAlpha = 0.9 - (i % 2) * 0.25; // 点の明滅感(静的・交互に淡く)
      ctx.beginPath(); ctx.arc(bx, by - s.w * 0.28, Math.max(1.1, L * 0.013), 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  // ヒョウガ(tier2): 鱗の縁=背の輪郭に沿って霜のように白む(氷水色の縁線+小さな霜の棘)。質感=縁。
  traitHyoga(ctx, g, def) {
    const { S, L } = g; if (!S) return;
    const c = def.rim || "#7FC7DE";
    ctx.save();
    ctx.strokeStyle = c; ctx.globalAlpha = 0.85; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, L * 0.012);
    ctx.beginPath(); // 背の縁をなぞる霜のライン
    for (let i = 0; i <= 12; i++) {
      const s = S(0.44 + i * 0.035);
      const bx = s.p.x + s.n.x * s.w * 0.99 * s.u, by = s.p.y + s.n.y * s.w * 0.99 * s.u;
      i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.fillStyle = "#eaf6fb"; // 霜の粒(白)
    for (let i = 0; i < 5; i++) {
      const s = S(0.47 + i * 0.085);
      const bx = s.p.x + s.n.x * s.w * 0.92 * s.u, by = s.p.y + s.n.y * s.w * 0.92 * s.u;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(0.9, L * 0.009), 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  // ヨウガン(tier3): 背に走る亀裂から熱色が覗く(暗い裂け目+中に熔岩色+微グロー)。手法=裂け目の質感。
  traitYougan(ctx, g, def) {
    const { S, L } = g; if (!S) return;
    const c = def.rim || "#E0533B";
    ctx.save(); ctx.lineCap = "round";
    for (const [t0, len, ang] of [[0.50, 0.11, -0.5], [0.60, 0.14, 0.35], [0.72, 0.09, -0.25]]) {
      const s = S(t0);
      const bx = s.p.x + s.n.x * s.w * 0.5 * s.u, by = s.p.y + s.n.y * s.w * 0.5 * s.u;
      const dx = Math.cos(ang) * L * len, dy = Math.sin(ang) * L * len * 0.4;
      // 暗い裂け目(下地)→中の熱色(細)→芯の明色
      ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(18,8,4,.8)"; ctx.lineWidth = Math.max(1.8, L * 0.02);
      ctx.beginPath(); ctx.moveTo(bx - dx / 2, by - dy / 2); ctx.lineTo(bx - dx * 0.1, by + dy * 0.2); ctx.lineTo(bx + dx / 2, by + dy / 2); ctx.stroke();
      ctx.shadowColor = c; ctx.shadowBlur = 3; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, L * 0.010);
      ctx.beginPath(); ctx.moveTo(bx - dx / 2, by - dy / 2); ctx.lineTo(bx - dx * 0.1, by + dy * 0.2); ctx.lineTo(bx + dx / 2, by + dy / 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.8; ctx.strokeStyle = "#ffb37a"; ctx.lineWidth = Math.max(0.6, L * 0.004);
      ctx.beginPath(); ctx.moveTo(bx - dx * 0.32, by - dy * 0.3); ctx.lineTo(bx - dx * 0.1, by + dy * 0.2); ctx.stroke();
    }
    ctx.restore();
  },

  // アミダグラ(tier3): 胴の体表に幾何学の網目(縦桟+横桟のあみだ紋・輪郭clip)。手法=体表の紋様(面)。
  traitAmidagura(ctx, g, def) {
    const { S, body, L } = g; if (!S || !body) return;
    const c = def.rim || "#9B6BD6";
    ctx.save(); ctx.clip(body);
    ctx.strokeStyle = c; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(0.9, L * 0.008); ctx.lineCap = "round";
    const rails = [];
    for (let i = 0; i < 4; i++) { // 縦桟(背→腹へ)
      const s = S(0.47 + i * 0.09);
      const ax = s.p.x + s.n.x * s.w * 0.8 * s.u, ay = s.p.y + s.n.y * s.w * 0.8 * s.u;
      const bx = s.p.x - s.n.x * s.w * 0.55 * s.u, by = s.p.y - s.n.y * s.w * 0.55 * s.u;
      rails.push([ax, ay, bx, by]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    for (let i = 0; i < 3; i++) { // 横桟(あみだの渡し・互い違い)
      const [a1x, a1y, b1x, b1y] = rails[i], [a2x, a2y, b2x, b2y] = rails[i + 1];
      const k = i % 2 === 0 ? 0.3 : 0.62;
      ctx.beginPath();
      ctx.moveTo(a1x + (b1x - a1x) * k, a1y + (b1y - a1y) * k);
      ctx.lineTo(a2x + (b2x - a2x) * k, a2y + (b2y - a2y) * k);
      ctx.stroke();
    }
    ctx.fillStyle = c; ctx.globalAlpha = 0.95; // 節点の灯
    const [ax, ay, bx, by] = rails[1];
    ctx.beginPath(); ctx.arc(ax + (bx - ax) * 0.3, ay + (by - ay) * 0.3, Math.max(1, L * 0.011), 0, 7); ctx.fill();
    ctx.restore();
  },

  // クロノ(tier4): 尾が秒針めいて分節(真鍮の節輪)+胴に微細な歯車紋1つ。部位=尾(尾のしなり=S(t)に追従)。
  traitChrono(ctx, g, def) {
    const { S, L } = g; if (!S) return;
    const c = def.rim || "#B8955A";
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = c; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) { // 尾の節輪(先端ほど密)
      const t = 0.07 + i * 0.065;
      const s = S(t);
      const ax = s.p.x + s.n.x * s.w * 1.0 * s.u, ay = s.p.y + s.n.y * s.w * 1.0 * s.u;
      const bx = s.p.x - s.n.x * s.w * 1.0 * s.u, by = s.p.y - s.n.y * s.w * 1.0 * s.u;
      ctx.lineWidth = Math.max(0.9, L * (i === 0 ? 0.013 : 0.009)); // 先端の輪は太く=秒針の頭
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    const s = S(0.58); // 胴の歯車紋(小・1つだけ=気配)
    const gx = s.p.x, gy = s.p.y + s.w * 0.05, r = Math.max(2, L * 0.026);
    ctx.lineWidth = Math.max(0.8, L * 0.007);
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.stroke();
    for (let a = 0; a < 6.28; a += Math.PI / 4) {
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
      ctx.lineTo(gx + Math.cos(a) * r * 1.32, gy + Math.sin(a) * r * 1.32); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - r * 0.62); ctx.stroke(); // 針
    ctx.restore();
  },

  drawPlanetAllies(ctx) {
    const st = Game.currentStage && Game.currentStage();
    const a = st && planetAllyOf(st.id);
    if (!a) return;
    const owned = Game.state.allies[a.id];
    if (!owned) return;
    if (a.draw && typeof this[a.draw] === "function") this[a.draw](ctx, owned.lv); // データ駆動(PLANET_ALLIES.draw)
  },
  // Phase6 味方の底上げ(存在感): 個体を(x,y)でk倍に拡大し、輪郭に薄い影(縁/接地)を付けて背景から浮かせる。
  //   fn(ctx)は原点(0,0)で1体を描く。★倍率/縁は SIG_PAL.allyBoost で調整可(Ric実機)。良好な味方(ID6/7/8)は通さない。
  _allyK(name, def) { return (typeof SIG_PAL !== "undefined" && SIG_PAL.allyBoost && SIG_PAL.allyBoost[name]) || def; },
  // Phase7: 視覚スケールの駆動=惑星のTier上限(bossTierFor(rank))に常時連動。襲撃中でなくても味方が育って見える。
  _allyVisTier() {
    const r = (typeof bossTierFor === "function") && bossTierFor(Game.state.rank);
    return (r && r.tier) || 0;
  },
  _allyBoost(ctx, x, y, k, fn) {
    const B = (typeof SIG_PAL !== "undefined" && SIG_PAL.allyBoost) || {};
    const kk = k * (1 + this._allyVisTier() * (CFG.allyVisSizePerTier || 0)); // Phase7: 巨大化(惑星Tierに常時連動)
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y)); ctx.scale(kk, kk);
    ctx.shadowColor = B.edge || "rgba(0,0,0,.5)"; ctx.shadowBlur = B.edgeBlur || 2.6; ctx.shadowOffsetY = 1;
    fn(ctx); // 原点で個体を描く(各_xxxは内部で translate(0,0)+scale(dir,1))
    ctx.restore();
  },
  // 味方の共通配置: コロニー左手前のスポットに頭数を置く。基本=Lvで1-3。Phase7: 惑星Tierで数増(部隊が"ボスに対応"して見える・上限allyVisHeadMax)。
  //   fn(ctx,x,y,dir,i) で1体描く。spotは最大5まで用意(Tier数増の受け皿)。
  _allySquad(ctx, lv, fn) {
    const base = Math.min(3, 1 + Math.floor((lv || 1) / 2));
    const extra = Math.floor(this._allyVisTier() * (CFG.allyVisHeadsPerTier || 0)); // Phase7: 数増
    const spot = [[300, 452], [232, 486], [368, 470], [352, 500], [264, 442]];
    const n = Math.min(CFG.allyVisHeadMax || spot.length, base + extra);
    for (let i = 0; i < n; i++) { const t = this.time * 0.8 + i * 2.1; fn(ctx, spot[i][0] + Math.sin(t) * 8, spot[i][1] - Math.abs(Math.sin(t * 2)) * 2, i % 2 === 0 ? 1 : -1, i); }
  },
  // スナホリ・アルマジロ部隊(ID1): Lv/惑星Tierで頭数が増える。コロニー左手前でのんびり掘る/歩く。
  //   Phase7: 頭数・巨大化は共通ヘルパ(_allySquad/_allyBoost)経由=頭数の知識を一箇所に集約(重複排除)。
  drawArmadilloSquad(ctx, lv) {
    const k = this._allyK("armadillo", 1.24);
    this._allySquad(ctx, lv, (c, x, y, dir) => this._allyBoost(c, x, y, k, () => this.drawArmadillo(c, 0, 0, dir)));
  },
  drawArmadillo(ctx, x, y, dir) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    const shell = "#a58a5f", shellDk = "#6f5a38", skin = "#8a7350";
    // 影
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 11, 21, 5.5, 0, 0, 7); ctx.fill();
    // 脚(前後2対の短い脚)
    ctx.fillStyle = skin;
    for (const lx of [-11, -4, 6, 12]) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, 6, 3.4, 8, 1.5) : ctx.rect(lx, 6, 3.4, 8); ctx.fill(); }
    // 尾(細く後ろへ)
    ctx.strokeStyle = shellDk; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-16, 2); ctx.quadraticCurveTo(-26, 0, -30, -6); ctx.stroke();
    // 甲羅(丸い背)
    ctx.fillStyle = shell; ctx.beginPath(); ctx.ellipse(0, 0, 19, 13, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#b89a6a"; ctx.beginPath(); ctx.ellipse(-2, -2, 15, 10, 0, Math.PI, 0); ctx.fill(); // 上面ハイライト
    // 甲羅のバンド(装甲の帯)
    ctx.strokeStyle = shellDk; ctx.lineWidth = 1.6;
    for (let i = -2; i <= 3; i++) { const bx = i * 5.5; ctx.beginPath(); ctx.moveTo(bx, 1); ctx.lineTo(bx + (i > 0 ? 2 : -2), -12 + Math.abs(i) * 0.6); ctx.stroke(); }
    // 前縁と後縁の帯(頭側・尾側の板)
    ctx.strokeStyle = shellDk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 13, 0, Math.PI * 0.86, Math.PI * 1.14); ctx.stroke();
    // 腹の縁
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 1, 19, 3, 0, 0, Math.PI); ctx.fill();
    // 頭(前=右)+鼻先
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(19, 1, 7, 6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24, -1); ctx.lineTo(30, 1); ctx.lineTo(24, 4); ctx.closePath(); ctx.fill(); // 尖った鼻先
    // 耳
    ctx.fillStyle = shellDk; ctx.beginPath(); ctx.ellipse(17, -6, 2, 4, -0.3, 0, 7); ctx.fill();
    // 目
    ctx.fillStyle = "#241a10"; ctx.beginPath(); ctx.arc(20, 0, 1.3, 0, 7); ctx.fill();
    ctx.restore();
  },

  // ---------------- 蛇(コロニーランクに同期した階級・背骨ベース描画) ----------------
  drawSnake(ctx, raid) {
    const s = raid.snake;
    const tier = raid.snakeTier || snakeTierFor(Game.state.rank);
    const boss = raid.boss;
    const scale = tier.scale * (boss ? 1.35 : 1);
    const lig = boss ? Math.max(12, tier.light - 8) : tier.light;
    const bodyCol = `hsl(${tier.hue},${tier.sat}%,${lig}%)`;
    const darker = `hsl(${tier.hue},${Math.min(100, tier.sat + 10)}%,${Math.max(6, lig - 15)}%)`;
    const belly = `hsl(${tier.hue},${Math.max(0, tier.sat - 22)}%,${Math.min(88, lig + 20)}%)`;
    const outline = "rgba(15,8,4,.6)";

    ctx.save();
    if (raid.shake > 0) { ctx.translate(rnd(-2.5, 2.5), rnd(-2.5, 2.5)); raid.shake = Math.max(0, raid.shake - 0.2); }

    // --- 背骨(頭の後ろから尾先まで) ---
    const segs = 22;
    const segLen = 15 * scale;
    const pts = [], nrm = [], wid = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wave = Math.sin(this.time * 5 + i * 0.62 + s.phase) * 16 * scale * Math.min(1, i / 3);
      pts.push({ x: s.x + 16 * scale + i * segLen, y: s.y + wave });
      const w = (t < 0.15 ? 9 + (t / 0.15) * 5 : t < 0.55 ? 14 : 14 - ((t - 0.55) / 0.45) * 12.5) * scale;
      wid.push(Math.max(1.5, w));
    }
    for (let i = 0; i <= segs; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      nrm.push({ x: -dy / d, y: dx / d });
    }

    // 影
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(s.x + segs * segLen * 0.45, s.y + 24 * scale, segs * segLen * 0.52, 9 * scale, 0, 0, 7);
    ctx.fill();

    // --- 胴体 ---
    const body = new Path2D();
    body.moveTo(pts[0].x, pts[0].y - wid[0]);
    for (let i = 0; i <= segs; i++) body.lineTo(pts[i].x + nrm[i].x * wid[i], pts[i].y + nrm[i].y * wid[i]);
    for (let i = segs; i >= 0; i--) body.lineTo(pts[i].x - nrm[i].x * wid[i], pts[i].y - nrm[i].y * wid[i]);
    body.closePath();
    ctx.fillStyle = bodyCol;
    ctx.fill(body);

    ctx.save();
    ctx.clip(body);
    // 背を暗く・腹を明るく
    ctx.strokeStyle = darker; ctx.globalAlpha = 0.5; ctx.lineWidth = 9 * scale;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) { const m = i ? "lineTo" : "moveTo"; ctx[m](pts[i].x, pts[i].y - wid[i] * 0.55); }
    ctx.stroke();
    ctx.strokeStyle = belly; ctx.globalAlpha = 0.55; ctx.lineWidth = 8 * scale;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) { const m = i ? "lineTo" : "moveTo"; ctx[m](pts[i].x, pts[i].y + wid[i] * 0.55); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 菱形の鱗模様
    ctx.fillStyle = darker;
    for (let i = 1; i < segs; i += 2) {
      const p = pts[i], w = wid[i];
      ctx.beginPath();
      ctx.moveTo(p.x - segLen * 0.55, p.y);
      ctx.lineTo(p.x, p.y - w * 0.72);
      ctx.lineTo(p.x + segLen * 0.55, p.y);
      ctx.lineTo(p.x, p.y + w * 0.72);
      ctx.closePath(); ctx.fill();
    }
    // 鱗の粒感
    const srand = lcg(99);
    for (let i = 0; i < 40; i++) {
      const p = pts[Math.floor(srand() * segs)];
      ctx.fillStyle = srand() < 0.5 ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.12)";
      ctx.beginPath();
      ctx.arc(p.x + (srand() * 2 - 1) * segLen, p.y + (srand() * 2 - 1) * wid[5] * 0.7, 1 + srand() * 2 * scale, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = outline; ctx.lineWidth = 2;
    ctx.stroke(body);

    // --- 頭(くさび形・毒蛇の顎) ---
    const hx = s.x, hy = s.y;
    ctx.fillStyle = bodyCol; ctx.strokeStyle = outline; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(hx - 26 * scale, hy + 1 * scale);            // 鼻先
    ctx.quadraticCurveTo(hx - 20 * scale, hy - 12 * scale, hx - 2 * scale, hy - 13 * scale); // 上顎ライン
    ctx.quadraticCurveTo(hx + 18 * scale, hy - 12 * scale, hx + 20 * scale, hy);             // 後頭部(えらの張り)
    ctx.quadraticCurveTo(hx + 16 * scale, hy + 13 * scale, hx - 4 * scale, hy + 12 * scale); // 顎の下
    ctx.quadraticCurveTo(hx - 22 * scale, hy + 9 * scale, hx - 26 * scale, hy + 1 * scale);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 頭頂の暗い模様
    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.moveTo(hx - 14 * scale, hy - 8 * scale);
    ctx.quadraticCurveTo(hx, hy - 13 * scale, hx + 14 * scale, hy - 7 * scale);
    ctx.quadraticCurveTo(hx + 2 * scale, hy - 3 * scale, hx - 14 * scale, hy - 8 * scale);
    ctx.fill();
    // 口のライン
    ctx.strokeStyle = "rgba(15,8,4,.55)"; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - 25 * scale, hy + 3 * scale);
    ctx.quadraticCurveTo(hx - 6 * scale, hy + 8 * scale, hx + 12 * scale, hy + 6 * scale);
    ctx.stroke();
    // 目(スリット瞳・ボスは赤)
    ctx.fillStyle = boss ? "#ff5540" : "#ffcc44";
    ctx.beginPath(); ctx.arc(hx - 9 * scale, hy - 5 * scale, 4.2 * scale, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(15,8,4,.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx - 9 * scale, hy - 5 * scale, 4.2 * scale, 0, 7); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(hx - 9 * scale, hy - 5 * scale, 1.2 * scale, 3.6 * scale, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.beginPath(); ctx.arc(hx - 10 * scale, hy - 7 * scale, 1 * scale, 0, 7); ctx.fill();
    // 鼻孔
    ctx.fillStyle = "rgba(15,8,4,.6)";
    ctx.beginPath(); ctx.arc(hx - 21 * scale, hy - 2 * scale, 1.1 * scale, 0, 7); ctx.fill();
    // 舌(チロチロ)
    if (Math.sin(this.time * 6) > 0.3) {
      ctx.strokeStyle = "#e05555"; ctx.lineWidth = 2.2 * scale; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hx - 26 * scale, hy + 2 * scale);
      ctx.lineTo(hx - 40 * scale, hy - 2 * scale);
      ctx.moveTo(hx - 33 * scale, hy);
      ctx.lineTo(hx - 40 * scale, hy + 5 * scale);
      ctx.stroke();
    }

    // HPバー・階級名・残り時間はDOMのボスHUD(§3.3)へ移設
    ctx.restore();
  },

  centerLabel(ctx, txt, x, y, bg, fg) {
    const w = ctx.measureText(txt).width + 22;
    ctx.fillStyle = bg;
    rr(ctx, x - w / 2, y - 17, w, 26, 13); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = "center";
    ctx.fillText(txt, x, y + 2);
  },

  drawPopups(ctx) {
    ctx.textAlign = "center";
    for (const p of Game.popups) {
      ctx.globalAlpha = clamp(p.ttl, 0, 1);
      if (p.big) {
        // 重いダメージ数値(Brushup V2 §3.3): 大きく出て弾んで着地
        const age = 1.2 - p.ttl;
        const pop = 1 + Math.max(0, 0.5 - age) * 0.9;
        ctx.font = p.small ? `10px sans-serif` : `bold ${Math.round(26 * pop)}px sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillText(p.txt, p.x + 2, p.y + 2);
      } else {
        // small=オート給餌のLvアップ(控えめ表示・CFGでpx調整可)。手動(small無し)は17px固定
        const fs = p.small ? (CFG.autoFeedLevelPopSize || 10) : 17;
        const sh = p.small ? 1 : 1.5;
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillText(p.txt, p.x + sh, p.y + sh);
      }
      ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  },

  // §9.1 切り離された尾: 地面でくねって捕食者の注意を引き、やがて動きを止めて消える(自切の生物的正しさ)
  drawAutotomyTails(ctx) {
    const tails = Game._autoTails; if (!tails || !tails.length) return;
    for (const T of tails) {
      const k = T.t / T.max;                 // 1→0
      const alpha = k > 0.75 ? (1 - k) / 0.25 : Math.min(1, k / 0.2 + 0.2); // 出現→保持→フェード
      const wig = Math.min(1, k * 1.4);      // 残り少ないほどくねりが弱まる(死んでいく)
      const seg = 7, len = 34, hue = T.hue;
      const bodyCol = (T.morphId === "albino") ? "hsl(40,12%,82%)" : (T.morphId === "melanistic") ? `hsl(${hue},20%,18%)` : `hsl(${hue},${T.sat}%,${T.light}%)`;
      const darkCol = (T.morphId === "albino") ? "hsl(40,10%,62%)" : `hsl(${hue},${Math.min(100, T.sat + 5)}%,${Math.max(8, T.light - 18)}%)`;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      // 影
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(T.x, T.y + 4, len * 0.5, 4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = bodyCol; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let s = 0; s <= seg; s++) {
        const u = s / seg;                   // 0=切断面, 1=尾先
        const bend = Math.sin(this.time * 9 - u * 5 + T.seed) * (len * 0.16) * wig * u; // 尾先ほど大きくくねる
        const px = T.x - u * len, py = T.y + bend;
        ctx.lineWidth = (1 - u) * 7 + 1.5;   // 切断面が太く尾先が細い
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // 切断面の赤み(生々しさ・控えめ)
      ctx.fillStyle = "rgba(150,40,30,.5)"; ctx.beginPath(); ctx.arc(T.x, T.y, 3, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // §9-C2 登場エフェクト: 誕生位置に広がるリング+昇るきらめき(どこで生まれたかを位置で伝える。big=伝説/創始者)
  drawSpawnFx(ctx) {
    const fx = Game._spawnFx; if (!fx || !fx.length) return;
    for (const F of fx) {
      const k = 1 - F.t / F.max, alpha = 1 - k;      // k: 0→1
      const R = (F.big ? 48 : 30) * (0.3 + k * 1.1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * 0.8;    // 広がるリング
      ctx.strokeStyle = `hsl(${F.hue},80%,66%)`; ctx.lineWidth = (F.big ? 4 : 2.5) * (1 - k * 0.6);
      ctx.beginPath(); ctx.ellipse(F.x, F.y, R, R * 0.5, 0, 0, 7); ctx.stroke();
      if (F.big) { ctx.strokeStyle = `hsl(${(F.hue + 40) % 360},80%,70%)`; ctx.beginPath(); ctx.ellipse(F.x, F.y, R * 0.68, R * 0.34, 0, 0, 7); ctx.stroke(); }
      const n = F.big ? 9 : 5, rr2 = lcg((F.seed | 0) + 1); // 昇るきらめき
      ctx.globalAlpha = Math.max(0, alpha);
      for (let i = 0; i < n; i++) { const a = rr2() * 6.28, d = R * (0.3 + rr2() * 0.6); const sx = F.x + Math.cos(a) * d, sy = F.y + Math.sin(a) * d * 0.5 - k * (F.big ? 40 : 22); ctx.fillStyle = `hsl(${(F.hue + rr2() * 60) | 0},85%,72%)`; ctx.beginPath(); ctx.arc(sx, sy, (F.big ? 2.7 : 1.8) * (1 - k * 0.5), 0, 7); ctx.fill(); }
      ctx.globalAlpha = Math.max(0, alpha) * (1 - k); // 中心の輝き
      ctx.fillStyle = "rgba(255,255,240,.9)"; ctx.beginPath(); ctx.arc(F.x, F.y - k * 10, (F.big ? 4.5 : 2.6) * (1 - k), 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // S5 創世エフェクト(賢者の石の錬成)。虹の祝祭(drawSpawnFx)とは別種=深紅・静・重。
  //   深紅リングが外→中心へ収縮(光を吸う)→中心が暗転(--stone-deep)→定着の一閃。個体周囲のみ・全画面を奪わない(§9)。
  //   reduced-motion=描かない=即時定着(徴は genesisTrait で既に付与済=結果保証)。色は賢者の石トークン(tokens.css)と一致。
  drawGenesisFx(ctx) {
    const fx = Game._genesisFx; if (!fx || !fx.length) return;
    if (typeof window !== "undefined" && window.Motion && Motion.reduced) return; // 即時定着
    const HI = "#8E1826", MID = "#380A12", DEEP = "#070103"; // 深紅 / 暗紅 / ほぼ黒(光を吸う)
    for (const F of fx) {
      const k = 1 - F.t / F.max; // 0→1
      ctx.save();
      // 深紅リングが外→中心へ収縮(吸い込む)。k~0.18で一度だけ脈動。
      const R = 46 * (1 - k) + 6;
      const pulse = Math.exp(-Math.pow((k - 0.18) / 0.12, 2));
      ctx.globalAlpha = Math.max(0, 0.85 * (1 - k) + 0.5 * pulse);
      ctx.strokeStyle = HI; ctx.lineWidth = 2.2 + pulse * 3.5;
      ctx.beginPath(); ctx.ellipse(F.x, F.y - 4, R, R * 0.6, 0, 0, 7); ctx.stroke();
      // 内側の暗紅リング
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - k));
      ctx.strokeStyle = MID; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(F.x, F.y - 4, R * 0.6, R * 0.36, 0, 0, 7); ctx.stroke();
      // 中心が"光を吸う"暗転コア: k中盤でピーク→フェード。
      const dark = Math.sin(Math.min(1, k / 0.85) * Math.PI);
      ctx.globalAlpha = Math.max(0, dark * 0.72);
      const g = ctx.createRadialGradient(F.x, F.y - 4, 1, F.x, F.y - 4, 34);
      g.addColorStop(0, DEEP); g.addColorStop(0.6, MID); g.addColorStop(1, "rgba(7,1,3,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(F.x, F.y - 4, 30, 20, 0, 0, 7); ctx.fill();
      // 定着の一閃(深紅がスッと引く)
      if (k > 0.78) { ctx.globalAlpha = Math.max(0, (1 - k) / 0.22 * 0.6); ctx.strokeStyle = HI; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(F.x, F.y - 4, 14, 9, 0, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.3)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
};

// 角丸矩形(roundRect非対応環境のフォールバック)
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// トカゲの体幅プロファイル (t=0 尾先 → t=1 鼻先、全長比)
// 横向きトカゲの背骨キーポイント [t, x, y, 半幅] (体格L比 / 地面が y=0、上が負)
// 参照写真のポーズ: 尾先は高く跳ね上がり、頭は誇らしげに持ち上がる
const LIZ_SIDE_KEYS = [
  [0.00, -0.80, -0.44, 0.004], // 尾先(高く上がる)
  [0.10, -0.73, -0.28, 0.012],
  [0.22, -0.61, -0.13, 0.022], // 尾の下りカーブ
  [0.34, -0.43, -0.08, 0.034], // 尾の最下点
  [0.45, -0.22, -0.105, 0.052], // 尾の付け根
  [0.56, -0.06, -0.15, 0.082],  // 腰
  [0.66, 0.08, -0.175, 0.094],  // 胸(最も深い)
  [0.76, 0.20, -0.21, 0.072],   // 肩
  [0.84, 0.28, -0.295, 0.047],  // 立ち上がる首
  [0.90, 0.34, -0.36, 0.042],   // 後頭部
  [0.95, 0.40, -0.378, 0.030],  // 頭
  [1.00, 0.485, -0.368, 0.008], // 鼻先
];
function lizSideSample(t) {
  for (let i = 1; i < LIZ_SIDE_KEYS.length; i++) {
    const a = LIZ_SIDE_KEYS[i - 1], b = LIZ_SIDE_KEYS[i];
    if (t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      return {
        x: a[1] + (b[1] - a[1]) * k,
        y: a[2] + (b[2] - a[2]) * k,
        w: a[3] + (b[3] - a[3]) * k,
      };
    }
  }
  const e = LIZ_SIDE_KEYS[LIZ_SIDE_KEYS.length - 1];
  return { x: e[1], y: e[2], w: e[3] };
}

// 固定シード乱数(背景デコ用)
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// #rrggbb → rgba
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- SVG化スプリント: Canvas用ステータスグリフ(絵文字の代替・§9) ----
Object.assign(Render, {
  glyphCrown(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f2c65e";
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s * 1.1, -s * 0.4); ctx.lineTo(-s * 0.45, s * 0.05);
    ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.45, s * 0.05); ctx.lineTo(s * 1.1, -s * 0.4);
    ctx.lineTo(s, s * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  glyphSkull(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#c07ae0";
    ctx.beginPath(); ctx.arc(0, -s * 0.15, s, 0, 7); ctx.fill();
    ctx.fillRect(-s * 0.55, s * 0.3, s * 1.1, s * 0.55);
    ctx.fillStyle = "#241812";
    ctx.beginPath(); ctx.arc(-s * 0.38, -s * 0.2, s * 0.26, 0, 7); ctx.arc(s * 0.38, -s * 0.2, s * 0.26, 0, 7); ctx.fill();
    ctx.restore();
  },
  glyphCross(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f28066";
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const w = s * 0.42;
    ctx.rect(-w / 2, -s, w, s * 2);
    ctx.rect(-s, -w / 2, s * 2, w);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
});
