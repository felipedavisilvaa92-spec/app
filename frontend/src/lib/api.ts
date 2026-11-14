import { PRODUCTS, VARIANTS } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import { fail } from "@/lib/errors";
import type { Catalog, DashboardSummary, Movement, MovementKind, Order, OrderItem, StockItem } from "@/lib/types";

let shopId: string | null = null;
export const setDataShop = (id: string | null) => { shopId = id; };
const requireShop = () => { if (!shopId) fail(401, "Entre em uma loja para continuar."); return shopId; };
const ensure = <T>(data: T, error: { message: string } | null): T => { if (error) fail(400, error.message); return data; };
const uuid = () => crypto.randomUUID();
const variant = (id: string) => VARIANTS.find((v) => v.id === id);
const orderSelect = "*, items:order_items(*)";

async function getOrders(id: string): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select(orderSelect).eq("shop_id", id).neq("status", "cancelado").order("created_at", { ascending: false });
  return ensure(data ?? [], error) as Order[];
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(path, "http://local");
  const parts = url.pathname.split("/").filter(Boolean);
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (method === "GET" && url.pathname === "/catalog") return { products: PRODUCTS } as T;
  const shop = requireShop();
  if (method === "GET" && url.pathname === "/stock") {
    const { data: rows, error } = await supabase.from("stock_items").select("*").eq("shop_id", shop).order("product_type");
    const map = new Map((rows ?? []).map((r) => [r.item_id, r]));
    return VARIANTS.map((v) => { const r = map.get(v.id); return { ...v, quantity: r?.quantity ?? 0, created_at: r?.created_at ?? new Date().toISOString(), updated_at: r?.updated_at ?? null }; }) as T;
  }
  if (method === "GET" && url.pathname === "/movements") {
    let query = supabase.from("movements").select("*").eq("shop_id", shop).order("created_at", { ascending: false }).limit(Math.min(Number(url.searchParams.get("limit")) || 100, 500));
    const kind = url.searchParams.get("kind"); if (kind === "entrada" || kind === "saida") query = query.eq("kind", kind);
    const item = url.searchParams.get("item_id"); if (item) query = query.eq("item_id", item);
    const { data: rows, error } = await query; return ensure(rows ?? [], error) as T;
  }
  if (method === "GET" && url.pathname === "/dashboard") {
    const [{ data: stock, error: se }, { data: moves, error: me }] = await Promise.all([supabase.from("stock_items").select("quantity").eq("shop_id", shop), supabase.from("movements").select("product_type,color,size,quantity,kind").eq("shop_id", shop).eq("kind", "saida")]);
    ensure(stock, se); ensure(moves, me);
    const sold = new Map<string, { product_type:string;color:string;size:string;total_sold:number }>();
    for (const m of moves ?? []) { const key = `${m.product_type}:${m.color}:${m.size}`; const row = sold.get(key) ?? { product_type:m.product_type,color:m.color,size:m.size,total_sold:0 }; row.total_sold += m.quantity; sold.set(key,row); }
    return { total_pieces:(stock ?? []).reduce((n,r)=>n+r.quantity,0), zero_stock:VARIANTS.length-(stock ?? []).filter(r=>r.quantity>0).length, low_stock:(stock ?? []).filter(r=>r.quantity>=1&&r.quantity<=3).length, top_sold:[...sold.values()].sort((a,b)=>b.total_sold-a.total_sold).slice(0,5) } as T;
  }
  if (method === "GET" && url.pathname === "/orders") return await getOrders(shop) as T;
  if (method === "POST" && url.pathname === "/movements") {
    const v = variant(String(data.item_id)); if (!v) fail(404,"Item de estoque não encontrado");
    const { data: movement, error } = await supabase.rpc("record_stock_movement", { p_shop_id:shop,p_item_id:v.id,p_product_type:v.product_type,p_color:v.color,p_size:v.size,p_kind:data.kind,p_quantity:data.quantity,p_note:data.note ?? null,p_order_number:null });
    return ensure(movement,error) as T;
  }
  if (method === "POST" && url.pathname === "/orders") {
    const { data: orders, error: oe } = await supabase.from("orders").select("number").eq("shop_id",shop); ensure(orders,oe);
    const number = Math.max(0,...(orders ?? []).map((o)=>o.number))+1;
    const { data: order,error } = await supabase.from("orders").insert({shop_id:shop,number,comprador:data.comprador,separador:data.separador,status:"aberto"}).select(orderSelect).single(); return ensure(order,error) as T;
  }
  if (parts[0] === "orders" && parts.length === 3 && parts[2] === "items" && method === "POST") {
    const orderId=parts[1], v=variant(String(data.item_id)); if(!v) fail(404,"Variante não encontrada no estoque");
    const { data: existing,error:ee }=await supabase.from("order_items").select("*").eq("order_id",orderId).eq("item_id",v.id).maybeSingle(); ensure(existing,ee);
    if(existing){ const {error}=await supabase.from("order_items").update({quantity:existing.quantity+Number(data.quantity)}).eq("id",existing.id); ensure(null,error); }
    else { const {error}=await supabase.from("order_items").insert({shop_id:shop,order_id:orderId,item_id:v.id,product_type:v.product_type,color:v.color,size:v.size,quantity:data.quantity,picked:false}); ensure(null,error); }
    const {data:order,error}=await supabase.from("orders").select(orderSelect).eq("id",orderId).single(); return ensure(order,error) as T;
  }
  if (parts[0] === "orders" && parts.length === 3 && parts[2] === "finalize" && method === "POST") {
    const {data:order,error}=await supabase.rpc("finalize_stock_order",{p_shop_id:shop,p_order_id:parts[1]}); return ensure(order,error) as T;
  }
  if (parts[0] === "orders" && parts.length === 4 && parts[2] === "items" && method === "PATCH") {
    const {error}=await supabase.from("order_items").update({picked:data.picked}).eq("id",parts[3]).eq("shop_id",shop); ensure(null,error);
    const {data:order,error:oe}=await supabase.from("orders").select(orderSelect).eq("id",parts[1]).single(); return ensure(order,oe) as T;
  }
  if (parts[0] === "orders" && parts.length === 4 && parts[2] === "items" && method === "DELETE") {
    const {error}=await supabase.from("order_items").delete().eq("id",parts[3]).eq("shop_id",shop); ensure(null,error); return undefined as T;
  }
  if (parts[0] === "orders" && parts.length === 2 && method === "DELETE") {
    const {error}=await supabase.from("orders").update({status:"cancelado",finalized_at:new Date().toISOString()}).eq("id",parts[1]).eq("shop_id",shop); ensure(null,error); return undefined as T;
  }
  fail(404,"Rota não encontrada");
}
export const apiGet = <T>(path:string) => request<T>("GET",path);
export const apiPost = <T>(path:string,body?:unknown) => request<T>("POST",path,body);
export const apiPatch = <T>(path:string,body?:unknown) => request<T>("PATCH",path,body);
export const apiDelete = <T>(path:string) => request<T>("DELETE",path);
export const apiPut = <T>(path:string,body?:unknown) => request<T>("PUT",path,body);
export { fail as ApiError };
export async function initializeShopStock(id:string) {
  const rows=VARIANTS.map(v=>({shop_id:id,item_id:v.id,product_type:v.product_type,color:v.color,size:v.size,quantity:0}));
  const {error}=await supabase.from("stock_items").upsert(rows,{onConflict:"shop_id,item_id",ignoreDuplicates:true}); if(error) throw error;
}
export type { Catalog, DashboardSummary, Movement, MovementKind, Order, OrderItem, StockItem };
