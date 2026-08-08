import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";

export type MemoryConvergenceStatus =
  | "CONFIRMED"
  | "PENDING"
  | "DIVERGED"
  | "UNKNOWN";

export type MemorySignature = {
  generation: string;
  hash: string;
  items: number;
};

export type MemoryConvergenceResult = {
  status: MemoryConvergenceStatus;
  localSignature: MemorySignature;
  remoteSignature: MemorySignature | null;
  reason: string;
};

export function createMemorySignature({
  nodes,
  contexts,
  relations,
  generation = "local",
}: {
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  generation?: string;
}): MemorySignature {
  const parts = [
    `generation:${generation}`,
    ...nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => `capture:${node.id}:${node.version}:${node.updatedAt}`)
      .sort(),
    ...contexts
      .map((context) => `concept:${context.id}:${context.version}:${context.updatedAt}`)
      .sort(),
    ...relations
      .map((relation) =>
        `captureConcept:${relation.id}:${relation.version}:${relation.nodeId}:${relation.contextId}`,
      )
      .sort(),
  ];

  return {
    generation,
    hash: hashString(parts.join("|")),
    items: parts.length - 1,
  };
}

export function verifyMemoryConvergence({
  localSignature,
  remoteSignature,
  pendingMutations,
  failedMutations = 0,
}: {
  localSignature: MemorySignature;
  remoteSignature?: MemorySignature | null;
  pendingMutations: number;
  failedMutations?: number;
}): MemoryConvergenceResult {
  if (failedMutations > 0) {
    return {
      status: "DIVERGED",
      localSignature,
      remoteSignature: remoteSignature ?? null,
      reason: "Existen mutaciones fallidas o en conflicto.",
    };
  }

  if (pendingMutations > 0) {
    return {
      status: "PENDING",
      localSignature,
      remoteSignature: remoteSignature ?? null,
      reason: "Existen cambios locales pendientes de sincronizar.",
    };
  }

  if (!remoteSignature) {
    return {
      status: "UNKNOWN",
      localSignature,
      remoteSignature: null,
      reason: "La API actual no expone una firma remota de solo lectura.",
    };
  }

  if (localSignature.generation !== remoteSignature.generation) {
    return {
      status: "DIVERGED",
      localSignature,
      remoteSignature,
      reason: "La generacion local y remota no coinciden.",
    };
  }

  if (localSignature.hash !== remoteSignature.hash) {
    return {
      status: "DIVERGED",
      localSignature,
      remoteSignature,
      reason: "La firma local y remota no coinciden.",
    };
  }

  return {
    status: "CONFIRMED",
    localSignature,
    remoteSignature,
    reason: "La firma local coincide con la firma remota proporcionada.",
  };
}

function hashString(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
