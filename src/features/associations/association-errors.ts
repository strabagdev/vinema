export type AssociationErrorCode =
  | "INDEX_BUILD_FAILED"
  | "CAPTURE_LOAD_FAILED"
  | "RELATION_LOAD_FAILED"
  | "QUERY_FAILED"
  | "INVALID_CAPTURE_DATA"
  | "UNKNOWN";

export type AssociationError = {
  code: AssociationErrorCode;
  message: string;
  cause: unknown;
  stage: string;
};

export function normalizeAssociationError(
  error: unknown,
  input: { code: AssociationErrorCode; stage: string },
): AssociationError {
  return {
    code: input.code,
    message:
      error instanceof Error
        ? error.message
        : "No se pudieron calcular asociaciones.",
    cause: error,
    stage: input.stage,
  };
}

export function reportAssociationError(
  error: AssociationError,
  context: {
    queryLength: number;
    indexedCaptures: number;
    relationCount: number;
  },
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error("[associations] suggestion query failed", {
    code: error.code,
    stage: error.stage,
    name: error.cause instanceof Error ? error.cause.name : "Unknown",
    message: error.message,
    stack: error.cause instanceof Error ? error.cause.stack : undefined,
    queryLength: context.queryLength,
    indexedCaptures: context.indexedCaptures,
    relationCount: context.relationCount,
  });
}
