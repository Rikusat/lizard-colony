// Small, fixed-resolution dioramas for the workshop, nest, and chart.
const CabinetScenery = (() => {
  const metal = ["#74998a", "#486b60", "#2a4c46"];
  const brass = ["#ecc889", "#bf9057", "#865f3e"];
  const spruce = ["#35564e", "#29443e", "#1b332e"];
  const wood = ["#a97b50", "#83583c", "#5d402f"];
  const ivory = ["#eddabb", "#b9aa8e", "#8a806c"];
  const moss = ["#9dbb84", "#698c60", "#436950"];

  function polygon(c, pts, color) {
    c.fillStyle = color;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y))));
    c.closePath();
    c.fill();
  }

  // A world-space tile maps to a 20 by 10 diamond; vertical distances are native pixels.
  function iso(c, ox, oy) {
    const p = (u, v, h = 0) => [ox + (u - v) * 10, oy + (u + v) * 5 - h];
    const box = (u, v, w, d, base, h, colors) => {
      const a = p(u, v, base + h),
        b = p(u + w, v, base + h),
        e = p(u, v + d, base + h);
      const f = p(u + w, v + d, base + h),
        g = p(u + w, v + d, base);
      polygon(c, [e, f, g, p(u, v + d, base)], colors[1]);
      polygon(c, [f, b, p(u + w, v, base), g], colors[2]);
      polygon(c, [a, b, f, e], colors[0]);
    };
    return { p, box };
  }

  function planter(box, u, v, base = 0) {
    box(u, v, 1.1, 1.1, base, 4, wood);
    box(u + 0.1, v + 0.1, 0.9, 0.9, base + 4, 4, metal);
    box(u + 0.4, v + 0.4, 0.35, 0.35, base + 8, 5, wood);
    box(u - 0.1, v + 0.25, 0.65, 0.35, base + 12, 3, moss);
    box(u + 0.35, v + 0.35, 0.45, 0.54, base + 13, 5, moss);
    box(u + 0.72, v + 0.12, 0.5, 0.55, base + 13, 3, moss);
    box(u + 0.55, v + 0.25, 0.28, 0.4, base + 17, 3, moss);
  }

  const workshop = {
    w: 348,
    h: 216,
    stations: [
      { key: "tank", u: -5, v: 1, w: 40, h: 36, name: "錬成" },
      { key: "archive", u: -2, v: 5, w: 47, h: 30, name: "図鑑" },
      { key: "rocket", u: 3, v: -5, w: 36, h: 63, name: "宇宙港" },
      { key: "desks", u: 5, v: 1, w: 53, h: 32, name: "研究" },
      { key: "shelf", u: 5, v: 5, w: 46, h: 30, name: "標本棚" },
      { key: "feed", u: 0, v: -0.6, w: 72, h: 52, name: "飼育槽" },
    ],
  };
  function stationPoint(s) {
    return [174 + (s.u - s.v) * 10, 129 + (s.u + s.v) * 5];
  }

  function workshopArt(c, tier) {
    const { box } = iso(c, 174, 129);
    c.fillStyle = "#10221f";
    c.fillRect(0, 0, workshop.w, workshop.h);
    // The cutaway rests on a stepped stone foundation.
    box(-7, -7, 14, 14, -13, 8, ["#466054", "#3b4d43", "#273c34"]);
    box(-7.12, -7.12, 14.24, 14.24, -5, 3, brass);
    box(-7, -7, 14, 14, -2, 2, spruce);
    const tiles = ["#536e60", "#5a7567", "#536d60", "#60796a"];
    for (let u = -7; u < 7; u++)
      for (let v = -7; v < 7; v++) {
        box(u + 0.03, v + 0.03, 0.94, 0.94, 0, 0.5, [
          tiles[Math.abs(u * 11 + v * 7 + u * v) % 4],
          "#435a4e",
          "#42574d",
        ]);
      }
    for (let i = -7; i < 7; i++) {
      const wall = i % 3 === 0 ? ["#b7b49a", "#697d6e", "#607064"] : ["#aaa991", "#7b8a79", "#667b6d"];
      box(-7, i, 0.42, 1, 0, 30, wall);
      box(i, -7, 1, 0.42, 0, 30, wall);
      box(-7, i, 0.42, 1, 0, 4, wood);
      box(i, -7, 1, 0.42, 0, 4, wood);
    }
    for (let i = -7; i <= 6; i += 3) {
      box(i, -7, 0.2, 0.56, 0, 31, brass);
      box(-7, i, 0.56, 0.2, 0, 31, brass);
    }
    box(-7, -7, 14, 0.45, 30, 2, metal);
    box(-7, -7, 0.45, 14, 30, 2, metal);
    for (let k = 0; k < 3; k++) {
      box(-4 + k * 1.15, -6.69, 1, 0.08, 10, 15, ["#c0ddbd", "#516f63", "#254841"]);
      box(-4 + k * 1.15, -6.6, 1, 0.05, 11, 2, brass);
    }
    for (let i = 0; i < 3; i++) {
      box(-6.6, -4.3 + i * 0.45, 0.08, 0.27, 12, 8, metal);
      box(-6.5, -4.3 + i * 0.45, 0.08, 0.27, 16, 2, brass);
    }
    box(-6.55, 1.9, 0.3, 2.1, 19, 2, spruce);
    box(-6.39, 2.05, 0.24, 1.75, 18, 2, ivory);
    planter(box, -5.9, -5.4);
    box(-6, -1.4, 1.3, 1, 0, 9, wood);
    box(-6, -1.4, 1.3, 1, 9, 2, brass);
    planter(box, -6, -1.4, 11);
    function bench(u, v, w, d, h) {
      for (const du of [-w / 2, w / 2 - 0.25])
        for (const dv of [-d / 2, d / 2 - 0.25]) box(u + du, v + dv, 0.25, 0.25, 0, h, spruce);
      box(u - w / 2, v - d / 2, w, d, h, 4, wood);
      box(u - w / 2, v - d / 2, w, d, h + 4, 1.5, brass);
    }
    for (const s of [...workshop.stations].sort((a, b) => a.u + a.v - b.u - b.v)) {
      const u = s.u,
        v = s.v;
      switch (s.key) {
        case "tank": {
          bench(u, v, 2.5, 1.9, 7);
          for (const dv of [-0.14, 0.52]) {
            box(u - 0.6, v + dv - 0.58, 0.95, 0.65, 13, 2, ivory);
            box(u - 0.45, v + dv - 0.47, 0.65, 0.43, 15, 10, ["#b4e1ba", "#70ae92", "#43867a"]);
            box(u - 0.48, v + dv - 0.5, 0.7, 0.46, 25, 2, brass);
          }
          break;
        }
        case "rocket": {
          box(u - 1.3, v - 1.3, 2.6, 2.6, 0, 3, metal);
          box(u - 0.65, v - 0.65, 1.3, 1.3, 3, 7, spruce);
          box(u - 0.55, v - 0.55, 1.1, 1.1, 10, 20, ivory);
          box(u - 0.52, v - 0.52, 1.04, 1.04, 21, 4, metal);
          box(u - 0.38, v - 0.38, 0.76, 0.76, 30, 6, wood);
          box(u - 0.2, v - 0.2, 0.4, 0.4, 36, 5, brass);
          for (const [du, dv] of [
            [-0.95, 0.18],
            [0.3, 0.58],
            [0.64, -0.45],
          ])
            box(u + du, v + dv, 0.4, 0.5, 3, 10, wood);
          break;
        }
        case "feed":
          box(u - 1.9, v - 1.1, 3.8, 2.2, 0, 8, spruce);
          box(u - 2, v - 1.2, 4, 2.4, 8, 2, metal);
          box(u - 1.55, v - 0.85, 3.1, 1.6, 10, 2, spruce);
          box(u - 0.42, v - 0.3, 0.84, 0.6, 12, 7, brass);
          break;
        case "desks": {
          bench(u, v, 3, 1.8, 8);
          for (let i = 0; i < 2; i++) {
            box(u - 0.9 + i * 1.35, v - 0.55, 0.95, 0.4, 14, 7, metal);
            box(u - 0.77 + i * 1.35, v - 0.12, 0.71, 0.04, 16, 4, ["#85ae9a", "#c4d6a4", "#537961"]);
          }
          box(u - 1, v + 0.32, 1.65, 0.38, 14, 1, ivory);
          break;
        }
        case "archive":
          bench(u, v, 2.8, 1.75, 7);
          for (let i = 0; i < 5; i++)
            box(u - 1.15 + i * 0.4, v - 0.26, 0.31, 0.8, 12, 6 + (i % 3), [brass, metal, ivory][i % 3]);
          break;
        case "shelf":
          bench(u, v, 2.5, 1.65, 5);
          for (let i = 0; i < 3; i++) {
            box(u - 0.9 + i * 0.64, v - 0.35, 0.4, 0.5, 11, 2, metal);
            if (i < tier) box(u - 0.85 + i * 0.64, v - 0.31, 0.3, 0.4, 13, 5, [brass, ivory, moss][i]);
          }
          break;
      }
      if (s.key === "feed") {
        const [x, y] = stationPoint(s);
        c.fillStyle = "#223b34";
        c.fillRect(x - 32, y - 43, 64, 35);
        c.fillStyle = "#b79b6d";
        c.fillRect(x - 33, y - 44, 66, 2);
        c.fillStyle = "#758d78";
        c.fillRect(x - 33, y - 42, 2, 33);
        c.fillStyle = "#342e25";
        c.fillRect(x + 31, y - 42, 2, 35);
      }
    }
    planter(box, -4.8, 5.8);
  }

  function nestFloor(c, w, h, cx, cy, r) {
    c.fillStyle = "#172a25";
    c.fillRect(0, 0, w, h);
    const { box, p } = iso(c, Math.round(cx), Math.round(cy + r * 0.23));
    // Soil strata and pebble seams surround the actual colony's genetic network.
    for (let j = 0; j < Math.ceil(h / 9); j++)
      for (let i = 0; i < Math.ceil(w / 18); i++) {
        const hash = (((i + 41) * 73471) ^ ((j + 83) * 12007) ^ (i * j * 59)) >>> 0;
        const x = i * 18 + (hash % 13),
          y = j * 9 + ((hash >> 5) % 7);
        c.fillStyle = ["#1b3029", "#25382d", "#283b31", "#203329"][hash % 4];
        c.fillRect(x, y, 2 + (hash % 5), 1 + (hash % 3 === 0));
        if (hash % 6 === 0) {
          c.fillStyle = "#344137";
          c.fillRect(x + 1, y - 1, 2, 1);
        }
      }
    c.save();
    c.translate(cx, cy);
    const k = r / 25;
    c.scale(k, k);
    c.translate(-cx, -cy);
    const ring = [
      [-1.2, -1.15],
      [-0.4, -1.6],
      [0.55, -1.58],
      [1.2, -1.05],
      [1.75, -0.4],
      [1.65, 0.43],
      [1.1, 1.2],
      [0.25, 1.6],
      [-0.6, 1.45],
      [-1.3, 1.1],
      [-1.7, 0.4],
      [-1.65, -0.4],
    ];
    box(-1.1, -1.05, 2.2, 2.1, 0, 2, wood);
    function rim(front) {
      ring
        .filter(([u, v]) => u + v > 0 === front)
        .sort((a, b) => a[0] + a[1] - b[0] - b[1])
        .forEach(([u, v], i) => {
          box(u - 0.35, v - 0.3, 0.75, 0.66, 0, 3, wood);
          box(u - 0.28, v - 0.27, 0.64, 0.58, 3, 2, i % 2 ? brass : wood);
        });
    }
    rim(false);
    const shades = [
      ["#675746", "#a28a64", "#d2b482", "#e8d6a5", "#fff0c1"],
      ["#72532f", "#a37543", "#cf9957", "#e7b969", "#ffe399"],
    ];
    for (const [u, v, width, height, tone] of [
      [-0.44, -0.43, 7, 11, 0],
      [0.45, -0.45, 8, 14, 1],
      [-0.1, 0.55, 7, 10, 0],
    ]) {
      const [x, y] = p(u, v);
      for (let j = -height; j < height; j++)
        for (let i = -width; i < width; i++) {
          const ny = j / height,
            nx = i / (width * (1 + 0.18 * ny));
          if (nx * nx + ny * ny >= 1) continue;
          const nz = Math.sqrt(1 - nx * nx - ny * ny);
          const lit = Math.max(0, -nx * 0.46 - ny * 0.65 + nz * 0.53);
          const speck = (i * 11 + j * 17) % 27 === 0 && ny > -0.7 && ny < 0.65;
          const band = Math.max(0, Math.min(4, Math.floor(lit * 4.7) + 1) - (speck ? 1 : 0));
          c.fillStyle = shades[tone][band];
          c.fillRect(Math.round(x + i), Math.round(y - height + j + 2), 1, 1);
        }
    }
    rim(true);
    c.restore();
  }

  // Sample a lit sphere at cell centres; terrain is fixed to spherical coordinates.
  function planet(c, st) {
    const size = c.canvas.width,
      radius = size * 0.46;
    c.clearRect(0, 0, size, size);
    const base = [st.ground, st.sky, st.pebble, st.rock].map((hex) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    );
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - size / 2) / radius,
          ny = (y + 0.5 - size / 2) / radius,
          nz2 = 1 - nx * nx - ny * ny;
        if (nz2 <= 0) continue;
        const nz = Math.sqrt(nz2),
          a = Math.atan2(nx, nz) + st.id * 0.65,
          b = Math.asin(ny);
        const terrain =
          Math.sin(a * 4 + Math.sin(b * 5)) + 0.6 * Math.sin(b * 7 - a * 2) + 0.32 * Math.sin(a * 9 + b * 3);
        const color = base[terrain < -0.5 ? 0 : terrain < 0.42 ? 1 : terrain < 1.22 ? 2 : 3];
        const light = Math.max(0.33, Math.round((0.65 + (-nx * 0.5 - ny * 0.65 + nz * 0.5) * 0.57) * 7) / 7);
        c.fillStyle =
          "rgb(" + color.map((v) => Math.round(Math.min(255, v * light + (light > 0.98 ? 12 : 0)))).join(",") + ")";
        c.fillRect(x, y, 1, 1);
      }
  }
  return { workshop, stationPoint, workshopArt, nestFloor, planet };
})();
