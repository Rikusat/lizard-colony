"use strict";
// =============================================================
// slit — 二重スリット実験的瞬間遺伝決定装置【ルール層】(roulette.md §9)
// 決定論・単一シード窓口・DOM非依存=node単体検証(モンテカルロ)可能。
// 外縁の360°ランダム位置(=射出角θ)から中心へ放射状に球を射出。各同心円の切れ目(基準角に整列・
//   外ほど広く内ほど狭い narrowing corridor)を通過できれば次へ、外れれば最外の該当円で消滅。
//   全通過=中心到達=成功(賢者の石)。結果はθと幾何から創発(事前確定なし・見えている軌跡が真実)。
// P(ある円を通過)=slitHalfDeg/180。全成功率=最内の slitHalfDeg/180。
// 賢者の石の付与は onSuccess コールバック(boot時にGameが設定)。種・卵は一切生成しない。
// =============================================================

function slitAngleDist(a, b) {
  let d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d); // 0..180
}

const Slit = {
  ball: null,     // { r(装置半径比・外1→中心0), theta, phase:"fly"|"blocked"|"success", ringIdx, blockRing }
  stuck: [],      // 失敗球の痕跡(壁に張り付いたまま残す・学習性無力感の防止)。{r,theta,ring,life,miss,id}
  events: [],     // 表現層がdrainする(SlitFired/SlitPass/SlitBlocked/SlitSuccess)
  onSuccess: null,// 成功時の賢者の石付与(boot時にGameが設定)
  passed: 0,      // 通過した円の数(表現層/惜しさ用)
  _seed: 0,
  _rng: null,
  _cd: 0,         // クランク稼働トリガーのクールダウン残(秒)
  _stuckSeq: 1,
  _time: 0,       // 回転の累積時間(固定dt・時間の純関数=決定論。ウォールクロック非依存)
  _acc: 0,        // 固定dt積分のアキュムレータ

  // 円iの切れ目の中心角(度)=基準角+回転。時刻tの純関数
  ringSlitAngle(i) { return CFG.slitBaseAngleDeg + CFG.slitSpinDeg[i] * this._time; },

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

  // 作動: 外縁の360°ランダム角θから中心へ放射状に射出
  launch(seed) {
    if (seed != null) this.setSeed(seed);
    else if (!this._rng) this.setSeed(((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0));
    const theta = this._rng() * 360; // 外縁のランダム位置=射出角(単一シード窓口)
    this.ball = { r: 1.0, theta, phase: "fly", ringIdx: 0, blockRing: -1 };
    this.passed = 0;
    this.events.push({ type: "SlitFired", theta });
    return this.ball;
  },

  // クランク稼働で作動(§9.3-1)。クールダウン中/飛行中は撃たない=左が光り続ける再発防止
  onCrank() {
    if (this._cd > 0 || this.active()) return false;
    this.launch();
    this._cd = CFG.slitCooldownSec;
    return true;
  },
  cooldownLeft() { return this._cd; },

  // 実dtを固定dtで積分(フレーム非依存=決定論)。回転・前進・張り付き寿命を進める
  advance(realDt) {
    this._acc += Math.min(realDt, 0.1);
    const fdt = CFG.slitFixedDt;
    let guard = 0;
    while (this._acc >= fdt && guard < 400) { this._step(fdt); this._acc -= fdt; guard++; }
  },

  _step(dt) {
    this._time += dt;                                // 回転の累積時間(全円の切れ目角はこれの純関数)
    if (this._cd > 0) this._cd = Math.max(0, this._cd - dt);
    // 張り付き球: 寿命減衰+「付いた円と一緒に回転」(円の記録なので円と共に巡る)
    if (this.stuck.length) {
      for (const s of this.stuck) { s.life -= dt; s.theta += CFG.slitSpinDeg[s.ring] * dt; }
      this.stuck = this.stuck.filter((s) => s.life > 0);
    }
    const b = this.ball;
    if (!b || b.phase !== "fly") return;
    b.r -= CFG.slitBallSpeedf * dt;
    const N = CFG.slitRings, radii = CFG.slitRadiif, half = CFG.slitHalfDeg;
    while (b.ringIdx < N && b.r <= radii[b.ringIdx]) {
      const i = b.ringIdx;
      const dist = slitAngleDist(b.theta, this.ringSlitAngle(i)); // 跨いだ瞬間の回転位置で判定(0.5s高速=ほぼ発射時刻の位相)
      if (dist <= half[i]) {
        this.passed = i + 1;
        this.events.push({ type: "SlitPass", ring: i, near: half[i] - dist }); // near小=ギリギリ通過
        b.ringIdx++;
      } else {
        b.phase = "blocked"; b.blockRing = i; b.r = radii[i];
        this.events.push({ type: "SlitBlocked", ring: i, miss: dist - half[i] }); // miss小=切れ目のすぐ横=惜しい
        this._addStuck(radii[i], b.theta, i, dist - half[i]); // 痕跡を残す(以後は付いた円と共に回転)
        return;
      }
    }
    if (b.ringIdx >= N) { // 全通過=中心到達=成功
      b.phase = "success"; b.r = 0;
      this.events.push({ type: "SlitSuccess" });
      if (this.onSuccess) this.onSuccess();
    }
  },

  // 失敗球を張り付ける。§9.5: 最外周(ring=0)で弾かれた球は残さない=1枚以上潜り抜けた球のみ記録(残る点=「ここまで行けた」証拠)。
  // 最大数超過時は「より外側(=浅い)・古い」球から消す=内側(惜しい)記録を優先して残す
  _addStuck(r, theta, ring, miss) {
    if (ring < 1) return;
    this.stuck.push({ r, theta, ring, life: CFG.slitStickSec, miss, id: this._stuckSeq++ });
    while (this.stuck.length > CFG.slitStickMax) {
      let worst = 0;
      for (let k = 1; k < this.stuck.length; k++) {
        const a = this.stuck[k], w = this.stuck[worst];
        if (a.ring < w.ring || (a.ring === w.ring && a.id < w.id)) worst = k; // 浅い→古い順で最下位
      }
      this.stuck.splice(worst, 1);
    }
  },

  active() { return !!this.ball && this.ball.phase === "fly"; },
  outcome() { return this.ball ? this.ball.phase : "idle"; }, // "fly"|"blocked"|"success"|"idle"
  reset() { this.ball = null; this.passed = 0; this.stuck = []; this._cd = 0; this._time = 0; this._acc = 0; this._stuckSeq = 1; }, // 惑星切替/新セッションで痕跡・採番もクリア(=完全な再現性)
  drainEvents() { const ev = this.events.slice(); this.events.length = 0; return ev; },
};

if (typeof module !== "undefined" && module.exports) module.exports = { Slit, slitAngleDist };
