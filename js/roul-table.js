"use strict";

// The colony cabinet inherits the boss board's seeded RNG, fixed clock and events.
// All lengths below are in the same front-elevation coordinates used by its painter.
function tableTrack(start, curves, speed) {
  const points = [{ x: start[0], y: start[1], distance: 0 }];
  let distance = 0;
  for (const [cx, cy, x, y] of curves) {
    const from = points[points.length - 1];
    for (let step = 1; step <= 12; step++) {
      const t = step / 12, u = 1 - t;
      const px = u * u * from.x + 2 * u * t * cx + t * t * x;
      const py = u * u * from.y + 2 * u * t * cy + t * t * y;
      const last = points[points.length - 1];
      distance += Math.hypot(px - last.x, py - last.y);
      points.push({ x: px, y: py, distance });
    }
  }
  return { points, length: distance, speed };
}

const CRANK_TABLE = {
  w: 208, h: 205, radius: 2.7, gravity: 435, landY: 183,
  left: 21, right: 198, launchVelocity: [60, 91, 127],
  wheel: { x: 103, y: 77, radius: 21, arms: 5, speed: 0.95 },
  gate: { x: 108, y: 136, length: 22, tilt: 0.36, speed: 2.8 },
  pockets: [
    { x: 69, half: 10, tier: 'egg' },
    { x: 108, half: 4.5, tier: 'rare' },
    { x: 146, half: 10, tier: 'egg' },
  ],
  launch: tableTrack([10, 177], [[9, 135, 10, 88], [10, 30, 52, 16], [65, 11, 77, 12]], 310),
  // Left kickback winds a ball back uphill once. The right wireform bypasses the lower pegs.
  tracks: [
    { id: 'kickback', x: 48, y: 119, half: 10, track: tableTrack([48, 119], [[52, 136, 41, 137], [26, 138, 27, 120], [27, 104, 31, 99], [37, 87, 52, 92]], 145) },
    { id: 'bypass', x: 156, y: 108, half: 8, track: tableTrack([156, 108], [[159, 115, 172, 117], [194, 121, 183, 140], [175, 151, 151, 153], [139, 155, 142, 165]], 97) },
  ],
  nails: [],
};
// Deliberately open lanes separate the dense fans of pins from the rotor and track mouths.
for (const [y, xs] of [
  [32, [58, 72, 89, 111, 131]], [42, [46, 65, 81, 100, 121, 140]],
  [55, [39, 56, 74, 132, 151, 166]], [70, [33, 51, 66, 143, 160, 177]],
  [84, [44, 61, 73, 132, 150, 169, 185]], [100, [59, 71, 85, 119, 137, 179]],
  [113, [65, 80, 98, 114, 131]], [123, [72, 140]],
  [146, [48, 65, 78]], [155, [36, 58, 75, 92, 114]],
  [167, [43, 61, 82, 100, 118, 155, 176]],
]) for (const x of xs) CRANK_TABLE.nails.push({ x, y, r: 1.45 });

function tableContact(ball, x, y, radius, vx, vy, restitution) {
  const dx = ball.x - x, dy = ball.y - y;
  const reach = ball.r + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return false;
  const d = Math.sqrt(d2);
  const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
  ball.x = x + nx * reach;
  ball.y = y + ny * reach;
  const inward = (ball.vx - vx) * nx + (ball.vy - vy) * ny;
  if (inward >= 0) return false;
  ball.vx -= (1 + restitution) * inward * nx;
  ball.vy -= (1 + restitution) * inward * ny;
  return true;
}

function tableArm(ball, pivot, angle, half, angularSpeed, start, radius) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const projection = (ball.x - pivot.x) * cos + (ball.y - pivot.y) * sin;
  const arm = Math.max(start, Math.min(half, projection));
  const dx = cos * arm, dy = sin * arm;
  return tableContact(ball, pivot.x + dx, pivot.y + dy, radius, -dy * angularSpeed, dx * angularSpeed, 0.57);
}

