"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Brain,
  Download,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { getPublicApiUrl } from "@/features/auth/public-api-url";
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
import { createKnowledgeResetClient } from "@/features/knowledge-reset/knowledge-reset-client";
import {
  KNOWLEDGE_RESET_CONFIRMATION,
  KnowledgeResetError,
  resetKnowledge,
  summarizeLocalKnowledge,
  type KnowledgeResetCounts,
} from "@/features/knowledge-reset/knowledge-reset";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import {
  captureConceptRelationRepository,
  captureRepository,
  conceptRepository,
  createLocalSyncRepositorySet,
  storageAdapter,
} from "@/infrastructure/repositories";

type CenterView = "overview" | "restore-confirmation" | "reset-confirmation";

type RestorePreview = {
  fileName: string;
  backup: KnowledgeBackup;
};

const emptySummary: KnowledgeResetCounts = {
  nodes: 0,
  contexts: 0,
  relations: 0,
};

export function KnowledgeManagementCenterMenuItem({
  label = "Conocimiento",
  trigger = "menu",
}: {
  label?: string;
  trigger?: "menu" | "rail";
}) {
  const auth = useAuth();
  const vinemaContext = useVinemaContext();
  const feedback = useVisualFeedback();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CenterView>("overview");
  const [summary, setSummary] = useState<KnowledgeResetCounts>(emptySummary);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [processing, setProcessing] = useState<"backup" | "restore" | "reset" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const readyWorkspaceId =
    vinemaContext.status === "ready" ? vinemaContext.workspace.id : null;
  const ready =
    vinemaContext.status === "ready" &&
    auth.isAuthenticated &&
    Boolean(auth.workspaceId) &&
    Boolean(auth.deviceId);

  const refreshSummary = useCallback(async () => {
    if (!readyWorkspaceId) {
      setSummary(emptySummary);
      return;
    }

    try {
      setSummary(await summarizeLocalKnowledge(readyWorkspaceId));
    } catch {
      setSummary(emptySummary);
      setLocalError("No se pudo actualizar el resumen de tu memoria.");
    }
  }, [readyWorkspaceId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    titleRef.current?.focus();
  }, [open]);

  function resetCenterState() {
    setView("overview");
    setRestorePreview(null);
    setResetConfirmation("");
    setLocalError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (processing) {
      return;
    }

    if (nextOpen) {
      void refreshSummary();
    }

    setOpen(nextOpen);
    if (!nextOpen) {
      resetCenterState();
    }
  }

  async function handleBackup() {
    if (vinemaContext.status !== "ready") {
      feedback.error("No se pudo cargar la memoria local.");
      return;
    }

    setProcessing("backup");
    setLocalError(null);
    feedback.saving();
    try {
      const backup = await exportKnowledgeBackup({
        workspace: vinemaContext.workspace,
        repositories: {
          captureRepository,
          conceptRepository,
          captureConceptRelationRepository,
        },
      });
      downloadKnowledgeBackup(backup);
      await refreshSummary();
      feedback.success("Respaldo listo.");
    } catch {
      feedback.error("No se pudo respaldar el conocimiento.");
      setLocalError("No se pudo generar el respaldo.");
    } finally {
      setProcessing(null);
    }
  }

  function handleRestoreSelect() {
    setLocalError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setProcessing("restore");
    setLocalError(null);
    feedback.saving();
    try {
      const backup = await readKnowledgeBackupFile(file);
      setRestorePreview({ fileName: file.name, backup });
      setView("restore-confirmation");
      feedback.success("Respaldo valido.");
    } catch (error) {
      const message = toUserRestoreError(error);
      feedback.error(message);
      setLocalError(message);
      setRestorePreview(null);
      setView("overview");
    } finally {
      setProcessing(null);
    }
  }

  async function confirmRestore() {
    if (vinemaContext.status !== "ready" || !auth.deviceId || !restorePreview) {
      feedback.error("No se pudo cargar el contexto de restauracion.");
      return;
    }

    setProcessing("restore");
    setLocalError(null);
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
          captureRepository: repositories.captureRepository,
          conceptRepository: repositories.conceptRepository,
          captureConceptRelationRepository:
            repositories.captureConceptRelationRepository,
        },
        syncNow: auth.syncNow,
      });

      setRestorePreview(null);
      setView("overview");
      await refreshSummary();
      feedback.success(
        result.createdNodes + result.createdContexts + result.createdRelations > 0
          ? "Conocimiento restaurado."
          : "El respaldo ya estaba restaurado.",
      );
    } catch (error) {
      const message = toUserRestoreError(error);
      feedback.error(message);
      setLocalError(message);
    } finally {
      setProcessing(null);
    }
  }

  function prepareReset() {
    setResetConfirmation("");
    setLocalError(null);
    setView("reset-confirmation");
  }

  async function confirmReset() {
    if (vinemaContext.status !== "ready" || !auth.accessToken) {
      feedback.error("No se pudo cargar el contexto de vaciado.");
      return;
    }

    setProcessing("reset");
    setLocalError(null);
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
      setResetConfirmation("");
      setView("overview");
      await refreshSummary();
      feedback.success("Conocimiento vaciado.");
    } catch (error) {
      const message = toUserResetError(error);
      feedback.error(message);
      setLocalError(message);
    } finally {
      setProcessing(null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        {trigger === "rail" ? (
          <button
            type="button"
            aria-label={label}
            title={label}
            data-canvas-panel-trigger=""
            data-knowledge-management-trigger=""
            disabled={!ready}
            className="inline-flex h-11 w-11 min-w-11 items-center justify-center rounded-full text-zinc-400 outline-none transition-[background-color,color,transform] duration-[180ms] hover:scale-105 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
            onClick={() => {
              void refreshSummary();
              setOpen(true);
            }}
          >
            <Brain className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <DropdownMenuItem
            disabled={!ready}
            onSelect={(event) => {
              event.preventDefault();
              void refreshSummary();
              setOpen(true);
            }}
          >
            <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
            {label}
          </DropdownMenuItem>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-zinc-950/25 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none sm:max-h-[85dvh] sm:w-[calc(100vw-32px)] sm:rounded-2xl lg:max-w-[640px]"
          aria-describedby="knowledge-center-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (processing) {
              event.preventDefault();
            }
          }}
          data-testid="knowledge-management-center"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-zinc-100 px-4 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                  <Brain className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title
                    ref={titleRef}
                    tabIndex={-1}
                    className="text-lg font-semibold text-zinc-950 outline-none"
                  >
                    Conocimiento
                  </Dialog.Title>
                  <Dialog.Description
                    id="knowledge-center-description"
                    className="mt-1 text-sm leading-6 text-zinc-600"
                  >
                    Acciones administrativas de tu memoria local.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-2 text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                    aria-label="Cerrar Conocimiento"
                    disabled={Boolean(processing)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {view === "overview" ? (
                <KnowledgeOverview
                  ready={ready}
                  processing={processing}
                  localError={localError}
                  onBackup={handleBackup}
                  onRestore={handleRestoreSelect}
                  onReset={prepareReset}
                />
              ) : null}
              {view === "restore-confirmation" && restorePreview ? (
                <RestoreConfirmation
                  preview={restorePreview}
                  processing={processing === "restore"}
                  localError={localError}
                  onBack={() => {
                    setRestorePreview(null);
                    setLocalError(null);
                    setView("overview");
                  }}
                  onConfirm={confirmRestore}
                />
              ) : null}
              {view === "reset-confirmation" ? (
                <ResetConfirmation
                  summary={summary}
                  confirmation={resetConfirmation}
                  processing={processing === "reset"}
                  localError={localError}
                  onConfirmationChange={setResetConfirmation}
                  onBack={() => {
                    setResetConfirmation("");
                    setLocalError(null);
                    setView("overview");
                  }}
                  onConfirm={confirmReset}
                />
              ) : null}
            </div>

            <footer className="shrink-0 border-t border-zinc-100 px-4 py-3 sm:px-6">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  disabled={Boolean(processing)}
                >
                  Cerrar
                </Button>
              </Dialog.Close>
            </footer>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Seleccionar respaldo de conocimiento"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function KnowledgeOverview({
  ready,
  processing,
  localError,
  onBackup,
  onRestore,
  onReset,
}: {
  ready: boolean;
  processing: "backup" | "restore" | "reset" | null;
  localError: string | null;
  onBackup(): void;
  onRestore(): void;
  onReset(): void;
}) {
  return (
    <div className="space-y-5">
      {localError ? <LocalError message={localError} /> : null}
      <div className="space-y-2">
        <KnowledgeAction
          icon={<Download className="h-5 w-5" aria-hidden="true" />}
          title="Exportar memoria"
          description="Guarda una copia completa de tu memoria."
          disabled={!ready || Boolean(processing)}
          busy={processing === "backup"}
          onClick={onBackup}
        />
        <KnowledgeAction
          icon={<Upload className="h-5 w-5" aria-hidden="true" />}
          title="Importar memoria"
          description="Recupera un respaldo guardado anteriormente."
          disabled={!ready || Boolean(processing)}
          busy={processing === "restore"}
          onClick={onRestore}
        />
        <KnowledgeAction
          icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
          title="Vaciar memoria"
          description="Elimina la memoria activa y permite comenzar de nuevo."
          danger
          disabled={!ready || Boolean(processing)}
          busy={processing === "reset"}
          onClick={onReset}
        />
      </div>
    </div>
  );
}

