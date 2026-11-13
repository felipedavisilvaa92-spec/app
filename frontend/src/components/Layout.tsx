import { Link, NavLink, Outlet } from "react-router-dom";
import { Shirt } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import BackupMenu from "@/components/BackupMenu";

const NAV_ITEMS = [
  { to: "/", label: "Painel", testId: "nav-painel" },
  { to: "/estoque", label: "Estoque", testId: "nav-estoque" },
  { to: "/pedidos", label: "Pedidos", testId: "nav-pedidos" },
  { to: "/historico", label: "Histórico", testId: "nav-historico" },
];

export default function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <header className="screen-only sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-xs backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shirt className="size-4" />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">Estoque</span>
          </Link>
          <nav className="flex items-center gap-1">
            <BackupMenu />
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                data-testid={item.testId}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
