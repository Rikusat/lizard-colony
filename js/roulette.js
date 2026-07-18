"use strict";
// =============================================================
// roulette — 遺伝子ルーレット【ルール層】(roulette.md §7 v3.1・物理決定型パチンコ)
// 決定論・単一シード窓口・DOM非依存=node単体検証(モンテカルロ)可能。
// v3.1: 結果を先に決めない。重力/釘衝突/反発の物理そのものが着地位置を決め、
//   着地xで3分岐(景品穴→卵 / 虹穴→大当たり / どちらでもない→ハズレ)。
//   固定dtアキュムレータ積分でフレーム非依存=同一シード+同一発射列=同一結果。
//   乱数(初速ばらつき・衝突ジッタ)は全て単一窓口 _rng(mulberry32) 経由。
//   入賞時のみ onEgg({gene,rainbow}) を発火(ハズレは発火なし=球とは別・§7.5)。
// 表現層(js/ui/screens/roulette.js)はルール層の実(x,y)/釘/穴をそのまま描くだけ。
// =============================================================

const Roulette = {
  balls: [],       // {id,x,y,vx,vy,r,gene,phase}
  nails: [],       // {x,y,r} 固定(reset時に構築)
  events: [],      // 表現層がdrainする(BallEmitted/BallLanded/BallWin/BallRainbow)
  onEgg: null,     // 入賞時の卵生成コールバック(boot時にGameが設定)
  _seed: 0,
  _rng: null,
  _idSeq: 1,
  _acc: 0,         // 固定dt積分のアキュムレータ
  _emitAcc: 0,     // オート発射間隔のアキュムレータ

  // 単一乱数窓口: mulberry32(決定論PRNG)
  setSeed(n) {
    this._seed = n >>> 0;
    let a = this._seed;
    this._rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return this;
  },
  getSeed() { return this._seed; },
  _rand(min, max) { return min + (this._rng() * (max - min)); },

  reset(seed) {
    this.balls.length = 0;
    this.events.length = 0;
    this._idSeq = 1;
    this._acc = 0;
    this._emitAcc = 0;
    this.setSeed(seed == null ? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) : seed);
    this.buildNails();
    return this;
  },

  // 釘(千鳥格子)＋虹穴の真上の振り分け釘。位置は固定=決定論に影響しない
  buildNails() {
    const W = CFG.roulW, H = CFG.roulH;
    const top = CFG.roulNailTopf * H, bot = CFG.roulNailBotf * H;
    const mL = CFG.roulNailMarginf * W, mR = W - CFG.roulNailMarginf * W;
    const rows = CFG.roulNailRows, cols = CFG.roulNailCols;
    const nails = [];
    const rowGap = (bot - top) / (rows - 1);
    const colGap = (mR - mL) / (cols - 1);
    for (let r = 0; r < rows; r++) {
      const y = top + r * rowGap;
      const stagger = (r % 2 === 1) ? colGap * 0.5 : 0; // 奇数行を半ピッチずらす=千鳥
      for (let c = 0; c < cols; c++) {
        let x = mL + c * colGap + stagger;
        if (x > mR + 0.1) continue; // ずらしで右端を超えた分は省く
        nails.push({ x, y, r: CFG.roulNailR });
      }
    }
    // 虹穴の真上に振り分け釘(球を左右へ弾き、ニアミスを多発させる=#設計1)
    if (CFG.roulSplitNailAbove) {
      nails.push({ x: CFG.roulHoleCenterf * W, y: bot + (H * CFG.roulLandYf - bot) * 0.45, r: CFG.roulNailR });
    }
    this.nails = nails;
    return nails;
  },

  // 球を1発発射(給餌トリガー)。結果は決めない。geneは卵の内容(代表個体の遺伝)
  emit(gene) {
    if (!this._rng) this.reset();
    if (this.balls.length >= CFG.roulMaxBalls) this.balls.shift();
    const W = CFG.roulW;
    const x = CFG.roulLaunchXf * W + this._rand(-1, 1) * CFG.roulLaunchXJitf * W;
    const b = {
      id: this._idSeq++, x, y: 0,
      vx: this._rand(-1, 1) * CFG.roulInitVxJit, vy: CFG.roulInitVy,
      r: CFG.roulBallR, gene: gene || null, phase: "rail",
    };
    this.balls.push(b);
    this.events.push({ type: "BallEmitted", id: b.id });
    return b;
  },

  // オート給餌中の一定間隔発射(§1.2)。dt秒経過ぶんを溜め、間隔ごとにemit
  autoEmit(dt, gene) {
    if (!this._rng) this.reset();
    this._emitAcc += dt;
    let n = 0;
    while (this._emitAcc >= CFG.roulEmitInterval) {
      this._emitAcc -= CFG.roulEmitInterval;
      this.emit(gene);
      n++;
    }
    return n;
  },
  resetEmitClock() { this._emitAcc = 0; }, // オートOFF時に呼ぶ(溜まりを流さない)

  // 実dtを固定dtで積分(フレーム非依存=決定論)。大ラグは上限クランプ
  advance(realDt) {
    if (!this._rng) this.reset();
    this._acc += Math.min(realDt, 0.1);
    const fdt = CFG.roulFixedDt;
    let guard = 0;
    while (this._acc >= fdt && guard < 240) { this._step(fdt); this._acc -= fdt; guard++; }
  },

  _step(dt) {
    const W = CFG.roulW, H = CFG.roulH;
    const railEndY = CFG.roulRailEndYf * H, landY = CFG.roulLandYf * H;
    const balls = this.balls, nails = this.nails;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.vy += CFG.roulGravity * dt; // 重力(自由落下は加速)
      if (b.y < railEndY) {
        // レール区間: 中央へ緩く寄せつつ加速(導入部)。釘には当たらない
        b.phase = "rail";
        const target = CFG.roulHoleCenterf * W;
        b.vx += (target - b.x) * 2.2 * dt; // レールが導く
        b.vx *= 0.96;                        // レール摩擦
      } else {
        b.phase = "fall"; // フリーフォール+釘
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // 左右壁
      if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * CFG.roulWallRestitution; }
      else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx * CFG.roulWallRestitution; }
      // 釘衝突(フリーフォール中のみ)
      if (b.phase === "fall") {
        for (let k = 0; k < nails.length; k++) {
          const n = nails[k];
          const dx = b.x - n.x, dy = b.y - n.y;
          const rr = b.r + n.r, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.0001;
            const nx = dx / d, ny = dy / d;
            b.x = n.x + nx * rr; b.y = n.y + ny * rr; // 押し出し
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              const e = CFG.roulRestitution;
              b.vx -= (1 + e) * vn * nx;
              b.vy -= (1 + e) * vn * ny;
              // 接線方向へ微小ジッタ(カオスの源・単一シード)
              const j = this._rand(-CFG.roulNailJit, CFG.roulNailJit);
              b.vx += -ny * j; b.vy += nx * j;
            }
          }
        }
      }
      // 着地判定
      if (b.y >= landY) { this._resolveLanding(b); balls.splice(i, 1); }
    }
  },

  // 着地xで3分岐(§1.4)。入賞時のみ onEgg。ハズレは何もしない
  _resolveLanding(b) {
    const W = CFG.roulW;
    const dx = Math.abs(b.x - CFG.roulHoleCenterf * W);
    let rainbow = false, win = false;
    if (dx <= CFG.roulRainbowHalfWf * W) { rainbow = true; win = true; }       // 中央極細=大当たり
    else if (dx <= CFG.roulPrizeOuterf * W) { win = true; }                     // その外側の帯=景品(卵)
    // それ以外=ハズレ(球は消える)
    this.events.push({ type: "BallLanded", x: b.x, rainbow, win });
    if (win) {
      this.events.push({ type: rainbow ? "BallRainbow" : "BallWin", x: b.x });
      if (this.onEgg) this.onEgg({ gene: b.gene, rainbow });
    }
    return { win, rainbow };
  },

  drainEvents() {
    const ev = this.events.slice();
    this.events.length = 0;
    return ev;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { Roulette };
