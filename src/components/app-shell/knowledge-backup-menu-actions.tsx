"use client";

import { Download, Trash2, Upload } from "lucide-react";
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
  storageAdapter,
} from "@/infrastructure/repositories";
import { getPublicApiUrl } from "@/features/auth/public-api-url";
import { createKnowledgeResetClient } from "@/features/knowledge-reset/knowledge-reset-client";
import {
  KNOWLEDGE_RESET_CONFIRMATION,
  KnowledgeResetError,
  resetKnowledge,
  summarizeLocalKnowledge,
  type KnowledgeResetCounts,
} from "@/features/knowledge-reset/knowledge-reset";

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
  const [resetSummary, setResetSummary] = useState<KnowledgeResetCounts | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  async function handleResetSelect() {
    if (vinemaContext.status !== "ready") {
      feedback.error("No se pudo cargar el workspace local.");
      return;
    }

    try {
      setResetSummary(await summarizeLocalKnowledge(vinemaContext.workspace.id));
      setResetConfirmation("");
    } catch {
      feedback.error("No se pudo preparar el vaciado.");
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

  async function confirmReset() {
    if (vinemaContext.status !== "ready" || !auth.accessToken) {
      feedback.error("No se pudo cargar el contexto de vaciado.");
      return;
    }

    setResetting(true);
    feedback.saving();
    try {
      const baseUrl = getPublicApiUrl();
      if (!baseUrl) {
        throw new Error("API no configurada.");
      }

      await resetKnowledge({
        workspaceId: vinemaContext.workspace.id,
        confirmation: resetConfirmation,
        storage: storageAdapter,
        remoteClient: createKnowledgeResetClient({
          baseUrl,
          accessTokenProvider: {
            getAccessToken: () => auth.accessToken,
          },
        }),
      });
      setResetSummary(null);
      setResetConfirmation("");
      feedback.success("Conocimiento vaciado.");
    } catch (error) {
      feedback.error(toUserResetError(error));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <DropdownMenuItem
        disabled={!ready || resetting}
        onSelect={(event) => {
          event.preventDefault();
          void handleBackup();
        }}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        Respaldar conocimiento
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!ready || resetting}
        onSelect={(event) => {
          event.preventDefault();
          handleRestoreSelect();
        }}
      >
        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
        Restaurar conocimiento
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!ready || restoring || resetting}
        className="text-red-700 focus:bg-red-50 focus:text-red-800"
        onSelect={(event) => {
          event.preventDefault();
          void handleResetSelect();
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
        Vaciar conocimiento
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
      {resetSummary ? (
        <ResetConfirmationDialog
          summary={resetSummary}
          confirmation={resetConfirmation}
          resetting={resetting}
          onConfirmationChange={setResetConfirmation}
          onCancel={() => setResetSummary(null)}
          onConfirm={confirmReset}
        />
      ) : null}
    </>
  );
}

function ResetConfirmationDialog({
  summary,
  confirmation,
  resetting,
  onConfirmationChange,
  onCancel,
  onConfirm,
}: {
  summary: KnowledgeResetCounts;
  confirmation: string;
  resetting: boolean;
  onConfirmationChange(value: string): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const canReset = confirmation === KNOWLEDGE_RESET_CONFIRMATION && !resetting;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/20 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-knowledge-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 id="reset-knowledge-title" className="text-base font-semibold text-zinc-950">
          Vaciar conocimiento
        </h2>
        <div className="mt-4 space-y-3 text-sm text-zinc-600">
          <p>
            {summary.nodes} capturas · {summary.contexts} conceptos ·{" "}
            {summary.relations} relaciones
          </p>
          <p>
            Esta accion elimina el conocimiento del workspace en todos los
            dispositivos. Antes de continuar, usa Respaldar conocimiento.
          </p>
          <label className="block text-xs font-medium text-zinc-700">
            Escribe VACIAR para confirmar
            <input
              className="mt-2 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              disabled={resetting}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={resetting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-red-700 hover:bg-red-800"
            onClick={onConfirm}
            disabled={!canReset}
          >
            Vaciar conocimiento
          </Button>
        </div>
      </div>
    </div>
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

function toUserResetError(error: unknown) {
  if (error instanceof KnowledgeResetError) {
    return error.message;
  }

  return "No se pudo vaciar el conocimiento.";
}
