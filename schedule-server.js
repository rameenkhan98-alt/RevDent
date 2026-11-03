import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { handle, handleBackup, handleAct, handleActions, handleAck, handleInbound, MAX_BYTES, MAX_BACKUP } from "./schedule-core.js";

export function fileStore(path) {
  let m = {};
  if (existsSync(path)) { try { m = JSON.parse(readFileSync(path, "utf8")); } catch { m = {}; } }
  const flush = () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path + ".tmp", JSON.stringify(m), { mode: 0o600 }); renameSync(path + ".tmp", path); };
  return { get: async (id) => m[id] || null, set: async (id, v) => { m[id] = v; flush(); }, del: async (id) => { delete m[id]; flush(); } };
}

// Simple per-address limits: general traffic, and repeated wrong keys.
function limiter() {
  const gen = new Map(), bad = new Map();
  const hit = (map, ip, win) => { const n = Date.now(); const r = (map.get(ip) || []).filter((t) => n - t < win); r.push(n); map.set(ip, r); return r.length; };
  setInterval(() => { const n = Date.now(); for (const m of [gen, bad]) for (const [k, v] of m) if (!v.some((t) => n - t < 600000)) m.delete(k); }, 60000).unref();
  return { general: (ip) => hit(gen, ip, 60000) > 300, failed: (ip) => hit(bad, ip, 600000), blocked: (ip) => (bad.get(ip) || []).filter((t) => Date.now() - t < 600000).length >= 15 };
}
const ipOf = (req) => (process.env.TRUST_PROXY ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "?";

// Connect-style middleware: handles /api/schedule/:id and /api/backup/:id.
export function scheduleMiddleware(store) {
  const lim = limiter();
  return (req, res, next) => {
    const u = new URL(req.url, "http://x");
    const m = /^\/api\/(schedule|backup)\/([^/]+)(?:\/(act|actions|ack))?$/.exec(u.pathname);
    const w = /^\/api\/inbound\/([^/]+)$/.exec(u.pathname);
    if (!m && !w) return next ? next() : false;
    const kind = w ? "inbound" : m[1], sub = m && m[3], max = kind === "backup" ? MAX_BACKUP * 1.4 : MAX_BYTES * 2;
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-write-key,x-expect-rev,x-edit-key", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const ip = ipOf(req);
    if (lim.general(ip) || lim.blocked(ip)) { res.writeHead(429, { ...cors, "content-type": "application/json", "retry-after": "300" }); return res.end('{"error":"too many requests"}'); }
    let size = 0; const chunks = []; let dead = false;
    req.on("data", (c) => { size += c.length; if (size > max) { dead = true; res.writeHead(413, cors); res.end(); req.destroy(); } else chunks.push(c); });
    req.on("end", async () => {
      if (dead) return;
      const raw = Buffer.concat(chunks).toString("utf8"); let r;
      if (kind === "inbound") {
        r = await handleInbound(store, { method: req.method, id: w[1], query: Object.fromEntries(u.searchParams), raw, signature: req.headers["x-hub-signature-256"], env: process.env });
        if (r.status === 403) lim.failed(ip);
        res.writeHead(r.status, { ...cors, "content-type": "text/plain" }); return res.end(r.text);
      }
      const args = { method: req.method, id: m[2], key: req.headers["x-write-key"], editKey: req.headers["x-edit-key"], expectRev: req.headers["x-expect-rev"], body: raw };
      if (kind === "backup") r = await handleBackup(store, args);
      else if (sub === "act") r = req.method === "POST" ? await handleAct(store, args) : { status: 405, json: { error: "method not allowed" } };
      else if (sub === "actions") r = req.method === "GET" ? await handleActions(store, args) : { status: 405, json: { error: "method not allowed" } };
      else if (sub === "ack") r = req.method === "POST" ? await handleAck(store, args) : { status: 405, json: { error: "method not allowed" } };
      else r = await handle(store, args);
      if (r.status === 403) lim.failed(ip);
      res.writeHead(r.status, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  };
}
