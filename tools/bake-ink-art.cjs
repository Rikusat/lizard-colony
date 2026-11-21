// Rebuild with Node >=18 and the following Ink Studio revision (MIT).
// git clone https://github.com/siliconjungle/shapeshift-labs-ink-studio
// git -C shapeshift-labs-ink-studio checkout e4cda5f20f0abaf52cc40765bffec80c058c5030
// node tools/bake-ink-art.cjs /absolute/path/to/shapeshift-labs-ink-studio
// The game loads the baked atlas and two inline PNG reliefs, including from file:// offline.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const checkout = path.resolve(process.argv[2] || "shapeshift-labs-ink-studio");
const studio = require(checkout);
const { encode } = require(path.join(checkout, "cli/png.js"));
const { KIT, makeBuilder, makeSculpt } = studio.load();
const root = path.join(__dirname, "..");
const output = path.join(root, "image/ink");
const master = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const { species, morphs } = vm.runInNewContext(master + "\n;({ species: SPECIES, morphs: MORPHS })");
const W = 96, H = 52;

const anatomy = {
  kanahebi: "grass", yukikana: "grass",
  nihontokage: "skink", aojita: "skink", menashi: "skink",
  leopa: "gecko", yougan: "gecko", jade: "gecko", dokuyubi: "gecko",
  futoago: "bearded", erimaki: "frilled",
};

