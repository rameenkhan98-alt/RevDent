import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ============================ helpers ============================ */
const KEY = "dentcare-lite:v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtD = (s) => {
  if (!s) return "";
  const d = new Date(s.length <= 10 ? s + "T00:00" : s);
  return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const fmt12 = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
};
const apptDT = (a) => new Date(`${a.date}T${a.time || "00:00"}`);
const addDays = (s, n) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000);

function normPhone(p, cc = "92") {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = cc + d.slice(1);
  else if (d.length <= 10) d = cc + d;
  return /^\d{10,15}$/.test(d) ? d : "";
}
const waLink = (phone, text, cc) => {
  const n = normPhone(phone, cc);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
};
const b64e = (s) => {
  const b = new TextEncoder().encode(s);
  let bin = "";
  b.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64d = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const FILL_ALIAS = { patient: "name", patient_name: "name", patientname: "name", clinic_name: "clinic", clinicname: "clinic", clinic_phone: "phone" };
const fill = (t, v) => String(t || "").replace(/\{\s*(\w+)\s*\}/g, (m, k) => {
  const key = String(k).toLowerCase();
  const val = v[k] ?? v[key] ?? v[FILL_ALIAS[key]];
  return val ?? m;
});
const download = (name, text, type = "text/plain") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

const DEFAULT_CONSENT =
  "I consent to the dental examination, X-rays and treatment discussed with me by the clinic. The dentist has explained the procedure, its benefits, possible risks and alternatives, and I have had the chance to ask questions. I have given accurate medical information and will tell the clinic about any change. I understand I may withdraw consent at any time before treatment.";
const TPL = {
  tplReminder: "Assalam o Alaikum {name}, this is a reminder of your dental appointment at {clinic} on {date} at {time}. Please reply to confirm or call {phone} to reschedule.",
  tplConsent: "Please read and sign your consent form before your visit: {consent_link}",
  tplForm: "Please fill in your basic information form (takes 2 minutes): {form_link}",
  tplRecall: "Assalam o Alaikum {name}, this is {clinic}. You are due for a follow-up ({reason}) around {date}. Please call or reply to book your appointment: {phone}.",
  tplRecall6: "Assalam o Alaikum {name}, it has been 6 months since your last visit to {clinic}. It is time for your routine dental check-up and cleaning. Reply to this message or call {phone} to book.",
  tplRecall12: "Assalam o Alaikum {name}, it has been a year since your last visit to {clinic}. Please book your annual dental check-up and cleaning. Reply to this message or call {phone}.",
  tplRebook: "Assalam o Alaikum {name}, your appointment at {clinic} on {date} at {time} has been cancelled. We would be glad to see you again. Please reply with a day and time that suits you, or call {phone}, and we will book a new appointment.",
};
const TPL_UR = {
  tplReminder: "اسلام علیکم {name}، آپ کی ڈینٹل اپوائنٹمنٹ {clinic} میں {date} کو {time} بجے ہے۔ براہ کرم وقت پر تشریف لائیں، تبدیلی کے لیے {phone} پر رابطہ کریں۔ شکریہ",
  tplConsent: "براہ کرم آنے سے پہلے اپنا رضامندی فارم پڑھ کر دستخط کریں: {consent_link}",
  tplForm: "براہ کرم اپنی بنیادی معلومات کا فارم پُر کریں: {form_link}",
  tplRecall: "اسلام علیکم {name}، {clinic} میں آپ کا فالو اپ ({reason}) {date} کے قریب ہے۔ اپوائنٹمنٹ کے لیے {phone} پر رابطہ کریں۔ شکریہ",
  tplRecall6: "اسلام علیکم {name}، {clinic} میں آپ کی آخری وزٹ کو 6 ماہ ہو چکے ہیں۔ باقاعدہ چیک اپ اور دانتوں کی صفائی کا وقت ہو گیا ہے۔ اپوائنٹمنٹ کے لیے {phone} پر رابطہ کریں۔",
  tplRecall12: "اسلام علیکم {name}، {clinic} میں آپ کی آخری وزٹ کو ایک سال ہو چکا ہے۔ براہ کرم سالانہ چیک اپ اور صفائی کے لیے اپوائنٹمنٹ لیں۔ {phone} پر رابطہ کریں۔",
  tplRebook: "اسلام علیکم {name}، {clinic} میں {date} کو {time} کی آپ کی اپوائنٹمنٹ منسوخ ہو گئی ہے۔ براہ کرم اپنی سہولت کا دن اور وقت بتائیں یا {phone} پر رابطہ کریں، ہم نئی اپوائنٹمنٹ بنا دیں گے۔",
};
const DEFAULT_RX = [
  { id: "rx-ext", name: "After tooth extraction", keywords: ["extraction", "extract", "wisdom", "impacted"],
    items: [
      { id: "m1", drug: "Tab. Ibuprofen 400 mg", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" },
      { id: "m2", drug: "Chlorhexidine 0.2% mouthwash (start the next day)", per: 10, unit: "ml", perDay: 2, days: 7, when: "rinse for 30 seconds, do not swallow" },
    ],
    note: "• Bite firmly on the gauze for 30–45 minutes.\n• Do not rinse, spit or use a straw for 24 hours.\n• Avoid hot food and drinks today; eat soft, cool food.\n• No smoking or chewing tobacco/paan for at least 48 hours.\n• Some oozing and mild swelling are normal. A cold pack on the cheek (10 minutes on, 10 off) helps.\n• From tomorrow, rinse gently with warm salt water after meals." },
  { id: "rx-rct", name: "After root canal (RCT)", keywords: ["root canal", "rct", "pulpectomy"],
    items: [{ id: "m1", drug: "Tab. Ibuprofen 400 mg", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" }],
    note: "• Numbness wears off in 2–3 hours; take care not to bite your cheek or lip.\n• Avoid chewing hard food on this tooth until it is permanently restored.\n• Mild soreness for a few days is normal.\n• Please attend your next sitting as booked. The temporary filling should not be left for long." },
  { id: "rx-rct-inf", name: "After RCT with infection", keywords: ["rct with infection", "(rct) with infection", "root canal with infection", "infected rct", "rct infection"],
    items: [
      { id: "m1", drug: "Cap. Amoxicillin 500 mg", per: 1, unit: "capsule", perDay: 3, days: 5, when: "after meals" },
      { id: "m2", drug: "Tab. Metronidazole 400 mg", per: 1, unit: "tablet", perDay: 3, days: 5, when: "after meals" },
      { id: "m3", drug: "Tab. Ibuprofen 400 mg", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" },
    ],
    note: "• Complete the full antibiotic course even if you feel better.\n• Swelling or pain may continue for 2–3 days. Call us if swelling spreads, you get a fever, or it is hard to swallow or open your mouth.\n• Attend your next sitting as booked." },
  { id: "rx-fill", name: "After filling / restoration", keywords: ["filling", "glass ionomer", "core build-up", "inlay", "onlay", "sealant"],
    items: [{ id: "m1", drug: "Tab. Paracetamol 500 mg (only if sore)", per: 1, unit: "tablet", perDay: 3, days: 2, when: "after meals" }],
    note: "• Do not eat or drink hot things until the numbness has gone (2–3 hours).\n• Mild sensitivity to hot and cold for a few days is normal.\n• If your bite feels high or the pain gets worse, call us so we can adjust it." },
  { id: "rx-scale", name: "After scaling and cleaning", keywords: ["scaling", "prophylaxis", "deep cleaning", "root planing", "fluoride"],
    items: [{ id: "m1", drug: "Chlorhexidine 0.2% mouthwash", per: 10, unit: "ml", perDay: 2, days: 7, when: "after brushing, rinse 30 seconds, do not swallow" }],
    note: "• Slight gum bleeding and sensitivity for a few days is normal.\n• Brush gently twice a day and clean between your teeth daily.\n• The mouthwash can stain teeth if used for longer than advised.\n• Please come back for a check-up and cleaning in 6 months." },
  { id: "rx-surg", name: "After surgical / wisdom tooth removal", keywords: ["surgical extraction", "impacted wisdom", "wisdom tooth removal", "alveoloplasty"],
    items: [
      { id: "m1", drug: "Cap. Amoxicillin 500 mg", per: 1, unit: "capsule", perDay: 3, days: 5, when: "after meals" },
      { id: "m2", drug: "Tab. Ibuprofen 400 mg", per: 1, unit: "tablet", perDay: 3, days: 5, when: "after meals" },
      { id: "m3", drug: "Chlorhexidine 0.2% mouthwash (start the next day)", per: 10, unit: "ml", perDay: 2, days: 7, when: "rinse 30 seconds, do not swallow" },
    ],
    note: "• Bite on the gauze for 45 minutes. Do not rinse, spit or use a straw for 24 hours.\n• Swelling is usually worst on day 2–3. Use a cold pack for the first day, then warm compresses.\n• Eat soft, cool food. No smoking or paan for 72 hours.\n• Come back to have the stitches checked or removed as advised.\n• Call us if bleeding does not stop, swelling spreads, or you get a fever." },
  { id: "rx-abs", name: "Dental abscess / infection (antibiotic course)", keywords: ["abscess", "incision & drainage", "infection"],
    items: [
      { id: "m1", drug: "Cap. Amoxicillin 500 mg", per: 1, unit: "capsule", perDay: 3, days: 5, when: "after meals" },
      { id: "m2", drug: "Tab. Metronidazole 400 mg", per: 1, unit: "tablet", perDay: 3, days: 5, when: "after meals" },
      { id: "m3", drug: "Tab. Ibuprofen 400 mg", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" },
    ],
    note: "• Finish the whole antibiotic course.\n• Rinse gently with warm salt water after meals.\n• Call us at once if swelling spreads to the eye or neck, or you have trouble swallowing or breathing." },
  { id: "rx-pulp", name: "After pulpotomy / pulp capping", keywords: ["pulpotomy", "pulp capping"], items: [],
    note: "• Avoid chewing hard food on this tooth until it is fully restored.\n• Mild soreness can happen. If pain relief is needed, use the medicine and dose the dentist advises (for children the dose depends on weight).\n• Please attend your next visit for the permanent restoration." },
  { id: "rx-crown", name: "After crown / bridge / denture / implant", keywords: ["crown", "bridge", "veneer", "denture", "implant"], items: [],
    note: "• Avoid sticky or very hard food for 24 hours while the cement sets.\n• Mild sensitivity or gum soreness for a few days is normal.\n• Clean carefully around it every day, including between teeth.\n• If it feels high, loose or sore for more than a few days, call us for an adjustment." }
];
const DEF = {
  settings: { clinic: "Dental Cosmetics", doctor: "Dr Adnan", acEvery: 18, phone: "", staffPhone: "", cc: "92", baseUrl: "", consentText: "", ...TPL, rxTemplates: DEFAULT_RX, rxVer: 2, rxFooter: "If you have severe pain, swelling, fever or bleeding that does not stop, call {phone} immediately.", autoRx: true, autoRecall6: true, autoRecall12: true, recallLead: 7, share: { id: "", key: "", on: false, privacy: "initial", server: "", includeText: false } },
  toothSys: "uni", patients: [], appts: [], tx: [], exp: [], recalls: [], inbox: [], sent: [], cycles: [], checklist: [], acReminders: [],
};
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return DEF; }
}
function normalize(r) {
  try {
    if (!r) return DEF;
    const m = { ...DEF, ...r, settings: { ...DEF.settings, ...r.settings } };
    if (((r.settings && r.settings.rxVer) || 1) < 2) { const have = new Set((r.settings && r.settings.rxTemplates ? r.settings.rxTemplates : []).map((x) => x.id)); m.settings = { ...m.settings, rxVer: 2, rxTemplates: [...(r.settings && r.settings.rxTemplates ? r.settings.rxTemplates : []), ...DEFAULT_RX.filter((x) => !have.has(x.id))] }; }
    if (m.settings && Array.isArray(m.settings.rxTemplates)) { const cl = (s) => String(s || "").replace(/,? ?no alcohol/gi, "").replace(/\n?•?[^\n•]*alcohol[^\n•]*/gi, ""); m.settings = { ...m.settings, rxTemplates: m.settings.rxTemplates.map((x) => ({ ...x, note: cl(x.note), items: (x.items || []).map((d) => ({ ...d, when: cl(d.when) })) })) }; }
    if (m.settings) { if (!String(m.settings.clinic || "").trim()) m.settings = { ...m.settings, clinic: DEF.settings.clinic }; if (!String(m.settings.doctor || "").trim()) m.settings = { ...m.settings, doctor: DEF.settings.doctor }; }
    if (!r.toothSys) { m.tx = (m.tx || []).map((x) => ({ ...x, teeth: (x.teeth || []).map(fromFDI) })); m.toothSys = "uni"; } // older saves used FDI
    return m;
  } catch { return DEF; }
}

/* ============================ encryption, storage, merge ============================ */
// AES-256-GCM, key from PBKDF2-SHA256 (600k rounds). The key lives only in memory while unlocked.
const te = new TextEncoder(), td = new TextDecoder();
const toB64 = (buf) => { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const canCrypto = () => !!(globalThis.crypto && globalThis.crypto.subtle);
const ITER = 600000;
async function deriveKey(pass, salt, iter) {
  const km = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const importRaw = (b64) => crypto.subtle.importKey("raw", fromB64(b64), "AES-GCM", false, ["encrypt", "decrypt"]);
async function encJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: toB64(iv), ct: toB64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj)))) };
}
async function decJson(key, e) { return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(e.iv) }, key, fromB64(e.ct)))); }

const vault = { key: null, salt: "", iter: ITER };
const readEnv = () => { try { const j = JSON.parse(localStorage.getItem(KEY)); return j && j.enc ? j : null; } catch { return null; } };
let pendDb = null, saving = null;
async function writeDb(d) {
  const str = vault.key ? JSON.stringify({ enc: 1, v: 1, salt: vault.salt, iter: vault.iter, ...(await encJson(vault.key, d)) }) : JSON.stringify(d);
  localStorage.setItem(KEY, str);
}
function saveDb(d) {
  pendDb = d;
  if (!saving) saving = (async () => { try { while (pendDb) { const x = pendDb; pendDb = null; await writeDb(x); } } finally { saving = null; } })();
  return saving;
}
const flushSave = () => saving || Promise.resolve();
async function vaultSetup(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  vault.key = await deriveKey(pass, salt, ITER); vault.salt = toB64(salt); vault.iter = ITER;
}
const vaultClear = () => { vault.key = null; vault.salt = ""; };
// encrypted file used for backups: same format as the on-device store
async function sealWith(key, salt, iter, obj) { return { enc: 1, v: 1, salt, iter, ...(await encJson(key, obj)) }; }

// ----- record stamps and merge (used by cloud sync) -----
const COLS = ["patients", "appts", "tx", "exp", "recalls", "inbox", "sent", "cycles", "checklist", "acReminders"];
const LOCAL_SET = ["share", "sync"];
function stamp(prev, next) {
  if (prev === next || !next) return next;
  const now = Date.now(); let out = next, tomb = null;
  for (const c of COLS) {
    if (next[c] === prev[c]) continue;
    const pm = new Map((prev[c] || []).map((x) => [x.id, x]));
    const nl = (next[c] || []).map((x) => (pm.get(x.id) === x ? x : { ...x, _m: now }));
    const ids = new Set(nl.map((x) => x.id));
    for (const x of prev[c] || []) if (!ids.has(x.id)) { tomb = tomb || { ...(next.tomb || prev.tomb || {}) }; tomb[x.id] = now; }
    if (out === next) out = { ...next };
    out[c] = nl;
  }
  if (next.settings !== prev.settings && Object.keys(next.settings).some((k) => !LOCAL_SET.includes(k) && next.settings[k] !== prev.settings[k])) { if (out === next) out = { ...next }; out.settingsM = now; }
  if (tomb) { if (out === next) out = { ...next }; out.tomb = tomb; }
  return out;
}
const sortId = (l) => [...(l || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
function fingerprint(d) {
  const o = {}; for (const c of COLS) o[c] = sortId(d[c]);
  const st = { ...d.settings }; for (const k of LOCAL_SET) delete st[k];
  o.settings = st; o.tomb = Object.entries(d.tomb || {}).sort(); o.toothSys = d.toothSys;
  return JSON.stringify(o);
}
export function mergeDb(a, b) {
  const tomb = { ...(b.tomb || {}) };
  for (const [k, v] of Object.entries(a.tomb || {})) tomb[k] = Math.max(tomb[k] || 0, v);
  const limit = Date.now() - 90 * 864e5; for (const k of Object.keys(tomb)) if (tomb[k] < limit) delete tomb[k];
  const out = { ...a, tomb };
  const pick = (x, y) => { if (!y) return x; const mx = x._m || 0, my = y._m || 0; if (mx !== my) return mx > my ? x : y; return JSON.stringify(x) >= JSON.stringify(y) ? x : y; };
  for (const c of COLS) {
    const bm = new Map((b[c] || []).map((x) => [x.id, x])); const seen = new Set(); const list = [];
    for (const x of a[c] || []) { seen.add(x.id); list.push(pick(x, bm.get(x.id))); }
    for (const y of b[c] || []) if (!seen.has(y.id)) list.push(y);
    out[c] = list.filter((x) => tomb[x.id] === undefined || tomb[x.id] < (x._m || 0));
  }
  if ((b.settingsM || 0) > (a.settingsM || 0)) { out.settings = { ...a.settings, ...b.settings }; for (const k of LOCAL_SET) out.settings[k] = a.settings[k]; out.settingsM = b.settingsM; }
  return out;
}
const stripLocal = (d) => ({ ...d, settings: { ...d.settings, share: undefined, sync: undefined } });
const backupBase = (c) => (c && c.server ? c.server.replace(/\/+$/, "") : "") + "/api/backup";
export const __test = { encJson, decJson, deriveKey, stamp, fingerprint, vault, DEF: () => DEF };
const CONDITIONS = ["Diabetes", "Hypertension", "Heart disease", "Asthma", "Bleeding disorder", "Pregnant", "Hepatitis / HIV", "Penicillin allergy"];
const XKINDS = ["Periapical", "Bitewing", "OPG / Panoramic", "CBCT", "Cephalometric", "Intraoral photo", "Other"];
const SUGGEST_CHECK = ["Water reservoir filled with distilled water", "Chamber and tray cleaned", "Door gasket inspected", "Instruments cleaned and dried before loading", "Instruments pouched / wrapped and dated", "Chemical indicator strip inside pack", "Not overloaded", "Cycle completed - parameters printout/log checked", "Packs dry after cycle"];
const SUGGEST_REM = [
  { label: "Weekly spore (BI) test", mode: "days", every: 7 },
  { label: "Change distilled water / drain reservoir", mode: "days", every: 3 },
  { label: "Deep-clean chamber and trays", mode: "days", every: 14 },
  { label: "Inspect / replace door gasket", mode: "days", every: 90 },
  { label: "Professional service / calibration", mode: "cycles", every: 1000 },
];

/* ============================ IndexedDB (X-rays) ============================ */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open("dentcare-lite", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("xrays", { keyPath: "id" });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const xReq = async (mode, fn) => {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = fn(db.transaction("xrays", mode).objectStore("xrays"));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
};
const xAll = async () => (await Promise.all((await xReq("readonly", (s) => s.getAll())).map(async (r) => (r.enc ? (vault.key ? await decJson(vault.key, r.enc) : null) : r)))).filter(Boolean);
const xPut = async (x) => { const row = vault.key ? { id: x.id, enc: await encJson(vault.key, x) } : x; return xReq("readwrite", (s) => s.put(row)); };
const xDel = (id) => xReq("readwrite", (s) => s.delete(id));
function readImg(file, max = 2400) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height));
      const w = Math.round(im.width * s), h = Math.round(im.height * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(u);
      res(c.toDataURL("image/jpeg", 0.92));
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Not a readable image: " + file.name)); };
    im.src = u;
  });
}

/* ============================ styles ============================ */
const css = `
:root{--bg:#f4f7f8;--fg:#0f2128;--card:#fff;--line:#dfe7ea;--line2:#ebf0f2;--inp:#c6d3d7;--pri:#0b6e6e;--acc:#0b6e6e;--navbg:#0b2a30;--navfg:#9dbcc2;--nava:#6fdccf;--muted:#5a7379;--label:#3d565c;--tagbg:#e8eff1;--tagfg:#35525a;--gbg:#dcfce7;--gfg:#166534;--ybg:#fef3c7;--yfg:#92400e;--rbg:#fee2e2;--rfg:#991b1b;--warnbg:#fffbeb;--warnbd:#fcd34d;--warnfg:#4a3a05;--wa:#16a34a;--red:#b91c1c;--hdrfg:#fff;--nava:#6fdccf}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0b1519;--fg:#e4eff1;--card:#121f24;--line:#243439;--line2:#1b2a2f;--inp:#35484e;--acc:#5fd6c9;--navbg:#071d21;--navfg:#8fb2b8;--nava:#6fdccf;--muted:#8aa9af;--label:#9bbbc1;--tagbg:#1d2f35;--tagfg:#b3d0d6;--gbg:#12361f;--gfg:#86efac;--ybg:#3b2e0a;--yfg:#fcd34d;--rbg:#451a1a;--rfg:#fca5a5;--warnbg:#2b2410;--warnbd:#7a5f12;--warnfg:#f5e3a8;--wa:#15803d;--red:#b91c1c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0b1519;--fg:#e4eff1;--card:#121f24;--line:#243439;--line2:#1b2a2f;--inp:#35484e;--acc:#5fd6c9;--navbg:#071d21;--navfg:#8fb2b8;--nava:#6fdccf;--muted:#8aa9af;--label:#9bbbc1;--tagbg:#1d2f35;--tagfg:#b3d0d6;--gbg:#12361f;--gfg:#86efac;--ybg:#3b2e0a;--yfg:#fcd34d;--rbg:#451a1a;--rfg:#fca5a5;--warnbg:#2b2410;--warnbd:#7a5f12;--warnfg:#f5e3a8;--wa:#15803d;--red:#b91c1c;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI Variable","Segoe UI",Roboto,"Noto Nastaliq Urdu",sans-serif;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;line-height:1.45}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);background:var(--navbg);z-index:60}
button{font:inherit;cursor:pointer}input,select,textarea{font:inherit;padding:8px 10px;border:1px solid var(--inp);border-radius:8px;width:100%;background:var(--card);color:inherit}
input[type=checkbox]{width:auto}textarea{min-height:80px;resize:vertical}
a{color:var(--acc)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.btn{background:var(--pri);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;display:inline-block;text-decoration:none;transition:filter .12s}.btn:hover{filter:brightness(1.1)}
.btn.sec{background:var(--card);color:var(--acc);border:1px solid var(--acc)}.btn.red{background:var(--red);color:#fff}.btn.wa{background:var(--wa);color:#fff}.btn.sm{padding:4px 9px;font-size:13px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px}.grid>*{min-width:0}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sp{flex:1}
.tag{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;background:var(--tagbg);color:var(--tagfg);white-space:nowrap}
.tag.g{background:var(--gbg);color:var(--gfg)}.tag.y{background:var(--ybg);color:var(--yfg)}.tag.r{background:var(--rbg);color:var(--rfg)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line2);font-size:14px;vertical-align:top}th{font-size:12.5px;color:var(--muted);font-weight:600}
.tw{overflow-x:auto}
.modal{position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px;z-index:70}
.modal>div{background:var(--card);color:var(--fg);border-radius:12px;max-width:780px;width:100%;max-height:92vh;overflow:auto;padding:16px}
label.f{display:block;font-size:12px;font-weight:600;color:var(--label);margin-bottom:3px}
h2{margin:0 0 12px;font-size:22px;font-weight:650;letter-spacing:-.015em}h3{margin:0 0 8px;font-size:15.5px;font-weight:650;letter-spacing:-.005em}
.nav{display:flex;gap:2px;overflow-x:auto;background:var(--navbg);padding:0 max(12px,env(safe-area-inset-left,0px));position:sticky;top:env(safe-area-inset-top,0px);z-index:10}
.nav button{background:transparent;color:var(--navfg);border:0;padding:12px 13px 10px;border-radius:0;font-weight:600;white-space:nowrap;font-size:14px;transition:color .12s}.nav button:hover{color:#fff}
.net{align-self:center;color:#fff;font-size:12px;opacity:.9;padding:0 8px;white-space:nowrap}.net.off{background:#b45309;border-radius:99px;padding:2px 10px}
.nav button.on{background:transparent;color:#fff;box-shadow:inset 0 -3px 0 var(--nava)}
.wrap{max-width:1180px;margin:0 auto;padding-block:14px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.muted{color:var(--muted);font-size:13px}.warn{background:var(--warnbg);color:var(--warnfg);border:1px solid var(--warnbd);border-left-width:4px;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:14px}
.stat{font-size:26px;font-weight:700;color:var(--acc);font-variant-numeric:tabular-nums}
.chip{border:1px solid var(--inp);background:var(--card);color:var(--fg);border-radius:99px;padding:4px 10px;font-size:13px}.chip.on{background:var(--pri);color:#fff;border-color:var(--pri)}
.xg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.xg .x{background:#000;border-radius:8px;overflow:hidden;cursor:pointer;position:relative}.xg img{width:100%;height:120px;object-fit:cover;display:block}
.xg .cap{background:var(--card);padding:5px 7px;font-size:12px}
.odo{display:grid;grid-template-columns:1fr 1fr;gap:12px 0}
.odo>.q{padding:0 8px;min-width:0}.odo>.q:nth-child(odd){border-right:1px dashed var(--inp)}.odo>.q:nth-child(n+3){border-top:1px dashed var(--inp);padding-top:10px}
@media (max-width:700px){.odo{grid-template-columns:1fr}.odo>.q:nth-child(odd){border-right:0}.odo>.q:nth-child(n+2){border-top:1px dashed var(--inp);padding-top:10px}}
.th{background:transparent;border:0;padding:2px 0;display:flex;flex-direction:column;align-items:center;gap:1px;color:var(--fg);min-width:0;border-radius:6px}
.th .n{font-size:12px;font-weight:700}.th .bd{font-size:9px;min-height:11px;color:var(--muted);font-weight:700}.th.sel .n{color:var(--acc)}
.hero{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--card);border-bottom:1px solid var(--line)}.hero-name{font-size:20px;font-weight:750;letter-spacing:-.01em}.hero-sub{color:var(--muted);font-size:14px;margin-top:1px}.hero-ac{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border:1px solid var(--amb,#d9a400);border-radius:10px;background:rgba(217,164,0,.12);font-size:13px}
.brand{color:#fff;font-weight:750;letter-spacing:-.01em;align-self:center;padding:0 14px 0 2px;font-size:17px;display:flex;align-items:center;gap:8px}.brand svg{color:var(--nava);flex:none}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.cal.head div{font-size:11px;font-weight:700;color:var(--muted);text-align:center;padding:2px 0}
.cal .d{background:var(--card);border:1px solid var(--line);border-radius:8px;min-height:96px;padding:4px;display:flex;flex-direction:column;align-items:stretch;gap:2px;text-align:left;color:var(--fg);min-width:0;position:relative;font:inherit;cursor:pointer}
.cal .d.empty{background:transparent;border-color:transparent;cursor:default}
.cal .d.today .num{background:var(--pri);color:#fff;border-radius:99px;padding:0 6px}
.cal .d.sel{outline:2px solid var(--acc)}
.cal .num{font-size:12px;font-weight:700;align-self:flex-start}
.cal .c{display:block;font-size:11px;padding:1px 4px;border-radius:4px;background:var(--tagbg);color:var(--tagfg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .c.rc{background:var(--ybg);color:var(--yfg)}.cal .c.dn{background:var(--gbg);color:var(--gfg)}
.cal .cnt{display:none;position:absolute;top:3px;right:4px;font-size:11px;font-weight:700;background:var(--acc);color:var(--bg);border-radius:99px;padding:0 6px}
.cal .more{font-size:10px;color:var(--muted)}
.dayc{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px}
@media (max-width:700px){.dayc{grid-template-columns:1fr}}
.cal .xc{font-size:10px;color:var(--red);font-weight:600}
@media (max-width:600px){.cal .xc{display:none}.cal .d{min-height:50px}.cal .c,.cal .more{display:none}.cal .cnt{display:inline-block}}
.hd{margin-bottom:14px}.hd h2{margin:0}.hd .muted{font-size:14px;margin-top:2px}
.strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:14px}
.strip>div{padding:12px 16px;border-left:1px solid var(--line2);min-width:0}.strip>div:first-child{border-left:0}
.strip b{display:block;font-size:26px;line-height:1.1;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.strip span{font-size:12.5px;color:var(--muted);display:block;margin-top:2px}
.strip>div.hot b{color:var(--acc)}.strip>div.go{cursor:pointer}.strip>div.go:hover{background:var(--line2)}
@media (max-width:760px){.strip{grid-template-columns:repeat(2,minmax(0,1fr))}.strip>div{border-left:0;border-top:1px solid var(--line2)}.strip>div:nth-child(-n+2){border-top:0}.strip>div:nth-child(even){border-left:1px solid var(--line2)}.strip>div:last-child:nth-child(odd){grid-column:1/-1}}
.cols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:0 14px;align-items:start}
@media (max-width:900px){.cols{grid-template-columns:1fr}}
.next{display:grid;grid-template-columns:auto 1fr;gap:4px 22px;align-items:center;background:var(--navbg);color:#e9f6f7;border-color:var(--navbg);padding:18px 20px}
.next .t{font-size:40px;line-height:1;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#fff}
.next .cap{font-size:13px;color:var(--nava);font-weight:600;margin-top:6px}
.next .who b{font-size:20px;font-weight:650;letter-spacing:-.01em;display:block}.next .who .sub{color:#a9c7cb;font-size:14px;margin-top:2px}
.next .act{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.next .btn.sec{background:transparent;color:#e9f6f7;border-color:#3b6068}
.next.none{background:var(--card);color:var(--muted);border-color:var(--line);display:block}
@media (max-width:520px){.next{grid-template-columns:1fr}.next .t{font-size:34px}}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:74px 14px 1fr auto;gap:0 10px;align-items:start;padding:9px 0;position:relative}
.tl li::before{content:"";position:absolute;left:81px;top:0;bottom:0;width:2px;background:var(--line2)}.tl li:first-child::before{top:18px}.tl li:last-child::before{bottom:calc(100% - 18px)}.tl li:only-child::before{display:none}
.tl .tm{font-weight:650;font-variant-numeric:tabular-nums;font-size:14px;padding-top:1px;text-align:right}
.tl .dot{width:10px;height:10px;border-radius:99px;background:var(--card);border:2px solid var(--inp);margin:5px 0 0 2px;position:relative;z-index:1}
.tl li.nx .dot{border-color:var(--acc);background:var(--acc)}.tl li.done .dot{border-color:var(--gfg);background:var(--gfg)}.tl li.done .tm,.tl li.done .bd{color:var(--muted)}
.tl .bd a{font-weight:600;color:var(--fg);text-decoration:none}.tl .bd a:hover{text-decoration:underline}
.rl>div{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;padding:9px 0;border-top:1px solid var(--line2)}.rl>div:first-of-type{border-top:0}
.rl .nm{font-weight:600}.rl .meta{font-size:13px;color:var(--muted);grid-column:1}.rl .btn{grid-row:1/3;grid-column:2}
@media print{.nav,.noprint{display:none!important}}
`;

