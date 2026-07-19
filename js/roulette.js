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
  canAcceptEgg: null, // ②(a): 景品穴が開いているか(スロット満杯で閉=false)。boot時にGameが設定。null=常に開
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

  // ---- 報酬モード(Phase3.13 v4: ボス討伐後の報酬。給餌連動の常時発射は撤廃) ----
  // reward = { remaining, gene } 発射待ちの残り球数と、球に乗せる代表遺伝。
  reward: null,
  // 報酬セッション開始。count発を撃てる状態にする(発射はfireRewardBall/autoFireRewardが行う)
  startReward(count, gene) {
    if (!this._rng) this.reset(); else this.reset(this.getSeed() + 1); // 盤をクリアして新セッション
    this.reward = { remaining: Math.max(0, count | 0), gene: gene || null };
    this._emitAcc = 0;
    return this.reward;
  },
  // 1発撃つ(タップ)。残があればemitして残を減らす
  fireRewardBall() {
    if (!this.reward || this.reward.remaining <= 0) return false;
    this.reward.remaining--;
    this.emit(this.reward.gene);
    return true;
  },
  // dt秒ぶんを溜め、roulRewardEmitInterval間隔で自動発射(長押し/スキップ用)。撃った数を返す
  autoFireReward(dt) {
    if (!this.reward) return 0;
    this._emitAcc += dt;
    let n = 0;
    while (this._emitAcc >= CFG.roulRewardEmitInterval && this.reward.remaining > 0) {
      this._emitAcc -= CFG.roulRewardEmitInterval;
      if (this.fireRewardBall()) n++;
    }
    return n;
  },
  rewardRemaining() { return this.reward ? this.reward.remaining : 0; },
  // 報酬セッションが継続中か(残球 or 飛行中の球がある)。両方尽きたら演出は閉じてよい
  rewardActive() { return !!this.reward && (this.reward.remaining > 0 || this.balls.length > 0); },
  endReward() { this.reward = null; this.balls.length = 0; this._emitAcc = 0; },

  // 実dtを固定dtで積分(フレーム非依存=決定論)。大ラグは上限クランプ
  advance(realDt) {
    if (!this._rng) this.reset();
    this._acc += Math.min(realDt, 0.1);
    const fdt = CFG.roulFixedDt;
    let guard = 0;
    while (this._acc >= fdt && guard < 240) { this._step(fdt); this._acc -= fdt; guard++; }
  },

  // レールのシュート半幅(y位置で上端広→下端狭。ファネル・roulette_rules.md §1)
  _chuteHalf(y) {
    const H = CFG.roulH, W = CFG.roulW;
    const u = Math.max(0, Math.min(1, y / (CFG.roulRailEndYf * H)));
    return (CFG.roulChuteTopHalff + (CFG.roulChuteBotHalff - CFG.roulChuteTopHalff) * u) * W;
  },

  _step(dt) {
    const W = CFG.roulW, H = CFG.roulH;
    const railEndY = CFG.roulRailEndYf * H, landY = CFG.roulLandYf * H;
    const cx = CFG.roulHoleCenterf * W;
    const balls = this.balls, nails = this.nails;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      // 受け皿に収まる(コトン)→settleT後にonEgg発火・除去(§2)
      if (b.phase === "settle") {
        b.settleT -= dt;
        b.vx *= CFG.roulSettleDamp; b.vy *= CFG.roulSettleDamp;
        b.x += (b.cupX - b.x) * 10 * dt;            // 器の中心へ吸い込む
        b.y += (b.cupY - b.y) * 10 * dt;            // 器の底へ沈む
        if (b.settleT <= 0) {
          this.events.push({ type: b.rainbow ? "BallRainbow" : "BallWin", x: b.cupX });
          if (this.onEgg) this.onEgg({ gene: b.gene, rainbow: b.rainbow });
          balls.splice(i, 1);
        }
        continue;
      }
      // ハズレ: 受け皿が無いので流れ落ちて消える(§2)
      if (b.phase === "miss") {
        b.vy += CFG.roulGravity * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y > H + b.r * 3) balls.splice(i, 1);
        continue;
      }
      // 通常: 重力→積分→(レール壁 or 釘)
      b.vy += CFG.roulGravity * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < railEndY) {
        b.phase = "rail";
        // シュート壁で反射(ファネル=球が壁沿いに走り、中央へ送り出される)
        const half = this._chuteHalf(b.y);
        if (b.x < cx - half) { b.x = cx - half; b.vx = Math.abs(b.vx) * CFG.roulChuteRestitution; }
        else if (b.x > cx + half) { b.x = cx + half; b.vx = -Math.abs(b.vx) * CFG.roulChuteRestitution; }
      } else {
        b.phase = "fall";
        // 外壁
        if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * CFG.roulWallRestitution; }
        else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx * CFG.roulWallRestitution; }
        // 釘衝突
        for (let k = 0; k < nails.length; k++) {
          const n = nails[k];
          const dx = b.x - n.x, dy = b.y - n.y;
          const rr = b.r + n.r, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.0001;
            const nx = dx / d, ny = dy / d;
            b.x = n.x + nx * rr; b.y = n.y + ny * rr;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              const e = CFG.roulRestitution;
              b.vx -= (1 + e) * vn * nx;
              b.vy -= (1 + e) * vn * ny;
              const j = this._rand(-CFG.roulNailJit, CFG.roulNailJit); // 接線ジッタ(単一シード)
              b.vx += -ny * j; b.vy += nx * j;
            }
          }
        }
      }
      // 着地=結果確定(§1.4)。入賞は受け皿へ収まるフェーズ、ハズレは流れて消えるフェーズへ
      if (b.y >= landY) this._resolveLanding(b);
    }
  },

  // 着地xで3分岐(§1.4)。ここで結果確定(BallLanded)。入賞は settle、ハズレは miss へ
  _resolveLanding(b) {
    const W = CFG.roulW, H = CFG.roulH;
    const cx = CFG.roulHoleCenterf * W, landY = CFG.roulLandYf * H;
    const dx = Math.abs(b.x - cx);
    const rbHalf = CFG.roulRainbowHalfWf * W, pzOut = CFG.roulPrizeOuterf * W;
    let rainbow = false, win = false;
    // ②(a) 3.11: 景品穴はスロット満杯で"物理的に閉じる"(canAcceptEgg=false)→球は入らずハズレ。
    // 虹穴は常に開=大当たりは必ず入る(レア保護)。判定は着地時の実状態をそのまま反映(見た目=真実)。
    const prizeOpen = !this.canAcceptEgg || this.canAcceptEgg();
    if (dx <= rbHalf) { rainbow = true; win = true; }              // 中央極細=大当たり(常に開)
    else if (dx <= pzOut && prizeOpen) { win = true; }            // 景品帯(満杯時は閉=ハズレ)
    this.events.push({ type: "BallLanded", x: b.x, rainbow, win });
    if (win) {
      // 受け皿へコトンと収まる。cupは虹=中央 / 景品=左右帯の中央
      b.phase = "settle"; b.rainbow = rainbow;
      b.cupX = rainbow ? cx : (b.x < cx ? cx - (rbHalf + pzOut) / 2 : cx + (rbHalf + pzOut) / 2);
      b.cupY = landY + CFG.roulCupDepthf * H * 0.6;
      b.settleT = CFG.roulSettleT;
      b.vx *= 0.3; b.vy *= 0.3;
    } else {
      b.phase = "miss"; // 受け皿なし=流れて消える
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
