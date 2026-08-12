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

// ---- 2b) S1 基準音3種(給餌/孵化/撃破)。数値の良し悪しはRic実機判定・ここは構造だけ検査 ----
{
  const { Sound, CFG } = loadSound();
  for (const id of ["feed", "hatch", "defeat"]) check("S1基準音 " + id + " が soundDefs にある", !!CFG.soundDefs[id]);
  const P = CFG.soundPriority;
  check("★優先度: 通常撃破はボス撃破より軽い(承認済み序列への挿入=並べ替えではない)", P.defeat < P.boss);
  check("★優先度: 承認済み5項の序列は不変(石>ボス>孵化>繁殖>給餌)",
    P.stone > P.boss && P.boss > P.hatch && P.hatch > P.breed && P.breed > P.feed);
  check("S1の3種は追加枠の対象外(満杯時に核以外が割り込まない)",
    P.feed < CFG.soundPrioFloor && P.hatch < CFG.soundPrioFloor && P.defeat < CFG.soundPrioFloor);
  // 既定値のマージ: 部分指定のdefでも完全なdefが返る(欠損の面倒は def() が引き受ける)
  const d = Sound.def("feed");
  check("def() が CFG.soundDefDefaults を重ねて完全なdefを返す", d.seed === CFG.soundDefDefaults.seed && d.vol === CFG.soundDefs.feed.vol);
  check("def() は元の定義を書き換えない(コピーを返す)", CFG.soundDefs.feed.seed === undefined);
  check("音予算(§2-7 頻発ほど軽く短く): vol 撃破>孵化>給餌",
    CFG.soundDefs.defeat.vol > CFG.soundDefs.hatch.vol && CFG.soundDefs.hatch.vol > CFG.soundDefs.feed.vol);
  check("音予算(§2-7): 尺 撃破>孵化>給餌",
    (CFG.soundDefs.defeat.dur + CFG.soundDefs.defeat.release) > (CFG.soundDefs.hatch.dur + CFG.soundDefs.hatch.release) &&
    (CFG.soundDefs.hatch.dur + CFG.soundDefs.hatch.release) > (CFG.soundDefs.feed.dur + CFG.soundDefs.feed.release));
  check("★検分ページ ?tune=1#sound が存在する(Ricが実クリックで判定する唯一の場所)",
    /#sound/.test(read("js/ui/boot.js")) && /sound-view/.test(read("js/ui/boot.js")));
  check("検分ページはセーブを書き換えない(setSoundEnabled を呼ばない)",
    !/Game\.setSoundEnabled/.test(codeOf(read("js/ui/boot.js"))));
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
  // 「叩く形」だけを違反とする(removed_api_regression と同じ作法)。UI文言に "OfflineAudioContext" と
  // 書くのは説明であって使用ではない=検分ページの表示テキストを違反にしない。
  const USE = /new\s+(?:Offline)?AudioContext\b|\.\s*create(?:Oscillator|Gain|BufferSource|Buffer|BiquadFilter)\s*\(/;
  check("★カナリア: 生成形(new AudioContext)を検知する", USE.test("const c = new Audio" + "Context();"));
  check("★カナリア: ノード生成形(.createOscillator())を検知する", USE.test("src = ctx.create" + "Oscillator();"));
  check("★カナリア: 文言中の語は違反にしない(説明は使用ではない)", !USE.test('o.textContent = "Offline' + 'AudioContext 非対応";'));
  const offenders = walk("js", []).filter((f) => f !== "js/sound.js" && USE.test(codeOf(read(f))));
  check("★AudioContext系API を使うのは js/sound.js だけ(不可逆②=窓口散在の禁止)", offenders.length === 0, offenders.join(","));
}

// ---- 4) 非接触 ----
{
  const src = codeOf(read("js/sound.js"));   // コード部のみ(解説コメントは検査対象外・上のカナリアで実証済)
  check("sound.js は Game を参照しない(ON状態は setEnabled 注入)", !/\bGame\b/.test(src));
  check("sound.js は localStorage を参照しない", !/localStorage/.test(src));
  check("sound.js は Math.random を使わない(決定論=固定シード xorshift)", !/Math\.random/.test(src));
}

// ---- 4b) ★知識は1箇所: sound.js に CFG のフォールバック定数を置かない(2026-08-11 Ric承認の片付け) ----
//   `CFG.soundX != null ? CFG.soundX : 60` や `CFG.soundX || 8` は「CFGを直しても効かない第二の既定値」を
//   生む。data.js は sound.js より必ず先に読まれる硬い依存なので、フォールバックは不要かつ有害。
{
  const FALLBACK = /CFG\.\w+\s*(?:!=\s*null\s*\?[^:]*:\s*-?[\d.]|\|\|\s*-?[\d.])/;
  check("★カナリア: フォールバック検知が違反サンプル(三項)を捕まえる", FALLBACK.test("const g = CFG.soundMinGapMs != null ? CFG.soundMinGapMs : 60;"));
  check("★カナリア: フォールバック検知が違反サンプル(||)を捕まえる", FALLBACK.test("const c = CFG.soundMaxVoices || 8;"));
  check("★カナリア: 正しい直読は違反にしない", !FALLBACK.test("if (this._voices < CFG.soundMaxVoices) return true;"));
  check("★sound.js に CFG のフォールバック定数が無い(知識はCFGの1箇所)", !FALLBACK.test(codeOf(read("js/sound.js"))));
}

// ---- 4c) ルール層に音コードを置かない(憲章§2-3: 演出はイベント購読で鳴らす) ----
{
  const PLAY = /Sound\s*\.\s*play\s*\(/;
  check("★カナリア: 発音呼び出しの検知が効く", PLAY.test('Sound.play("feed")'));
  check("★ルール層(js/game.js)は発音しない(状態通知 setEnabled のみ)", !PLAY.test(codeOf(read("js/game.js"))));
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

  // ---- 7b) ★配線の実測: 音は視覚と対(§2-2)。視覚が出ない時は音のイベントも出ない ----
  //   これがS1配線の核心。emit を視覚呼び出しと同じ条件の中に置いたことを**実行して**確かめる。
  const Game = G.Game, CFG2 = G.CFG;
  const evs = [];
  Game.onEvent((n) => evs.push(n));
  check("★カナリア: 購読口が実際にイベントを受け取れる", (Game.emit("__canary", {}), evs.length === 1 && evs[0] === "__canary"));
  // 給餌: 手動=+xpポップが出る → feedイベントも出る
  Game.newGame();
  Game.state.crickets = 500; Game.state.dial.auto = false;
  const xpPops = () => Game.popups.filter((p) => /xp/.test(p.txt)).length;
  evs.length = 0; Game.popups.length = 0;
  Game.feed(Game.state.lizards[0]);
  check("★給餌(手動): +xpポップが出て feed イベントも出る", xpPops() === 1 && evs.filter((n) => n === "feed").length === 1,
    "pops=" + xpPops() + " evs=" + JSON.stringify(evs));
  // 給餌: オートでポップ抑制中 → 音のイベントも出ない(音だけが鳴る=情報の非対称を作らない)
  Game.state.dial.auto = true; CFG2.autoFeedXpPopup = false;
  evs.length = 0; Game.popups.length = 0;
  Game.feed(Game.state.lizards[0]);
  check("★給餌(オート・ポップ抑制中): 視覚が出ないので feed イベントも出ない",
    xpPops() === 0 && evs.filter((n) => n === "feed").length === 0, "pops=" + xpPops() + " evs=" + JSON.stringify(evs));
  Game.state.dial.auto = false;
  // 孵化: 登場エフェクト(spawnFx)と対
  evs.length = 0;
  const fx0 = (Game._spawnFx || []).length;
  Game._hatchEggObject({ speciesId: "kanahebi", morphId: "normal", hue: 100, sat: 50, light: 50, pattern: "stripe" });
  check("★孵化: 登場エフェクトが出て hatch イベントも出る",
    (Game._spawnFx || []).length > fx0 && evs.filter((n) => n === "hatch").length === 1,
    "fx+" + ((Game._spawnFx || []).length - fx0) + " evs=" + JSON.stringify(evs));
}

// ---- 7c) 配線の構造検査: emit は必ず視覚呼び出しの隣に置く(§2-2を構造で守る) ----
//   撃破は実行での再現が重い(raidの組み立てが要る)ため、3種を同じ物差しで見るこの走査が受け皿。
{
  const lines = read("js/game.js").split("\n");
  const VISUAL = /this\.(popup|popupBurst|notice|spawnFx)\s*\(/;
  const near = (i) => lines.slice(Math.max(0, i - 3), i + 4).some((l) => VISUAL.test(l));
  const emits = [];
  lines.forEach((l, i) => { const m = l.match(/this\.emit\("([a-z]+)"/); if (m) emits.push({ name: m[1], i: i }); });
  check("ルール層が3種のイベントを流している(feed/hatch/defeat)",
    ["feed", "hatch", "defeat"].every((n) => emits.some((e) => e.name === n)), JSON.stringify(emits.map((e) => e.name)));
  check("★カナリア: 視覚検知が本物の呼び出しを捕まえる", VISUAL.test('      this.notice("x", "y", "boss");'));
  check("★カナリア: 無関係な行は視覚と見なさない", !VISUAL.test("      const auto = !!(this.state.dial && this.state.dial.auto);"));
  const lonely = emits.filter((e) => !near(e.i)).map((e) => e.name + "@" + (e.i + 1));
  check("★全てのemitが視覚呼び出しの近傍にある(音だけが鳴る箇所を作らない)", lonely.length === 0, lonely.join(","));
}

// ---- 7d) 対応表と配線口(CFG.soundCues=「何が起きたか」→「どう聞かせるか」の唯一の変換点) ----
{
  const { CFG } = loadSound();
  const cues = CFG.soundCues || {};
  check("CFG.soundCues が3種を対応づける", Object.keys(cues).length === 3 && cues.feed === "feed" && cues.hatch === "hatch" && cues.defeat === "defeat");
  check("対応先の音idが全て soundDefs にある(鳴らない配線を作らない)", Object.values(cues).every((id) => !!CFG.soundDefs[id]));
  const gameSrc = codeOf(read("js/game.js"));
  check("対応表のイベントは全てルール層が実際に流している", Object.keys(cues).every((n) => gameSrc.includes('this.emit("' + n + '"')));
  const boot = codeOf(read("js/ui/boot.js"));
  check("★演出層が購読して CFG.soundCues 経由で鳴らす(変換点は1箇所)", /Game\.onEvent\(/.test(boot) && /CFG\.soundCues/.test(boot) && /Sound\.play\(/.test(boot));
  const meta = codeOf(read("js/ui/screens/meta.js"));
  check("★設定に音のON/OFF導線がある(初回無音からONにできる)", /set-sound/.test(meta) && /Game\.setSoundEnabled/.test(meta));
  check("設定トグルは形と文字で状態を示す(色のみに依存しない・UISkills §7)", /soundOff/.test(meta) && /aria-checked/.test(meta));
  // §2-1: ONへの導線を一度だけ静かに知らせる(押し売りしない)
  check("★一度きりの告知が演出層にある(初回撃退・既にONなら出さない)",
    /soundHintSeen\(\)/.test(boot) && /markSoundHintSeen\(\)/.test(boot) && /Game\.soundEnabled\(\)/.test(boot));
  check("告知は既存のトーストを使う(通知の種類を増やさない・§9)", /UI\.toast\(/.test(boot));
  check("告知の文言に音のONを促す導線がある", /効果音をONに/.test(read("js/ui/boot.js")));
}

// ---- 7e) §2-1 一度きり告知のセーブ側(単調追加フラグ・往復する器) ----
{
  function np() { const fn = function () {}; return new Proxy(fn, { get(t, p) { if (typeof p === "string" && p[0] === "_") return undefined; return p === "svg" ? () => "" : np(); }, apply() { return np(); } }); }
  const store = {};
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: new Proxy({}, { get() { return np(); } }), navigator: { userAgent: "node" }, location: { reload: () => {}, search: "", hash: "" },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, Math, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Date,
    UI: np(), Icon: np(), Roulette: np(), CrankSkins: np(), Slit: np(), Motion: { reduced: false }, Sound: { setEnabled() {} },
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  let code = ""; for (const f of ["js/data.js", "js/render.js", "js/game.js"]) code += read(f) + "\n;\n";
  code += "globalThis.__g = { Game };\n";
  vm.runInContext(code, sb, { filename: "combined.js" });
  const Game = sb.__g.Game;
  Game.newGame();
  check("★新規コロニーではまだ告知していない", Game.soundHintSeen() === false);
  check("★1度目のmarkだけがtrue(=告知は一度きり)", Game.markSoundHintSeen() === true && Game.markSoundHintSeen() === false);
  check("markの後は soundHintSeen が立つ", Game.soundHintSeen() === true);
  const w = Game.toWorld();
  check("★告知済みフラグが dial で往復する(保存の追加配線が要らない)", w.dial && w.dial[Game.SOUND_HINT_KEY] === 1);
  Game.applyWorld(JSON.parse(JSON.stringify(w)));
  check("applyWorld 後も告知済みのまま(単調=戻らない)", Game.soundHintSeen() === true && Game.markSoundHintSeen() === false);
  check("音ONフラグとは独立(別キー)", Game.SOUND_HINT_KEY !== Game.SOUND_ON_KEY && Game.soundEnabled() === false);
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