/* ============================ in-page confirm (browser confirm() is blocked in some embeds) ============================ */
const ConfirmCtx = React.createContext((msg, fn) => fn());
const useAsk = () => React.useContext(ConfirmCtx);
function ConfirmProvider({ children }) {
  const [q, setQ] = useState(null);
  return (
    <ConfirmCtx.Provider value={(msg, fn) => setQ({ msg, fn })}>
      {children}
      {q && (
        <Modal onClose={() => setQ(null)}>
          <p style={{ marginTop: 0 }}>{q.msg}</p>
          <div className="row"><button className="btn red" autoFocus onClick={() => { const f = q.fn; setQ(null); f(); }}>Confirm</button><button className="btn sec" onClick={() => setQ(null)}>Cancel</button></div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ============================ small UI ============================ */
const F = ({ l, children, style }) => <div style={style}><label className="f">{l}</label>{children}</div>;
const Modal = ({ children, onClose }) => (
  <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div role="dialog">{children}</div>
  </div>
);
const Empty = ({ children }) => <div className="muted" style={{ padding: 18, textAlign: "center" }}>{children}</div>;

/* ============================ root ============================ */
export default function App() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const h = () => setRoute(location.hash);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return (
    <>
      <style>{css}</style>
      <ConfirmProvider>{/^#\/schedule/.test(route) ? <ScheduleView route={route} /> : /^#\/(consent|form)/.test(route) ? <Public route={route} /> : <Gate />}</ConfirmProvider>
    </>
  );
}

/* ============================ lock screen ============================ */
function Gate() {
  const [st, setSt] = useState(() => (readEnv() ? { locked: true } : { locked: false, db: load() }));
  if (st.locked) return <Unlock onOpen={(db) => setSt({ locked: false, db })} />;
  return <Clinic initialDb={st.db} onLock={async () => { await flushSave(); vaultClear(); setSt({ locked: true }); }} />;
}
function Unlock({ onOpen }) {
  const ask = useAsk();
  const [pass, setPass] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const fails = useRef(0);
  async function open(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try {
      const env = readEnv(); if (!env) throw new Error("no data");
      const key = await deriveKey(pass, fromB64(env.salt), env.iter || ITER);
      const raw = await decJson(key, env);
      vault.key = key; vault.salt = env.salt; vault.iter = env.iter || ITER;
      onOpen(normalize(raw));
    } catch {
      fails.current += 1; setErr("Wrong passphrase.");
      await new Promise((r) => setTimeout(r, Math.min(fails.current * 800, 6000)));
    } finally { setBusy(false); }
  }
  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>RevDent is locked</h2>
        <form onSubmit={open}>
          <F l="Passphrase"><input id="unlock-pass" type="password" autoFocus autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></F>
          {err && <div className="warn" style={{ borderColor: "var(--red)" }} data-testid="unlock-err">{err}</div>}
          <div className="row" style={{ marginTop: 10 }}><button className="btn" id="unlock-go" type="submit" disabled={busy || !pass}>{busy ? "Checking…" : "Unlock"}</button></div>
        </form>
        <div className="muted" style={{ marginTop: 14 }}>Patient data on this device is encrypted. If the passphrase is lost the data cannot be recovered; restore from a backup file or the cloud backup instead.</div>
        <div style={{ marginTop: 10 }}><button className="btn sec sm" id="unlock-erase" onClick={() => ask("Erase ALL RevDent data on this device (patients, treatments, X-rays)? This cannot be undone. Only do this if you have a backup.", async () => { localStorage.removeItem(KEY); try { for (const x of await xReq("readonly", (s) => s.getAllKeys())) await xDel(x); } catch { /* none */ } location.reload(); })}>Forgot passphrase: erase this device…</button></div>
      </div>
    </div>
  );
}

/* ============================ clinic app ============================ */
function Clinic({ initialDb, onLock }) {
  const [db, setDbRaw] = useState(() => initialDb);
  const setDb = useCallback((f) => setDbRaw((d) => stamp(d, typeof f === "function" ? f(d) : f)), []);
  const dbRef = useRef(db); dbRef.current = db;
  const [vaultOn, setVaultOn] = useState(() => !!vault.key);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [syncSt, setSyncSt] = useState({ state: "off", at: null, err: "" });
  const [saveErr, setSaveErr] = useState(false);
  const [xrays, setXrays] = useState([]);
  const [xErr, setXErr] = useState("");
  const [tab, setTab] = useState("today");
  const [openPid, setOpenPid] = useState(null);
  const [send, setSend] = useState(null); // {recips, mode}
  const [txm, setTxm] = useState(null); // treatment modal init
  const [syncTick, setSyncTick] = useState(0);
  const [shareStatus, setShareStatus] = useState({ state: "off", at: null, err: "" });
  const [now, setNow] = useState(() => new Date());
  const s = db.settings;

  useEffect(() => {
    saveDb(db).then(() => setSaveErr(false), () => setSaveErr(true));
  }, [db]);
  useEffect(() => {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* optional */ }
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // auto-lock after inactivity (only when encryption is on)
  const autoMin = s.autoLockMin === undefined ? 10 : Number(s.autoLockMin);
  useEffect(() => {
    if (!vaultOn || !autoMin) return undefined;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const chk = () => { if (Date.now() - last > autoMin * 60000) onLock(); };
    const ev = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(chk, 5000);
    const vis = () => { if (!document.hidden) chk(); };
    document.addEventListener("visibilitychange", vis);
    return () => { ev.forEach((e) => window.removeEventListener(e, bump)); clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [vaultOn, autoMin]); // eslint-disable-line

  // ----- encrypted cloud backup / multi-device sync -----
  const sy = s.sync || {};
  const fp = useMemo(() => fingerprint(db), [db]);
  const syncBusy = useRef(false), lastFp = useRef("");
  const runSync = useCallback(async () => {
    const cfg = dbRef.current.settings.sync;
    if (!cfg || !cfg.on || !cfg.id) return;
    if (syncBusy.current) { syncBusy.current = "again"; return; }
    syncBusy.current = true; setSyncSt((x) => ({ ...x, state: "syncing", err: "" }));
    try {
      const key = await importRaw(cfg.ekey); const bb = backupBase(cfg); let rev = cfg.rev || 0;
      for (let tries = 0; tries < 5; tries++) {
        const g = await fetch(`${bb}/${cfg.id}`, { headers: { "x-write-key": cfg.wkey }, cache: "no-store" });
        let local = dbRef.current, remoteRev = 0, remoteFp = null;
        if (g.status === 200) {
          const j = await g.json(); remoteRev = j.rev;
          if (j.rev !== rev || !lastFp.current) {
            const remote = (await decJson(key, j)).db; remoteFp = fingerprint(remote);
            const merged = mergeDb(local, remote);
            if (fingerprint(merged) !== fingerprint(local)) { dbRef.current = merged; setDbRaw(merged); local = merged; }
          }
          rev = j.rev;
        } else if (g.status !== 404) throw new Error(g.status === 403 ? "the cloud copy does not accept this device's code" : g.status === 429 ? "too many attempts, wait a few minutes" : "server replied " + g.status);
        const f = fingerprint(local);
        const need = remoteRev === 0 ? true : remoteFp !== null ? f !== remoteFp : f !== lastFp.current;
        if (!need) { lastFp.current = f; break; }
        const pr = await fetch(`${bb}/${cfg.id}`, { method: "PUT", headers: { "content-type": "application/json", "x-write-key": cfg.wkey, "x-expect-rev": String(remoteRev) }, body: JSON.stringify(await encJson(key, { db: stripLocal(local) })) });
        if (pr.status === 409) continue;
        if (!pr.ok) throw new Error(pr.status === 413 ? "data is too large for the server limit" : "server replied " + pr.status);
        rev = (await pr.json()).rev; lastFp.current = f; break;
      }
      setDbRaw((d) => ({ ...d, settings: { ...d.settings, sync: { ...d.settings.sync, rev, lastAt: new Date().toISOString() } } }));
      setSyncSt({ state: "synced", at: new Date(), err: "" });
    } catch (e) { setSyncSt({ state: navigator.onLine === false ? "offline" : "error", at: null, err: String(e.message || e) }); }
    finally { const again = syncBusy.current === "again"; syncBusy.current = false; if (again) setTimeout(runSync, 400); }
  }, []);
  useEffect(() => {
    if (!sy.on) { setSyncSt({ state: "off", at: null, err: "" }); return undefined; }
    if (!online) { setSyncSt((x) => ({ ...x, state: "offline" })); return undefined; }
    const t1 = setTimeout(runSync, 1500); const t2 = setInterval(runSync, 30000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [sy.on, sy.id, online, fp, runSync]); // eslint-disable-line
  useEffect(() => {
    xAll().then(setXrays).catch((e) => setXErr("X-ray storage unavailable in this browser: " + e));
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const patch = (k, f) => setDb((d) => ({ ...d, [k]: f(d[k]) }));
  const setS = (o) => setDb((d) => ({ ...d, settings: { ...d.settings, ...o } }));
  const pById = useMemo(() => Object.fromEntries(db.patients.map((p) => [p.id, p])), [db.patients]);
  const base = (s.baseUrl || location.origin + location.pathname).replace(/#.*$/, "");

  const addXray = async (x) => { await xPut(x); setXrays((a) => [...a, x]); };
  const delXray = async (id) => { await xDel(id); setXrays((a) => a.filter((x) => x.id !== id)); };

  const dueReminders = db.appts
    .filter((a) => a.status === "scheduled" && !a.remindedAt && pById[a.patientId])
    .filter((a) => { const ms = apptDT(a) - now; return ms > 0 && ms <= 86400000; })
    .sort((a, b) => apptDT(a) - apptDT(b));

  const acRunDue = false;
  const acEvery = Math.max(1, parseInt(s.acEvery, 10) || 18);
  const acPatients = patientsSinceAutoclave(db);
  const acPatDue = acPatients >= acEvery;
  const [acPop, setAcPop] = useState(null);
  const doneSeen = useRef(null);
  useEffect(() => {
    const ids = new Set(completedVisits(db).map((v) => v.id));
    if (doneSeen.current) {
      const fresh = [...ids].filter((i) => !doneSeen.current.has(i));
      if (fresh.length) {
        const stamp = localKey(new Date());
        const freshAppts = fresh.filter((i) => i[0] === "a").map((i) => i.slice(1));
        if (freshAppts.length) setDb((d) => ({ ...d, appts: d.appts.map((a) => (freshAppts.includes(a.id) && !a.doneAt ? { ...a, doneAt: stamp } : a)) }));
        if (patientsSinceAutoclave(db) >= acEvery) setAcPop(patientsSinceAutoclave(db));
      }
    }
    doneSeen.current = ids;
  }, [db.appts, db.tx]); // eslint-disable-line
  const acOwnPhone = s.phone || s.staffPhone;
  const acPatWa = acOwnPhone ? waLink(acOwnPhone, `Autoclave alert - ${s.clinic || "Dental Cosmetics"}: ${acPatients} patients have been treated since the last autoclave run. Please run the autoclave now and log the cycle in the app.`, s.cc) : "";
  const acWaHref = acOwnPhone ? waLink(acOwnPhone, `Autoclave reminder - ${s.clinic || "Dental Cosmetics"}: please run the autoclave today and log the cycle in the app.`, s.cc) : "";
  useEffect(() => { document.title = s.clinic || "Dental Cosmetics"; }, [s.clinic]);
  const acDue = db.acReminders.map((r) => ({ r, st: reminderStatus(r, db.cycles, todayStr(), completedVisits(db).length) })).filter((x) => x.st.due);

  const sh = s.share || {};
  const snapJson = useMemo(() => JSON.stringify(buildSnapshot(db)), [db.appts, db.patients, s.clinic, sh.privacy]); // eslint-disable-line
  useEffect(() => {
    if (!sh.on || !sh.id || !sh.key) { setShareStatus({ state: "off", at: null, err: "" }); return undefined; }
    setShareStatus((x) => ({ ...x, state: "syncing" }));
    const timer = setTimeout(async () => {
      try {
        const eh = sh.edit && sh.editKey ? await sha256Hex(sh.editKey) : null;
        const r = await fetch(`${apiBase(sh)}/${sh.id}`, { method: "PUT", headers: { "content-type": "application/json", "x-write-key": sh.key }, body: JSON.stringify({ ...JSON.parse(snapJson), editHash: eh }) });
        if (!r.ok) throw new Error(r.status === 403 ? "the server holds this link under a different key; stop sharing and start again" : "server replied " + r.status);
        setShareStatus({ state: "live", at: new Date(), err: "" });
      } catch (e) { setShareStatus({ state: "error", at: null, err: String(e.message || e) }); }
    }, 700);
    return () => clearTimeout(timer);
  }, [sh.on, sh.id, sh.key, sh.server, sh.edit, sh.editKey, snapJson, syncTick]); // eslint-disable-line
  // collect what shared-calendar users and patients' WhatsApp replies queued on the server
  const [shareInfo, setShareInfo] = useState({ checked: null, received: 0 });
  const pullBusy = useRef(false);
  const pullActions = useCallback(async () => {
    const c = dbRef.current.settings.share;
    if (!c || !c.on || !c.id || !c.key || pullBusy.current) return;
    pullBusy.current = true;
    try {
      const r = await fetch(`${apiBase(c)}/${c.id}/actions`, { headers: { "x-write-key": c.key }, cache: "no-store" });
      if (!r.ok) return;
      const { actions } = await r.json();
      setShareInfo((x) => ({ ...x, checked: new Date() }));
      if (!actions.length) return;
      setDb((d) => applyActions(d, actions));
      await new Promise((res) => setTimeout(res, 400)); await flushSave();
      const ak = await fetch(`${apiBase(c)}/${c.id}/ack`, { method: "POST", headers: { "content-type": "application/json", "x-write-key": c.key }, body: JSON.stringify({ ids: actions.map((a) => a.id) }) });
      if (ak.ok) setShareInfo((x) => ({ checked: new Date(), received: x.received + actions.length }));
    } catch { /* offline or server down: tried again later */ } finally { pullBusy.current = false; }
  }, [setDb]);
  useEffect(() => {
    if (!sh.on || !online) return undefined;
    const t1 = setTimeout(pullActions, 1200), t2 = setInterval(pullActions, 8000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [sh.on, sh.id, online, pullActions]);
  const todayS = todayStr();
  const recallDue = autoRecalls(db, todayS).filter((r) => r.status === "due").length + manualDue(db, todayS).length;
  const openTx = (init) => setTxm({ init });
  const startRx = (recips) => setSend({ mode: "rx", recips });
  const ctx = { shareInfo, pullNow: pullActions, vaultOn, setVaultOn, onLock, syncSt, runSync, online, startRx, recallDue, shareStatus, syncNow: () => setSyncTick((n) => n + 1), openTx, db, setDb, s, patch, setS, pById, base, now, setSend, xrays, addXray, delXray, openPid, setOpenPid, setTab, dueReminders, acDue };

  function onSent(rec, kinds) {
    const at = new Date().toISOString();
    setDb((d) => {
      const n = { ...d, sent: [...d.sent, { id: uid(), patientId: rec.p.id, apptId: rec.a?.id || null, at, kinds }].slice(-2000) };
      if (rec.a && kinds.rebook) n.appts = d.appts.map((a) => (a.id === rec.a.id ? { ...a, rebookSentAt: at } : a));
      else if (rec.a) n.appts = d.appts.map((a) => (a.id === rec.a.id ? { ...a, remindedAt: at, consentSentAt: kinds.consent ? at : a.consentSentAt, formSentAt: kinds.form ? at : a.formSentAt } : a));
      if (rec.recall) {
        const c = rec.recall;
        if (c.kind === "manual") n.recalls = d.recalls.map((r) => (r.id === c.rec.id ? { ...r, sentAt: at } : r));
        else n.patients = d.patients.map((p) => (p.id === rec.p.id ? { ...p, recallSent: { ...(p.recallSent || {}), [c.kind + "|" + c.last]: at } } : p));
      }
      if (rec.tx) n.tx = d.tx.map((x) => (x.id === rec.tx.id ? { ...x, rxSentAt: at, rxTemplateId: kinds.rx, rxSnapshot: kinds.rxSnap || x.rxSnapshot, rxSent: addRxSent(x.rxSent, { at, name: kinds.rxSnap ? kinds.rxSnap.name : "", items: kinds.rxSnap ? kinds.rxSnap.items : [], note: kinds.rxSnap ? kinds.rxSnap.note : "", text: kinds.rxText || "" }) } : x));
      return n;
    });
  }

  const TABS = [["today", "Today"], ["calendar", "Calendar"], ["patients", "Patients"], ["appts", "Appointments"], ["recalls", "Recalls"], ["tx", "Treatment Log"], ["rx", "Prescriptions"], ["odo", "Odontogram"], ["xrays", "X-Rays"], ["autoclave", "Autoclave"], ["finance", "Finance"], ["settings", "Settings"]];
  return (
    <div>
      <div className="nav noprint">
        <span className="brand"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5c-2.4 0-4 2-4 4.6 0 2.2.9 3.6 1.5 5.6.6 2 .5 7.3 2.4 7.3 1.6 0 1.5-4 3.4-4s1.8 4 3.4 4c1.9 0 1.8-5.3 2.4-7.3.6-2 1.5-3.4 1.5-5.6 0-2.6-1.6-4.6-4-4.6-1.6 0-2.3.8-3.3.8S8.8 3.5 7.2 3.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg><span data-testid="brand-name">{s.clinic || "Dental Cosmetics"}</span></span>
        <span className={"net " + (online ? "" : "off")} data-testid="net-status" title={online ? "Online" : "No internet. Everything still works and is saved on this device."}>{online ? (sy.on ? (syncSt.state === "synced" ? "● Synced" : syncSt.state === "syncing" ? "● Syncing" : syncSt.state === "error" ? "● Sync problem" : "● Online") : "● Online") : "○ Offline: saving on this device"}</span>
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setOpenPid(null); }}>
            {l}{k === "today" && dueReminders.length ? ` (${dueReminders.length})` : ""}{k === "autoclave" && acDue.length ? ` (${acDue.length})` : ""}{k === "recalls" && recallDue ? ` (${recallDue})` : ""}
          </button>
        ))}
        {vaultOn && <button id="nav-lock" style={{ marginLeft: "auto" }} onClick={() => onLock()}>🔒 Lock</button>}
      </div>
      <div className="hero noprint" data-testid="hero">
        <div><div className="hero-name" data-testid="hero-clinic">{s.clinic || "Dental Cosmetics"}</div><div className="hero-sub" data-testid="hero-welcome">Hello {s.doctor || "Dr Adnan"}!</div></div>
        {acPatDue && (
          <div className="hero-ac" data-testid="ac-pat-reminder" style={{ borderColor: "var(--red,#c0392b)", background: "rgba(192,57,43,.12)" }}>
            <b>Run the autoclave: {acPatients} patients since the last run</b>
            <span>Alert is at {acEvery}, then after every further patient until a cycle is logged.</span>
            <button className="btn sm" onClick={() => setTab("autoclave")}>Open autoclave</button>
            {acPatWa ? <a className="btn wa sm" id="ac-pat-wa" style={{ textDecoration: "none" }} href={acPatWa} target="_blank" rel="noreferrer">Message clinic WhatsApp</a> : <button className="btn sec sm" onClick={() => setTab("settings")}>Add clinic WhatsApp number</button>}
          </div>)}
        {acRunDue && (
          <div className="hero-ac" data-testid="ac-run-reminder">
            <b>Reminder: run the autoclave today</b>
            <span>No cycle logged yet.</span>
            <button className="btn sm" onClick={() => setTab("autoclave")}>Open autoclave</button>
            {acWaHref ? <a className="btn wa sm" id="ac-run-wa" style={{ textDecoration: "none" }} href={acWaHref} target="_blank" rel="noreferrer">Message clinic WhatsApp</a> : <button className="btn sec sm" onClick={() => setTab("settings")}>Add clinic WhatsApp number</button>}
          </div>)}
      </div>
      {acPop && (
        <Modal onClose={() => setAcPop(null)}>
          <div data-testid="ac-pat-popup">
            <h2 style={{ marginTop: 0 }}>Time to run the autoclave</h2>
            <p>{acPop} patients have been completed since the last autoclave run. Please run the autoclave and log the cycle.</p>
            <div className="row">
              <button className="btn" onClick={() => { setAcPop(null); setTab("autoclave"); }}>Open autoclave</button>
              {acPatWa && <a className="btn wa" id="ac-pop-wa" style={{ textDecoration: "none" }} href={acPatWa} target="_blank" rel="noreferrer">Message clinic WhatsApp</a>}
              <button className="btn sec" onClick={() => setAcPop(null)}>Later</button>
            </div>
            {!acPatWa && <div className="muted" style={{ marginTop: 8 }}>Add the clinic WhatsApp number in Settings to also get this as a WhatsApp message.</div>}
          </div>
        </Modal>)}
      <div className="wrap">
        {!vaultOn && canCrypto() && db.patients.length > 0 && <div className="warn" data-testid="enc-warn">Patient data on this device is <b>not encrypted</b>. Anyone who can open this browser can read it. <a href="#s" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Set a passphrase in Settings → Security</a>.</div>}
        {saveErr && <div className="warn">⚠ Could not save to this browser (storage full or blocked). Export a backup in Settings now.</div>}
        {xErr && <div className="warn">{xErr}</div>}
        {tab === "today" && <Today {...ctx} />}
        {tab === "patients" && (openPid && pById[openPid] ? <PatientDetail {...ctx} p={pById[openPid]} /> : <Patients {...ctx} />)}
        {tab === "appts" && <Appts {...ctx} />}
        {tab === "xrays" && <XraysPage {...ctx} />}
        {tab === "calendar" && <CalendarPage {...ctx} />}
        {tab === "recalls" && <Recalls {...ctx} />}
        {tab === "rx" && <Prescriptions {...ctx} />}
        {tab === "odo" && <OdontogramPage {...ctx} />}
        {tab === "tx" && <TxLog {...ctx} />}
        {tab === "finance" && <Finance {...ctx} />}
        {tab === "autoclave" && <Autoclave {...ctx} />}
        {tab === "settings" && <Settings {...ctx} xrays={xrays} setXrays={setXrays} />}
      </div>
      {txm && <TxModal {...ctx} init={txm.init} onClose={() => setTxm(null)} />}
      {send && <SendModal {...ctx} {...send} onClose={() => setSend(null)} onSent={onSent} />}
    </div>
  );
}

/* ============================ RCT sittings, recalls, prescriptions: helpers ============================ */
const addMonths = (s, n) => {
  const d = new Date(s + "T00:00"); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
};
const addUnit = (s, n, u) => (u === "days" ? addDays(s, n) : u === "weeks" ? addDays(s, n * 7) : u === "years" ? addMonths(s, n * 12) : addMonths(s, n));
const rctTag = (a) => (a && a.rct ? `RCT ${a.rct.day}${a.rct.of ? "/" + a.rct.of : ""}` : "");
const rctWords = (r, tplText) => (/[؀-ۿ]/.test(tplText || "")
  ? `روٹ کینال (RCT) کی نشست ${r.day}${r.of ? " / " + r.of : ""}`
  : `root canal (RCT) sitting ${r.day}${r.of ? " of " + r.of : ""}`);
const initialName = (n) => { const w = String(n || "").trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0].toUpperCase()}.` : w[0] || "Patient"; };

function lastVisitOf(db, pid, today) {
  const ds = [...db.appts.filter((a) => a.patientId === pid && a.status === "done").map((a) => a.date), ...db.tx.filter((t) => t.patientId === pid).map((t) => t.date)].filter((d) => d <= today);
  return ds.sort().pop() || "";
}
/* Automatic 6-month and annual recalls, counted from the last visit. */
function autoRecalls(db, today) {
  const s = db.settings; const lead = Number(s.recallLead) || 0;
  return db.patients.map((p) => {
    const last = lastVisitOf(db, p.id, today);
    const row = { p, last, m6: last ? addMonths(last, 6) : "", m12: last ? addMonths(last, 12) : "", status: "", due: null };
    if (p.recallOptOut) { row.status = "optout"; return row; }
    if (!last) { row.status = "novisit"; return row; }
    if (db.appts.some((a) => a.patientId === p.id && a.status === "scheduled" && a.date >= today)) { row.status = "booked"; return row; }
    const sent = p.recallSent || {};
    const in12 = s.autoRecall12 && today >= addDays(row.m12, -lead), in6 = s.autoRecall6 && today >= addDays(row.m6, -lead);
    if (in12 && !sent["m12|" + last]) row.due = { kind: "m12", date: row.m12 };
    else if (in6 && !in12 && !sent["m6|" + last]) row.due = { kind: "m6", date: row.m6 };
    row.status = row.due ? "due" : in6 || in12 ? "sent" : "upcoming";
    return row;
  });
}
const manualDue = (db, today) => db.recalls.filter((r) => r.status === "pending" && !r.sentAt && today >= addDays(r.dueDate, -(Number(db.settings.recallLead) || 0)) && db.patients.some((p) => p.id === r.patientId));

/* ---- prescriptions ---- */
const PLURAL_UNITS = ["tablet", "capsule", "sachet", "application", "puff"];
const RX_UNITS = ["tablet", "capsule", "ml", "sachet", "application", "puff"];
const nfmt = (x) => String(+Number(x).toFixed(2));
const unitWord = (u, q) => (PLURAL_UNITS.includes(u) && q !== 1 ? u + "s" : u);
const perDayText = (n) => (n === 1 ? "once a day" : n === 2 ? "twice a day" : `${nfmt(n)} times a day`);
const itemQty = (it) => (Number(it.per) || 0) * (Number(it.perDay) || 0) * (Number(it.days) || 0);
function itemText(it) {
  const q = itemQty(it);
  return `${it.drug}: ${nfmt(it.per)} ${unitWord(it.unit, +it.per)}, ${perDayText(+it.perDay)}${it.when ? ", " + it.when : ""}, for ${nfmt(it.days)} day${+it.days === 1 ? "" : "s"} (total ${nfmt(q)} ${unitWord(it.unit, q)})`;
}
function matchRx(text, list) {
  const t = String(text || "").toLowerCase(); let best = null, len = 0;
  for (const tp of list || []) for (const k of tp.keywords || []) { const kk = String(k).toLowerCase().trim(); if (kk && t.includes(kk) && kk.length > len) { best = tp; len = kk.length; } }
  return best;
}
function suggestRx(text, list) {
  const tt = String(text || "").toLowerCase(); const sc = (tp) => Math.max(0, ...(tp.keywords || []).map((k) => { const kk = String(k).toLowerCase().trim(); return kk && tt.includes(kk) ? kk.length : 0; }));
  return (list || []).map((tp) => [tp, sc(tp)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}
const COMMON_DRUGS = ["Tab. Ibuprofen 400 mg", "Tab. Paracetamol 500 mg", "Tab. Diclofenac 50 mg", "Tab. Naproxen 250 mg", "Tab. Mefenamic acid 500 mg", "Cap. Amoxicillin 500 mg", "Tab. Co-amoxiclav 625 mg", "Tab. Metronidazole 400 mg", "Cap. Clindamycin 300 mg", "Tab. Azithromycin 500 mg", "Chlorhexidine 0.2% mouthwash", "Benzydamine mouthwash", "Tab. Omeprazole 20 mg"];
const guessUnit = (d) => (/^\s*cap/i.test(d) ? "capsule" : /^\s*tab/i.test(d) ? "tablet" : /mouthwash|gargle|syrup|syp\b|suspension|drops/i.test(d) ? "ml" : /\b(gel|cream|ointment|paste)\b/i.test(d) ? "application" : /sachet/i.test(d) ? "sachet" : "");
// every prescription message that was opened for the patient is kept with the treatment (a repeat of identical text only updates its time)
const addRxSent = (list, e) => { const l = [...(list || [])]; const last = l[l.length - 1]; if (last && last.text && last.text === e.text) l[l.length - 1] = { ...last, at: e.at }; else l.push(e); return l; };
const rxEntries = (x) => (x.rxSent && x.rxSent.length ? x.rxSent : x.rxSnapshot ? [{ at: x.rxSentAt, name: x.rxSnapshot.name, items: x.rxSnapshot.items || [], note: x.rxSnapshot.note || "", text: "" }] : []);
function RxHistory({ tx }) {
  const list = rxEntries(tx); if (!list.length) return null;
  return (
    <div data-testid="rx-history" style={{ marginTop: 4 }}>
      {list.map((e, i) => (
        <details key={i} style={{ fontSize: 13 }}>
          <summary style={{ cursor: "pointer" }}><span className="tag g">Prescription sent</span> {e.name}{e.at ? " · " + fmtD(e.at) : ""}{e.items && e.items.length ? " · " + e.items.map((m) => m.drug).join(", ") : ""}</summary>
          {e.text ? <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "6px 0", padding: 8, background: "var(--bg)", borderRadius: 8 }} dir="auto">{e.text}</pre>
            : <div style={{ margin: "6px 0" }}>{(e.items || []).map((m, k) => <div key={k}>{k + 1}. {itemText(m)}</div>)}{e.note && <div style={{ whiteSpace: "pre-wrap" }}>{e.note}</div>}</div>}
        </details>))}
    </div>
  );
}
const blankItem = () => ({ id: uid(), drug: "", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" });
const penicillinPatient = (p) => /penicillin|amoxicillin|amoxycillin|augmentin/i.test([(p.conditions || []).join(" "), p.allergies || ""].join(" "));
const penicillinTpl = (tpl) => !!tpl && tpl.items.some((i) => /amox|penicillin|augmentin|clavul/i.test(i.drug));
function buildRx(tpl, p, tx, s) {
  const L = [`*${s.clinic || "Clinic"}*`, `Prescription and instructions for ${p.name}`, ""];
  const site = tx && ((tx.teeth && tx.teeth.length) || tx.arch) ? ` (${siteText(tx)})` : "";
  const rct = tx && tx.rct ? ` - RCT sitting ${tx.rct.day}${tx.rct.of ? " of " + tx.rct.of : ""}` : "";
  L.push(`Procedure: ${tx ? tx.procedure : tpl.name}${site}${rct}`, `Date: ${fmtD(tx ? tx.date : todayStr())}`, "");
  const its = tpl.items.filter((i) => i.drug && i.drug.trim());
  if (its.length) { L.push("*Medicines*"); its.forEach((it, i) => L.push(`${i + 1}. ${itemText(it)}`)); L.push(""); }
  if (tpl.note && tpl.note.trim()) L.push("*Instructions*", tpl.note.trim(), "");
  const foot = fill(s.rxFooter, { name: p.name, phone: s.phone || "the clinic", clinic: s.clinic || "the clinic" });
  if (foot) L.push(foot);
  return L.join("\n").trim();
}

/* ============================ WhatsApp send queue ============================ */
function SendModal({ recips, mode, s, base, onClose, onSent }) {
  const rxList = s.rxTemplates || [];
  const [inclConsent, setInclConsent] = useState(mode === "appt");
  const [inclForm, setInclForm] = useState(false);
  const [custom, setCustom] = useState("Assalam o Alaikum {name}, ");
  const [tplId, setTplId] = useState(() => (recips[0] && recips[0].tplId) || (rxList[0] && rxList[0].id) || "");
  const [done, setDone] = useState({});
  const [edited, setEdited] = useState({});
  const [show, setShow] = useState(null);
  const [manual, setManual] = useState(() => (recips[0] && recips[0].tplId === "__manual" ? { items: [blankItem()], note: "" } : null));
  const tpl = tplId === "__manual" ? { id: "__manual", name: "Custom prescription", items: (manual || { items: [] }).items, note: (manual || { note: "" }).note } : rxList.find((t) => t.id === tplId);
  const rxSug = mode === "rx" ? suggestRx(recips[0] && recips[0].tx && recips[0].tx.procedure, rxList) : [];

  const msgs = useMemo(() => recips.map((r) => {
    const { p, a } = r;
    const v = { name: p.name, clinic: s.clinic || "our clinic", phone: s.phone || "", date: a ? fmtD(a.date) : "", time: a ? fmt12(a.time) : "", rct: a && a.rct ? rctWords(a.rct, s.tplReminder) : "", reason: "" };
    if (mode === "custom") return fill(custom, v);
    if (mode === "rebook") return fill(s.tplRebook, v);
    if (mode === "rx") return !tpl ? "Choose a prescription template above." : !tpl.items.some((i) => i.drug && i.drug.trim()) && !String(tpl.note || "").trim() ? "Add at least one medicine or instruction below." : buildRx(tpl, p, r.tx, s);
    if (mode === "recall") {
      const c = r.recall; const t = c.kind === "m6" ? s.tplRecall6 : c.kind === "m12" ? s.tplRecall12 : s.tplRecall;
      return fill(t, { ...v, date: fmtD(c.date), reason: c.reason || "check-up" });
    }
    const cl = `${base}#/consent?c=${b64e(JSON.stringify({ c: s.clinic, cp: s.phone, n: p.name, pid: p.id, aid: a.id, d: a.date, t: a.time, tx: s.consentText || undefined }))}`;
    const fl = `${base}#/form?c=${b64e(JSON.stringify({ c: s.clinic, cp: s.phone, pid: p.id, n: p.name, ph: p.phone }))}`;
    let m = fill(s.tplReminder, v);
    if (a.rct && !/\{rct\}/.test(s.tplReminder)) m += (/[؀-ۿ]/.test(s.tplReminder) ? "\nیہ وزٹ: " : "\nThis visit: ") + v.rct + ".";
    if (inclConsent) m += "\n\n" + fill(s.tplConsent, { ...v, consent_link: cl });
    if (inclForm) m += "\n\n" + fill(s.tplForm, { ...v, form_link: fl });
    return m;
  }), [recips, mode, custom, inclConsent, inclForm, s, base, tpl]);
  const msg = (i) => (edited[i] !== undefined ? edited[i] : msgs[i]);
  const hrefOf = (i) => waLink(recips[i].p.phone, msg(i), s.cc);
  const mark = (i) => {
    setDone((d) => ({ ...d, [i]: true }));
    onSent(recips[i], { consent: mode === "appt" && inclConsent, form: mode === "appt" && inclForm, rx: mode === "rx" ? tplId : "", rxText: mode === "rx" ? msg(i) : "", rxSnap: mode === "rx" && tpl ? { name: tpl.name, items: tpl.items.filter((x) => x.drug && x.drug.trim()), note: tpl.note || "" } : null, rebook: mode === "rebook" });
  };
  const nextIdx = recips.findIndex((_, i) => !done[i] && normPhone(recips[i].p.phone, s.cc));
  const localHost = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === "file:";
  const usesLinks = mode === "appt" && (inclConsent || inclForm) && !s.baseUrl && localHost;
  const penNames = mode === "rx" && penicillinTpl(tpl) ? recips.filter((r) => penicillinPatient(r.p)).map((r) => r.p.name) : [];
  const title = { appt: "Appointment reminders", custom: "WhatsApp message", recall: "Recall reminders", rx: "Prescription after procedure", rebook: "Ask patient to book again" }[mode];

  return (
    <Modal onClose={onClose}>
      <div className="row"><h2 className="sp">{title} ({recips.length})</h2><button className="btn sec sm" onClick={onClose}>Close</button></div>
      <div className="warn">WhatsApp opens with the message pre-filled; <b>you tap Send in WhatsApp for each patient</b> (WhatsApp does not allow a website to send silently). Messages go out from the WhatsApp account logged in on this device.</div>
      {!s.clinic && <div className="warn" data-testid="clinic-warn">⚠ Your clinic name is not set, so messages say "our clinic". Enter it in Settings → Clinic name and it fills in automatically.</div>}
      {usesLinks && <div className="warn">⚠ The consent/form links point to <b>{base}</b>, which patients' phones cannot open. Put the app online and set "Public app URL" in Settings first.</div>}
      {penNames.length > 0 && <div className="warn" style={{ borderColor: "var(--red)" }} data-testid="pen-warn">⚠ <b>Penicillin allergy recorded for {penNames.join(", ")}</b>, and this prescription contains an amoxicillin-type antibiotic. Change the medicine before sending.</div>}
      {mode === "custom" && <F l="Message ({name} = patient, {clinic} = your clinic name, {phone}; filled in automatically)"><textarea value={custom} onChange={(e) => { setCustom(e.target.value); setEdited({}); }} dir="auto" /></F>}
      {mode === "appt" && (
        <div className="row" style={{ marginBottom: 8 }}>
          <label><input type="checkbox" checked={inclConsent} onChange={(e) => { setInclConsent(e.target.checked); setEdited({}); }} /> Include consent form link</label>
          <label><input type="checkbox" checked={inclForm} onChange={(e) => { setInclForm(e.target.checked); setEdited({}); }} /> Include patient information form link</label>
        </div>)}
      {mode === "rx" && (
        <>
        <F l="Prescription (suggested for this treatment first; dose, quantity and days fill in automatically)"><select id="rx-pick" value={tplId} onChange={(e) => { if (e.target.value === "__manual") setManual((m) => m || { items: [blankItem()], note: "" }); setTplId(e.target.value); setEdited({}); }}>
          <option value="">Choose…</option>
          <option value="__manual">Write my own medicines…</option>
          {rxSug.length > 0 && <optgroup label="Suggested for this treatment">{rxSug.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
          <optgroup label="All templates">{rxList.filter((t) => !rxSug.includes(t)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup></select></F>
        {tpl && tplId !== "__manual" && <div style={{ margin: "4px 0 8px" }}><button type="button" className="btn sec sm" id="rx-edit-here" onClick={() => { setManual({ items: tpl.items.map((i) => ({ ...i, id: uid() })), note: tpl.note || "" }); setTplId("__manual"); setEdited({}); }}>Change medicines for this patient only</button></div>}
        {tplId === "__manual" && manual && (
          <div className="card" style={{ background: "var(--bg)" }} data-testid="rx-manual">
            <datalist id="rx-drugs">{COMMON_DRUGS.map((d) => <option key={d} value={d} />)}</datalist>
            <div className="muted" style={{ marginBottom: 6 }}>Type any medicine or pick a suggestion. Quantity is worked out from dose × times a day × days.</div>
            {manual.items.map((it, k) => {
              const up = (o) => { setManual({ ...manual, items: manual.items.map((x, n) => (n === k ? { ...x, ...o } : x)) }); setEdited({}); };
              return (
                <div key={it.id} className="grid" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                  <F l="Medicine and strength"><input data-f="drug" list="rx-drugs" value={it.drug} onChange={(e) => up({ drug: e.target.value, ...(it._ut ? {} : guessUnit(e.target.value) ? { unit: guessUnit(e.target.value) } : {}) })} placeholder="e.g. Tab. Ibuprofen 400 mg" /></F>
                  <F l="Dose each time"><input data-f="per" type="number" min="0" step="0.5" value={it.per} onChange={(e) => up({ per: e.target.value })} /></F>
                  <F l="Unit"><select data-f="unit" value={it.unit} onChange={(e) => up({ unit: e.target.value, _ut: true })}>{RX_UNITS.map((u) => <option key={u}>{u}</option>)}</select></F>
                  <F l="Times a day"><input data-f="perDay" type="number" min="1" value={it.perDay} onChange={(e) => up({ perDay: e.target.value })} /></F>
                  <F l="For how many days"><input data-f="days" type="number" min="1" value={it.days} onChange={(e) => up({ days: e.target.value })} /></F>
                  <F l="When / how (optional)"><input data-f="when" value={it.when} onChange={(e) => up({ when: e.target.value })} /></F>
                  <div className="muted">Total: {nfmt(itemQty(it))} {unitWord(it.unit, itemQty(it))} <button type="button" className="btn red sm" onClick={() => { setManual({ ...manual, items: manual.items.filter((_, n) => n !== k) }); setEdited({}); }}>Remove</button></div>
                </div>);
            })}
            <button type="button" className="btn sec sm" id="rx-add-med" onClick={() => setManual({ ...manual, items: [...manual.items, blankItem()] })}>+ Add medicine</button>
            <F l="Instructions for the patient (optional)" style={{ marginTop: 8 }}><textarea id="rx-manual-note" dir="auto" value={manual.note} onChange={(e) => { setManual({ ...manual, note: e.target.value }); setEdited({}); }} /></F>
          </div>)}
        </>)}
      {mode !== "custom" && <div className="muted" style={{ marginBottom: 6 }}>Press Preview to read or edit any message before it is sent.</div>}
      <div className="row" style={{ margin: "10px 0" }}>
        {nextIdx < 0 ? <button className="btn wa" disabled>All done</button> :
          <a className="btn wa" href={hrefOf(nextIdx)} target="_blank" rel="noreferrer" onClick={() => mark(nextIdx)}>
            {`Open WhatsApp for next patient (${Object.keys(done).length}/${recips.length} sent)`}
          </a>}
      </div>
      <div className="tw"><table><tbody>
        {recips.map((r, i) => {
          const ok = !!normPhone(r.p.phone, s.cc);
          return (
            <React.Fragment key={r.p.id + (r.a?.id || r.tx?.id || r.recall?.kind || "") + i}>
              <tr>
                <td><b>{r.p.name}</b><div className="muted">{r.p.phone || "no phone"}{r.a ? ` · ${fmtD(r.a.date)} ${fmt12(r.a.time)}` : ""}{r.recall ? ` · ${{ m6: "6-month recall", m12: "Annual recall", manual: "Recall" }[r.recall.kind]}` : ""}{r.tx ? ` · ${r.tx.procedure}` : ""}</div></td>
                <td>{done[i] ? <span className="tag g">Opened ✓</span> : !ok ? <span className="tag r">Invalid phone</span> : <span className="tag">Waiting</span>}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sec sm" onClick={() => setShow(show === i ? null : i)}>Preview</button>{" "}
                  {ok ? <a className="btn wa sm" href={hrefOf(i)} target="_blank" rel="noreferrer" onClick={() => mark(i)}>{done[i] ? "Open again" : "Open"}</a> : <button className="btn wa sm" disabled>Open</button>}
                </td>
              </tr>
              {show === i && <tr><td colSpan={3}>
                <textarea aria-label={`Message for ${r.p.name}`} dir="auto" style={{ minHeight: mode === "rx" ? 260 : 110, fontFamily: "inherit" }} value={msg(i)} onChange={(e) => setEdited({ ...edited, [i]: e.target.value })} />
                {edited[i] !== undefined && <button className="btn sec sm" onClick={() => { const e = { ...edited }; delete e[i]; setEdited(e); }}>Reset to template</button>}
              </td></tr>}
            </React.Fragment>
          );
        })}
      </tbody></table></div>
    </Modal>
  );
}

/* ============================ appointment form (book / edit, RCT sitting) ============================ */
function ApptModal({ db, patch, fixedPid, init, onClose }) {
  const edit = !!(init && init.id);
  const [v, setV] = useState(() => ({
    patientId: fixedPid || "", date: addDays(todayStr(), 1), time: "10:00", reason: "", ...init,
    rctOn: !!(init && init.rct), rctDay: init && init.rct ? init.rct.day : 1, rctOf: init && init.rct && init.rct.of ? init.rct.of : 3,
  }));
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const toggleRct = (on) => setV((x) => ({ ...x, rctOn: on, reason: on && !x.reason ? "Root canal treatment (RCT)" : x.reason }));
  function save(e) {
    e.preventDefault();
    const rct = v.rctOn ? { day: Math.max(1, Math.round(+v.rctDay) || 1), of: +v.rctOf > 0 ? Math.round(+v.rctOf) : null } : null;
    const core = { patientId: v.patientId, date: v.date, time: v.time, reason: v.reason, rct };
    if (edit) patch("appts", (as) => as.map((a) => (a.id === init.id ? { ...a, ...core } : a)));
    else patch("appts", (as) => [...as, { ...core, id: uid(), status: "scheduled" }]);
    onClose();
  }
  return (
    <Modal onClose={onClose}>
      <h2>{edit ? "Edit appointment" : "Book appointment"}</h2>
      {!db.patients.length ? <Empty>Add a patient first.</Empty> : (
        <form onSubmit={save}>
          <div className="grid">
            <F l="Patient *"><select id="ap-patient" required value={v.patientId} onChange={set("patientId")} disabled={!!fixedPid || edit}><option value="">Select…</option>{db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
            <F l="Date *"><input id="ap-date" type="date" required value={v.date} onChange={set("date")} /></F>
            <F l="Time *"><input id="ap-time" type="time" required value={v.time} onChange={set("time")} /></F>
            <F l="Reason / procedure"><input id="ap-reason" value={v.reason} onChange={set("reason")} placeholder="Check-up, scaling, filling…" /></F>
          </div>
          <div className="card" style={{ margin: "10px 0 0", background: "var(--bg)" }}>
            <label><input id="ap-rct" type="checkbox" checked={v.rctOn} onChange={(e) => toggleRct(e.target.checked)} /> <b>Root canal (RCT) sitting</b></label>
            {v.rctOn && (
              <div className="row" style={{ marginTop: 8 }}>
                <F l="This is sitting no."><input id="ap-rctday" type="number" min="1" max="9" style={{ width: 90 }} value={v.rctDay} onChange={set("rctDay")} /></F>
                <F l="of (planned total)"><input id="ap-rctof" type="number" min="1" max="9" style={{ width: 90 }} value={v.rctOf} onChange={set("rctOf")} placeholder="2 or 3" /></F>
                <span className="muted" style={{ alignSelf: "flex-end" }}>Shows as RCT {v.rctDay || "?"}{+v.rctOf > 0 ? "/" + v.rctOf : ""} on the calendar and in reminders.</span>
              </div>)}
          </div>
          <div className="row" style={{ marginTop: 12 }}><button className="btn" type="submit">{edit ? "Save changes" : "Book"}</button><button type="button" className="btn sec" onClick={onClose}>Cancel</button></div>
        </form>)}
    </Modal>
  );
}

/* ============================ Today ============================ */
function Today({ db, s, setDb, pById, now, setSend, dueReminders, acDue, recallDue, setTab, setOpenPid, base }) {
  const cancelOpen = db.appts.filter((a) => a.status === "cancelled" && !a.rebookSentAt && pById[a.patientId] && normPhone(pById[a.patientId].phone, s.cc) && daysBetween(a.date, todayStr()) <= 45 && !db.appts.some((x) => x.patientId === a.patientId && x.status === "scheduled" && x.date >= todayStr()));
  const [paste, setPaste] = useState("");
  const [res, setRes] = useState("");
  const today = todayStr();
  const todays = db.appts.filter((a) => a.date === today && a.status !== "cancelled").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const pendingConsent = db.appts.filter((a) => a.status === "scheduled" && a.date >= today && a.consentSentAt && !a.consentAt).length;
  const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openToday = todays.filter((a) => a.status === "scheduled");
  const next = openToday.find((a) => toMin(a.time) >= nowMin - 15) || null;

  function doImport() {
    const codes = []; const re = /DENTCARE-(FORM|CONSENT):([A-Za-z0-9_-]+)/g; let m;
    while ((m = re.exec(paste))) { try { codes.push({ kind: m[1], d: JSON.parse(b64d(m[2])) }); } catch { /* skip */ } }
    if (!codes.length) { setRes("No DENTCARE code found in the pasted text."); return; }
    let forms = 0, cons = 0, miss = 0, made = 0;
    const out = [...db.patients];
    for (const c of codes) {
      if (c.kind !== "FORM") continue;
      const d = c.d; const fields = { ...d }; delete fields.pid; delete fields.ph;
      let i = out.findIndex((p) => p.id === d.pid);
      if (i < 0 && d.phone) i = out.findIndex((p) => normPhone(p.phone, s.cc) && normPhone(p.phone, s.cc) === normPhone(d.phone, s.cc));
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length)));
      const stamp = new Date().toISOString();
      if (i >= 0) { out[i] = { ...out[i], ...clean, formAt: stamp }; forms++; }
      else if (clean.name) { out.push({ id: uid(), createdAt: stamp, formAt: stamp, ...clean }); made++; forms++; }
    }
    const consents = codes.filter((c) => c.kind === "CONSENT");
    for (const c of consents) {
      const i = out.findIndex((p) => p.id === c.d.pid);
      if (i >= 0) { out[i] = { ...out[i], consent: { at: c.d.at, name: c.d.name } }; cons++; } else miss++;
    }
    const appts = db.appts.map((a) => { const c = consents.find((x) => x.d.aid === a.id); return c ? { ...a, consentAt: c.d.at, consentName: c.d.name } : a; });
    setDb((d) => ({ ...d, patients: out, appts }));
    setRes(`Imported: ${forms} information form(s)${made ? ` (${made} new patient)` : ""}, ${cons} signed consent(s)${miss ? `, ${miss} consent(s) could not be matched to a patient` : ""}.`);
    setPaste("");
  }

  return (
    <div>
      <div className="hd">
        <h2>Today</h2>
        <div className="muted">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{s.clinic ? " · " + s.clinic : ""}</div>
      </div>
      {!s.clinic && <div className="warn">First, open <b>Settings</b> and enter your clinic name and WhatsApp number so messages and forms carry them.</div>}
      <div className="strip" data-testid="today-strip">
        <div className="hot"><b>{todays.length}</b><span>Appointments today</span></div>
        <div><b>{dueReminders.length}</b><span>Reminders due (next 24h)</span></div>
        <div><b>{pendingConsent}</b><span>Consents sent, not signed</span></div>
        <div><b>{acDue.length}</b><span>Autoclave tasks due</span></div>
        <div className="go" onClick={() => setTab("recalls")}><b>{recallDue}</b><span>Recalls ready to send</span></div>
      </div>

      <div className="cols">
      <div>
      {next ? (() => { const p = pById[next.patientId]; const mins = toMin(next.time) - (now.getHours() * 60 + now.getMinutes()); return (
        <div className="next card" data-testid="next-up">
          <div><div className="t">{fmt12(next.time)}</div><div className="cap">{mins <= 0 ? "Due now" : mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)} h ${mins % 60 ? (mins % 60) + " min" : ""}`}</div></div>
          <div className="who"><b>{p ? p.name : "(deleted)"}</b>
            <div className="sub">{next.reason || "Appointment"}{next.rct && <> <span className="tag y">{rctTag(next)}</span></>}</div>
            {p && p.phone ? <div className="sub">{p.phone}</div> : null}</div>
          {p && <div className="act">
            <button className="btn wa sm" onClick={() => setSend({ mode: "appt", recips: [{ p, a: next }] })}>Remind</button>
            <button className="btn sec sm" onClick={() => { setTab("patients"); setOpenPid(p.id); }}>Open patient</button></div>}
        </div>); })() : (
        <div className="next none card" data-testid="next-up"><b style={{ color: "var(--fg)" }}>{todays.length ? "No more appointments today." : "No appointments today."}</b><div className="muted">Book one from Appointments or the Calendar.</div></div>)}

      <div className="card">
        <h3>Today's schedule</h3>
        {!todays.length ? <Empty>No appointments today.</Empty> : (
          <ol className="tl">{todays.map((a) => { const p = pById[a.patientId]; return (
            <li key={a.id} className={a.status === "done" ? "done" : next && a.id === next.id ? "nx" : ""}>
              <span className="tm">{fmt12(a.time)}</span><span className="dot" />
              <div className="bd"><a href="#p" onClick={(e) => { e.preventDefault(); if (p) { setTab("patients"); setOpenPid(p.id); } }}>{p?.name || "(deleted)"}</a>
                <div className="muted">{a.reason}{a.rct && <> <span className="tag y">{rctTag(a)}</span></>}{a.src === "shared" && a.addedBy ? <> <span className="tag">Added by {a.addedBy}</span></> : null}</div></div>
              <span className={"tag " + (a.status === "done" ? "g" : "")}>{a.status}</span></li>); })}</ol>)}
      </div>
      </div>

      <div>
      <div className="card">
        <div className="row"><div className="sp"><h3 style={{ margin: 0 }}>Reminders to send</h3><div className="muted">Appointments within the next 24 hours</div></div>
          <button className="btn wa" disabled={!dueReminders.length}
            onClick={() => setSend({ mode: "appt", recips: dueReminders.map((a) => ({ p: pById[a.patientId], a })) })}>
            Send all due ({dueReminders.length})
          </button></div>
        {!dueReminders.length ? <Empty>Nothing due. Reminders appear here once an appointment is within 24 hours and no reminder has been sent.</Empty> : (
          <div className="rl" style={{ marginTop: 8 }}>{dueReminders.map((a) => (
            <div key={a.id}><span className="nm">{pById[a.patientId].name}</span>
              <span className="meta">{fmtD(a.date)} {fmt12(a.time)} · {a.reason || "Appointment"}{a.rct && <> <span className="tag y">{rctTag(a)}</span></>}</span>
              <button className="btn wa sm" onClick={() => setSend({ mode: "appt", recips: [{ p: pById[a.patientId], a }] })}>Send</button></div>))}</div>)}
        <div className="muted" style={{ marginTop: 8 }}>This list updates while the app is open. It does not send by itself; a person must tap Send in WhatsApp.</div>
      </div>

      {(db.inbox || []).length > 0 && <div className="card" style={{ cursor: "pointer", borderColor: "var(--yfg)" }} data-testid="inbox-today" onClick={() => setTab("calendar")}><b>{db.inbox.length} patient message{db.inbox.length === 1 ? "" : "s"} to check</b> <span className="muted">(possible cancellations). Open the Calendar to decide.</span></div>}
      {cancelOpen.length > 0 && <div className="card" data-testid="cancel-open">
        <div className="row"><h3 className="sp">Cancelled, not yet asked to rebook ({cancelOpen.length})</h3>
          <button className="btn wa sm" onClick={() => setSend({ mode: "rebook", recips: cancelOpen.map((a) => ({ p: pById[a.patientId], a })) })}>Send rebook message to all</button></div>
        <div className="tw"><table><tbody>{cancelOpen.map((a) => <tr key={a.id}><td><b>{pById[a.patientId].name}</b></td><td>{fmtD(a.date)} {fmt12(a.time)}</td><td>{a.reason}</td><td style={{ textAlign: "right" }}><button className="btn wa sm" onClick={() => setSend({ mode: "rebook", recips: [{ p: pById[a.patientId], a }] })}>Send</button></td></tr>)}</tbody></table></div>
      </div>}

      {acDue.length > 0 && <div className="card">
        <div className="row"><h3 className="sp">Autoclave: due now</h3><button className="btn sec sm" onClick={() => setTab("autoclave")}>Open autoclave</button></div>
        {acDue.map(({ r, st }) => <div key={r.id} className="row" style={{ padding: "4px 0" }}><b>{r.label}</b><span className={"tag " + (st.over ? "r" : "y")}>{st.text}</span></div>)}
      </div>}

      <div className="card">
        <h3>Import patient replies</h3>
        <div className="muted" style={{ marginBottom: 6 }}>When a patient submits a consent or information form, WhatsApp sends you a message containing a code starting with DENTCARE-. Paste one or several messages here.</div>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste WhatsApp messages here…" />
        <div className="row" style={{ marginTop: 6 }}><button className="btn" disabled={!paste.trim()} onClick={doImport}>Import</button><span className="muted">{res}</span></div>
      </div>
      </div>
      </div>
    </div>
  );
}

/* ============================ Patients ============================ */
function Patients({ db, s, patch, setSend, setOpenPid, base }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState({});
  const [adding, setAdding] = useState(false);
  const list = db.patients.filter((p) => !q || (p.name + " " + (p.phone || "")).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = db.patients.filter((p) => sel[p.id]);
  const formLink = `${base}#/form?c=${b64e(JSON.stringify({ c: s.clinic, cp: s.phone }))}`;
  const [copied, setCopied] = useState("");
  return (
    <div>
      <div className="row"><h2 className="sp">Patients ({db.patients.length})</h2>
        <button className="btn sec" onClick={async () => setCopied((await copyText(formLink)) ? "Link copied" : formLink)}>Copy new-patient form link</button>
        <button className="btn wa" disabled={!chosen.length} onClick={() => setSend({ mode: "custom", recips: chosen.map((p) => ({ p })) })}>WhatsApp selected ({chosen.length})</button>
        <button className="btn" onClick={() => setAdding(true)}>+ Add patient</button></div>
      {copied && <div className="muted" style={{ wordBreak: "break-all", marginBottom: 6 }}>{copied}</div>}
      <input placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "8px 0" }} />
      <div className="card tw">
        {!list.length ? <Empty>{db.patients.length ? "No match." : "No patients yet. Add one, or send a new-patient form link."}</Empty> : (
          <table><thead><tr><th><input type="checkbox" aria-label="select all" checked={list.length > 0 && list.every((p) => sel[p.id])}
            onChange={(e) => setSel(e.target.checked ? Object.fromEntries(list.map((p) => [p.id, true])) : {})} /></th>
            <th>Name</th><th>Phone</th><th>Chief complaint</th><th>Forms</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} /></td>
                <td><a href="#p" onClick={(e) => { e.preventDefault(); setOpenPid(p.id); }}><b>{p.name}</b></a></td>
                <td>{p.phone}</td><td>{p.complaint}</td>
                <td>{p.formAt && <span className="tag g">Info form</span>} {p.consent && <span className="tag g">Consent</span>}</td>
              </tr>))}</tbody></table>)}
      </div>
      {adding && <Modal onClose={() => setAdding(false)}>
        <h2>New patient</h2>
        <PatientForm onSave={(v) => { const p = { ...v, id: uid(), createdAt: new Date().toISOString() }; patch("patients", (a) => [...a, p]); setAdding(false); setOpenPid(p.id); }} onCancel={() => setAdding(false)} />
      </Modal>}
    </div>
  );
}

function PatientForm({ init = {}, onSave, onCancel }) {
  const [v, setV] = useState({ name: "", phone: "", dob: "", gender: "", cnic: "", address: "", city: "", emergency: "", allergies: "", conditions: [], meds: "", complaint: "", notes: "", ...init });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const tog = (c) => setV({ ...v, conditions: v.conditions.includes(c) ? v.conditions.filter((x) => x !== c) : [...v.conditions, c] });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...v, name: v.name.trim(), phone: v.phone.trim() }); }}>
      <div className="grid">
        <F l="Full name *"><input required value={v.name} onChange={set("name")} /></F>
        <F l="WhatsApp / mobile *"><input required value={v.phone} onChange={set("phone")} placeholder="0300 1234567" inputMode="tel" /></F>
        <F l="Date of birth"><input type="date" value={v.dob} onChange={set("dob")} /></F>
        <F l="Gender"><select value={v.gender} onChange={set("gender")}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></F>
        <F l="CNIC (optional)"><input value={v.cnic} onChange={set("cnic")} placeholder="35202-1234567-1" /></F>
        <F l="City"><input value={v.city} onChange={set("city")} /></F>
        <F l="Address"><input value={v.address} onChange={set("address")} /></F>
        <F l="Emergency contact"><input value={v.emergency} onChange={set("emergency")} /></F>
      </div>
      <F l="Chief complaint" style={{ marginTop: 10 }}><textarea value={v.complaint} onChange={set("complaint")} placeholder="e.g. pain in upper right molar for 3 days" dir="auto" /></F>
      <label className="f" style={{ marginTop: 10 }}>Medical conditions</label>
      <div className="row">{CONDITIONS.map((c) => <button type="button" key={c} className={"chip" + (v.conditions.includes(c) ? " on" : "")} onClick={() => tog(c)}>{c}</button>)}</div>
      <div className="grid" style={{ marginTop: 10 }}>
        <F l="Allergies"><input value={v.allergies} onChange={set("allergies")} /></F>
        <F l="Current medications"><input value={v.meds} onChange={set("meds")} /></F>
      </div>
      <F l="Notes" style={{ marginTop: 10 }}><textarea value={v.notes} onChange={set("notes")} /></F>
      <label style={{ display: "block", marginTop: 10 }}><input id="pf-recall" type="checkbox" checked={!v.recallOptOut} onChange={(e) => setV({ ...v, recallOptOut: !e.target.checked })} /> Send 6-monthly and annual recall reminders to this patient</label>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" type="submit">Save</button>{onCancel && <button type="button" className="btn sec" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}

function PatientDetail({ p, db, s, patch, setOpenPid, setSend, xrays, addXray, delXray, pById, openTx }) {
  const [edit, setEdit] = useState(false);
  const [addAppt, setAddAppt] = useState(false);
  const appts = db.appts.filter((a) => a.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const mine = xrays.filter((x) => x.patientId === p.id);
  const age = p.dob ? ageYears(p.dob) : null;
  const ask = useAsk();
  const del = () => ask(`Delete ${p.name}, their appointments and X-rays? This cannot be undone.`, () => {
    mine.forEach((x) => delXray(x.id));
    patch("appts", (a) => a.filter((x) => x.patientId !== p.id));
    patch("tx", (a) => a.filter((x) => x.patientId !== p.id));
    patch("patients", (a) => a.filter((x) => x.id !== p.id));
    setOpenPid(null);
  });
  return (
    <div>
      <div className="row"><button className="btn sec sm" onClick={() => setOpenPid(null)}>← All patients</button><div className="sp" />
        <button className="btn wa sm" onClick={() => setSend({ mode: "custom", recips: [{ p }] })}>WhatsApp</button>
        <button className="btn sec sm" onClick={() => setEdit(true)}>Edit</button><button className="btn red sm" onClick={del}>Delete</button></div>
      {p.addedVia && <div className="warn" data-testid="added-via">Added from the shared calendar by <b>{p.addedBy}</b>. Please complete this patient's details.{p.review ? " " + p.review + "." : ""} <button className="btn sm" onClick={() => patch("patients", (a) => a.map((x) => { if (x.id !== p.id) return x; const { addedVia, addedBy, review, ...rest } = x; return rest; }))}>Details checked</button></div>}
      <div className="card" style={{ marginTop: 10 }}>
        <h2>{p.name}</h2>
        <div className="grid">
          <div><div className="muted">Phone</div>{p.phone}</div>
          <div><div className="muted">Age / gender</div>{age != null ? age + " y" : "—"} {p.gender}</div>
          <div><div className="muted">City</div>{p.city || "—"}</div>
          <div><div className="muted">CNIC</div>{p.cnic || "—"}</div>
        </div>
        <div style={{ marginTop: 10 }}><div className="muted">Chief complaint</div>{p.complaint || "—"}</div>
        <div style={{ marginTop: 10 }}><div className="muted">Medical conditions</div>{(p.conditions || []).join(", ") || "None recorded"}{p.allergies ? ` · Allergies: ${p.allergies}` : ""}{p.meds ? ` · Meds: ${p.meds}` : ""}</div>
        {p.notes && <div style={{ marginTop: 10 }}><div className="muted">Notes</div>{p.notes}</div>}
        <div className="row" style={{ marginTop: 10 }}>{p.formAt ? <span className="tag g">Info form received {fmtD(p.formAt)}</span> : <span className="tag">Info form not received</span>}
          {p.consent ? <span className="tag g">Consent signed {fmtD(p.consent.at)}</span> : <span className="tag">No signed consent</span>}
          <span className={"tag " + (p.recallOptOut ? "" : "g")}>{p.recallOptOut ? "Recalls off" : "Recalls on"}</span></div>
      </div>
      <div className="card">
        <div className="row"><h3 className="sp">Appointments</h3><button className="btn sm" onClick={() => setAddAppt(true)}>+ Book</button></div>
        {!appts.length ? <Empty>No appointments.</Empty> : <div className="tw"><table><tbody>{appts.map((a) => (
          <tr key={a.id}><td>{fmtD(a.date)} {fmt12(a.time)}</td><td>{a.reason}{a.rct && <> <span className="tag y">{rctTag(a)}</span></>}</td><td><span className="tag">{a.status}</span></td>
            <td>{a.remindedAt && <span className="tag g">Reminded</span>} {a.consentAt && <span className="tag g">Consent ✓</span>}</td></tr>))}</tbody></table></div>}
      </div>
      <div className="card"><h3>Odontogram</h3><Odontogram key={p.id} p={p} db={db} patch={patch} openTx={openTx} /></div>
      <div className="card">
        <div className="row"><h3 className="sp">Treatment history ({db.tx.filter((x) => x.patientId === p.id).length})</h3><button className="btn sm" onClick={() => openTx({ patientId: p.id })}>+ Log treatment</button></div>
        {!db.tx.some((x) => x.patientId === p.id) ? <Empty>No treatments logged.</Empty> : <div className="tw"><table><tbody>{db.tx.filter((x) => x.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
          <tr key={x.id}><td style={{ whiteSpace: "nowrap" }}>{fmtD(x.date)}</td><td>{x.procedure}{x.rct && <> <span className="tag y">RCT {x.rct.day}{x.rct.of ? "/" + x.rct.of : ""}</span></>}<RxHistory tx={x} /></td><td>{siteText(x)}</td><td style={{ textAlign: "right" }}>{money(x.fee)}</td><td><button className="btn sec sm" onClick={() => openTx(x)}>Open</button></td></tr>))}</tbody></table></div>}
      </div>
      <div className="card"><h3>X-rays ({mine.length})</h3><XraySection patientId={p.id} list={mine} addXray={addXray} delXray={delXray} /></div>
      {edit && <Modal onClose={() => setEdit(false)}><h2>Edit patient</h2>
        <PatientForm init={p} onCancel={() => setEdit(false)} onSave={(v) => { patch("patients", (a) => a.map((x) => (x.id === p.id ? { ...x, ...v } : x))); setEdit(false); }} /></Modal>}
      {addAppt && <ApptModal db={db} patch={patch} fixedPid={p.id} onClose={() => setAddAppt(false)} />}
    </div>
  );
}

/* ============================ Appointments ============================ */
const CANCEL_REASONS = ["Patient cancelled", "Patient did not show up", "Clinic cancelled or rescheduled", "Other"];
function CancelModal({ a, p, s, onConfirm, onClose }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const hasPhone = !!normPhone(p.phone, s.cc);
  const [send, setSend] = useState(hasPhone);
  return (
    <Modal onClose={onClose}>
      <h2>Cancel appointment</h2>
      <p style={{ marginTop: 0 }}><b>{p.name}</b> · {fmtD(a.date)} {fmt12(a.time)}{a.reason ? " · " + a.reason : ""}{a.rct ? " · " + rctTag(a) : ""}</p>
      <F l="Reason"><select id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</select></F>
      <label style={{ display: "block", margin: "10px 0" }}><input id="cx-send" type="checkbox" checked={send && hasPhone} disabled={!hasPhone} onChange={(e) => setSend(e.target.checked)} /> Then open a WhatsApp message asking the patient to book again{!hasPhone && " (no valid phone number)"}</label>
      <div className="row"><button className="btn red" id="cx-confirm" onClick={() => onConfirm(reason, send && hasPhone)}>Cancel appointment</button><button className="btn sec" onClick={onClose}>Keep appointment</button></div>
    </Modal>
  );
}
function Appts({ db, patch, pById, setSend, now, openTx, s, setS }) {
  const ask = useAsk();
  const [filter, setFilter] = useState("upcoming");
  const [sel, setSel] = useState({});
  const [am, setAm] = useState(null);
  const [cx, setCx] = useState(null);
  const today = todayStr();
  const hasFuture = (pid) => db.appts.some((x) => x.patientId === pid && x.status === "scheduled" && x.date >= today);
  const list = db.appts.filter((a) => pById[a.patientId]).filter((a) => filter === "all" ? true : filter === "upcoming" ? a.date >= today && a.status === "scheduled" : filter === "cancelled" ? a.status === "cancelled" : a.date < today || a.status !== "scheduled")
    .sort((a, b) => (filter === "past" ? apptDT(b) - apptDT(a) : apptDT(a) - apptDT(b)));
  const chosen = list.filter((a) => sel[a.id]);
  const setStatus = (id, status) => patch("appts", (as) => as.map((a) => (a.id === id ? { ...a, status } : a)));
  return (
    <div>
      <div className="row"><h2 className="sp">Appointments</h2>
        <button className="btn wa" disabled={!chosen.length} onClick={() => setSend({ mode: "appt", recips: chosen.map((a) => ({ p: pById[a.patientId], a })) })}>Send reminder to selected ({chosen.length})</button>
        <button className="btn" onClick={() => setAm({})}>+ Book</button></div>
      <div className="row" style={{ margin: "8px 0" }}>{["upcoming", "past", "cancelled", "all"].map((f) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <div className="card tw">
        {!list.length ? <Empty>No appointments here.</Empty> : (
          <table><thead><tr><th><input type="checkbox" aria-label="select all" checked={list.every((a) => sel[a.id])} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(list.map((a) => [a.id, true])) : {})} /></th>
            <th>When</th><th>Patient</th><th>Reason</th><th>Treatment (tooth / fee)</th><th>Reminder</th><th>Consent</th><th>Info form</th><th></th></tr></thead>
            <tbody>{list.map((a) => {
              const p = pById[a.patientId]; const hrs = (apptDT(a) - now) / 3600000;
              return (
                <tr key={a.id}>
                  <td><input type="checkbox" checked={!!sel[a.id]} onChange={(e) => setSel({ ...sel, [a.id]: e.target.checked })} /></td>
                  <td>{fmtD(a.date)}<div className="muted">{fmt12(a.time)}</div></td>
                  <td><b>{p.name}</b><div className="muted">{p.phone}</div></td><td>{a.reason}{a.rct && <> <span className="tag y" data-testid="rct-tag">{rctTag(a)}</span></>}{a.src === "shared" && <> <span className="tag" data-testid="shared-tag">Added by {a.addedBy}</span></>}</td>
                  <td style={{ minWidth: 170 }}>{db.tx.filter((x) => x.apptId === a.id).map((x) => <div key={x.id} style={{ fontSize: 13 }}>{x.procedure}<div className="muted">{siteText(x)} · {money(x.fee)}</div></div>)}
                    <button className="btn sec sm" style={{ marginTop: 3 }} onClick={() => openTx({ patientId: p.id, apptId: a.id, date: a.date, procedure: a.reason || (a.rct ? "Root canal treatment (RCT)" : "") })}>+ Log treatment</button></td>
                  <td>{a.remindedAt ? <span className="tag g">Sent</span> : a.status === "scheduled" && hrs > 0 && hrs <= 24 ? <span className="tag y">Due now</span> : <span className="tag">{a.status === "scheduled" && hrs > 24 ? "Due in " + Math.ceil(hrs - 24) + "h" : "—"}</span>}</td>
                  <td>{a.consentAt ? <span className="tag g">Signed</span> : a.consentSentAt ? <span className="tag y">Sent</span> : <span className="tag">—</span>}</td>
                  <td>{p.formAt ? <span className="tag g">Received</span> : a.formSentAt ? <span className="tag y">Sent</span> : <span className="tag">—</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sec sm" data-edit={a.id} onClick={() => setAm(a)}>Edit</button>{" "}
                    {a.rct && a.rct.of && a.rct.day < a.rct.of && a.status === "scheduled" && <><button className="btn sec sm" data-next-sitting={a.id} onClick={() => setAm({ patientId: p.id, date: addDays(a.date, 7), time: a.time, reason: a.reason, rct: { day: a.rct.day + 1, of: a.rct.of } })}>Book sitting {a.rct.day + 1}</button>{" "}</>}
                    {a.status === "scheduled" && <><button className="btn sm" onClick={() => setStatus(a.id, "done")}>Done</button> <button className="btn sec sm" data-cancel={a.id} onClick={() => setCx(a)}>Cancel</button> </>}
                    {a.status !== "scheduled" && <span className={"tag " + (a.status === "done" ? "g" : "r")}>{a.status}</span>}{" "}
                    {a.status === "cancelled" && <>
                      {a.cancelReason && <span className="muted">{a.cancelReason} </span>}
                      {a.rebookSentAt && <span className="tag g" data-testid="rebook-sent">Rebook message opened</span>}{" "}
                      {hasFuture(p.id) && <span className="tag g">Has a new appointment</span>}{" "}
                      <button className="btn wa sm" data-rebook-msg={a.id} onClick={() => setSend({ mode: "rebook", recips: [{ p, a }] })}>{a.rebookSentAt ? "Send rebook message again" : "Send rebook message"}</button>{" "}
                      <button className="btn sm" data-rebook={a.id} onClick={() => setAm({ patientId: p.id, reason: a.reason, rct: a.rct || undefined })}>Book new appointment</button>{" "}</>}
                    <button className="btn red sm" aria-label="delete" onClick={() => ask("Delete this appointment?", () => { patch("appts", (as) => as.filter((x) => x.id !== a.id)); patch("tx", (ts) => ts.map((x) => (x.apptId === a.id ? { ...x, apptId: "" } : x))); })}>✕</button>
                  </td>
                </tr>);
            })}</tbody></table>)}
      </div>
      {am && <ApptModal db={db} patch={patch} init={am} onClose={() => setAm(null)} />}
      <details className="card noprint" style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cancellation message wording (asks the patient to book again)</summary>
        <div className="muted" style={{ margin: "6px 0" }}>Variables: {"{name} {clinic} {phone} {date} {time}"}. You can also edit the text for each patient before sending.</div>
        <textarea id="set-rebook" dir="auto" value={s.tplRebook || ""} onChange={(e) => setS({ tplRebook: e.target.value })} />
      </details>
      {cx && <CancelModal a={cx} p={pById[cx.patientId]} s={db.settings} onClose={() => setCx(null)} onConfirm={(reason, send) => {
        patch("appts", (as) => as.map((x) => (x.id === cx.id ? { ...x, status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: reason } : x)));
        const a = cx; setCx(null); if (send) setSend({ mode: "rebook", recips: [{ p: pById[a.patientId], a }] });
      }} />}
    </div>
  );
}

/* ============================ X-rays ============================ */
function XraySection({ patientId, list, addXray, delXray }) {
  const [kind, setKind] = useState(XKINDS[0]);
  const [tooth, setTooth] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState(null);
  const fileRef = useRef(null);
  const ask = useAsk();
  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = ""; const errs = [];
    for (const f of files) {
      try { setBusy("Saving " + f.name + "…"); await addXray({ id: uid(), patientId, kind, tooth, date, note, name: f.name, data: await readImg(f) }); }
      catch (err) { errs.push(err.message || String(err)); }
    }
    setBusy(errs.length ? "Some files failed: " + errs.join("; ") + " (JPG/PNG only; DICOM must be exported as an image first)" : "");
  }
  return (
    <div>
      <div className="grid" style={{ marginBottom: 8 }}>
        <F l="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}>{XKINDS.map((k) => <option key={k}>{k}</option>)}</select></F>
        <F l="Tooth / region"><input value={tooth} onChange={(e) => setTooth(e.target.value)} placeholder="e.g. 16" /></F>
        <F l="Date taken"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></F>
        <F l="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></F>
      </div>
      <div className="row"><input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} data-testid="xray-file" style={{ maxWidth: 360 }} /><span className="muted">{busy}</span></div>
      <div className="muted" style={{ margin: "6px 0 10px" }}>Select the exported JPG/PNG from your sensor software (Romexis, Sidexis, NanoPix, etc.). Images are stored in this browser only; use Settings → Backup regularly.</div>
      {!list.length ? <Empty>No X-rays for this patient.</Empty> : (
        <div className="xg">{[...list].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
          <div key={x.id}><div className="x" onClick={() => setView(x)}><img src={x.data} alt={x.kind} /></div>
            <div className="cap"><b>{x.kind}</b>{x.tooth ? " · " + x.tooth : ""}<br />{fmtD(x.date)}</div></div>))}</div>)}
      {view && <XrayViewer x={view} onClose={() => setView(null)} onDelete={() => ask("Delete this X-ray?", async () => { await delXray(view.id); setView(null); })} />}
    </div>
  );
}
function XrayViewer({ x, onClose, onDelete }) {
  const [br, setBr] = useState(100), [ct, setCt] = useState(100), [inv, setInv] = useState(false), [zoom, setZoom] = useState(1), [rot, setRot] = useState(0);
  return (
    <Modal onClose={onClose}>
      <div className="row"><h3 className="sp">{x.kind}{x.tooth ? " · " + x.tooth : ""} · {fmtD(x.date)}</h3><button className="btn sec sm" onClick={onClose}>Close</button></div>
      <div style={{ background: "#000", borderRadius: 8, overflow: "auto", height: "58vh", textAlign: "center" }}>
        <img src={x.data} alt={x.kind} style={{ width: `${zoom * 100}%`, maxWidth: "none", transform: `rotate(${rot}deg)`, filter: `brightness(${br}%) contrast(${ct}%) invert(${inv ? 1 : 0})` }} />
      </div>
      <div className="grid" style={{ margin: "10px 0" }}>
        <F l={`Brightness ${br}%`}><input type="range" min="40" max="220" value={br} onChange={(e) => setBr(+e.target.value)} /></F>
        <F l={`Contrast ${ct}%`}><input type="range" min="40" max="260" value={ct} onChange={(e) => setCt(+e.target.value)} /></F>
        <F l={`Zoom ${zoom.toFixed(1)}×`}><input type="range" min="0.5" max="4" step="0.1" value={zoom} onChange={(e) => setZoom(+e.target.value)} /></F>
      </div>
      <div className="row">
        <button className="btn sec sm" onClick={() => setInv(!inv)}>Invert</button>
        <button className="btn sec sm" onClick={() => setRot((rot + 90) % 360)}>Rotate</button>
        <button className="btn sec sm" onClick={() => { setBr(100); setCt(100); setInv(false); setZoom(1); setRot(0); }}>Reset</button>
        <a className="btn sec sm" href={x.data} download={`xray-${x.date}-${x.kind}.jpg`} style={{ textDecoration: "none" }}>Download</a>
        <div className="sp" /><button className="btn red sm" onClick={onDelete}>Delete</button>
      </div>
      {x.note && <div className="muted" style={{ marginTop: 8 }}>Note: {x.note}</div>}
    </Modal>
  );
}
function XraysPage({ db, pById, xrays, addXray, delXray }) {
  const ask = useAsk();
  const [pid, setPid] = useState("");
  const [view, setView] = useState(null);
  const list = xrays.filter((x) => !pid || x.patientId === pid);
  return (
    <div>
      <h2>X-Rays ({xrays.length})</h2>
      <div className="card"><F l="Patient"><select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All patients</option>{db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
        {pid ? <div style={{ marginTop: 10 }}><XraySection patientId={pid} list={list} addXray={addXray} delXray={delXray} /></div> : (
          !list.length ? <Empty>No X-rays yet. Choose a patient to upload.</Empty> :
            <div className="xg" style={{ marginTop: 10 }}>{[...list].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
              <div key={x.id}><div className="x" onClick={() => setView(x)}><img src={x.data} alt={x.kind} /></div>
                <div className="cap"><b>{pById[x.patientId]?.name || "?"}</b><br />{x.kind} · {fmtD(x.date)}</div></div>))}</div>)}
      </div>
      {view && <XrayViewer x={view} onClose={() => setView(null)} onDelete={() => ask("Delete this X-ray?", async () => { await delXray(view.id); setView(null); })} />}
    </div>
  );
}

