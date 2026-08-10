"use strict";
// ============================================================
// 撤廃API 回帰テスト(恒久・2026-08-10 Ric指示・§5x-OPS ⑫/⑭)
//   単一の真実 = docs/removed_api.json。撤廃した識別子を test-*.html / tests/ / tools/ が
//   **叩いている**(click する・メソッドとして呼ぶ)箇所のみを違反とする。
//   「無いことの検査」(typeof X === "undefined" / !getElementById(...) 等)は撤廃後の
//   正しい書き方なので通す(§5x-OPS ⑫: 撤廃済みのUI/APIは叩くのでなく無いことを検査する)。
//   由来: 装置QAが撤廃済み #bm-quick を click し続けて例外中断し、半分未実行が「FAIL 1」に
//   しか見えなかった事故(§5ddd)。当初の走査は feed_discipline_regression 内のハードコード
//   リスト(7識別子・tools/未走査)だったため、単一の真実へ移設して全撤廃機能に拡張した。
// 実行: node tests/removed_api_regression.js
// ============================================================
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) { pass++; } else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

// ---- 単一の真実を読む(形式もここで検査=壊れたJSONは静かに0件走査になってはいけない) ----
const jsonPath = path.join(ROOT, "docs", "removed_api.json");
ok("docs/removed_api.json が存在する", fs.existsSync(jsonPath));
let db = null;
try { db = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch (e) { ok("removed_api.json がパースできる", false, e.message); }
if (db) {
  ok("removed_api.json がパースできる", true);
  ok("features が非空配列", Array.isArray(db.features) && db.features.length >= 8, "件数=" + (db.features || []).length);
  for (const f of db.features || []) {
    ok(`必須フィールド: ${f.feature || "(無名)"}`, !!(f.feature && f.removedOn && f.section && (Array.isArray(f.ids) || Array.isArray(f.idsRecordedOnly))));
    for (const r of f.idsRecordedOnly || []) ok(`走査除外に reason がある: ${r.id}`, !!(r.id && r.reason));
  }
}

// ---- 違反パターン(feed_discipline_regression から移設+V6-P2で③を追加) ----
// 「取得して叩く」形・「メソッドとして呼ぶ」形・「撤廃グローバルのメンバーを触る」形を違反とする。
// ③の由来: test-trait-catalog.html が `RECIPES.forEach(...)` の裸参照で ReferenceError となり
//   **全行が描画されない状態**を①②が素通しした(2026-08-10検出)。typeof 検査(無いことの検査)は
//   直後にドットが来ないため③に掛からない=正しい書き方は引き続き通る。
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const patternsFor = (id) => [
  new RegExp(esc(id) + "[\"'`]\\s*\\)\\s*\\.\\s*click"),   // ① getElementById("id").click()
  new RegExp("\\.\\s*" + esc(id) + "\\s*\\("),              // ② Game.id(...) / UI.id(...)
  new RegExp("\\b" + esc(id) + "\\s*\\.\\s*\\w"),           // ③ ID.forEach(...) 等=撤廃グローバルの実参照
];

// ---- ★カナリア: パターンが違反サンプルを本当に検知するか(検知できない走査は0件を偽造する) ----
{
  const clickSample = 'document.getElementById("bm-' + 'quick").click()';   // 連結で自己検知を回避
  const callSample = "Game.check" + "Allies()";
  const bareSample = "RECI" + "PES.forEach((r) => {})";
  ok("★カナリア: click形を検知する", patternsFor("bm-quick")[0].test(clickSample));
  ok("★カナリア: メソッド呼び出し形を検知する", patternsFor("checkAllies")[1].test(callSample));
  ok("★カナリア: 裸のグローバル参照を検知する(実際に見逃した形)", patternsFor("RECIPES")[2].test(bareSample));
  ok("★カナリア: 無いことの検査は通す(typeof)", !patternsFor("synthesize").some((p) => p.test('typeof Game.synthesize !== "function"')));
  ok("★カナリア: 無いことの検査は通す(typeof裸)", !patternsFor("RECIPES").some((p) => p.test('typeof RECIPES === "undefined"')));
  ok("★カナリア: 無いことの検査は通す(!getElementById)", !patternsFor("bm-quick").some((p) => p.test('!document.getElementById("bm-quick")')));
}

// ---- 全数走査: test-*.html / tests/*.js / tools/*(.js|.mjs) ----
if (db && Array.isArray(db.features)) {
  const SELF = path.basename(__filename);
  const files = []
    .concat(fs.readdirSync(ROOT).filter((f) => /^test-.*\.html$/.test(f)).map((f) => [f, path.join(ROOT, f)]))
    .concat(fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".js") && f !== SELF).map((f) => ["tests/" + f, path.join(ROOT, "tests", f)]))
    .concat(fs.existsSync(path.join(ROOT, "tools")) ? fs.readdirSync(path.join(ROOT, "tools")).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => ["tools/" + f, path.join(ROOT, "tools", f)]) : []);
  ok("走査対象がある(test-*.html + tests/ + tools/)", files.length >= 10, "対象=" + files.length);

  const allIds = db.features.flatMap((f) => f.ids || []);
  ok("走査対象の識別子が登録されている", allIds.length >= 30, "識別子=" + allIds.length);

  const bad = [];
  for (const [name, fp] of files) {
    const src = fs.readFileSync(fp, "utf8");
    for (const id of allIds) {
      if (patternsFor(id).some((p) => p.test(src))) bad.push(name + " → " + id);
    }
  }
  ok("撤廃済みAPI/UIを叩くテスト・QAページ・ツールが無い(撤廃と追随は同一コミット・§5x-OPS ⑭)", bad.length === 0, bad.join(" / "));
}

console.log(`\n=== 撤廃API 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(単一の真実=docs/removed_api.json・叩く形のみ違反・無いことの検査は通す)");
