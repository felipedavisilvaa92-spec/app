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
  const [tab, setTab] = useState<"individual" | "geradas">("individual");
  const [kind, setKind] = useState<MovementKind>("entrada");
  const [movementVariant, setMovementVariant] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [printLabels, setPrintLabels] = useState<PieceLabel[]>([]);
  const products = catalogQuery.data?.products ?? [];
  const stock = stockQuery.data ?? [];
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
  const qtyOf = (color: string, size: string) => stock.find((s) => s.product_type === productType && s.color === color && s.size === size)?.quantity ?? 0;
  const invalidateStock = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock"] });
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const createLabels = useMutation({
    mutationFn: async ({ variant, amount, mode }: { variant: StockItem; amount: number; mode: "individual" | "package" }) => {
      const shop = await currentShopId();
      const rows = mode === "individual"
        ? Array.from({ length: amount }, () => ({ shop_id: shop, product_type: variant.product_type, color: variant.color, size: variant.size, status: "disponivel", quantity: 1 }))
        : [{ shop_id: shop, product_type: variant.product_type, color: variant.color, size: variant.size, status: "disponivel", quantity: amount }];
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
  const rows = useMemo(() => (product?.colors ?? []).filter((c) => (colorFilter === COLOR_ALL || c === colorFilter) && (!search.trim() || colorMeta(c).name.toLowerCase().includes(search.trim().toLowerCase()))), [product, colorFilter, search]);
  if (!product) return <div className="p-8">Carregando catálogo…</div>;

  const generateForVariant = (variant: StockItem | undefined, color: string, size: string) => {
    if (!variant) { toast.error("Variante da peça não existe no estoque."); return; }
    const answer = window.prompt(`Quantidade de peças para ${product.name} ${colorMeta(color).name} ${size}:`, "1");
    if (answer === null) return;
    const amount = Number.parseInt(answer, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) { toast.error("Informe uma quantidade entre 1 e 500."); return; }
    const choice = window.prompt("Escolha o modo: 1 = Etiquetas Individuais (uma por peça); 2 = Etiqueta Única de Pacote/Lote.", "1");
    if (choice === null) return;
    if (choice !== "1" && choice !== "2") { toast.error("Escolha 1 para etiquetas individuais ou 2 para pacote/lote."); return; }
    createLabels.mutate({ variant, amount, mode: choice === "1" ? "individual" : "package" });
  };

  return <>
    <div className="screen-only space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-heading text-3xl font-bold">Estoque</h1><p className="mt-1 text-sm text-muted-foreground">{product.name_plural} · {stock.filter((s) => s.product_type === productType).reduce((a, s) => a + s.quantity, 0)} peças em estoque</p></div><div className="flex gap-2"><Select value={productType} onValueChange={(v) => setProductType(v as string)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_plural}</SelectItem>)}</SelectContent></Select><Button onClick={() => { setMovementVariant(stock.find((s) => s.product_type === productType) ?? null); setKind("entrada"); setQty("1"); }}>Nova Movimentação</Button></div></header>
      <div className="flex gap-2"><Button variant={tab === "individual" ? "default" : "outline"} onClick={() => setTab("individual")}>Estoque</Button><Button variant={tab === "geradas" ? "default" : "outline"} onClick={() => setTab("geradas")}>Etiquetas Geradas</Button></div>
      {tab === "individual" ? <>
        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4"><Select value={colorFilter} onValueChange={(v) => setColorFilter(v as string)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={COLOR_ALL}>Todas as cores</SelectItem>{product.colors.map((c) => <SelectItem key={c} value={c}>{colorMeta(c).name}</SelectItem>)}</SelectContent></Select><Select value={sizeFilter} onValueChange={(v) => setSizeFilter(v as string)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SIZE_ALL}>Todos os tamanhos</SelectItem>{product.sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><div className="relative"><Search className="absolute left-2 top-2.5 size-4"/><Input className="pl-8" placeholder="Buscar cor" value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
        <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Cor</th>{product.sizes.filter((s) => sizeFilter === SIZE_ALL || sizeFilter === s).map((s) => <th className="p-3 text-center" key={s}>{s}</th>)}</tr></thead><tbody>{rows.map((color) => <tr key={color} className="border-b last:border-0"><td className="p-3"><span className="inline-flex items-center gap-2"><ColorSwatch color={color}/>{colorMeta(color).name}</span></td>{product.sizes.filter((s) => sizeFilter === SIZE_ALL || sizeFilter === s).map((size) => { const variant = stock.find((s) => s.product_type === productType && s.color === color && s.size === size); const amount = variant?.quantity ?? 0; return <td className="p-2 text-center" key={size}><span className="font-mono">{amount}</span><div className="mt-1 flex flex-wrap justify-center gap-1"><Button size="icon-xs" variant="outline" aria-label="Registrar entrada" onClick={() => { if (variant) { setMovementVariant(variant); setKind("entrada"); setQty("1"); } }}><Plus className="size-3"/></Button><Button size="icon-xs" variant="outline" disabled={!amount} aria-label="Registrar saída" onClick={() => { if (variant) { setMovementVariant(variant); setKind("saida"); setQty("1"); } }}><Minus className="size-3"/></Button><Button size="sm" variant="outline" disabled={!variant || createLabels.isPending} onClick={() => generateForVariant(variant, color, size)}><Printer className="mr-1 size-3"/>Gerar Etiquetas</Button></div></td>; })}</tr>)}</tbody></table></div>
      </> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Código</th><th className="p-3 text-left">Produto</th><th className="p-3 text-left">Cor / Tamanho</th><th className="p-3 text-left">Quantidade</th><th className="p-3 text-left">Status</th><th className="p-3">Ação</th></tr></thead><tbody>{(generatedQuery.data ?? []).map((label) => <tr className="border-b last:border-0" key={label.id}><td className="p-3 font-mono">{label.serial_code}</td><td className="p-3">{products.find((p) => p.id === label.product_type)?.name ?? label.product_type}</td><td className="p-3">{colorMeta(label.color).name} · {label.size}</td><td className="p-3">{label.quantity ?? 1} {(label.quantity ?? 1) === 1 ? "peça" : "peças"}</td><td className="p-3">{label.status}</td><td className="p-3 text-center"><Button size="sm" variant="outline" onClick={() => { setPrintLabels([label]); window.setTimeout(() => window.print(), 100); }}><Printer className="mr-2 size-4"/>Reimprimir</Button></td></tr>)}{generatedQuery.isLoading && <tr><td className="p-4" colSpan={6}>Carregando etiquetas…</td></tr>}</tbody></table></div>}
      {movementVariant && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitMovement} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl"><div><h2 className="text-lg font-semibold">Nova Movimentação</h2><p className="text-sm text-muted-foreground">{product.name} · {colorMeta(movementVariant.color).name} · {movementVariant.size}</p></div><div className="grid grid-cols-2 gap-2"><Button type="button" variant={kind === "entrada" ? "default" : "outline"} onClick={() => setKind("entrada")}>Entrada</Button><Button type="button" variant={kind === "saida" ? "default" : "outline"} onClick={() => setKind("saida")}>Saída</Button></div><Label>Quantidade<Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}/></Label><Label>Observação (opcional)<Input value={note} onChange={(e) => setNote(e.target.value)}/></Label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMovementVariant(null)}>Cancelar</Button><Button type="submit" disabled={movement.isPending}>Registrar {kind === "entrada" ? "Entrada" : "Saída"}</Button></div></form></div>}
    </div>
    <div className="print-labels">{printLabels.map((label) => <article className="piece-label" key={label.id}><LabelBarcode code={label.serial_code}/><strong>{label.serial_code}</strong><span>{products.find((p) => p.id === label.product_type)?.name ?? label.product_type}</span><span>{colorMeta(label.color).name} · {label.size}</span><span>Qtd: {label.quantity ?? 1} {(label.quantity ?? 1) === 1 ? "peça" : "peças"}</span></article>)}</div>
    <style>{` .print-labels{display:none}@media print{@page{margin:8mm}.screen-only{display:none!important}.print-labels{display:grid;grid-template-columns:repeat(2,70mm);gap:5mm}.piece-label{height:42mm;border:1px solid #ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-inside:avoid;font:12px Arial,sans-serif}.piece-label svg{max-width:62mm}.piece-label strong{font:bold 15px monospace;margin:2px}.piece-label span{margin:1px}}`}</style>
  </>;
}
