import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import crypto from "crypto";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { usePgAuthState } from "./pgAuthState.js";
import * as store from "./store.js";

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";
const SECRET = process.env.API_KEY || process.env.SESSION_SECRET || "change-me-secret";
const DEFAULT_CC = process.env.DEFAULT_COUNTRY_CODE || "91";
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "";
const logger = pino({ level: "warn" });

const DEFAULT_TEMPLATE =
  "Your verification code is *{otp}*.\n\nThis code is valid for {minutes} minutes. Do not share it with anyone.";

// ---------- WhatsApp socket ----------
let sock = null;
let status = "disconnected";
let qrDataUrl = null;
let pairingCode = null;
let me = null;
let authCtrl = null;
let starting = false;
const logs = [];
const log = (msg) => {
  logs.unshift({ time: new Date().toISOString(), msg });
  logs.length = Math.min(logs.length, 200);
  console.log(msg);
};

async function getAuth() {
  if (DATABASE_URL) return usePgAuthState(DATABASE_URL);
  const dir = "./auth_info";
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return { state, saveCreds, clear: async () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function startSock() {
  if (starting) return;
  starting = true;
  try {
    status = "connecting";
    authCtrl = await getAuth();
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version,
      auth: authCtrl.state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
    });
    sock.ev.on("creds.update", authCtrl.saveCreds);
    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr && status !== "pairing") {
        qrDataUrl = await QRCode.toDataURL(qr);
        status = "qr";
      }
      if (connection === "open") {
        status = "connected";
        qrDataUrl = null;
        pairingCode = null;
        me = sock.user;
        log(`Connected as ${me?.id}`);
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        me = null;
        log(`Connection closed (code ${code})`);
        if (code === DisconnectReason.loggedOut) {
          await authCtrl.clear();
          status = "disconnected";
          sock = null;
        } else {
          sock = null;
          setTimeout(() => startSock(), 2000);
        }
      }
    });
  } catch (e) {
    log(`Start error: ${e.message}`);
    status = "disconnected";
  } finally {
    starting = false;
  }
}

function normalizePhone(raw) {
  let p = String(raw || "").replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
  if (p.length === 10) p = DEFAULT_CC + p; // local number -> add default country code
  return p;
}

async function sendText(rawPhone, text) {
  if (status !== "connected" || !sock) throw httpErr(503, "WhatsApp device is not connected");
  const phone = normalizePhone(rawPhone);
  if (phone.length < 11 || phone.length > 15) throw httpErr(400, "Invalid phone number. Use country code, e.g. 919876543210");
  const [check] = await sock.onWhatsApp(`${phone}@s.whatsapp.net`);
  if (!check?.exists) throw httpErr(400, `Number ${phone} is not registered on WhatsApp`);
  const r = await sock.sendMessage(check.jid, { text });
  return { phone, messageId: r.key.id };
}

function httpErr(code, message) {
  const e = new Error(message);
  e.status = code;
  return e;
}

// ---------- Users, sessions, API keys ----------
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
const checkPw = (pw, stored) => {
  const [salt, h] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(test));
};
const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
};
const verify = (token) => {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const exp = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp > Date.now() ? p : null;
};
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const users = () => store.get("users", []);
const keys = () => store.get("apiKeys", []);
const settings = () => ({ otpTemplate: DEFAULT_TEMPLATE, otpMinutes: 5, ...store.get("settings", {}) });
const otps = new Map(); // phone -> { hash, expires, attempts, keyId }

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, disabled: !!u.disabled });

function requireUser(req, res, next) {
  const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const p = verify(tok);
  const u = p && users().find((x) => x.id === p.uid);
  if (!u || u.disabled) return res.status(401).json({ error: "Please log in again" });
  req.user = u;
  next();
}
const requireAdmin = (req, res, next) =>
  requireUser(req, res, () => (req.user.role === "admin" ? next() : res.status(403).json({ error: "Admin only" })));

function requireApiKey(req, res, next) {
  const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.headers["x-api-key"] || "";
  const k = keys().find((x) => x.hash === sha(String(raw)) && !x.revoked);
  const owner = k && users().find((u) => u.id === k.userId && !u.disabled);
  if (!k || !owner) return res.status(401).json({ success: false, error: "Invalid or revoked API key" });
  req.apiKey = k;
  next();
}

