// Hand-written mirror of backend/models/stock.py (Pydantic v2) — keep the pair in sync.
export const SIZES = ["P", "M", "G", "GG"];

export type MovementKind = "entrada" | "saida";

export interface ProductType {
  id: string;
  name: string;
  name_plural: string;
  description: string;
  sizes: string[];
  colors: string[];
}

export interface Catalog {
  products: ProductType[];
}

export interface StockItem {
  id: string;
  product_type: string;
  size: string;
  color: string;
  quantity: number;
  created_at: string;
  updated_at: string | null;
}

export interface MovementCreate {
  item_id: string;
  kind: MovementKind;
  quantity: number;
  note: string | null;
}

export interface Movement {
  id: string;
  item_id: string;
  product_type: string;
  size: string;
  color: string;
  kind: MovementKind;
  quantity: number;
  note: string | null;
  order_number: number | null;
  created_at: string;
}

export interface TopSold {
  product_type: string;
  size: string;
  color: string;
  total_sold: number;
}

export interface DashboardSummary {
  total_pieces: number;
  zero_stock: number;
  low_stock: number;
  top_sold: TopSold[];
}

export interface OrderItem {
  id: string;
  item_id: string;
  product_type: string;
  size: string;
  color: string;
  quantity: number;
  picked: boolean;
}

export interface Order {
  id: string;
  number: number;
  comprador: string;
  separador: string;
  status: "aberto" | "finalizado" | "cancelado";
  items: OrderItem[];
  created_at: string;
  finalized_at: string | null;
}

export interface OrderCreate {
  comprador: string;
  separador: string;
}
