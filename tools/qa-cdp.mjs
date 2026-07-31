// =============================================================
// qa-cdp — 実ブラウザQAの再現手順をコード化した最小ツール(外部依存ゼロ)
//
// なぜ作ったか(Fable3「ビルド手順が記憶にしか存在しない」の解消):
//   QA3層(装置QA / 姿形QA / 統合QA)と console 0 の証拠取りは、毎回ヘッドレスChromeを
//   手で叩いて再現していた。手順が記憶にしか無いと、次のセッションで同じ検証ができない。
//   ここに静的サーバ + CDPクライアント(WebSocketを自前実装)を置き、コマンド1本で回せるようにする。
//
// 使い方:
//   node tools/qa-cdp.mjs <path> [--wait-title <regex>] [--timeout <ms>] [--shot <file.png>]
//                                [--size 1280x800] [--eval "<js>"] [--reduced]
//   例) node tools/qa-cdp.mjs /test-opening-qa.html --wait-title "done" --timeout 120000
//
// 出力: JSON 1行 { url, title, console:[...], exceptions:[...], eval }
//   console/exceptions が空であることが「console 0」の証拠になる。
// =============================================================
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };

// ---------------- 静的サーバ(cleanUrls無し=?tune=1 のクエリを落とさない) ----------------
function serve(port) {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    // ブラウザが自動要求する favicon は 204 で返す(404 が console を汚し「console 0」の証拠を濁すため)
    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    const f = path.join(ROOT, p === "/" ? "index.html" : p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r(srv)));
}

// ---------------- 最小WebSocketクライアント(RFC6455・クライアント→サーバはマスク必須) ----------------
class WS {
  constructor(sock) { this.sock = sock; this.buf = Buffer.alloc(0); this.frag = []; this.onmessage = null; sock.on("data", (d) => this._feed(d)); }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const key = crypto.randomBytes(16).toString("base64");
      const sock = net.connect(+u.port, u.hostname, () => {
        sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      sock.once("error", reject);
      let head = Buffer.alloc(0);
      const onHead = (d) => {
        head = Buffer.concat([head, d]);
        const i = head.indexOf("\r\n\r\n");
        if (i < 0) return;
        if (!/HTTP\/1\.1 101/.test(head.slice(0, i).toString())) return reject(new Error("upgrade failed"));
        sock.removeListener("data", onHead);
        const ws = new WS(sock);
        const rest = head.slice(i + 4);
        if (rest.length) ws._feed(rest);
        resolve(ws);
      };
      sock.on("data", onHead);
    });
  }
  _feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), op = b0 & 0x0f;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (this.buf.length < off + len) return;
      const payload = this.buf.slice(off, off + len);
      this.buf = this.buf.slice(off + len);
      if (op === 8) { this.sock.end(); return; }
      if (op === 9) { this._send(payload, 0x0a); continue; }   // ping→pong
      if (op === 0 || op === 1) {
        this.frag.push(payload);
        if (fin) { const msg = Buffer.concat(this.frag).toString("utf8"); this.frag = []; if (this.onmessage) this.onmessage(msg); }
      }
    }
  }
  _send(payload, op) {
    const mask = crypto.randomBytes(4);
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, 0x80 | n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 0x80 | 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(n), 2); }
    const body = Buffer.from(payload);
    for (let i = 0; i < n; i++) body[i] ^= mask[i & 3];
    this.sock.write(Buffer.concat([head, mask, body]));
  }
  send(s) { this._send(Buffer.from(s, "utf8"), 1); }
  close() { try { this.sock.end(); } catch { /* noop */ } }
}

// ---------------- CDP ----------------
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waits = new Map(); this.events = []; ws.onmessage = (m) => this._on(JSON.parse(m)); }
  _on(msg) {
    if (msg.id != null && this.waits.has(msg.id)) { const w = this.waits.get(msg.id); this.waits.delete(msg.id); msg.error ? w.rej(new Error(JSON.stringify(msg.error))) : w.res(msg.result); return; }
    if (msg.method) this.events.push(msg);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.waits.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

const getJSON = (url) => new Promise((res, rej) => http.get(url, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- main ----------------
const argv = process.argv.slice(2);
const arg = (k, dflt) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : dflt; };
const target = argv[0] && !argv[0].startsWith("--") ? argv[0] : "/index.html";
const waitTitle = arg("--wait-title", null);
const timeout = +arg("--timeout", 60000);
const shot = arg("--shot", null);
const size = arg("--size", "1280x800").split("x").map(Number);
const evalJs = arg("--eval", null);
const reduced = argv.includes("--reduced");

const PORT = 8731 + (process.pid % 200);
const DBG = 9431 + (process.pid % 200);
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
].find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || "chrome";

const srv = await serve(PORT);
const profile = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "qacdp-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
  `--window-size=${size[0]},${size[1]}`, "--no-first-run", "--no-default-browser-check",
  "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  ...(reduced ? ["--force-prefers-reduced-motion"] : []),
  "about:blank",
], { stdio: "ignore" });

const finish = async (payload, code) => {
  console.log(JSON.stringify(payload));
  try { chrome.kill(); } catch { /* noop */ }
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  process.exit(code);
};

try {
  let list = null;
  for (let i = 0; i < 100 && !list; i++) { try { list = await getJSON(`http://127.0.0.1:${DBG}/json/list`); } catch { await sleep(120); } }
  if (!list) throw new Error("chrome debug port not reachable");
  const page = list.find((t) => t.type === "page") || list[0];
  const cdp = new CDP(await WS.connect(page.webSocketDebuggerUrl));
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");

  const url = `http://127.0.0.1:${PORT}${target.startsWith("/") ? "" : "/"}${target}`;
  await cdp.send("Page.navigate", { url });

  const t0 = Date.now();
  let title = "";
  for (;;) {
    await sleep(400);
    try { title = (await cdp.send("Runtime.evaluate", { expression: "document.title", returnByValue: true })).result.value || ""; } catch { /* noop */ }
    if (waitTitle && new RegExp(waitTitle).test(title)) break;
    if (Date.now() - t0 > timeout) { if (waitTitle) title += " [TIMEOUT]"; break; }
    if (!waitTitle && Date.now() - t0 > 1500) break;
  }

  let evalOut = null;
  if (evalJs) evalOut = (await cdp.send("Runtime.evaluate", { expression: evalJs, returnByValue: true, awaitPromise: true })).result.value;
  if (shot) {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(shot, Buffer.from(r.data, "base64"));
  }

  // console は「ゲーム由来のerror/warning」だけを数える(計測アーティファクトは除かない=正直に全部出す)
  const cons = cdp.events.filter((e) => e.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(e.params.type))
    .map((e) => e.params.type + ": " + e.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
  const logs = cdp.events.filter((e) => e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level))
    .map((e) => e.params.entry.level + ": " + e.params.entry.text + (e.params.entry.url ? " @" + e.params.entry.url : ""));
  const exc = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);

  await finish({ url, title, console: [...cons, ...logs], exceptions: exc, eval: evalOut }, /FAIL [1-9]|TIMEOUT/.test(title) || exc.length ? 1 : 0);
} catch (e) {
  await finish({ error: e.message }, 2);
}
