"use strict";
// =============================================================
// weather — 動的環境演出(天候)【ルール層+描画ヘルパ・W1】
// 骨格=天候システム1つ / 意匠=惑星別、の型(クランク・ルーレット盤・背景・設備・敵味方・四重スリットと同じ)。
//
// 【安全境界】表示層のみ。経済・生産・繁殖・戦闘・確率・純血・魂・セーブに一切触れない。
//   背景アセットは非改変(paintBackgroundのキャッシュには手を入れず、上乗せで描くだけ)。
//
// 【サイクル】発生→継続→終息の3相。常時降らせない=「時々起きるイベント」。
//   決定論: 乱数を使わず「経過時間バケット + 惑星id」のハッシュで発生を決める。同一条件で同一の天候が再現される。
//   bucket = floor(clock / weatherCycleSec) ごとに、hash(stageId,bucket) < weatherChance なら その周期に天候が1回起きる。
//   周期内の開始位置もハッシュで決まる。強度k(0..1)は rise→hold→fall の包絡線。
//
// 【D7環境粒子との棲み分け】D7=常時の薄い装飾 / 天候=イベント。二重に降らせない。
//   天候中(k>0)は D7 を k に比例して減衰させ、最盛時(k=1)は完全に停止する(Render.drawDriftMotes 側で抑制)。
// =============================================================

