"use strict";
// ============================================================
// V6-P5 S0 音の窓口 回帰テスト(docs/SoundSkills.md 憲章・2026-08-11 Ric承認)
// 実行: node tests/sound_regression.js  (repoルートから)
//
//  1) 憲章の存在: SoundSkills.md が承認済みで CLAUDE.md の憲章列挙に載る
//  2) 初回無音   : CFG.soundOn の既定は false(不可逆④=変更は裁定)
//  3) 単一窓口   : AudioContext / createOscillator を書けるのは js/sound.js だけ(不可逆②・全数走査)
//  4) 非接触     : sound.js は Game / localStorage を参照しない(ON状態は注入される)
//  5) 窓口ロジック: enabledゲート・def必須・間引き(minGap)・ボイスプール+優先度の追加枠・ログ
//  6) 決定論     : Math.random 不使用(ノイズは固定シード xorshift)
//  7) セーブ側   : Game.soundEnabled が dial の器で往復し、setSoundEnabled が Sound へ通知する
//  8) boot配線   : 起動時に Sound.setEnabled(Game.soundEnabled())・unlock はユーザー操作で一度だけ
//  ※ 波形の数値ゲート(RMS/ピーク)は OfflineAudioContext が要るため装置QA(test-hqlab-qa.html)が担う
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---- ソース走査の下ごしらえ: コメントだけを除去する(文字列・テンプレート・正規表現リテラルは保持) ----
//   検査したいのは「コードが何を参照しているか」であって、解説文に出てくる語ではない。
//   由来: 素の走査は sound.js の解説コメント(「Game.soundEnabled=dialの器」「Math.random 不使用」)に
//   ヒットして FAIL していた=検査の意図と実装がズレていた。語を消して通す(コメントの書き換え)のは
//   偽の合格になるため、走査側をコードだけに絞る。カナリアで「本物の参照は必ず捕まる」ことを先に実証する。
function codeOf(src) {
  let out = "", prev = "", i = 0;
  const N = src.length;
  const REGEX_OK = /[(,=:[!&|?{};+\-*%~^<>\n]/;   // この直後の "/" は除算ではなく正規表現リテラル
  while (i < N) {
    const c = src[i], c2 = src[i + 1];
    if (c === "/" && c2 === "/") { while (i < N && src[i] !== "\n") i++; continue; }
    if (c === "/" && c2 === "*") { i += 2; while (i < N && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; out += " "; continue; }
    if (c === '"' || c === "'" || c === "`") {
      out += c; i++;
      while (i < N) { const d = src[i]; out += d; i++; if (d === "\\") { if (i < N) { out += src[i]; i++; } continue; } if (d === c) break; }
      prev = c; continue;
    }
    if (c === "/" && REGEX_OK.test(prev || "\n")) {
      out += c; i++;
      while (i < N) { const d = src[i]; out += d; i++; if (d === "\\") { if (i < N) { out += src[i]; i++; } continue; } if (d === "/") break; }
      prev = "/"; continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

// ---- ★カナリア: 走査器が「本物の参照」を捕まえ「コメント」を落とすことを先に実証する ----
{
  check("★カナリア: コード上の参照は検知する(見逃さない)", /\bGame\b/.test(codeOf("if (Game.soundEnabled()) play();")));
  check("★カナリア: コメント内の同じ語は落とす(誤検知しない)", !/\bGame\b/.test(codeOf("// ON状態は Game.soundEnabled が持つ\nlet a = 1;")));
  check("★カナリア: ブロックコメントも落とす", !/\bMath\.random\b/.test(codeOf("/* Math.random 不使用 */ let a = 1;")));
  check("★カナリア: 文字列リテラルは保持する(消しすぎない)", codeOf('const u = "a//b";').indexOf("a//b") >= 0);
  check("★カナリア: 除算を正規表現と誤読しない", codeOf("x = y / 2; // c").trim() === "x = y / 2;");
  check("★カナリア: AudioContext走査が違反サンプルを検知する", /AudioContext|createOscillator/.test(codeOf("const c = new Audio" + "Context();")));
}

// ---- 1) 憲章 ----
{
  const charter = read("docs/SoundSkills.md");
  check("SoundSkills.md が存在し承認済み", /承認済み/.test(charter) && /2026-08-11/.test(charter));
  check("最重要の柱「音にしかない情報を作らない」が明記", /音にしかない情報を作らない/.test(charter));
  check("CLAUDE.md の憲章列挙に SoundSkills.md", /SoundSkills\.md/.test(read("CLAUDE.md")));
}

// ---- サンドボックス(sound.js は DOM/Audio 非依存で読める) ----
function loadSound(extraCfg) {
  const sb = { console, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, module: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read("js/data.js"), sb, { filename: "data.js" });
  vm.runInContext(read("js/sound.js"), sb, { filename: "sound.js" });
  vm.runInContext("globalThis.__x = { Sound, CFG }", sb);
  if (extraCfg) Object.assign(sb.__x.CFG, extraCfg);
  return sb.__x;
}

// ---- 2) 初回無音 ----
{
  const { Sound, CFG } = loadSound();
  check("★CFG.soundOn の既定は false(初回無音・不可逆④)", CFG.soundOn === false);
  check("Sound.enabled の初期値も false(注入されるまで鳴らない)", Sound.enabled === false);
  check("優先度表が承認どおり(石>ボス>孵化>繁殖>給餌)",
    CFG.soundPriority.stone > CFG.soundPriority.boss && CFG.soundPriority.boss > CFG.soundPriority.hatch &&
    CFG.soundPriority.hatch > CFG.soundPriority.breed && CFG.soundPriority.breed > CFG.soundPriority.feed);
  check("probe def はテスト器専用(soundDefsに存在)", !!CFG.soundDefs.probe);
}

// ---- 3) 単一窓口(全数走査): AudioContext系を書けるのは js/sound.js だけ ----
{
  const walk = (dir, out) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) walk(p, out);
      else if (/\.js$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const offenders = walk("js", []).filter((f) => f !== "js/sound.js" && /AudioContext|createOscillator|createGain|createBufferSource/.test(codeOf(read(f))));
  check("★AudioContext系API は js/sound.js 以外に0件(不可逆②=窓口散在の禁止)", offenders.length === 0, offenders.join(","));
}

// ---- 4) 非接触 ----
{
  const src = codeOf(read("js/sound.js"));   // コード部のみ(解説コメントは検査対象外・上のカナリアで実証済)
  check("sound.js は Game を参照しない(ON状態は setEnabled 注入)", !/\bGame\b/.test(src));
  check("sound.js は localStorage を参照しない", !/localStorage/.test(src));
  check("sound.js は Math.random を使わない(決定論=固定シード xorshift)", !/Math\.random/.test(src));
}

// ---- 5) 窓口ロジック(クロック注入) ----
{
  const { Sound } = loadSound();
  let t = 0;
  Sound._now = () => t;
  check("OFFのまま play は受理しない(ログ0)", Sound.play("probe") === false && Sound.log.length === 0);
  Sound.setEnabled(true);
  check("未定義idは受理しない(捏造音を作らない)", Sound.play("nosuch") === false);
  check("ONで probe が受理される(ログ1)", Sound.play("probe") === true && Sound.log.length === 1);
  t += 10;
  check("★間引き: minGap(60ms)内の連打は受理しない", Sound.play("probe") === false && Sound.log.length === 1);
  t += 100;
  check("間隔が空けば再度受理", Sound.play("probe") === true && Sound.log.length === 2);
  // ボイスプール+優先度の追加枠(_admit を直接検査: 実発音はctx依存のため)
  Sound._voices = 8;   // 満杯
  check("★満杯時: 低優先(feed=1)は受理しない", Sound._admit("feed", 9999) === false);
  check("★満杯時: 高優先(stone=5)は追加枠で受理", Sound._admit("stone", 9999) === true);
  Sound._voices = 10;  // 追加枠も満杯
  check("追加枠も満杯なら高優先too受理しない", Sound._admit("stone", 99999) === false);
  Sound._voices = 0;
  // ログはリングバッファ(64件)
  for (let i = 0; i < 200; i++) { t += 100; Sound.play("probe"); }
  check("発音ログは64件のリングバッファ(無限に伸びない)", Sound.log.length === 64);
}

// ---- 6) unlock 前は AudioContext を作らない(autoplay policy) ----
{
  const { Sound } = loadSound();
  let created = 0;
  // AudioContext スタブを注入して生成回数を数える
  const sb = { AudioContext: function () { created++; this.state = "running"; this.resume = () => {}; } };
  // sound.js は typeof AudioContext を見る=グローバルに置いた文脈で再読込
  const ctx2 = { console, Math, JSON, Object, Array, String, Number, module: {}, AudioContext: sb.AudioContext };
  ctx2.globalThis = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(read("js/data.js"), ctx2, { filename: "data.js" });
  vm.runInContext(read("js/sound.js"), ctx2, { filename: "sound.js" });
  vm.runInContext("Sound.setEnabled(true)", ctx2);
  check("★unlock 前は AudioContext を生成しない(autoplay policy)", created === 0);
  vm.runInContext("Sound.unlock()", ctx2);
  check("unlock 後(ON時)に1度だけ生成", created === 1);
  vm.runInContext("Sound.unlock(); Sound.setEnabled(true)", ctx2);
  check("生成は1度きり(何度呼んでも増えない)", created === 1);
}

// ---- 7) セーブ側: dial の器で往復・Sound へ通知 ----
{
  function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
  const calls = [];
  const store = {};
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
    UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false },
    Sound: { setEnabled: (v) => calls.push(v) },
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += read(f) + "\n;\n";
  code += "globalThis.__g = { Game, CFG };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  const G = sb.__g;
  G.Game.newGame();
  check("★新規コロニーは音OFF(初回無音)", G.Game.soundEnabled() === false);
  G.Game.setSoundEnabled(true);
  check("ONにすると Sound へ通知される(演出層は知らされるだけ)", calls.length === 1 && calls[0] === true);
  check("ON状態が dial に立つ", G.Game.ensureDial()[G.Game.SOUND_ON_KEY] === 1);
  const w = G.Game.toWorld();
  check("★toWorld で往復する(保存の追加配線が要らない=dialの器)", w.dial && w.dial[G.Game.SOUND_ON_KEY] === 1);
  G.Game.applyWorld(JSON.parse(JSON.stringify(w)));
  check("applyWorld 後もONのまま", G.Game.soundEnabled() === true);
  G.Game.setSoundEnabled(false);
  check("OFFへ戻せる(両方向トグル=単調フラグではない)", G.Game.soundEnabled() === false && calls[calls.length - 1] === false);
}

// ---- 8) boot配線(ソース検査) ----
{
  const boot = read("js/ui/boot.js");
  check("起動時に Sound.setEnabled(Game.soundEnabled()) で同期", /Sound\.setEnabled\(Game\.soundEnabled\(\)\)/.test(boot));
  check("unlock は初回のユーザー操作で一度だけ(リスナ自己解除)", /Sound\.unlock\(\)/.test(boot) && /removeEventListener\("pointerdown", soundUnlock\)/.test(boot));
  const idx = read("index.html");
  check("index.html に sound.js が載る(holo.js の後)", /js\/sound\.js/.test(idx));
}

console.log(`\n==== sound_regression: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
