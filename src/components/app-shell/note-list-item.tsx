import Link from "next/link";
import type { Node } from "@/domain/node/node";
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";

export function NoteListItem({ node }: { node: Node }) {
  return (
    <Link
      href={getNodeDetailPath(node.id)}
      aria-label={`Abrir captura: ${getCapturePreview(node.content, { maxLength: 80 })}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="line-clamp-2 text-base leading-7 text-zinc-800">
            {getCapturePreview(node.content, { maxLength: 160 })}
          </p>
        </div>
        <time className="shrink-0 text-xs text-zinc-500">
          {formatShortDate(node.updatedAt)}
        </time>
      </div>
    </Link>
  );
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
