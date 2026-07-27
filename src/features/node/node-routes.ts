export function getNodeDetailPath(
  nodeId: string,
  options: { returnTo?: string } = {},
): string {
  const searchParams = [`nodeId=${encodeURIComponent(nodeId)}`];

  if (options.returnTo) {
    searchParams.push(`returnTo=${encodeURIComponent(options.returnTo)}`);
  }

  return `/notes/detail?${searchParams.join("&")}`;
}

export function getNodeIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const nodeId = searchParams.get("nodeId")?.trim();
  return nodeId && nodeId.length > 0 ? nodeId : null;
}