const Weather = {
  // 決定論ハッシュ(fmix32・0..1)
  h(a, b) {
    let t = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B)) >>> 0;
    t ^= t >>> 15; t = Math.imul(t, 0x2545F491); t ^= t >>> 13; t ^= t >>> 16;
    return (t >>> 0) / 4294967296;
  },

  // 惑星の天候意匠(既定にマージ)。未定義の惑星は天候なし
  def(stageId) {
    const C = typeof CFG !== "undefined" ? CFG : {};
    const by = C.weatherByStage || {};
    if (!by[stageId]) return null;
    return Object.assign({}, C.weatherDefault || {}, by[stageId]);
  },

  // 現在の天候状態。clock=Game._motClock 相当(表示クロック・保存しない)
  now(stageId, clock) {
    const C = typeof CFG !== "undefined" ? CFG : {};
    const off = { on: false, k: 0, phase: "none", def: null };
    if (C.weatherOn === false) return off;
    const d = this.def(stageId);
    if (!d) return off;
    const cyc = C.weatherCycleSec || 150;
    const rise = C.weatherRiseSec || 6, hold = C.weatherHoldSec || 20, fall = C.weatherFallSec || 8;
    const total = rise + hold + fall;
    const bucket = Math.floor((clock || 0) / cyc);
    const chance = d.chance != null ? d.chance : (C.weatherChance != null ? C.weatherChance : 0.35);
    if (this.h(stageId * 131 + 7, bucket) >= chance) return off;
    const start = this.h(stageId * 977 + 31, bucket) * Math.max(0, cyc - total);
    const tt = (clock || 0) - bucket * cyc - start;
    if (tt < 0 || tt > total) return off;
    let k, phase;
    if (tt < rise) { k = tt / rise; phase = "rise"; }
    else if (tt < rise + hold) { k = 1; phase = "hold"; }
    else { k = 1 - (tt - rise - hold) / fall; phase = "fall"; }
    k = Math.max(0, Math.min(1, k)) * (d.str != null ? d.str : 1);
    return { on: k > 0.001, k: k, phase: phase, def: d, t: tt, bucket: bucket };
  },

  // ---- 描画1: 光量と色味 + 遠景の霞(背景の直後・生き物より奥) ----
  //   背景アセットは非改変。ベタの上乗せのみ(層ごとに減衰=遠景ほど濃い霞)
  drawSky(ctx, W, H, wx, y1, y2) {
    if (!wx || !wx.on) return;
    const d = wx.def, k = wx.k;
    const t = d.tint;
    if (t) { ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${(t[3] || 0.2) * k})`; ctx.fillRect(0, 0, W, H); }
    const hz = d.haze || 0;
    if (hz > 0) { // 遠景の霞: 上(奥)ほど濃く、手前へ向かって段で薄める=層ごとの減衰
      const c = d.hazeCol || t || [200, 200, 210, 1];
      const bands = 4;
      for (let i = 0; i < bands; i++) {
        const a = hz * k * (1 - i / bands);
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
        ctx.fillRect(0, y1 - 40 + (y2 - y1 + 40) * i / bands, W, (y2 - y1 + 40) / bands + 1);
      }
    }
  },

  // ---- 描画2: 粒子(生き物の上・D7と同じ層) ----
  //   決定論: 位置は「粒index+時刻」の純関数。粒子数は CFG.weatherMaxParticles を超えない。
  drawParticles(ctx, W, H, time, wx, y1, y2) {
    if (!wx || !wx.on) return 0;
    if (typeof Motion !== "undefined" && Motion.reduced) return 0; // reduced: 粒子と風は完全停止
    const C = typeof CFG !== "undefined" ? CFG : {};
    const d = wx.def, k = wx.k;
    const cap = C.weatherMaxParticles || 90;
    const n = Math.min(cap, Math.round((d.n || 40) * k));
    if (n <= 0) return 0;
    // 風: 基本風 + 時間でうねる(強弱の時間変化)
    const wind = (d.vx || 0) + Math.sin(time / (d.windSec || 7) * 6.283) * (d.windAmp || 0) * k;
    const shape = d.shape || "dot";
    const top = y1 - 60, hgt = (y2 + 40) - top;
    ctx.save();
    ctx.globalAlpha = (d.alpha != null ? d.alpha : 0.5) * k;
    ctx.fillStyle = d.col || "rgba(230,230,235,1)";
    for (let i = 0; i < n; i++) {
      const sx = this.h(i, 11), sy = this.h(i, 23), sz = this.h(i, 37);
      const sp = (d.vy || 120) * (0.65 + sz * 0.7);
      // 縦方向は落下(気泡は上昇=vy負)。横は風。どちらも周期で巻き戻す=途切れない流れ
      let y = top + (((sy * hgt + time * sp) % hgt) + hgt) % hgt;
      let x = (((sx * W + time * wind * (0.6 + sz * 0.8)) % (W + 80)) + (W + 80)) % (W + 80) - 40;
      const r = (d.rMin || 1) + sz * ((d.rMax || 2) - (d.rMin || 1));
      if (shape === "line") {           // 雨: 風向きに傾いた短い線分(塗りの細長い矩形)
        const len = (d.len || 12) * (0.7 + sz * 0.6);
        const tilt = wind / Math.max(40, Math.abs(sp)) * len;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tilt, y + len); ctx.lineTo(x + tilt + r, y + len); ctx.lineTo(x + r, y);
        ctx.closePath(); ctx.fill();
      } else if (shape === "flake") {   // 雪: 小さな四角(回転させず=軽い)
        ctx.fillRect(x, y, r * 1.6, r * 1.6);
      } else if (shape === "bubble") {  // 気泡: 輪でなく塗りの円(小)+わずかな横揺れ
        const wob = Math.sin(time * 1.6 + i) * 4;
        ctx.beginPath(); ctx.arc(x + wob, y, r, 0, 7); ctx.fill();
      } else if (shape === "beam") {    // 光の柱/木漏れ日: 斜めの太い帯(粒子ではなく光条)
        const bw = (d.beamW || 26) * (0.6 + sz);
        const bx = sx * W + Math.sin(time * 0.12 + i) * 18;
        ctx.globalAlpha = (d.alpha != null ? d.alpha : 0.5) * k * (0.45 + 0.55 * sz);
        ctx.beginPath();
        ctx.moveTo(bx, top); ctx.lineTo(bx + bw, top);
        ctx.lineTo(bx + bw + (d.beamSkew || 60), y2 + 40); ctx.lineTo(bx + (d.beamSkew || 60), y2 + 40);
        ctx.closePath(); ctx.fill();
      } else {                          // 砂/灰/埃: 小さな点
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      if (d.emberEvery && i % d.emberEvery === 0) { // 火の粉(差し色・少数)
        const sa = ctx.globalAlpha, sf = ctx.fillStyle;
        ctx.globalAlpha = sa * (0.5 + 0.5 * Math.sin(time * 3 + i));
        ctx.fillStyle = d.emberCol || "rgba(255,150,60,1)";
        ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, 7); ctx.fill();
        ctx.globalAlpha = sa; ctx.fillStyle = sf;
      }
    }
    ctx.restore();
    return n;
  },

  // ---- モーション接続の判定(game.js から呼ぶ・読み取り専用) ----
  react(wx, key) {
    if (!wx || !wx.on || !wx.def) return 0;
    const r = wx.def.react || {};
    return (r[key] || 0) * wx.k;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Weather };
