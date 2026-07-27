export function getRecoveryPath(query = "") {
  return getKnowledgeBasePath(query);
}

export function getKnowledgeBasePath(query = "") {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return "/notes";
  }

  return `/notes?q=${encodeURIComponent(normalizedQuery)}`;
}

export function getArchivePath(query = "") {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return "/notes/archive";
  }

  return `/notes/archive?q=${encodeURIComponent(normalizedQuery)}`;
}

export function getReturnToFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
) {
  const returnTo = searchParams.get("returnTo")?.trim();

  if (!returnTo || !isSafeInternalPath(returnTo)) {
    return null;
  }

  return returnTo;
}

function isSafeInternalPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return false;
  }

  try {
    const parsedUrl = new URL(path, "https://vinema.local");
    return parsedUrl.origin === "https://vinema.local";
  } catch {
    return false;
  }
}
