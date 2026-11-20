import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Boxes, ClipboardList, LayoutDashboard, LogOut, Package, Settings2, Shirt, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import BackupMenu from "@/components/BackupMenu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/estoque", label: "Etiquetas", icon: Package },
  { to: "/equipe", label: "Equipe", icon: Users },
];

export default function Layout({ userEmail, isOwner, shopName }: { userEmail?: string; isOwner?: boolean; shopName?: string }) {
  const location = useLocation();
  const currentLabel = location.pathname === "/estoque" && location.hash === "#etiquetas" ? "Etiquetas" : undefined;
  const navClass = (active: boolean) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`;
  const mobileClass = (active: boolean) => `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-medium transition-colors ${active ? "text-slate-950" : "text-slate-500"}`;
  const navigation = (mobile = false) => NAV_ITEMS.map((item, index) => {
    const Icon = item.icon;
    const active = currentLabel ? item.label === currentLabel : (item.end ? location.pathname === item.to : location.pathname === item.to && item.label !== "Etiquetas");
    const to = item.label === "Etiquetas" ? "/estoque#etiquetas" : item.to;
    return <NavLink key={`${item.label}-${index}`} to={to} end={item.end} aria-label={item.label} className={mobile ? mobileClass(active) : navClass(active)}>
      <Icon className={mobile ? "size-5" : "size-[18px]"} strokeWidth={active ? 2.2 : 1.8} />
      <span className={mobile ? "truncate" : ""}>{item.label}</span>
    </NavLink>;
  });

  return <div className="min-h-svh bg-slate-50/80 text-slate-900">
    <aside className="screen-only fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
      <Link to="/" className="mb-9 flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white"><Shirt className="size-5" /></span>
        <span className="min-w-0"><span className="block truncate font-heading text-base font-bold">{shopName || "Estoque"}</span><span className="block text-xs text-slate-500">Gestão da loja</span></span>
      </Link>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Menu principal</p>
      <nav aria-label="Navegação principal" className="space-y-1">{navigation()}</nav>
      <div className="mt-auto space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">{userEmail?.[0]?.toUpperCase() || "U"}</span>
          <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-800">{userEmail || "Usuário"}</span><span className="block text-[11px] text-slate-500">{isOwner ? "Administrador" : "Equipe"}</span></span>
        </div>
        <div className="flex items-center justify-between px-1"><BackupMenu /><Button variant="ghost" size="sm" className="text-slate-500 hover:text-red-600" onClick={() => void supabase.auth.signOut()} aria-label="Sair da conta"><LogOut className="mr-2 size-4" />Sair</Button></div>
      </div>
    </aside>

    <header className="screen-only sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden">
      <Link to="/" className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white"><Shirt className="size-4" /></span><span className="truncate font-heading font-bold">{shopName || "Estoque"}</span></Link>
      <Button variant="ghost" size="icon" onClick={() => void supabase.auth.signOut()} aria-label="Sair da conta"><LogOut className="size-4" /></Button>
    </header>

    <main className="screen-only mx-auto min-h-svh max-w-[1600px] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:ml-64 lg:px-8 lg:py-9 lg:pb-10 xl:px-10">
      <Outlet />
    </main>

    <nav aria-label="Navegação mobile" className="screen-only fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1 backdrop-blur lg:hidden">
      {navigation(true)}
    </nav>
    <Toaster />
  </div>;
}
