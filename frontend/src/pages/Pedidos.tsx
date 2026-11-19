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
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = success ? 880 : 220;
    gain.gain.value = 0.08;
    oscillator.start(); oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => void context.close();
  } catch { /* Audio feedback is optional. */ }
}

export default function Pedidos() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiGet<Order[]>("/orders"), refetchInterval: 3000 });
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<Catalog>("/catalog") });
  const stockQuery = useQuery({ queryKey: ["stock"], queryFn: () => apiGet<StockItem[]>("/stock"), refetchInterval: 2000 });
  const userQuery = useQuery({ queryKey: ["current-user"], queryFn: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } });
  const user = userQuery.data;
  const orders = ordersQuery.data ?? [];
  const products = catalogQuery.data?.products ?? [];
  const stock = stockQuery.data ?? [];

  const openOrders = orders.filter((order) => order.status === "aberto" && order.created_by === user?.id);
  const openOrder = openOrders[0] ?? null;
  const finalizedOrders = orders.filter((order) => order.status === "finalizado");
  const nextNumber = orders.length ? Math.max(...orders.map((order) => order.number)) + 1 : 1;
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
  const selProductDef = products.find((product) => product.id === selProduct);
  const selColorValue = selColor ?? selProductDef?.colors[0] ?? "";
  const selSizes = selProductDef?.sizes ?? [];
  const selSizeValue = selSizes.includes(selSize) ? selSize : (selSizes[0] ?? "");
  const selectedVariant = stock.find((item) => item.product_type === selProduct && item.color === selColorValue && item.size === selSizeValue);
  const qtyNum = Number.parseInt(qty, 10);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 1;
  const qtyExceedsStock = selectedVariant != null && qtyValid && qtyNum > selectedVariant.quantity;

  useEffect(() => {
    if (user?.email) setSeparador((current) => current || user.email || "");
  }, [user?.email]);

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
    let claimedLabel: PieceLabel | null = null;
    try {
      const shop = await shopId();
      const { data: label, error: findError } = await supabase.from("piece_labels").select("*").eq("shop_id", shop).eq("serial_code", code).maybeSingle();
      if (findError) throw findError;
      if (!label || label.status !== "disponivel") {
        playTone(false);
        setScanAlert(`ATENÇÃO: Peça ${code} já foi bipada / já saiu do estoque!`);
        return;
      }
      const { data: claimed, error: claimError } = await supabase.from("piece_labels").update({ status: "vendida" }).eq("id", label.id).eq("shop_id", shop).eq("status", "disponivel").select("*").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) { playTone(false); setScanAlert(`ATENÇÃO: Peça ${code} já foi bipada / já saiu do estoque!`); return; }
      claimedLabel = claimed as PieceLabel;
      const variant = stock.find((item) => item.product_type === label.product_type && item.color === label.color && item.size === label.size);
      if (!variant) throw new Error("Variante da etiqueta não existe no estoque.");
      const { error: movementError } = await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: label.product_type, p_color: label.color, p_size: label.size, p_kind: "saida", p_quantity: 1, p_note: `Pedido ${openOrder.number}`, p_order_number: openOrder.number });
      if (movementError) throw movementError;
      const { data: orderItem, error: itemError } = await supabase.from("order_items").insert({ shop_id: shop, order_id: openOrder.id, item_id: variant.id, product_type: label.product_type, color: label.color, size: label.size, quantity: 1, picked: true }).select("*").single();
      if (itemError) {
        await supabase.from("piece_labels").update({ status: "disponivel" }).eq("id", label.id).eq("shop_id", shop).eq("status", "vendida");
        await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: label.product_type, p_color: label.color, p_size: label.size, p_kind: "entrada", p_quantity: 1, p_note: `Estorno peça ${code}`, p_order_number: openOrder.number });
        claimedLabel = null;
        throw itemError;
      }
      publishScanned([...scannedRef.current, { label: claimedLabel, orderItemId: orderItem.id }]);
      claimedLabel = null;
      setScanValue("");
      playTone(true);
      invalidate();
    } catch (error) {
      if (claimedLabel) {
        const shop = await shopId().catch(() => null);
        if (shop) await supabase.from("piece_labels").update({ status: "disponivel" }).eq("id", claimedLabel.id).eq("shop_id", shop).eq("status", "vendida");
      }
      playTone(false);
      setScanAlert(errorMessage(error));
    } finally { scanBusy.current = false; }
  }, [openOrder, stock, invalidate]);

  const restoreScanned = async (piece: ScannedPiece) => {
    const shop = await shopId();
    const { error: statusError } = await supabase.from("piece_labels").update({ status: "disponivel" }).eq("id", piece.label.id).eq("shop_id", shop).eq("status", "vendida");
    if (statusError) throw statusError;
    const variant = stock.find((item) => item.product_type === piece.label.product_type && item.color === piece.label.color && item.size === piece.label.size);
    if (!variant) throw new Error("Variante da etiqueta não existe no estoque.");
    const { error } = await supabase.rpc("record_stock_movement", { p_shop_id: shop, p_item_id: variant.id, p_product_type: piece.label.product_type, p_color: piece.label.color, p_size: piece.label.size, p_kind: "entrada", p_quantity: 1, p_note: `Estorno peça ${piece.label.serial_code}`, p_order_number: openOrder?.number ?? null });
    if (error) throw error;
    await supabase.from("order_items").delete().eq("id", piece.orderItemId).eq("shop_id", shop);
  };

  const createOrder = useMutation({ mutationFn: (body: OrderCreate) => apiPost<Order>("/orders", body), onSuccess: (order) => { toast.success(`Pedido ${orderLabel(order.number)} iniciado!`); setComprador(""); invalidate(); } });
  const addItem = useMutation({ mutationFn: (body: { item_id: string; quantity: number }) => apiPost<Order>(`/orders/${openOrder?.id ?? ""}/items`, body), onSuccess: () => { toast.success("Item adicionado ao pedido."); invalidate(); } });
  const toggleItem = useMutation({ mutationFn: (body: { rowId: string; picked: boolean }) => apiPatch<Order>(`/orders/${openOrder?.id ?? ""}/items/${body.rowId}`, { picked: body.picked }), onSuccess: () => invalidate() });
  const removeItem = useMutation({ mutationFn: async (rowId: string) => { const linked = scannedRef.current.find((piece) => piece.orderItemId === rowId); if (linked) { await restoreScanned(linked); publishScanned(scannedRef.current.filter((piece) => piece.orderItemId !== rowId)); } else { await apiDelete(`/orders/${openOrder?.id ?? ""}/items/${rowId}`); } }, onSuccess: () => invalidate() });
  const finalizeOrder = useMutation({ mutationFn: () => apiPost<Order>(`/orders/${openOrder?.id ?? ""}/finalize`), onSuccess: (order) => { toast.success(`Pedido ${orderLabel(order.number)} finalizado!`); publishScanned([]); invalidate(); } });
  const cancelOrder = useMutation({ mutationFn: async () => { for (const piece of [...scannedRef.current]) await restoreScanned(piece); publishScanned([]); return apiDelete(`/orders/${openOrder?.id ?? ""}`); }, onSuccess: () => { toast.success("Pedido cancelado."); invalidate(); } });

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
  const submitNewOrder = (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id || !user.email) { toast.error("Não foi possível identificar sua conta."); return; }
    if (comprador.trim() && separador.trim()) createOrder.mutate({ comprador: comprador.trim(), separador: separador.trim(), created_by: user.id, created_by_email: user.email });
  };
  const submitAddItem = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVariant || !qtyValid) { toast.error("Escolha o produto, a cor, o tamanho e uma quantidade válida."); return; }
    if (qtyExceedsStock) { toast.error("Quantidade maior que o estoque disponível."); return; }
    addItem.mutate({ item_id: selectedVariant.id, quantity: qtyNum });
  };

  return <>
    <div className="screen-only space-y-8">
      <div><h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Montagem de Pedidos</h1><p className="mt-1 text-sm text-muted-foreground">Registre as saídas, marque cada item e finalize a montagem.</p></div>
      <Card><CardHeader><CardTitle className="font-heading text-xl">Separar com Bipe</CardTitle><CardDescription>Leia o código serial da etiqueta com leitor USB/Bluetooth ou câmera. Cada etiqueta deve ser registrada uma única vez.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void addScannedLabel(scanValue); }}><Input autoFocus value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Código da etiqueta" disabled={!openOrder}/><Button type="submit" disabled={!openOrder}>Registrar</Button></form>
        <div id="piece-label-camera" className={cameraOn ? "h-64 w-full overflow-hidden rounded-md border" : "hidden"}/>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={!openOrder} onClick={() => setCameraOn(!cameraOn)}>{cameraOn ? "Desligar câmera" : "Usar câmera"}</Button>{scanned.length > 0 && <Button type="button" variant="destructive" onClick={() => void cancelOrder.mutate()} disabled={cancelOrder.isPending}>Cancelar pedido</Button>}</div>
        {scanAlert && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{scanAlert}</p>}
        {!openOrder && <p className="text-sm text-muted-foreground">Não há pedido aberto da sua conta. Você pode iniciar um novo pedido a qualquer momento abaixo.</p>}
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="font-heading text-xl">Novo Pedido</CardTitle><CardDescription>Qualquer membro pode iniciar um novo pedido a qualquer momento. Número gerado automaticamente pelo banco: próximo número aproximado {orderLabel(nextNumber)}.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submitNewOrder} className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="comprador">Comprador</Label><Input id="comprador" value={comprador} onChange={(event) => setComprador(event.target.value)} placeholder="Nome do comprador" required/></div><div className="space-y-2"><Label htmlFor="separador">Separador</Label><Input id="separador" value={separador} onChange={(event) => setSeparador(event.target.value)} required/></div><div className="flex items-end"><Button type="submit" disabled={createOrder.isPending || !comprador.trim() || !separador.trim()}><Plus className="mr-2 h-4 w-4"/>Iniciar Pedido</Button></div></form>
        </CardContent>
      </Card>

      {openOrder && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="font-heading text-xl">Pedido {orderLabel(openOrder.number)}</CardTitle><CardDescription>{openOrder.comprador} • Separador: {openOrder.separador}</CardDescription></div><Badge variant="secondary">Aberto</Badge></div></CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={submitAddItem} className="grid items-end gap-3 sm:grid-cols-5"><div className="space-y-2 sm:col-span-2"><Label>Produto</Label><Select value={selProduct} onValueChange={(value) => { setSelProduct(value); setSelColor(null); }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{productNamePlural(product.id)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Cor</Label><Select value={selColorValue} onValueChange={setSelColor}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(selProductDef?.colors ?? []).map((colorId) => <SelectItem key={colorId} value={colorId}>{colorMeta(colorId).label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Tamanho</Label><Select value={selSizeValue} onValueChange={setSelSize}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{selSizes.map((size) => <SelectItem key={size} value={size}>{size}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-[1fr_auto] items-end gap-2"><div className="space-y-2"><Label>Qtd.</Label><Input type="number" min="1" value={qty} onChange={(event) => setQty(event.target.value)}/></div><Button type="submit" disabled={addItem.isPending}><Plus className="h-4 w-4"/></Button></div></form>
          {openOrder.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item no pedido. Adicione os produtos acima ou use o bipe.</p> : <ul className="space-y-2">{openOrder.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div className="flex items-center gap-3"><Checkbox checked={item.picked} onCheckedChange={(checked) => toggleItem.mutate({ rowId: item.id, picked: Boolean(checked) })}/><div><p className="font-medium">{productName(item.product_type)} · {colorMeta(item.color).label} · {item.size}</p><p className="text-xs text-muted-foreground">Quantidade: {item.quantity}</p></div></div><Button type="button" size="icon" variant="ghost" onClick={() => removeItem.mutate(item.id)}><X className="h-4 w-4"/></Button></li>)}</ul>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">Separados/bipados: {pickedCount} de {itemCount} itens.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPrintOrder(openOrder)}><Printer className="mr-2 h-4 w-4"/>Imprimir</Button><Button type="button" onClick={() => finalizeOrder.mutate()} disabled={finalizeOrder.isPending}><Check className="mr-2 h-4 w-4"/>Finalizar Pedido</Button></div></div>
        </CardContent></Card>}

      <Card><CardHeader><CardTitle className="font-heading text-xl">Histórico de Pedidos Montados</CardTitle><CardDescription>Todos os pedidos finalizados da loja, visíveis para todos os membros.</CardDescription></CardHeader>
        <CardContent>{finalizedOrders.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido finalizado.</p> : <Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Comprador</TableHead><TableHead>Separador</TableHead><TableHead>Finalizado em</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{finalizedOrders.map((order) => <TableRow key={order.id}><TableCell>{orderLabel(order.number)}</TableCell><TableCell>{order.comprador}</TableCell><TableCell>{order.separador}</TableCell><TableCell>{formatDateTime(order.finalized_at)}</TableCell><TableCell><Button type="button" size="icon" variant="ghost" onClick={() => setPrintOrder(order)}><Printer class="h-4 w-4"/></Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent>
      </Card>
    </div>
    {printOrder && <OrderReceipt order={printOrder}/>} 
  </>;
}
