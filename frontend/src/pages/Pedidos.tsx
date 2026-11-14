import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { colorMeta, productName, productNamePlural } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Catalog, Order, OrderCreate, StockItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import OrderReceipt from "@/components/OrderReceipt";

const COLOR_ALL = "todas";

function orderLabel(number: number): string {
  return `#${String(number).padStart(3, "0")}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    return String((error.body as { detail: unknown }).detail);
  }
  return "Algo deu errado. Tente novamente.";
}

export default function Pedidos() {
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiGet<Order[]>("/orders") });
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const stockQuery = useQuery({ queryKey: ["stock"], queryFn: () => apiGet<StockItem[]>("/stock") });

  const orders = ordersQuery.data ?? [];
  const products = catalogQuery.data?.products ?? [];
  const stock = stockQuery.data ?? [];

  const openOrder = orders.find((o) => o.status === "aberto") ?? null;
  const finalizedOrders = orders.filter((o) => o.status === "finalizado");
  const nextNumber = orders.length ? Math.max(...orders.map((o) => o.number)) + 1 : 1;

  // cabeçalho do novo pedido
  const [comprador, setComprador] = useState("");
  const [separador, setSeparador] = useState("");

  // seleção de item para adicionar
  const [selProduct, setSelProduct] = useState("camiseta");
  const [selColor, setSelColor] = useState<string | null>(null);
  const [selSize, setSelSize] = useState("P");
  const [qty, setQty] = useState("1");

  const selProductDef = products.find((p) => p.id === selProduct);
  const selColorValue = selColor ?? selProductDef?.colors[0] ?? "";
  const selSizes = selProductDef?.sizes ?? [];
  const selSizeValue = selSizes.includes(selSize) ? selSize : (selSizes[0] ?? "");
  const selectedVariant = stock.find(
    (s) => s.product_type === selProduct && s.color === selColorValue && s.size === selSizeValue
  );
  const qtyNum = Number.parseInt(qty, 10);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 1;
  const qtyExceedsStock = selectedVariant != null && qtyValid && qtyNum > selectedVariant.quantity;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["movements"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createOrder = useMutation({
    mutationFn: (body: OrderCreate) => apiPost<Order>("/orders", body),
    onSuccess: (order) => {
      toast.success(`Pedido ${orderLabel(order.number)} iniciado!`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setComprador("");
      setSeparador("");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addItem = useMutation({
    mutationFn: (body: { item_id: string; quantity: number }) =>
      apiPost<Order>(`/orders/${openOrder?.id ?? ""}/items`, body),
    onSuccess: () => {
      toast.success("Item adicionado ao pedido!");
      invalidate();
      setQty("1");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggleItem = useMutation({
    mutationFn: (body: { rowId: string; picked: boolean }) =>
      apiPatch<Order>(`/orders/${openOrder?.id ?? ""}/items/${body.rowId}`, { picked: body.picked }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeItem = useMutation({
    mutationFn: (rowId: string) => apiDelete(`/orders/${openOrder?.id ?? ""}/items/${rowId}`),
    onSuccess: () => {
      toast.success("Item removido do pedido.");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const finalizeOrder = useMutation({
    mutationFn: () => apiPost<Order>(`/orders/${openOrder?.id ?? ""}/finalize`),
    onSuccess: (order) => {
      toast.success(`Pedido ${orderLabel(order.number)} finalizado — estoque atualizado!`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancelOrder = useMutation({
    mutationFn: () => apiDelete(`/orders/${openOrder?.id ?? ""}`),
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // impressão: monta o comprovante e abre o diálogo de impressão
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (!printOrder) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintOrder(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [printOrder]);

  const pickedCount = openOrder?.items.filter((item) => item.picked).length ?? 0;
  const itemCount = openOrder?.items.length ?? 0;

  const submitNewOrder = (event: FormEvent) => {
    event.preventDefault();
    if (!comprador.trim() || !separador.trim()) return;
    createOrder.mutate({ comprador: comprador.trim(), separador: separador.trim() });
  };

  const submitAddItem = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVariant || !qtyValid) {
      toast.error("Escolha o produto, a cor, o tamanho e uma quantidade válida.");
      return;
    }
    addItem.mutate({ item_id: selectedVariant.id, quantity: qtyNum });
  };

  return (
    <>
      <div className="screen-only space-y-8">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
            Montagem de Pedidos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre as saídas, marque cada item separado e imprima o comprovante.
          </p>
        </div>

        {openOrder === null ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl">Novo Pedido</CardTitle>
              <CardDescription>
                Número gerado automaticamente:{" "}
                <span className="font-mono font-semibold" data-testid="order-next-number">
                  {orderLabel(nextNumber)}
                </span>{" "}
                · data e hora automáticas do registro
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                data-testid="form-new-order"
                onSubmit={submitNewOrder}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="order-comprador">Nome do Comprador</Label>
                  <Input
                    id="order-comprador"
                    data-testid="input-order-comprador"
                    value={comprador}
                    onChange={(e) => setComprador(e.target.value)}
                    placeholder="Quem comprou"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-separador">Nome do Separador</Label>
                  <Input
                    id="order-separador"
                    data-testid="input-order-separador"
                    value={separador}
                    onChange={(e) => setSeparador(e.target.value)}
                    placeholder="Quem está separando"
                  />
                </div>
                <Button
                  type="submit"
                  data-testid="btn-create-order"
                  className="sm:col-span-2"
                  disabled={createOrder.isPending || !comprador.trim() || !separador.trim()}
                >
                  <Plus className="mr-2 size-4" />
                  {createOrder.isPending ? "Iniciando..." : "Iniciar Pedido"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-heading text-xl" data-testid="order-number">
                    Pedido {orderLabel(openOrder.number)}
                  </CardTitle>
                  <CardDescription data-testid="order-date">
                    {formatDateTime(openOrder.created_at)} · Comprador: {openOrder.comprador} ·
                    Separador: {openOrder.separador}
                  </CardDescription>
                </div>
                <Button variant="outline" data-testid="btn-print-order" onClick={() => setPrintOrder(openOrder)}>
                  <Printer className="mr-2 size-4" /> Imprimir Pedido
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <form
                  data-testid="form-add-order-item"
                  onSubmit={submitAddItem}
                  className="flex flex-wrap items-end gap-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="add-product">Produto</Label>
                    <Select
                      value={selProduct}
                      onValueChange={(v) => {
                        setSelProduct(v as string);
                        setSelColor(null);
                      }}
                    >
                      <SelectTrigger id="add-product" className="w-36" data-testid="order-add-product-select">
                        <SelectValue>{(v) => productNamePlural(v as string)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="add-color">Cor</Label>
                    <Select value={selColorValue} onValueChange={(v) => setSelColor(v as string)}>
                      <SelectTrigger id="add-color" className="w-36" data-testid="order-add-color-select">
                        <SelectValue>{(v) => colorMeta(v as string).name}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(selProductDef?.colors ?? []).map((c) => (
                          <SelectItem key={c} value={c}>
                            {colorMeta(c).name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="add-size">Tamanho</Label>
                    <Select value={selSizeValue} onValueChange={(v) => setSelSize(v as string)}>
                      <SelectTrigger id="add-size" className="w-24" data-testid="order-add-size-select">
                        <SelectValue>{(v) => v}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {selSizes.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="add-quantity">Quantidade de saída</Label>
                    <Input
                      id="add-quantity"
                      data-testid="order-add-quantity"
                      type="number"
                      min={1}
                      step={1}
                      className="w-28"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    data-testid="btn-add-order-item"
                    disabled={!selectedVariant || !qtyValid || addItem.isPending}
                  >
                    <Plus className="mr-2 size-4" /> Adicionar
                  </Button>

                  <p className="text-xs text-muted-foreground" data-testid="order-add-stock">
                    {selectedVariant ? `Em estoque: ${selectedVariant.quantity} peças` : "—"}
                  </p>
                </form>
                {qtyExceedsStock && (
                  <p className="mt-2 text-xs font-medium text-amber-600">
                    A quantidade passa do estoque disponível — o pedido só será finalizado se houver estoque.
                  </p>
                )}
              </div>

              <div>
                {openOrder.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground" data-testid="order-items-empty">
                    Nenhum item no pedido. Adicione os produtos acima.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {openOrder.items.map((item) => (
                      <li
                        key={item.id}
                        data-testid={`order-item-row-${item.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Checkbox
                            checked={item.picked}
                            onCheckedChange={(v) =>
                              toggleItem.mutate({ rowId: item.id, picked: v === true })
                            }
                            data-testid={`order-item-checkbox-${item.id}`}
                            aria-label={`Marcar ${productName(item.product_type)} ${colorMeta(item.color).name} ${item.size} como separado`}
                          />
                          <span className="truncate text-sm">
                            {productName(item.product_type)} {colorMeta(item.color).name} · {item.size}
                          </span>
                          {item.picked && (
                            <Badge className="border-transparent bg-[#DCFCE7] text-[#14532D] hover:bg-[#DCFCE7]">
                              Separado
                            </Badge>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="font-mono text-sm font-medium">{item.quantity} un.</span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Remover item do pedido"
                            data-testid={`btn-remove-item-${item.id}`}
                            onClick={() => removeItem.mutate(item.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-sm text-muted-foreground" data-testid="order-picked-count">
                  Separados: {pickedCount} de {itemCount} itens — ao finalizar, só os separados são
                  abatidos do estoque.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    data-testid="btn-cancel-order"
                    onClick={() => cancelOrder.mutate()}
                    disabled={cancelOrder.isPending}
                  >
                    Cancelar Pedido
                  </Button>
                  <Button
                    data-testid="btn-finalize-order"
                    onClick={() => finalizeOrder.mutate()}
                    disabled={pickedCount === 0 || finalizeOrder.isPending}
                  >
                    <Check className="mr-2 size-4" />
                    {finalizeOrder.isPending ? "Finalizando..." : "Finalizar e Abater Estoque"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">Histórico de Pedidos Montados</CardTitle>
            <CardDescription>
              Pedidos finalizados — as saídas também entram no Histórico de Movimentações.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {finalizedOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground" data-testid="order-history-empty">
                Nenhum pedido montado ainda. Inicie o primeiro acima.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <Table data-testid="table-order-history">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead>Separador</TableHead>
                      <TableHead>Baixa</TableHead>
                      <TableHead className="text-right">Imprimir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finalizedOrders.map((order) => (
                      <TableRow key={order.id} data-testid={`order-row-${order.id}`}>
                        <TableCell className="font-mono text-sm font-semibold">
                          {orderLabel(order.number)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {formatDateTime(order.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">{order.comprador}</TableCell>
                        <TableCell className="text-sm">{order.separador}</TableCell>
                        <TableCell className="text-sm">
                          {order.items.filter((i) => i.picked).length}/{order.items.length} itens ·{" "}
                          {order.items.reduce((acc, i) => acc + (i.picked ? i.quantity : 0), 0)} peças
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`btn-print-order-${order.id}`}
                            onClick={() => setPrintOrder(order)}
                          >
                            <Printer className="mr-2 size-3.5" /> Imprimir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {printOrder && <OrderReceipt order={printOrder} />}
    </>
  );
}