async function bumpUsage(keyId, field) {
  const list = keys().map((k) => (k.id === keyId ? { ...k, [field]: (k[field] || 0) + 1, lastUsedAt: new Date().toISOString() } : k));
  await store.set("apiKeys", list);
}

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 500).json({ success: false, error: e.message }));

app.get("/", (_, res) => res.send("WhatsApp Gateway running"));
app.get("/ping", (_, res) => res.json({ ok: true, status, time: Date.now() }));

// Auth
app.post("/auth/register", wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(400, "Enter a valid email");
  if (password.length < 6) throw httpErr(400, "Password must be at least 6 characters");
  const list = users();
  if (list.some((u) => u.email === email)) throw httpErr(400, "Email already registered");
  const u = {
    id: crypto.randomUUID(), email, name, password: hashPw(password),
    role: list.length === 0 ? "admin" : "user", // first account becomes admin
    createdAt: new Date().toISOString(),
  };
  await store.set("users", [...list, u]);
  log(`New ${u.role} registered: ${email}`);
  res.json({ token: sign({ uid: u.id, exp: Date.now() + 30 * 864e5 }), user: publicUser(u) });
}));

app.post("/auth/login", wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const u = users().find((x) => x.email === email);
  if (!u || !checkPw(String(req.body.password || ""), u.password)) throw httpErr(401, "Wrong email or password");
  if (u.disabled) throw httpErr(403, "Account disabled by admin");
  res.json({ token: sign({ uid: u.id, exp: Date.now() + 30 * 864e5 }), user: publicUser(u) });
}));

app.get("/auth/me", requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

// User: API keys
app.get("/keys", requireUser, (req, res) =>
  res.json(keys().filter((k) => k.userId === req.user.id).map(({ hash, ...k }) => k))
);
app.post("/keys", requireUser, wrap(async (req, res) => {
  const raw = "wag_" + crypto.randomBytes(24).toString("base64url");
  const k = {
    id: crypto.randomUUID(), userId: req.user.id, name: String(req.body.name || "My key").slice(0, 60),
    prefix: raw.slice(0, 10), hash: sha(raw), createdAt: new Date().toISOString(), sent: 0, verified: 0,
  };
  await store.set("apiKeys", [...keys(), k]);
  const { hash, ...pub } = k;
  res.json({ ...pub, key: raw }); // full key shown only once
}));
app.delete("/keys/:id", requireUser, wrap(async (req, res) => {
  await store.set("apiKeys", keys().map((k) =>
    k.id === req.params.id && (k.userId === req.user.id || req.user.role === "admin") ? { ...k, revoked: true } : k));
  res.json({ success: true });
}));

// Admin: device
app.get("/status", requireAdmin, (_, res) =>
  res.json({ status, user: me, qr: qrDataUrl, pairingCode, storage: DATABASE_URL ? "postgres" : "file" })
);
app.get("/logs", requireAdmin, (_, res) => res.json(logs));
app.post("/connect", requireAdmin, wrap(async (_, res) => {
  if (!sock) await startSock();
  res.json({ status });
}));
app.post("/pair-phone", requireAdmin, wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (phone.length < 11) throw httpErr(400, "Use country code, e.g. 919876543210");
  if (status === "connected") throw httpErr(400, "Already connected");
  if (!sock) await startSock();
  status = "pairing";
  await new Promise((r) => setTimeout(r, 3000));
  try {
    pairingCode = await sock.requestPairingCode(phone);
  } catch (e) {
    status = "qr";
    throw e;
  }
  log(`Pairing code generated for ${phone}`);
  res.json({ pairingCode });
}));
app.post("/disconnect", requireAdmin, wrap(async (_, res) => {
  if (sock) await sock.logout().catch(() => {});
  await authCtrl?.clear();
  sock = null; status = "disconnected"; qrDataUrl = null; pairingCode = null; me = null;
  log("Logged out");
  res.json({ status });
}));
app.post("/admin/send", requireAdmin, wrap(async (req, res) => {
  const r = await sendText(req.body.phone, String(req.body.message || "").slice(0, 4000));
  log(`Admin message sent to ${r.phone}`);
  res.json({ success: true, ...r });
}));

