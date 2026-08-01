"use client";

import { Download, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useVisualFeedback } from "@/features/feedback/visual-feedback-provider";
import {
  KnowledgeBackupValidationError,
  KnowledgeRestoreConflictError,
  exportKnowledgeBackup,
  restoreKnowledgeBackup,
  type KnowledgeBackup,
} from "@/features/knowledge-backup/knowledge-backup";
import {
  downloadKnowledgeBackup,
  readKnowledgeBackupFile,
} from "@/features/knowledge-backup/knowledge-backup-browser";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import {
  createLocalSyncRepositorySet,
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";

type RestorePreview = {
  fileName: string;
  backup: KnowledgeBackup;
};

export function KnowledgeBackupMenuActions() {
  const auth = useAuth();
  const vinemaContext = useVinemaContext();
  const feedback = useVisualFeedback();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoring, setRestoring] = useState(false);
  const ready =
    vinemaContext.status === "ready" &&
    auth.isAuthenticated &&
    Boolean(auth.workspaceId) &&
    Boolean(auth.deviceId);

  async function handleBackup() {
    if (vinemaContext.status !== "ready") {
      feedback.error("No se pudo cargar el workspace local.");
      return;
    }

    feedback.saving();
    try {
      const backup = await exportKnowledgeBackup({
        workspace: vinemaContext.workspace,
        repositories: {
          nodeRepository,
          contextRepository,
          relationRepository: nodeContextRelationRepository,
        },
      });
      downloadKnowledgeBackup(backup);
      feedback.success("Respaldo listo.");
    } catch {
      feedback.error("No se pudo respaldar el conocimiento.");
    }
  }

  function handleRestoreSelect() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    feedback.saving();
    try {
      const backup = await readKnowledgeBackupFile(file);
      setRestorePreview({ fileName: file.name, backup });
      feedback.success("Respaldo valido.");
    } catch (error) {
      feedback.error(toUserRestoreError(error));
      setRestorePreview(null);
    }
  }

  async function confirmRestore() {
    if (vinemaContext.status !== "ready" || !auth.deviceId || !restorePreview) {
      feedback.error("No se pudo cargar el contexto de restauracion.");
      return;
    }

    setRestoring(true);
    feedback.saving();
    try {
      const repositories = createLocalSyncRepositorySet({
        workspaceId: vinemaContext.workspace.id,
        deviceId: auth.deviceId,
      });
      const result = await restoreKnowledgeBackup({
        backup: restorePreview.backup,
        workspace: vinemaContext.workspace,
        deviceId: auth.deviceId,
        repositories: {
          nodeRepository: repositories.nodeRepository,
          contextRepository: repositories.contextRepository,
          relationRepository: repositories.nodeContextRelationRepository,
        },
        syncNow: auth.syncNow,
      });

      setRestorePreview(null);
      feedback.success(
        result.createdNodes + result.createdContexts + result.createdRelations > 0
          ? "Conocimiento restaurado."
          : "El respaldo ya estaba restaurado.",
      );
    } catch (error) {
      feedback.error(toUserRestoreError(error));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <DropdownMenuItem
        disabled={!ready}
        onSelect={(event) => {
          event.preventDefault();
          void handleBackup();
        }}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        Respaldar conocimiento
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!ready}
        onSelect={(event) => {
          event.preventDefault();
          handleRestoreSelect();
        }}
      >
        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
        Restaurar conocimiento
      </DropdownMenuItem>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Seleccionar respaldo de conocimiento"
      />
      {restorePreview ? (
        <RestoreConfirmationDialog
          preview={restorePreview}
          restoring={restoring}
          onCancel={() => setRestorePreview(null)}
          onConfirm={confirmRestore}
        />
      ) : null}
    </>
  );
}

function RestoreConfirmationDialog({
  preview,
  restoring,
  onCancel,
  onConfirm,
}: {
  preview: RestorePreview;
  restoring: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { backup } = preview;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/20 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-knowledge-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 id="restore-knowledge-title" className="text-base font-semibold text-zinc-950">
          Restaurar conocimiento
        </h2>
        <div className="mt-4 space-y-2 text-sm text-zinc-600">
          <p className="truncate">{preview.fileName}</p>
          <p>
            {backup.summary.nodes} capturas · {backup.summary.contexts} conceptos ·{" "}
            {backup.summary.relations} relaciones
          </p>
          <p>Exportado: {new Date(backup.exportedAt).toLocaleString()}</p>
          <p>
            Vinema agregara solo conocimiento nuevo. Si detecta conflictos, no
            aplicara cambios parciales.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={restoring}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={restoring}>
            Restaurar
          </Button>
        </div>
      </div>
    </div>
  );
}

function toUserRestoreError(error: unknown) {
  if (error instanceof KnowledgeRestoreConflictError) {
    return "El respaldo tiene conflictos con conocimiento existente.";
  }

  if (error instanceof KnowledgeBackupValidationError) {
    return error.message;
  }

  return "No se pudo restaurar el respaldo.";
}
