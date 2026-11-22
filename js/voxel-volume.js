"use strict";

// Orthographic software rasterizer. The nearest solid surface supplies both the
// colour and the pick ID at each pixel, including when the camera is underneath a branch.
const VoxelVolume = (() => {
  function ink(rgb, light = 1) {
    const shade = (n) => Math.min(255, Math.round(n * light));
    return (0xff000000 | shade(rgb >> 16) | (shade((rgb >> 8) & 255) << 8) | (shade(rgb & 255) << 16)) >>> 0;
  }

  function surface(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d"),
      image = ctx.createImageData(w, h);
    const pixels = new Uint32Array(image.data.buffer),
      depth = new Float32Array(w * h),
      ids = new Int32Array(w * h);
    let axes, origin, lights;

    function project(x, y, z) {
      return origin.map((v, i) => v + axes[0][i] * x + axes[1][i] * y + axes[2][i] * z);
    }
    function transform(center, angle, pitch, scale, size = 1, facing = 0) {
      const a = angle + facing,
        c = Math.cos(a),
        s = Math.sin(a),
        cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      origin = center;
      axes = [
        [c * scale, s * sp * scale, s * cp],
        [-s * scale, c * sp * scale, c * cp],
        [0, -cp * scale, sp],
      ].map((vec) => vec.map((v) => v * size));
      lights = [
        -0.21 * Math.cos(facing) + 0.13 * Math.sin(facing),
        0.21 * Math.sin(facing) + 0.13 * Math.cos(facing),
        0.22,
      ];
    }
    // Two screen-space basis vectors describe one face. Depth is affine across it.
    function face(axis, sign, x, y, z, du, dv, rgb, id) {
      if (axes[axis][2] * sign <= 0) return;
      const u = axes[(axis + 1) % 3],
        v = axes[(axis + 2) % 3],
        p = project(x, y, z);
      const ux = u[0] * du,
        uy = u[1] * du,
        vx = v[0] * dv,
        vy = v[1] * dv;
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 0.00001) return;
      const minX = Math.max(0, Math.ceil(p[0] + Math.min(0, ux) + Math.min(0, vx) - 0.5));
      const maxX = Math.min(w - 1, Math.floor(p[0] + Math.max(0, ux) + Math.max(0, vx) - 0.5));
      const minY = Math.max(0, Math.ceil(p[1] + Math.min(0, uy) + Math.min(0, vy) - 0.5));
      const maxY = Math.min(h - 1, Math.floor(p[1] + Math.max(0, uy) + Math.max(0, vy) - 0.5));
      const col = ink(rgb, 0.85 + sign * lights[axis]),
        au = vy / det,
        av = -uy / det;
      const uz = u[2] * du,
        vz = v[2] * dv;
      for (let row = minY; row <= maxY; row++) {
        const ry = row + 0.5 - p[1],
          rx = minX + 0.5 - p[0];
        let a = rx * au - (ry * vx) / det,
          b = rx * av + (ry * ux) / det;
        for (let colX = minX, i = row * w + minX; colX <= maxX; colX++, i++, a += au, b += av) {
          if (a < -0.00001 || a > 1.00001 || b < -0.00001 || b > 1.00001) continue;
          const d = p[2] + a * uz + b * vz;
          if (d >= depth[i]) {
            depth[i] = d;
            pixels[i] = col;
            ids[i] = id;
          }
        }
      }
    }
    function box(x, y, z, sx, sy, sz, color, id = 0) {
      const left = x - sx / 2,
        back = y - sy / 2;
      for (let axis = 0; axis < 3; axis++) {
        const sign = axes[axis][2] >= 0 ? 1 : -1,
          hi = sign > 0;
        if (axis === 0) face(0, sign, left + (hi ? sx : 0), back, z, sy, sz, color, id);
        if (axis === 1) face(1, sign, left, back + (hi ? sy : 0), z, sz, sx, color, id);
        if (axis === 2) face(2, sign, left, back, z + (hi ? sz : 0), sx, sy, color, id);
      }
    }
    return { canvas, ctx, image, pixels, depth, ids, box, face, transform, project };
  }

  // Combine neighbouring coplanar skin voxels of the same material. Internal
  // faces never enter the render queue. This mesh is shared across camera angles.
  function mesh(data) {
    const planes = new Map();
    for (const cell of data.cells.values()) {
      const p = [cell.x, cell.y, cell.z];
      for (let axis = 0; axis < 3; axis++)
        for (const sign of [-1, 1]) {
          const neighbor = p.slice();
          neighbor[axis] += sign;
          if (data.cells.has(data.key(...neighbor))) continue;
          const layer = p[axis] + sign * 0.5,
            u = p[(axis + 1) % 3],
            v = p[(axis + 2) % 3];
          const key = [axis, sign, layer, cell.m].join("/");
          if (!planes.has(key)) planes.set(key, { axis, sign, layer, mat: cell.m, grid: new Set() });
          planes.get(key).grid.add((v + 64) * 256 + u + 64);
        }
    }
    const faces = [];
    for (const { axis, sign, layer, mat, grid } of planes.values()) {
      for (const start of [...grid].sort((a, b) => a - b)) {
        if (!grid.has(start)) continue;
        let width = 1,
          height = 1;
        while (grid.has(start + width)) width++;
        outer: for (; ; height++)
          for (let i = 0; i < width; i++) if (!grid.has(start + height * 256 + i)) break outer;
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) grid.delete(start + j * 256 + i);
        const p = [];
        p[axis] = layer;
        p[(axis + 1) % 3] = (start % 256) - 64.5;
        p[(axis + 2) % 3] = Math.floor(start / 256) - 64.5;
        faces.push([axis, sign, ...p, width, height, mat]);
      }
    }
    return { faces, details: data.details };
  }
  return { surface, mesh, ink };
})();