/* ---- autoclave by patient count: alert at N completed patients, then after every further patient ---- */
const localKey = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function completedVisits(db) {
  const apptIds = new Set(db.appts.map((a) => a.id));
  const out = db.appts.filter((a) => a.status === "done").map((a) => ({ id: "a" + a.id, key: a.doneAt || `${a.date} ${a.time || "00:00"}` }));
  db.tx.filter((x) => !x.apptId || !apptIds.has(x.apptId)).forEach((x) => {
    const d = x.createdAt ? new Date(x.createdAt) : null;
    out.push({ id: "t" + x.id, key: d && !isNaN(d) ? localKey(d) : `${x.date} 00:00` });
  });
  return out;
}
function patientsSinceAutoclave(db) {
  const last = db.cycles.reduce((m, c) => { const k = `${c.date} ${c.time || "00:00"}`; return k > m ? k : m; }, "");
  return completedVisits(db).filter((v) => v.key > last).length;
}

/* ============================ Autoclave ============================ */
function lastCycleNo(cycles) { return cycles.reduce((m, c) => Math.max(m, c.cycleNo || 0), 0); }
function reminderStatus(r, cycles, today, patientsDone) {
  if (r.mode === "patients") {
    const used = (patientsDone || 0) - (r.basePatients || 0);
    const left = r.every - used;
    return { due: left <= 0, over: left < 0, text: left <= 0 ? (left === 0 ? "due now" : `overdue by ${-left} patients`) : `${left} patients left` };
  }
  if (r.mode === "cycles") {
    const used = lastCycleNo(cycles) - (r.baseCycle || 0);
    const left = r.every - used;
    return { due: left <= 0, over: left < 0, text: left <= 0 ? (left === 0 ? "due now" : `overdue by ${-left} cycles`) : `${left} cycles left` };
  }
  const dueOn = addDays(r.baseDate || today, r.every);
  const d = daysBetween(today, dueOn);
  return { due: d <= 0, over: d < 0, text: d < 0 ? `overdue ${-d}d` : d === 0 ? "due today" : `in ${d} days (${fmtD(dueOn)})` };
}

