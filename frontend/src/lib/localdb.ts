// Banco de dados local: todo o estado do app vive no LocalStorage deste navegador.
// Expõe as mesmas "rotas" que o antigo backend (/catalog, /stock, /movements, /dashboard,
// /orders…), para que as páginas sigam usando apiGet/apiPost sem mudanças.
import { PRODUCTS, VARIANTS, VARIANT_BY_ID } from "@/lib/catalog";
import { colorMeta, productName } from "@/lib/colors";
import { fail } from "@/lib/errors";
import type {
  Catalog,
  DashboardSummary,
  Movement,
  MovementKind,
  Order,
  OrderItem,
  StockItem,
  TopSold,
} from "@/lib/types";

export const STORAGE_KEY = "controlador-estoque:v1";

export interface DbState {
  version: 1;
  created_at: string;
  quantities: Record<string, number>;
  updated_at: Record<string, string>;
  movements: Movement[];
  orders: Order[];
  last_backup_at: string | null;
}

function emptyState(): DbState {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    quantities: {},
    updated_at: {},
    movements: [],
    orders: [],
    last_backup_at: null,
  };
}

export function isDbState(value: unknown): value is DbState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DbState>;
  return (
    v.version === 1 &&
    typeof v.created_at === "string" &&
    !!v.quantities &&
    typeof v.quantities === "object" &&
    !!v.updated_at &&
    typeof v.updated_at === "object" &&
    Array.isArray(v.movements) &&
    Array.isArray(v.orders)
  );
}

export function loadState(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (isDbState(parsed)) return { ...parsed, last_backup_at: parsed.last_backup_at ?? null };
  } catch {
    // dado corrompido: cai para estado vazio, sem derrubar o app
  }
  return emptyState();
}

export function saveState(state: DbState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    fail(507, "Não foi possível salvar no navegador (armazenamento cheio ou bloqueado).");
  }
}

const now = () => new Date().toISOString();
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function variantLabel(v: { product_type: string; color: string; size: string }): string {
  return `${productName(v.product_type)} ${colorMeta(v.color).name} · ${v.size}`;
}

function orderLabel(number: number): string {
  return `Pedido #${String(number).padStart(3, "0")}`;
}

function positiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail(422, "A quantidade deve ser um número inteiro maior que zero");
  }
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) fail(422, `Preencha o campo ${field}`);
  return value.trim();
}

function asBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

// ---------- leitura ----------

function listStock(state: DbState): StockItem[] {
  return VARIANTS.map((v) => ({
    ...v,
    quantity: state.quantities[v.id] ?? 0,
    created_at: state.created_at,
    updated_at: state.updated_at[v.id] ?? null,
  }));
}

