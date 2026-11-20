import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import JsBarcode from "jsbarcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { colorMeta, productNamePlural } from "@/lib/colors";
import type { Catalog, Movement, MovementCreate, MovementKind, StockItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorSwatch } from "@/components/ColorSwatch";

const COLOR_ALL = "todas";
const SIZE_ALL = "todos";
const EMPTY_STOCK: StockItem[] = [];
type StockFilter = "todos" | "baixo" | "zerado";
type PieceLabel = { id: string; serial_code: string; shop_id: string; product_type: string; color: string; size: string; status: string; quantity?: number; created_at?: string };

function LabelBarcode({ code }: { code: string }) {
  useEffect(() => {
    const node = document.getElementById(`barcode-${code}`) as SVGSVGElement | null;
    if (node) JsBarcode(node, code, { format: "CODE128", width: 1.7, height: 48, displayValue: false, margin: 3 });
  }, [code]);
  return <svg id={`barcode-${code}`} aria-label={`Código de barras ${code}`} />;
}

async function currentShopId() {
  const { data, error } = await supabase.rpc("get_my_shop");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.shop_id) throw new Error("Não foi possível identificar a loja atual.");
  return row.shop_id as string;
}

export default function Estoque() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const stockQuery = useQuery({ queryKey: ["stock"], queryFn: () => apiGet<StockItem[]>("/stock") });
  const [productType, setProductType] = useState("camiseta");
  const [colorFilter, setColorFilter] = useState(COLOR_ALL);
  const [sizeFilter, setSizeFilter] = useState(SIZE_ALL);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const [tab, setTab] = useState<"individual" | "geradas">("individual");
  const [kind, setKind] = useState<MovementKind>("entrada");
  const [movementVariant, setMovementVariant] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [printLabels, setPrintLabels] = useState<PieceLabel[]>([]);
  const products = catalogQuery.data?.products ?? [];
  const stock = stockQuery.data ?? EMPTY_STOCK;
  const product = products.find((p) => p.id === productType);
  const generatedQuery = useQuery({
    queryKey: ["piece-labels", productType],
    enabled: tab === "geradas",
    queryFn: async () => {
      const shop = await currentShopId();
      const { data, error } = await supabase.from("piece_labels").select("*").eq("shop_id", shop).eq("product_type", productType).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PieceLabel[];
    },
  });
  const invalidateStock = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock"] });
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const createLabels = useMutation({
    mutationFn: async ({ variant, amount, mode }: { variant: StockItem; amount: number; mode: "individual" | "package" }) => {
      const shop = await currentShopId();
      const quantity = Number(amount);
      const rows = mode === "individual"
        ? Array.from({ length: quantity }, () => ({ shop_id: shop, product_type: variant.product_type, color: variant.color, size: variant.size, status: "disponivel", quantity: 1 }))
        : [{ shop_id: shop, product_type: variant.product_type, color: variant.color, size: variant.size, status: "disponivel", quantity: Number(quantity) }];
      const { data, error } = await supabase.from("piece_labels").insert(rows).select("*");
      if (error) throw error;
      return (data ?? []) as PieceLabel[];
    },
    onSuccess: (created) => {
      setPrintLabels(created);
      setTab("geradas");
      void queryClient.invalidateQueries({ queryKey: ["piece-labels"] });
      window.setTimeout(() => window.print(), 250);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível gerar as etiquetas."),
  });
  const movement = useMutation({
    mutationFn: (body: MovementCreate) => apiPost<Movement>("/movements", body),
    onSuccess: () => { toast.success(kind === "entrada" ? "Entrada registrada com sucesso!" : "Saída registrada com sucesso!"); invalidateStock(); setMovementVariant(null); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível registrar a movimentação."),
  });
  const submitMovement = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number.parseInt(qty, 10);
    if (!movementVariant || !Number.isInteger(amount) || amount < 1) return;
    movement.mutate({ item_id: movementVariant.id, kind, quantity: amount, note: note.trim() || null });
  };
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (product?.colors ?? []).filter((color) => {
      if ((colorFilter !== COLOR_ALL && color !== colorFilter) || (query && !colorMeta(color).name.toLowerCase().includes(query))) return false;
      if (stockFilter === "todos") return true;
      return (product?.sizes ?? [])
        .filter((size) => sizeFilter === SIZE_ALL || size === sizeFilter)
        .some((size) => {
          const amount = stock.find((item) => item.product_type === productType && item.color === color && item.size === size)?.quantity ?? 0;
          return stockFilter === "zerado" ? amount === 0 : amount > 0 && amount <= 3;
        });
    });
  }, [product, colorFilter, sizeFilter, search, stockFilter, stock, productType]);
  if (!product) return <div className="p-8">Carregando catálogo…</div>;
  const visibleSizes = product.sizes.filter((size) => sizeFilter === SIZE_ALL || sizeFilter === size);
  const productVariants = product.colors.flatMap((color) => product.sizes.map((size) => (
    stock.find((item) => item.product_type === productType && item.color === color && item.size === size)
  )));
  const lowStockCount = productVariants.filter((item) => item && item.quantity > 0 && item.quantity <= 3).length;
  const zeroStockCount = productVariants.filter((item) => !item || item.quantity === 0).length;

  const generateForVariant = (variant: StockItem | undefined, color: string, size: string) => {
    if (!variant) { toast.error("Variante da peça não existe no estoque."); return; }
    const answer = window.prompt(`Quantidade de peças para ${product.name} ${colorMeta(color).name} ${size}:`, "1");
    if (answer === null) return;
    const amount = Number(answer);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) { toast.error("Informe uma quantidade entre 1 e 500."); return; }
    const choice = window.prompt("Escolha o modo: 1 = Etiquetas Individuais (uma por peça); 2 = Etiqueta Única de Pacote/Lote.", "1");
    if (choice === null) return;
    if (choice !== "1" && choice !== "2") { toast.error("Escolha 1 para etiquetas individuais ou 2 para pacote/lote."); return; }
    createLabels.mutate({ variant, amount: Number(amount), mode: choice === "1" ? "individual" : "package" });
  };

  return <>
    <div className="screen-only space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-heading text-3xl font-bold">Estoque</h1><p className="mt-1 text-sm text-muted-foreground">{product.name_plural} · {product.description} · {stock.filter((s) => s.product_type === productType).reduce((a, s) => a + s.quantity, 0)} peças em estoque</p></div><div className="flex gap-2"><Select value={productType} onValueChange={(v) => setProductType(v as string)}><SelectTrigger className="w-44"><SelectValue>{(v) => productNamePlural(v as string)}</SelectValue></SelectTrigger><SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_plural}</SelectItem>)}</SelectContent></Select><Button onClick={() => { setMovementVariant(stock.find((s) => s.product_type === productType) ?? null); setKind("entrada"); setQty("1"); }}>Nova Movimentação</Button></div></header>
      <div className="flex gap-2"><Button variant={tab === "individual" ? "default" : "outline"} onClick={() => setTab("individual")}>Estoque</Button><Button variant={tab === "geradas" ? "default" : "outline"} onClick={() => setTab("geradas")}>Etiquetas Geradas</Button></div>
      {tab === "individual" ? <>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={colorFilter} onValueChange={(v) => setColorFilter(v as string)}><SelectTrigger className="w-40"><SelectValue>{(v) => v === COLOR_ALL ? "Todas as cores" : colorMeta(v as string).name}</SelectValue></SelectTrigger><SelectContent><SelectItem value={COLOR_ALL}>Todas as cores</SelectItem>{product.colors.map((c) => <SelectItem key={c} value={c}>{colorMeta(c).name}</SelectItem>)}</SelectContent></Select>
            <Select value={sizeFilter} onValueChange={(v) => setSizeFilter(v as string)}><SelectTrigger className="w-36"><SelectValue>{(v) => v === SIZE_ALL ? "Todos os tamanhos" : v as string}</SelectValue></SelectTrigger><SelectContent><SelectItem value={SIZE_ALL}>Todos os tamanhos</SelectItem>{product.sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
              <Input type="search" aria-label="Buscar cor no estoque" className="pl-9" placeholder="Buscar cor..." value={search} onChange={(e) => setSearch(e.target.value)}/>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="Filtros rápidos de estoque">
            <Button size="sm" variant={stockFilter === "todos" ? "secondary" : "outline"} aria-pressed={stockFilter === "todos"} onClick={() => setStockFilter("todos")}>Todas as variantes</Button>
            <Button size="sm" variant={stockFilter === "baixo" ? "secondary" : "outline"} aria-pressed={stockFilter === "baixo"} onClick={() => setStockFilter("baixo")}>Estoque baixo (1–3) <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{lowStockCount}</span></Button>
            <Button size="sm" variant={stockFilter === "zerado" ? "secondary" : "outline"} aria-pressed={stockFilter === "zerado"} onClick={() => setStockFilter("zerado")}>Sem estoque <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{zeroStockCount}</span></Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs"><table className="w-full text-sm"><thead><tr className="border-b bg-slate-50/80"><th className="p-3 text-left font-medium text-muted-foreground">Cor</th>{visibleSizes.map((s) => <th className="p-3 text-center font-medium text-muted-foreground" key={s}>{s}</th>)}</tr></thead><tbody>{rows.map((color) => <tr key={color} className="border-b last:border-0 hover:bg-slate-50/60"><td className="p-3"><span className="inline-flex items-center gap-2.5 font-medium"><ColorSwatch color={color} className="size-4 border-2 border-white ring-1 ring-slate-200"/>{colorMeta(color).name}</span></td>{visibleSizes.map((size) => { const variant = stock.find((s) => s.product_type === productType && s.color === color && s.size === size); const amount = variant?.quantity ?? 0; return <td className="p-2 text-center" key={size}><span className={`font-mono font-medium ${amount === 0 ? "text-slate-400" : amount <= 3 ? "text-amber-700" : "text-slate-700"}`}>{amount}</span><div className="mt-1 flex flex-wrap justify-center gap-1"><Button size="icon-xs" variant="outline" aria-label="Registrar entrada" onClick={() => { if (variant) { setMovementVariant(variant); setKind("entrada"); setQty("1"); } }}><Plus className="size-3"/></Button><Button size="icon-xs" variant="outline" aria-label="Registrar saída" disabled={!amount} onClick={() => { if (variant) { setMovementVariant(variant); setKind("saida"); setQty("1"); } }}><Minus className="size-3"/></Button><Button size="sm" variant="outline" disabled={!variant || createLabels.isPending} onClick={() => generateForVariant(variant, color, size)}><Printer className="mr-1 size-3"/>Gerar Etiquetas</Button></div></td>; })}</tr>)}{rows.length === 0 && <tr><td className="p-8 text-center text-sm text-muted-foreground" colSpan={visibleSizes.length + 1}>Nenhuma variante corresponde aos filtros.</td></tr>}</tbody></table></div>
      </> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Código</th><th className="p-3 text-left">Produto</th><th className="p-3 text-left">Cor / Tamanho</th><th className="p-3 text-left">Quantidade</th><th className="p-3 text-left">Status</th><th className="p-3">Ação</th></tr></thead><tbody>{(generatedQuery.data ?? []).map((label) => <tr className="border-b last:border-0" key={label.id}><td className="p-3 font-mono">{label.serial_code}</td><td className="p-3">{products.find((p) => p.id === label.product_type)?.name ?? label.product_type}</td><td className="p-3">{colorMeta(label.color).name} · {label.size}</td><td className="p-3">{label.quantity ?? 1} {(label.quantity ?? 1) === 1 ? "peça" : "peças"}</td><td className="p-3">{label.status}</td><td className="p-3 text-center"><Button size="sm" variant="outline" onClick={() => { setPrintLabels([label]); window.setTimeout(() => window.print(), 100); }}><Printer className="mr-2 size-4"/>Reimprimir</Button></td></tr>)}{generatedQuery.isLoading && <tr><td className="p-4" colSpan={6}>Carregando etiquetas…</td></tr>}</tbody></table></div>}
      {movementVariant && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitMovement} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl"><div><h2 className="text-lg font-semibold">Nova Movimentação</h2><p className="text-sm text-muted-foreground">{product.name} · {colorMeta(movementVariant.color).name} · {movementVariant.size}</p></div><div className="grid grid-cols-2 gap-2"><Button type="button" variant={kind === "entrada" ? "default" : "outline"} onClick={() => setKind("entrada")}>Entrada</Button><Button type="button" variant={kind === "saida" ? "default" : "outline"} onClick={() => setKind("saida")}>Saída</Button></div><Label>Quantidade<Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}/></Label><Label>Observação (opcional)<Input value={note} onChange={(e) => setNote(e.target.value)}/></Label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMovementVariant(null)}>Cancelar</Button><Button type="submit" disabled={movement.isPending}>Registrar {kind === "entrada" ? "Entrada" : "Saída"}</Button></div></form></div>}
    </div>
    <div className="print-labels">{printLabels.map((label) => <article className="piece-label" key={label.id}><LabelBarcode code={label.serial_code}/><strong>{label.serial_code}</strong><span>{products.find((p) => p.id === label.product_type)?.name ?? label.product_type}</span><span>{colorMeta(label.color).name} · {label.size}</span><span>Qtd: {label.quantity ?? 1} {(label.quantity ?? 1) === 1 ? "peça" : "peças"}</span></article>)}</div>
    <style>{` .print-labels{display:none}@media print{@page{margin:8mm}.screen-only{display:none!important}.print-labels{display:grid;grid-template-columns:repeat(2,70mm);gap:5mm}.piece-label{height:42mm;border:1px solid #ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-inside:avoid;font:12px Arial,sans-serif}.piece-label svg{max-width:62mm}.piece-label strong{font:bold 15px monospace;margin:2px}.piece-label span{margin:1px}}`}</style>
  </>;
}