function Autoclave({ db, s, patch, setS }) {
  const ask = useAsk();
  const nextNo = lastCycleNo(db.cycles) + 1;
  const blank = () => ({ date: todayStr(), time: nowHM(), cycleNo: nextNo, program: "Wrapped instruments", temp: "134", pressure: "", mins: "", bi: "na", operator: "", notes: "", checks: {} });
  const [v, setV] = useState(blank);
  const [msg, setMsg] = useState("");
  const [newItem, setNewItem] = useState("");
  const [nr, setNr] = useState({ label: "", mode: "patients", every: 18 });
  const today = todayStr();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const cycles = [...db.cycles].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const month = today.slice(0, 7);
  const lastBI = cycles.find((c) => c.bi === "pass" || c.bi === "fail");

  function save(e) {
    e.preventDefault();
    const no = Number(v.cycleNo);
    if (db.cycles.some((c) => c.cycleNo === no)) { ask(`Cycle number ${no} is already logged. Save anyway?`, () => commit(no)); return; }
    commit(no);
  }
  function commit(no) {
    const checks = db.checklist.map((i) => ({ label: i.label, ok: !!v.checks[i.id] }));
    patch("cycles", (a) => [...a, { ...v, id: uid(), cycleNo: no, checks }]);
    setV({ ...blank(), cycleNo: no + 1 });
    setMsg(`Cycle ${no} logged.`);
  }
  const addReminder = (r) => patch("acReminders", (a) => [...a, { ...r, id: uid(), baseDate: today, baseCycle: lastCycleNo(db.cycles), basePatients: completedVisits(db).length }]);
  const csv = () => {
    const q = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const rows = [["Date", "Time", "Cycle no", "Program", "Temp C", "Pressure", "Minutes", "BI test", "Operator", "Checklist done", "Missed items", "Notes"].map(q).join(",")];
    [...cycles].reverse().forEach((c) => { const ch = c.checks || []; rows.push([c.date, c.time, c.cycleNo, c.program, c.temp, c.pressure, c.mins, c.bi, c.operator, `${ch.filter((x) => x.ok).length}/${ch.length}`, ch.filter((x) => !x.ok).map((x) => x.label).join("; "), c.notes].map(q).join(",")); });
    download("autoclave-log.csv", "﻿" + rows.join("\n"), "text/csv");
  };
  const staffMsg = (r, st) => waLink(s.staffPhone, `Autoclave reminder (${s.clinic || "clinic"}): ${r.label} is ${st.text}.`, s.cc);

  return (
    <div>
      <h2>Autoclave sterilization</h2>
      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card"><div className="stat">{db.cycles.length}</div>Cycles logged</div>
        <div className="card"><div className="stat">{lastCycleNo(db.cycles)}</div>Last cycle number</div>
        <div className="card"><div className="stat">{db.cycles.filter((c) => c.date.startsWith(month)).length}</div>Cycles this month</div>
        <div className="card"><div className="stat" style={{ fontSize: 18 }}>{lastBI ? `${lastBI.bi.toUpperCase()} · ${fmtD(lastBI.date)}` : "—"}</div>Last spore (BI) test</div>
      </div>

      <div className="card">
        <h3>Reminders</h3>
        {!db.acReminders.length ? <Empty>No reminders. Add your own below, or load the suggested set.</Empty> : db.acReminders.map((r) => {
          const st = reminderStatus(r, db.cycles, today, completedVisits(db).length);
          return (
            <div key={r.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line2)" }}>
              <b className="sp" style={{ minWidth: 180 }}>{r.label}</b>
              <span className="muted">every {r.every} {r.mode}</span>
              <span className={"tag " + (st.over ? "r" : st.due ? "y" : "g")}>{st.text}</span>
              {st.due && s.staffPhone && <a className="btn wa sm" style={{ textDecoration: "none" }} href={staffMsg(r, st)} target="_blank" rel="noreferrer">Send to staff</a>}
              <button className="btn sm" onClick={() => patch("acReminders", (a) => a.map((x) => (x.id === r.id ? { ...x, baseDate: today, baseCycle: lastCycleNo(db.cycles), basePatients: completedVisits(db).length } : x)))}>Mark done</button>
              <button className="btn red sm" aria-label="remove reminder" onClick={() => patch("acReminders", (a) => a.filter((x) => x.id !== r.id))}>✕</button>
            </div>);
        })}
        <div className="row" style={{ marginTop: 10 }}>
          <input style={{ flex: "2 1 180px", width: "auto" }} placeholder="New reminder, e.g. Replace filter" value={nr.label} onChange={(e) => setNr({ ...nr, label: e.target.value })} />
          <span>every</span>
          <input type="number" min="1" style={{ width: 80 }} value={nr.every} onChange={(e) => setNr({ ...nr, every: Math.max(1, +e.target.value || 1) })} aria-label="interval" />
          <select style={{ width: 110 }} value={nr.mode} onChange={(e) => setNr({ ...nr, mode: e.target.value })} aria-label="unit"><option value="patients">patients</option><option value="days">days</option><option value="cycles">cycles</option></select>
          <button className="btn sm" disabled={!nr.label.trim()} onClick={() => { addReminder({ ...nr, label: nr.label.trim() }); setNr({ label: "", mode: "patients", every: 18 }); }}>Add</button>
          {!db.acReminders.length && <button className="btn sec sm" onClick={() => SUGGEST_REM.forEach(addReminder)}>Load suggested reminders</button>}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>Due items show on the Today screen and the Autoclave tab badge while the app is open. "Send to staff" opens WhatsApp to the staff number in Settings.</div>
      </div>

      <div className="card">
        <h3>Log a cycle</h3>
        <form onSubmit={save}>
          <div className="grid">
            <F l="Date"><input type="date" required value={v.date} onChange={set("date")} /></F>
            <F l="Time"><input type="time" required value={v.time} onChange={set("time")} /></F>
            <F l="Cycle no."><input type="number" min="1" required value={v.cycleNo} onChange={set("cycleNo")} /></F>
            <F l="Program / load"><input value={v.program} onChange={set("program")} /></F>
            <F l="Temp (°C)"><input value={v.temp} onChange={set("temp")} inputMode="decimal" /></F>
            <F l="Pressure"><input value={v.pressure} onChange={set("pressure")} placeholder="e.g. 2.1 bar" /></F>
            <F l="Hold time (min)"><input value={v.mins} onChange={set("mins")} inputMode="numeric" /></F>
            <F l="Spore (BI) test"><select value={v.bi} onChange={set("bi")}><option value="na">Not done this cycle</option><option value="pass">Pass</option><option value="fail">FAIL</option></select></F>
            <F l="Operator"><input value={v.operator} onChange={set("operator")} /></F>
          </div>
          <label className="f" style={{ marginTop: 12 }}>Checklist</label>
          {!db.checklist.length ? <div className="muted">No checklist yet. Add items below (your own or the suggested set).</div> :
            db.checklist.map((i) => <label key={i.id} style={{ display: "block", padding: "3px 0" }}><input type="checkbox" checked={!!v.checks[i.id]} onChange={(e) => setV({ ...v, checks: { ...v.checks, [i.id]: e.target.checked } })} /> {i.label}</label>)}
          <F l="Notes" style={{ marginTop: 10 }}><input value={v.notes} onChange={set("notes")} /></F>
          <div className="row" style={{ marginTop: 10 }}><button className="btn" type="submit">Save cycle</button><span className="muted">{msg}</span></div>
        </form>
        <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Edit checklist items ({db.checklist.length})</summary>
          {db.checklist.map((i) => <div key={i.id} className="row" style={{ padding: "3px 0" }}><span className="sp">{i.label}</span><button className="btn red sm" aria-label="remove item" onClick={() => patch("checklist", (a) => a.filter((x) => x.id !== i.id))}>✕</button></div>)}
          <div className="row" style={{ marginTop: 6 }}>
            <input style={{ flex: "1 1 220px", width: "auto" }} placeholder="New checklist item" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="btn sm" disabled={!newItem.trim()} onClick={() => { patch("checklist", (a) => [...a, { id: uid(), label: newItem.trim() }]); setNewItem(""); }}>Add item</button>
            {!db.checklist.length && <button className="btn sec sm" onClick={() => patch("checklist", () => SUGGEST_CHECK.map((label) => ({ id: uid(), label })))}>Load suggested checklist</button>}
          </div>
        </details>
      </div>

      <div className="card">
        <div className="row"><h3 className="sp">Cycle history</h3><button className="btn sec sm" disabled={!cycles.length} onClick={csv}>Export CSV</button><button className="btn sec sm noprint" onClick={() => window.print()}>Print</button></div>
        {!cycles.length ? <Empty>No cycles logged yet.</Empty> : <div className="tw"><table><thead><tr><th>#</th><th>Date</th><th>Program</th><th>Temp / min</th><th>BI</th><th>Checklist</th><th>Operator</th><th></th></tr></thead>
          <tbody>{cycles.map((c) => { const ch = c.checks || []; const ok = ch.filter((x) => x.ok).length; return (
            <tr key={c.id}><td>{c.cycleNo}</td><td>{fmtD(c.date)}<div className="muted">{fmt12(c.time)}</div></td><td>{c.program}</td><td>{c.temp}°{c.mins ? ` / ${c.mins}` : ""}{c.pressure ? ` · ${c.pressure}` : ""}</td>
              <td>{c.bi === "na" ? "—" : <span className={"tag " + (c.bi === "pass" ? "g" : "r")}>{c.bi}</span>}</td>
              <td>{ch.length ? <span className={"tag " + (ok === ch.length ? "g" : "y")} title={ch.filter((x) => !x.ok).map((x) => x.label).join("\n")}>{ok}/{ch.length}</span> : "—"}</td>
              <td>{c.operator}</td><td><button className="btn red sm noprint" aria-label="delete cycle" onClick={() => ask("Delete this cycle record?", () => patch("cycles", (a) => a.filter((x) => x.id !== c.id)))}>✕</button></td></tr>); })}</tbody></table></div>}
      </div>
    </div>
  );
}

