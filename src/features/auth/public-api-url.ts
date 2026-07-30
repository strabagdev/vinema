export class PublicApiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicApiUrlError";
  }
}

export function getPublicApiUrl(): string | null {
  const rawValue = process.env.NEXT_PUBLIC_API_URL;
  return normalizePublicApiUrl(rawValue);
}

export function normalizePublicApiUrl(rawValue: string | undefined): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicApiUrlError("NEXT_PUBLIC_API_URL no es una URL valida.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}