function RestoreConfirmation({
  preview,
  processing,
  localError,
  onBack,
  onConfirm,
}: {
  preview: RestorePreview;
  processing: boolean;
  localError: string | null;
  onBack(): void;
  onConfirm(): void;
}) {
  const { backup } = preview;

  return (
    <div className="space-y-5">
      <ViewHeading
        icon={<Upload className="h-5 w-5" aria-hidden="true" />}
        title="Importar memoria"
        description="Vinema agregara solo conocimiento nuevo. Si detecta conflictos, no aplicara cambios parciales."
      />
      <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600">
        <p className="truncate font-medium text-zinc-800">{preview.fileName}</p>
        <p className="mt-2">{formatBackupSummary(backup)}</p>
        <p className="mt-1">Exportado: {new Date(backup.exportedAt).toLocaleString()}</p>
      </div>
      {localError ? <LocalError message={localError} /> : null}
      <div className="grid gap-2 sm:flex sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={processing}
          className="w-full sm:w-auto"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={processing}
          className="w-full sm:w-auto"
        >
          Restaurar
        </Button>
      </div>
    </div>
  );
}

function ResetConfirmation({
  summary,
  confirmation,
  processing,
  localError,
  onConfirmationChange,
  onBack,
  onConfirm,
}: {
  summary: KnowledgeResetCounts;
  confirmation: string;
  processing: boolean;
  localError: string | null;
  onConfirmationChange(value: string): void;
  onBack(): void;
  onConfirm(): void;
}) {
  const canReset = confirmation === KNOWLEDGE_RESET_CONFIRMATION && !processing;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <ViewHeading
        icon={<Trash2 className="h-5 w-5" aria-hidden="true" />}
        title="Vaciar memoria"
        description="Se eliminara toda la memoria activa en todos tus dispositivos."
        danger
      />
      <KnowledgeSummary summary={summary} stacked />
      <p className="text-sm leading-6 text-zinc-600">
        Antes de continuar, respalda tu conocimiento.
      </p>
      {localError ? <LocalError message={localError} /> : null}
      <label className="block text-sm font-medium text-zinc-800">
        Escribe VACIAR para confirmar
        <input
          className="mt-2 h-11 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
          value={confirmation}
          onChange={(event) => onConfirmationChange(event.target.value)}
          disabled={processing}
          autoComplete="off"
        />
      </label>
      <div className="grid gap-2 sm:flex sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={processing}
          className="w-full sm:w-auto"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="w-full bg-red-700 hover:bg-red-800 sm:w-auto"
          onClick={onConfirm}
          disabled={!canReset}
        >
          Vaciar memoria
        </Button>
      </div>
    </form>
  );
}

