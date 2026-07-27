"use client";

import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-950">
          <section className="w-full max-w-md space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Vinema
            </p>
            <h1 className="text-2xl font-semibold">Algo salio mal.</h1>
            <p className="text-sm leading-6 text-zinc-600">
              La aplicacion encontro un error inesperado. Puedes intentar
              cargarla nuevamente.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
            >
              Reintentar
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
