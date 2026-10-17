import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WhatsApp OTP Gateway – Control Panel" },
      { name: "description", content: "Apna WhatsApp device link karein aur OTP test karein." },
      { property: "og:title", content: "WhatsApp OTP Gateway" },
      { property: "og:description", content: "QR ya phone code se device link karein, OTP bhejein." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Status = {
  status: string;
  user?: { id: string; name?: string } | null;
  qr?: string | null;
  pairingCode?: string | null;
  storage?: string;
};

const card = "rounded-xl border border-border bg-card p-4 shadow-sm";
const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const btn =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const btn2 = "rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent";

function Index() {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"qr" | "phone">("qr");
  const [pairPhone, setPairPhone] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<{ time: string; msg: string }[]>([]);

  useEffect(() => {
    setUrl(localStorage.getItem("gw_url") || "");
    setKey(localStorage.getItem("gw_key") || "");
  }, []);

  const api = useCallback(
    async (path: string, body?: unknown) => {
      const r = await fetch(url.replace(/\/$/, "") + path, {
        method: body !== undefined ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: body !== undefined ? JSON.stringify(body) : null,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      return j;
    },
    [url, key],
  );

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      setSt(await api("/status"));
      setLogs(await api("/logs"));
      setErr("");
    } catch (e) {
      setErr((e as Error).message + " – server URL / API key check karein (Render server jaag raha ho sakta hai, 1 min ruk kar try karein)");
    }
  }, [api, url]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    localStorage.setItem("gw_url", url);
    localStorage.setItem("gw_key", key);
    refresh();
  };

  const connected = st?.status === "connected";

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">WhatsApp OTP Gateway</h1>

        <div className={card}>
          <h2 className="mb-2 font-semibold">1. Server settings</h2>
          <div className="space-y-2">
            <input className={input} placeholder="https://your-app.onrender.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className={input} placeholder="API key" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className={btn} onClick={save}>Save & Check</button>
          </div>
        </div>

        {err && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}

        <div className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">2. Device</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${connected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {st?.status || "unknown"}
            </span>
          </div>

          {connected ? (
            <div className="space-y-3">
              <p className="text-sm">Connected: <b>{st?.user?.name}</b> ({st?.user?.id?.split(":")[0]})</p>
              <button className={btn2} disabled={busy} onClick={() => run(() => api("/disconnect", {}))}>Logout device</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button className={tab === "qr" ? btn : btn2} onClick={() => setTab("qr")}>QR Code</button>
                <button className={tab === "phone" ? btn : btn2} onClick={() => setTab("phone")}>Phone Code</button>
              </div>
              {tab === "qr" ? (
                <div className="space-y-2">
                  {st?.qr ? (
                    <img src={st.qr} alt="WhatsApp QR" className="mx-auto w-64 rounded-md bg-card" />
                  ) : (
                    <button className={btn} disabled={busy || !url} onClick={() => run(() => api("/connect", {}))}>Generate QR</button>
                  )}
                  <p className="text-xs text-muted-foreground">WhatsApp → Linked devices → Link a device → scan karein.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input className={input} placeholder="919876543210" value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} />
                  <button className={btn} disabled={busy || !url} onClick={() => run(() => api("/pair-phone", { phone: pairPhone }))}>Get pairing code</button>
                  {st?.pairingCode && <p className="text-center font-mono text-3xl tracking-widest">{st.pairingCode}</p>}
                  <p className="text-xs text-muted-foreground">WhatsApp → Linked devices → Link with phone number → yeh code daalein.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={card}>
          <h2 className="mb-2 font-semibold">3. OTP test</h2>
          <div className="space-y-2">
            <input className={input} placeholder="Receiver number e.g. 919876543210" value={otpPhone} onChange={(e) => setOtpPhone(e.target.value)} />
            <input className={input} placeholder="OTP (khali chhodein = auto)" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button
              className={btn}
              disabled={busy || !connected}
              onClick={() => run(async () => {
                const r = await api("/send-otp", { phone: otpPhone, otp: otp || undefined });
                alert(`OTP ${r.otp} bhej diya!`);
              })}
            >
              Send OTP
            </button>
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-2 font-semibold">Logs</h2>
          <div className="max-h-48 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
            {logs.length === 0 ? <p>Koi log nahi</p> : logs.map((l, i) => <p key={i}>{l.time.slice(11, 19)} – {l.msg}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
