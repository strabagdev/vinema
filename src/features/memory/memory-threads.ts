import type { Node } from "@/domain/node/node";
import type {
  CaptureEmergentIdentity,
  CaptureIdentityConcept,
} from "@/features/identity/capture-emergent-identity";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";

export interface MemoryThreadCapture {
  node: Node;
  capturedAt: Date;
  identity: CaptureEmergentIdentity;
}

export interface MemoryThread {
  id: string;
  conceptIds: string[];
  identityLabels: string[];
  captures: MemoryThreadCapture[];
  captureCount: number;
  firstCapturedAt: Date;
  lastCapturedAt: Date;
}

export type MemoryThreadEntry =
  | { kind: "thread"; thread: MemoryThread }
  | {
      kind: "capture";
      capture: MemoryThreadCapture;
    };

export function createEmergentIdentityKey(
  concepts: readonly Pick<CaptureIdentityConcept, "id">[],
): string | null {
  const conceptIds = Array.from(
    new Set(
      concepts
        .map((concept) => concept.id.trim())
        .filter((conceptId) => conceptId.length > 0),
    ),
  ).sort((first, second) => first.localeCompare(second));

  return conceptIds.length > 0 ? conceptIds.join("\u001f") : null;
}

export function deriveMemoryThreads(input: {
  captures: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
}): MemoryThreadEntry[] {
  const grouped = new Map<string, MemoryThreadCapture[]>();
  const standalone: MemoryThreadCapture[] = [];

  for (const node of input.captures) {
    if (!isThreadableCapture(node)) {
      continue;
    }

    const identity = input.identities.get(node.id);
    const key = identity ? createEmergentIdentityKey(identity.concepts) : null;
    const capture = {
      node,
      capturedAt: new Date(getContentTimestamp(node)),
      identity: identity ?? emptyIdentity(),
    };

    if (!key) {
      standalone.push(capture);
      continue;
    }

    grouped.set(key, [...(grouped.get(key) ?? []), capture]);
  }

  const entries: MemoryThreadEntry[] = [];

  for (const [id, threadCaptures] of grouped) {
    const captures = sortCaptures(threadCaptures);

    if (captures.length < 2) {
      entries.push({ kind: "capture", capture: captures[0] });
      continue;
    }

    entries.push({
      kind: "thread",
      thread: {
        id,
        conceptIds: id.split("\u001f"),
        identityLabels: getIdentityLabels(captures[0].identity),
        captures,
        captureCount: captures.length,
        firstCapturedAt: captures[captures.length - 1].capturedAt,
        lastCapturedAt: captures[0].capturedAt,
      },
    });
  }

  for (const capture of standalone) {
    entries.push({ kind: "capture", capture });
  }

  return entries.sort(compareEntries);
}

function isThreadableCapture(node: Node) {
  return node.deletedAt === null;
}

function sortCaptures(captures: MemoryThreadCapture[]) {
  return [...captures].sort(
    (first, second) =>
      second.capturedAt.getTime() - first.capturedAt.getTime() ||
      first.node.id.localeCompare(second.node.id),
  );
}

function compareEntries(first: MemoryThreadEntry, second: MemoryThreadEntry) {
  const firstDate = getEntryLastCapturedAt(first).getTime();
  const secondDate = getEntryLastCapturedAt(second).getTime();

  if (firstDate !== secondDate) {
    return secondDate - firstDate;
  }

  const firstCount = entryCaptureCount(first);
  const secondCount = entryCaptureCount(second);

  if (firstCount !== secondCount) {
    return secondCount - firstCount;
  }

  return getEntryStableId(first).localeCompare(getEntryStableId(second));
}

function getEntryLastCapturedAt(entry: MemoryThreadEntry) {
  return entry.kind === "thread"
    ? entry.thread.lastCapturedAt
    : entry.capture.capturedAt;
}

function getEntryStableId(entry: MemoryThreadEntry) {
  return entry.kind === "thread" ? entry.thread.id : entry.capture.node.id;
}

function entryCaptureCount(entry: MemoryThreadEntry) {
  return entry.kind === "thread" ? entry.thread.captureCount : 1;
}

function getIdentityLabels(identity: CaptureEmergentIdentity) {
  const labelsById = new Map(
    identity.concepts.map((concept) => [concept.id, concept.label]),
  );

  return Array.from(labelsById.entries())
    .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
    .map(([, label]) => label);
}

function emptyIdentity(): CaptureEmergentIdentity {
  return {
    concepts: [],
    displayText: null,
    hiddenCount: 0,
    visibleConcepts: [],
  };
}
