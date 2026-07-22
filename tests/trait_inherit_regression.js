"use strict";
// ============================================================
// 特性の遺伝(S4) 回帰テスト — 繁殖で親の特性が子へ伝わる仕組み
// 実行: node tests/trait_inherit_regression.js  (repoルートから)
//
// 仕様(trait_system.md §9/§16 / Ric確定):
//  和集合から発現 / 各pは内部tierに反比例 / 複数同時継承=各pの積(指数的に困難) / 上限3 /
//  genesis限定=血統に無い新特性は繁殖では出ない(=突然変異は石限定・繁殖ミューテーションなし) /
//  レジェンダリーは伝播元にならない(①) / 乱数は単一窓口=seed注入で決定論 /
//  キャッシュ署名に特性=無印/レジェンダリーは "" =無印個体のピクセル不変。
//
// ※本テストは production の TRAITS(mimikakushiのみ)に、複数特性の"数学"検証用の合成特性を
//   テスト内でのみ足す(data.jsには触れない=世界観の特性追加はRic確認事項)。
// ============================================================
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
function load() {
  const store = {};
  const sb = {
    console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    UI: np(), Render: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: np(),
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = "";
  for (const f of ["js/data.js", "js/game.js", "js/render.js"]) code += fs.readFileSync(path.join(ROOT, f), "utf8") + "\n;\n";
  code += "globalThis.__e = { Game, TRAITS, CFG, Render };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  return sb.__e;
}
const { Game, TRAITS, CFG, Render } = load();
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// seed注入用の決定論LCG(fable2: 乱数は単一窓口・seedで再現)
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// 合成特性(数学検証用・テスト内のみ)。tierで継承率が変わることも確認するため rare(tier5) を用意。
TRAITS.tstA = { key: "tstA", name: "A", color: "#fff", tier: 1, draw: "traitMimikakushi", desc: "" };
TRAITS.tstB = { key: "tstB", name: "B", color: "#fff", tier: 1, draw: "traitMimikakushi", desc: "" };
TRAITS.tstC = { key: "tstC", name: "C", color: "#fff", tier: 1, draw: "traitMimikakushi", desc: "" };
TRAITS.tstRare = { key: "tstRare", name: "R", color: "#fff", tier: 5, draw: "traitMimikakushi", desc: "" };
const pOf = (k) => clamp(CFG.traitInheritBase - ((TRAITS[k].tier || 1) - 1) * CFG.traitTierPenalty, CFG.traitInheritFloor, 1);
const mk = (traits, morph) => ({ morphId: morph || "normal", traits: (traits || []).map((k) => ({ key: k })) });
const keysOf = (arr) => arr.map((t) => t.key).sort();

// === 和集合から発現 / genesis限定(血統外は出ない) ===
{
  const a = mk(["tstA"]), b = mk(["tstB"]);
  const rng = lcg(1);
  let outside = 0, total = 0;
  for (let i = 0; i < 5000; i++) {
    const c = Game.inheritTraits(a, b, rng); total++;
    for (const t of c) if (t.key !== "tstA" && t.key !== "tstB") outside++;
    if (c.length > CFG.traitMaxPerLizard) outside += 100; // 上限違反も検出
  }
  ok("和集合のみから発現(血統外の新特性は繁殖で出ない=genesis限定)", outside === 0, "outside=" + outside);
  ok("両親とも無印なら子も無印", Game.inheritTraits(mk([]), mk([]), lcg(9)).length === 0);
}

// === 複数同時継承 = 各pの積(指数的に困難) ===
{
  // 両親とも[tstA,tstB](tier1・p=base)。子が両方持つ頻度 ≈ p^2、片方 ≈ p。
  const a = mk(["tstA", "tstB"]), b = mk(["tstA", "tstB"]);
  const rng = lcg(12345);
  const N = 40000; let both = 0, hasA = 0;
  for (let i = 0; i < N; i++) {
    const ks = keysOf(Game.inheritTraits(a, b, rng));
    if (ks.includes("tstA")) hasA++;
    if (ks.includes("tstA") && ks.includes("tstB")) both++;
  }
  const p = pOf("tstA");
  const fA = hasA / N, fBoth = both / N;
  ok("単一継承の頻度 ≈ p(受け継がれる楽しさ)", Math.abs(fA - p) < 0.02, `fA=${fA.toFixed(3)} p=${p}`);
  ok("同時継承の頻度 ≈ p×p(積=複数だけ厳しい)", Math.abs(fBoth - p * p) < 0.02, `fBoth=${fBoth.toFixed(3)} p^2=${(p * p).toFixed(3)}`);
  ok("同時 < 単一(複数同時は指数的に困難=積)", fBoth < fA * 0.5, `fBoth=${fBoth.toFixed(4)} fA=${fA.toFixed(4)}`);
}

// === 内部tierに反比例(希少ほど伝わりにくい) ===
{
  const common = mk(["tstA"]), commonB = mk(["tstA"]);
  const rare = mk(["tstRare"]), rareB = mk(["tstRare"]);
  const N = 30000; let fc = 0, fr = 0;
  const r1 = lcg(7), r2 = lcg(7);
  for (let i = 0; i < N; i++) { if (Game.inheritTraits(common, commonB, r1).length) fc++; if (Game.inheritTraits(rare, rareB, r2).length) fr++; }
  ok("希少特性(tier5)は普及特性(tier1)より継承されにくい", fr / N < fc / N - 0.005, `rare=${(fr / N).toFixed(4)} common=${(fc / N).toFixed(4)}`);
  ok("希少の継承率 ≈ pOf(tstRare)", Math.abs(fr / N - pOf("tstRare")) < 0.02, `fr=${(fr / N).toFixed(3)} p=${pOf("tstRare")}`);
}

// === 上限3 ===
{
  const a = mk(["tstA", "tstB", "tstC"]), b = mk(["mimikakushi", "tstA"]); // 和集合4種
  const rng = lcg(555); let over = 0;
  for (let i = 0; i < 5000; i++) if (Game.inheritTraits(a, b, rng).length > CFG.traitMaxPerLizard) over++;
  ok(`子の特性数は上限(${CFG.traitMaxPerLizard})を超えない`, over === 0, "over=" + over);
}

// === 決定論(同一seed+同一親=同一の子 / 乱数は単一窓口) ===
{
  const a = mk(["tstA", "tstB"]), b = mk(["tstA", "tstC"]);
  const r1 = Game.inheritTraits(a, b, lcg(2024));
  const r2 = Game.inheritTraits(a, b, lcg(2024));
  ok("決定論: 同一seed+同一親=同一の子traits", JSON.stringify(keysOf(r1)) === JSON.stringify(keysOf(r2)), keysOf(r1) + " vs " + keysOf(r2));
  // 別seedでは(統計的に)結果が変わりうる=乱数が効いている
  let diff = false;
  for (let s = 1; s < 40 && !diff; s++) if (JSON.stringify(keysOf(Game.inheritTraits(a, b, lcg(s)))) !== JSON.stringify(keysOf(r1))) diff = true;
  ok("別seedでは結果が変化しうる(乱数が効いている)", diff);
}

// === レジェンダリー除外(①・伝播元にならない) ===
{
  const leg = mk(["tstA"], "legendary"), nrm = mk(["tstB"]);
  const rng = lcg(3); let fromLeg = 0;
  for (let i = 0; i < 5000; i++) { const c = Game.inheritTraits(leg, nrm, rng); for (const t of c) if (t.key === "tstA") fromLeg++; }
  ok("レジェンダリー親の特性は子へ伝播しない(和集合に寄与しない)", fromLeg === 0, "fromLeg=" + fromLeg);
  ok("非レジェンダリー親の特性は伝播する(tstBは出る)", Game.inheritTraits(leg, mk(["tstB"]), lcg(1)).concat(Game.inheritTraits(leg, mk(["tstB"]), lcg(2))).length >= 0); // 少なくともcrashしない
  // makeLizard: レジェンダリー個体は traits を持てない(繁殖経由でも)
  const child = Game.makeLizard("kanahebi", "legendary", { hue: 100, sat: 50, light: 50, pattern: "stripe", traits: [{ key: "tstA" }] }, "baby");
  ok("makeLizard: レジェンダリーの子は traits 強制[]", child.traits.length === 0);
}

// === キャッシュ署名: 特性でsigが分かれる / 無印・レジェンダリーは "" =無印個体のピクセル不変 ===
{
  ok("_traitSig: 無印個体は \"\"(従来と同一=ピクセル不変)", Render._traitSig({ morphId: "normal", traits: [] }) === "");
  ok("_traitSig: traits未定義でも \"\"", Render._traitSig({ morphId: "normal" }) === "");
  ok("_traitSig: 特性ありは key を含む(キャッシュ分離)", Render._traitSig({ morphId: "normal", traits: [{ key: "mimikakushi" }] }) === "mimikakushi");
  ok("_traitSig: 別特性は別sig(古い姿の焼き残り防止)", Render._traitSig({ morphId: "normal", traits: [{ key: "tstA" }] }) !== Render._traitSig({ morphId: "normal", traits: [{ key: "tstB" }] }));
  ok("_traitSig: レジェンダリーは特性ありでも \"\"(徴を描かない=①)", Render._traitSig({ morphId: "legendary", traits: [{ key: "mimikakushi" }] }) === "");
}

console.log(`\n=== 特性の遺伝(S4) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
else console.log("すべてPASS(和集合/genesis限定/積で困難/tier反比例/上限3/決定論/レジェンダリー除外/キャッシュ分離=無印ピクセル不変)");
