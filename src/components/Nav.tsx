import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getUser, logout, type User } from "@/lib/gateway";

export function Nav() {
  const [u, setU] = useState<User | null>(null);
  const nav = useNavigate();
  useEffect(() => setU(getUser()), []);
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <Link to="/" className="mr-auto font-bold text-foreground">WA Gateway</Link>
        <Link to="/api" className="text-muted-foreground hover:text-foreground">API Docs</Link>
        {u ? (
          <>
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            {u.role === "admin" && <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>}
            <button className="text-muted-foreground hover:text-foreground" onClick={() => { logout(); setU(null); nav({ to: "/", replace: true }); }}>
              Logout
            </button>
          </>
        ) : (
          <Link to="/" className="text-muted-foreground hover:text-foreground">Login</Link>
        )}
      </div>
    </header>
  );
}