// Admin: settings & users
app.get("/admin/settings", requireAdmin, (_, res) => res.json(settings()));
app.put("/admin/settings", requireAdmin, wrap(async (req, res) => {
  const tpl = String(req.body.otpTemplate || "").slice(0, 1000);
  if (!tpl.includes("{otp}")) throw httpErr(400, "Template must contain {otp}");
  const minutes = Math.min(60, Math.max(1, Number(req.body.otpMinutes) || 5));
  await store.set("settings", { otpTemplate: tpl, otpMinutes: minutes });
  res.json(settings());
}));
app.get("/admin/users", requireAdmin, (_, res) => {
  const ks = keys();
  res.json(users().map((u) => {
    const mine = ks.filter((k) => k.userId === u.id);
    return { ...publicUser(u), keys: mine.filter((k) => !k.revoked).length, sent: mine.reduce((a, k) => a + (k.sent || 0), 0) };
  }));
});
app.patch("/admin/users/:id", requireAdmin, wrap(async (req, res) => {
  if (req.params.id === req.user.id) throw httpErr(400, "You cannot change your own account");
  await store.set("users", users().map((u) => u.id === req.params.id
    ? { ...u, ...(req.body.role ? { role: req.body.role === "admin" ? "admin" : "user" } : {}),
        ...(typeof req.body.disabled === "boolean" ? { disabled: req.body.disabled } : {}) }
    : u));
  res.json({ success: true });
}));

// ---------- Public API v1 (API key) ----------
app.get("/api/v1/status", requireApiKey, (_, res) => res.json({ success: true, device: status === "connected" ? "connected" : "offline" }));

app.post("/api/v1/otp/send", requireApiKey, wrap(async (req, res) => {
  const s = settings();
  const len = Math.min(8, Math.max(4, Number(req.body.length) || 6));
  const otp = req.body.otp ? String(req.body.otp).replace(/\D/g, "").slice(0, 8) : String(crypto.randomInt(10 ** (len - 1), 10 ** len));
  if (otp.length < 4) throw httpErr(400, "otp must be 4-8 digits");
  const text = s.otpTemplate.replaceAll("{otp}", otp).replaceAll("{minutes}", String(s.otpMinutes))
    .replaceAll("{app}", String(req.body.app_name || "").slice(0, 40));
  const r = await sendText(req.body.phone, text);
  otps.set(r.phone, { hash: sha(otp), expires: Date.now() + s.otpMinutes * 60000, attempts: 0, keyId: req.apiKey.id });
  await bumpUsage(req.apiKey.id, "sent");
  log(`OTP sent to ${r.phone} (key ${req.apiKey.prefix})`);
  res.json({ success: true, phone: r.phone, message_id: r.messageId, expires_in: s.otpMinutes * 60,
    ...(req.body.return_otp ? { otp } : {}) });
}));

app.post("/api/v1/otp/verify", requireApiKey, wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const rec = otps.get(phone);
  if (!rec || rec.keyId !== req.apiKey.id) throw httpErr(404, "No OTP pending for this number");
  if (Date.now() > rec.expires) { otps.delete(phone); throw httpErr(410, "OTP expired"); }
  if (++rec.attempts > 5) { otps.delete(phone); throw httpErr(429, "Too many attempts"); }
  if (rec.hash !== sha(String(req.body.otp || ""))) throw httpErr(400, "Incorrect OTP");
  otps.delete(phone);
  await bumpUsage(req.apiKey.id, "verified");
  res.json({ success: true, verified: true, phone });
}));

app.post("/api/v1/message/send", requireApiKey, wrap(async (req, res) => {
  const msg = String(req.body.message || "").trim().slice(0, 4000);
  if (!msg) throw httpErr(400, "message is required");
  const r = await sendText(req.body.phone, msg);
  await bumpUsage(req.apiKey.id, "sent");
  res.json({ success: true, phone: r.phone, message_id: r.messageId });
}));

// ---------- Boot ----------
await store.initStore(DATABASE_URL);
app.listen(PORT, () => {
  console.log(`Gateway on port ${PORT}`);
  startSock();
  // Keep Render free instance awake: ping our own public URL every 4 minutes.
  if (SELF_URL) setInterval(() => fetch(`${SELF_URL}/ping`).catch(() => {}), 4 * 60 * 1000);
});
