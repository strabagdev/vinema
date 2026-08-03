import type { Node } from "@/domain/node/node";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";
import type { MemorySyncEvent } from "@/features/sync/observability/sync-event-buffer";

export type EntitySyncDiagnosticStage =
  | "LOCAL"
  | "OUTBOX"
  | "SERVER"
  | "SYNC_CHANGE"
  | "PULL"
  | "APPLY"
  | "UI";

export type EntitySyncDiagnosticStatus =
  | "OK"
  | "PENDING"
  | "FAILED"
  | "CONFLICT"
  | "MISSING"
  | "UNKNOWN";

export type EntitySyncDiagnosticStep = {
  stage: EntitySyncDiagnosticStage;
  status: EntitySyncDiagnosticStatus;
  label: string;
  detail: string;
};

export type EntitySyncDiagnostic = {
  entityId: string;
  entityType: "capture";
  steps: EntitySyncDiagnosticStep[];
  stoppedAt: EntitySyncDiagnosticStage | null;
};

export function diagnoseCaptureSync({
  nodeId,
  nodes,
  mutations,
  events,
  visibleNodeIds = [],
}: {
  nodeId: string;
  nodes: Node[];
  mutations: SyncMutationOutboxRecord[];
  events: MemorySyncEvent[];
  visibleNodeIds?: string[];
}): EntitySyncDiagnostic {
  const node = nodes.find((candidate) => candidate.id === nodeId) ?? null;
  const entityMutations = mutations.filter(
    (mutation) =>
      mutation.mutation.entityType === "capture" &&
      mutation.mutation.entityId === nodeId,
  );
  const entityEvents = events.filter((event) => event.entityId === nodeId);
  const outboxStatus = getOutboxStatus(entityMutations);
  const pushed = entityEvents.some((event) => event.type === "PUSH_SUCCEEDED");
  const applied = entityEvents.some((event) => event.type === "CHANGE_APPLIED");
  const uiVisible = visibleNodeIds.includes(nodeId);
  const steps: EntitySyncDiagnosticStep[] = [
    {
      stage: "LOCAL",
      status: node ? "OK" : "MISSING",
      label: "Local",
      detail: node ? "Existe en IndexedDB local." : "No existe localmente.",
    },
    {
      stage: "OUTBOX",
      status: outboxStatus,
      label: "Outbox",
      detail: outboxDetail(outboxStatus),
    },
    {
      stage: "SERVER",
      status: pushed || outboxStatus === "OK" ? "OK" : serverStatus(outboxStatus),
      label: "Servidor",
      detail:
        pushed || outboxStatus === "OK"
          ? "La mutacion fue aceptada por push o retirada de la outbox."
          : "No hay evidencia local de persistencia remota.",
    },
    {
      stage: "SYNC_CHANGE",
      status: pushed ? "OK" : "UNKNOWN",
      label: "SyncChange",
      detail: pushed
        ? "El servidor debio registrar un cambio al aceptar la mutacion."
        : "No puede confirmarse sin consulta remota de solo lectura.",
    },
    {
      stage: "PULL",
      status: applied ? "OK" : "UNKNOWN",
      label: "Pull",
      detail: applied
        ? "Existe evento local de cambio recibido."
        : "No hay evidencia de pull para esta captura en este cliente.",
    },
    {
      stage: "APPLY",
      status: node || applied ? "OK" : "UNKNOWN",
      label: "Aplicacion local",
      detail: node ? "La entidad esta aplicada localmente." : "No hay entidad aplicada.",
    },
    {
      stage: "UI",
      status: node ? (uiVisible ? "OK" : "UNKNOWN") : "MISSING",
      label: "UI",
      detail: node
        ? uiVisible
          ? "La vista actual reporta la captura como visible."
          : "La entidad existe; la visibilidad depende de la vista activa."
        : "No puede ser visible porque no existe localmente.",
    },
  ];

  return {
    entityId: nodeId,
    entityType: "capture",
    steps,
    stoppedAt: steps.find((step) =>
      ["PENDING", "FAILED", "CONFLICT", "MISSING"].includes(step.status),
    )?.stage ?? null,
  };
}

function getOutboxStatus(
  mutations: SyncMutationOutboxRecord[],
): EntitySyncDiagnosticStatus {
  if (mutations.some((mutation) => mutation.status === "CONFLICT")) {
    return "CONFLICT";
  }

  if (mutations.some((mutation) => mutation.status === "FAILED")) {
    return "FAILED";
  }

  if (
    mutations.some((mutation) =>
      mutation.status === "PENDING" || mutation.status === "PROCESSING",
    )
  ) {
    return "PENDING";
  }

  return "OK";
}

function outboxDetail(status: EntitySyncDiagnosticStatus) {
  switch (status) {
    case "OK":
      return "No hay mutacion pendiente para esta captura.";
    case "PENDING":
      return "Existe una mutacion pendiente o en proceso.";
    case "FAILED":
      return "Existe una mutacion fallida.";
    case "CONFLICT":
      return "Existe un conflicto de version.";
    default:
      return "Estado de outbox desconocido.";
  }
}

function serverStatus(
  status: EntitySyncDiagnosticStatus,
): EntitySyncDiagnosticStatus {
  if (status === "PENDING") {
    return "PENDING";
  }

  if (status === "FAILED" || status === "CONFLICT") {
    return status;
  }

  return "UNKNOWN";
}
