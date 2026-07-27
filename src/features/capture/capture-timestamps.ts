import type { Node } from "@/domain/node/node";

export type CaptureTimestamps = {
  createdAt: string;
  contentUpdatedAt: string;
  archivedAt: string | null;
  restoredAt: string | null;
  updatedAt: string;
};

export function getCaptureTimestamps(node: Node): CaptureTimestamps {
  return {
    createdAt: node.createdAt,
    contentUpdatedAt: node.contentUpdatedAt ?? node.updatedAt ?? node.createdAt,
    archivedAt:
      node.archivedAt ??
      (node.status === "ARCHIVED" ? node.updatedAt ?? node.createdAt : null),
    restoredAt: node.restoredAt ?? null,
    updatedAt: node.updatedAt,
  };
}

export function getContentTimestamp(node: Node): string {
  return getCaptureTimestamps(node).contentUpdatedAt;
}

export function getArchivedTimestamp(node: Node): string {
  return getCaptureTimestamps(node).archivedAt ?? getContentTimestamp(node);
}

export function compareByContentTimestamp(a: Node, b: Node): number {
  return compareTimestampDesc(getContentTimestamp(a), getContentTimestamp(b), a.id, b.id);
}

export function compareByArchivedTimestamp(a: Node, b: Node): number {
  return compareTimestampDesc(getArchivedTimestamp(a), getArchivedTimestamp(b), a.id, b.id);
}

function compareTimestampDesc(
  aTimestamp: string,
  bTimestamp: string,
  aId: string,
  bId: string,
) {
  const dateDifference = parseTimestamp(bTimestamp) - parseTimestamp(aTimestamp);

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return aId.localeCompare(bId);
}

function parseTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
