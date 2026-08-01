export function getConceptExplorationPath(
  contextId: string,
  options: { returnTo?: string | null } = {},
): string {
  const searchParams = [`contextId=${encodeURIComponent(contextId)}`];

  if (options.returnTo) {
    searchParams.push(`returnTo=${encodeURIComponent(options.returnTo)}`);
  }

  return `/concepts/detail?${searchParams.join("&")}`;
}

export function getConceptIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const contextId = searchParams.get("contextId")?.trim();
  return contextId || null;
}
