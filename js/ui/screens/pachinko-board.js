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
  const celebrations = ["rare", "legendary", "fever", "jackpot"];
  const timing = { single: 1040, batch: 865, gap: 104, settle: 150, special: 358, jackpot: 540 };
  let view = null;
  let aim = 0;
  let planet = 1;
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

  function lamps(ctx, metal, skin) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(width / 2, 0);
      ctx.scale(side, 1);
      for (let i = 0; i < 7; i++) {
        const x = 101 + 18 * i, y = 23;
        const light = ctx.createRadialGradient(x, y, 0, x, y, 12);
        light.addColorStop(0, metal);
        light.addColorStop(.19, metal);
        light.addColorStop(1, "#0000");
        disc(ctx, x, y, 12, light);
        disc(ctx, x, y, 2.1, "#ffe6b7");
      }
      const spine = `rgba(${skin.spine}, .42)`;
      line(ctx, [[224, 23], [255, 23], [273, 41], [295, 41]], spine, 1.5);
      line(ctx, [[224, 29], [252, 29], [270, 47], [293, 47]], spine);
      ctx.restore();
    }
  }

  function relief(ctx, skin) {
    const cx = width / 2, cy = 150, radius = 102;
    const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, radius);
    halo.addColorStop(0, `rgba(${skin.emblem}, .17)`);
    halo.addColorStop(1, `rgba(${skin.emblem}, 0)`);
    disc(ctx, cx, cy, radius, halo);
    ctx.save();
    ctx.strokeStyle = `rgba(${skin.emblem}, .16)`;
    for (const ring of [73, 86]) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = ctx.fillStyle = `rgba(${skin.emblem}, .23)`;
    ctx.lineWidth = 2.3;
    ctx.lineCap = "round";
    // These engravings are the same art used on the archived planet boards.
    skin.motif(ctx, cx, cy, 46);
    ctx.restore();
  }

  function drawField() {
    const { field, pegs, pockets, board, skin } = view;
    const metal = getComputedStyle(board).getPropertyValue("--pb-metal").trim();
    field.clearRect(0, 0, width, height);
    field.save();
    cabinetOutline(field, 0);
    field.closePath();
    field.clip();
    const glass = field.createRadialGradient(width / 2, 98, 25, width / 2, 98, 373);
    glass.addColorStop(0, "#2d2c21");
    glass.addColorStop(.54, "#181a13");
    glass.addColorStop(1, "#0b0f0b");
    field.fillStyle = glass;
    field.fillRect(0, 0, width, height);
    for (let x = 27; x < width - 26; x += 9) {
      for (let y = 21; y < height; y += 8) {
        field.fillStyle = `rgba(${skin.straw}, ${(x + y) % 3 === 0 ? .13 : .055})`;
        field.fillRect(x, y, 1, 1);
      }
    }
    relief(field, skin);
    lamps(field, metal, skin);
    const railTop = view.aimSpread * (right - left) * 1.24;
    const railEnd = yAt(pegs[0].y);
    const railBottom = 6;
    for (const side of [-1, 1]) {
      line(field, [[width / 2 + side * railTop, top], [width / 2 + side * railBottom, railEnd - 4]],
        `rgba(${skin.spine}, .44)`, 1.4);
    }
    field.save();
    field.translate(0, top);
    skin.rail_draw(field, width / 2, railTop, railBottom, railEnd - top - 4, .52);
    field.restore();
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
      const center = x + laneWidth * .5;
      skin.shelf_draw(field, center, bottom - 9, laneWidth * .42, laneWidth * .20, 0, .62, true);
      skin.cup_draw(field, center, laneWidth * .44, bottom, 16, .62);
    });
    pegs.forEach(({ x, y }) => {
      const px = xAt(x), py = yAt(y);
      const head = field.createRadialGradient(px - 1.3, py - 1.55, .25, px, py, 4.4);
      head.addColorStop(0, "#ffeed0");
      head.addColorStop(.27, `rgb(${skin.core})`);
      head.addColorStop(.72, `rgb(${skin.straw})`);
      head.addColorStop(1, "#674025");
      disc(field, px, py + 1, 6.9, "#0504039a");
      skin.nail_draw(field, { x: px, y: py, r: 4.2 }, .56);
      disc(field, px, py, 4.4, head);
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

  function drawImpact(ctx, shot, fade, color, power) {
    const [x, y] = sample(shot.points, 1);
    const radius = 25 + power * 23;
    const glimmer = ctx.createRadialGradient(x, y, 1, x, y, radius);
    glimmer.addColorStop(0, "#fff6d7");
    glimmer.addColorStop(.33, `rgba(${color}, .8)`);
    glimmer.addColorStop(1, `rgba(${color}, 0)`);
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    disc(ctx, x, y, radius, glimmer);
    if (power > 0) {
      ctx.strokeStyle = `rgb(${color})`;
      ctx.lineWidth = 2.4 - fade * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 7 + fade * radius * 1.12, Math.PI, Math.PI * 2);
      ctx.stroke();
      const count = 7 + power * 3;
      for (let i = 0; i < count; i++) {
        const a = Math.PI * (1.08 + .84 * i / (count - 1));
        const distance = 11 + fade * (radius + 8 * (i % 3));
        const ox = x + Math.cos(a) * distance;
        const oy = y + Math.sin(a) * distance + 9 * fade * fade;
        disc(ctx, ox, oy, (1 - fade) * (2.7 + i % 2), i % 2 ? "#fff2c7" : `rgb(${color})`);
      }
    }
    ctx.restore();
  }

  function highlight(tier) {
    const index = view.tiers.indexOf(tier);
    view.pockets.forEach((pocket, i) => pocket.classList.toggle("is-lit", i === index));
  }

  function celebrate(kind) {
    view.board.dataset.signal = kind;
    view.result.dataset.tier = kind;
    view.result.textContent = kind === "fever" ? "FEVER 突入" : labels[kind];
    view.result.hidden = false;
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
          <span class="pb-signal"></span>
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
    setPlanet(planet);
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

  function setPlanet(stageId) {
    planet = stageId;
    if (!view || playing || view.board.dataset.planet === String(stageId)) return;
    const skin = ROUL_BOARD_SKINS["p" + stageId] || ROUL_BOARD_SKINS.default;
    view.result.hidden = true;
    delete view.board.dataset.signal;
    highlight(null);
    view.skin = skin;
    view.board.dataset.planet = String(stageId);
    view.board.style.setProperty("--pb-straw", skin.straw);
    view.board.style.setProperty("--pb-core", skin.core);
    drawField();
  }

  function play(shots, { onLanding } = {}) {
    if (!view || !shots.length) return Promise.resolve();
    if (playing) return playing.promise;
    const tierOf = (shot) => view.tiers.indexOf(shot.tier);
    const best = shots.reduce((winner, shot) => tierOf(shot) >= tierOf(winner) ? shot : winner);
    const colors = view.pockets.map((pocket) => getComputedStyle(pocket).getPropertyValue("--pb-lane-rgb").trim());
    const powerOf = (shot) => shot.tier === "jackpot" ? 2 : shot.feverStarted || tierOf(shot) >= 2 ? 1 : 0;
    const impactMs = [timing.settle, timing.special, timing.jackpot];
    view.result.hidden = true;
    delete view.board.dataset.signal;
    highlight(null);
    const duration = shots.length === 1 ? timing.single : timing.batch;
    const span = Math.max(...shots.map((shot, i) => duration + i * timing.gap + impactMs[powerOf(shot)]));
    let raf = 0;
    let landed = 0;
    let displayedPower = -1;
    const start = performance.now();
    let resolvePlay, rejectPlay;
    const promise = new Promise((resolve, reject) => { resolvePlay = resolve; rejectPlay = reject; });

    function revealUntil(end) {
      for (; landed < end; landed++) {
        const shot = shots[landed];
        const kind = shot.feverStarted && shot.tier !== "jackpot" ? "fever" : shot.tier;
        const power = celebrations.indexOf(kind);
        highlight(shot.tier);
        if (power > displayedPower) {
          displayedPower = power;
          celebrate(kind);
        }
        onLanding?.({ shot, index: landed, count: shots.length });
      }
    }

    function finish(error) {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibilityChange);
      try {
        if (error) throw error;
        revealUntil(shots.length);
        highlight(best.tier);
        resolvePlay();
      } catch (err) {
        rejectPlay(err);
      } finally {
        playing = null;
        setPlanet(planet);
        drawAim();
      }
    }

    function visibilityChange() {
      if (document.hidden) finish();
    }

    function frame(now) {
      const elapsed = now - start;
      if (elapsed >= span) { finish(); return; }
      const ctx = view.motion;
      ctx.clearRect(0, 0, width, height);
      shots.forEach((shot, i) => {
        const t = elapsed - i * timing.gap;
        if (t < 0) return;
        if (t < duration) {
          drawBall(ctx, shot.points, t / duration);
        } else {
          const power = powerOf(shot);
          const fade = (t - duration) / impactMs[power];
          if (fade < 1) drawImpact(ctx, shot, fade, shot.feverStarted ? "245,159,238" : colors[tierOf(shot)], power);
        }
      });
      try {
        revealUntil(Math.min(shots.length, Math.floor((elapsed - duration) / timing.gap) + 1));
      } catch (error) {
        finish(error);
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    playing = { finish, promise };
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return promise;
    }
    document.addEventListener("visibilitychange", visibilityChange);
    frame(start);
    return promise;
  }

  return { mount, setAim, setMode, setPlanet, play, label: (tier) => labels[tier] };
})();
