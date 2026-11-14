import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { colorMeta, productNamePlural } from "@/lib/colors";
import type { Catalog, Movement, MovementCreate, MovementKind, StockItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorSwatch } from "@/components/ColorSwatch";

const COLOR_ALL = "todas";
const SIZE_ALL = "todos";

export default function Estoque() {
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const stockQuery = useQuery({ queryKey: ["stock"], queryFn: () => apiGet<StockItem[]>("/stock") });

  const products = catalogQuery.data?.products ?? [];
  const stock = stockQuery.data ?? [];

  const [productType, setProductType] = useState("camiseta");
  const [colorFilter, setColorFilter] = useState(COLOR_ALL);
  const [sizeFilter, setSizeFilter] = useState(SIZE_ALL);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("entrada");
  const [selProduct, setSelProduct] = useState("camiseta");
  const [selColor, setSelColor] = useState<string | null>(null);
  const [selSize, setSelSize] = useState("P");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");

  const product = products.find((p) => p.id === productType);
  const selProductDef = products.find((p) => p.id === selProduct);
  const selColorValue = selColor ?? selProductDef?.colors[0] ?? "";
  const selSizes = selProductDef?.sizes ?? [];
  const selSizeValue = selSizes.includes(selSize) ? selSize : (selSizes[0] ?? "");
  const selectedItem = stock.find(
    (s) => s.product_type === selProduct && s.color === selColorValue && s.size === selSizeValue
  );
  const qtyNum = Number.parseInt(qty, 10);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 1;
  const exceedsStock = kind === "saida" && selectedItem != null && qtyNum > selectedItem.quantity;

  const qtyOf = (color: string, size: string): number =>
    stock.find((s) => s.product_type === productType && s.color === color && s.size === size)?.quantity ?? 0;

  const openDialog = (color: string | null, size: string, moveKind: MovementKind) => {
    setSelProduct(productType);
    setSelColor(color);
    setSelSize(size);
    setKind(moveKind);
    setQty("1");
    setNote("");
    setDialogOpen(true);
  };

  const createMovement = useMutation({
    mutationFn: (body: MovementCreate) => apiPost<Movement>("/movements", body),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.kind === "entrada" ? "Entrada registrada com sucesso!" : "Saída registrada com sucesso!"
      );
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body
          ? String((error.body as { detail: unknown }).detail)
          : "Não foi possível registrar a movimentação.";
      toast.error(message);
    },
  });

  const submitMovement = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedItem || !qtyValid || exceedsStock) return;
    createMovement.mutate({
      item_id: selectedItem.id,
      kind,
      quantity: qtyNum,
      note: note.trim() ? note.trim() : null,
    });
  };

  if (!product) {
    return (
      <div className="space-y-6" data-testid="stock-loading">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Estoque</h1>
        <p className="text-sm text-muted-foreground">
          {catalogQuery.isLoading
            ? "Carregando catálogo..."
            : "Catálogo indisponível — verifique a conexão e recarregue a página."}
        </p>
      </div>
    );
  }

  const rows = product.colors.filter((color) => {
    if (colorFilter !== COLOR_ALL && color !== colorFilter) return false;
    if (search.trim() && !colorMeta(color).name.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    return true;
  });
  const cols = product.sizes.filter((size) => sizeFilter === SIZE_ALL || size === sizeFilter);
  const piecesOfProduct = stock
    .filter((s) => s.product_type === productType)
    .reduce((acc, s) => acc + s.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.name_plural} · {product.description} · {product.colors.length * product.sizes.length}{" "}
            variantes · {piecesOfProduct} peças em estoque
          </p>
        </div>
        <Button data-testid="btn-open-movement-modal" onClick={() => openDialog(null, "P", "entrada")}>
          <Plus className="mr-2 size-4" /> Nova Movimentação
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="sr-only" htmlFor="filter-product">
            Produto
          </Label>
          <Select
            value={productType}
            onValueChange={(v) => {
              setProductType(v as string);
              setColorFilter(COLOR_ALL);
              setSizeFilter(SIZE_ALL);
            }}
          >
            <SelectTrigger id="filter-product" className="w-40" data-testid="filter-product-type-select">
              <SelectValue>{(v) => productNamePlural(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name_plural}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="sr-only" htmlFor="filter-color">
            Cor
          </Label>
          <Select value={colorFilter} onValueChange={(v) => setColorFilter(v as string)}>
            <SelectTrigger id="filter-color" className="w-40" data-testid="filter-color-select">
              <SelectValue>
                {(v) => (v === COLOR_ALL ? "Todas as cores" : colorMeta(v as string).name)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COLOR_ALL}>Todas as cores</SelectItem>
              {product.colors.map((c) => (
                <SelectItem key={c} value={c}>
                  {colorMeta(c).name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="sr-only" htmlFor="filter-size">
            Tamanho
          </Label>
          <Select value={sizeFilter} onValueChange={(v) => setSizeFilter(v as string)}>
            <SelectTrigger id="filter-size" className="w-36" data-testid="filter-size-select">
              <SelectValue>
                {(v) => (v === SIZE_ALL ? "Todos os tamanhos" : (v as string))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIZE_ALL}>Todos os tamanhos</SelectItem>
              {product.sizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="stock-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cor..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <Table data-testid={`matrix-table-${productType}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Cor</TableHead>
              {cols.map((size) => (
                <TableHead key={size} className="text-center">
                  {size}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={cols.length + 2}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nenhuma cor encontrada com os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((color) => {
                const meta = colorMeta(color);
                const rowTotal = product.sizes.reduce((acc, s) => acc + qtyOf(color, s), 0);
                return (
                  <TableRow key={color}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <ColorSwatch color={color} />
                        <span className="text-sm font-medium">{meta.name}</span>
                      </span>
                    </TableCell>
                    {cols.map((size) => {
                      const q = qtyOf(color, size);
                      const qtyClass =
                        q === 0 ? "text-red-400" : q <= 3 ? "text-amber-600" : "text-foreground";
                      return (
                        <TableCell
                          key={size}
                          data-testid={`matrix-cell-${productType}-${color}-${size}`}
                          className="text-center"
                        >
                          <span className={`font-mono text-sm font-medium ${qtyClass}`}>{q}</span>
                          <span className="mt-1 flex items-center justify-center gap-1">
                            <Button
                              size="icon-xs"
                              variant="outline"
                              aria-label={`Registrar entrada de ${meta.name} tamanho ${size}`}
                              data-testid={`matrix-entrada-${productType}-${color}-${size}`}
                              className="transition-transform duration-150 ease-out active:scale-95"
                              onClick={() => openDialog(color, size, "entrada")}
                            >
                              <Plus className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="outline"
                              aria-label={`Registrar saída de ${meta.name} tamanho ${size}`}
                              data-testid={`matrix-saida-${productType}-${color}-${size}`}
                              disabled={q === 0}
                              className="transition-transform duration-150 ease-out active:scale-95"
                              onClick={() => openDialog(color, size, "saida")}
                            >
                              <Minus className="size-3" />
                            </Button>
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell
                      className="text-right font-mono text-sm"
                      data-testid={`matrix-row-total-${productType}-${color}`}
                    >
                      {rowTotal}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              {cols.map((size) => (
                <TableCell
                  key={size}
                  className="text-center font-mono text-sm"
                  data-testid={`matrix-col-total-${productType}-${size}`}
                >
                  {rows.reduce((acc, c) => acc + qtyOf(c, size), 0)}
                </TableCell>
              ))}
              <TableCell
                className="text-right font-mono text-sm font-semibold"
                data-testid={`matrix-total-${productType}`}
              >
                {rows.reduce((acc, c) => acc + product.sizes.reduce((a, s) => a + qtyOf(c, s), 0), 0)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Nova Movimentação</DialogTitle>
            <DialogDescription>Registre uma entrada (compra) ou saída (venda) de peças.</DialogDescription>
          </DialogHeader>
          <form data-testid="form-stock-movement" onSubmit={submitMovement} className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de movimentação">
              <button
                type="button"
                data-testid="movement-kind-entrada"
                onClick={() => setKind("entrada")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
                  kind === "entrada"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                data-testid="movement-kind-saida"
                onClick={() => setKind("saida")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
                  kind === "saida"
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Saída
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="movement-product">Produto</Label>
                <Select
                  value={selProduct}
                  onValueChange={(v) => {
                    setSelProduct(v as string);
                    setSelColor(null);
                  }}
                >
                  <SelectTrigger id="movement-product" data-testid="movement-product-select">
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
                <Label htmlFor="movement-size">Tamanho</Label>
                <Select value={selSizeValue} onValueChange={(v) => setSelSize(v as string)}>
                  <SelectTrigger id="movement-size" data-testid="movement-size-select">
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="movement-color">Cor</Label>
              <Select value={selColorValue} onValueChange={(v) => setSelColor(v as string)}>
                <SelectTrigger id="movement-color" data-testid="movement-color-select">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="movement-quantity">Quantidade</Label>
                <Input
                  id="movement-quantity"
                  data-testid="input-movement-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                {exceedsStock && (
                  <p className="text-xs font-medium text-destructive">
                    Quantidade de saída maior que o estoque disponível
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Em estoque</Label>
                <p className="pt-2 font-mono text-sm" data-testid="movement-current-stock">
                  {selectedItem ? `${selectedItem.quantity} peças` : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="movement-notes">Observação (opcional)</Label>
              <Input
                id="movement-notes"
                data-testid="input-movement-notes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: fornecedor, pedido, venda..."
              />
            </div>

            <DialogFooter>
              <Button
                type="submit"
                data-testid="btn-submit-movement"
                disabled={!selectedItem || !qtyValid || exceedsStock || createMovement.isPending}
              >
                {createMovement.isPending
                  ? "Registrando..."
                  : kind === "entrada"
                    ? "Registrar Entrada"
                    : "Registrar Saída"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
