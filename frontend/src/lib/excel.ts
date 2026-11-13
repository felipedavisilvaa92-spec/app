// Planilha Excel gerada no próprio navegador: abas "Estoque" e "Histórico".
import writeXlsxFile from "write-excel-file/browser";
import type { SheetData } from "write-excel-file/browser";
import { VARIANTS } from "@/lib/catalog";
import { colorMeta, productName } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import { loadState } from "@/lib/localdb";

const header = (labels: string[]) => labels.map((value) => ({ value, fontWeight: "bold" as const }));

export async function exportExcel(): Promise<void> {
  const state = loadState();

  const stock: SheetData = [
    header(["Produto", "Cor", "Tamanho", "Quantidade"]),
    ...VARIANTS.map((v) => [
      { value: productName(v.product_type) },
      { value: colorMeta(v.color).name },
      { value: v.size },
      { value: state.quantities[v.id] ?? 0 },
    ]),
  ];

  const history: SheetData = [
    header(["Data", "Tipo", "Produto", "Cor", "Tamanho", "Quantidade", "Observação"]),
    ...[...state.movements]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((m) => [
        { value: formatDateTime(m.created_at) },
        { value: m.kind === "entrada" ? "Entrada" : "Saída" },
        { value: productName(m.product_type) },
        { value: colorMeta(m.color).name },
        { value: m.size },
        { value: m.quantity },
        { value: m.note ?? "" },
      ]),
  ];

  const date = new Date().toISOString().slice(0, 10);
  await writeXlsxFile([
    { data: stock, sheet: "Estoque", columns: [{ width: 14 }, { width: 16 }, { width: 10 }, { width: 12 }] },
    {
      data: history,
      sheet: "Histórico",
      columns: [{ width: 18 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 36 }],
    },
  ]).toFile(`estoque-${date}.xlsx`);
}