/* ============================ Settings ============================ */
function SecurityCard({ db, s, setS, vaultOn, setVaultOn, onLock }) {
  const ask = useAsk();
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const good = a.length >= 10 && a === b;
  async function turnOn(change) {
    setBusy(true); setMsg("");
    try {
      const items = await xAll(); await vaultSetup(a); await saveDb(db);
      for (const x of items) await xPut(x);
      setVaultOn(true); setA(""); setB(""); setMsg(change ? "Passphrase changed." : "Encryption is on. The app will ask for the passphrase each time it opens.");
    } catch (e) { setMsg("Failed: " + e.message); }
    setBusy(false);
  }
  async function turnOff() {
    setBusy(true);
    try { const items = await xAll(); vaultClear(); await saveDb(db); for (const x of items) await xPut(x); setVaultOn(false); setMsg("Encryption is off."); }
    catch (e) { setMsg("Failed: " + e.message); }
    setBusy(false);
  }
  return (
    <div className="card" data-testid="security-card">
      <h3>Security: passphrase lock and encryption</h3>
      {!canCrypto() ? <div className="warn">Encryption needs a secure connection (https, or localhost). Open the app from an https address to turn it on.</div> : (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>{vaultOn ? "Patient records and X-rays on this device are encrypted (AES-256). They are unreadable without your passphrase." : "Turn this on so that patient records and X-rays are stored encrypted on this device, and the app locks when idle. There is no password reset: if you forget it, restore from a backup."}</div>
          <div className="grid">
            <F l={vaultOn ? "New passphrase" : "Passphrase (at least 10 characters, for example 4 unrelated words)"}><input id="sec-pass" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></F>
            <F l="Repeat passphrase"><input id="sec-pass2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></F>
          </div>
          {a && !good && <div className="muted" data-testid="sec-hint">{a.length < 10 ? "Too short: use at least 10 characters." : "The two passphrases do not match."}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" id="sec-enable" disabled={!good || busy} onClick={() => turnOn(vaultOn)}>{vaultOn ? "Change passphrase" : "Turn on encryption"}</button>
            {vaultOn && <>
              <button className="btn sec" id="sec-lock" onClick={() => onLock()}>Lock now</button>
              <button className="btn red" id="sec-disable" disabled={busy} onClick={() => ask("Turn encryption off? Patient data on this device will be stored without a passphrase.", turnOff)}>Turn off encryption</button>
              <F l="Lock after"><select id="sec-auto" value={String(s.autoLockMin === undefined ? 10 : s.autoLockMin)} onChange={(e) => setS({ autoLockMin: +e.target.value })}>
                {[["1", "1 minute idle"], ["5", "5 minutes idle"], ["10", "10 minutes idle"], ["30", "30 minutes idle"], ["0", "Never"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F></>}
          </div>
          {msg && <div className="muted" style={{ marginTop: 6 }} data-testid="sec-msg">{msg}</div>}
        </>)}
    </div>
  );
}
const SYNC_CODE = /^rd1\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{40,48})$/;
function CloudCard({ s, setS, syncSt, runSync, online, vaultOn }) {
  const ask = useAsk(); const sy = s.sync || {};
  const [server, setServer] = useState(sy.server || ""); const [code, setCode] = useState(""); const [show, setShow] = useState(false); const [msg, setMsg] = useState("");
  const codeStr = sy.id ? `rd1.${sy.id}.${sy.wkey}.${sy.ekey}` : "";
  const create = () => setS({ sync: { on: true, server: server.trim(), id: rnd(18), wkey: rnd(24), ekey: rnd(32), rev: 0 } });
  const connect = () => { const m = SYNC_CODE.exec(code.trim()); if (!m) { setMsg("That is not a valid sync code."); return; } setMsg(""); setS({ sync: { on: true, server: server.trim(), id: m[1], wkey: m[2], ekey: m[3], rev: 0 } }); setCode(""); };
  const off = (del) => ask(del ? "Delete the cloud copy and disconnect? Other devices will lose their link to it. Data on this device stays." : "Disconnect this device from the cloud backup? The cloud copy and your data here stay as they are.", async () => {
    if (del) { try { await fetch(`${backupBase(sy)}/${sy.id}`, { method: "DELETE", headers: { "x-write-key": sy.wkey } }); } catch { /* server unreachable */ } }
    setS({ sync: { on: false } });
  });
  const st = { off: "Not connected", idle: "Waiting", syncing: "Syncing…", synced: `Synced${syncSt.at ? " " + syncSt.at.toLocaleTimeString() : ""}`, offline: "Offline: changes are kept on this device and will upload when the internet returns", error: "Problem: " + syncSt.err }[syncSt.state] || "";
  return (
    <div className="card" data-testid="cloud-card">
      <h3>Encrypted cloud backup and multi-device sync</h3>
      <div className="muted" style={{ marginBottom: 8 }}>Works alongside offline use: you always work on this device and it uploads when the internet is there. Everything is encrypted on this device before it is sent, so the server only stores unreadable data. Use it to keep a safe copy online or to use RevDent on two devices (changes from both are merged). X-ray images stay on the device and are in backup files only. Needs RevDent hosted on a server (see the README); use https.</div>
      {!sy.on ? (
        <>
          <F l="Server address (blank = the site this app was opened from)"><input id="cl-server" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://your-server.example.com" /></F>
          {!vaultOn && canCrypto() && <div className="warn">Turn on the passphrase lock above first, so the sync code stored on this device is protected too.</div>}
          <div className="row" style={{ marginTop: 8 }}><button className="btn" id="cl-create" disabled={!canCrypto()} onClick={create}>Create cloud backup</button></div>
          <div className="row" style={{ marginTop: 10 }}><input id="cl-code" style={{ flex: 1, minWidth: 200 }} placeholder="Or paste a sync code from another device" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn sec" id="cl-connect" disabled={!code || !canCrypto()} onClick={connect}>Connect</button></div>
          {msg && <div className="muted" style={{ marginTop: 6 }}>{msg}</div>}
        </>
      ) : (
        <>
          <div className="row"><span className={"tag " + (syncSt.state === "synced" ? "g" : syncSt.state === "error" ? "r" : "y")} data-testid="cl-status">{st}</span>
            <button className="btn sec sm" id="cl-now" disabled={!online} onClick={runSync}>Sync now</button>
            <button className="btn sec sm" id="cl-show" onClick={() => setShow(!show)}>{show ? "Hide sync code" : "Show sync code"}</button>
            <button className="btn sec sm" onClick={() => off(false)}>Disconnect</button><button className="btn red sm" onClick={() => off(true)}>Delete cloud copy</button></div>
          {show && <div style={{ marginTop: 8, wordBreak: "break-all", fontSize: 13 }} data-testid="cl-code">{codeStr}<div className="muted">This code is the key to your data. Type or paste it on your other device under "Connect". Anyone who has it can read and change the cloud copy, so keep it private. If it is lost and this device is lost too, the cloud copy cannot be opened.</div></div>}
        </>)}
    </div>
  );
}
function Settings({ s, setS, db, setDb, xrays, setXrays, vaultOn, setVaultOn, onLock, syncSt, runSync, online }) {
  const ask = useAsk();
  const [msg, setMsg] = useState("");
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const upload = useRef(null);
  const localHost = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === "file:";
  const u = (k) => (e) => setS({ [k]: e.target.value });
  const [bpass, setBpass] = useState("");
  const [encFile, setEncFile] = useState(null); const [rpass, setRpass] = useState("");
  async function backup() {
    const payload = { v: 1, db, xrays };
    try {
      if (vault.key) return download(`revdent-backup-encrypted-${todayStr()}.json`, JSON.stringify(await sealWith(vault.key, vault.salt, vault.iter, payload)), "application/json");
      if (bpass) {
        if (bpass.length < 10 || !canCrypto()) { setMsg("Backup passphrase must be at least 10 characters (and needs a secure connection)."); return; }
        const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await deriveKey(bpass, salt, ITER);
        return download(`revdent-backup-encrypted-${todayStr()}.json`, JSON.stringify(await sealWith(key, toB64(salt), ITER, payload)), "application/json");
      }
      download(`revdent-backup-${todayStr()}.json`, JSON.stringify(payload), "application/json");
    } catch (e) { setMsg("Backup failed: " + e.message); }
  }
  function applyBackup(j) {
    if (!j.db || !Array.isArray(j.db.patients)) throw new Error("Not a RevDent backup file");
    ask("This replaces ALL current data on this device with the backup. Continue?", async () => {
      try {
        await saveDb(normalize(j.db)); await flushSave();
        for (const x of xrays) await xDel(x.id);
        for (const x of j.xrays || []) await xPut(x);
        location.reload();
      } catch (err) { setMsg("Restore failed: " + err.message); }
    });
  }
  async function restore(e) {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.enc) { setEncFile(j); setMsg("This backup is encrypted. Enter its passphrase below."); return; }
      applyBackup(j);
    } catch (err) { setMsg("Restore failed: " + err.message); }
  }
  async function openEnc() {
    try { const key = await deriveKey(rpass, fromB64(encFile.salt), encFile.iter || ITER); const j = await decJson(key, encFile); setEncFile(null); setRpass(""); setMsg(""); applyBackup(j); }
    catch { setMsg("Could not open the backup: wrong passphrase or damaged file."); }
  }
  return (
    <div>
      <h2>Settings</h2>
      <div className="card">
        <h3>Clinic</h3>
        <div className="grid">
          <F l="Clinic name (shown at the top of every page and filled into messages)"><input value={s.clinic} onChange={u("clinic")} /></F>
          <F l="Doctor name (for the greeting at the top)"><input id="set-doctor" value={s.doctor || ""} onChange={u("doctor")} /></F>
          <F l="Clinic WhatsApp number (patients reply here; autoclave reminders are sent to it)"><input value={s.phone} onChange={u("phone")} placeholder="0300 1234567" inputMode="tel" /></F>
          <F l="Staff WhatsApp (autoclave alerts)"><input value={s.staffPhone} onChange={u("staffPhone")} inputMode="tel" /></F>
          <F l="Autoclave alert after this many patients (then after every further patient)"><input id="set-acevery" type="number" min="1" value={s.acEvery || 18} onChange={(e) => setS({ acEvery: Math.max(1, parseInt(e.target.value, 10) || 18) })} /></F>
          <F l="Default country code"><input value={s.cc} onChange={u("cc")} /></F>
        </div>
        <F l="Public app URL (where patients open forms)" style={{ marginTop: 10 }}><input value={s.baseUrl} onChange={u("baseUrl")} placeholder="https://your-clinic.netlify.app/" /></F>
        {localHost && !s.baseUrl && <div className="warn" style={{ marginTop: 8 }}>You are running on {location.protocol === "file:" ? "a local file" : location.hostname}. Patients cannot open this address. Deploy the app (Netlify/Vercel/Replit) and paste its address here, or consent/form links will not work for them.</div>}
      </div>
      <div className="card">
        <div className="row"><h3 className="sp">Message templates</h3>
          <button className="btn sec sm" onClick={() => setS(TPL)}>English</button><button className="btn sec sm" onClick={() => setS(TPL_UR)}>اردو</button></div>
        <div className="muted" style={{ marginBottom: 6 }}>Variables: {"{name} {date} {time} {clinic} {phone} {consent_link} {form_link}"}</div>
        <F l="Appointment reminder"><textarea dir="auto" value={s.tplReminder} onChange={u("tplReminder")} /></F>
        <F l="Consent line (added when consent link is included)" style={{ marginTop: 8 }}><textarea dir="auto" style={{ minHeight: 50 }} value={s.tplConsent} onChange={u("tplConsent")} /></F>
        <F l="Information-form line" style={{ marginTop: 8 }}><textarea dir="auto" style={{ minHeight: 50 }} value={s.tplForm} onChange={u("tplForm")} /></F>
      </div>
      <div className="card">
        <h3>Consent form text</h3>
        <div className="muted" style={{ marginBottom: 6 }}>Shown to patients before they sign. Leave blank to use the default. Have it reviewed by your own legal/clinical adviser; the default is generic.</div>
        <textarea dir="auto" style={{ minHeight: 130 }} value={s.consentText} placeholder={DEFAULT_CONSENT} onChange={u("consentText")} />
      </div>
      <div className="card">
        <h3>Notifications</h3>
        <div className="muted" style={{ marginBottom: 6 }}>Browser alerts for due reminders only work while this page is open. Status: {notif}</div>
        <button className="btn sec sm" disabled={notif === "unsupported" || notif === "granted"} onClick={async () => setNotif(await Notification.requestPermission())}>Enable browser notifications</button>
      </div>
      <SecurityCard db={db} s={s} setS={setS} vaultOn={vaultOn} setVaultOn={setVaultOn} onLock={onLock} />
      <CloudCard s={s} setS={setS} syncSt={syncSt} runSync={runSync} online={online} vaultOn={vaultOn} />
      <div className="card">
        <h3>Backup (important)</h3>
        <div className="muted" style={{ marginBottom: 6 }}>Data lives in this browser on this device (it works with no internet). Clearing browser data deletes it, so keep a backup file or turn on the encrypted cloud backup below. Backup files include X-rays.</div>
        {!vaultOn && <F l="Backup file passphrase (optional, at least 10 characters; encrypts the file)"><input id="bk-pass" type="password" value={bpass} onChange={(e) => setBpass(e.target.value)} autoComplete="new-password" /></F>}
        {vaultOn && <div className="muted">Backup files are encrypted with your passphrase.</div>}
        <div className="row" style={{ marginTop: 6 }}><button className="btn" id="bk-export" onClick={backup}>Export backup</button>
          <button className="btn sec" onClick={() => upload.current.click()}>Restore from backup</button><input ref={upload} id="bk-file" type="file" accept=".json" hidden onChange={restore} /><span className="muted" data-testid="bk-msg">{msg}</span></div>
        {encFile && <div className="row" style={{ marginTop: 8 }}><input id="restore-pass" type="password" placeholder="Backup passphrase" value={rpass} onChange={(e) => setRpass(e.target.value)} /><button className="btn" id="restore-go" onClick={openEnc}>Decrypt and restore</button></div>}
      </div>
    </div>
  );
}

/* ============================ treatment log ============================ */
const PROCS = [
  "Consultation / examination", "Emergency visit", "Follow-up / review", "Medication / prescription only",
  "Oral prophylaxis (scaling & polishing)", "Deep cleaning (root planing)", "Fluoride application", "Pit & fissure sealant",
  "Periapical X-ray", "Bitewing X-ray", "OPG X-ray", "CBCT scan",
  "Composite filling", "Amalgam filling", "Glass ionomer filling (GIC)", "Temporary filling", "Core build-up", "Inlay / onlay",
  "Pulp capping", "Pulpotomy", "Pulpectomy", "Root canal treatment (RCT)", "RCT with infection / abscess", "RCT retreatment", "Post & core",
  "Crown (PFM)", "Crown (zirconia)", "Crown (metal)", "Crown recementation", "Bridge", "Veneer",
  "Complete denture", "Partial denture (acrylic)", "Partial denture (cast metal)", "Denture repair / reline",
  "Simple extraction", "Surgical extraction", "Impacted wisdom tooth removal", "Abscess incision & drainage", "Alveoloplasty", "Biopsy", "Suture removal",
  "Dental implant placement", "Implant crown", "Bone graft / sinus lift",
  "Gingivectomy / gingivoplasty", "Flap surgery", "Frenectomy",
  "Teeth whitening (in-office)", "Home bleaching kit", "Smile design",
  "Braces: bonding", "Braces: monthly adjustment", "Braces: removal", "Retainer", "Clear aligners", "Space maintainer",
  "Stainless steel crown (paediatric)", "Night guard / splint", "TMJ management", "Occlusal adjustment", "Tooth splinting",
];
const ARCHES = ["Upper arch", "Lower arch", "Both arches (full mouth)", "Upper right quadrant", "Upper left quadrant", "Lower right quadrant", "Lower left quadrant"];
const EXP_CATS = ["Rent", "Salaries & wages", "Dental materials & consumables", "Lab fees", "Utilities (electricity, internet)", "Equipment & maintenance", "Sterilization & infection control", "Marketing", "Licences & taxes", "Other"];
const siteText = (t) => [t.teeth && t.teeth.length ? "Tooth " + t.teeth.join(", ") : "", t.arch || ""].filter(Boolean).join(" · ") || "—";
const money = (n) => "Rs " + Math.round(n || 0).toLocaleString("en-PK");
const kfmt = (n) => {
  const t = (x) => String(+x.toFixed(1));
  return n >= 100000 ? t(n / 100000) + "L" : n >= 1000 ? t(n / 1000) + "k" : String(Math.round(n));
};
const ageYears = (dob) => { const d = new Date(dob + "T00:00"), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; };
const ageOf = (dob) => (dob ? ageYears(dob) : null);

function useVoice(lang) {
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef(null), want = useRef(false), cb = useRef(null), lastTx = useRef({ k: "", t: 0 });
  const stop = () => { want.current = false; try { rec.current && rec.current.stop(); } catch { /* ignore */ } setOn(false); setInterim(""); };
  const start = (onFinal) => {
    if (!SR) { setErr("Voice dictation is not supported in this browser. Use Chrome or Edge."); return; }
    setErr(""); cb.current = onFinal; want.current = true;
    const r = new SR();
    // Phones (Android Chrome especially) repeat earlier results in every event when continuous mode is on,
    // so there each phrase is its own short session. We also keep our own count of finished results and skip repeats.
    const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    r.continuous = !phone; r.interimResults = !phone; r.lang = lang;
    let seen = 0;
    r.onstart = () => { seen = 0; };
    r.onresult = (e) => {
      let it = "";
      for (let i = 0; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) {
          if (i < seen) continue;
          seen = i + 1;
          const tx = x[0].transcript.trim(); const key = tx.toLowerCase();
          const now = Date.now();
          if (!tx || !cb.current) continue;
          if (key === lastTx.current.k && now - lastTx.current.t < 2500) continue; // same phrase delivered twice
          lastTx.current = { k: key, t: now };
          cb.current(tx);
        } else it += x[0].transcript;
      }
      setInterim(it);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      want.current = false;
      let framed = false; try { framed = window.self !== window.top; } catch { framed = true; }
      setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? (framed ? "This page is running inside another page (a preview), and the browser does not let such pages use the microphone. Open RevDent on its own address (your own server or localhost) and it will ask for permission. You can type the note instead."
          : location.protocol === "http:" && location.hostname !== "localhost" ? "The microphone only works on a secure (https) address. Open the https version of this site, or type the note."
          : "Microphone is blocked. Click the lock or tune icon next to the address bar, set Microphone to Allow for this site, then reload. (On a phone: Settings > Site settings > Microphone.) You can type the note meanwhile.")
        : e.error === "network" ? "The speech service could not be reached (it needs an internet connection)." : "Voice error: " + e.error);
    };
    r.onend = () => {
      setInterim(""); seen = 0;
      if (want.current) setTimeout(() => { if (!want.current) return; try { r.start(); } catch { want.current = false; setOn(false); } }, 250); else setOn(false);
    };
    rec.current = r;
    try { r.start(); setOn(true); } catch (e) { want.current = false; setErr("Could not start dictation: " + e.message); }
  };
  useEffect(() => () => { want.current = false; try { rec.current && rec.current.abort(); } catch { /* ignore */ } }, []);
  return { on, interim, err, start, stop, supported: !!SR };
}

