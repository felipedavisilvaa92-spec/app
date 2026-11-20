import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, Download, PackageX, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import { exportExcel } from "@/lib/excel";
import { colorMeta, productName } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Catalog, DashboardSummary, Movement } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColorSwatch } from "@/components/ColorSwatch";
import { QuantityDelta, TypeBadge } from "@/components/movement";

interface MetricCardProps { label: string; value: string; hint: string; icon: ReactNode; testId: string; tone: string; }
function MetricCard({ label, value, hint, icon, testId, tone }: MetricCardProps) {
  return <Card className="overflow-hidden border-slate-200/80 shadow-sm transition-shadow hover:shadow-md">
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-center justify-between"><span className={`grid size-10 place-items-center rounded-xl ${tone}`}>{icon}</span><span className="text-xs font-medium uppercase tracking-wider text-slate-400">Resumo</span></div>
      <p className="mt-5 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-slate-900" data-testid={testId}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </CardContent>
  </Card>;
}

function consolidateRecentMovements(movements: Movement[]) {
  const consolidated = new Map<string, Movement>();
  for (const movement of movements) {
    const key = movement.kind === "saida" && movement.order_number != null
      ? JSON.stringify([movement.order_number, movement.created_at.slice(0, 10), movement.product_type, movement.color, movement.size, movement.kind])
      : movement.id;
    const existing = consolidated.get(key);
    if (existing) consolidated.set(key, { ...existing, quantity: existing.quantity + movement.quantity });
    else consolidated.set(key, { ...movement });
  }
  return [...consolidated.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 8);
}

export default function Dashboard() {
  const summaryQuery = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardSummary>("/dashboard") });
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const recentQuery = useQuery({ queryKey: ["movements", "recent"], queryFn: () => apiGet<Movement[]>("/movements?limit=50") });
  const exportMutation = useMutation({ mutationFn: exportExcel, onSuccess: () => toast.success("Planilha baixada com sucesso!"), onError: () => toast.error("Não foi possível gerar a planilha.") });
  const summary = summaryQuery.data;
  const recent = consolidateRecentMovements(recentQuery.data ?? []);
  const topSold = summary?.top_sold ?? [];
  const top = topSold[0];
  const totalVariants = (catalogQuery.data?.products ?? []).reduce((acc, p) => acc + p.colors.length * p.sizes.length, 0);

  return <div className="space-y-7 sm:space-y-9">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visão geral</p><h1 className="font-heading text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Painel de Estoque</h1><p className="mt-2 max-w-xl text-sm text-slate-500 sm:text-base">Acompanhe o estoque e as movimentações da sua loja em um só lugar.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-slate-200 bg-white" data-testid="dashboard-export-button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}><Download className="mr-2 size-4" />{exportMutation.isPending ? "Gerando..." : "Exportar Excel"}</Button><Link to="/estoque" className={buttonVariants()} data-testid="dashboard-go-stock">Abrir Estoque<ArrowRight className="ml-2 size-4" /></Link></div>
    </header>

    <section aria-label="Indicadores do estoque" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard testId="stock-summary-total-pieces" label="Total de Peças" value={summary ? String(summary.total_pieces) : "—"} hint="peças disponíveis em estoque" icon={<Boxes className="size-5 text-blue-700" />} tone="bg-blue-50" />
      <MetricCard testId="stock-summary-zero-stock" label="Variantes em Falta" value={summary ? String(summary.zero_stock) : "—"} hint={totalVariants ? `de ${totalVariants} variantes no catálogo` : "variantes sem unidades disponíveis"} icon={<PackageX className="size-5 text-red-700" />} tone="bg-red-50" />
      <MetricCard testId="stock-summary-low-stock" label="Estoque Baixo" value={summary ? String(summary.low_stock) : "—"} hint="variantes que precisam de atenção" icon={<AlertTriangle className="size-5 text-amber-700" />} tone="bg-amber-50" />
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="font-heading text-lg">Mais Vendidos</CardTitle><p className="mt-1 text-sm text-slate-500">Produtos com maior saída</p></div><TrendingUp className="size-5 text-slate-400" /></CardHeader>
        <CardContent>{topSold.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma venda registrada ainda.</p> : <ol className="divide-y divide-slate-100">{topSold.map((item, index) => <li key={`${item.product_type}-${item.color}-${item.size}`} data-testid={`top-sold-row-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span className="flex min-w-0 items-center gap-2.5 text-sm"><span className="font-mono text-xs text-slate-400">{String(index + 1).padStart(2, "0")}</span><ColorSwatch color={item.color} /><span className="truncate font-medium text-slate-700">{productName(item.product_type)} {colorMeta(item.color).name} · {item.size}</span></span><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-700">{item.total_sold} vendidos</span></li>)}</ol>}</CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="font-heading text-lg">Movimentações Recentes</CardTitle><p className="mt-1 text-sm text-slate-500">Últimas entradas e saídas do estoque</p></div><Link to="/historico" className="text-sm font-medium text-slate-600 hover:text-slate-950">Ver histórico <ArrowRight className="ml-1 inline size-3.5" /></Link></CardHeader>
        <CardContent className="px-0 pb-2 pt-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50/80"><TableHead className="pl-6">Movimentação</TableHead><TableHead className="hidden sm:table-cell">Tipo</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="pr-6 text-right">Data</TableHead></TableRow></TableHeader><TableBody>{recent.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">Nenhuma movimentação registrada ainda.</TableCell></TableRow> : recent.map((m) => <TableRow key={m.id} data-testid={`recent-movement-${m.id}`}><TableCell className="max-w-[230px] pl-6"><span className="block truncate text-sm font-medium text-slate-800">{productName(m.product_type)} {colorMeta(m.color).name} · {m.size}</span><span className="mt-1 sm:hidden"><TypeBadge kind={m.kind} /></span></TableCell><TableCell className="hidden sm:table-cell"><TypeBadge kind={m.kind} /></TableCell><TableCell className="text-right"><QuantityDelta kind={m.kind} quantity={m.quantity} /></TableCell><TableCell className="whitespace-nowrap pr-6 text-right text-xs text-slate-500">{formatDateTime(m.created_at)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent>
      </Card>
    </section>
    {top && <p className="text-xs text-slate-400">Destaque de vendas: {productName(top.product_type)} {colorMeta(top.color).name} · {top.size}</p>}
  </div>;
}
