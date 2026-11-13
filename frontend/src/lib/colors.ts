// Apparel color palette + product labels for the fixed catalog (backend/lib/catalog.py).
export interface ColorMeta {
  name: string;
  hex: string;
  border: string;
  text: string;
}

export const COLOR_META: Record<string, ColorMeta> = {
  cinza: { name: "Cinza", hex: "#9CA3AF", border: "#6B7280", text: "#1F2937" },
  roxo: { name: "Roxo", hex: "#8B5CF6", border: "#7C3AED", text: "#FFFFFF" },
  amarelo: { name: "Amarelo", hex: "#FBBF24", border: "#D97706", text: "#78350F" },
  azul_royal: { name: "Azul Royal", hex: "#2563EB", border: "#1D4ED8", text: "#FFFFFF" },
  azul_marinho: { name: "Azul Marinho", hex: "#1E293B", border: "#0F172A", text: "#FFFFFF" },
  preta: { name: "Preta", hex: "#18181B", border: "#09090B", text: "#FFFFFF" },
  branca: { name: "Branca", hex: "#FFFFFF", border: "#CBD5E1", text: "#0F172A" },
  caqui: { name: "Caqui", hex: "#C2B280", border: "#A39260", text: "#3E3618" },
  marrom: { name: "Marrom", hex: "#78350F", border: "#542407", text: "#FFFFFF" },
  bege: { name: "Bege", hex: "#E6D5B8", border: "#C6AC80", text: "#5F4C28" },
  rosa: { name: "Rosa", hex: "#F472B6", border: "#DB2777", text: "#831843" },
  off_white: { name: "Off White", hex: "#FAF9F6", border: "#E2E8F0", text: "#334155" },
  vermelha: { name: "Vermelha", hex: "#EF4444", border: "#DC2626", text: "#FFFFFF" },
};

const FALLBACK: ColorMeta = { name: "Cor", hex: "#CBD5E1", border: "#94A3B8", text: "#0F172A" };

export function colorMeta(colorId: string): ColorMeta {
  return COLOR_META[colorId] ?? FALLBACK;
}

const PRODUCT_NAMES: Record<string, { singular: string; plural: string }> = {
  camiseta: { singular: "Camiseta", plural: "Camisetas" },
  regata: { singular: "Regata", plural: "Regatas" },
  short: { singular: "Short", plural: "Shorts" },
};

export function productName(id: string): string {
  return PRODUCT_NAMES[id]?.singular ?? id;
}

export function productNamePlural(id: string): string {
  return PRODUCT_NAMES[id]?.plural ?? id;
}
