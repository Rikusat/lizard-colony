"use strict";

const Terrarium = (() => {
  const { world, height } = TerrariumLand;
  const home = { angle: 0.48, pitch: 0.61, zoom: 1, panX: 0, panY: 0 };
  const view = { ...home };
  const models = new Map();
  let screen,
    back,
    cacheKey,
    scale,
    center,
    picks = [];
  const nestId = -1;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function reset() {
    Object.assign(view, home);
  }
  function orbit(dx, dy) {
    view.angle = (view.angle + dx) % (2 * Math.PI);
    view.pitch = clamp(view.pitch + dy, 0.24, 1.15);
  }
  function zoom(f, nx = 0.5, ny = 0.5) {
    const next = clamp(view.zoom * f, 0.68, 2.8),
      ratio = next / view.zoom;
    view.panX = clamp((view.panX + 0.5 - nx) * ratio + nx - 0.5, -0.8, 0.8);
    view.panY = clamp((view.panY + 0.5 - ny) * ratio + ny - 0.5, -0.8, 0.8);
    view.zoom = next;
  }
  function worldAxes() {
    screen.transform(center, view.angle, view.pitch, scale);
  }
  function register(kind, value) {
    picks.push({ kind, value });
    return picks.length;
  }
  function hit(nx, ny, pad = 0) {
    if (!screen) return null;
    const { width: w, height: h } = screen.canvas;
    const x = Math.floor(nx * w),
      y = Math.floor(ny * h);
    const idAt = (a, b) => (a < 0 || b < 0 || a >= w || b >= h ? 0 : screen.ids[b * w + a]);
    let id = idAt(x, y),
      best = Infinity;
    if (!id && pad)
      for (let dy = -pad; dy <= pad; dy++)
        for (let dx = -pad; dx <= pad; dx++) {
          const key = idAt(x + dx, y + dy),
            d = dx * dx + dy * dy;
          if (key && d <= pad * pad && d < best) {
            id = key;
            best = d;
          }
        }
    return id === nestId ? { kind: "burrow" } : picks[id - 1] || null;
  }
  function mark(x, y, z, r, color, id = 0) {
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12;
      screen.box(x + Math.cos(angle) * r, y + Math.sin(angle) * r, z, 1, 0.8, 0.2, color, id);
    }
  }
  function furniture(box) {
    const wood = 0x866441,
      trim = 0xe1c287,
      iron = 0x526862;
    const [bx, by] = world(FAC_POS.burrow.x, FAC_POS.burrow.y),
      bz = height(bx, by);
    const arch = 1 + Math.min(4, Game.nestLv() - 1) * 0.12;
    for (const side of [-1, 1]) {
      box(bx + side * 4 * arch, by, bz, 3.2 * arch, 6 * arch, 3.3 * arch, wood, nestId);
      box(bx + side * 3.3 * arch, by, bz + 3 * arch, 3 * arch, 6 * arch, 1.7 * arch, trim, nestId);
    }
    box(bx, by, bz + 4.6 * arch, 7 * arch, 6 * arch, 1.6 * arch, wood, nestId);
    box(bx, by - 2.5 * arch, bz, 7 * arch, 0.8, 5 * arch, 0x443b30, nestId);
    const [nx, ny] = world(NEST.x, NEST.y),
      nz = height(nx, ny);
    box(nx, ny, nz, 13, 6, 0.5, wood);
    for (const side of [-1, 1]) {
      box(nx, ny + side * 3, nz + 0.4, 13, 0.85, 1.1, trim);
      box(nx + side * 6.1, ny, nz + 0.4, 0.85, 5.3, 1.1, wood);
    }
    for (const name of ["heat", "water", "watchtower", "observatory", "trap", "fence"]) {
      const lv = Game.facLv(name);
      if (!lv) continue;
      if (name === "fence") {
        for (let y = -30; y <= 32; y += 5) {
          const x = (FAC_POS.fenceX - 640) / 10,
            z = height(x, y);
          box(x, y, z, 1, 1, 5.3, iron);
          box(x, y + 2.2, z + 2, 0.7, 5, 0.6, wood);
        }
        continue;
      }
      const pos = FAC_POS[name === "heat" ? "light" : name],
        [x, y] = world(pos.x, pos.y),
        z = height(x, y);
      const h = 5 + Math.min(8, lv) * 0.5;
      if (name === "heat") {
        box(x, y, z, 10, 8, 1, iron);
        box(x + 4, y, z + 1, 0.7, 0.8, h + 4, trim);
        box(x + 1.5, y, z + h + 4, 6, 0.9, 0.7, trim);
        box(x - 1, y, z + h + 2, 4, 3, 2, wood);
        box(x - 1, y, z + h + 1.8, 3.3, 2.6, 0.3, 0xffce70);
      } else if (name === "water") {
        box(x, y, z, 12, 9, 1.5, trim);
        box(x, y, z + 1.5, 10.4, 7.4, 0.25, 0x69bab5);
      } else if (name === "trap") {
        box(x, y, z, 7, 6, 1, iron);
        for (let n = -2; n <= 2; n += 2) box(x + n, y, z + 1, 0.7, 3, 2, trim);
      } else {
        for (const dx of [-3, 3]) for (const dy of [-2, 2]) box(x + dx, y + dy, z, 0.9, 0.9, h, wood);
        box(x, y, z + h, 9, 7, 0.9, trim);
        box(x, y, z + h + 1, 6, 4, 2.6, iron);
        box(x, y, z + h + 3.6, 9, 7, 0.8, wood);
      }
    }
  }

  // Bake the terrain once per construction change. One light-space depth map
  // shades every camera view; the solid columns also provide climbing surfaces.
  let sceneryKey,
    solids = [],
    light,
    columns = new Map();
  const lightYaw = -2.35,
    lightPitch = 0.93,
    lightScale = 2.5;
  const footing = new WeakMap();
  function geometry(stage) {
    const key = [
      stage,
      Game.nestLv(),
      ...["heat", "water", "fence", "observatory", "watchtower", "trap"].map((k) => Game.facLv(k)),
    ].join("/");
    if (key === sceneryKey) return key;
    sceneryKey = key;
    solids = [];
    columns.clear();
    const collect = (...b) => solids.push(b);
    TerrariumLand.scenery(collect, stage);
    furniture(collect);
    light = VoxelVolume.surface(416, 340);
    light.transform([208, 172, 0], lightYaw, lightPitch, lightScale);
    light.depth.fill(-Infinity);
    for (const b of solids) {
      const [x, y, z, w, d, h] = b;
      if (w < 0.5 || d < 0.5) continue;
      light.box(...b);
      if (z < 0 || h < 0.6 || b[7] === nestId) continue;
      for (let i = Math.floor((x - w / 2) / 5); i <= Math.floor((x + w / 2) / 5); i++)
        for (let j = Math.floor((y - d / 2) / 5); j <= Math.floor((y + d / 2) / 5); j++) {
          const k = i + 64 * j;
          if (!columns.has(k)) columns.set(k, []);
          columns.get(k).push(b);
        }
    }
    return key;
  }
  function ground(x, y, previous) {
    let z = height(x, y);
    const nearby = columns.get(Math.floor(x / 5) + 64 * Math.floor(y / 5)) || [];
    for (const [cx, cy, base, w, d, h] of nearby) {
      if (base <= Math.max(previous, z) + 1.4 && Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= d / 2)
        z = Math.max(z, base + h);
    }
    return z;
  }
  function step(dt) {
    geometry(Game.currentStage().id);
    for (const lz of Game.state.lizards) {
      const [x, y] = world(lz.x, lz.y);
      const body = footing.get(lz) || { z: height(x, y), vz: 0 };
      const floor = ground(x, y, body.z);
      if (body.z > floor) {
        body.vz -= 42 * dt;
        body.z = Math.max(floor, body.z + body.vz * dt);
      } else {
        body.vz = 0;
        body.z = Math.min(floor, body.z + 20 * dt);
      }
      footing.set(lz, body);
    }
  }
  function castShadows(w, h) {
    const c = Math.cos(view.angle),
      s = Math.sin(view.angle),
      cp = Math.cos(view.pitch),
      sp = Math.sin(view.pitch);
    const lc = Math.cos(lightYaw),
      ls = Math.sin(lightYaw),
      lp = Math.sin(lightPitch),
      lh = Math.cos(lightPitch);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const i = py * w + px,
          d = screen.depth[i];
        if (!Number.isFinite(d)) continue;
        const u = (px + 0.5 - center[0]) / scale,
          v = (py + 0.5 - center[1]) / scale;
        const x = c * u + s * (v * sp + d * cp),
          y = -s * u + c * (v * sp + d * cp),
          z = -cp * v + sp * d;
        const lateral = ls * x + lc * y;
        const lx = Math.floor(208 + (lc * x - ls * y) * lightScale),
          ly = Math.floor(172 + (lateral * lp - z * lh) * lightScale);
        if (
          lx < 0 ||
          lx >= 416 ||
          ly < 0 ||
          ly >= 340 ||
          light.depth[ly * 416 + lx] - (lateral * lh + z * lp) < 0.72
        )
          continue;
        const col = screen.pixels[i];
        screen.pixels[i] =
          (0xff000000 |
            Math.round((col & 255) * 0.74) |
            (Math.round(((col >>> 8) & 255) * 0.82) << 8) |
            (Math.round(((col >>> 16) & 255) * 0.9) << 16)) >>>
          0;
      }
  }
  function environment(w, h, stage) {
    const p = screen.pixels;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x / w - 0.49) * 1.5,
          dy = (y / h - 0.47) * 1.25;
        const glow = Math.max(0, 1 - dx * dx - dy * dy);
        const band = Math.floor(glow * 18) / 18;
        const grain = (x * 17 + y * 13) % 7 === 0 ? 0.8 : 0;
        const tint = (v, k) => Math.round(v + band * k + grain);
        p[y * w + x] = VoxelVolume.ink((tint(18, 24) << 16) | (tint(35, 29) << 8) | tint(37, 23));
      }
    screen.depth.fill(-Infinity);
    screen.ids.fill(0);
    for (const b of solids) screen.box(...b);
    castShadows(w, h);
    back = { pixels: p.slice(), depth: screen.depth.slice(), ids: screen.ids.slice() };
  }

  function resident(lz) {
    const state = VoxelHabitat.appearance(lz),
      { pose, phase, tail, traits, tongue, blink, gene, hue } = state;
    const key = [lz.speciesId, lz.pattern, pose, phase, tail, traits.length, +tongue, +blink].join("/");
    let mesh = models.get(key);
    if (!mesh) {
      mesh = VoxelVolume.mesh(VoxelHabitat.volume(lz, state));
      if (models.size >= 220) models.delete(models.keys().next().value);
      models.set(key, mesh);
    }
    const colors = VoxelHabitat.palette(lz, hue, gene.s, gene.l, traits).map((shades) => {
      const c = shades[2];
      return ((c & 255) << 16) | (c & 0xff00) | ((c >>> 16) & 255);
    });
    const [x, y] = world(lz.x, lz.y),
      z = footing.get(lz)?.z ?? height(x, y);
    const id = register("resident", lz),
      size = 0.7 * speciesById(lz.speciesId).size * (lz.stage === "baby" ? 0.61 : 1) * Game.crowdScale();
    const a = Math.atan2((Math.sin(lz.angle || 0) * 10) / 7, Math.cos(lz.angle || 0));
    const origin = screen.project(x, y, z + 0.2);
    screen.transform(origin, view.angle, view.pitch, scale, size, a);
    screen.box(-1, 0, -0.24, 11, 3.7, 0.12, 0x99815a, id);
    for (const [axis, sign, px, py, pz, u, v, m] of mesh.faces)
      screen.face(axis, sign, px, py, pz, u, v, colors[m], id);
    for (const d of mesh.details) {
      const steps = Math.max(1, Math.ceil(Math.hypot(...d.a.map((n, k) => d.b[k] - n))));
      for (let j = 0; j <= steps; j++) {
        const f = j / steps,
          w = (d.w0 + (d.w1 - d.w0) * f) * 0.39;
        screen.box(
          d.a[0] + (d.b[0] - d.a[0]) * f,
          d.a[1] + (d.b[1] - d.a[1]) * f,
          d.a[2] + (d.b[2] - d.a[2]) * f,
          w,
          w,
          w,
          colors[d.material],
          id,
        );
      }
    }
    worldAxes();
    if (Game.selectedId === lz.id) mark(x, y, z + 0.25, 6 * size, 0xf3d778, id);
    if (lz.injuredT > 0 || lz.poisonT > 0)
      screen.box(x, y, z + 10 * size, 1, 1, 1, lz.injuredT > 0 ? 0xe79781 : 0xbaa7e0, id);
  }

  function enemy(r, t) {
    const enemy = r.snake,
      type = r.typeId,
      live = Game.raid === r;
    const fly = r.type?.flying;
    const [x, y] = world(enemy.x, fly ? Math.max(340, enemy.y) : enemy.y);
    const z = height(x, y) + (fly ? Math.max(3, (440 - enemy.y) * 0.075) : 0);
    const pick = live ? register("boss", r) : 0;
    const box = (dx, dy, dz, w, d, h, c) => screen.box(x + dx, y + dy, z + dz, w, d, h, c, pick);
    const skin = r.elite ? 0xcd9254 : 0x776f4a,
      belly = 0xe2bb78;
    if (fly) {
      const feathers = type === "crow" ? 0x394954 : 0x986947;
      box(0, 0, 2, 7, 3, 3, feathers);
      box(-3.4, 0, 4, 3.5, 3, 2.6, feathers);
      box(-5.7, 0, 4, 2, 1.7, 1, belly);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          box(i * 0.7, side * (2 + i * 1.8), 3 + Math.sin(t * 6) * i * 0.7, 5 - i * 0.65, 2.4, 1, feathers);
    } else if (type === "snake" || type === "monitor") {
      const monitor = type === "monitor";
      for (let i = 0; i < 15; i++) {
        const w = (1 - i / 17) * (monitor ? 5 : 3.4);
        box(i * 1.15, Math.sin(i * 0.45 + t * 2) * i * 0.27, 0.25, w + 1, w, w, i % 4 === 2 ? belly : skin);
      }
      box(-2, 0, 2, 5.3, 4, 3, skin);
      box(-4.4, 0, 2, 2.4, 3, 1.4, belly);
      for (const side of [-1, 1]) {
        box(-3.1, side * 1.95, 4, 0.75, 0.4, 0.65, 0x20292a);
        if (monitor) for (const limb of [2, 6]) box(limb, side * 2.5, 0.2, 2.8, 4, 1.2, skin);
      }
    } else {
      const shell = type === "spider" ? 0x5e4948 : type === "bugger" ? 0x486f65 : 0xa27747;
      box(1, 0, 1.6, 7, 5, 3.5, shell);
      box(-3, 0, 1.4, 3, 3, 2.8, shell);
      for (const sign of [-1, 1])
        for (let i = 0; i < 4; i++) {
          box(i * 1.4 - 3, sign * 3.5, 2, 0.7, 3, 0.7, belly);
          box(i * 1.8 - 3, sign * 5, 0.1, 0.8, 0.8, 2.5, shell);
        }
      if (type === "scorpion")
        for (let i = 0; i < 5; i++)
          box(5 + Math.sin(i * 0.6) * 2, 0, 2 + i * 1.25, 1.9, 1.5, 1.8, i === 4 ? belly : shell);
    }
    if (live && Game.aimWindow(r)) mark(x, y, height(x, y) + 0.4, 9, 0xffb866, pick);
    for (const web of r.webs || [])
      if (web.hp > 0) {
        const [wx, wy] = world(web.x, web.y),
          id = register("web", web);
        for (let i = 0; i < 18; i++) {
          const a = (i * Math.PI) / 9;
          for (const radius of [1.5, 3.2, 4.7])
            screen.box(
              wx + radius * Math.cos(a),
              wy + radius * Math.sin(a),
              height(wx, wy) + 0.2,
              1,
              1,
              0.45,
              0xe5ddc1,
              id,
            );
        }
      }
    if (r.dive) {
      const target = Game.state.lizards.find((l) => l.id === r.dive.targetId);
      if (target) {
        const [dx, dy] = world(target.x, target.y);
        mark(dx, dy, height(dx, dy) + 0.6, 6, 0xffba6a, register("dive", target));
      }
    }
  }

  function effects(stage, t) {
    const weather = typeof Weather !== "undefined" && Weather.now(stage, Game._motClock || 0);
    Render._wx = weather;
    if (weather?.on && !Motion.reduced) {
      for (let n = 0; n < 24; n++) {
        const x = ((n * 43 + t * 2) % 122) - 61,
          y = ((n * 17 + t) % 76) - 38,
          z = 2 + ((n * 13 + 120 - ((t * 9) % 24)) % 24);
        screen.box(x, y, z, 0.3, 0.3, stage === 8 ? 0.5 : 1.1, stage === 5 ? 0xf4bf85 : 0xc0cfc1);
      }
    }
    for (const fx of [...(Game._spawnFx || []), ...(Game._genesisFx || [])]) {
      const [x, y] = world(fx.x, fx.y),
        f = 1 - fx.t / fx.max;
      for (let n = 0; n < 8; n++)
        screen.box(
          x + Math.cos(n * 0.785) * (2 + 5 * f),
          y + Math.sin(n * 0.785) * (2 + 5 * f),
          height(x, y) + f * 7,
          0.6,
          0.6,
          0.65,
          fx.hue == null ? 0xd76758 : 0xf1dc9c,
        );
    }
    for (const tail of Game._autoTails || []) {
      const [x, y] = world(tail.x, tail.y);
      for (let i = 0; i < 6; i++)
        screen.box(
          x + i * 0.6,
          y + Math.sin(i * 0.7 + t * 6) * 0.5,
          height(x, y) + 0.1,
          0.85,
          0.7,
          0.65,
          0x927746,
        );
    }
  }
  function draw(render) {
    const cv = render.ctx.canvas,
      cw = cv.clientWidth,
      ch = cv.clientHeight;
    if (!cw || !ch) return;
    const w = clamp(Math.round(cw * 0.66), 230, 540),
      h = clamp(Math.round((w * ch) / cw), 90, 840);
    if (!screen || screen.canvas.width !== w || screen.canvas.height !== h) {
      screen = VoxelVolume.surface(w, h);
      cacheKey = null;
    }
    const c = Math.abs(Math.cos(view.angle)),
      s = Math.abs(Math.sin(view.angle));
    const spanX = c * 134 + s * 86,
      spanY = (s * 134 + c * 86) * Math.sin(view.pitch) + 34 * Math.cos(view.pitch);
    scale = Math.min(w / (spanX + 6), h / (spanY + 8)) * view.zoom;
    center = [w * (0.5 + view.panX), h * (0.5 + view.panY) + 6 * Math.cos(view.pitch) * scale, 0];
    worldAxes();
    const stage = Game.currentStage().id;
    const key = [geometry(stage), view.angle, view.pitch, view.zoom, view.panX, view.panY].join("/");
    if (cacheKey !== key) {
      environment(w, h, stage);
      cacheKey = key;
      render._stageBoulders = TerrariumLand.perches;
    } else {
      screen.pixels.set(back.pixels);
      screen.depth.set(back.depth);
      screen.ids.set(back.ids);
    }
    picks = [];
    Game.state.eggs.forEach((egg, i) => {
      const [x, y] = world(NEST.x - 24 + i * 24, NEST.y + 1),
        z = height(x, y) + 0.5,
        id = register("egg", i);
      screen.box(x, y, z, 1.8, 1.6, 1, 0xe3c899, id);
      screen.box(x, y, z + 0.8, 2.1, 1.9, 1.2, 0xf2e4bd, id);
      screen.box(x, y, z + 2, 1.4, 1.3, 0.7, 0xffefc6, id);
    });
    const t = Motion.reduced ? 0 : render.time;
    for (const lz of Game.state.lizards) if (Game.isVisible(lz)) resident(lz);
    if (Game.raid || Game.corpse) enemy(Game.raid || Game.corpse, t);
    effects(stage, t);
    screen.ctx.putImageData(screen.image, 0, 0);
    render.ctx.imageSmoothingEnabled = false;
    render.ctx.drawImage(screen.canvas, 0, 0, W, H);
  }
  function label(x, y) {
    if (!screen) return { x, y };
    const [px, py] = world(x, y),
      p = screen.project(px, py, height(px, py) + 3);
    return { x: (p[0] * W) / screen.canvas.width, y: (p[1] * H) / screen.canvas.height };
  }
  return { draw, hit, label, orbit, zoom, reset, step };
})();
