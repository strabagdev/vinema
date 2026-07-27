import type { EmergingConceptSuggestion } from "@/features/associations/association-types";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const CAPTURE_DRAFT_KEY = "vinema:capture-draft:v1";

export type CaptureDraft = {
  content: string;
  selectedContextIds: string[];
  selectedEmergingConcepts: EmergingConceptSuggestion[];
  updatedAt: string;
};

export async function loadCaptureDraft(
  storage: StorageAdapter,
): Promise<CaptureDraft | null> {
  const draft = await storage.get<Partial<CaptureDraft>>(CAPTURE_DRAFT_KEY);

  if (!draft || typeof draft.content !== "string") {
    return null;
  }

  if (!draft.content.trim()) {
    await storage.remove(CAPTURE_DRAFT_KEY);
    return null;
  }

  return {
    content: draft.content,
    selectedContextIds: Array.isArray(draft.selectedContextIds)
      ? draft.selectedContextIds.filter(
          (contextId): contextId is string => typeof contextId === "string",
        )
      : [],
    selectedEmergingConcepts: Array.isArray(draft.selectedEmergingConcepts)
      ? draft.selectedEmergingConcepts.filter(isEmergingConceptSuggestion)
      : [],
    updatedAt:
      typeof draft.updatedAt === "string"
        ? draft.updatedAt
        : new Date().toISOString(),
  };
}

export async function saveCaptureDraft(
  storage: StorageAdapter,
  content: string,
  selectedContextIds: string[] = [],
  selectedEmergingConcepts: EmergingConceptSuggestion[] = [],
): Promise<CaptureDraft | null> {
  if (!content.trim()) {
    await storage.remove(CAPTURE_DRAFT_KEY);
    return null;
  }

  const draft: CaptureDraft = {
    content,
    selectedContextIds: Array.from(new Set(selectedContextIds)),
    selectedEmergingConcepts,
    updatedAt: new Date().toISOString(),
  };

  await storage.set(CAPTURE_DRAFT_KEY, draft);
  return draft;
}

function isEmergingConceptSuggestion(
  value: unknown,
): value is EmergingConceptSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<EmergingConceptSuggestion>;
  return (
    candidate.kind === "emerging" &&
    typeof candidate.candidateId === "string" &&
    typeof candidate.suggestedLabel === "string" &&
    typeof candidate.score === "number" &&
    Array.isArray(candidate.evidenceCaptureIds) &&
    Array.isArray(candidate.representativeTerms)
  );
}

export async function clearCaptureDraft(
  storage: StorageAdapter,
): Promise<void> {
  await storage.remove(CAPTURE_DRAFT_KEY);
}
