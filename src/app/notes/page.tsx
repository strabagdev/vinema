import { Badge } from "@/components/ui/badge";

export default function NotesPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Badge variant="secondary">Notas</Badge>
        <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
          Notas
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600">
          El archivo personal de Vinema va a vivir aca, con la logica de dominio
          compartida entre web, PWA y escritorio.
        </p>
      </div>

      <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-medium text-zinc-950">Sin notas todavia</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            La creacion y edicion de notas empieza en VIN-003. Por ahora solo
            dejamos la ruta y el estado vacio.
          </p>
        </div>
      </div>
    </section>
  );
}
