import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, PackageX, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { apiGet } from "@/lib/api";
import { colorMeta, productName } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Catalog, DashboardSummary, Movement } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorSwatch } from "@/components/ColorSwatch";
import { QuantityDelta, TypeBadge } from "@/components/movement";

const LABEL = "text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground";

interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  testId: string;
  valueClass?: string;
}

function MetricCard({ label, value, hint, icon, testId, valueClass }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <p className={LABEL}>{label}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className={`mt-2 font-medium tracking-tight ${valueClass ?? "font-mono text-3xl"}`} data-testid={testId}>
          {value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardSummary>("/dashboard"),
  });
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const recentQuery = useQuery({
    queryKey: ["movements", "recent"],
    queryFn: () => apiGet<Movement[]>("/movements?limit=8"),
  });

  const summary = summaryQuery.data;
  const recent = recentQuery.data ?? [];
  const topSold = summary?.top_sold ?? [];
  const top = topSold[0];
  const totalVariants = (catalogQuery.data?.products ?? []).reduce(
    (acc, p) => acc + p.colors.length * p.sizes.length,
    0
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Painel de Estoque</h1>
          <p className="mt-1 text-base text-muted-foreground">
            O que você compra e vende no seu e-commerce, em um só lugar.
          </p>
        </div>
        <Link to="/estoque" className={buttonVariants()} data-testid="dashboard-go-stock">
          Abrir Estoque
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          testId="stock-summary-total-pieces"
          label="Total de Peças"
          value={summary ? String(summary.total_pieces) : "—"}
          hint="em estoque agora"
          icon={<Boxes className="size-4" />}
        />
        <MetricCard
          testId="stock-summary-zero-stock"
          label="Variantes Zeradas"
          value={summary ? String(summary.zero_stock) : "—"}
          hint={totalVariants ? `de ${totalVariants} no catálogo` : "no catálogo"}
          icon={<PackageX className="size-4" />}
        />
        <MetricCard
          testId="stock-summary-low-stock"
          label="Baixo Estoque"
          value={summary ? String(summary.low_stock) : "—"}
          hint="de 1 a 3 peças"
          icon={<AlertTriangle className="size-4" />}
        />
        <MetricCard
          testId="stock-summary-top-sold"
          label="Mais Vendido"
          value={top ? `${productName(top.product_type)} ${colorMeta(top.color).name} · ${top.size}` : "—"}
          hint={top ? `${top.total_sold} peças vendidas` : "sem vendas registradas"}
          icon={<TrendingUp className="size-4" />}
          valueClass="font-heading text-xl font-bold leading-tight"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">Mais Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {topSold.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma venda registrada ainda. Registre saídas no Estoque para ver o ranking.
              </p>
            ) : (
              <ol className="space-y-3">
                {topSold.map((item, index) => (
                  <li
                    key={`${item.product_type}-${item.color}-${item.size}`}
                    data-testid={`top-sold-row-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <ColorSwatch color={item.color} />
                      <span>
                        {productName(item.product_type)} {colorMeta(item.color).name} · {item.size}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-medium">{item.total_sold} vendidos</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">Movimentações Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma movimentação registrada ainda.
              </p>
            ) : (
              <ul className="space-y-3">
                {recent.map((m) => (
                  <li
                    key={m.id}
                    data-testid={`recent-movement-${m.id}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeBadge kind={m.kind} />
                      <span className="truncate">
                        {productName(m.product_type)} {colorMeta(m.color).name} · {m.size}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <QuantityDelta kind={m.kind} quantity={m.quantity} />
                      <span className="hidden text-xs text-muted-foreground md:inline">
                        {formatDateTime(m.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
