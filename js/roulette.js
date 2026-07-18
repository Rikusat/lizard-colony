"use strict";
// =============================================================
// roulette — 遺伝子ルーレット【ルール層】(roulette.md §7・v2パチンコ方式)
// 決定論・単一シード窓口・DOM非依存=node単体検証可能。
// v2: 物理シム(重力/衝突)を撤回し、パラメトリック軌道(進行度p)+各球独立抽選(0.5%)。
//   - 発射: 給餌1回=球1発。emit時に結果を確定(rainbow)=スクラッチカード式。
//   - 進行: 速度/重力を持たず age→p(線形)。減速(焦らし)は表現層のy(p)easingで作る。
//   - 到達(p>=1): onEggで卵生成。抽選・軌道乱数は単一シード窓口(_rng)経由。
// 表現層(js/ui/screens/roulette.js)は b.p を軌道パスへ写像して描くだけ。結果は計算しない。
// =============================================================

const Roulette = {
  balls: [],
  events: [],      // 表現層がdrainするイベント(BallEmitted/BallLanded/BallEnteredRainbow)
  onEgg: null,     // 卵生成の注入コールバック(ルール純度保持・boot時にGameが設定)
  _seed: 0,
  _rng: null,
  _idSeq: 1,

  // 単一乱数窓口: mulberry32(決定論PRNG)。抽選・軌道ばらつきは全てここのみ経由
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
    this.setSeed(seed == null ? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) : seed);
    return this;
  },

  // 給餌1回=遺伝子球1発。emit時に結果を確定(独立抽選0.5%)。geneは代表個体の遺伝(卵の内容)
  emit(gene) {
    if (!this._rng) this.reset();
    if (this.balls.length >= CFG.roulMaxBalls) this.balls.shift(); // 上限=最古を退避(通常は起きない)
    const rainbow = this._rng() < CFG.roulRainbowChance;   // ★各球独立抽選(単一窓口)
    const jitter = this._rand(-1, 1);                      // 軌道の微小ばらつき(表現・決定論)
    const b = { id: this._idSeq++, age: 0, p: 0, rainbow, gene: gene || null, jitter };
    this.balls.push(b);
    this.events.push({ type: "BallEmitted", id: b.id, rainbow });
    return b;
  },

  // 実dtで各球の進行を進める(age→p線形)。フレーム非依存=同一シード+同一発射列=同一結果。
  // 物理積分が無いv2では固定タイムステップ不要(pはageの純関数)
  advance(realDt) {
    if (!this._rng) this.reset();
    const dt = Math.min(realDt, 0.1); // 大ラグは上限クランプ
    const balls = this.balls;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.age += dt;
      b.p = b.age / CFG.roulTravelSec; // 線形進行(0→1)。減速は表現層のeasingで
      if (b.p >= 1) {
        b.p = 1;
        this._arrive(b);
        balls.splice(i, 1);
      }
    }
  },

  // 最奥部到達=結果確定(emit時に抽選済み)。卵生成をonEggへ委譲(卵cap判定はGame側)
  _arrive(b) {
    this.events.push({ type: "BallLanded", rainbow: b.rainbow });
    if (b.rainbow) this.events.push({ type: "BallEnteredRainbow", id: b.id });
    if (this.onEgg) this.onEgg({ gene: b.gene, rainbow: b.rainbow });
  },

  drainEvents() {
    const ev = this.events.slice();
    this.events.length = 0;
    return ev;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { Roulette };
