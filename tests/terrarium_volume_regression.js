"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const document = {
  createElement() {
    return {
      getContext() {
        return {
          createImageData(w, h) {
            return { data: new Uint8ClampedArray(w * h * 4) };
          },
        };
      },
    };
  },
};
const src = fs.readFileSync(path.join(__dirname, "../js/voxel-volume.js"), "utf8");
const volume = vm.runInNewContext(src + "\nVoxelVolume", { document });
const view = volume.surface(80, 80);
function visibleFrom(yaw, reverse) {
  view.depth.fill(-Infinity);
  view.ids.fill(0);
  view.transform([40, 40, 0], yaw, 0.15, 3);
  const objects = [
    [0, -3, -2, 5, 2, 5, 0xbf8152, 1],
    [0, 3, -2, 5, 2, 5, 0xa1bd81, 2],
  ];
  for (const box of reverse ? objects.reverse() : objects) view.box(...box);
  return view.ids[40 * 80 + 40];
}
assert.equal(visibleFrom(0, false), 2);
assert.equal(visibleFrom(0, true), 2);
assert.equal(visibleFrom(Math.PI, false), 1);
assert.equal(visibleFrom(Math.PI, true), 1);
// Adjacent voxels of one material share six exterior quads. A colour seam stays visible.
const key = (x, y, z) => x + 64 * y + 2048 * z;
const cells = new Map([
  [0, { x: 0, y: 0, z: 0, m: 0 }],
  [1, { x: 1, y: 0, z: 0, m: 0 }],
]);
assert.equal(volume.mesh({ cells, key, details: [] }).faces.length, 6);
cells.get(1).m = 1;
assert.equal(volume.mesh({ cells, key, details: [] }).faces.length, 10);
console.log(
  "Orbit reverses occlusion and picking independently of draw order; voxel skin retains colour seams.",
);