function TeethPicker({ teeth, arch, onChange }) {
  const [primary, setPrimary] = useState(() => teeth.some((x) => /^[A-T]$/.test(x)));
  const tog = (c) => onChange({ teeth: teeth.includes(c) ? teeth.filter((x) => x !== c) : [...teeth, c], arch });
  const quads = primary
    ? [["Upper right", PRIM_UPPER_R], ["Upper left", PRIM_UPPER_L], ["Lower right", PRIM_LOWER_R], ["Lower left", PRIM_LOWER_L]]
    : [["Upper right", PERM_UPPER_R], ["Upper left", PERM_UPPER_L], ["Lower right", PERM_LOWER_R], ["Lower left", PERM_LOWER_L]];
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <label className="f" style={{ margin: 0 }}>Tooth (Universal numbering)</label>
        <button type="button" className="chip" aria-pressed={primary} onClick={() => setPrimary(!primary)}>{primary ? "Showing primary teeth (A–T)" : "Show primary teeth (A–T)"}</button>
        {teeth.length > 0 && <button type="button" className="chip" onClick={() => onChange({ teeth: [], arch })}>Clear teeth</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: 8 }}>
        {quads.map(([name, list]) => (
          <div key={name}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>{name}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${list.length},minmax(0,1fr))`, gap: 3 }}>
              {list.map((c) => <button type="button" key={c} title={`Tooth ${c} (FDI ${toFDI(c)})`} aria-pressed={teeth.includes(c)} className={"chip" + (teeth.includes(c) ? " on" : "")} style={{ padding: "7px 0", fontSize: 12, borderRadius: 6, textAlign: "center" }} onClick={() => tog(c)}>{c}</button>)}
            </div>
          </div>))}
      </div>
      <div style={{ marginTop: 8 }}>
        <label className="f">Arch / quadrant (use when not a single tooth)</label>
        <select id="tx-arch" value={arch} onChange={(e) => onChange({ teeth, arch: e.target.value })}>
          <option value="">None</option>{ARCHES.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}

function TxModal({ db, patch, pById, init, onClose, s, startRx }) {
  const ask = useAsk();
  const edit = !!(init && init.id);
  const [v, setV] = useState(() => ({ patientId: "", apptId: "", date: todayStr(), procedure: "", teeth: [], arch: "", fee: "", notes: "", markDone: true, rxId: "", ...init }));
  const [lang, setLang] = useState("en-US");
  const [err, setErr] = useState("");
  const voice = useVoice(lang);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const p = pById[v.patientId];
  const myAppts = db.appts.filter((a) => a.patientId === v.patientId && a.status !== "cancelled").sort((a, b) => b.date.localeCompare(a.date));
  const appt = db.appts.find((a) => a.id === v.apptId);
  const known = useMemo(() => [...new Set([...PROCS, ...db.tx.map((t) => t.procedure)])].sort(), [db.tx]);
  const pickPatient = (e) => {
    const id = e.target.value; const t = todayStr();
    const a = db.appts.find((x) => x.patientId === id && x.date === t && x.status !== "cancelled");
    setV((x) => ({ ...x, patientId: id, apptId: a ? a.id : "", procedure: x.procedure || (a && (a.reason || (a.rct ? "Root canal treatment (RCT)" : ""))) || "" }));
  };
  const pickAppt = (e) => {
    const a = db.appts.find((x) => x.id === e.target.value);
    setV((x) => ({ ...x, apptId: e.target.value, date: a ? a.date : x.date, procedure: x.procedure || (a && (a.reason || (a.rct ? "Root canal treatment (RCT)" : ""))) || "" }));
  };
  const dictate = () => voice.on ? voice.stop() : voice.start((text) => setV((x) => ({ ...x, notes: (x.notes ? x.notes.replace(/\s+$/, "") + " " : "") + text })));
  function save(e) {
    e.preventDefault();
    if (!v.patientId) return setErr("Choose a patient.");
    if (!v.procedure.trim()) return setErr("Enter or choose a procedure.");
    const fee = Math.max(0, Number(v.fee) || 0);
    const rec = { id: v.id || uid(), patientId: v.patientId, apptId: v.apptId || "", date: v.date, procedure: v.procedure.trim(), teeth: v.teeth, arch: v.arch, fee, notes: v.notes, createdAt: v.createdAt || new Date().toISOString(), rct: (appt && appt.rct) || v.rct || null, ...(edit ? { rxSentAt: v.rxSentAt, rxTemplateId: v.rxTemplateId, rxSnapshot: v.rxSnapshot, rxSent: v.rxSent } : {}) };
    patch("tx", (a) => (edit ? a.map((x) => (x.id === rec.id ? rec : x)) : [...a, rec]));
    if (!edit && v.markDone && appt && appt.status === "scheduled") patch("appts", (as) => as.map((a) => (a.id === appt.id ? { ...a, status: "done" } : a)));
    voice.stop(); onClose();
    if (!edit && v.rxId !== "none") {
      const tp = v.rxId === "__manual" ? { id: "__manual" } : v.rxId ? (s.rxTemplates || []).find((x) => x.id === v.rxId) : (s.autoRx !== false ? matchRx(rec.procedure, s.rxTemplates) : null);
      if (tp && p) startRx([{ p, tx: rec, tplId: tp.id }]);
    }
  }
  const remove = () => ask("Delete this treatment record?", () => { patch("tx", (a) => a.filter((x) => x.id !== v.id)); onClose(); });
  const close = () => { voice.stop(); onClose(); };
  return (
    <Modal onClose={close}>
      <div className="row"><h2 className="sp">{edit ? "Edit treatment record" : "Log treatment"}</h2><button type="button" className="btn sec sm" onClick={close}>Close</button></div>
      <form onSubmit={save}>
        <div className="grid">
          <F l="Patient *"><select id="tx-patient" value={v.patientId} onChange={pickPatient} disabled={edit}><option value="">Select…</option>{db.patients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></F>
          <F l="Linked appointment"><select id="tx-appt" value={v.apptId} onChange={pickAppt} disabled={!v.patientId}>
            <option value="">None / walk-in</option>{myAppts.map((a) => <option key={a.id} value={a.id}>{fmtD(a.date)} {fmt12(a.time)}{a.reason ? " · " + a.reason : ""}</option>)}</select></F>
          <F l="Date of procedure *"><input id="tx-date" type="date" required value={v.date} onChange={set("date")} /></F>
        </div>
        {p && (
          <div className="card" style={{ margin: "10px 0", background: "var(--bg)" }}>
            <div className="grid" style={{ fontSize: 13 }}>
              <div><div className="muted">Patient</div><b>{p.name}</b> · {ageOf(p.dob) != null ? ageOf(p.dob) + " y " : ""}{p.gender}</div>
              <div><div className="muted">Phone</div>{p.phone}</div>
              <div><div className="muted">Appointment</div>{appt ? `${fmtD(appt.date)} ${fmt12(appt.time)} · ${appt.status}` : "—"}</div>
              <div><div className="muted">Reason booked</div>{appt?.reason || "—"}{appt?.rct && <> <span className="tag y">{rctTag(appt)}</span></>}</div>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}><span className="muted">Chief complaint: </span>{p.complaint || "—"}</div>
            {edit && <RxHistory tx={v} />}
            <div style={{ fontSize: 13 }}><span className="muted">Medical alerts: </span>{[(p.conditions || []).join(", "), p.allergies && "Allergies: " + p.allergies, p.meds && "Meds: " + p.meds].filter(Boolean).join(" · ") || "None recorded"}</div>
          </div>
        )}
        <div className="grid" style={{ marginTop: 10 }}>
          <F l="Procedure * (pick a suggestion or type your own)">
            <input id="tx-proc" list="proc-list" value={v.procedure} onChange={set("procedure")} placeholder="Start typing, e.g. Composite filling" autoComplete="off" />
            <datalist id="proc-list">{known.map((n) => <option key={n} value={n} />)}</datalist>
          </F>
          <F l="Fee charged (Rs)"><input id="tx-fee" type="number" min="0" step="50" inputMode="numeric" value={v.fee} onChange={set("fee")} placeholder="0" /></F>
        </div>
        {!edit && (() => { const at = matchRx(v.procedure, s.rxTemplates); const sg = suggestRx(v.procedure, s.rxTemplates); const rest = (s.rxTemplates || []).filter((x) => !sg.includes(x)); return (
          <F l="Prescription message to send after saving" style={{ marginTop: 10 }}><select id="tx-rx" value={v.rxId} onChange={set("rxId")}>
            <option value="">{s.autoRx === false ? "Automatic is switched off in Prescriptions" : at ? `Automatic: ${at.name}` : "Automatic (no template matches this procedure)"}</option>
            <option value="none">Do not send one</option>
            <option value="__manual">Write my own medicines…</option>
            {sg.length > 0 && <optgroup label="Suggested for this treatment">{sg.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
            <optgroup label="All templates">{rest.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup></select>
            {at && !v.rxId && at.items.length > 0 && <div className="muted" data-testid="rx-suggest">Suggested medicines: {at.items.map((i) => i.drug).join("; ")}. You can review and change them before sending.</div>}</F>); })()}
        <div style={{ marginTop: 10 }}><TeethPicker teeth={v.teeth} arch={v.arch} onChange={(o) => setV((x) => ({ ...x, ...o }))} /></div>
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ marginBottom: 4 }}>
            <label className="f sp" style={{ margin: 0 }}>Procedure notes</label>
            <select aria-label="Dictation language" style={{ width: "auto" }} value={lang} onChange={(e) => setLang(e.target.value)} disabled={voice.on}>
              <option value="en-US">English</option><option value="ur-PK">اردو (Urdu)</option>
            </select>
            <button type="button" id="tx-dictate" className={"btn sm" + (voice.on ? " red" : "")} onClick={dictate}>{voice.on ? "■ Stop dictation" : "● Dictate"}</button>
          </div>
          <textarea id="tx-notes" dir="auto" style={{ minHeight: 130 }} value={v.notes} onChange={set("notes")} placeholder="Type, or press Dictate and speak. e.g. LA given, caries removed, composite placed, occlusion checked." />
          {voice.on && <div className="muted" style={{ marginTop: 4 }}>● Listening… {voice.interim && <i dir="auto">{voice.interim}</i>}</div>}
          {voice.err && <div className="warn" style={{ marginTop: 6 }}>{voice.err}</div>}
          {!voice.supported && <div className="muted" style={{ marginTop: 4 }}>Dictation needs Chrome or Edge. You can still type.</div>}
        </div>
        {!edit && appt && appt.status === "scheduled" && <label style={{ display: "block", marginTop: 10 }}><input type="checkbox" checked={v.markDone} onChange={(e) => setV({ ...v, markDone: e.target.checked })} /> Mark this appointment as done</label>}
        {err && <div className="warn" style={{ marginTop: 10 }}>{err}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" type="submit">Save record</button>
          <button type="button" className="btn sec" onClick={close}>Cancel</button>
          <div className="sp" />{edit && <button type="button" className="btn red" onClick={remove}>Delete</button>}
        </div>
      </form>
    </Modal>
  );
}

function TxLog({ db, pById, openTx, startRx, s }) {
  const [pid, setPid] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const apptById = useMemo(() => Object.fromEntries(db.appts.map((a) => [a.id, a])), [db.appts]);
  const list = db.tx.filter((t) => (!pid || t.patientId === pid) && (!from || t.date >= from) && (!to || t.date <= to) &&
    (!q || (t.procedure + " " + t.notes + " " + siteText(t) + " " + (pById[t.patientId]?.name || "")).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const total = list.reduce((m, t) => m + t.fee, 0);
  const csv = () => {
    const qq = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const rows = [["Date", "Patient", "Phone", "Appointment", "Procedure", "Tooth / arch", "Fee", "Notes"].map(qq).join(",")];
    list.forEach((t) => { const p = pById[t.patientId] || {}; const a = apptById[t.apptId]; rows.push([t.date, p.name, p.phone, a ? `${a.date} ${a.time}` : "", t.procedure, siteText(t), t.fee, t.notes].map(qq).join(",")); });
    download("treatment-log.csv", "﻿" + rows.join("\n"), "text/csv");
  };
  return (
    <div>
      <div className="row"><h2 className="sp">Treatment log ({db.tx.length})</h2>
        <button className="btn sec" disabled={!list.length} onClick={csv}>Export CSV</button>
        <button className="btn" onClick={() => openTx({})} disabled={!db.patients.length}>+ Log treatment</button></div>
      {!db.patients.length && <div className="warn">Add a patient first, then log their treatment here.</div>}
      <div className="card" style={{ marginTop: 10 }}>
        <div className="grid">
          <F l="Patient"><select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All patients</option>{db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
          <F l="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></F>
          <F l="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></F>
          <F l="Search procedure / notes"><input value={q} onChange={(e) => setQ(e.target.value)} /></F>
        </div>
      </div>
      <div className="card tw">
        {!list.length ? <Empty>{db.tx.length ? "No records match these filters." : "No treatments logged yet. Use + Log treatment, or the Log treatment button on an appointment."}</Empty> : (
          <table><thead><tr><th>Date</th><th>Patient</th><th>Appointment</th><th>Procedure</th><th>Tooth / arch</th><th style={{ textAlign: "right" }}>Fee</th><th>Notes</th><th></th></tr></thead>
            <tbody>{list.map((t) => { const p = pById[t.patientId]; const a = apptById[t.apptId]; return (
              <tr key={t.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtD(t.date)}</td>
                <td><b>{p?.name || "(deleted)"}</b><div className="muted">{[ageOf(p?.dob) != null ? ageOf(p.dob) + " y" : "", p?.phone].filter(Boolean).join(" · ")}</div>{p?.complaint && <div className="muted">CC: {p.complaint}</div>}</td>
                <td>{a ? <>{fmtD(a.date)}<div className="muted">{fmt12(a.time)}{a.reason ? " · " + a.reason : ""}</div></> : <span className="muted">Walk-in</span>}</td>
                <td>{t.procedure}{t.rct && <> <span className="tag y">RCT {t.rct.day}{t.rct.of ? "/" + t.rct.of : ""}</span></>}<RxHistory tx={t} /></td><td>{siteText(t)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(t.fee)}</td>
                <td style={{ minWidth: 160, maxWidth: 300 }} dir="auto">{t.notes.length > 140 ? t.notes.slice(0, 140) + "…" : t.notes}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className="btn sec sm" onClick={() => openTx(t)}>Open</button>{" "}{t.rxSentAt && <span className="tag g" title="Prescription message was opened in WhatsApp">Rx sent</span>}{" "}<button className="btn wa sm" data-rx-send={t.id} disabled={!p} onClick={() => startRx([{ p, tx: t, tplId: (matchRx(t.procedure, s.rxTemplates) || {}).id }])}>{t.rxSentAt ? "Resend Rx" : "Send Rx"}</button></td>
              </tr>); })}</tbody>
            <tfoot><tr><td colSpan={5}><b>{list.length} record(s)</b></td><td style={{ textAlign: "right" }}><b>{money(total)}</b></td><td colSpan={2} /></tr></tfoot></table>)}
      </div>
    </div>
  );
}

/* ============================ calendar + live shared schedule ============================ */

/* ---- shared-calendar edits and patient cancellation messages ---- */
async function sha256Hex(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
// Reads a patient's text and says whether it is a cancellation: "yes", "maybe" (a question, or asking to change the time) or "no".
export function detectCancel(text) {
  const t = String(text || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "no";
  if (/(don'?t|do not|dont|not|no need|mat)\b(\s+\w+){0,3}\s+cancel/.test(t) || /cancel\s+(nahi|nahin|mat)\b/.test(t)) return "no";
  const resched = /(re-?schedul|postpone|change (my|the) (appointment|time|date)|another (day|time)|different (day|time)|aage kar|date change|time change|وقت بدل|تاریخ بدل)/.test(t);
  const yes = /\b(cancel(l?ed|l?ing)?|cancle|cancl)\b/.test(t) || /(can'?t|cannot|can not|won'?t be able to|unable to|not able to) (make it|come|attend|be there|visit|reach)/.test(t) || /(nahi|nahin|nhi) (aa|a)\s?(sak|pa)/.test(t) || /(منسوخ|کینسل)/.test(t) || /نہیں آ\s?(سک|پا)/.test(t);
  if (!yes) return resched ? "maybe" : "no";
  if (resched || /\?/.test(t) || /^(can|could|may|how|what|is it|do) /.test(t)) return "maybe";
  return "yes";
}
const nextUpcoming = (db, pid, today) => db.appts.filter((a) => a.patientId === pid && a.status === "scheduled" && a.date >= today).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0] || null;
const cancelNoteOf = (a) => (a.cancelVia === "whatsapp" ? "Cancelled by patient message" : a.cancelVia === "shared" ? "Marked cancelled by " + (a.cancelledBy || "shared user") : a.cancelReason || "Cancelled");
// Applies what shared-calendar users and the WhatsApp webhook queued on the server. Safe to run twice on the same items.
export function applyActions(db, actions) {
  const today = todayStr(), cc = db.settings.cc, iso = new Date().toISOString();
  let { appts, patients } = db; let inbox = db.inbox || [];
  for (const a of actions) {
    if (a.type === "add") {
      if (appts.some((x) => x.srcId === a.id)) continue;
      const ph = normPhone(a.phone, cc), nm = a.name.trim().toLowerCase();
      let p = ph ? patients.find((x) => normPhone(x.phone, cc) === ph) : patients.find((x) => x.name.trim().toLowerCase() === nm);
      if (!p) {
        const dup = patients.some((x) => x.name.trim().toLowerCase() === nm);
        p = { id: uid(), name: a.name, phone: a.phone || "", complaint: "", conditions: [], createdAt: iso, addedVia: "shared calendar", addedBy: a.by, ...(dup ? { review: "Same name as an existing patient: check this is not a duplicate" } : {}) };
        patients = [...patients, p];
      }
      appts = [...appts, { id: uid(), patientId: p.id, date: a.date, time: a.time, reason: a.reason || "", status: "scheduled", src: "shared", addedBy: a.by, srcId: a.id, createdAt: iso }];
    } else if (a.type === "cancel") {
      appts = appts.map((x) => (x.id === a.apptId && x.status === "scheduled" ? { ...x, status: "cancelled", cancelledAt: iso, cancelReason: "Marked cancelled in the shared calendar by " + a.by, cancelVia: "shared", cancelledBy: a.by, cancelSrcId: a.id } : x));
    } else if (a.type === "inbound") {
      if (appts.some((x) => x.cancelSrcId === a.id) || inbox.some((x) => x.id === a.id)) continue;
      const v = detectCancel(a.text); if (v === "no") continue;
      const ph = normPhone(a.from, cc); const p = ph ? patients.find((x) => normPhone(x.phone, cc) === ph) : null;
      const target = v === "yes" && p ? nextUpcoming({ appts }, p.id, today) : null;
      if (target) appts = appts.map((x) => (x.id === target.id ? { ...x, status: "cancelled", cancelledAt: iso, cancelReason: "Patient cancelled by WhatsApp message", cancelVia: "whatsapp", cancelText: String(a.text).slice(0, 300), cancelSrcId: a.id } : x));
      else inbox = [...inbox, { id: a.id, from: a.from, text: a.text, at: a.at || iso, patientId: p ? p.id : "", why: v === "maybe" ? "This might be a cancellation or a request to change the time" : p ? "This patient has no upcoming appointment to cancel" : "The number does not match any patient" }];
    }
  }
  return { ...db, appts, patients, inbox };
}
const apiBase = (sh) => ((sh && sh.server ? sh.server.replace(/\/+$/, "") : "") + "/api/schedule");
const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
function buildSnapshot(db) {
  const s = db.settings, pr = (s.share && s.share.privacy) || "initial", today = todayStr();
  const from = addDays(today, -7), to = addDays(today, 180);
  const pBy = Object.fromEntries(db.patients.map((p) => [p.id, p]));
  const appts = db.appts.filter((a) => a.date >= from && a.date <= to && pBy[a.patientId]).map((a) => {
    const p = pBy[a.patientId];
    return { id: a.id, date: a.date, time: a.time || "", status: a.status, label: pr === "none" ? "Booked" : pr === "full" ? p.name : initialName(p.name), rct: a.rct || null, reason: pr === "full" ? a.reason || "" : "", src: a.src === "shared" ? "shared" : "", addedBy: a.src === "shared" ? a.addedBy || "" : "", srcId: a.srcId || "", cancelNote: a.status === "cancelled" ? cancelNoteOf(a) : "" };
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { v: 1, clinic: s.clinic || "", privacy: pr, appts };
}
const shortTime = (t) => fmt12(t).replace(" ", "").toLowerCase();
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthGrid({ ym, items, selected, onSelect, today }) {
  const [y, m] = ym.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => `${ym}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const by = {}, xs = {}; items.forEach((it) => { if (it.kind === "cancelled") xs[it.date] = (xs[it.date] || 0) + 1; else (by[it.date] = by[it.date] || []).push(it); });
  Object.values(by).forEach((l) => l.sort((a, b) => (a.time || "").localeCompare(b.time || "")));
  return (
    <div>
      <div className="cal head">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="cal" data-testid="cal-grid">
        {cells.map((d, i) => d ? (
          <button key={d} type="button" className={"d" + (d === today ? " today" : "") + (d === selected ? " sel" : "")} data-date={d} data-count={(by[d] || []).length} onClick={() => onSelect(d)} aria-label={`${fmtD(d)}, ${(by[d] || []).length} appointments`}>
            <span className="num">{+d.slice(8)}</span>
            {(by[d] || []).length > 0 && <span className="cnt">{by[d].length}</span>}
            {(by[d] || []).slice(0, 3).map((it) => <span key={it.id} className={"c" + (it.kind === "recall" ? " rc" : "") + (it.status === "done" ? " dn" : "")}>{it.kind === "recall" ? "" : shortTime(it.time) + " "}{it.label}{it.rct ? " · " + rctTag(it) : ""}</span>)}
            {(by[d] || []).length > 3 && <span className="more">+{by[d].length - 3} more</span>}
            {xs[d] > 0 && <span className="xc" data-xcount={xs[d]}>✕ {xs[d]} cancelled</span>}
          </button>
        ) : <div key={"e" + i} className="d empty" />)}
      </div>
    </div>
  );
}

function InboxCard({ db, setDb, pById }) {
  const list = db.inbox || []; const [pick, setPick] = useState({});
  if (!list.length) return null;
  const doCancel = (it) => {
    const pid = pick[it.id] || it.patientId; const a = pid ? nextUpcoming(db, pid, todayStr()) : null; if (!a) return;
    setDb((d) => ({ ...d, inbox: d.inbox.filter((x) => x.id !== it.id), appts: d.appts.map((x) => (x.id === a.id && x.status === "scheduled" ? { ...x, status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: "Patient cancelled by WhatsApp message", cancelVia: "whatsapp", cancelText: String(it.text).slice(0, 300), cancelSrcId: it.id } : x)) }));
  };
  return (
    <div className="card" data-testid="inbox-card" style={{ borderColor: "var(--yfg)" }}>
      <h3>Patient messages to check ({list.length})</h3>
      <div className="muted" style={{ marginBottom: 6 }}>These looked like cancellations but could not be cancelled automatically.</div>
      {list.map((it) => { const pid = pick[it.id] || it.patientId; const a = pid ? nextUpcoming(db, pid, todayStr()) : null; return (
        <div key={it.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line2)" }} data-inbox={it.id}>
          <div><b>{it.from}</b> <span className="muted">{it.at ? new Date(it.at).toLocaleString() : ""}</span></div>
          <div dir="auto" style={{ margin: "3px 0" }}>“{it.text}”</div>
          <div className="muted">{it.why}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <select aria-label="patient" value={pid} onChange={(e) => setPick({ ...pick, [it.id]: e.target.value })}><option value="">Choose patient…</option>{db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn red sm" data-inbox-cancel={it.id} disabled={!a} onClick={() => doCancel(it)}>{a ? `Cancel ${fmtD(a.date)} ${fmt12(a.time)}` : "No upcoming appointment"}</button>
            <button className="btn sec sm" data-inbox-dismiss={it.id} onClick={() => setDb((d) => ({ ...d, inbox: d.inbox.filter((x) => x.id !== it.id) }))}>Dismiss</button></div>
        </div>); })}
    </div>
  );
}
function PasteCancel({ db, setDb, pById }) {
  const [pid, setPid] = useState(""); const [txt, setTxt] = useState(""); const [res, setRes] = useState(null);
  const run = (force) => {
    if (!pid || !txt.trim()) return setRes({ kind: "err", msg: "Choose the patient and paste their message." });
    const a = nextUpcoming(db, pid, todayStr()); if (!a) return setRes({ kind: "err", msg: "This patient has no upcoming appointment to cancel." });
    const v = detectCancel(txt);
    if (v !== "yes" && !force) return setRes({ kind: "ask", msg: v === "maybe" ? "This may be a question or a request to change the time, not a cancellation." : "This does not look like a cancellation." });
    setDb((d) => ({ ...d, appts: d.appts.map((x) => (x.id === a.id && x.status === "scheduled" ? { ...x, status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: "Patient cancelled by WhatsApp message", cancelVia: "whatsapp", cancelText: txt.slice(0, 300) } : x)) }));
    setRes({ kind: "ok", msg: `Cancelled ${pById[pid].name}'s appointment on ${fmtD(a.date)} at ${fmt12(a.time)}. It now appears in that day's Cancelled column.` }); setTxt("");
  };
  return (
    <details className="card noprint" data-testid="paste-cancel">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Patient sent a cancellation message? Paste it here</summary>
      <div className="muted" style={{ margin: "6px 0" }}>RevDent reads the message and cancels that patient's next appointment. (Fully automatic cancelling from incoming WhatsApp replies needs the WhatsApp Business API; see the sharing section below.)</div>
      <div className="grid">
        <F l="Patient"><select id="pc-patient" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Select…</option>{db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
        <F l="Their message"><textarea id="pc-text" dir="auto" value={txt} onChange={(e) => setTxt(e.target.value)} /></F>
      </div>
      <div className="row" style={{ marginTop: 8 }}><button className="btn" id="pc-go" onClick={() => run(false)}>Check and cancel</button>
        {res && res.kind === "ask" && <button className="btn red" id="pc-force" onClick={() => run(true)}>Cancel anyway</button>}</div>
      {res && <div className={res.kind === "ok" ? "tag g" : "warn"} style={{ marginTop: 8, display: "block" }} data-testid="pc-result">{res.msg}</div>}
    </details>
  );
}
function CalendarPage({ db, pById, patch, setDb, setSend, s, setS, base, shareStatus, syncNow, openTx, shareInfo, pullNow }) {
  const today = todayStr();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [am, setAm] = useState(null);
  const shift = (n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const items = [
    ...db.appts.filter((a) => pById[a.patientId]).map((a) => ({ id: a.id, date: a.date, time: a.time, label: initialName(pById[a.patientId].name), rct: a.rct, status: a.status, kind: a.status === "cancelled" ? "cancelled" : undefined })),
    ...db.recalls.filter((r) => r.status === "pending" && pById[r.patientId]).map((r) => ({ id: "r" + r.id, date: r.dueDate, time: "", label: "↻ " + initialName(pById[r.patientId].name), kind: "recall" })),
  ];
  const byTime = (a, b) => (a.time || "").localeCompare(b.time || "");
  const dayAppts = db.appts.filter((a) => a.date === sel && a.status !== "cancelled" && pById[a.patientId]).sort(byTime);
  const dayCancelled = db.appts.filter((a) => a.date === sel && a.status === "cancelled" && pById[a.patientId]).sort(byTime);
  const dayRecalls = db.recalls.filter((r) => r.dueDate === sel && r.status === "pending" && pById[r.patientId]);
  const restore = (id) => setDb((d) => ({ ...d, appts: d.appts.map((x) => (x.id === id ? { ...x, status: "scheduled", restoredAt: new Date().toISOString() } : x)) }));
  const [y, m] = ym.split("-").map(Number);
  return (
    <div>
      <div className="row"><h2 className="sp">Calendar</h2><button className="btn" onClick={() => setAm({ date: sel })} disabled={!db.patients.length}>+ Book on {fmtD(sel)}</button></div>
      <InboxCard db={db} setDb={setDb} pById={pById} />
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn sec sm" aria-label="previous month" onClick={() => shift(-1)}>‹</button>
          <b className="sp" style={{ textAlign: "center", fontSize: 17 }} data-testid="cal-title">{MON[m - 1]} {y}</b>
          <button className="btn sec sm" aria-label="next month" onClick={() => shift(1)}>›</button>
          <button className="btn sec sm" onClick={() => { setYm(today.slice(0, 7)); setSel(today); }}>Today</button>
        </div>
        <MonthGrid ym={ym} items={items} selected={sel} onSelect={(d) => { setSel(d); if (d.slice(0, 7) !== ym) setYm(d.slice(0, 7)); }} today={today} />
        <div className="muted" style={{ marginTop: 6 }}>Chips show time, patient and RCT sitting (for example RCT 2/3). A ↻ marks a recall due that day. Cancelled appointments leave the chips and are listed in the Cancelled column of that day.</div>
      </div>
      <div className="card" data-testid="cal-day">
        <h3>{new Date(sel + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
        <div className="dayc">
          <div data-testid="cal-scheduled">
            <div className="muted"><b>Scheduled ({dayAppts.length})</b></div>
            {!dayAppts.length && !dayRecalls.length ? <Empty>Nothing scheduled.</Empty> : (
              <div className="tw"><table><tbody>
                {dayAppts.map((a) => { const p = pById[a.patientId]; return (
                  <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}><b>{fmt12(a.time)}</b></td>
                    <td><b>{p.name}</b><div className="muted">{p.phone}</div></td>
                    <td>{a.reason}{a.rct && <> <span className="tag y">{rctTag(a)}</span></>}{a.src === "shared" && <> <span className="tag" title="Booked by someone using the shared calendar">Added by {a.addedBy}</span></>}</td>
                    <td><span className={"tag " + (a.status === "done" ? "g" : "")}>{a.status}</span></td>
                    <td style={{ textAlign: "right", minWidth: 120 }}>
                      <button className="btn sec sm" onClick={() => setAm(a)}>Edit</button>{" "}
                      <button className="btn wa sm" onClick={() => setSend({ mode: "appt", recips: [{ p, a }] })}>Remind</button>{" "}
                      <button className="btn sec sm" onClick={() => openTx({ patientId: p.id, apptId: a.id, date: a.date, procedure: a.reason || (a.rct ? "Root canal treatment (RCT)" : "") })}>Log treatment</button></td></tr>); })}
                {dayRecalls.map((r) => { const p = pById[r.patientId]; return (
                  <tr key={r.id}><td>↻</td><td><b>{p.name}</b><div className="muted">{p.phone}</div></td><td>Recall due: {r.reason || "check-up"}</td><td><span className="tag y">recall</span></td>
                    <td style={{ textAlign: "right" }}><button className="btn wa sm" onClick={() => setSend({ mode: "recall", recips: [{ p, recall: { kind: "manual", rec: r, date: r.dueDate, reason: r.reason } }] })}>Remind</button></td></tr>); })}
              </tbody></table></div>)}
          </div>
          <div data-testid="cal-cancelled">
            <div className="muted"><b>Cancelled ({dayCancelled.length})</b></div>
            {!dayCancelled.length ? <Empty>No cancellations.</Empty> : dayCancelled.map((a) => { const p = pById[a.patientId]; return (
              <div key={a.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line2)" }} data-cancelled={a.id}>
                <b>{fmt12(a.time)}</b> · {p.name}{a.rct && <> <span className="tag y">{rctTag(a)}</span></>}
                <div className="muted" title={a.cancelText || ""}>{cancelNoteOf(a)}{a.cancelledAt ? " · " + new Date(a.cancelledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</div>
                {a.cancelText && <div className="muted" dir="auto" style={{ fontStyle: "italic" }}>“{a.cancelText}”</div>}
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn wa sm" onClick={() => setSend({ mode: "rebook", recips: [{ p, a }] })}>{a.rebookSentAt ? "Rebook message again" : "Ask to rebook"}</button>
                  <button className="btn sec sm" data-restore={a.id} onClick={() => restore(a.id)}>Restore</button></div>
              </div>); })}
          </div>
        </div>
      </div>
      <PasteCancel db={db} setDb={setDb} pById={pById} />
      <SharePanel db={db} s={s} setS={setS} base={base} shareStatus={shareStatus} syncNow={syncNow} shareInfo={shareInfo} pullNow={pullNow} />
      {am && <ApptModal db={db} patch={patch} init={am} onClose={() => setAm(null)} />}
    </div>
  );
}

function SharePanel({ db, s, setS, base, shareStatus, syncNow, shareInfo, pullNow }) {
  const sh = s.share || {};
  const ask = useAsk();
  const [copied, setCopied] = useState("");
  const link = sh.id ? `${base}#/schedule?id=${sh.id}${sh.server ? "&api=" + encodeURIComponent(sh.server) : ""}` : "";
  const editLink = link && sh.edit && sh.editKey ? `${link}${link.includes("?") ? "&" : "?"}e=${sh.editKey}` : "";
  const setShare = (o) => setS({ share: { ...sh, ...o } });
  const textFor = (lk, editing) => {
    if (!lk) return "";
    let t = `${s.clinic || "Clinic"} schedule (live link, always up to date${editing ? "; you can add appointments and mark cancellations" : ""}):\n${lk}`;
    if (sh.includeText && !editing) {
      const today = todayStr(); const l = buildSnapshot(db).appts.filter((a) => a.date === today && a.status !== "cancelled");
      t += `\n\nToday, ${fmtD(today)} (this list will not update after sending):\n` + (l.length ? l.map((a) => `${fmt12(a.time)} ${a.label}${a.rct ? " (" + rctTag(a) + ")" : ""}`).join("\n") : "No appointments");
    }
    return t;
  };
  const text = textFor(link, false), editText = textFor(editLink, true);
  const start = () => setShare({ id: rnd(18), key: rnd(24), on: true });
  const stop = () => ask("Stop sharing? The old links will stop working for everyone who has them.", async () => {
    try { await fetch(`${apiBase(sh)}/${sh.id}`, { method: "DELETE", headers: { "x-write-key": sh.key } }); } catch { /* server unreachable: link is still removed locally */ }
    setShare({ on: false, id: "", key: "", edit: false, editKey: "" });
  });
  const toggleEdit = (on) => setShare(on ? { edit: true, editKey: rnd(18) } : { edit: false, editKey: "" });
  const stTxt = { off: "Not sharing", syncing: "Sending the latest schedule…", live: `Live. Last sent ${shareStatus.at ? shareStatus.at.toLocaleTimeString() : ""}`, error: "Not syncing: " + (shareStatus.err || "") }[shareStatus.state];
  const origin = (sh.server || location.origin).replace(/\/+$/, "");
  return (
    <div className="card" data-testid="share-panel">
      <h3>Share this calendar on WhatsApp (live)</h3>
      <div className="muted" style={{ marginBottom: 8 }}>The message holds a link. Anyone who opens the link sees the current schedule, and it refreshes by itself when you add, move or cancel an appointment. The words already sent in WhatsApp never change; the page behind the link does.</div>
      <div className="grid">
        <F l="What others see"><select id="sh-privacy" value={sh.privacy || "initial"} onChange={(e) => setShare({ privacy: e.target.value })}>
          <option value="initial">First name and initial (Ali R.)</option><option value="full">Full name and reason</option><option value="none">Time slots only (Booked)</option></select></F>
        <F l="Sync server address (blank = this site)"><input id="sh-server" value={sh.server || ""} onChange={(e) => setShare({ server: e.target.value.trim() })} placeholder="https://your-server.example.com" /></F>
      </div>
      <label style={{ display: "block", margin: "8px 0" }}><input type="checkbox" checked={!!sh.includeText} onChange={(e) => setShare({ includeText: e.target.checked })} /> Also paste today's list as text (that part will not update)</label>
      <label style={{ display: "block", margin: "8px 0" }}><input id="sh-edit" type="checkbox" checked={!!sh.edit} onChange={(e) => toggleEdit(e.target.checked)} /> Let people with a separate <b>edit link</b> add appointments and mark them cancelled. They can never delete anything.</label>
      <div className="row">
        {!sh.on ? <button className="btn" id="sh-start" onClick={start}>Start live sharing</button> : (
          <>
            <a className="btn wa" id="sh-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share view-only link on WhatsApp</a>
            {editLink && <a className="btn wa" id="sh-wa-edit" href={`https://wa.me/?text=${encodeURIComponent(editText)}`} target="_blank" rel="noreferrer">Share edit link on WhatsApp</a>}
            {s.staffPhone && waLink(s.staffPhone, text, s.cc) && <a className="btn wa" href={waLink(s.staffPhone, text, s.cc)} target="_blank" rel="noreferrer">Send view link to staff number</a>}
            <button className="btn sec" onClick={async () => setCopied((await copyText(link)) ? "View link copied" : "Select the link below and copy it")}>Copy view link</button>
            {editLink && <button className="btn sec" id="sh-copy-edit" onClick={async () => setCopied((await copyText(editLink)) ? "Edit link copied" : "Select the link below and copy it")}>Copy edit link</button>}
            <button className="btn sec" onClick={() => { syncNow(); pullNow(); }}>Sync now</button>
            <button className="btn red" onClick={stop}>Stop sharing</button>
          </>)}
      </div>
      {sh.on && <div style={{ marginTop: 8, wordBreak: "break-all", fontSize: 13 }}><div data-testid="share-link">{link} <span className="muted">{copied}</span></div>
        {editLink && <div data-testid="share-edit-link" style={{ marginTop: 4 }}><b>Edit link:</b> {editLink}</div>}</div>}
      <div style={{ marginTop: 8 }} data-testid="share-status"><span className={"tag " + (shareStatus.state === "live" ? "g" : shareStatus.state === "error" ? "r" : "")}>{stTxt}</span>
        {sh.on && sh.edit && <span className="muted" data-testid="share-checked"> · changes from shared users are collected every few seconds while RevDent is open and online{shareInfo && shareInfo.checked ? ` (checked ${shareInfo.checked.toLocaleTimeString()}, ${shareInfo.received} received)` : ""}</span>}</div>
      {shareStatus.state === "error" && <div className="muted" style={{ marginTop: 6 }}>Live sharing needs the RevDent server running (see the README). It cannot work from a plain file or a static preview.</div>}
      {sh.edit && <div className="muted" style={{ marginTop: 6 }}>People with the edit link type their name once, then can add a patient with a date and time, or press "Mark cancelled". Their changes show up on their page as "Waiting for clinic" until RevDent, open on the clinic's device, confirms them. If RevDent is closed or offline they wait on the server. Anyone with the edit link can do this, so send it only to your own staff; switching the option off kills the link.</div>}
      <div className="muted" style={{ marginTop: 6 }}>Anyone with a link can see the schedule, so send it only to people who should. Stopping the share makes the links stop working.</div>
      {sh.on && (
        <details style={{ marginTop: 10 }} data-testid="webhook-info">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cancel automatically when a patient replies on WhatsApp (needs the WhatsApp Business API)</summary>
          <div className="muted" style={{ margin: "6px 0" }}>A website cannot read your personal WhatsApp. To cancel appointments by itself when a patient texts "cancel", connect a WhatsApp Business (Cloud API) number to your RevDent server:</div>
          <ol className="muted" style={{ marginTop: 0 }}>
            <li>On the server set the environment variables <code>WA_VERIFY_TOKEN</code> (any secret word you choose) and <code>WA_APP_SECRET</code> (your Meta app secret), then restart.</li>
            <li>In the Meta developer dashboard (WhatsApp → Configuration) set the callback URL to <code data-testid="webhook-url">{origin}/api/inbound/{sh.id}</code> and enter the same verify token. Subscribe to "messages".</li>
            <li>When a patient's text means cancel, RevDent matches their number, cancels their next appointment, and lists it under that day's Cancelled column. Unclear messages (questions, "change the time", unknown numbers) go to "Patient messages to check" for you to decide.</li>
          </ol>
          <div className="muted">Replies only reach RevDent if the patient writes to the clinic's WhatsApp Business number. Messages sent to a personal WhatsApp are not visible to the app; use "Paste it here" above for those.</div>
        </details>)}
    </div>
  );
}

function ScheduleView({ route }) {
  const q = new URLSearchParams(route.split("?")[1] || "");
  const id = q.get("id") || "", api = (q.get("api") || "").replace(/\/+$/, ""), poll = Math.max(3, +q.get("poll") || 20), eKey = q.get("e") || "";
  const today = todayStr();
  const ask = useAsk();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState(null);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [by, setByRaw] = useState(() => { try { return localStorage.getItem("revdent:viewer-name") || ""; } catch { return ""; } });
  const setBy = (v) => { setByRaw(v); try { localStorage.setItem("revdent:viewer-name", v); } catch { /* optional */ } };
  const [f, setF] = useState({ name: "", phone: "", time: "", reason: "", date: "" });
  const [fmsg, setFmsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${api}/api/schedule/${id}`, { cache: "no-store" });
      if (r.status === 404) { setData(null); setErr("gone"); return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      setData(await r.json()); setErr(""); setAt(new Date());
    } catch (e) { setErr("offline"); }
  }, [id, api]);
  useEffect(() => {
    load(); const t = setInterval(load, poll * 1000);
    const fn = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", fn);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", fn); };
  }, [load, poll]);
  const canEdit = !!(data && data.canEdit && eKey);
  const appts = data ? data.appts : [];
  const pending = data ? data.pending || [] : [];
  const srcIds = new Set(appts.map((a) => a.srcId).filter(Boolean));
  const pAdds = pending.filter((a) => a.type === "add" && !srcIds.has(a.id)).map((a) => ({ id: a.id, date: a.date, time: a.time, label: a.label, reason: a.reason, status: "scheduled", waiting: true, addedBy: a.by }));
  const pCancel = new Set(pending.filter((a) => a.type === "cancel").map((a) => a.apptId));
  const live = [...appts.filter((a) => a.status !== "cancelled" && !pCancel.has(a.id)), ...pAdds];
  const cancelled = [...appts.filter((a) => a.status === "cancelled"), ...appts.filter((a) => a.status !== "cancelled" && pCancel.has(a.id)).map((a) => ({ ...a, waiting: true, cancelNote: "Cancel sent, waiting for the clinic" }))];
  const items = [...live.map((a) => ({ id: a.id, date: a.date, time: a.time, label: a.label, rct: a.rct, status: a.status })), ...cancelled.map((a) => ({ id: "x" + a.id, date: a.date, time: a.time, label: a.label, kind: "cancelled" }))];
  const byTime = (a, b) => (a.time || "").localeCompare(b.time || "");
  const day = live.filter((a) => a.date === sel).sort(byTime), dayX = cancelled.filter((a) => a.date === sel).sort(byTime);
  const upcoming = live.filter((a) => a.date >= today && a.status !== "done").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 12);
  const [y, m] = ym.split("-").map(Number);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  async function post(body) {
    const r = await fetch(`${api}/api/schedule/${id}/act`, { method: "POST", headers: { "content-type": "application/json", "x-edit-key": eKey }, body: JSON.stringify({ id: rnd(9), by: by.trim(), ...body }) });
    if (!r.ok) { let msg = ""; try { msg = (await r.json()).error; } catch { /* none */ } throw new Error(msg || "server replied " + r.status); }
    await load();
  }
  const fdate = f.date || sel;
  const clash = f.time ? live.find((a) => a.date === fdate && a.time === f.time) : null;
  async function add(e) {
    e.preventDefault(); setFmsg(null);
    if (!by.trim()) return setFmsg({ k: "err", m: "Type your name first, so the clinic knows who added this." });
    try { await post({ type: "add", name: f.name.trim(), phone: f.phone.trim(), date: fdate, time: f.time, reason: f.reason.trim() }); setF({ name: "", phone: "", time: "", reason: "", date: "" }); setFmsg({ k: "ok", m: "Sent to the clinic. It shows below as “Waiting for clinic” until the clinic confirms it." }); }
    catch (er) { setFmsg({ k: "err", m: "Could not send: " + er.message }); }
  }
  function markCancelled(a) {
    if (!by.trim()) return setFmsg({ k: "err", m: "Type your name first (in the Add box), so the clinic knows who cancelled." });
    ask(`Mark ${fmt12(a.time)} ${a.label} as cancelled? The clinic is told straight away. You cannot undo this from here.`, async () => {
      try { await post({ type: "cancel", apptId: a.id }); setFmsg({ k: "ok", m: "Marked as cancelled. The clinic will confirm it." }); } catch (er) { setFmsg({ k: "err", m: "Could not send: " + er.message }); }
    });
  }
  const Row = ({ a, x }) => (
    <div className="row" style={{ padding: "5px 0", borderBottom: "1px solid var(--line2)", opacity: a.waiting ? 0.75 : 1 }} data-appt={a.id}>
      <b style={{ width: 76 }}>{fmt12(a.time)}</b>
      <span className="sp">{a.label}{a.reason ? ` · ${a.reason}` : ""}{a.rct ? <> <span className="tag y">{rctTag(a)}</span></> : null}
        {a.src === "shared" && a.addedBy ? <> <span className="tag">Added by {a.addedBy}</span></> : null}
        {a.waiting && !x ? <> <span className="tag y" data-testid="waiting-tag">Waiting for clinic</span></> : null}
        {x && a.cancelNote ? <div className="muted">{a.cancelNote}</div> : null}</span>
      {!x && canEdit && !a.waiting && a.status === "scheduled" && <button className="btn sec sm" data-vcancel={a.id} onClick={() => markCancelled(a)}>Mark cancelled</button>}
    </div>
  );
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="card" style={{ background: "var(--pri)", color: "#fff", borderColor: "var(--pri)" }}>
        <h2 style={{ margin: 0 }} data-testid="view-title">{data ? data.clinic || "Clinic schedule" : "Clinic schedule"}</h2>
        <div style={{ fontSize: 13, opacity: 0.9 }} data-testid="view-status">
          {err === "gone" ? "This link is not active." : at ? `Live · updated ${at.toLocaleTimeString()}${err === "offline" ? " · connection lost, showing last update" : ""}` : err === "offline" ? "Cannot reach the schedule server." : "Loading…"}
          {canEdit ? " · you can add and cancel" : ""}{" "}<button className="btn sm" style={{ background: "#fff", color: "var(--pri)" }} onClick={load}>Refresh</button>
        </div>
      </div>
      {err === "gone" && <div className="warn">This schedule link has been switched off or is wrong. Ask the clinic for a new link.</div>}
      {data && eKey && !data.canEdit && <div className="warn">Editing has been switched off for this link. You can only view.</div>}
      {data && (
        <>
          <div className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <button className="btn sec sm" aria-label="previous month" onClick={() => shift(-1)}>‹</button>
              <b className="sp" style={{ textAlign: "center", fontSize: 17 }}>{MON[m - 1]} {y}</b>
              <button className="btn sec sm" aria-label="next month" onClick={() => shift(1)}>›</button>
            </div>
            <MonthGrid ym={ym} items={items} selected={sel} onSelect={setSel} today={today} />
          </div>
          <div className="card" data-testid="view-day">
            <h3>{new Date(sel + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <div className="dayc">
              <div data-testid="view-scheduled"><div className="muted"><b>Scheduled ({day.length})</b></div>{!day.length ? <Empty>Nothing scheduled.</Empty> : day.map((a) => <Row key={a.id} a={a} />)}</div>
              <div data-testid="view-cancelled"><div className="muted"><b>Cancelled ({dayX.length})</b></div>{!dayX.length ? <Empty>No cancellations.</Empty> : dayX.map((a) => <Row key={a.id} a={a} x />)}</div>
            </div>
          </div>
          {canEdit && (
            <form className="card" onSubmit={add} data-testid="view-add">
              <h3>Add an appointment</h3>
              <div className="grid">
                <F l="Your name (so the clinic knows who added it)"><input id="v-by" value={by} onChange={(e) => setBy(e.target.value)} autoComplete="name" /></F>
                <F l="Patient name *"><input id="v-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></F>
                <F l="Patient phone (for WhatsApp reminders)"><input id="v-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></F>
                <F l="Date *"><input id="v-date" type="date" required value={fdate} onChange={(e) => setF({ ...f, date: e.target.value })} /></F>
                <F l="Time"><input id="v-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></F>
                <F l="Reason (optional)"><input id="v-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></F>
              </div>
              {clash && <div className="warn" style={{ marginTop: 8 }} data-testid="v-clash">That time is already booked ({clash.label}). You can still add it.</div>}
              <div className="row" style={{ marginTop: 8 }}><button className="btn" id="v-add" type="submit">Add appointment</button></div>
            </form>)}
          {fmsg && <div className={fmsg.k === "ok" ? "tag g" : "warn"} style={{ display: "block" }} data-testid="v-msg">{fmsg.m}</div>}
          <div className="card" data-testid="view-upcoming">
            <h3>Coming up</h3>
            {!upcoming.length ? <Empty>No upcoming appointments.</Empty> : upcoming.map((a) => <div key={a.id} style={{ padding: "3px 0", fontSize: 14 }}><b>{fmtD(a.date)}</b> {fmt12(a.time)} · {a.label}{a.rct ? ` · ${rctTag(a)}` : ""}{a.waiting ? " · waiting for clinic" : ""}</div>)}
          </div>
        </>)}
    </div>
  );
}

/* ============================ recalls ============================ */
const RECALL_REASONS = ["Check-up and cleaning", "Check-up", "Cleaning (scaling)", "Post-op review", "Ortho adjustment", "Other"];
function Recalls({ db, patch, setDb, pById, setSend, s, setS }) {
  const ask = useAsk();
  const today = todayStr();
  const [v, setV] = useState({ patientId: "", num: 6, unit: "months", from: today, dueEdit: "", reasonSel: RECALL_REASONS[0], reasonOther: "" });
  const [selDue, setSelDue] = useState({});
  const [selAll, setSelAll] = useState({});
  const [q, setQ] = useState("");
  const due = v.dueEdit || addUnit(v.from, Math.max(0, Number(v.num) || 0), v.unit);
  const reason = v.reasonSel === "Other" ? v.reasonOther.trim() : v.reasonSel;
  const setF = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value, ...(k === "num" || k === "unit" || k === "from" ? { dueEdit: "" } : {}) }));
  const manual = db.recalls.filter((r) => r.status === "pending" && pById[r.patientId]).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const mDueIds = new Set(manualDue(db, today).map((r) => r.id));
  const auto = useMemo(() => autoRecalls(db, today), [db.patients, db.appts, db.tx, db.settings.autoRecall6, db.settings.autoRecall12, db.settings.recallLead]); // eslint-disable-line
  const autoDue = auto.filter((r) => r.status === "due");
  const rows = auto.filter((r) => !q || (r.p.name + " " + (r.p.phone || "")).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.p.name.localeCompare(b.p.name));
  const chosenAll = db.patients.filter((p) => selAll[p.id]);
  const sendAuto = (list) => setSend({ mode: "recall", recips: list.map((r) => ({ p: r.p, recall: { kind: r.due.kind, date: r.due.date, last: r.last } })) });
  const setOpt = (ids, off) => patch("patients", (ps) => ps.map((p) => (ids.includes(p.id) ? { ...p, recallOptOut: off } : p)));
  const addRecall = (e) => {
    e.preventDefault();
    if (!v.patientId || !(Number(v.num) >= 0) || !due) return;
    patch("recalls", (a) => [...a, { id: uid(), patientId: v.patientId, dueDate: due, num: Number(v.num), unit: v.unit, reason: reason || "check-up", status: "pending", createdAt: new Date().toISOString() }]);
    setV((x) => ({ ...x, patientId: "", dueEdit: "" }));
  };
  const dueText = (d) => { const n = daysBetween(today, d); return n < 0 ? `overdue ${-n}d` : n === 0 ? "due today" : `in ${n} day${n === 1 ? "" : "s"}`; };
  const stTag = (r) => ({
    optout: <span className="tag">Opted out</span>, novisit: <span className="tag">No visit yet</span>, booked: <span className="tag g">Has an appointment</span>,
    due: <span className="tag y">Due now · {r.due && r.due.kind === "m12" ? "annual" : "6-month"}</span>, sent: <span className="tag g">Reminder sent</span>, upcoming: <span className="tag">Upcoming</span>,
  }[r.status]);
  return (
    <div>
      <h2>Recalls</h2>
      <div className="warn">Reminders are prepared automatically and appear here when due. Each one opens in WhatsApp for you to tap Send; the app cannot send messages on its own.</div>

      <div className="card">
        <h3>Schedule a recall</h3>
        <form onSubmit={addRecall}>
          <div className="grid">
            <F l="Patient *"><select id="rc-patient" required value={v.patientId} onChange={setF("patientId")}><option value="">Select…</option>{[...db.patients].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
            <F l="Recall after (type any number)">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="rc-num" type="number" min="0" step="1" style={{ width: 90 }} value={v.num} onChange={setF("num")} />
                <select id="rc-unit" value={v.unit} onChange={setF("unit")}><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option><option value="years">years</option></select>
              </div></F>
            <F l="Counting from"><input id="rc-from" type="date" value={v.from} onChange={setF("from")} /></F>
            <F l="Recall date (edit to override)"><input id="rc-due" type="date" value={due} onChange={(e) => setV({ ...v, dueEdit: e.target.value })} /></F>
            <F l="Reason"><select id="rc-reason" value={v.reasonSel} onChange={setF("reasonSel")}>{RECALL_REASONS.map((r) => <option key={r}>{r}</option>)}</select></F>
            {v.reasonSel === "Other" && <F l="Describe"><input id="rc-other" value={v.reasonOther} onChange={setF("reasonOther")} dir="auto" /></F>}
          </div>
          <div className="row" style={{ marginTop: 10 }}><button className="btn" type="submit" disabled={!db.patients.length}>Save recall</button><span className="muted">Recall on {fmtD(due)} · the reminder shows here {Number(s.recallLead) || 0} day(s) earlier.</span></div>
        </form>
      </div>

      <div className="card">
        <h3>Scheduled recalls ({manual.length})</h3>
        {!manual.length ? <Empty>No recalls scheduled.</Empty> : (
          <div className="tw"><table><tbody>{manual.map((r) => { const p = pById[r.patientId]; return (
            <tr key={r.id}>
              <td><b>{p.name}</b><div className="muted">{p.phone}</div></td>
              <td>{fmtD(r.dueDate)}<div className="muted">{dueText(r.dueDate)}</div></td>
              <td>{r.reason}<div className="muted">after {r.num} {r.unit}</div></td>
              <td>{r.sentAt ? <span className="tag g">Reminder sent</span> : mDueIds.has(r.id) ? <span className="tag y">Reminder due</span> : <span className="tag">Waiting</span>}</td>
              <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                <button className="btn wa sm" onClick={() => setSend({ mode: "recall", recips: [{ p, recall: { kind: "manual", rec: r, date: r.dueDate, reason: r.reason } }] })}>{r.sentAt ? "Send again" : "Send reminder"}</button>{" "}
                <button className="btn sm" onClick={() => patch("recalls", (a) => a.map((x) => (x.id === r.id ? { ...x, status: "done" } : x)))}>Done</button>{" "}
                <button className="btn red sm" aria-label="delete recall" onClick={() => ask("Delete this recall?", () => patch("recalls", (a) => a.filter((x) => x.id !== r.id)))}>✕</button></td>
            </tr>); })}</tbody></table></div>)}
      </div>

      <div className="card">
        <div className="row"><h3 className="sp">Automatic 6-month and annual recalls: due now ({autoDue.length})</h3>
          <button className="btn wa" disabled={!autoDue.length} onClick={() => sendAuto(autoDue)}>Send all due ({autoDue.length})</button>
          <button className="btn wa" disabled={!autoDue.some((r) => selDue[r.p.id])} onClick={() => sendAuto(autoDue.filter((r) => selDue[r.p.id]))}>Send selected</button></div>
        {!autoDue.length ? <Empty>No patients are due right now. Six months after a patient's last visit they appear here for a check-up and cleaning reminder; a year after, for the annual one.</Empty> : (
          <div className="tw"><table><tbody>{autoDue.map((r) => (
            <tr key={r.p.id}><td><input type="checkbox" aria-label={"select " + r.p.name} checked={!!selDue[r.p.id]} onChange={(e) => setSelDue({ ...selDue, [r.p.id]: e.target.checked })} /></td>
              <td><b>{r.p.name}</b><div className="muted">{r.p.phone}</div></td>
              <td>Last visit {fmtD(r.last)}</td><td>{r.due.kind === "m12" ? "Annual check-up & cleaning" : "6-month check-up & cleaning"}</td>
              <td style={{ textAlign: "right" }}><button className="btn wa sm" onClick={() => sendAuto([r])}>Send</button></td></tr>))}</tbody></table></div>)}
      </div>

      <div className="card">
        <h3>Who gets automatic recalls</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <label><input id="rc-on6" type="checkbox" checked={!!s.autoRecall6} onChange={(e) => setS({ autoRecall6: e.target.checked })} /> 6-month recall</label>
          <label><input id="rc-on12" type="checkbox" checked={!!s.autoRecall12} onChange={(e) => setS({ autoRecall12: e.target.checked })} /> Annual recall</label>
          <label className="row" style={{ gap: 4 }}>Show as due <input id="rc-lead" type="number" min="0" max="60" style={{ width: 70 }} value={s.recallLead} onChange={(e) => setS({ recallLead: Math.max(0, +e.target.value || 0) })} /> days early</label>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>Every patient is included unless you turn them off. Counted from the last completed visit or logged treatment. Patients who already have a future appointment are skipped.</div>
        <div className="row" style={{ marginBottom: 8 }}>
          <input style={{ flex: "1 1 200px", width: "auto" }} placeholder="Search patients…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sec sm" disabled={!chosenAll.length} onClick={() => { setOpt(chosenAll.map((p) => p.id), true); setSelAll({}); }}>Opt out selected ({chosenAll.length})</button>
          <button className="btn sec sm" disabled={!chosenAll.length} onClick={() => { setOpt(chosenAll.map((p) => p.id), false); setSelAll({}); }}>Opt in selected</button>
        </div>
        {!rows.length ? <Empty>No patients yet.</Empty> : (
          <div className="tw"><table data-testid="recall-table"><thead><tr><th><input type="checkbox" aria-label="select all" checked={rows.length > 0 && rows.every((r) => selAll[r.p.id])} onChange={(e) => setSelAll(e.target.checked ? Object.fromEntries(rows.map((r) => [r.p.id, true])) : {})} /></th>
            <th>Patient</th><th>Last visit</th><th>6-month</th><th>Annual</th><th>Status</th><th>Recalls</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.p.id} data-pid={r.p.id}>
                <td><input type="checkbox" aria-label={"choose " + r.p.name} checked={!!selAll[r.p.id]} onChange={(e) => setSelAll({ ...selAll, [r.p.id]: e.target.checked })} /></td>
                <td><b>{r.p.name}</b><div className="muted">{r.p.phone}</div></td>
                <td>{r.last ? fmtD(r.last) : "—"}</td><td>{r.m6 ? fmtD(r.m6) : "—"}</td><td>{r.m12 ? fmtD(r.m12) : "—"}</td><td>{stTag(r)}</td>
                <td><label><input type="checkbox" data-optin={r.p.id} checked={!r.p.recallOptOut} onChange={(e) => setOpt([r.p.id], !e.target.checked)} /> {r.p.recallOptOut ? "Off" : "On"}</label></td>
              </tr>))}</tbody></table></div>)}
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Recall message wording</summary>
        <div className="muted" style={{ margin: "6px 0" }}>Variables: {"{name} {clinic} {phone} {date} {reason}"}</div>
        <F l="6-month recall"><textarea dir="auto" value={s.tplRecall6} onChange={(e) => setS({ tplRecall6: e.target.value })} /></F>
        <F l="Annual recall" style={{ marginTop: 8 }}><textarea dir="auto" value={s.tplRecall12} onChange={(e) => setS({ tplRecall12: e.target.value })} /></F>
        <F l="Scheduled recall" style={{ marginTop: 8 }}><textarea dir="auto" value={s.tplRecall} onChange={(e) => setS({ tplRecall: e.target.value })} /></F>
      </details>
    </div>
  );
}

/* ============================ prescription templates ============================ */
function Prescriptions({ s, setS }) {
  const ask = useAsk();
  const list = s.rxTemplates || [];
  const [selId, setSelId] = useState(list[0] ? list[0].id : "");
  const t = list.find((x) => x.id === selId) || null;
  const [kw, setKw] = useState(t ? t.keywords.join(", ") : "");
  const [probe, setProbe] = useState("");
  useEffect(() => { setKw(t ? t.keywords.join(", ") : ""); }, [selId]); // eslint-disable-line
  const upd = (o) => setS({ rxTemplates: list.map((x) => (x.id === selId ? { ...t, ...o } : x)) });
  const setItem = (id, o) => upd({ items: t.items.map((i) => (i.id === id ? { ...i, ...o } : i)) });
  const num = (k, it) => (e) => setItem(it.id, { [k]: e.target.value === "" ? "" : Number(e.target.value) });
  const add = () => { const n = { id: uid(), name: "New template", keywords: [], items: [], note: "" }; setS({ rxTemplates: [...list, n] }); setSelId(n.id); };
  const dup = () => { const n = { ...t, id: uid(), name: t.name + " (copy)", items: t.items.map((i) => ({ ...i, id: uid() })) }; setS({ rxTemplates: [...list, n] }); setSelId(n.id); };
  const del = () => ask(`Delete the template "${t.name}"?`, () => { const rest = list.filter((x) => x.id !== selId); setS({ rxTemplates: rest }); setSelId(rest[0] ? rest[0].id : ""); });
  const restore = () => ask("Replace ALL templates with the starter set? Your changes will be lost.", () => { setS({ rxTemplates: DEFAULT_RX }); setSelId(DEFAULT_RX[0].id); });
  const hit = matchRx(probe, list);
  return (
    <div>
      <h2>Prescriptions</h2>
      <div className="warn">The starter templates are common textbook regimens meant as a starting point. <b>Review every medicine, dose and duration before you use them</b>; you are responsible for what is prescribed. The app warns when a template with an amoxicillin-type antibiotic is about to go to a patient with a recorded penicillin allergy, but it does not check other interactions.</div>
      <div className="card">
        <div className="row">
          <label><input id="rx-auto" type="checkbox" checked={s.autoRx !== false} onChange={(e) => setS({ autoRx: e.target.checked })} /> After I save a treatment, open the matching prescription message automatically</label>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>You still review it and tap Send in WhatsApp. A template is chosen by the words in the procedure name (set under Matches procedures below); you can change it in the treatment form.</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input style={{ flex: "1 1 240px", width: "auto" }} id="rx-probe" placeholder="Test: type a procedure name to see which template it uses" value={probe} onChange={(e) => setProbe(e.target.value)} />
          {probe && <span className="tag" data-testid="rx-hit">{hit ? "→ " + hit.name : "No template matches"}</span>}
        </div>
      </div>
      <div className="row" style={{ margin: "8px 0" }}>
        {list.map((x) => <button key={x.id} data-rx={x.id} className={"chip" + (x.id === selId ? " on" : "")} onClick={() => setSelId(x.id)}>{x.name}</button>)}
        <button className="chip" onClick={add}>+ New template</button>
        <button className="chip" onClick={restore}>Restore starter set</button>
      </div>
      {!t ? <Empty>No templates. Add one, or restore the starter set.</Empty> : (
        <div className="grid" style={{ alignItems: "start", gridTemplateColumns: "repeat(auto-fit,minmax(min(420px,100%),1fr))" }}>
          <div className="card">
            <F l="Template name"><input id="rx-name" value={t.name} onChange={(e) => upd({ name: e.target.value })} /></F>
            <F l="Matches procedures containing (comma separated)" style={{ marginTop: 8 }}><input id="rx-kw" value={kw} onChange={(e) => { setKw(e.target.value); upd({ keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }); }} placeholder="extraction, wisdom" /></F>
            <h3 style={{ marginTop: 14 }}>Medicines</h3>
            {!t.items.length && <Empty>No medicines yet.</Empty>}
            {t.items.map((it, n) => (
              <div key={it.id} className="card" style={{ background: "var(--bg)", padding: 10 }} data-item={n}>
                <F l="Medicine and strength"><input data-f="drug" value={it.drug} onChange={(e) => setItem(it.id, { drug: e.target.value })} /></F>
                <div className="grid" style={{ marginTop: 6, gridTemplateColumns: "repeat(auto-fit,minmax(min(100px,100%),1fr))" }}>
                  <F l="Dose each time"><input data-f="per" type="number" min="0" step="0.5" value={it.per} onChange={num("per", it)} /></F>
                  <F l="Unit"><select data-f="unit" value={it.unit} onChange={(e) => setItem(it.id, { unit: e.target.value })}>{RX_UNITS.map((u) => <option key={u}>{u}</option>)}</select></F>
                  <F l="Times a day"><input data-f="perDay" type="number" min="1" step="1" value={it.perDay} onChange={num("perDay", it)} /></F>
                  <F l="For how many days"><input data-f="days" type="number" min="1" step="1" value={it.days} onChange={num("days", it)} /></F>
                </div>
                <F l="When / how (optional)" style={{ marginTop: 6 }}><input data-f="when" value={it.when || ""} onChange={(e) => setItem(it.id, { when: e.target.value })} placeholder="after meals" /></F>
                <div className="row" style={{ marginTop: 6 }}><b data-f="qty">Quantity to dispense: {nfmt(itemQty(it))} {unitWord(it.unit, itemQty(it))}</b><div className="sp" /><button className="btn red sm" onClick={() => upd({ items: t.items.filter((i) => i.id !== it.id) })}>Remove</button></div>
              </div>))}
            <button className="btn sec sm" id="rx-add-item" onClick={() => upd({ items: [...t.items, { id: uid(), drug: "Tab. ", per: 1, unit: "tablet", perDay: 3, days: 3, when: "after meals" }] })}>+ Add medicine</button>
            <F l="Instructions for the patient" style={{ marginTop: 14 }}><textarea id="rx-note" dir="auto" style={{ minHeight: 150 }} value={t.note} onChange={(e) => upd({ note: e.target.value })} /></F>
            <div className="row" style={{ marginTop: 10 }}><button className="btn sec sm" onClick={dup}>Duplicate</button><button className="btn red sm" onClick={del}>Delete template</button></div>
          </div>
          <div className="card">
            <h3>What the patient receives</h3>
            <pre data-testid="rx-preview" dir="auto" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: 14, background: "var(--bg)", padding: 10, borderRadius: 8 }}>{buildRx(t, { name: "Sample Patient" }, { procedure: t.name, date: todayStr(), teeth: [], arch: "" }, s)}</pre>
            <F l="Closing line for all prescriptions ({phone} = clinic number)" style={{ marginTop: 10 }}><textarea id="rx-footer" dir="auto" style={{ minHeight: 60 }} value={s.rxFooter} onChange={(e) => setS({ rxFooter: e.target.value })} /></F>
          </div>
        </div>)}
    </div>
  );
}


/* ============================ odontogram (Universal numbering) ============================ */
/* Adult teeth 1-32 (1 = upper right third molar, 16 = upper left third molar, 17 = lower left third molar, 32 = lower right third molar).
   Primary teeth A-T (A = upper right second molar ... J = upper left second molar, K = lower left second molar ... T = lower right second molar). */
function toFDI(code) {
  const c = String(code);
  if (/^\d+$/.test(c)) { const u = +c; return u <= 8 ? "1" + (9 - u) : u <= 16 ? "2" + (u - 8) : u <= 24 ? "3" + (25 - u) : "4" + (u - 24); }
  const i = c.charCodeAt(0) - 64;
  if (i < 1 || i > 20) return c;
  return i <= 5 ? "5" + (6 - i) : i <= 10 ? "6" + (i - 5) : i <= 15 ? "7" + (16 - i) : "8" + (i - 15);
}
function fromFDI(f) {
  const c = String(f);
  if (!/^[1-8][1-8]$/.test(c)) return c;
  const q = +c[0], n = +c[1];
  if (q <= 4) return String(q === 1 ? 9 - n : q === 2 ? 8 + n : q === 3 ? 25 - n : 24 + n);
  const i = q === 5 ? 6 - n : q === 6 ? 5 + n : q === 7 ? 16 - n : 15 + n;
  return String.fromCharCode(64 + i);
}
const PERM_UPPER_R = ["1", "2", "3", "4", "5", "6", "7", "8"], PERM_UPPER_L = ["9", "10", "11", "12", "13", "14", "15", "16"];
const PERM_LOWER_R = ["32", "31", "30", "29", "28", "27", "26", "25"], PERM_LOWER_L = ["24", "23", "22", "21", "20", "19", "18", "17"];
const PRIM_UPPER_R = ["A", "B", "C", "D", "E"], PRIM_UPPER_L = ["F", "G", "H", "I", "J"];
const PRIM_LOWER_R = ["T", "S", "R", "Q", "P"], PRIM_LOWER_L = ["O", "N", "M", "L", "K"];
const ALL_TEETH = [...Array.from({ length: 32 }, (_, i) => String(i + 1)), ..."ABCDEFGHIJKLMNOPQRST"];
const TYPE_PERM = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar (wisdom)"];
const TYPE_PRIM = ["", "central incisor", "lateral incisor", "canine", "first molar", "second molar"];
function toothInfo(code) {
  const f = toFDI(code); const q = +f[0], n = +f[1]; const prim = q >= 5;
  const upper = q === 1 || q === 2 || q === 5 || q === 6, right = q === 1 || q === 4 || q === 5 || q === 8;
  return { fdi: f, prim, upper, right, anterior: n <= 3, name: `${upper ? "Upper" : "Lower"} ${right ? "right" : "left"} ${(prim ? TYPE_PRIM : TYPE_PERM)[n]}` };
}
const SURF_CONDS = [["caries", "Caries", "#dc2626"], ["composite", "Composite", "#2563eb"], ["amalgam", "Amalgam", "#64748b"], ["gic", "GIC", "#0891b2"], ["sealant", "Sealant", "#16a34a"], ["fracture", "Fracture", "#d97706"]];
const SURF_COLOR = Object.fromEntries(SURF_CONDS.map(([k, , c]) => [k, c]));
const SURF_LABEL = Object.fromEntries(SURF_CONDS.map(([k, l]) => [k, l]));
const WHOLE = [["", "None", ""], ["missing", "Missing / extracted", "MISS"], ["crown", "Crown", "CR"], ["rct", "Root canal treated", "RCT"], ["implant", "Implant", "IMP"], ["bridge-abut", "Bridge abutment", "BR"], ["bridge-pontic", "Bridge pontic", "PON"], ["impacted", "Impacted / unerupted", "UNER"], ["root", "Retained root", "RR"]];
const WHOLE_LABEL = Object.fromEntries(WHOLE.map(([k, l]) => [k, l])), WHOLE_BADGE = Object.fromEntries(WHOLE.map(([k, , b]) => [k, b]));
const SURF_NAME = { M: "Mesial", D: "Distal", O: "Occlusal / incisal", B: "Buccal / facial", L: "Lingual / palatal" };
const POLY = { top: "2,2 38,2 27,13 13,13", bottom: "2,38 38,38 27,27 13,27", left: "2,2 13,13 13,27 2,38", right: "38,2 27,13 27,27 38,38", center: "13,13 27,13 27,27 13,27" };

function ToothSVG({ code, data, selected, onSurface, size }) {
  const info = toothInfo(code); const s = (data && data.s) || {}; const whole = data && data.whole;
  const surf = { top: info.upper ? "B" : "L", bottom: info.upper ? "L" : "B", left: info.right ? "D" : "M", right: info.right ? "M" : "D", center: "O" };
  return (
    <svg viewBox="0 0 40 40" style={{ width: size || "100%", maxWidth: size || 46, height: "auto", display: "block", opacity: whole === "missing" ? 0.4 : 1 }} role={onSurface ? "group" : "img"} aria-label={`Tooth ${code}`}>
      {Object.entries(POLY).map(([pos, pts]) => { const sk = surf[pos]; const c = s[sk];
        return (<polygon key={pos} points={pts} data-surface={sk} data-testid={onSurface ? "surf-" + sk : undefined} style={{ fill: c ? SURF_COLOR[c] : "var(--card)", stroke: "var(--label)", strokeWidth: 1, cursor: onSurface ? "pointer" : "inherit" }}
          onClick={onSurface ? (e) => { e.stopPropagation(); onSurface(sk); } : undefined}
          tabIndex={onSurface ? 0 : undefined} role={onSurface ? "button" : undefined} aria-label={onSurface ? `${SURF_NAME[sk]}${c ? ": " + SURF_LABEL[c] : ""}` : undefined}
          onKeyDown={onSurface ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSurface(sk); } } : undefined}><title>{`${SURF_NAME[sk]}${c ? ": " + SURF_LABEL[c] : ""}`}</title></polygon>); })}
      {whole === "crown" && <rect x="1" y="1" width="38" height="38" rx="5" style={{ fill: "none", stroke: "#ca8a04", strokeWidth: 3 }} pointerEvents="none" />}
      {whole === "rct" && <line x1="20" y1="3" x2="20" y2="32" style={{ stroke: "#be123c", strokeWidth: 3 }} pointerEvents="none" />}
      {whole === "implant" && <g pointerEvents="none" style={{ stroke: "#475569", strokeWidth: 2 }}><line x1="20" y1="4" x2="20" y2="36" /><line x1="12" y1="12" x2="28" y2="12" /><line x1="12" y1="20" x2="28" y2="20" /><line x1="12" y1="28" x2="28" y2="28" /></g>}
      {(whole === "bridge-abut" || whole === "bridge-pontic") && <line x1="0" y1="20" x2="40" y2="20" style={{ stroke: "#7c3aed", strokeWidth: 3 }} pointerEvents="none" />}
      {whole === "missing" && <g pointerEvents="none" style={{ stroke: "#dc2626", strokeWidth: 3 }}><line x1="4" y1="4" x2="36" y2="36" /><line x1="36" y1="4" x2="4" y2="36" /></g>}
      {whole === "impacted" && <circle cx="20" cy="20" r="17" pointerEvents="none" style={{ fill: "none", stroke: "#0f766e", strokeWidth: 2, strokeDasharray: "4 3" }} />}
      {whole === "root" && <path d="M10 36 L20 12 L30 36 Z" pointerEvents="none" style={{ fill: "none", stroke: "#b45309", strokeWidth: 3 }} />}
      {selected && <rect x="0" y="0" width="40" height="40" rx="3" pointerEvents="none" style={{ fill: "none", stroke: "var(--acc)", strokeWidth: 3.5 }} />}
    </svg>
  );
}

function Odontogram({ p, db, patch, openTx }) {
  const [prim, setPrim] = useState(() => { const a = ageOf(p.dob); return a != null && a < 12; });
  const [sel, setSel] = useState(null);
  const [brush, setBrush] = useState("caries");
  const chart = p.chart || {};
  const myTx = db.tx.filter((t) => t.patientId === p.id);
  const treated = new Set(myTx.flatMap((t) => t.teeth || []));
  const write = (code, fn) => patch("patients", (ps) => ps.map((x) => {
    if (x.id !== p.id) return x;
    const cur = (x.chart && x.chart[code]) || {};
    const nx = fn({ ...cur, s: { ...(cur.s || {}) } });
    const ch = { ...(x.chart || {}) };
    if (!nx.whole && !Object.keys(nx.s).length && !nx.note) delete ch[code]; else ch[code] = nx;
    return { ...x, chart: ch, chartAt: new Date().toISOString() };
  }));
  const paint = (sk) => write(sel, (c) => { const s = { ...c.s }; if (brush === "clear" || s[sk] === brush) delete s[sk]; else s[sk] = brush; return { ...c, s }; });
  const quads = prim
    ? [["Upper right", PRIM_UPPER_R], ["Upper left", PRIM_UPPER_L], ["Lower right", PRIM_LOWER_R], ["Lower left", PRIM_LOWER_L]]
    : [["Upper right", PERM_UPPER_R], ["Upper left", PERM_UPPER_L], ["Lower right", PERM_LOWER_R], ["Lower left", PERM_LOWER_L]];
  const cell = (code) => {
    const d = chart[code]; const info = toothInfo(code);
    return (
      <button type="button" key={code} className={"th" + (sel === code ? " sel" : "")} data-tooth={code} title={`Tooth ${code} · ${info.name} (FDI ${info.fdi})`} aria-label={`Tooth ${code}, ${info.name}`} aria-pressed={sel === code} onClick={() => setSel(code)}>
        <span className="n">{code}{treated.has(code) && <span title="Treatment logged" style={{ color: "var(--acc)" }}> ●</span>}</span>
        <ToothSVG code={code} data={d} selected={sel === code} />
        <span className="bd">{d && d.whole ? WHOLE_BADGE[d.whole] : ""}</span>
      </button>
    );
  };
  const cur = sel ? chart[sel] || {} : null; const info = sel ? toothInfo(sel) : null;
  const rows = ALL_TEETH.filter((c) => chart[c]);
  const surfText = (d) => { const g = {}; Object.entries(d.s || {}).forEach(([k, v]) => { (g[v] = g[v] || []).push(k); }); return Object.entries(g).map(([v, ks]) => `${["M", "O", "D", "B", "L"].filter((k) => ks.includes(k)).join("")} ${SURF_LABEL[v]}`).join("; "); };
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button type="button" className={"chip" + (!prim ? " on" : "")} aria-pressed={!prim} onClick={() => { setPrim(false); setSel(null); }}>Adult teeth (1–32)</button>
        <button type="button" className={"chip" + (prim ? " on" : "")} aria-pressed={prim} onClick={() => { setPrim(true); setSel(null); }}>Primary teeth (A–T)</button>
        <span className="muted sp">Universal numbering · patient's right is on the left of the chart{p.chartAt ? ` · updated ${fmtD(p.chartAt)}` : ""}</span>
      </div>
      <div className="odo" data-testid="odo">
        {quads.map(([name, list]) => (
          <div className="q" key={name}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>{name}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${list.length},minmax(0,1fr))`, gap: 2 }}>{list.map(cell)}</div>
          </div>))}
      </div>

      <div className="row" style={{ margin: "10px 0 4px" }}>
        {SURF_CONDS.map(([k, l, c]) => <span key={k} className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 11, height: 11, borderRadius: 2, background: c, display: "inline-block" }} />{l}</span>)}
        <span className="muted">· Badges: {WHOLE.filter((w) => w[2]).map((w) => `${w[2]} ${w[1].toLowerCase()}`).join(", ")}</span>
      </div>

      {sel ? (
        <div className="card" style={{ marginTop: 8, background: "var(--bg)" }} data-testid="odo-panel">
          <div className="row"><h3 className="sp" style={{ margin: 0 }}>Tooth {sel} · {info.name} <span className="muted">(FDI {info.fdi})</span></h3><button type="button" className="btn sec sm" onClick={() => setSel(null)}>Close</button></div>
          <div className="grid" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))" }}>
            <div>
              <label className="f">Paint a surface (choose a condition, then tap a surface)</label>
              <div className="row" style={{ marginBottom: 8 }}>
                {SURF_CONDS.map(([k, l, c]) => <button type="button" key={k} data-brush={k} aria-pressed={brush === k} className={"chip" + (brush === k ? " on" : "")} onClick={() => setBrush(k)}><i style={{ width: 9, height: 9, borderRadius: 2, background: c, display: "inline-block", marginRight: 5 }} />{l}</button>)}
                <button type="button" data-brush="clear" aria-pressed={brush === "clear"} className={"chip" + (brush === "clear" ? " on" : "")} onClick={() => setBrush("clear")}>Erase</button>
              </div>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div style={{ width: 130, flex: "none" }}><ToothSVG code={sel} data={cur} onSurface={paint} size={130} /></div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {["M", "D", "O", "B", "L"].map((k) => <div key={k}><b>{k}</b> {SURF_NAME[k]}: {(cur.s && cur.s[k]) ? SURF_LABEL[cur.s[k]] : "—"}</div>)}
                </div>
              </div>
            </div>
            <div>
              <F l="Whole-tooth status"><select id="odo-whole" value={cur.whole || ""} onChange={(e) => write(sel, (c) => ({ ...c, whole: e.target.value }))}>{WHOLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
              <F l="Note for this tooth" style={{ marginTop: 8 }}><input id="odo-note" dir="auto" value={cur.note || ""} onChange={(e) => write(sel, (c) => ({ ...c, note: e.target.value }))} placeholder="e.g. sensitive to cold, mobile grade 1" /></F>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn sm" onClick={() => openTx({ patientId: p.id, teeth: [sel] })}>+ Log treatment on tooth {sel}</button>
                <button type="button" className="btn sec sm" onClick={() => write(sel, () => ({ s: {}, whole: "", note: "" }))}>Clear tooth</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="muted">Treatment history on this tooth</div>
            {(() => { const h = myTx.filter((t) => (t.teeth || []).includes(sel)).sort((a, b) => b.date.localeCompare(a.date));
              return !h.length ? <div className="muted">None logged.</div> : h.map((t) => <div key={t.id} style={{ fontSize: 13 }}>{fmtD(t.date)} · {t.procedure} · {money(t.fee)}</div>); })()}
          </div>
        </div>
      ) : <div className="muted" style={{ marginTop: 6 }}>Tap a tooth to chart its surfaces and condition.</div>}

      <details style={{ marginTop: 10 }} open={rows.length > 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Charted findings ({rows.length})</summary>
        {!rows.length ? <Empty>Nothing charted yet.</Empty> : <div className="tw"><table><thead><tr><th>Tooth</th><th>Status</th><th>Surfaces</th><th>Note</th></tr></thead>
          <tbody>{rows.map((c) => { const d = chart[c]; const i = toothInfo(c); return (
            <tr key={c} style={{ cursor: "pointer" }} onClick={() => { setPrim(i.prim); setSel(c); }}>
              <td><b>{c}</b><div className="muted">{i.name} · FDI {i.fdi}</div></td><td>{d.whole ? WHOLE_LABEL[d.whole] : "—"}</td><td>{surfText(d) || "—"}</td><td dir="auto">{d.note || ""}</td></tr>); })}</tbody></table></div>}
      </details>
    </div>
  );
}

function PatientBrief({ p, db }) {
  const today = todayStr();
  const appts = db.appts.filter((a) => a.patientId === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const next = appts.find((a) => a.status === "scheduled" && a.date >= today);
  const last = [...appts].reverse().find((a) => a.status === "done" || a.date < today);
  const alerts = [(p.conditions || []).join(", "), p.allergies && "Allergies: " + p.allergies, p.meds && "Medications: " + p.meds].filter(Boolean).join(" · ");
  const age = ageOf(p.dob);
  return (
    <div className="card">
      <div className="grid" style={{ fontSize: 14 }}>
        <div><div className="muted">Patient</div><b>{p.name}</b></div>
        <div><div className="muted">Age / gender</div>{age != null ? age + " y" : "—"} {p.gender}</div>
        <div><div className="muted">Phone</div>{p.phone}</div>
        <div><div className="muted">Next appointment</div>{next ? <b>{fmtD(next.date)} {fmt12(next.time)}</b> : "None booked"}{next && next.reason ? <div className="muted">{next.reason}</div> : null}</div>
        <div><div className="muted">Last visit</div>{last ? `${fmtD(last.date)}${last.reason ? " · " + last.reason : ""}` : "—"}</div>
        <div><div className="muted">Treatments logged</div>{db.tx.filter((t) => t.patientId === p.id).length}</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}><span className="muted">Chief complaint: </span>{p.complaint || "—"}</div>
      <div style={{ fontSize: 14 }}><span className="muted">Medical alerts: </span>{alerts ? <b>{alerts}</b> : "None recorded"}</div>
    </div>
  );
}

function OdontogramPage({ db, pById, patch, openTx }) {
  const [pid, setPid] = useState(() => (db.patients[0] ? db.patients[0].id : ""));
  const p = pById[pid] || null;
  return (
    <div>
      <h2>Odontogram</h2>
      {!db.patients.length ? <Empty>Add a patient first to start charting.</Empty> : (
        <>
          <div className="card"><F l="Patient"><select id="odo-patient" value={p ? pid : ""} onChange={(e) => setPid(e.target.value)}><option value="">Select a patient…</option>{[...db.patients].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></F></div>
          {p && <PatientBrief p={p} db={db} />}
          {p && <div className="card"><Odontogram key={p.id} p={p} db={db} patch={patch} openTx={openTx} /></div>}
        </>)}
    </div>
  );
}

/* ============================ finance ============================ */
const weekStart = (s) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const bucketKey = (s, g) => (g === "day" ? s : g === "week" ? weekStart(s) : s.slice(0, 7));
const nextKey = (k, g) => {
  if (g === "day") return addDays(k, 1);
  if (g === "week") return addDays(k, 7);
  const [y, m] = k.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const labelOf = (k, g) => (g === "month" ? `${MON[+k.slice(5, 7) - 1]} '${k.slice(2, 4)}` : `${+k.slice(8, 10)} ${MON[+k.slice(5, 7) - 1]}`);
const monthName = (k) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
function makeBuckets(from, to, g) {
  const out = []; let k = bucketKey(from, g); const end = bucketKey(to, g);
  while (k <= end && out.length < 800) { out.push(k); k = nextKey(k, g); }
  return out;
}
const sum = (a) => a.reduce((m, x) => m + x, 0);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function GroupBars({ labels, series, unitWord = "" }) {
  const n = labels.length;
  const total = sum(series.flatMap((s) => s.values));
  if (!n || !total) return <Empty>Nothing recorded in this range.</Empty>;
  const slot = Math.max(series.length * 12 + 10, 26);
  const W = Math.max(560, n * slot + 56), H = 250, ml = 46, mr = 8, mt = 10, mb = 30;
  const iw = W - ml - mr, ih = H - mt - mb;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const gw = iw / n, bw = Math.max(3, Math.min(20, (gw - 6) / series.length));
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 54))));
  const y = (v) => mt + ih - (v / max) * ih;
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>{series.map((s) => <span key={s.name} className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: 2, background: s.color, display: "inline-block" }} />{s.name}</span>)}</div>
      <div className="tw">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of ${series.map((s) => s.name).join(" and ")} by period`} style={{ width: n <= 16 ? "100%" : W, minWidth: 480, maxWidth: n <= 16 ? 900 : "none", display: "block" }}>
          {[0, 1, 2, 3, 4].map((i) => { const v = (max / 4) * i; return (
            <g key={i}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} strokeWidth="1" />
              <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--muted)" }}>{kfmt(v)}</text></g>); })}
          {labels.map((l, i) => (
            <g key={i}>
              {series.map((s, j) => { const h = (s.values[i] / max) * ih; const x = ml + i * gw + (gw - bw * series.length) / 2 + j * bw; return (
                <rect key={j} x={x} y={mt + ih - h} width={bw - 1} height={Math.max(h, s.values[i] > 0 ? 1 : 0)} rx="2" style={{ fill: s.color }}><title>{`${l} · ${s.name}: ${money(s.values[i])}`}</title></rect>); })}
              {i % step === 0 && <text x={ml + i * gw + gw / 2} y={H - 10} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>{l}</text>}
            </g>))}
        </svg>
      </div>
      {unitWord && <div className="muted">{unitWord}</div>}
    </div>
  );
}

function HBars({ rows, color = "var(--inc)", total }) {
  if (!rows.length) return <Empty>Nothing recorded in this range.</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="row" style={{ fontSize: 13 }}><span className="sp" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{r.label}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.value)}</b>{total ? <span className="muted" style={{ width: 44, textAlign: "right" }}>{Math.round((r.value / total) * 100)}%</span> : null}</div>
          <div style={{ background: "var(--line2)", borderRadius: 4, height: 10 }}><div style={{ width: `${(r.value / max) * 100}%`, height: 10, borderRadius: 4, background: color }} /></div>
          {r.sub && <div className="muted">{r.sub}</div>}
        </div>))}
    </div>
  );
}

function rangeFor(preset, db, cf, ct) {
  const t = todayStr(), d = new Date(); const first = (y, m) => `${y}-${pad(m + 1)}-01`;
  if (preset === "month") return [first(d.getFullYear(), d.getMonth()), t];
  if (preset === "last30") return [addDays(t, -29), t];
  if (preset === "lastmonth") { const e = new Date(d.getFullYear(), d.getMonth(), 0); return [first(e.getFullYear(), e.getMonth()), ymd(e)]; }
  if (preset === "last3") return [ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), t];
  if (preset === "year") return [`${d.getFullYear()}-01-01`, t];
  if (preset === "all") { const ds = [...db.tx.map((x) => x.date), ...db.exp.map((x) => x.date)].sort(); return ds.length ? [ds[0], ds[ds.length - 1] > t ? ds[ds.length - 1] : t] : [addDays(t, -29), t]; }
  return [cf || addDays(t, -29), ct || t];
}

function Finance({ db, patch, pById }) {
  const ask = useAsk();
  const [sub, setSub] = useState("overview");
  return (
    <div>
      <style>{`:root{--inc:#0f766e;--exp:#c2410c;--ca:#2563eb;--cb:#b45309}
      @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--inc:#2dd4bf;--exp:#fb923c;--ca:#60a5fa;--cb:#fbbf24}}
      :root[data-theme="dark"]{--inc:#2dd4bf;--exp:#fb923c;--ca:#60a5fa;--cb:#fbbf24}`}</style>
      <h2>Finance</h2>
      <div className="row" style={{ marginBottom: 10 }}>{[["overview", "Income & expenses"], ["expenses", "Record expenses"], ["compare", "Compare months"]].map(([k, l]) => <button key={k} className={"chip" + (sub === k ? " on" : "")} onClick={() => setSub(k)}>{l}</button>)}</div>
      <div className="muted" style={{ marginBottom: 10 }}>Income is the fees you enter on treatment records, counted on the procedure date. It shows what was charged, not what was collected.</div>
      {sub === "overview" && <Overview db={db} />}
      {sub === "expenses" && <Expenses db={db} patch={patch} ask={ask} />}
      {sub === "compare" && <Compare db={db} />}
    </div>
  );
}

