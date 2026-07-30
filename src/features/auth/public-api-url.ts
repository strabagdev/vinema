export class PublicApiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicApiUrlError";
  }
}

export function getPublicApiUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env.NEXT_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new PublicApiUrlError("NEXT_PUBLIC_API_URL no esta configurada.");
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
