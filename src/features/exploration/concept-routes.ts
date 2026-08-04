export function getConceptExplorationPath(
  contextId: string,
  options: { returnTo?: string | null; from?: string | null } = {},
): string {
  const searchParams = [`contextId=${encodeURIComponent(contextId)}`];

  if (options.returnTo) {
    searchParams.push(`returnTo=${encodeURIComponent(options.returnTo)}`);
  }

  if (options.from) {
    searchParams.push(`from=${encodeURIComponent(options.from)}`);
  }

  return `/concepts/detail?${searchParams.join("&")}`;
}

export function getConceptKnowledgeExplorerPath(
  options: { focus?: string | null } = {},
): string {
  if (!options.focus) {
    return "/concepts/explore";
  }

  return `/concepts/explore?focus=${encodeURIComponent(options.focus)}`;
}

export function getConceptExpansionSourceFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const source = searchParams.get("from")?.trim();
  return source || null;
}

export function getConceptIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const contextId = searchParams.get("contextId")?.trim();
  return contextId || null;
}