function listMovements(state: DbState, params: URLSearchParams): Movement[] {
  const kind = params.get("kind");
  const itemId = params.get("item_id");
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "100", 10) || 100, 1), 500);
  return [...state.movements]
    .filter((m) => (kind === "entrada" || kind === "saida" ? m.kind === kind : true))
    .filter((m) => (itemId ? m.item_id === itemId : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

function dashboard(state: DbState): DashboardSummary {
  const quantities = VARIANTS.map((v) => state.quantities[v.id] ?? 0);
  const sold = new Map<string, TopSold>();
  for (const m of state.movements) {
    if (m.kind !== "saida") continue;
    const key = `${m.product_type}:${m.color}:${m.size}`;
    const row = sold.get(key) ?? { product_type: m.product_type, size: m.size, color: m.color, total_sold: 0 };
    row.total_sold += m.quantity;
    sold.set(key, row);
  }
  return {
    total_pieces: quantities.reduce((a, q) => a + q, 0),
    zero_stock: quantities.filter((q) => q === 0).length,
    low_stock: quantities.filter((q) => q >= 1 && q <= 3).length,
    top_sold: [...sold.values()].sort((a, b) => b.total_sold - a.total_sold).slice(0, 5),
  };
}

// ---------- escrita ----------

function recordMovement(
  state: DbState,
  itemId: string,
  kind: MovementKind,
  quantity: number,
  note: string | null,
  orderNumber: number | null,
  at: string
): Movement {
  const variant = VARIANT_BY_ID[itemId];
  if (!variant) fail(404, "Item de estoque não encontrado");
  const current = state.quantities[itemId] ?? 0;
  if (kind === "saida" && quantity > current) fail(400, "Quantidade de saída maior que o estoque disponível");
  state.quantities[itemId] = kind === "entrada" ? current + quantity : current - quantity;
  state.updated_at[itemId] = at;
  const movement: Movement = {
    id: newId(),
    item_id: itemId,
    product_type: variant.product_type,
    size: variant.size,
    color: variant.color,
    kind,
    quantity,
    note,
    order_number: orderNumber,
    created_at: at,
  };
  state.movements.push(movement);
  return movement;
}

function createMovement(state: DbState, body: Record<string, unknown>): Movement {
  const kind = body.kind;
  if (kind !== "entrada" && kind !== "saida") fail(422, "Tipo de movimentação inválido");
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  return recordMovement(state, itemId, kind, positiveInt(body.quantity), note, null, now());
}

function findOrder(state: DbState, orderId: string): Order {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) fail(404, "Pedido não encontrado");
  return order;
}

function findOpenOrder(state: DbState, orderId: string): Order {
  const order = findOrder(state, orderId);
  if (order.status !== "aberto") fail(400, "Pedido já finalizado");
  return order;
}

function createOrder(state: DbState, body: Record<string, unknown>): Order {
  const comprador = requiredText(body.comprador, "Nome do Comprador");
  const separador = requiredText(body.separador, "Nome do Separador");
  const number = state.orders.reduce((max, o) => Math.max(max, o.number), 0) + 1;
  const order: Order = {
    id: newId(),
    number,
    comprador,
    separador,
    status: "aberto",
    items: [],
    created_at: now(),
    finalized_at: null,
    created_by: null,
    created_by_email: null,
  };
  state.orders.push(order);
  return order;
}

function addOrderItem(state: DbState, orderId: string, body: Record<string, unknown>): Order {
  const order = findOpenOrder(state, orderId);
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  const variant = VARIANT_BY_ID[itemId];
  if (!variant) fail(404, "Variante não encontrada no estoque");
  const quantity = positiveInt(body.quantity);
  const row = order.items.find((r) => r.item_id === itemId);
  if (row) {
    row.quantity += quantity;
  } else {
    const item: OrderItem = {
      id: newId(),
      item_id: itemId,
      product_type: variant.product_type,
      size: variant.size,
      color: variant.color,
      quantity,
      picked: false,
    };
    order.items.push(item);
  }
  return order;
}

function setOrderItemPicked(state: DbState, orderId: string, rowId: string, body: Record<string, unknown>): Order {
  const order = findOpenOrder(state, orderId);
  const row = order.items.find((r) => r.id === rowId);
  if (!row) fail(404, "Item não encontrado no pedido");
  if (typeof body.picked !== "boolean") fail(422, "Valor de separado inválido");
  row.picked = body.picked;
  return order;
}

function removeOrderItem(state: DbState, orderId: string, rowId: string): Order {
  const order = findOpenOrder(state, orderId);
  const remaining = order.items.filter((r) => r.id !== rowId);
  if (remaining.length === order.items.length) fail(404, "Item não encontrado no pedido");
  order.items = remaining;
  return order;
}

function cancelOrder(state: DbState, orderId: string): void {
  // Cancelamento lógico: o pedido fica guardado como "cancelado" e o número continua reservado.
  const order = findOpenOrder(state, orderId);
  order.status = "cancelado";
  order.finalized_at = now();
}

function finalizeOrder(state: DbState, orderId: string): Order {
  const order = findOpenOrder(state, orderId);
  const picked = order.items.filter((r) => r.picked);
  if (picked.length === 0) fail(400, "Marque ao menos um item como separado para dar baixa no estoque");

  // Confere todo o estoque antes de abater qualquer item (tudo ou nada).
  const insufficient = picked
    .filter((r) => r.quantity > (state.quantities[r.item_id] ?? 0))
    .map((r) => `${variantLabel(r)}: disponível ${state.quantities[r.item_id] ?? 0}, pedido ${r.quantity}`);
  if (insufficient.length) fail(400, `Estoque insuficiente — ${insufficient.join("; ")}`);

  const at = now();
  const note = `${orderLabel(order.number)} · ${order.comprador}`;
  for (const row of picked) recordMovement(state, row.item_id, "saida", row.quantity, note, order.number, at);
  order.status = "finalizado";
  order.finalized_at = at;
  return order;
}

// ---------- roteador ----------

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function handle(method: string, path: string, body: unknown): unknown {
  const url = new URL(path, "http://local");
  const parts = url.pathname.split("/").filter(Boolean);
  const data = asBody(body);
  const state = loadState();

  // leitura
  if (method === "GET") {
    if (url.pathname === "/catalog") return clone<Catalog>({ products: PRODUCTS });
    if (url.pathname === "/stock") return listStock(state);
    if (url.pathname === "/movements") return clone(listMovements(state, url.searchParams));
    if (url.pathname === "/dashboard") return dashboard(state);
    if (url.pathname === "/orders") {
      return clone(
        state.orders
          .filter((o) => o.status !== "cancelado")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      );
    }
    fail(404, "Rota não encontrada");
  }

  // escrita — salva o estado só se a operação inteira deu certo
  let result: unknown;
  if (method === "POST" && url.pathname === "/movements") {
    result = createMovement(state, data);
  } else if (method === "POST" && url.pathname === "/orders") {
    result = createOrder(state, data);
  } else if (parts[0] === "orders" && parts.length === 3 && parts[2] === "items" && method === "POST") {
    result = addOrderItem(state, parts[1], data);
  } else if (parts[0] === "orders" && parts.length === 3 && parts[2] === "finalize" && method === "POST") {
    result = finalizeOrder(state, parts[1]);
  } else if (parts[0] === "orders" && parts.length === 4 && parts[2] === "items" && method === "PATCH") {
    result = setOrderItemPicked(state, parts[1], parts[3], data);
  } else if (parts[0] === "orders" && parts.length === 4 && parts[2] === "items" && method === "DELETE") {
    result = removeOrderItem(state, parts[1], parts[3]);
  } else if (parts[0] === "orders" && parts.length === 2 && method === "DELETE") {
    cancelOrder(state, parts[1]);
    result = undefined;
  } else {
    fail(404, "Rota não encontrada");
  }
  saveState(state);
  return result === undefined ? undefined : clone(result);
}
