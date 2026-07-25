import { Badge } from "@/components/ui/badge";

export default function InboxPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Badge variant="secondary">Inbox</Badge>
        <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
          Inbox
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600">
          Aca van a llegar capturas rapidas, ideas sueltas y material que todavia
          no encontro su lugar.
        </p>
      </div>

      <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-medium text-zinc-950">Inbox vacio</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Todavia no hay elementos pendientes. El CRUD queda fuera de alcance
            para esta fundacion tecnica.
          </p>
        </div>
      </div>
    </section>
  );
}
