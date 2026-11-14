import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { colorMeta, productName, productNamePlural } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Catalog, Order, OrderCreate, StockItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import OrderReceipt from "@/components/OrderReceipt";

const COLOR_ALL = "todas";
type PieceLabel = { id: string; serial_code: string; shop_id: string; product_type: string; color: string; size: string; status: string };
type ScannedPiece = { label: PieceLabel; orderItemId: string };
function orderLabel(number: number) { return `#${String(number).padStart(3, "0")}`; }
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) return String((error.body as { detail: unknown }).detail);
  return error instanceof Error ? error.message : "Algo deu errado. Tente novamente.";
}
async function shopId() {
  const { data, error } = await supabase.rpc("get_my_shop");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.shop_id) throw new Error("Não foi possível identificar a loja atual.");
  return row.shop_id as string;
}
function playTone(success: boolean) {
  try { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = success ? 1200 : 220; oscillator.type = success ? "sine" : "square"; gain.gain.value = 0.12; oscillator.start(); oscillator.stop(context.currentTime + (success ? 0.12 : 0.35)); oscillator.onended = () => void context.close(); } catch { /* áudio opcional */ }
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
  const [comprador, setComprador] = useState("");
  const [separador, setSeparador] = useState("");
  const [selProduct, setSelProduct] = useState("camiseta");
  const [selColor, setSelColor] = useState<string | null>(null);
  const [selSize, setSelSize] = useState("P");
  const [qty, setQty] = useState("1");
  const [scanValue, setScanValue] = useState("");
  const [scanAlert, setScanAlert] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [scanned, setScanned] = useState<ScannedPiece[]>([]);
  const scannedRef = useRef<ScannedPiece[]>([]);
  const scanBusy = useRef(false);
  const lastScanAt = useRef(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const selProductDef = products.find((p) => p.id === selProduct);
  const selColorValue = selColor ?? selProductDef?.colors[0] ?? "";
  const selSizes = selProductDef?.sizes ?? [];
  const selSizeValue = selSizes.includes(selSize) ? selSize : (selSizes[0] ?? "");
  const selectedVariant = stock.find((s) => s.product_type === selProduct && s.color === selColorValue && s.size === selSizeValue);
  const qtyNum = Number.parseInt(qty, 10);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 1;
  const qtyExceedsStock = selectedVariant != null && qtyValid && qtyNum > selectedVariant.quantity;
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["stock"] });
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);
  const publishScanned = (next: ScannedPiece[]) => { scannedRef.current = next; setScanned(next); };

  const addScannedLabel = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code || scanBusy.current) return;
    if (!openOrder) { setScanAlert("Inicie um pedido antes de bipar etiquetas."); playTone(false); return; }
    scanBusy.current = true;
    setScanAlert("");
    try {
      const shop = await shopId();
      const { data: label, error: findError } = await supabase.from("piece_labels").select("*").eq("shop_id", shop).eq("serial_code", code).maybeSingle();
      if (findError) throw findError;
      if (!label || label.status !== "disponivel") {
        playTone(false);
        setScanAlert(`ATENÇÃO: Peça ${code} já foi bipada / já saiu do estoque!`);
        return;
      }
      // Claim conditionally first, preventing two simultaneous readers from selling the same serial.
      const { data: claimed, error: claimError } = await supabase.from("piece_labels").update({ status: "vendida" }).eq("id", label.id).eq("shop_id", shop).eq("status", "disponivel").select("*").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) { playTone(false); setScanAlert(`ATENÇÃO: Peça ${code} já foi bipada / já saiu do estoque!`); return; }
      const variant = stock.find((s) => s.product_type === label.product_type && s.color === label.color && s.size === label.size);
      if (!variant) throw new Error("Variante da etiqueta não existe no estoque.");
      const { error: movementError } = await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: label.product_type, p_color: label.color, p_size: label.size, p_kind: "saida", p_quantity: 1, p_note: `Bipe ${code}`, p_order_number: openOrder.number });
      if (movementError) throw movementError;
      const { data: orderItem, error: itemError } = await supabase.from("order_items").insert({ shop_id: shop, order_id: openOrder.id, item_id: variant.id, product_type: label.product_type, color: label.color, size: label.size, quantity: 1, picked: false }).select("id").single();
      if (itemError) {
        await supabase.from("piece_labels").update({ status: "disponivel" }).eq("id", label.id).eq("shop_id", shop);
        await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: label.product_type, p_color: label.color, p_size: label.size, p_kind: "entrada", p_quantity: 1, p_note: `Estorno falha bipe ${code}`, p_order_number: openOrder.number });
        throw itemError;
      }
      publishScanned([...scannedRef.current, { label: claimed as PieceLabel, orderItemId: orderItem.id }]);
      setScanValue("");
      playTone(true);
      invalidate();
    } catch (error) {
      playTone(false);
      setScanAlert(errorMessage(error));
    } finally { scanBusy.current = false; }
  }, [openOrder, stock, invalidate]);

  const restoreScanned = async (piece: ScannedPiece) => {
    const shop = await shopId();
    const { error: statusError } = await supabase.from("piece_labels").update({ status: "disponivel" }).eq("id", piece.label.id).eq("shop_id", shop).eq("status", "vendida");
    if (statusError) throw statusError;
    const variant = stock.find((s) => s.product_type === piece.label.product_type && s.color === piece.label.color && s.size === piece.label.size);
    if (!variant) throw new Error("Variante da etiqueta não existe no estoque.");
    const { error } = await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: piece.label.product_type, p_color: piece.label.color, p_size: piece.label.size, p_kind: "entrada", p_quantity: 1, p_note: `Estorno bipe ${piece.label.serial_code}`, p_order_number: openOrder?.number ?? null });
    if (error) throw error;
    await supabase.from("order_items").delete().eq("id", piece.orderItemId).eq("shop_id", shop);
  };

  const createOrder = useMutation({ mutationFn: (body: OrderCreate) => apiPost<Order>("/orders", body), onSuccess: (order) => { toast.success(`Pedido ${orderLabel(order.number)} iniciado!`); void queryClient.invalidateQueries({ queryKey: ["orders"] }); setComprador(""); setSeparador(""); }, onError: (error) => toast.error(errorMessage(error)) });
  const addItem = useMutation({ mutationFn: (body: { item_id: string; quantity: number }) => apiPost<Order>(`/orders/${openOrder?.id ?? ""}/items`, body), onSuccess: () => { toast.success("Item adicionado ao pedido!"); invalidate(); setQty("1"); }, onError: (error) => toast.error(errorMessage(error)) });
  const toggleItem = useMutation({ mutationFn: (body: { rowId: string; picked: boolean }) => apiPatch<Order>(`/orders/${openOrder?.id ?? ""}/items/${body.rowId}`, { picked: body.picked }), onSuccess: invalidate, onError: (error) => toast.error(errorMessage(error)) });
  const removeItem = useMutation({ mutationFn: async (rowId: string) => { const linked = scannedRef.current.find((piece) => piece.orderItemId === rowId); if (linked) { await restoreScanned(linked); publishScanned(scannedRef.current.filter((piece) => piece.orderItemId !== rowId)); } else await apiDelete(`/orders/${openOrder?.id ?? ""}/items/${rowId}`); }, onSuccess: () => { toast.success("Item removido do pedido."); invalidate(); }, onError: (error) => toast.error(errorMessage(error)) });
  const finalizeOrder = useMutation({ mutationFn: () => apiPost<Order>(`/orders/${openOrder?.id ?? ""}/finalize`), onSuccess: (order) => { toast.success(`Pedido ${orderLabel(order.number)} finalizado — estoque atualizado!`); publishScanned([]); invalidate(); }, onError: (error) => toast.error(errorMessage(error)) });
  const cancelOrder = useMutation({ mutationFn: async () => { for (const piece of [...scannedRef.current]) await restoreScanned(piece); publishScanned([]); return apiDelete(`/orders/${openOrder?.id ?? ""}`); }, onSuccess: () => { toast.success("Pedido cancelado."); invalidate(); }, onError: (error) => toast.error(errorMessage(error)) });
  useEffect(() => { if (!printOrder) return; const timer = window.setTimeout(() => { window.print(); setPrintOrder(null); }, 300); return () => window.clearTimeout(timer); }, [printOrder]);
  useEffect(() => { return () => { const scanner = scannerRef.current; if (scanner?.isScanning) void scanner.stop().catch(() => undefined); }; }, []);
  useEffect(() => {
    if (!cameraOn) return;
    const scanner = new Html5Qrcode("piece-label-camera");
    scannerRef.current = scanner;
    void scanner.start({ facingMode: "environment" }, { fps: 8, qrbox: { width: 240, height: 120 } }, (text) => {
      const now = Date.now();
      if (now - lastScanAt.current < 1500) return;
      lastScanAt.current = now;
      void addScannedLabel(text);
    }, () => undefined).catch((error: unknown) => { setScanAlert(errorMessage(error)); setCameraOn(false); });
    return () => { if (scanner.isScanning) void scanner.stop().catch(() => undefined); scannerRef.current = null; };
  }, [cameraOn, addScannedLabel]);

  const pickedCount = (openOrder?.items.filter((item) => item.picked).length ?? 0) + scanned.length;
  const itemCount = openOrder?.items.length ?? 0;
  const submitNewOrder = (event: FormEvent) => { event.preventDefault(); if (comprador.trim() && separador.trim()) createOrder.mutate({ comprador: comprador.trim(), separador: separador.trim() }); };
  const submitAddItem = (event: FormEvent) => { event.preventDefault(); if (!selectedVariant || !qtyValid) { toast.error("Escolha o produto, a cor, o tamanho e uma quantidade válida."); return; } addItem.mutate({ item_id: selectedVariant.id, quantity: qtyNum }); };

  return <>
    <div className="screen-only space-y-8">
      <div><h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Montagem de Pedidos</h1><p className="mt-1 text-sm text-muted-foreground">Registre as saídas, marque cada item separado e imprima o comprovante.</p></div>
      <Card><CardHeader><CardTitle className="font-heading text-xl">Separar com Bipe</CardTitle><CardDescription>Leia o código serial da etiqueta com leitor USB/Bluetooth ou câmera do celular. O estoque é atualizado imediatamente.</CardDescription></CardHeader><CardContent className="space-y-3"><form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void addScannedLabel(scanValue); }}><Input autoFocus value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addScannedLabel(scanValue); } }} placeholder="Foque e bipe: PC-00001" aria-label="Código da etiqueta"/><Button type="submit">Bipar</Button><Button type="button" variant={cameraOn ? "destructive" : "outline"} onClick={() => setCameraOn((value) => !value)}>{cameraOn ? "Parar Câmera" : "Usar Câmera do Celular"}</Button></form>{cameraOn && <div id="piece-label-camera" className="max-w-md overflow-hidden rounded-lg"/>}{scanAlert && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 font-semibold text-red-700">{scanAlert}</p>}{scanned.length > 0 && <p className="text-sm text-emerald-700">Etiquetas bipada(s) neste pedido: {scanned.map((piece) => piece.label.serial_code).join(", ")}</p>}</CardContent></Card>
      {openOrder === null ? <Card><CardHeader><CardTitle className="font-heading text-xl">Novo Pedido</CardTitle><CardDescription>Número gerado automaticamente: <span className="font-mono font-semibold">{orderLabel(nextNumber)}</span> · data e hora automáticas do registro</CardDescription></CardHeader><CardContent><form onSubmit={submitNewOrder} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="order-comprador">Nome do Comprador</Label><Input id="order-comprador" value={comprador} onChange={(e) => setComprador(e.target.value)} placeholder="Quem comprou"/></div><div className="space-y-1.5"><Label htmlFor="order-separador">Nome do Separador</Label><Input id="order-separador" value={separador} onChange={(e) => setSeparador(e.target.value)} placeholder="Quem está separando"/></div><Button type="submit" className="sm:col-span-2" disabled={createOrder.isPending || !comprador.trim() || !separador.trim()}><Plus className="mr-2 size-4"/>{createOrder.isPending ? "Iniciando..." : "Iniciar Pedido"}</Button></form></CardContent></Card> : <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="font-heading text-xl">Pedido {orderLabel(openOrder.number)}</CardTitle><CardDescription>{formatDateTime(openOrder.created_at)} · Comprador: {openOrder.comprador} · Separador: {openOrder.separador}</CardDescription></div><Button variant="outline" onClick={() => setPrintOrder(openOrder)}><Printer className="mr-2 size-4"/>Imprimir Pedido</Button></div></CardHeader><CardContent className="space-y-4"><div className="rounded-xl border bg-slate-50 p-4"><form onSubmit={submitAddItem} className="flex flex-wrap items-end gap-3"><div className="space-y-1.5"><Label>Produto</Label><Select value={selProduct} onValueChange={(v) => { setSelProduct(v as string); setSelColor(null); }}><SelectTrigger className="w-36"><SelectValue>{(v) => productNamePlural(v as string)}</SelectValue></SelectTrigger><SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Cor</Label><Select value={selColorValue} onValueChange={(v) => setSelColor(v as string)}><SelectTrigger className="w-36"><SelectValue>{(v) => colorMeta(v as string).name}</SelectValue></SelectTrigger><SelectContent>{(selProductDef?.colors ?? []).map((c) => <SelectItem key={c} value={c}>{colorMeta(c).name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Tamanho</Label><Select value={selSizeValue} onValueChange={(v) => setSelSize(v as string)}><SelectTrigger className="w-24"><SelectValue>{(v) => v as string}</SelectValue></SelectTrigger><SelectContent>{selSizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Quantidade de saída</Label><Input type="number" min={1} step={1} className="w-28" value={qty} onChange={(e) => setQty(e.target.value)}/></div><Button type="submit" disabled={!selectedVariant || !qtyValid || addItem.isPending}><Plus className="mr-2 size-4"/>Adicionar</Button><p className="text-xs text-muted-foreground">{selectedVariant ? `Em estoque: ${selectedVariant.quantity} peças` : "—"}</p></form>{qtyExceedsStock && <p className="mt-2 text-xs font-medium text-amber-600">A quantidade passa do estoque disponível — o pedido só será finalizado se houver estoque.</p>}</div>
      {openOrder.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item no pedido. Adicione os produtos acima.</p> : <ul className="space-y-2">{openOrder.items.map((item) => { const scannedPiece = scanned.find((piece) => piece.orderItemId === item.id); return <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2.5"><span className="flex min-w-0 items-center gap-3"><Checkbox checked={scannedPiece ? true : item.picked} disabled={Boolean(scannedPiece)} onCheckedChange={(v) => toggleItem.mutate({ rowId: item.id, picked: v === true })} aria-label={`Marcar ${productName(item.product_type)} ${colorMeta(item.color).name} ${item.size} como separado`}/><span className="truncate text-sm">{productName(item.product_type)} {colorMeta(item.color).name} · {item.size}</span>{scannedPiece ? <Badge className="bg-emerald-100 text-emerald-800">Bipada · {scannedPiece.label.serial_code}</Badge> : item.picked && <Badge className="bg-[#DCFCE7] text-[#14532D]">Separado</Badge>}</span><span className="flex shrink-0 items-center gap-3"><span className="font-mono text-sm font-medium">{item.quantity} un.</span><Button size="icon-xs" variant="ghost" aria-label="Remover item do pedido" onClick={() => removeItem.mutate(item.id)}><X className="size-3.5"/></Button></span></li>; })}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">Separados/bipados: {pickedCount} de {itemCount} itens — etiquetas bipada(s) já foram abatidas do estoque.</p><div className="flex items-center gap-2"><Button variant="ghost" onClick={() => cancelOrder.mutate()} disabled={cancelOrder.isPending}>Cancelar Pedido</Button><Button onClick={() => finalizeOrder.mutate()} disabled={pickedCount === 0 || finalizeOrder.isPending}><Check className="mr-2 size-4"/>{finalizeOrder.isPending ? "Finalizando..." : "Finalizar Pedido"}</Button></div></div></CardContent></Card>}
      <Card><CardHeader><CardTitle className="font-heading text-xl">Histórico de Pedidos Montados</CardTitle><CardDescription>Pedidos finalizados — as saídas também entram no Histórico de Movimentações.</CardDescription></CardHeader><CardContent>{finalizedOrders.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido montado ainda. Inicie o primeiro acima.</p> : <div className="overflow-hidden rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Data/Hora</TableHead><TableHead>Comprador</TableHead><TableHead>Separador</TableHead><TableHead>Baixa</TableHead><TableHead className="text-right">Imprimir</TableHead></TableRow></TableHeader><TableBody>{finalizedOrders.map((order) => <TableRow key={order.id}><TableCell className="font-mono font-semibold">{orderLabel(order.number)}</TableCell><TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(order.created_at)}</TableCell><TableCell>{order.comprador}</TableCell><TableCell>{order.separador}</TableCell><TableCell>{order.items.filter((i) => i.picked).length}/{order.items.length} itens · {order.items.reduce((acc, i) => acc + (i.picked ? i.quantity : 0), 0)} peças</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setPrintOrder(order)}><Printer className="mr-2 size-3.5"/>Imprimir</Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    </div>
    {printOrder && <OrderReceipt order={printOrder}/>}
  </>;
}
