import type { ContextType } from "@/domain/context/context";
import { CONTEXT_TYPE_ROUTE_SEGMENT } from "@/features/context/context-display";

export function getContextListPath(type: ContextType) {
  return `/contexts/${CONTEXT_TYPE_ROUTE_SEGMENT[type]}`;
}

export function getContextDetailPath(contextId: string): string {
  return `/contexts/detail?contextId=${encodeURIComponent(contextId)}`;
}

export function getContextIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const contextId = searchParams.get("contextId")?.trim();
  return contextId || null;
}