function Overview({ db }) {
  const [preset, setPreset] = useState("last3");
  const [cf, setCf] = useState(""), [ct, setCt] = useState("");
  const [gsel, setGsel] = useState("auto");
  const [from, to] = rangeFor(preset, db, cf, ct);
  const days = Math.max(1, daysBetween(from, to) + 1);
  const g = gsel === "auto" ? (days <= 35 ? "day" : days <= 150 ? "week" : "month") : gsel;
  const inR = (s) => s >= from && s <= to;
  const tx = db.tx.filter((x) => inR(x.date)), ex = db.exp.filter((x) => inR(x.date));
  const keys = makeBuckets(from, to, g);
  const inc = Object.fromEntries(keys.map((k) => [k, 0])), exv = { ...inc };
  tx.forEach((x) => { inc[bucketKey(x.date, g)] += x.fee; });
  ex.forEach((x) => { exv[bucketKey(x.date, g)] += x.amount; });
  const I = sum(tx.map((x) => x.fee)), E = sum(ex.map((x) => x.amount)), N = I - E;
  const procs = {};
  tx.forEach((x) => { const k = x.procedure.toLowerCase(); (procs[k] = procs[k] || { name: x.procedure, n: 0, sum: 0 }); procs[k].n++; procs[k].sum += x.fee; });
  const procRows = Object.values(procs).sort((a, b) => b.sum - a.sum);
  const cats = {};
  ex.forEach((x) => { cats[x.category] = (cats[x.category] || 0) + x.amount; });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const byDay = {}; tx.forEach((x) => { byDay[x.date] = (byDay[x.date] || 0) + x.fee; });
  const dayVals = Object.entries(byDay); const best = dayVals.sort((a, b) => b[1] - a[1])[0];
  const fees = tx.map((x) => x.fee);
  const gName = { day: "day", week: "week (Mon–Sun)", month: "month" }[g];
  const labels = keys.map((k) => labelOf(k, g));
  return (
    <div>
      <div className="card">
        <div className="grid">
          <F l="Period"><select id="f-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="month">This month</option><option value="lastmonth">Last month</option><option value="last30">Last 30 days</option><option value="last3">Last 3 months</option><option value="year">This year</option><option value="all">All time</option><option value="custom">Custom range</option></select></F>
          {preset === "custom" && <><F l="From"><input type="date" value={cf || from} onChange={(e) => setCf(e.target.value)} /></F><F l="To"><input type="date" value={ct || to} onChange={(e) => setCt(e.target.value)} /></F></>}
          <F l="Group by"><select id="f-gran" value={gsel} onChange={(e) => setGsel(e.target.value)}><option value="auto">Automatic</option><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></F>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{fmtD(from)} to {fmtD(to)} · {days} days</div>
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card"><div className="stat" id="k-income" style={{ color: "var(--inc)" }}>{money(I)}</div>Income</div>
        <div className="card"><div className="stat" id="k-exp" style={{ color: "var(--exp)" }}>{money(E)}</div>Expenses</div>
        <div className="card"><div className="stat" id="k-net">{N < 0 ? "−" : ""}{money(Math.abs(N))}</div>Net {N < 0 ? "loss" : "profit"}{I > 0 && N >= 0 ? ` · ${Math.round((N / I) * 100)}% margin` : ""}</div>
        <div className="card"><div className="stat">{tx.length}</div>Procedures{tx.length ? ` · avg ${money(I / tx.length)}` : ""}</div>
      </div>

      <div className="card">
        <h3>Income and expenses per {gName}</h3>
        <GroupBars labels={labels} series={[{ name: "Income", color: "var(--inc)", values: keys.map((k) => inc[k]) }, { name: "Expenses", color: "var(--exp)", values: keys.map((k) => exv[k]) }]} unitWord={g === "week" ? "Each bar is the week starting on the date shown." : ""} />
        {keys.length > 0 && (
          <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Table of figures</summary>
            <div className="tw"><table><thead><tr><th>{g === "week" ? "Week starting" : g === "day" ? "Day" : "Month"}</th><th style={{ textAlign: "right" }}>Income</th><th style={{ textAlign: "right" }}>Expenses</th><th style={{ textAlign: "right" }}>Net</th></tr></thead>
              <tbody>{keys.filter((k) => inc[k] || exv[k]).map((k) => (
                <tr key={k}><td>{g === "month" ? monthName(k) : fmtD(k)}</td><td style={{ textAlign: "right" }}>{money(inc[k])}</td><td style={{ textAlign: "right" }}>{money(exv[k])}</td><td style={{ textAlign: "right" }}>{inc[k] - exv[k] < 0 ? "−" : ""}{money(Math.abs(inc[k] - exv[k]))}</td></tr>))}</tbody>
              <tfoot><tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{money(I)}</b></td><td style={{ textAlign: "right" }}><b>{money(E)}</b></td><td style={{ textAlign: "right" }}><b>{N < 0 ? "−" : ""}{money(Math.abs(N))}</b></td></tr></tfoot></table></div>
          </details>)}
      </div>

      <div className="grid" style={{ alignItems: "start", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))" }}>
        <div className="card">
          <h3>Income by procedure</h3>
          <HBars total={I} rows={procRows.slice(0, 12).map((r) => ({ label: r.name, value: r.sum, sub: `${r.n} × avg ${money(r.sum / r.n)}` }))} />
          {procRows.length > 12 && <div className="muted" style={{ marginTop: 6 }}>Showing top 12 of {procRows.length} procedures.</div>}
        </div>
        <div className="card">
          <h3>Expenses by category</h3>
          <HBars color="var(--exp)" total={E} rows={catRows.map(([label, value]) => ({ label, value }))} />
        </div>
      </div>

      <div className="card">
        <h3>Statistics for this period</h3>
        {!tx.length && !ex.length ? <Empty>No data in this range yet. Log treatments with a fee and record expenses to see figures.</Empty> : (
          <div className="grid" style={{ fontSize: 14 }}>
            <div><div className="muted">Average income per working day</div><b>{dayVals.length ? money(I / dayVals.length) : "—"}</b><div className="muted">{dayVals.length} day(s) with procedures</div></div>
            <div><div className="muted">Average / median fee</div><b>{tx.length ? `${money(I / tx.length)} / ${money(median(fees))}` : "—"}</b></div>
            <div><div className="muted">Best day</div><b>{best ? money(best[1]) : "—"}</b>{best && <div className="muted">{fmtD(best[0])}</div>}</div>
            <div><div className="muted">Top procedure</div><b>{procRows[0] ? procRows[0].name : "—"}</b>{procRows[0] && <div className="muted">{Math.round((procRows[0].sum / I) * 100)}% of income</div>}</div>
            <div><div className="muted">Expenses as share of income</div><b>{I ? Math.round((E / I) * 100) + "%" : "—"}</b></div>
            <div><div className="muted">Patients treated</div><b>{new Set(tx.map((x) => x.patientId)).size}</b></div>
          </div>)}
      </div>
    </div>
  );
}

