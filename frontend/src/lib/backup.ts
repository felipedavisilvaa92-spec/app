// Backup em arquivo JSON: leva todos os dados (estoque, saídas, pedidos, compradores,
// separadores) para outro computador/navegador.
import { isDbState, loadState, saveState } from "@/lib/localdb";
import type { DbState } from "@/lib/localdb";

const BACKUP_APP = "controlador-estoque";

interface BackupFile {
  app: typeof BACKUP_APP;
  version: 1;
  exported_at: string;
  data: DbState;
}

function downloadFile(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportBackup(): string {
  const state = loadState();
  const exportedAt = new Date().toISOString();
  state.last_backup_at = exportedAt;
  saveState(state);
  const file: BackupFile = { app: BACKUP_APP, version: 1, exported_at: exportedAt, data: state };
  const stamp = exportedAt.slice(0, 16).replace("T", "_").replace(":", "-");
  const fileName = `backup-estoque-${stamp}.json`;
  downloadFile(JSON.stringify(file, null, 2), fileName, "application/json");
  return fileName;
}

export interface BackupSummary {
  exported_at: string;
  pieces: number;
  movements: number;
  orders: number;
}

// Lê e valida o arquivo; não grava nada — a gravação só acontece em applyBackup após confirmação.
export async function readBackup(file: File): Promise<{ state: DbState; summary: BackupSummary }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Arquivo inválido: não é um JSON.");
  }
  const candidate = parsed as Partial<BackupFile> | null;
  if (!candidate || candidate.app !== BACKUP_APP || !isDbState(candidate.data)) {
    throw new Error("Este arquivo não é um backup do Controlador de Estoque.");
  }
  const state = candidate.data;
  return {
    state,
    summary: {
      exported_at: candidate.exported_at ?? "",
      pieces: Object.values(state.quantities).reduce((a, q) => a + (typeof q === "number" ? q : 0), 0),
      movements: state.movements.length,
      orders: state.orders.filter((o) => o.status !== "cancelado").length,
    },
  };
}

export function applyBackup(state: DbState): void {
  saveState({ ...state, last_backup_at: state.last_backup_at ?? null });
}

export function lastBackupAt(): string | null {
  return loadState().last_backup_at;
}
