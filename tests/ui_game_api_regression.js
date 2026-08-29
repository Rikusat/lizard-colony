"use strict";
// REL-P0(2026-08-29): UI層が呼ぶ Game.* API の実在 全数照合(恒久)
//
//  由来: f080e6a(V6-P1-1 WIP)が game.js の facilityCost/buyFacility を誤って巻き添え削除したが、
//  呼び出し元(ui/screens/equipment.js)が残り、設備パネルが全域で開けない事故が20日間誰にも見えなかった。
//  removed_api.json は「意図した撤廃」の台帳=登録が無い誤削除は原理的に走査されない。
//  本テストはその裏側を塞ぐ: **UI層・演出層が呼ぶ Game.メソッド() の全数**が game.js に実在することを照合する。
//  ★カナリア先行: 定義集合から facilityCost を意図的に抜くと検出できることを実証してから本判定。
// 実行: node tests/ui_game_api_regression.js
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) { pass++; console.log("  PASS " + n); } else { fail++; fails.push(n); console.log("  FAIL " + n + (e ? " :: " + e : "")); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// コメント除去(sound_regression の codeOf と同旨の簡易版: 走査は「使用」だけを見る)
function codeOf(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// 呼び出し側: UI層・演出層の全ファイル(game.js 自身と data/render は除く=自己参照や定義側)
const callers = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = dir + "/" + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
    if (/\.js$/.test(f)) callers.push(rel);
  }
};
walk("js/ui");
for (const f of ["js/holo.js", "js/sound.js", "js/roulette.js", "js/slit.js", "js/render.js"]) callers.push(f);

// 呼ばれている Game.メソッド( の全数抽出
const called = new Set();
for (const f of callers) {
  const src = codeOf(read(f));
  for (const m of src.matchAll(/Game\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) called.add(m[1]);
}
ok("走査: 呼び出し側ファイルを全数読めた(js/ui 再帰+演出層)", callers.length >= 20, "files=" + callers.length);
ok("走査: Game.メソッド() の呼び出しを抽出できた", called.size >= 30, "called=" + called.size);

// 定義側: game.js のメソッド定義(2スペース起点の `name(` / `name:`)
const gsrc = read("js/game.js");
const defined = new Set();
for (const m of gsrc.matchAll(/^  ([A-Za-z_$][A-Za-z0-9_$]*)\s*[:(]/gm)) defined.add(m[1]);
ok("走査: game.js の定義を抽出できた", defined.size >= 80, "defined=" + defined.size);

// ★カナリア: 定義集合から facilityCost を抜くと「欠落」を検出できる(検知能力の実証)
{
  const probe = new Set(defined); probe.delete("facilityCost");
  const missing = [...called].filter((n) => !probe.has(n));
  ok("★カナリア: 定義を1つ抜くと欠落として検出される(facilityCost)", missing.includes("facilityCost"));
}

// 本判定: 呼ばれている全メソッドが実在する
const missing = [...called].filter((n) => !defined.has(n)).sort();
ok("★UI層が呼ぶ Game.* は全て実在する(誤削除の残存呼び出し=0)", missing.length === 0, "MISSING=" + missing.join(","));

// P0の当事者2件が復元されていること(退行の直接監視)
ok("P0復元: facilityCost が定義されている", defined.has("facilityCost"));
ok("P0復元: buyFacility が定義されている", defined.has("buyFacility"));
ok("P0復元: 呼び出し元(equipment.js)は現行のまま(復元により整合)",
  /Game\.facilityCost\s*\(/.test(codeOf(read("js/ui/screens/equipment.js"))) && /Game\.buyFacility\s*\(/.test(codeOf(read("js/ui/screens/equipment.js"))));

console.log(`\n=== UI→Game API実在照合(REL-P0) 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILS: " + fails.join(" / ")); process.exit(1); }
console.log("すべてPASS(全数照合・カナリア実証つき)");
process.exit(0);