function KnowledgeAction({
  icon,
  title,
  description,
  danger = false,
  disabled,
  busy,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  disabled: boolean;
  busy: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-lg p-3 text-left outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <span
        className={
          danger
            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700"
            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={danger ? "block font-medium text-red-800" : "block font-medium text-zinc-950"}>
          {busy ? "Procesando..." : title}
        </span>
        <span className="mt-1 block text-sm leading-6 text-zinc-600">
          {description}
        </span>
      </span>
    </button>
  );
}

function KnowledgeSummary({
  summary,
  stacked = false,
}: {
  summary: KnowledgeResetCounts;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <dl className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-3">
        <SummaryItem label="capturas" value={summary.nodes} />
        <SummaryItem label="conceptos" value={summary.contexts} />
        <SummaryItem label="relaciones" value={summary.relations} />
      </dl>
    );
  }

  return (
    <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
      {formatSummary(summary)}
    </p>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-base font-medium text-zinc-950">{value}</dd>
    </div>
  );
}

function ViewHeading({
  icon,
  title,
  description,
  danger = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          danger
            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700"
            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700"
        }
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={danger ? "text-base font-semibold text-red-800" : "text-base font-semibold text-zinc-950"}>
          {title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
      </div>
    </div>
  );
}

function LocalError({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
      {message}
    </p>
  );
}

function formatSummary(summary: KnowledgeResetCounts) {
  return `${summary.nodes} capturas · ${summary.contexts} conceptos · ${summary.relations} relaciones`;
}

function formatBackupSummary(backup: KnowledgeBackup) {
  if (backup.format === "vinema-memory-backup") {
    return `${backup.summary.captures} capturas · ${backup.summary.concepts} conceptos · ${backup.summary.relations} relaciones`;
  }

  return `${backup.summary.nodes} capturas · ${backup.summary.contexts} conceptos · ${backup.summary.relations} relaciones`;
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
