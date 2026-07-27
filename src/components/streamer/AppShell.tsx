import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, LayoutGrid, RefreshCw, Sun, Moon, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { POLL_MS } from "@/lib/streamer/api";

const nav = [
  { to: "/", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/incidents", label: "Reliability", icon: AlertTriangle, exact: false },
  { to: "/symbols", label: "Symbols", icon: Coins, exact: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [now, setNow] = useState(Date.now());
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-[--surface-1]">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <div className="relative grid h-7 w-7 place-items-center rounded-md bg-[--primary]">
            <Activity className="h-4 w-4 text-[--primary-foreground]" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold tracking-tight">Streamer Status</span>
            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-widest">ops</span>
          </div>
        </div>
        <nav className="flex flex-col p-2 gap-0.5">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-[--surface-3] text-foreground"
                    : "text-muted-foreground hover:bg-[--surface-2] hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-3 text-[10px] font-mono text-muted-foreground border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[--status-up]" />
            <span>LIVE</span>
          </div>
          <div className="mt-1">poll {Math.round(POLL_MS / 1000)}s</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[--background]/85 backdrop-blur px-4 sm:px-6 h-14">
          <div className="md:hidden flex items-center gap-2">
            <Activity className="h-4 w-4 text-[--primary]" />
            <span className="text-sm font-semibold">Streamer Status</span>
          </div>
          <div className="hidden md:block text-xs font-mono text-muted-foreground">
            {new Date(now).toLocaleTimeString()}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => qc.invalidateQueries()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-[--surface-1] px-2.5 py-1 text-xs font-medium hover:bg-[--surface-2] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="grid place-items-center h-7 w-7 rounded-md border border-border bg-[--surface-1] hover:bg-[--surface-2] transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>

        {/* Mobile nav strip */}
        <div className="md:hidden flex items-center gap-1 border-b border-border px-2 py-1 overflow-x-auto">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap",
                  active ? "bg-[--surface-3] text-foreground" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </div>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
