import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Nav } from "@/components/Nav";
import { GATEWAY_URL, ui } from "@/lib/gateway";

export const Route = createFileRoute("/api")({
  head: () => ({
    meta: [
      { title: "API Documentation – WA Gateway" },
      { name: "description", content: "Complete REST API reference for sending and verifying WhatsApp OTPs." },
      { property: "og:title", content: "WA Gateway API Documentation" },
      { property: "og:description", content: "Send and verify WhatsApp OTPs with a simple REST API." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Docs,
});

const B = GATEWAY_URL;

const endpoints = [
  {
    id: "send", method: "POST", path: "/api/v1/otp/send", title: "Send OTP",
    desc: "Generates a code (or uses yours), sends it to the WhatsApp number using the admin's template and stores it for verification.",
    params: [
      ["phone", "string", "required", "Number with country code, digits only, e.g. 919876543210. 10-digit numbers get +91 automatically."],
      ["otp", "string", "optional", "Your own 4–8 digit code. If omitted, one is generated."],
      ["length", "number", "optional", "Length of generated code, 4–8 (default 6)."],
      ["app_name", "string", "optional", "Fills the {app} placeholder in the template."],
      ["return_otp", "boolean", "optional", "Return the code in the response (for your own server-side checks)."],
    ],
    body: { phone: "919876543210" },
    response: { success: true, phone: "919876543210", message_id: "3EB0C4…", expires_in: 300 },
  },
  {
    id: "verify", method: "POST", path: "/api/v1/otp/verify", title: "Verify OTP",
    desc: "Checks the code the user typed. Codes are single-use, expire after the configured minutes, and allow 5 attempts.",
    params: [
      ["phone", "string", "required", "Same number the OTP was sent to."],
      ["otp", "string", "required", "Code entered by the user."],
    ],
    body: { phone: "919876543210", otp: "482913" },
    response: { success: true, verified: true, phone: "919876543210" },
  },
  {
    id: "message", method: "POST", path: "/api/v1/message/send", title: "Send text message",
    desc: "Send any text notification (order updates, alerts) up to 4000 characters.",
    params: [
      ["phone", "string", "required", "Recipient with country code."],
      ["message", "string", "required", "Text. *bold*, _italic_ and line breaks supported."],
    ],
    body: { phone: "919876543210", message: "Your order #1042 has shipped!" },
    response: { success: true, phone: "919876543210", message_id: "3EB0…" },
  },
  {
    id: "status", method: "GET", path: "/api/v1/status", title: "Gateway status",
    desc: "Check whether the WhatsApp device is online before sending.",
    params: [], body: null, response: { success: true, device: "connected" },
  },
];

function snippet(lang: string, e: (typeof endpoints)[number]) {
  const body = e.body ? JSON.stringify(e.body) : "";
  if (lang === "curl")
    return `curl -X ${e.method} ${B}${e.path} \\\n  -H "Authorization: Bearer YOUR_API_KEY"${body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'` : ""}`;
  if (lang === "js")
    return `const res = await fetch("${B}${e.path}", {\n  method: "${e.method}",\n  headers: {\n    "Authorization": "Bearer " + process.env.WA_API_KEY,\n    "Content-Type": "application/json",\n  },${body ? `\n  body: JSON.stringify(${body}),` : ""}\n});\nconst data = await res.json();\nif (!data.success) throw new Error(data.error);`;
  if (lang === "python")
    return `import os, requests\n\nr = requests.${e.method.toLowerCase()}(\n    "${B}${e.path}",\n    headers={"Authorization": f"Bearer {os.environ['WA_API_KEY']}"},${body ? `\n    json=${body.replace(/true/g, "True")},` : ""}\n    timeout=30,\n)\nprint(r.json())`;
  return `<?php\n$ch = curl_init("${B}${e.path}");\ncurl_setopt_array($ch, [\n  CURLOPT_CUSTOMREQUEST => "${e.method}",\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "Authorization: Bearer " . getenv("WA_API_KEY"),\n    "Content-Type: application/json",\n  ],${body ? `\n  CURLOPT_POSTFIELDS => '${body}',` : ""}\n]);\n$data = json_decode(curl_exec($ch), true);`;
}

function Code({ e }: { e: (typeof endpoints)[number] }) {
  const [lang, setLang] = useState("curl");
  return (
    <div className="rounded-md border border-border">
      <div className="flex gap-1 border-b border-border p-1">
        {["curl", "js", "python", "php"].map((l) => (
          <button key={l} onClick={() => setLang(l)} className={"rounded px-2 py-1 text-xs " + (lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <pre className="overflow-auto bg-muted p-3 text-xs text-foreground">{snippet(lang, e)}</pre>
    </div>
  );
}

function Docs() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl space-y-6 p-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">API Documentation</h1>
          <p className="mt-2 text-muted-foreground">Send and verify WhatsApp OTPs from any backend. You don't need WhatsApp set up — the gateway admin's device delivers the messages.</p>
        </div>

        <section className={ui.card + " space-y-2 text-sm text-foreground"}>
          <h2 className="text-lg font-semibold">Quick start</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Register / log in on the home page.</li>
            <li>Open Dashboard → Generate a key. Copy it (shown once).</li>
            <li>Call <code>POST /api/v1/otp/send</code> with the user's phone.</li>
            <li>When the user types the code, call <code>POST /api/v1/otp/verify</code>.</li>
          </ol>
          <p><b>Base URL:</b> <code className="break-all">{B}</code></p>
          <p><b>Auth:</b> header <code>Authorization: Bearer wag_xxx</code> (or <code>x-api-key: wag_xxx</code>). Keep keys on your server, never in browser/mobile code.</p>
        </section>

        {endpoints.map((e) => (
          <section key={e.id} id={e.id} className={ui.card + " space-y-3"}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{e.method}</span>
              <code className="text-sm text-foreground">{e.path}</code>
              <span className="ml-auto font-semibold text-foreground">{e.title}</span>
            </div>
            <p className="text-sm text-muted-foreground">{e.desc}</p>
            {e.params.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground"><tr><th className="p-1">Field</th><th className="p-1">Type</th><th className="p-1"></th><th className="p-1">Description</th></tr></thead>
                  <tbody className="text-foreground">
                    {e.params.map((p) => (
                      <tr key={p[0]} className="border-t border-border"><td className="p-1 font-mono">{p[0]}</td><td className="p-1">{p[1]}</td><td className="p-1">{p[2]}</td><td className="p-1">{p[3]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Code e={e} />
            <p className="text-xs font-semibold text-foreground">Response 200</p>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">{JSON.stringify(e.response, null, 2)}</pre>
          </section>
        ))}

        <section className={ui.card + " space-y-2 text-sm text-foreground"}>
          <h2 className="text-lg font-semibold">Errors</h2>
          <p>Errors return <code>{`{ "success": false, "error": "message" }`}</code>.</p>
          <table className="w-full text-left text-xs">
            <tbody>
              {[["400", "Invalid phone / incorrect OTP / number not on WhatsApp"], ["401", "Missing, invalid or revoked API key"], ["404", "No OTP pending for this number"], ["410", "OTP expired"], ["429", "Too many verify attempts (max 5)"], ["503", "WhatsApp device offline — retry later"]].map(([c, d]) => (
                <tr key={c} className="border-t border-border"><td className="p-1 font-mono">{c}</td><td className="p-1">{d}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={ui.card + " space-y-1 text-sm text-foreground"}>
          <h2 className="text-lg font-semibold">Best practices</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Rate-limit OTP requests per phone on your side (e.g. 1 per 60 s).</li>
            <li>Codes are stored in memory: a gateway restart invalidates pending codes — ask the user to resend.</li>
            <li>Check <code>/api/v1/status</code> and fall back to SMS/email if the device is offline.</li>
            <li>Revoke leaked keys instantly from the Dashboard.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
