// Shared logic for the live-schedule API. Storage is injected so the same rules
// run on the Node server (file storage) and the Netlify function (Blobs).
// Rules: GET is open to anyone holding the id; PUT/DELETE need the write key,
// which is bound to the id by whoever writes first.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const ID = /^[A-Za-z0-9_-]{16,64}$/;
const initialName = (n) => { const w = String(n || "").trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0].toUpperCase()}.` : w[0] || "Patient"; };
const labelFor = (name, privacy) => (privacy === "none" ? "Booked" : privacy === "full" ? String(name) : initialName(name));
const MAX_ACTIONS = 500;
const hash = (k) => createHash("sha256").update(String(k)).digest("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const MAX_BYTES = 512 * 1024;

export async function handle(store, { method, id, key, body }) {
  if (!ID.test(id || "")) return { status: 400, json: { error: "bad id" } };
  const cur = await store.get(id);
  if (method === "GET") {
    if (!cur) return { status: 404, json: { error: "not found" } };
    const pr = cur.data.privacy;
    const pending = (cur.actions || []).filter((a) => a.type === "add" || a.type === "cancel").map((a) => (a.type === "add" ? { id: a.id, type: "add", date: a.date, time: a.time, label: labelFor(a.name, pr), reason: pr === "full" ? a.reason : "", by: a.by } : { id: a.id, type: "cancel", apptId: a.apptId, by: a.by }));
    return { status: 200, json: { ...cur.data, updatedAt: cur.updatedAt, canEdit: !!cur.editHash, pending } };
  }
  if (!key || String(key).length < 16) return { status: 403, json: { error: "write key required" } };
  if (cur && !same(cur.keyHash, hash(key))) return { status: 403, json: { error: "wrong key" } };
  if (method === "DELETE") { if (cur) await store.del(id); return { status: 200, json: { ok: true } }; }
  if (method === "PUT") {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { return { status: 400, json: { error: "bad json" } }; }
    if (!data || data.v !== 1 || !Array.isArray(data.appts)) return { status: 400, json: { error: "bad snapshot" } };
    if (JSON.stringify(data).length > MAX_BYTES) return { status: 413, json: { error: "too large" } };
    const clean = { v: 1, clinic: String(data.clinic || "").slice(0, 120), privacy: String(data.privacy || "initial"),
      appts: data.appts.slice(0, 3000).map((a) => ({ id: String(a.id), date: String(a.date), time: String(a.time || ""), status: String(a.status), label: String(a.label || "").slice(0, 80), rct: a.rct || null, reason: String(a.reason || "").slice(0, 120), src: a.src === "shared" ? "shared" : "", addedBy: String(a.addedBy || "").slice(0, 40), srcId: String(a.srcId || "").slice(0, 40), cancelNote: String(a.cancelNote || "").slice(0, 80) })) };
    const editHash = typeof data.editHash === "string" && /^[0-9a-f]{64}$/.test(data.editHash) ? data.editHash : null;
    await store.set(id, { keyHash: cur ? cur.keyHash : hash(key), data: clean, updatedAt: new Date().toISOString(), editHash, actions: editHash ? (cur && cur.actions) || [] : [], seq: (cur && cur.seq) || 0 });
    return { status: 200, json: { ok: true } };
  }
  return { status: 405, json: { error: "method not allowed" } };
}

// ---- encrypted backup / sync blobs (the server never sees plaintext or the encryption key) ----
export const MAX_BACKUP = 40 * 1024 * 1024;
export async function handleBackup(store, { method, id, key, expectRev, body }) {
  if (!ID.test(id || "")) return { status: 400, json: { error: "bad id" } };
  if (!key || String(key).length < 16) return { status: 403, json: { error: "write key required" } };
  const k = "b:" + id; const cur = await store.get(k);
  if (cur && !same(cur.keyHash, hash(key))) return { status: 403, json: { error: "wrong key" } };
  if (method === "GET") return cur ? { status: 200, json: { rev: cur.rev, updatedAt: cur.updatedAt, iv: cur.iv, ct: cur.ct } } : { status: 404, json: { error: "not found" } };
  if (method === "DELETE") { if (cur) await store.del(k); return { status: 200, json: { ok: true } }; }
  if (method === "PUT") {
    const have = cur ? cur.rev : 0;
    if (Number(expectRev) !== have) return { status: 409, json: { error: "out of date", rev: have } };
    let d; try { d = typeof body === "string" ? JSON.parse(body) : body; } catch { return { status: 400, json: { error: "bad json" } }; }
    if (!d || typeof d.iv !== "string" || typeof d.ct !== "string") return { status: 400, json: { error: "bad payload" } };
    if (d.ct.length > MAX_BACKUP) return { status: 413, json: { error: "too large" } };
    await store.set(k, { keyHash: cur ? cur.keyHash : hash(key), rev: have + 1, iv: d.iv, ct: d.ct, updatedAt: new Date().toISOString() });
    return { status: 200, json: { ok: true, rev: have + 1 } };
  }
  return { status: 405, json: { error: "method not allowed" } };
}

// ---- shared-calendar edits: people with the edit link can ADD appointments and MARK CANCELLED. Nothing can be deleted. ----
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, AID = /^[A-Za-z0-9_-]{6,40}$/;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function pushAction(rec, a) {
  rec.actions = rec.actions || []; rec.seq = (rec.seq || 0) + 1;
  if (rec.actions.some((x) => x.id === a.id)) { rec.seq -= 1; return "dup"; }
  rec.actions.push({ ...a, seq: rec.seq, at: new Date().toISOString() }); return "ok";
}
export async function handleAct(store, { id, editKey, body }) {
  if (!ID.test(id || "")) return { status: 400, json: { error: "bad id" } };
  const cur = await store.get(id);
  if (!cur || !cur.editHash) return { status: 404, json: { error: "editing is not switched on for this link" } };
  if (!editKey || !same(cur.editHash, hash(editKey))) return { status: 403, json: { error: "wrong edit key" } };
  let d; try { d = typeof body === "string" ? JSON.parse(body) : body; } catch { return { status: 400, json: { error: "bad json" } }; }
  if (!d || !AID.test(d.id || "")) return { status: 400, json: { error: "bad action id" } };
  const by = clip(d.by, 40); if (!by) return { status: 400, json: { error: "your name is required" } };
  if ((cur.actions || []).length >= MAX_ACTIONS) return { status: 429, json: { error: "the clinic has not collected earlier changes yet" } };
  let a;
  if (d.type === "add") {
    const name = clip(d.name, 80), phone = clip(d.phone, 20);
    if (!name) return { status: 400, json: { error: "patient name required" } };
    if (phone && !/^[\d+\s()-]{6,20}$/.test(phone)) return { status: 400, json: { error: "bad phone" } };
    if (!DATE.test(d.date || "") || Number.isNaN(Date.parse(d.date))) return { status: 400, json: { error: "bad date" } };
    if (d.time && !TIME.test(d.time)) return { status: 400, json: { error: "bad time" } };
    a = { id: d.id, type: "add", name, phone, date: d.date, time: d.time || "", reason: clip(d.reason, 120), by };
  } else if (d.type === "cancel") {
    if (!AID.test(d.apptId || "")) return { status: 400, json: { error: "bad appointment" } };
    a = { id: d.id, type: "cancel", apptId: d.apptId, by };
  } else return { status: 400, json: { error: "action not allowed" } }; // there is deliberately no delete
  pushAction(cur, a); await store.set(id, cur);
  return { status: 200, json: { ok: true } };
}
export async function handleActions(store, { id, key }) {
  if (!ID.test(id || "")) return { status: 400, json: { error: "bad id" } };
  const cur = await store.get(id);
  if (!cur) return { status: 404, json: { error: "not found" } };
  if (!key || !same(cur.keyHash, hash(key))) return { status: 403, json: { error: "wrong key" } };
  return { status: 200, json: { actions: cur.actions || [] } };
}
export async function handleAck(store, { id, key, body }) {
  if (!ID.test(id || "")) return { status: 400, json: { error: "bad id" } };
  const cur = await store.get(id);
  if (!cur) return { status: 404, json: { error: "not found" } };
  if (!key || !same(cur.keyHash, hash(key))) return { status: 403, json: { error: "wrong key" } };
  let d; try { d = typeof body === "string" ? JSON.parse(body) : body; } catch { d = null; }
  const ids = d && Array.isArray(d.ids) ? new Set(d.ids.map(String)) : new Set();
  cur.actions = (cur.actions || []).filter((a) => !ids.has(a.id)); await store.set(id, cur);
  return { status: 200, json: { ok: true, left: cur.actions.length } };
}
// WhatsApp Cloud API webhook (needs a Meta WhatsApp Business account). Incoming texts are queued for the clinic app,
// which matches the sender's number to a patient and cancels the next appointment when the text is a cancellation.
export async function handleInbound(store, { method, id, query, raw, signature, env }) {
  if (!env.WA_VERIFY_TOKEN || !env.WA_APP_SECRET) return { status: 503, text: "WhatsApp webhook is not configured on this server" };
  if (method === "GET") {
    const ok = query["hub.mode"] === "subscribe" && query["hub.verify_token"] && same(String(query["hub.verify_token"]), String(env.WA_VERIFY_TOKEN));
    return ok ? { status: 200, text: String(query["hub.challenge"] || "") } : { status: 403, text: "forbidden" };
  }
  if (method !== "POST") return { status: 405, text: "method not allowed" };
  const want = "sha256=" + createHmac("sha256", env.WA_APP_SECRET).update(raw).digest("hex");
  if (!signature || !same(String(signature), want)) return { status: 403, text: "bad signature" };
  if (!ID.test(id || "")) return { status: 400, text: "bad id" };
  const cur = await store.get(id);
  if (!cur) return { status: 404, text: "unknown clinic link" };
  let j; try { j = JSON.parse(raw); } catch { return { status: 400, text: "bad json" }; }
  let n = 0;
  for (const e of j.entry || []) for (const c of e.changes || []) for (const m of (c.value && c.value.messages) || []) {
    if (m.type !== "text" || !m.text || !AID.test(String(m.id || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40))) continue;
    if ((cur.actions || []).length >= MAX_ACTIONS) break;
    if (pushAction(cur, { id: String(m.id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40), type: "inbound", from: clip(m.from, 20), text: clip(m.text.body, 500) }) === "ok") n++;
  }
  await store.set(id, cur);
  return { status: 200, text: "ok " + n };
}
