"use strict";

// The board displays the resolved paths from Game. It never selects an outcome
// and can skip the presentation without affecting the play already settled.
const PachinkoBoard = (() => {
  const width = 720, height = 312;
  const left = width * .075, right = width - left, top = 35, bottom = 305;
  const labels = {
    normal: "通常継承",
    mutation: "変異",
    rare: "レア変異",
    legendary: "伝説",
    jackpot: "JACKPOT",
  };
  const timing = { single: 1460, batch: 1190, gap: 88, settle: 250 };
  let view = null;
  let aim = 0;
  let playing = null;

  function xAt(x) { return left + x * (right - left); }
  function yAt(y) { return top + y * (bottom - top); }

  function canvasContext(canvas) {
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    return ctx;
  }

  function cabinetOutline(ctx, offset) {
    ctx.beginPath();
    ctx.moveTo(18 + offset, height);
    ctx.lineTo(18 + offset, 107);
    ctx.bezierCurveTo(18 + offset, 51, 50 + offset, 13 + offset, 120, 13 + offset);
    ctx.lineTo(width - 120, 13 + offset);
    ctx.bezierCurveTo(width - 50 - offset, 13 + offset, width - 18 - offset, 51, width - 18 - offset, 107);
    ctx.lineTo(width - 18 - offset, height);
  }

  function line(ctx, points, color, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function disc(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function lamps(ctx, metal) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(width / 2, 0);
      ctx.scale(side, 1);
      for (let i = 0; i < 5; i++) {
        const x = 104 + 16 * i, y = 22;
        const light = ctx.createRadialGradient(x, y, 0, x, y, 11);
        light.addColorStop(0, metal);
        light.addColorStop(.24, metal);
        light.addColorStop(1, "#0000");
        disc(ctx, x, y, 11, light);
        disc(ctx, x, y, 2.1, "#ffe6b7");
      }
      line(ctx, [[207, 23], [239, 23], [265, 48], [307, 48], [317, 58], [317, 88]], "#b986445c", 1.15);
      line(ctx, [[209, 29], [237, 29], [263, 55], [295, 55], [310, 70], [310, 128], [295, 145]], "#8e643e74");
      line(ctx, [[257, 59], [275, 83], [275, 158], [302, 187], [302, 232]], "#8e643e55", 1.3);
      line(ctx, [[306, 102], [291, 117], [291, 147], [282, 157]], "#daa85540");
      for (const [x, y] of [[317, 88], [295, 145], [302, 232], [282, 157]]) {
        disc(ctx, x, y, 2.7, "#16100d");
        disc(ctx, x, y, 1.5, metal);
      }
      ctx.restore();
    }
  }

  function geneMark(ctx) {
    const cx = width / 2, cy = 159;
    const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, 106);
    halo.addColorStop(0, "#d293332b");
    halo.addColorStop(1, "#d2933300");
    disc(ctx, cx, cy, 106, halo);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-.52);
    ctx.strokeStyle = "#e5b16720";
    ctx.lineWidth = 1;
    for (const radius of [45, 69, 90]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    const strand = (y, side) => Math.sin(y * .055) * 23 * side;
    for (let y = -57; y <= 57; y += 9) {
      line(ctx, [[strand(y, -1), y], [strand(y, 1), y]], "#fed68f35", 1);
    }
    for (const side of [-1, 1]) {
      const points = [];
      for (let y = -65; y <= 65; y += 2) points.push([strand(y, side), y]);
      line(ctx, points, "#e8c1845c", 2);
    }
    ctx.restore();
  }

  function drawField() {
    const { field, pegs, pockets, board } = view;
    const metal = getComputedStyle(board).getPropertyValue("--pb-metal").trim();
    field.clearRect(0, 0, width, height);
    field.save();
    cabinetOutline(field, 0);
    field.closePath();
    field.clip();
    const glass = field.createRadialGradient(width / 2, 98, 25, width / 2, 98, 373);
    glass.addColorStop(0, "#39261a");
    glass.addColorStop(.45, "#20190f");
    glass.addColorStop(1, "#0d0d0a");
    field.fillStyle = glass;
    field.fillRect(0, 0, width, height);
    for (let x = 27; x < width - 26; x += 9) {
      for (let y = 21; y < height; y += 8) {
        field.fillStyle = (x + y) % 3 === 0 ? "#f7d49a19" : "#f7d49a0b";
        field.fillRect(x, y, 1, 1);
      }
    }
    geneMark(field);
    lamps(field, metal);
    const laneWidth = (right - left) / pockets.length;
    pockets.forEach((pocket, i) => {
      const x = left + i * laneWidth;
      const glow = field.createLinearGradient(0, 242, 0, height);
      const rgb = getComputedStyle(pocket).getPropertyValue("--pb-lane-rgb").trim();
      glow.addColorStop(0, `rgba(${rgb}, 0)`);
      glow.addColorStop(1, `rgba(${rgb}, .28)`);
      field.fillStyle = glow;
      field.fillRect(x + 1, 242, laneWidth - 2, height - 242);
      line(field, [[x, height], [x, 287], [x + 10, 274]], "#a875414d", 1.4);
      line(field, [[x + laneWidth, height], [x + laneWidth, 287], [x + laneWidth - 10, 274]], "#a875414d", 1.4);
      line(field, [[x + 5, height - 5], [x + laneWidth - 5, height - 5]], `rgba(${rgb}, .52)`, 1.5);
    });
    pegs.forEach(({ x, y }) => {
      const px = xAt(x), py = yAt(y);
      const head = field.createRadialGradient(px - 1.5, py - 1.85, .25, px, py, 5.1);
      head.addColorStop(0, "#ffeed0");
      head.addColorStop(.25, "#e6b467");
      head.addColorStop(.68, "#ae783b");
      head.addColorStop(1, "#674025");
      disc(field, px, py + 1, 7.1, "#0504037a");
      disc(field, px, py, 5.1, head);
      disc(field, px - 1.6, py - 1.8, 1, "#fff3d1");
    });
    const tick = view.aimSpread / 2;
    line(field, [[xAt(.5 - tick * 3), top], [xAt(.5 + tick * 3), top]], "#b3854f77", 1.5);
    for (let i = -3; i <= 3; i++) {
      const x = .5 + i * tick;
      line(field, [[xAt(x), top - 3], [xAt(x), top + 3]], "#b3854f8f");
    }
    field.restore();
    cabinetOutline(field, 0);
    field.lineWidth = 3;
    field.strokeStyle = "#0a0806";
    field.stroke();
    cabinetOutline(field, 2);
    field.lineWidth = 1.3;
    field.strokeStyle = metal;
    field.stroke();
    cabinetOutline(field, 6);
    field.lineWidth = .9;
    field.strokeStyle = "#eac08556";
    field.stroke();
  }

  function drawAim() {
    const ctx = view.motion;
    ctx.clearRect(0, 0, width, height);
    const x = xAt(.5 + aim * view.aimSpread);
    const glow = ctx.createRadialGradient(x, top, 1, x, top, 12);
    glow.addColorStop(0, "#b7ffed");
    glow.addColorStop(.25, "#93ffdfbe");
    glow.addColorStop(1, "#6ffed000");
    disc(ctx, x, top, 12, glow);
    disc(ctx, x, top, 2.5, "#ddfff6");
  }

  function sample(points, progress) {
    const i = Math.max(0, Math.min(progress, 1)) * (points.length - 1);
    const first = points[Math.floor(i)], next = points[Math.ceil(i)];
    const weight = i - Math.floor(i);
    return [xAt(first.x + (next.x - first.x) * weight), yAt(first.y + (next.y - first.y) * weight)];
  }

  function drawBall(ctx, points, progress) {
    const [x, y] = sample(points, progress);
    const tail = [sample(points, progress - .085), sample(points, progress - .055), sample(points, progress - .026), [x, y]];
    line(ctx, tail, "#72eedd3f", 10);
    line(ctx, tail, "#b1f8e4ad", 2.8);
    const step = progress * (points.length - 1), peg = Math.floor(step), sparkAge = (step - peg) * 2.8;
    if (peg > 0 && peg < points.length - 2 && sparkAge < 1) {
      const anchor = points[peg], ox = xAt(anchor.x), oy = yAt(anchor.y);
      ctx.globalAlpha = (1 - sparkAge) * .8;
      for (const dx of [-1, 1]) {
        const shift = 4 + sparkAge * 11;
        line(ctx, [[ox + dx * shift, oy - shift * .6], [ox + dx * (shift + 4), oy - shift * .86]], "#ffdc9b", 1.4);
      }
      ctx.globalAlpha = 1;
    }
    const halo = ctx.createRadialGradient(x, y, 2, x, y, 21);
    halo.addColorStop(0, "#87f7d5b5");
    halo.addColorStop(1, "#5ee1cb00");
    disc(ctx, x, y, 21, halo);
    const chrome = ctx.createRadialGradient(x - 2.5, y - 3, .6, x, y, 6.2);
    chrome.addColorStop(0, "#fff");
    chrome.addColorStop(.28, "#d4f5ee");
    chrome.addColorStop(.64, "#68bba9");
    chrome.addColorStop(1, "#244f49");
    disc(ctx, x, y, 6.2, chrome);
  }

  function drawImpact(ctx, points, fade, isJackpot) {
    const [x, y] = sample(points, 1);
    const radius = isJackpot ? 64 : 34;
    const glimmer = ctx.createRadialGradient(x, y, 1, x, y, radius);
    glimmer.addColorStop(0, isJackpot ? "#fff3b3" : "#ebffe5");
    glimmer.addColorStop(1, "#faf7bd00");
    ctx.globalAlpha = 1 - fade;
    disc(ctx, x, y, radius, glimmer);
    ctx.globalAlpha = 1;
  }

  function highlight(tier, showLabel) {
    const index = view.tiers.indexOf(tier);
    view.pockets.forEach((pocket, i) => pocket.classList.toggle("is-lit", i === index));
    if (showLabel && index >= 2) {
      view.result.dataset.tier = tier;
      view.result.textContent = labels[tier];
      view.result.hidden = false;
    }
  }

  function mount(host) {
    if (typeof host === "string") host = document.getElementById(host);
    if (!host || (view && host === view.host)) return;
    if (playing) playing.finish();
    const { pegs, aimSpread, tiers } = Game.pachinkoBoard();
    host.innerHTML = `
      <div class="pachi-board" data-mode="normal">
        <div class="pb-field" aria-hidden="true">
          <canvas data-pb="field"></canvas>
          <canvas data-pb="motion"></canvas>
          <div class="pb-result" data-pb="result" hidden></div>
        </div>
        <div class="pb-pockets" role="group" aria-label="入賞ポケット">
          ${tiers.map(tier => `<span class="pb-pocket" data-tier="${tier}">${labels[tier]}</span>`).join("")}
        </div>
      </div>`;
    view = {
      host, pegs, aimSpread, tiers,
      board: host.firstElementChild,
      field: canvasContext(host.querySelector('[data-pb="field"]')),
      motion: canvasContext(host.querySelector('[data-pb="motion"]')),
      result: host.querySelector('[data-pb="result"]'),
      pockets: Array.from(host.querySelectorAll(".pb-pocket")),
    };
    drawField();
    drawAim();
  }

  function setAim(value) {
    aim = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    if (view && !playing) drawAim();
  }

  function setMode(mode) {
    if (!view || view.board.dataset.mode === mode) return;
    view.board.dataset.mode = mode;
    drawField();
  }

  function play(shots) {
    if (!view || !shots.length) return Promise.resolve();
    if (playing) return playing.promise;
    const best = shots.reduce((winner, shot) =>
      view.tiers.indexOf(shot.tier) >= view.tiers.indexOf(winner.tier) ? shot : winner);
    view.result.hidden = true;
    highlight(null, false);
    const reduced = document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      highlight(best.tier, true);
      return Promise.resolve();
    }
    const duration = shots.length === 1 ? timing.single : timing.batch;
    const span = duration + (shots.length - 1) * timing.gap + timing.settle;
    let raf = 0;
    let landed = 0;
    const start = performance.now();
    let resolvePlay;
    const promise = new Promise(resolve => { resolvePlay = resolve; });

    function finish() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibilityChange);
      playing = null;
      highlight(best.tier, true);
      drawAim();
      resolvePlay();
    }

    function visibilityChange() {
      if (document.hidden) finish();
    }

    function frame(now) {
      const elapsed = now - start;
      if (elapsed >= span) { finish(); return; }
      const ctx = view.motion;
      ctx.clearRect(0, 0, width, height);
      shots.forEach(({ points, tier }, i) => {
        const t = elapsed - i * timing.gap;
        if (t < 0) return;
        if (t < duration) {
          drawBall(ctx, points, t / duration);
        } else if (t < duration + timing.settle) {
          drawImpact(ctx, points, (t - duration) / timing.settle, tier === "jackpot");
        }
        if (t >= duration && i >= landed) {
          landed = i + 1;
          highlight(tier, false);
        }
      });
      raf = requestAnimationFrame(frame);
    }

    playing = { finish, promise };
    document.addEventListener("visibilitychange", visibilityChange);
    raf = requestAnimationFrame(frame);
    return promise;
  }

  return { mount, setAim, setMode, play, label: (tier) => labels[tier] };
})();
