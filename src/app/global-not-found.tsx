import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "No encontrado - Vinema",
  description: "La pagina solicitada no existe en Vinema.",
};

export default function GlobalNotFound() {
  return (
    <html lang="es">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-950">
          <section className="w-full max-w-md space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Vinema
            </p>
            <h1 className="text-2xl font-semibold">Pagina no encontrada.</h1>
            <p className="text-sm leading-6 text-zinc-600">
              Esta direccion no corresponde a una superficie disponible.
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}
