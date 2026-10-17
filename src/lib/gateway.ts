export const GATEWAY_URL = "https://connectwise-whatsapp.onrender.com";

export type User = { id: string; email: string; name?: string; role: "admin" | "user"; disabled?: boolean };

export function getToken() {
  return typeof window === "undefined" ? "" : localStorage.getItem("wa_token") || "";
}
export function setSession(token: string, user: User) {
  localStorage.setItem("wa_token", token);
  localStorage.setItem("wa_user", JSON.stringify(user));
}
export function getUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("wa_user") || "null");
  } catch {
    return null;
  }
}
export function logout() {
  localStorage.removeItem("wa_token");
  localStorage.removeItem("wa_user");
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(GATEWAY_URL + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

export const ui = {
  card: "rounded-xl border border-border bg-card p-4 shadow-sm",
  input: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground",
  btn: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
  btn2: "rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent",
};
