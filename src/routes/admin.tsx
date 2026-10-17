import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, getUser, ui } from "@/lib/gateway";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin – WA Gateway" },
      { name: "description", content: "Connect the WhatsApp device, edit the OTP message and manage users." },
      { property: "og:title", content: "Admin – WA Gateway" },
      { property: "og:description", content: "WhatsApp gateway admin panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

type Status = { status: string; user?: { id: string; name?: string } | null; qr?: string | null; pairingCode?: string | null; storage?: string };
type U = { id: string; email: string; name?: string; role: string; disabled: boolean; keys: number; sent: number };

function Admin() {
  const nav = useNavigate();
  const [st, setSt] = useState<Status | null>(null);
  const [logs, setLogs] = useState<{ time: string; msg: string }[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"qr" | "phone">("qr");
  const [pairPhone, setPairPhone] = useState("");
  const [tpl, setTpl] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [saved, setSaved] = useState("");
  const [users, setUsers] = useState<U[]>([]);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSt(await api("/status"));
      setLogs(await api("/logs"));
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { nav({ to: "/", replace: true }); return; }
    refresh();
    api("/admin/settings").then((s: any) => { setTpl(s.otpTemplate); setMinutes(s.otpMinutes); }).catch(() => {});
    api<U[]>("/admin/users").then(setUsers).catch(() => {});
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [nav, refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try { await fn(); refresh(); } catch (e: any) { setErr(e.message); }
  };
  const loadUsers = () => api<U[]>("/admin/users").then(setUsers);
  const connected = st?.status === "connected";

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-2xl font-bold text-foreground">Admin panel</h1>
        {err && <p className="rounded-md border border-destructive p-3 text-sm text-destructive">{err}</p>}

        <section className={ui.card + " space-y-3"}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">WhatsApp device</h2>
            <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">{st?.status || "…"}</span>
          </div>
          {connected ? (
            <>
              <p className="text-sm text-foreground">Connected: <b>{st?.user?.name}</b> ({st?.user?.id?.split(":")[0]})</p>
              <button className={ui.btn2} onClick={() => act(() => api("/disconnect", "POST"))}>Logout device</button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <button className={tab === "qr" ? ui.btn : ui.btn2} onClick={() => setTab("qr")}>QR code</button>
                <button className={tab === "phone" ? ui.btn : ui.btn2} onClick={() => setTab("phone")}>Phone number code</button>
              </div>
              {tab === "qr" ? (
                <div className="space-y-2">
                  <button className={ui.btn} onClick={() => act(() => api("/connect", "POST"))}>Generate QR</button>
                  {st?.qr && <img src={st.qr} alt="WhatsApp QR" className="h-64 w-64 rounded-md bg-card" />}
                  <p className="text-xs text-muted-foreground">WhatsApp → Linked devices → Link a device → scan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input className={ui.input} placeholder="919876543210" value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} />
                  <button className={ui.btn} onClick={() => act(() => api("/pair-phone", "POST", { phone: pairPhone }))}>Get pairing code</button>
                  {st?.pairingCode && <p className="text-3xl font-bold tracking-widest text-foreground">{st.pairingCode}</p>}
                  <p className="text-xs text-muted-foreground">WhatsApp → Linked devices → Link with phone number → enter the code.</p>
                </div>
              )}
            </>
          )}
        </section>

        <section className={ui.card + " space-y-3"}>
          <h2 className="font-semibold text-foreground">OTP message template</h2>
          <textarea className={ui.input + " min-h-28"} value={tpl} onChange={(e) => setTpl(e.target.value)} />
          <p className="text-xs text-muted-foreground">Placeholders: {"{otp}"} (required), {"{minutes}"}, {"{app}"}. Use *text* for bold.</p>
          <div className="flex items-center gap-2">
            <label className="text-sm text-foreground">Valid for (min)</label>
            <input type="number" min={1} max={60} className={ui.input + " w-24"} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            <button className={ui.btn} onClick={() => act(async () => { await api("/admin/settings", "PUT", { otpTemplate: tpl, otpMinutes: minutes }); setSaved("Saved"); setTimeout(() => setSaved(""), 2000); })}>Save</button>
            <span className="text-sm text-muted-foreground">{saved}</span>
          </div>
        </section>

        <section className={ui.card + " space-y-3"}>
          <h2 className="font-semibold text-foreground">Send a notification</h2>
          <input className={ui.input} placeholder="919876543210" value={to} onChange={(e) => setTo(e.target.value)} />
          <textarea className={ui.input} placeholder="Message" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button className={ui.btn} disabled={!connected} onClick={() => act(() => api("/admin/send", "POST", { phone: to, message: msg }))}>Send</button>
        </section>

        <section className={ui.card + " space-y-2"}>
          <h2 className="font-semibold text-foreground">Users</h2>
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium text-foreground">{u.email} <span className="text-muted-foreground">({u.role}{u.disabled ? ", disabled" : ""})</span></p>
                <p className="text-muted-foreground">{u.keys} active keys · {u.sent} sent</p>
              </div>
              {u.id !== getUser()?.id && (
                <div className="flex gap-2">
                  <button className={ui.btn2} onClick={() => act(async () => { await api(`/admin/users/${u.id}`, "PATCH", { disabled: !u.disabled }); await loadUsers(); })}>{u.disabled ? "Enable" : "Disable"}</button>
                  <button className={ui.btn2} onClick={() => act(async () => { await api(`/admin/users/${u.id}`, "PATCH", { role: u.role === "admin" ? "user" : "admin" }); await loadUsers(); })}>{u.role === "admin" ? "Make user" : "Make admin"}</button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className={ui.card}>
          <h2 className="mb-2 font-semibold text-foreground">Logs</h2>
          <div className="max-h-64 overflow-auto font-mono text-xs text-muted-foreground">
            {logs.map((l, i) => <div key={i}>{new Date(l.time).toLocaleTimeString()} – {l.msg}</div>)}
          </div>
        </section>
      </main>
    </div>
  );
}
