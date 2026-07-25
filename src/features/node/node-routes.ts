export function getNodeDetailPath(nodeId: string): string {
  return `/notes/detail?nodeId=${encodeURIComponent(nodeId)}`;
}

export function getNodeIdFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const nodeId = searchParams.get("nodeId")?.trim();
  return nodeId && nodeId.length > 0 ? nodeId : null;
}
