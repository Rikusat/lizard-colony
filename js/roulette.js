"use strict";
// =============================================================
// roulette — 遺伝子ルーレット【ルール層】(roulette.md §7)
// 決定論的な物理シミュレーション。固定タイムステップ+単一シード乱数窓口で駆動し、
// エンジン(DOM/Canvas/時刻)に依存しない=node単体検証可能。
// 表現層(js/ui/screens/roulette.js)はこのstateを毎フレーム描くだけ。結果を計算しない。
// K.1段階1: 器+球放出+重力物理(壁反射)。衝突/レーン2/卵は後続段階。
// =============================================================

const Roulette = {
  balls: [],
  events: [],      // 表現層がdrainするイベントキュー(BallEmitted等)
  _seed: 0,
  _rng: null,
  _acc: 0,         // 固定ステップのアキュムレータ
  _idSeq: 1,
  _t: 0,           // シム内経過時間(決定論・実時刻非依存)

  // 単一乱数窓口: mulberry32(決定論PRNG)。シム内の全乱数はここのみ経由
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
    this._acc = 0; this._idSeq = 1; this._t = 0;
    this.setSeed(seed == null ? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) : seed);
    return this;
  },

  // 給餌1回=遺伝子球1個を左下から放出。geneは色/遺伝(表現・後続の卵抽選用)
  emit(gene) {
    if (this.balls.length >= CFG.roulMaxBalls) this.balls.shift(); // 上限=最古を退避
    const ang = (CFG.roulEmitAngle + this._rand(-CFG.roulEmitAngleVar, CFG.roulEmitAngleVar)) * Math.PI / 180;
    const sp = CFG.roulEmitSpeed * (1 + this._rand(-CFG.roulEmitSpeedVar, CFG.roulEmitSpeedVar));
    const b = {
      id: this._idSeq++,
      x: CFG.roulW * CFG.roulEmitX,
      y: CFG.roulH * CFG.roulEmitY,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: CFG.roulBallR,
      gene: gene || null,
      age: 0,
    };
    this.balls.push(b);
    this.events.push({ type: "BallEmitted", id: b.id });
    return b;
  },

  // 実dtを固定ステップに刻んで進める(フレームレート非依存=決定論)
  advance(realDt) {
    if (!this._rng) this.reset();
    this._acc += Math.min(realDt, 0.1); // 大ラグは上限クランプ(暴走防止)
    let guard = 0;
    while (this._acc >= CFG.roulDt && guard < 20) {
      this._step(CFG.roulDt);
      this._acc -= CFG.roulDt;
      guard++;
    }
    if (guard >= 20) this._acc = 0; // 追いつけない時は捨てる
  },

  _step(dt) {
    this._t += dt;
    const W = CFG.roulW, H = CFG.roulH, e = CFG.roulRestitution, damp = CFG.roulWallDamp;
    const balls = this.balls;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.age += dt;
      b.vy += CFG.roulGravity * dt;      // 重力
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // 壁反射(左右・上・床)。床は後続でレーン2/穴に置換
      if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * e; b.vy *= damp; }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx * e; b.vy *= damp; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * e; b.vx *= damp; }
      else if (b.y + b.r > H) { b.y = H - b.r; b.vy = -b.vy * e; b.vx *= damp; }
      // 寿命切れは掃除(着地システムは後続段階)
      if (b.age >= CFG.roulBallTtl) { balls.splice(i, 1); }
    }
  },

  // 表現層がイベントを取り出す(drain)
  drainEvents() {
    const ev = this.events.slice();
    this.events.length = 0;
    return ev;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { Roulette };
