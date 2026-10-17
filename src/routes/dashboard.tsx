import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, getUser, GATEWAY_URL, ui } from "@/lib/gateway";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard – WA Gateway" },
      { name: "description", content: "Manage your WhatsApp OTP API keys and test sending." },
      { property: "og:title", content: "Dashboard – WA Gateway" },
      { property: "og:description", content: "Manage API keys and test WhatsApp OTP delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Key = { id: string; name: string; prefix: string; createdAt: string; sent?: number; verified?: number; revoked?: boolean; lastUsedAt?: string };

function Dashboard() {
  const nav = useNavigate();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [err, setErr] = useState("");
  const [testKey, setTestKey] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [res, setRes] = useState("");

  const load = useCallback(() => api<Key[]>("/keys").then(setKeys).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    if (!getUser()) nav({ to: "/", replace: true });
    else load();
  }, [load, nav]);

  const create = async () => {
    try {
      const r = await api<{ key: string }>("/keys", "POST", { name: name || "My key" });
      setNewKey(r.key);
      setTestKey(r.key);
      setName("");
      load();
    } catch (e: any) { setErr(e.message); }
  };
  const revoke = async (id: string) => { await api(`/keys/${id}`, "DELETE"); load(); };

  const call = async (path: string, body: object) => {
    setRes("Sending…");
    const r = await fetch(GATEWAY_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${testKey}` },
      body: JSON.stringify(body),
    });
    setRes(JSON.stringify(await r.json(), null, 2));
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-2xl font-bold text-foreground">Your API keys</h1>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className={ui.card + " space-y-3"}>
          <div className="flex gap-2">
            <input className={ui.input} placeholder="Key name, e.g. My website" value={name} onChange={(e) => setName(e.target.value)} />
            <button className={ui.btn} onClick={create}>Generate</button>
          </div>
          {newKey && (
            <div className="rounded-md border border-primary bg-accent p-3 text-sm">
              <p className="font-medium text-foreground">Copy your key now — it won't be shown again:</p>
              <code className="block break-all py-2 text-foreground">{newKey}</code>
              <button className={ui.btn2} onClick={() => navigator.clipboard.writeText(newKey)}>Copy</button>
            </div>
          )}
          <div className="divide-y divide-border">
            {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-foreground">{k.name} {k.revoked && <span className="text-destructive">(revoked)</span>}</p>
                  <p className="text-muted-foreground">{k.prefix}… · sent {k.sent || 0} · verified {k.verified || 0}</p>
                </div>
                {!k.revoked && <button className={ui.btn2} onClick={() => revoke(k.id)}>Revoke</button>}
              </div>
            ))}
          </div>
        </div>

        <div className={ui.card + " space-y-3"}>
          <h2 className="font-semibold text-foreground">Test your key</h2>
          <input className={ui.input} placeholder="API key (wag_…)" value={testKey} onChange={(e) => setTestKey(e.target.value)} />
          <input className={ui.input} placeholder="Phone with country code, e.g. 919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className={ui.btn} onClick={() => call("/api/v1/otp/send", { phone })}>Send OTP</button>
            <input className={ui.input + " max-w-[10rem]"} placeholder="OTP received" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className={ui.btn2} onClick={() => call("/api/v1/otp/verify", { phone, otp })}>Verify OTP</button>
          </div>
          {res && <pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">{res}</pre>}
          <Link to="/api" className="text-sm text-primary underline">Full API documentation →</Link>
        </div>
      </main>
    </div>
  );
}
