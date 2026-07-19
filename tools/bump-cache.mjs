#!/usr/bin/env node
// ============================================================
// bump-cache.mjs — アセットのキャッシュバスター(内容ハッシュ)を index.html に刻む
//
// 目的(構造的保証): 「ローカルで確認したもの=本番に出る」を、ブラウザ/CDNの
// キャッシュ状態に依存せず保証する。tokens.css/style.css/js/*.js の参照URLへ
// `?v=<内容ハッシュ8桁>` を付与する。ファイルが変わった時だけURLが変わる=
//  - 変更ファイル: URLが変わる → ブラウザは必ず新規取得(古いCSS/JSが残らない)
//  - 未変更ファイル: URL不変 → CDN/ブラウザキャッシュ再利用(無駄な再取得なし)
//
// 使い方(デプロイ前に毎回): node tools/bump-cache.mjs
//   → index.html を書き換える → git add/commit → npx vercel --prod
// (must-revalidate ヘッダ(vercel.json)は据え置き。本方式はその上の確実な保険)
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(ROOT, "index.html");
let html = readFileSync(htmlPath, "utf8");

const hashOf = (relPath) => {
  const buf = readFileSync(join(ROOT, relPath));
  return createHash("sha1").update(buf).digest("hex").slice(0, 8);
};

// href="tokens.css" / href="style.css" / src="js/....js" (既存の ?v=... は置換)
const assetRe = /(href|src)="((?:tokens|style)\.css|js\/[^"?]+\.js)(?:\?v=[^"]*)?"/g;
let count = 0, changed = [];
html = html.replace(assetRe, (_m, attr, rel) => {
  const v = hashOf(rel);
  count++; changed.push(`${rel}?v=${v}`);
  return `${attr}="${rel}?v=${v}"`;
});

writeFileSync(htmlPath, html, "utf8");
console.log(`bump-cache: ${count} 個のアセットに内容ハッシュを付与`);
for (const c of changed) console.log("  " + c);
