import type { ContextType } from "@/domain/context/context";
import { CONTEXT_TYPE_ROUTE_SEGMENT } from "@/features/context/context-display";

export function getContextListPath(type: ContextType) {
  return `/contexts/${CONTEXT_TYPE_ROUTE_SEGMENT[type]}`;
}

export function getContextDetailPath(
  contextId: string,
  options: { returnTo?: string | null } = {},
): string {
  const searchParams = [`contextId=${encodeURIComponent(contextId)}`];

  if (options.returnTo) {
    searchParams.push(`returnTo=${encodeURIComponent(options.returnTo)}`);
  }

  return `/contexts/detail?${searchParams.join("&")}`;
}

export function getContextIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const contextId = searchParams.get("contextId")?.trim();
  return contextId || null;
}