function rgb(h, s, l) {
  l = Math.max(.05, Math.min(.94, l / 100));
  const a = s / 100 * Math.min(l, 1 - l);
  const channel = n => {
    const k = (n + h / 30 + 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

function paint(sp, mo, metal) {
  if (metal) return [0x201d19, 0x3d382c, 0x63533b, 0x9c7a49, 0xc6a360, 0xe6cb8c,
    0x58462f, 0x987748, 0xc2a266, 0xe2c58a, 0xffe2a2, 0x4e483b, 0xa68a5b, 0x443f31, 0xffe9ad];
  const [h, s, l] = mo.recolor(sp.hue, sp.sat, sp.light);
  return [
    0x1e2630, rgb(h - 11, s * .62, l * .40), rgb(h - 7, s * .81, l * .67),
    rgb(h, s, l), rgb(h + 5, s * .94, l + 12), rgb(h + 10, s * .78, l + 23),
    rgb(h + 9, s * .58, l * .70), rgb(h + 15, s * .59, l + 4),
    rgb(h + 15, s * .52, l + 19), rgb(h + 12, s * .54, l + 31), 0xf7e9c4,
    rgb(h - 15, s * .60, l * .41), rgb(h - 11, s * .65, l * .64),
    mo.id === "albino" ? 0x92364c : 0x141e27, mo.id === "albino" ? 0xf3b4a0 : 0xfadb7b,
    0x296194, 0x58b7dd,
  ];
}

function specimen(sp, mo, metal = false) {
  const kind = anatomy[sp.id] || "monitor";
  const gecko = kind === "gecko", skink = kind === "skink", grass = kind === "grass";
  const bearded = kind === "bearded", frilled = kind === "frilled";
  const bulky = ["tegu", "komodo", "ishigami", "blackdragon"].includes(sp.id);
  const girth = bulky ? .52 : bearded ? .48 : gecko || skink ? .39 : grass ? .26 : .35;
  const bodyY = skink ? .39 : grass ? .43 : .51;
  const headY = bodyY + (skink ? .15 : gecko ? .25 : bearded || frilled ? .57 : .41);
  const headZ = .12, headWidth = gecko || bearded ? .33 : .27;
  const B = makeBuilder(27, paint(sp, mo, metal)), S = KIT.sculpt(makeSculpt(B));
  Object.assign(S, { pixel: true, amb: .29, sky: .14, sunK: .72, shLen: .45, sun: KIT.V.norm([-.43, .84, .41]) });
  const skin = { r: [1, 2, 3, 4, 5] }, belly = { r: [6, 7, 8, 9] }, marks = { r: [0, 11, 12] };
  const detail = { r: [13] }, eye = { r: [14], em: true };
  const ball = (p, size, mat = skin) => S.ball(p, size, mat, { res: .04 });
  const box = (p, size, mat, rd) => S.box(p, size, mat, { rd, res: .035 });
  const tube = (p, r, t, mat = skin) => S.tube(p, r, t, mat, { res: .038 });
  const pattern = gecko || sp.id === "tegu" ? (x, y, z) =>
    Math.sin(x * 12 + z * 4) * Math.sin(y * 9 - z * 7) > .50 :
    (x, y, z) => (skink || grass ? Math.abs(y - bodyY - .10) < .052 : Math.sin(x * 12 + z * 2) > .75);
  const scales = { r: skin.r, rf: (x, y, z) => {
    if (y < bodyY - .10) return belly.r;
    return pattern(x, y, z) ? marks.r : skin.r;
  }};
  const tail = [[-.67, bodyY, -.07], [-1.04, bodyY * .83, -.15], [-1.37, .26, -.10],
    [-1.72, .16, .10], [-2.00, .13, .40], [-2.29, .19, .54], [-2.53, .32, .49]];
  const sizes = gecko ? [.27, .32, .24, .17, .11, .055, .018] : [girth * .65, girth * .54, .14, .10, .07, .04, .012];
  const tailMat = sp.id === "nihontokage" && mo.id === "normal" ? { r: [15, 16] } : scales;
  for (let i = 1; i < tail.length; i++) tube([tail[i - 1], tail[i]], sizes[i - 1], sizes[i], i > 2 ? tailMat : scales);
  ball([-.05, bodyY, 0], [skink ? 1.01 : .87, girth * .79, girth], scales);
  tube([[.43, bodyY + .02, 0], [.76, bodyY + .11, .04], [1.04, headY, headZ]], girth * .75, headWidth * .78);
  for (const side of [-1, 1]) {
    for (const front of [false, true]) {
      const x = front ? .52 : -.56;
      const kneeX = x + (front ? -.18 : .20);
      const endX = x + (front ? .18 : -.22);
      const spread = (skink ? .54 : .73) * side;
      tube([[x, bodyY, girth * side * .49], [kneeX, .22, spread * .78]], girth * .33, .089);
      tube([[kneeX, .22, spread * .78], [endX, .086, spread]], .089, .058, belly);
      for (let toe = -1; toe <= 1; toe++) {
        const tx = endX + .11 + toe * .10, tz = spread + (.13 - .035 * toe) * side;
        tube([[endX, .082, spread], [tx, .050, tz]], .032, .015, belly);
        if (gecko) ball([tx, .053, tz], [.045, .024, .041], belly);
      }
    }
  }
  if (frilled) {
    ball([.90, headY - .02, .08], [.15, .47, .54], marks);
    ball([.97, headY - .03, .08], [.13, .41, .48], { r: [6, 2, 3, 4, 8] });
  }
  ball([1.18, headY + .04, headZ], [.42, gecko ? .21 : .24, headWidth]);
  box([1.47, headY - .007, headZ], [.275, .124, .20], skin, .09);
  box([1.43, headY - .117, headZ], [.27, .055, .185], belly, .05);
  if (bearded) {
    ball([1.13, headY - .14, headZ], [.23, .17, .27], marks);
    for (let n = -2; n <= 2; n++) {
      const z = headZ + n * .09;
      tube([[1.12, headY - .17, z], [.99, headY - .34, z * 1.2]], .068, .013, belly);
    }
  }
  for (const side of [-1, 1]) {
    const eyeZ = headZ + headWidth * side * .84;
    if (sp.id !== "menashi") {
      ball([1.33, headY + .115, eyeZ], [.115, .098, .075], detail);
      ball([1.35, headY + .12, eyeZ + side * .047], [.074, .072, .039], eye);
      ball([1.37, headY + .115, eyeZ + side * .074], [.032, .049, .022], detail);
    }
    ball([1.65, headY + .046, headZ + side * .155], [.030, .026, .024], detail);
  }
  if (sp.id === "aojita") tube([[1.66, headY - .10, headZ], [1.93, headY - .13, .19]], .053, .030, { r: [15, 16] });
  if (["ancient", "ishigami", "blackdragon", "glow"].includes(sp.id)) {
    for (let n = 0; n < 7; n++) {
      const x = -.68 + n * .19, y = bodyY + girth * (.5 + .21 * Math.sin(n / 6 * Math.PI));
      tube([[x, y, 0], [x - .08, y + .21, 0]], .086, .015, sp.glow ? belly : marks);
    }
  }
  S.bake();
  const world = B.finish({ cam: { target: [-.30, .44, .08], dist: 3.82, yaw: .32, pitch: .43, sway: 0 },
    radius: 4, dither: .12, look: { splatCoverage: "continuous" } });
  return studio.spriteAtlas(world, { width: W, height: H, directions: 1 }).images.color;
}

function burrow() {
  const palette = [0x242825, 0x39342e, 0x4f4136, 0x71533d, 0x956c45, 0xb28250, 0xca9a61,
    0xe1b77a, 0xf2d396, 0xffe7b1, 0x34483b, 0x53664a, 0x829264];
  const B = makeBuilder(38, palette), S = KIT.sculpt(makeSculpt(B));
  Object.assign(S, { pixel: true, amb: .22, sky: .17, sunK: .77, shLen: .9, sun: KIT.V.norm([-.52, .84, .40]) });
  const light = { r: [3, 4, 5, 6, 7, 8] }, worn = { r: [2, 3, 4, 5, 6, 7] };
  const sand = { r: [4, 5, 6, 7, 8, 9] }, dark = { r: [0, 0, 1, 1, 2] };
  // Flat sandstone bedding and a recessed, shadowed interior visible between the arch piers.
  const slab = (at, size, material, radius = .16) => S.box(at, size, material, { res: .046, rd: radius });
  slab([0, .34, -.45], [1.07, .44, .15], dark);
  slab([0, .07, .04], [1.33, .065, .59], worn, .06);
  slab([-.84, .27, .02], [.53, .25, .63], worn);
  slab([-.83, .56, .09], [.47, .14, .56], light, .10);
  slab([.90, .30, -.05], [.51, .31, .65], worn);
  slab([.78, .65, .02], [.47, .13, .62], light, .12);
  slab([.04, .79, -.02], [.97, .22, .49], worn);
  slab([-.10, .97, -.09], [1.03, .15, .63], sand);
  S.rock([.00, 1.06, -.27], [.77, .20, .55], light, { res: .04 });
  const stones = [[-1.38, .05, .33, .28], [-1.36, .17, -.25, .37], [-1.10, .07, .57, .19],
    [.98, .10, .62, .26], [1.38, .17, .03, .33], [1.45, .07, .28, .21], [-.38, .07, .65, .11],
    [.35, .07, .63, .12], [-.41, 1.16, -.26, .17]];
  for (const [x, y, z, r] of stones) S.rock([x, y, z], [r * 1.2, r * .57, r], light, { res: .045 });
  for (const [x, z, height] of [[-1.35, -.18, .27], [1.29, -.22, .44], [1.41, -.18, .25]]) {
    const leaves = { r: [10, 11, 12] };
    for (let n = -1; n <= 1; n++) S.tube([[x, .09, z], [x + n * .10, .15 + height * .5, z + .02],
      [x + n * .19, .12 + height, z - n * .04]], .04, .009, leaves, { res: .025 });
  }
  S.bake();
  const world = B.finish({ cam: { target: [0, .53, .05], dist: 3.38, yaw: -.24, pitch: .36, sway: 0 },
    radius: 4, dither: .22, look: { splatCoverage: "continuous" } });
  const { images } = studio.spriteAtlas(world, { width: 108, height: 64, directions: 1 });
  // Trim the lower empty rows so the saved anchor is the edge of the burrow floor.
  let last = 63;
  while (last > 0 && !images.color.subarray(last * 108 * 4, (last + 1) * 108 * 4).some((c, i) => i % 4 === 3 && c > 32)) last--;
  return encode(108, last + 1, images.color.subarray(0, (last + 1) * 108 * 4), 4);
}

function stamp(atlas, stride, frame, left, top) {
  for (let y = 0; y < H; y++) {
    atlas.set(frame.subarray(y * W * 4, (y + 1) * W * 4), ((top + y) * stride + left) * 4);
  }
}

fs.mkdirSync(output, { recursive: true });
const stride = morphs.length * W;
const atlas = new Uint8Array(stride * species.length * H * 4);
for (const [row, sp] of species.entries()) {
  for (const [col, mo] of morphs.entries()) stamp(atlas, stride, specimen(sp, mo), col * W, row * H);
}
fs.writeFileSync(path.join(output, "specimens.png"), encode(stride, species.length * H, atlas, 4));
// File URLs taint a canvas when it draws a sibling image. Inline the canvas-only
// PNGs to preserve the origin-clean flag needed for the player's PNG export.
const gecko = specimen(species.find(s => s.id === "leopa"), morphs[0], true);
const inline = png => "data:image/png;base64," + png.toString("base64");
const reliefs = { burrow: inline(burrow()), gecko: inline(encode(W, H, gecko, 4)) };
const source = "// Generated by tools/bake-ink-art.cjs with Ink Studio (MIT).\n"
  + "const INK_RELIEFS = Object.freeze(" + JSON.stringify(reliefs, null, 2) + ");\n";
fs.writeFileSync(path.join(root, "js/ink-reliefs.js"), source);
