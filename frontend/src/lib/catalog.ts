import type { ProductType } from "@/lib/types";
import { SIZES } from "@/lib/types";

// Catálogo fixo: camisetas (12 cores), regatas (4 cores) e shorts (3 cores), tamanhos P–GG.
const CAMISETA_COLORS = [
  "cinza",
  "roxo",
  "amarelo",
  "azul_royal",
  "azul_marinho",
  "preta",
  "branca",
  "caqui",
  "marrom",
  "rosa",
  "off_white",
  "vermelha",
];
const KIDS_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16"];
const REGATA_COLORS = ["marrom", "preta", "bege", "branca"];
const SHORT_COLORS = ["branca", "preta", "azul_marinho"];

export const PRODUCTS: ProductType[] = [
  {
    id: "camiseta",
    name: "Camiseta",
    name_plural: "Camisetas",
    description: "Camisetas unissex em algodão",
    sizes: [...SIZES],
    colors: CAMISETA_COLORS,
  },
  {
    id: "camiseta_infantil",
    name: "Camiseta Infantil",
    name_plural: "Camisetas Infantis",
    description: "Camisetas infantis em algodão",
    sizes: KIDS_SIZES,
    colors: CAMISETA_COLORS,
  },
  {
    id: "regata",
    name: "Regata",
    name_plural: "Regatas",
    description: "Regatas casuais e caneladas",
    sizes: [...SIZES],
    colors: REGATA_COLORS,
  },
  {
    id: "short",
    name: "Short",
    name_plural: "Shorts",
    description: "Shorts casuais e esportivos",
    sizes: [...SIZES],
    colors: SHORT_COLORS,
  },
];

// Id determinístico da variante — o mesmo em qualquer navegador, então backups são portáveis.
export function variantId(productType: string, color: string, size: string): string {
  return `${productType}:${color}:${size}`;
}

export interface Variant {
  id: string;
  product_type: string;
  color: string;
  size: string;
}

export const VARIANTS: Variant[] = PRODUCTS.flatMap((p) =>
  p.colors.flatMap((color) =>
    p.sizes.map((size) => ({ id: variantId(p.id, color, size), product_type: p.id, color, size }))
  )
);

export const VARIANT_BY_ID: Record<string, Variant> = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
