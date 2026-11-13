import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { colorMeta, productName } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Movement } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorSwatch } from "@/components/ColorSwatch";
import { QuantityDelta, TypeBadge } from "@/components/movement";

const TYPE_LABELS: Record<string, string> = { todas: "Todas", entrada: "Entradas", saida: "Saídas" };

export default function Historico() {
  const [kindFilter, setKindFilter] = useState("todas");
  const movementsQuery = useQuery({
    queryKey: ["movements", kindFilter],
    queryFn: () => apiGet<Movement[]>(`/movements${kindFilter === "todas" ? "" : `?kind=${kindFilter}`}`),
  });
  const movements = movementsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Histórico de Movimentações
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo o que entrou e saiu do estoque, com data e observação.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <Label htmlFor="history-type" className="text-sm text-muted-foreground">
            Tipo
          </Label>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as string)}>
            <SelectTrigger id="history-type" className="w-40" data-testid="history-filter-movement-type">
              <SelectValue>{(v) => TYPE_LABELS[v as string]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Link to="/estoque" className={buttonVariants({ variant: "outline" })} data-testid="history-go-stock">
          Registrar nova movimentação
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <Table data-testid="table-movement-history">
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Cor</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movementsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Carregando movimentações...
                </TableCell>
              </TableRow>
            ) : movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação registrada ainda. Vá ao Estoque e registre sua primeira entrada.
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id} data-testid={`movement-row-${m.id}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {formatDateTime(m.created_at)}
                  </TableCell>
                  <TableCell>
                    <TypeBadge kind={m.kind} />
                  </TableCell>
                  <TableCell className="text-sm font-medium">{productName(m.product_type)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <ColorSwatch color={m.color} />
                      <span className="text-sm">{colorMeta(m.color).name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.size}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <QuantityDelta kind={m.kind} quantity={m.quantity} />
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {m.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
