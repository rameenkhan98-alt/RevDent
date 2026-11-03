// Host RevDent yourself:  npm run build && node server.js
// Serves the built app from ./dist and the live-schedule API. Set PORT and DATA_FILE if needed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual, createHash } from "node:crypto";
import { fileStore, scheduleMiddleware } from "./schedule-server.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const api = scheduleMiddleware(fileStore(process.env.DATA_FILE || "./data/schedules.json"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };
const secure = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "permissions-policy": "camera=(), geolocation=(), microphone=(self)", "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };

// Optional site-wide password: set APP_PASSWORD and the browser asks for it (any username) before showing anything.
// /api/inbound (WhatsApp webhook, protected by its own signature) and /healthz are exempt.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const h32 = (x) => createHash("sha256").update(String(x)).digest();
const bad = new Map();
function allowed(req, res) {
  const path = new URL(req.url, "http://x").pathname;
  if (!APP_PASSWORD || path === "/healthz" || path.startsWith("/api/inbound/")) return true;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  const b = bad.get(ip) || { n: 0, until: 0 };
  if (Date.now() < b.until) { res.writeHead(429, { "retry-after": "300", "content-type": "text/plain" }); res.end("Too many wrong passwords. Try again in a few minutes."); return false; }
  const m = /^Basic (.+)$/.exec(req.headers.authorization || "");
  let pw = ""; if (m) { const d = Buffer.from(m[1], "base64").toString(); pw = d.slice(d.indexOf(":") + 1); }
  if (m && timingSafeEqual(h32(pw), h32(APP_PASSWORD))) { bad.delete(ip); return true; }
  if (m) { b.n++; if (b.n >= 8) { b.until = Date.now() + 300000; b.n = 0; } bad.set(ip, b); }
  res.writeHead(401, { "www-authenticate": 'Basic realm="RevDent", charset="UTF-8"', "content-type": "text/plain", "cache-control": "no-store" }); res.end("Password required");
  return false;
}
createServer((req, res) => { if (req.url === "/healthz") { res.writeHead(200); return res.end("ok"); } if (!allowed(req, res)) return; api(req, res, async () => {
  const _wh = res.writeHead.bind(res); res.writeHead = (c, h) => _wh(c, { ...secure, ...(h || {}) });
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try { const f = join(root, p === "/" ? "index.html" : p); const b = await readFile(f); res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); res.end(b); }
  catch { try { const b = await readFile(join(root, "index.html")); res.writeHead(200, { "content-type": types[".html"] }); res.end(b); } catch { res.writeHead(404); res.end("Run npm run build first"); } }
}); }).listen(process.env.PORT || 8080, () => console.log("RevDent on http://localhost:" + (process.env.PORT || 8080) + (APP_PASSWORD ? " (password protected)" : "")));
