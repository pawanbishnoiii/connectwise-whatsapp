import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, getUser, setSession, ui, type User } from "@/lib/gateway";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WA Gateway – WhatsApp OTP API" },
      { name: "description", content: "Sign in to generate an API key and send WhatsApp OTPs from your app." },
      { property: "og:title", content: "WA Gateway – WhatsApp OTP API" },
      { property: "og:description", content: "Generate an API key and send WhatsApp OTPs in one request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getUser()) nav({ to: "/dashboard", replace: true });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ token: string; user: User }>(`/auth/${mode}`, "POST", { email, password, name });
      setSession(r.token, r.user);
      nav({ to: r.user.role === "admin" ? "/admin" : "/dashboard" });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-4xl gap-6 p-4 md:grid-cols-2">
        <section className="space-y-3 pt-4">
          <h1 className="text-3xl font-bold text-foreground">WhatsApp OTP API</h1>
          <p className="text-muted-foreground">
            Create an account, generate an API key and send OTPs to any WhatsApp number. No WhatsApp setup needed on your side — the admin manages the device.
          </p>
          <Link to="/api" className={ui.btn2 + " inline-block"}>Read the API docs</Link>
        </section>
        <form onSubmit={submit} className={ui.card + " space-y-3"}>
          <div className="flex gap-2">
            <button type="button" className={mode === "login" ? ui.btn : ui.btn2} onClick={() => setMode("login")}>Login</button>
            <button type="button" className={mode === "register" ? ui.btn : ui.btn2} onClick={() => setMode("register")}>Register</button>
          </div>
          {mode === "register" && <input className={ui.input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
          <input className={ui.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className={ui.input} type="password" placeholder="Password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button className={ui.btn + " w-full"} disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Login" : "Create account"}</button>
          <p className="text-xs text-muted-foreground">The first account registered becomes the admin.</p>
        </form>
      </main>
    </div>
  );
}
