"use strict";

// Distances in habitat units. Save coordinates locate a foot on the ground;
// elevation is sampled from the very same terraces that form the soil mesh.
const TerrariumLand = (() => {
  const banks = [
    [0xe4bb7c, 0xb16d46, 0x985039, 0x547445, 0x94ad64, 0x479d99],
    [0xb9a28e, 0x916e64, 0x715959, 0x566c60, 0xa8b68c, 0x548f9c],
    [0xa8ad6d, 0x77794e, 0x6d674a, 0x31694b, 0x83b66b, 0x469e99],
    [0xa8a278, 0x817558, 0x796d58, 0x40795a, 0xa3b374, 0x669b8f],
    [0x9c8173, 0x73595a, 0x805449, 0x77604e, 0xc58f58, 0xed8748],
    [0x92aa70, 0x697952, 0x696050, 0x2c7257, 0x91bc62, 0x3f9d88],
    [0x89b3aa, 0x657d80, 0x466c74, 0x387b72, 0x7ec2a0, 0x3e939f],
    [0xe4e4d4, 0xa5b7bb, 0x9ba5b4, 0x527c7b, 0xafcdc2, 0x83c4d1],
    [0xaab29e, 0x727b78, 0x607279, 0x4e7460, 0x9cb28a, 0x66a9ad],
    [0xd5b281, 0xa38564, 0x94765d, 0x4d7653, 0xabb977, 0x4f9993],
  ];
  const perches = [
    { x: 742, y: 370, r: 28 },
    { x: 1005, y: 553, r: 35 },
    { x: 304, y: 424, r: 23 },
  ];
  const world = (x, y) => [(x - 640) / 10, (y - 440) / 7];
  const river = (y) => 43 + Math.sin(y * 0.075) * 5.5;
  function hash(i, j, seed) {
    let n = Math.imul(i + 819, 374761393) ^ Math.imul(j + 373, 668265263) ^ Math.imul(seed, 1274126177);
    return (Math.imul(n ^ (n >>> 13), 1274126177) >>> 0) / 4294967296;
  }
  function shade(color, factor) {
    const v = (n) => Math.max(0, Math.min(255, Math.round(n * factor)));
    return (v(color >> 16) << 16) | (v((color >> 8) & 255) << 8) | v(color & 255);
  }
  function soil(x, y) {
    const cx = Math.floor(x / 4) * 4 + 2,
      cy = Math.floor(y / 4) * 4 + 2;
    const d = Math.abs(cx - river(cy));
    if (d < 4) return 0.5;
    const hill = 2.9 * Math.exp(-((cx + 35) ** 2 / 900 + (cy + 22) ** 2 / 280));
    return 1.2 + Math.floor(hill + Math.max(0, 1.5 * Math.sin(cx * 0.07 + cy * 0.05))) * 0.65;
  }
  function height(x, y) {
    let h = soil(x, y);
    for (const p of perches) {
      const [px, py] = world(p.x, p.y - p.r * 0.55);
      const d = Math.max(Math.abs(x - px) / (p.r * 0.17), Math.abs(y - py) / (p.r * 0.115));
      if (d < 1) h += d < 0.65 ? 2.6 : 1.3;
    }
    return h;
  }
  function scenery(box, stage) {
    const [sand, clay, rock, leaf, tip, water] = banks[stage - 1] || banks[0];
    const dark = 0x203331,
      brass = 0xb19266;
    // Cast shadow, stepped enamel foot, brass inlay and the exposed soil strata.
    box(2, 3, -8.8, 134, 85, 0.4, 0x172b2b);
    box(0, 0, -8.5, 133, 85, 1.7, dark);
    box(0, 0, -6.8, 133.5, 85.5, 0.55, brass);
    box(0, 0, -6.25, 132, 84, 1.4, 0x344640);
    box(0, 0, -5.1, 128, 80, 3.5, shade(clay, 0.71));
    box(0, 0, -2.3, 128, 80, 1.2, clay);
    for (let i = -16; i < 16; i++)
      for (let j = -10; j < 10; j++) {
        const x = i * 4 + 2,
          y = j * 4 + 2,
          h = soil(x, y),
          r = hash(i, j, stage),
          wet = h === 0.5;
        const drift = Math.sin(x * 0.09 + y * 0.18) * 0.023;
        box(x, y, -1.3, 4, 4, h + 1.3, shade(wet ? water : sand, 0.965 + drift + r * 0.062));
        // Grain clusters and ripples break up the larger cut blocks at pixel scale.
        for (let k = 0; k < (wet ? 1 : 3); k++) {
          const u = hash(i * 3 + k, j, stage + 7),
            v = hash(i, j * 3 + k, stage + 2);
          box(
            x + (u - 0.5) * 3,
            y + (v - 0.5) * 3,
            h + 0.012,
            wet ? 1 + r * 1.7 : 0.3 + u,
            0.27 + r * 0.29,
            0.04,
            shade(wet ? water : sand, wet ? 1.15 : v > 0.5 ? 1.08 : 0.87),
          );
        }
        if (i === -16 || i === 15)
          box(x + (i < 0 ? -1.99 : 1.99), y, -2.3 + r, 0.1, 2 + r, 0.4, shade(clay, 0.8 + r * 0.4));
        if (j === -10 || j === 9)
          box(x, y + (j < 0 ? -1.99 : 1.99), -3 + r * 1.4, 1.6 + r * 2, 0.1, 0.55, shade(rock, 1.1));
      }

    // Each course has a recessed corner and a different eroded edge. Thin
    // mineral bands wrap around the sides and remain visible from the rear.
    function mesa(x, y, s, h) {
      let z = soil(x, y);
      const tones = [rock, shade(clay, 1.12), clay, shade(rock, 1.18), shade(sand, 1.02)];
      for (let i = 0; i < 5; i++) {
        const w = s * (1 - i * 0.095),
          d = w * 0.74,
          off = (hash(i, x, stage) - 0.5) * s * 0.1;
        box(x + off, y, z, w, d * 0.73, h / 5 + 0.02, tones[i]);
        box(x + off - w * 0.04, y, z, w * 0.8, d, h / 5 + 0.02, tones[i]);
        box(x + off + w * 0.09, y, z, w * 0.66, d * 1.08, h / 5 + 0.02, tones[i]);
        for (let k = 0; k < 3; k++) {
          const dx = (hash(k, i + x, stage) - 0.5) * w * 0.68;
          box(x + off + dx, y + d * 0.5, z + h * 0.08, 1 + w * 0.14, 0.25, 0.28, shade(tones[i], 1.22));
        }
        z += h / 5;
      }
    }
    mesa(-48, -29, 21, 14);
    mesa(-58, -22, 9, 7);
    mesa(-31, -32, 10, 9);
    mesa(55, -30, 12, 9);
    mesa(-59, 17, 7, 4);
    // The landmarks share the ground mesh but have distinct silhouettes from every azimuth.
    if (stage === 2 || stage === 9) {
      for (let i = 0; i < 3; i++) {
        const x = 1 + i * 8,
          y = -32 + (i % 2) * 2,
          h = (stage === 9 ? 13 : 9) + i * 2,
          z = soil(x, y);
        box(x, y, z, 5, 5, h, rock);
        for (let n = 1; n < h - 1; n += 3) box(x, y, z + n, 5.2, 5.2, 0.6, stage === 9 ? 0x80cec5 : 0xd5bf8b);
        box(x, y, z + h, 4, 4, 1.2, clay);
      }
    } else if (stage === 5) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        mesa(10 + Math.cos(a) * 6, -32 + Math.sin(a) * 4, 5.5, 4 + (i % 3));
      }
      box(10, -32, 5.2, 8, 6, 0.5, 0xe78b50);
      box(10, -32, 5.7, 3.5, 3, 0.3, 0xffcd75);
    } else if (stage === 8 || stage === 6) {
      box(10, -32, soil(10, -32), 11, 8, 2.5, rock);
      box(10, -32, 4, 4, 4, 15, stage === 8 ? 0x6e9da6 : 0x54836c);
      for (let i = 0; i < 3; i++) box(10, -32, 10 + i * 2, 4.2, 4.2, 0.5, stage === 8 ? 0xbbe8dd : 0xa7cd83);
    } else if ([4, 7, 10].includes(stage)) {
      for (let i = 0; i < 3; i++)
        box(10, -32, 1.7 + i * 1.3, 22 - 3 * i, 11 - i * 2, 1.5, shade(sand, 1 - i * 0.06));
      for (let i = 0; i < 3; i++)
        for (const y of [-34, -30]) box(4 + i * 6, y, 5.2, 2, 2, stage === 7 && i === 1 ? 3 : 7, rock);
      box(10, -32, 12.2, stage === 7 ? 12 : 18, 7, 1.8, clay);
    } else if (stage === 1) {
      for (const x of [4, 18]) mesa(x, -32, 9, 11);
      box(11, -32, 12, 22, 5, 3.5, rock);
      box(11, -32, 15, 18, 4, 1.4, shade(sand, 1.05));
    }
    const lush = [3, 4, 6, 7].includes(stage),
      industrial = stage === 2 || stage === 9;
    function plant(x, y, s, seed) {
      const base = soil(x, y),
        r = hash(seed, 6, stage);
      if (industrial && s > 1.4) {
        box(x, y, base, 3 * s, 2.6 * s, 8 * s, rock);
        for (let i = 1; i < 5; i++) box(x, y, base + i * 1.5 * s, 3.15 * s, 2.7 * s, 0.3 * s, water);
      } else if (stage === 8 || stage === 7) {
        for (let i = 0; i < 5; i++) {
          const h = (2 + hash(seed, i, stage) * 4) * s;
          box(
            x + Math.cos(i * 2) * s,
            y + Math.sin(i * 2) * s,
            base,
            1.4 * s,
            1.3 * s,
            h,
            shade(tip, 0.82 + i * 0.07),
          );
        }
      } else if ((lush || seed === 62) && s > 1.05) {
        // Twisting trunk and staggered foliage pads leave daylight under the canopy.
        for (let j = 0; j < 6; j++) box(x + j * 0.19 * s, y, base + j * s, 1.25 * s, 1.25 * s, 1.3 * s, clay);
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + r,
            reach = (1 + (i % 3)) * s;
          const dx = Math.cos(a) * reach,
            dy = Math.sin(a) * reach,
            z = base + (4.3 + (i % 3) * 0.8) * s;
          box(x + s + dx * 0.5, y + dy * 0.5, z, Math.abs(dx) + 0.6, Math.abs(dy) + 0.6, 0.8 * s, woodColor);
          box(x + s + dx, y + dy, z + 0.8 * s, 3.6 * s, 2.6 * s, 1.4 * s, leaf);
          box(x + s + dx - 0.2 * s, y + dy, z + 1.9 * s, 2.8 * s, 2 * s, s, shade(tip, 0.83 + r * 0.13));
        }
      } else if (s > 1.2) {
        const h = (4 + r * 3) * s;
        box(x, y, base, 1.65 * s, 1.35 * s, h, leaf);
        box(x, y, base, 1.1 * s, 1.75 * s, h, leaf);
        box(x - 0.47 * s, y - 0.5 * s, base + 0.2 * s, 0.38 * s, 0.7 * s, h, tip);
        box(x, y, base + h, 1.05 * s, 1.1 * s, 0.6 * s, tip);
        for (const sign of [-1, 1]) {
          const z = base + h * (sign < 0 ? 0.44 : 0.63);
          box(x + sign * s, y, z, 2.1 * s, s, 1.1 * s, leaf);
          box(x + sign * 1.8 * s, y, z, s, s, (1.8 + r) * s, tip);
        }
        if (seed % 2) box(x + 0.2 * s, y, base + h + 0.5 * s, 0.7 * s, 0.7 * s, s * 0.5, 0xd98565);
      } else {
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 3; j++) {
            const a = i * 1.047 + r,
              reach = j * s * 0.79;
            box(
              x + Math.cos(a) * reach,
              y + Math.sin(a) * reach,
              base + j * s * 0.7,
              s * (1.2 - 0.21 * j),
              s * (1.2 - 0.2 * j),
              s * 0.92,
              i % 2 ? leaf : tip,
            );
          }
      }
    }
    const woodColor = shade(clay, 0.74);
    plant(28, -30, 2.5, 62);
    if (lush) for (let i = 0; i < 7; i++) plant(-55 + i * 14, -34 + (i % 2) * 3, 1.8 + hash(i, 3, stage), i);
    // Driftwood lying across the water, with a broken rising branch.
    for (let i = 0; i < 13; i++) {
      box(33 + i, -13 + i * 0.42, 2.6 + Math.sin(i * 0.35) * 0.35, 1.7, 2, 1.65, woodColor);
      if (i > 5 && i < 10) box(35 + i, -12 + (i - 5) * 1.1, 3 + (i - 5) * 0.52, 1.4, 1.5, 1.3, clay);
    }
    for (const [x, y, s] of [
      [-56, -11, 1.8],
      [-40, -30, 1.5],
      [30, -32, 2.3],
      [59, 10, 1.8],
      [-55, 23, 1.4],
      [-17, -35, 1.3],
      [52, 30, 1.35],
    ])
      plant(x, y, s, x + y);
    for (let i = 0; i < 95; i++) {
      const x = hash(i, 11, stage) * 121 - 60.5,
        y = hash(i, 16, stage) * 74 - 37;
      if (Math.abs(x - river(y)) < 4) continue;
      const r = hash(i, 9, stage);
      if (r > 0.67) plant(x, y, 0.4 + r * 0.4, i);
      else
        box(x, y, soil(x, y), 0.45 + r * 2.4, 0.5 + r * 1.55, 0.22 + r * 0.85, shade(rock, 1.12 + r * 0.3));
    }
    for (const p of perches) {
      const [x, y] = world(p.x, p.y - p.r * 0.55),
        z = soil(x, y);
      box(x, y, z, p.r * 0.34, p.r * 0.23, 1.3, rock);
      box(x, y, z + 1.3, p.r * 0.22, p.r * 0.15, 1.3, shade(sand, 0.92));
    }
    // Slender glass seams and brass corner clamps frame the enclosure on all sides.
    for (const x of [-64.5, 64.5])
      for (const y of [-40.5, 40.5]) {
        box(x, y, -4.8, 2, 2, 5, brass);
        box(x, y, 0.2, 0.35, 0.35, 21, 0x9dc3b2);
        box(x, y, 21, 1.35, 1.35, 1.1, brass);
      }
    for (const x of [-64.5, 64.5]) box(x, 0, 21.3, 0.25, 81, 0.35, 0x90b3a6);
    for (const y of [-40.5, 40.5]) box(0, y, 21.3, 129, 0.25, 0.35, 0x90b3a6);
  }
  return { world, soil, height, scenery, perches };
})();
