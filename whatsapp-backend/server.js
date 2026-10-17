import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { usePgAuthState } from "./pgAuthState.js";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const logger = pino({ level: "warn" });

let sock = null;
let status = "disconnected"; // disconnected | connecting | qr | pairing | connected
let qrDataUrl = null;
let pairingCode = null;
let me = null;
let authCtrl = null;
let starting = false;
const logs = [];
const log = (msg) => {
  logs.unshift({ time: new Date().toISOString(), msg });
  logs.length = Math.min(logs.length, 100);
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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => res.send("WhatsApp Gateway running"));
app.get("/ping", (_, res) => res.json({ ok: true, time: Date.now() }));

app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.headers["x-api-key"] === API_KEY) return next();
  res.status(401).json({ error: "Invalid API key" });
});

app.get("/status", (_, res) =>
  res.json({ status, user: me, qr: qrDataUrl, pairingCode, storage: DATABASE_URL ? "postgres" : "file" })
);
app.get("/logs", (_, res) => res.json(logs));

app.post("/connect", async (_, res) => {
  if (!sock) await startSock();
  res.json({ status });
});

app.post("/pair-phone", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    if (phone.length < 10) return res.status(400).json({ error: "Country code ke saath number daalein, jaise 919876543210" });
    if (status === "connected") return res.status(400).json({ error: "Already connected" });
    if (!sock) await startSock();
    status = "pairing";
    await new Promise((r) => setTimeout(r, 3000));
    pairingCode = await sock.requestPairingCode(phone);
    log(`Pairing code generated for ${phone}`);
    res.json({ pairingCode });
  } catch (e) {
    status = "qr";
    res.status(500).json({ error: e.message });
  }
});

app.post("/send-otp", async (req, res) => {
  try {
    if (status !== "connected") return res.status(400).json({ error: "WhatsApp connected nahi hai" });
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    const otp = req.body.otp || String(Math.floor(100000 + Math.random() * 900000));
    const text = req.body.message || `Aapka OTP hai: *${otp}*\nYeh 5 minute tak valid hai. Kisi ke saath share na karein.`;
    const jid = `${phone}@s.whatsapp.net`;
    const [check] = await sock.onWhatsApp(jid);
    if (!check?.exists) return res.status(400).json({ error: "Yeh number WhatsApp par nahi hai" });
    const r = await sock.sendMessage(check.jid, { text });
    log(`OTP sent to ${phone}`);
    res.json({ success: true, otp, messageId: r.key.id });
  } catch (e) {
    log(`Send error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post("/send-message", async (req, res) => {
  try {
    if (status !== "connected") return res.status(400).json({ error: "WhatsApp connected nahi hai" });
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    const r = await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: String(req.body.message || "") });
    res.json({ success: true, messageId: r.key.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/disconnect", async (_, res) => {
  try {
    if (sock) await sock.logout().catch(() => {});
    await authCtrl?.clear();
    sock = null;
    status = "disconnected";
    qrDataUrl = null;
    pairingCode = null;
    me = null;
    log("Logged out");
    res.json({ status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gateway on port ${PORT}`);
  startSock(); // auto-reconnect saved session on boot
});
