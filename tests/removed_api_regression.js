"use strict";
// ============================================================
// 撤廃済みAPIの追随 回帰テスト(恒久・2026-08-10 Ric裁定・§5x-OPS ⑫の再発防止)
//
// 【背景】「機能を撤廃したらそれを叩くテスト・QAページを同一コミットで追随させる」は規律として
//   存在したが**2度破られた**(繁殖UI撤廃 2026-07-30 / 合成撤廃 2026-08-10)。
//   いずれも人手の列挙に頼っていたため列挙漏れ=検知漏れになった。
//   そこで docs/removed_api.json を単一の真実とし、QA資産を機械的に全数走査する。
//
// 【判定】リスト上の識別子を「叩いている」箇所のみ違反。
//   - 違反 : 呼び出し `foo(` / DOM取得 `getElementById("foo")` / `.click()` の対象 / 実データ参照 `FOO.filter(`
//   - 合法 : 「無いこと」の検査 (typeof x !== / === undefined / !document.getElementById / .length === 0 など)
//   本体コード(js/)は対象外。撤廃の記録コメントや移行関数が正当に名前を残すため。
// 実行: node tests/removed_api_regression.js
// ============================================================
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? " :: " + e : "")); } };

const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/removed_api.json"), "utf8"));
const IDS = LIST.removed.map((r) => r.id);
// 種別表は violates() より前に用意する(const は巻き上がらないため、後置するとカナリアで参照エラーになる)
const KIND = {};
for (const r of LIST.removed) KIND[r.id] = r.kind;

// ---- 走査対象: QA資産のみ(本体 js/ は対象外) ----
const targets = [];
for (const f of fs.readdirSync(ROOT)) if (/^test-.*\.html$/.test(f)) targets.push(f);
for (const d of ["tests", "tools"]) {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p)) if (/\.(js|mjs)$/.test(f) && f !== path.basename(__filename)) targets.push(d + "/" + f);
}

console.log(`== 撤廃リスト ${IDS.length} 件 / 走査対象 ${targets.length} ファイル ==`);
ok("★リストが空でない(単一の真実が生きている)", IDS.length > 0);
ok("★走査対象が集まっている(検査が空振りしていない)", targets.length >= 10, "targets=" + targets.length);

// ---- ★カナリア: この検査は本当に違反を見つけられるのか ----
{
  const probe = `document.getElementById("bm-quick").click(); Game.quickBreed(lz);`;
  const hits = IDS.filter((id) => violates(probe, id));
  ok("★カナリア: 人工の違反コードを検出できる", hits.length >= 2, "検出=" + hits.join(","));
  const safe = `ok("撤廃済み", document.getElementById("bm-quick") === null && typeof Game.quickBreed !== "function");`;
  const hits2 = IDS.filter((id) => violates(safe, id));
  ok("★カナリア: 「無いことの検査」は違反にしない", hits2.length === 0, "誤検出=" + hits2.join(","));
}

// 「叩いている」判定。行単位で見て、その行が“無いことの検査”なら見逃す。
// ★種別で判定を分ける。DOM id は文字列の中にしか現れないので文字列を潰してはいけない。
//   逆に api/data/cfg は文字列や正規表現に名前として並ぶ(禁止リスト等)ため潰す必要がある。
function violates(src, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isDom = KIND[id] === "dom";
  const lines = src.split("\n");
  for (const raw of lines) {
    let line = raw.replace(/^\s*\/\/.*$/, "");                         // 行コメントは無視
    if (/^\s*[*]|^\s*\/\*/.test(raw)) continue;                        // ブロックコメント行
    // ★文字列リテラルと正規表現リテラルを潰してから判定する。
    //   そうしないと「撤廃済み識別子を**名前として列挙している**行」(禁止リスト・正規表現による検査)まで
    //   違反に見えてしまう=検査が緑にならず、緩めたくなって本末転倒になる。
    if (!isDom) line = line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""').replace(/\/[^/\n]{2,}\/[gimsuy]*/g, "//");
    if (!new RegExp(esc).test(line)) continue;
    // 「無いこと」を確かめている行は合法(否定つきのDOM取得も含む)
    if (/!==\s*"?(function|object|undefined)|===\s*(null|undefined)|typeof\s+\w+[.\w]*\s*[!=]==|![\w.]*\s*\.?(getElementById|querySelector)|\.length\s*===\s*0|=== undefined|undefined ===/.test(line)) continue;
    // 叩いている形
    if (new RegExp(`\\b${esc}\\s*\\(`).test(line)) return true;         // 関数呼び出し
    if (new RegExp(`getElementById\\(\\s*["'\`]${esc}["'\`]`).test(line)) return true;
    if (new RegExp(`querySelector(All)?\\([^)]*[#.]${esc}\\b`).test(line)) return true;
    if (new RegExp(`\\b${esc}\\s*\\.\\s*(filter|map|find|forEach|some|every|slice|length)\\b`).test(line)) return true;
    if (new RegExp(`\\bfor\\s*\\((const|let|var)\\s+\\w+\\s+of\\s+${esc}\\b`).test(line)) return true;
  }
  return false;
}

console.log("== QA資産が撤廃済みAPIを叩いていないか(全数) ==");
{
  const viol = [];
  for (const rel of targets) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const id of IDS) if (violates(src, id)) viol.push(`${rel} → ${id}`);
  }
  ok("★撤廃済みAPIを叩いているQA資産が無い", viol.length === 0, viol.join(" / "));
  console.log(viol.length ? "  違反:\n   - " + viol.join("\n   - ") : "  違反なし");
}

console.log("== リスト自体の健全性 ==");
{
  const dup = IDS.filter((v, i) => IDS.indexOf(v) !== i);
  ok("識別子の重複が無い", dup.length === 0, dup.join(","));
  const bad = LIST.removed.filter((r) => !r.id || !r.kind || !r.since || !r.ref);
  ok("全エントリに id/kind/since/ref がある", bad.length === 0, bad.map((b) => b.id).join(","));
  ok("見送り案(提案2)の記録が残っている", !!(LIST._deferred && LIST._deferred.proposal2));
  ok("規律(撤廃時に追記する)が明記されている", /同一コミットでこのファイルへ追記/.test(LIST._readme.join("")));
}

console.log(`\n=== 撤廃API追随 回帰テスト結果: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべてPASS(QA資産は撤廃済みAPIを叩いていない/リストは健全)");
