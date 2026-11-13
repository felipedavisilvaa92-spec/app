import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { applyBackup, exportBackup, lastBackupAt, readBackup } from "@/lib/backup";
import type { BackupSummary } from "@/lib/backup";
import type { DbState } from "@/lib/localdb";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BackupMenu() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [pending, setPending] = useState<{ state: DbState; summary: BackupSummary } | null>(null);

  const openDialog = () => {
    setLastBackup(lastBackupAt());
    setPending(null);
    setOpen(true);
  };

  const handleExport = () => {
    try {
      const name = exportBackup();
      setLastBackup(lastBackupAt());
      toast.success(`Backup salvo: ${name}`);
    } catch {
      toast.error("Não foi possível gerar o backup.");
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPending(await readBackup(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Arquivo de backup inválido.");
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    applyBackup(pending.state);
    queryClient.invalidateQueries();
    setPending(null);
    setOpen(false);
    toast.success("Backup importado — dados restaurados!");
  };

  return (
    <>
      <Button variant="outline" size="sm" data-testid="btn-open-backup" onClick={openDialog}>
        <DatabaseBackup className="mr-1.5 size-4" /> Backup
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="backup-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Backup dos dados</DialogTitle>
            <DialogDescription>
              Seus dados ficam salvos só neste navegador. Exporte um backup para guardar uma cópia ou para
              levar tudo para outro computador.
            </DialogDescription>
          </DialogHeader>

          {pending ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" data-testid="backup-import-confirm">
              <p className="font-medium text-amber-900">Substituir os dados deste navegador por este backup?</p>
              <ul className="space-y-0.5 text-amber-900">
                <li>
                  Backup de: {pending.summary.exported_at ? formatDateTime(pending.summary.exported_at) : "—"}
                </li>
                <li>{pending.summary.pieces} peças em estoque</li>
                <li>{pending.summary.movements} movimentações</li>
                <li>{pending.summary.orders} pedidos</li>
              </ul>
              <p className="text-xs text-amber-800">
                Os dados atuais deste navegador serão trocados pelos do arquivo. Se precisar, exporte um backup
                antes.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" data-testid="btn-backup-import-cancel" onClick={() => setPending(null)}>
                  Cancelar
                </Button>
                <Button size="sm" data-testid="btn-backup-import-confirm" onClick={confirmImport}>
                  Sim, importar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="backup-last">
              Último backup exportado: {lastBackup ? formatDateTime(lastBackup) : "nenhum ainda"}
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" data-testid="btn-backup-import" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-2 size-4" /> Importar Backup
            </Button>
            <Button data-testid="btn-backup-export" onClick={handleExport}>
              <Download className="mr-2 size-4" /> Exportar Backup
            </Button>
          </DialogFooter>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="input-backup-file"
            onChange={handleFile}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