const CrankTable = Object.assign(Object.create(Roulette), {
  buildNails() { this.nails = CRANK_TABLE.nails; },
  reset(seed) {
    Roulette.reset.call(this, seed);
    this.wheelAngle = -0.3;
    this.gateDirection = -1;
    this.gateAngle = this.gateDirection * CRANK_TABLE.gate.tilt;
    return this;
  },
  flipGate() { this.gateDirection *= -1; },
  emit(gene, rate = 1) {
    if (this.balls.length >= CFG.roulMaxBalls) return null;
    const track = CRANK_TABLE.launch;
    const first = track.points[0];
    const ball = {
      id: this._idSeq++, x: first.x, y: first.y, vx: 0, vy: 0, r: CRANK_TABLE.radius, gene,
      phase: 'launch', track, travel: 0, segment: 1, priorTracks: 0,
      launchSpeed: (CRANK_TABLE.launchVelocity[rate] ?? CRANK_TABLE.launchVelocity[1]) + this._rand(-17, 17),
    };
    this.balls.push(ball);
    this.events.push({ type: 'BallEmitted', id: ball.id });
    return ball;
  },
  _rollTrack(ball, dt) {
    const track = ball.track;
    const points = track.points;
    // Ascent trades speed for height, with a spring in the kickback lane.
    const speed = ball.phase === 'launch' ? track.speed - 0.55 * (points[0].y - ball.y) : ball.trackSpeed;
    ball.travel += speed * dt;
    while (ball.segment < points.length - 1 && points[ball.segment].distance < ball.travel) ball.segment++;
    const to = points[ball.segment], from = points[ball.segment - 1];
    const length = to.distance - from.distance;
    const t = Math.min(1, (ball.travel - from.distance) / length);
    ball.x = from.x + (to.x - from.x) * t + (ball.entryOffset || 0) * Math.max(0, 1 - ball.travel / 9);
    ball.y = from.y + (to.y - from.y) * t;
    if (ball.travel < track.length) return;
    const exitSpeed = ball.phase === 'launch' ? ball.launchSpeed : speed * 0.69;
    ball.vx = (to.x - from.x) / length * exitSpeed;
    ball.vy = (to.y - from.y) / length * exitSpeed;
    ball.track = null;
    ball.phase = 'fall';
  },
  _land(ball) {
    const pocket = CRANK_TABLE.pockets.find((p) => Math.abs(ball.x - p.x) <= p.half);
    const rainbow = pocket?.tier === 'rare';
    const win = !!pocket && (rainbow || !this.canAcceptEgg || this.canAcceptEgg());
    ball.rainbow = rainbow;
    ball.phase = win ? 'settle' : 'miss';
    ball.cupX = win ? pocket.x : ball.x;
    ball.settleT = CFG.roulSettleT;
    this.events.push({ type: 'BallLanded', x: ball.x, win, rainbow });
    if (this.onLanding) this.onLanding({ win, rainbow });
    // Credit the pocket at contact so the next ball observes the updated egg capacity.
    if (win && this.onEgg) this.onEgg({ gene: ball.gene, rainbow, mode: rainbow ? 'rainbow' : null });
  },
  _freeFall(ball, dt, gateSpeed) {
    const table = CRANK_TABLE, wheel = table.wheel, gate = table.gate;
    const lastY = ball.y;
    ball.vy += table.gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < table.left + ball.r || ball.x > table.right - ball.r) {
      ball.x = Math.max(table.left + ball.r, Math.min(table.right - ball.r, ball.x));
      ball.vx *= -CFG.roulWallRestitution;
    }
    for (const pin of this.nails) {
      if (tableContact(ball, pin.x, pin.y, pin.r, 0, 0, 0.63)) {
        ball.vx += this._rand(-CFG.roulNailJit, CFG.roulNailJit);
      }
    }
    if (Math.abs(ball.x - wheel.x) < wheel.radius + 7 && Math.abs(ball.y - wheel.y) < wheel.radius + 7) {
      for (let arm = 0; arm < wheel.arms; arm++) {
        const angle = this.wheelAngle + arm * Math.PI * 2 / wheel.arms;
        if (tableArm(ball, wheel, angle, wheel.radius, wheel.speed, 0, 1.75)) {
          if (!ball.touchedRotor) this.events.push({ type: 'BallRotor', id: ball.id });
          ball.touchedRotor = true;
        }
      }
    }
    if (Math.abs(ball.x - gate.x) < gate.length + 5 && Math.abs(ball.y - gate.y) < 14) {
      if (tableArm(ball, gate, this.gateAngle, gate.length, gateSpeed, -gate.length, 1.9)) {
        if (!ball.touchedGate) this.events.push({ type: 'BallGate', id: ball.id });
        ball.touchedGate = true;
      }
    }
    for (let i = 0; i < table.tracks.length; i++) {
      const entry = table.tracks[i], bit = 1 << i;
      if (ball.priorTracks & bit || lastY >= entry.y || ball.y < entry.y || Math.abs(ball.x - entry.x) > entry.half) continue;
      ball.priorTracks |= bit;
      ball.entryOffset = ball.x - entry.x;
      ball.trackSpeed = entry.track.speed * 0.8 + Math.min(45, Math.hypot(ball.vx, ball.vy) * 0.35);
      ball.phase = entry.id;
      ball.track = entry.track;
      ball.travel = 0;
      ball.segment = 1;
      this.events.push({ type: 'BallTrack', track: entry.id, id: ball.id });
      return;
    }
    if (ball.y >= table.landY) this._land(ball);
  },
  _step(dt) {
    const table = CRANK_TABLE;
    this.wheelAngle = (this.wheelAngle + table.wheel.speed * dt) % (Math.PI * 2);
    const change = this.gateDirection * table.gate.tilt - this.gateAngle;
    const step = Math.sign(change) * Math.min(Math.abs(change), table.gate.speed * dt);
    this.gateAngle += step;
    const balls = this.balls;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.track) { this._rollTrack(b, dt); continue; }
      if (b.phase === 'fall') { this._freeFall(b, dt, step / dt); continue; }
      if (b.phase === 'settle') {
        b.x += (b.cupX - b.x) * dt * 12;
        b.y += (table.landY + 5 - b.y) * dt * 12;
        b.settleT -= dt;
        if (b.settleT > 0) continue;
        this.events.push({ type: b.rainbow ? 'BallRainbow' : 'BallWin', x: b.cupX });
      } else {
        b.vy += table.gravity * dt;
        b.y += b.vy * dt;
        if (b.y <= table.h + b.r) continue;
      }
      balls.splice(i, 1);
    }
    // Equal-mass steel balls exchange their normal momentum on the open playfield.
    for (let i = 1; i < balls.length; i++) {
      const a = balls[i];
      if (a.phase !== 'fall') continue;
      for (let j = 0; j < i; j++) {
        const b = balls[j];
        if (b.phase !== 'fall') continue;
        const dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2);
        const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
        const half = (reach - d) * 0.5;
        a.x -= nx * half; a.y -= ny * half;
        b.x += nx * half; b.y += ny * half;
        const inward = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (inward >= 0) continue;
        const impulse = inward * 0.85;
        a.vx += nx * impulse; a.vy += ny * impulse;
        b.vx -= nx * impulse; b.vy -= ny * impulse;
      }
    }
  },
});