function Expenses({ db, patch, ask }) {
  const [v, setV] = useState({ date: todayStr(), category: EXP_CATS[2], desc: "", amount: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const cats = [...new Set([...EXP_CATS, ...db.exp.map((x) => x.category)])];
  const list = [...db.exp].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 150);
  const thisMonth = todayStr().slice(0, 7);
  return (
    <div>
      <div className="card">
        <h3>Add expense</h3>
        <form onSubmit={(e) => { e.preventDefault(); const amount = Number(v.amount); if (!(amount > 0) || !v.category.trim()) return; patch("exp", (a) => [...a, { id: uid(), date: v.date, category: v.category.trim(), desc: v.desc.trim(), amount, createdAt: new Date().toISOString() }]); setV({ ...v, desc: "", amount: "" }); }}>
          <div className="grid">
            <F l="Date"><input id="e-date" type="date" required value={v.date} onChange={set("date")} /></F>
            <F l="Category (pick or type)"><input id="e-cat" list="cat-list" required value={v.category} onChange={set("category")} autoComplete="off" /><datalist id="cat-list">{cats.map((c) => <option key={c} value={c} />)}</datalist></F>
            <F l="Description"><input id="e-desc" value={v.desc} onChange={set("desc")} placeholder="e.g. October rent, composite kit" dir="auto" /></F>
            <F l="Amount (Rs) *"><input id="e-amt" type="number" min="1" required inputMode="numeric" value={v.amount} onChange={set("amount")} /></F>
          </div>
          <div style={{ marginTop: 10 }}><button className="btn" type="submit">Add expense</button></div>
        </form>
      </div>
      <div className="card tw">
        <div className="row"><h3 className="sp">Recent expenses</h3><span className="muted">This month: <b>{money(sum(db.exp.filter((x) => x.date.startsWith(thisMonth)).map((x) => x.amount)))}</b></span></div>
        {!list.length ? <Empty>No expenses recorded yet.</Empty> : (
          <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id}><td style={{ whiteSpace: "nowrap" }}>{fmtD(x.date)}</td><td>{x.category}</td><td dir="auto">{x.desc}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{money(x.amount)}</td>
                <td><button className="btn red sm" aria-label="delete expense" onClick={() => ask("Delete this expense?", () => patch("exp", (a) => a.filter((y) => y.id !== x.id)))}>✕</button></td></tr>))}</tbody></table>)}
      </div>
    </div>
  );
}

function monthStats(db, mk) {
  const tx = db.tx.filter((x) => x.date.startsWith(mk)), ex = db.exp.filter((x) => x.date.startsWith(mk));
  const procs = {}, cats = {};
  tx.forEach((x) => { const k = x.procedure.toLowerCase(); procs[k] = procs[k] || { name: x.procedure, v: 0 }; procs[k].v += x.fee; });
  ex.forEach((x) => { cats[x.category] = (cats[x.category] || 0) + x.amount; });
  const I = sum(tx.map((x) => x.fee)), E = sum(ex.map((x) => x.amount));
  return { I, E, N: I - E, n: tx.length, patients: new Set(tx.map((x) => x.patientId)).size, days: new Set(tx.map((x) => x.date)).size, avg: tx.length ? I / tx.length : 0, procs, cats };
}
function Compare({ db }) {
  const months = useMemo(() => { const d = new Date(); return Array.from({ length: 36 }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; }); }, []);
  const [a, setA] = useState(months[1]), [b, setB] = useState(months[0]);
  const A = monthStats(db, a), B = monthStats(db, b);
  const rows = [["Income", "I", true, "money"], ["Expenses", "E", false, "money"], ["Net profit", "N", true, "money"], ["Procedures done", "n", true, "num"], ["Patients treated", "patients", true, "num"], ["Working days", "days", true, "num"], ["Average fee", "avg", true, "money"]];
  const f = (v, t) => (t === "money" ? (v < 0 ? "−" : "") + money(Math.abs(v)) : String(v));
  const merge = (ka, kb, pick) => {
    const keys = new Set([...Object.keys(ka), ...Object.keys(kb)]);
    return [...keys].map((k) => ({ label: pick(ka[k] || kb[k], k), a: ka[k] ? (typeof ka[k] === "number" ? ka[k] : ka[k].v) : 0, b: kb[k] ? (typeof kb[k] === "number" ? kb[k] : kb[k].v) : 0 })).sort((x, y) => y.a + y.b - (x.a + x.b));
  };
  const pr = merge(A.procs, B.procs, (o) => o.name).slice(0, 8);
  const cr = merge(A.cats, B.cats, (_, k) => k).slice(0, 8);
  const last12 = months.slice(0, 12).reverse();
  const st = last12.map((m) => monthStats(db, m));
  const CompareRows = ({ list }) => {
    if (!list.length) return <Empty>Nothing recorded in either month.</Empty>;
    const max = Math.max(...list.flatMap((r) => [r.a, r.b]), 1);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((r) => (
          <div key={r.label}>
            <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{r.label}</div>
            {[["a", a, "var(--ca)"], ["b", b, "var(--cb)"]].map(([k, m, c]) => (
              <div key={k} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <div style={{ flex: 1, background: "var(--line2)", borderRadius: 3, height: 9 }}><div style={{ width: `${(r[k] / max) * 100}%`, height: 9, borderRadius: 3, background: c }} /></div>
                <span className="muted" style={{ width: 118, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{MON[+m.slice(5) - 1]} · {money(r[k])}</span>
              </div>))}
          </div>))}
      </div>
    );
  };
  return (
    <div>
      <div className="card">
        <div className="grid">
          <F l="Month A (baseline)"><select id="cmp-a" value={a} onChange={(e) => setA(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></F>
          <F l="Month B (compare to A)"><select id="cmp-b" value={b} onChange={(e) => setB(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></F>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: 2, background: "var(--ca)", display: "inline-block" }} />A: {monthName(a)}</span>
          <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: 2, background: "var(--cb)", display: "inline-block" }} />B: {monthName(b)}</span>
        </div>
      </div>
      <div className="card tw">
        <h3>Month A vs month B</h3>
        <table id="cmp-table"><thead><tr><th>Measure</th><th style={{ textAlign: "right" }}>{monthName(a)}</th><th style={{ textAlign: "right" }}>{monthName(b)}</th><th style={{ textAlign: "right" }}>Change</th><th style={{ textAlign: "right" }}>%</th></tr></thead>
          <tbody>{rows.map(([label, k, upGood, t]) => { const d = B[k] - A[k]; const pct = A[k] ? (d / Math.abs(A[k])) * 100 : null; const good = d === 0 ? null : (d > 0) === upGood;
            return (<tr key={k}><td>{label}</td><td style={{ textAlign: "right" }}>{f(A[k], t)}</td><td style={{ textAlign: "right" }}>{f(B[k], t)}</td>
              <td style={{ textAlign: "right" }}>{d === 0 ? "—" : <span className={"tag " + (good ? "g" : "r")}>{d > 0 ? "▲ +" : "▼ −"}{f(Math.abs(d), t).replace("−", "")}</span>}</td>
              <td style={{ textAlign: "right" }}>{d === 0 ? "—" : pct == null ? "new" : (pct > 0 ? "+" : "") + pct.toFixed(1) + "%"}</td></tr>); })}</tbody></table>
        <div className="muted" style={{ marginTop: 6 }}>Green means better for the clinic (more income, fewer expenses); red means worse.</div>
      </div>
      <div className="grid" style={{ alignItems: "start", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))" }}>
        <div className="card"><h3>Income by procedure</h3><CompareRows list={pr} /></div>
        <div className="card"><h3>Expenses by category</h3><CompareRows list={cr} /></div>
      </div>
      <div className="card">
        <h3>Last 12 months</h3>
        <GroupBars labels={last12.map((m) => labelOf(m, "month"))} series={[{ name: "Income", color: "var(--inc)", values: st.map((x) => x.I) }, { name: "Expenses", color: "var(--exp)", values: st.map((x) => x.E) }]} />
      </div>
    </div>
  );
}

/* ============================ patient-facing pages ============================ */
function Public({ route }) {
  const kind = route.startsWith("#/consent") ? "consent" : "form";
  const q = route.split("?c=")[1] || "";
  const d = useMemo(() => { try { return JSON.parse(b64d(q)); } catch { return null; } }, [q]);
  const [out, setOut] = useState(null);
  const clinic = d?.c || "the clinic";
  const send = (tag, payload, label) => {
    const code = `DENTCARE-${tag}:${b64e(JSON.stringify(payload))}`;
    const text = `${label}\n\n${code}`;
    const url = waLink(d?.cp, text);
    setOut({ code, text, url });
    if (url) window.open(url, "_blank");
  };
  if (kind === "consent" && !d) return <div className="wrap"><div className="card">This link is not valid. Please ask the clinic to send it again.</div></div>;

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="card" style={{ background: "var(--pri)", color: "#fff", borderColor: "var(--pri)" }}><h2 style={{ margin: 0 }}>{clinic}</h2></div>
      {kind === "consent" ? <ConsentForm d={d} onSubmit={(name) => send("CONSENT", { pid: d.pid, aid: d.aid, name, at: new Date().toISOString() }, `Signed consent form from ${name}`)} />
        : <InfoForm d={d || {}} onSubmit={(v) => send("FORM", { ...v, pid: d?.pid }, `Patient information form from ${v.name}`)} />}
      {out && (
        <div className="card" data-testid="public-done">
          <h3>{out.url ? "Almost done: press Send in WhatsApp" : "Copy this and send it to the clinic"}</h3>
          <div className="muted" style={{ marginBottom: 6 }}>{out.url ? "WhatsApp has opened with your form attached to a message. You must press Send for the clinic to receive it. If it did not open, tap the button below." : "The clinic number is missing from this link. Copy the text below and send it to the clinic on WhatsApp."}</div>
          {out.url && <a className="btn wa" style={{ textDecoration: "none", display: "inline-block" }} href={out.url} target="_blank" rel="noreferrer">Open WhatsApp</a>}{" "}
          <button className="btn sec" onClick={() => copyText(out.text)}>Copy message</button>
          <textarea readOnly value={out.text} style={{ marginTop: 8, fontSize: 12 }} />
        </div>)}
    </div>
  );
}
function ConsentForm({ d, onSubmit }) {
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="card">
      <h3>Treatment consent form</h3>
      <div className="muted">Patient: <b>{d.n}</b>{d.d ? ` · Appointment ${fmtD(d.d)} ${fmt12(d.t)}` : ""}</div>
      <p dir="auto" style={{ lineHeight: 1.6 }}>{d.tx || DEFAULT_CONSENT}</p>
      <label style={{ display: "block", margin: "10px 0" }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read and agree to the above.</label>
      <F l="Type your full name as signature"><input value={name} onChange={(e) => setName(e.target.value)} dir="auto" /></F>
      <div style={{ marginTop: 10 }}><button className="btn" disabled={!agree || name.trim().length < 3} onClick={() => onSubmit(name.trim())}>Sign and send to clinic</button></div>
    </div>
  );
}
function InfoForm({ d, onSubmit }) {
  const [v, setV] = useState({ name: d.n || "", phone: d.ph || "", dob: "", gender: "", city: "", address: "", emergency: "", complaint: "", conditions: [], allergies: "", meds: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const tog = (c) => setV({ ...v, conditions: v.conditions.includes(c) ? v.conditions.filter((x) => x !== c) : [...v.conditions, c] });
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
      <h3>Patient information form</h3>
      <div className="grid">
        <F l="Full name *"><input required value={v.name} onChange={set("name")} dir="auto" /></F>
        <F l="Mobile / WhatsApp *"><input required value={v.phone} onChange={set("phone")} inputMode="tel" /></F>
        <F l="Date of birth"><input type="date" value={v.dob} onChange={set("dob")} /></F>
        <F l="Gender"><select value={v.gender} onChange={set("gender")}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></F>
        <F l="City"><input value={v.city} onChange={set("city")} dir="auto" /></F>
        <F l="Address"><input value={v.address} onChange={set("address")} dir="auto" /></F>
        <F l="Emergency contact"><input value={v.emergency} onChange={set("emergency")} /></F>
      </div>
      <F l="What is your main dental problem? (chief complaint) *" style={{ marginTop: 10 }}><textarea required value={v.complaint} onChange={set("complaint")} dir="auto" /></F>
      <label className="f" style={{ marginTop: 10 }}>Medical conditions</label>
      <div className="row">{CONDITIONS.map((c) => <button type="button" key={c} className={"chip" + (v.conditions.includes(c) ? " on" : "")} onClick={() => tog(c)}>{c}</button>)}</div>
      <div className="grid" style={{ marginTop: 10 }}>
        <F l="Allergies"><input value={v.allergies} onChange={set("allergies")} dir="auto" /></F>
        <F l="Current medicines"><input value={v.meds} onChange={set("meds")} dir="auto" /></F>
      </div>
      <div style={{ marginTop: 12 }}><button className="btn" type="submit">Send to clinic</button></div>
    </form>
  );
}
