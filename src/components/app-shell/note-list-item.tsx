import Link from "next/link";
import type { Node } from "@/domain/node/node";
import {
  getContentExcerpt,
  getNodeDisplayTitle,
} from "@/features/node/node-display";

export function NoteListItem({ node }: { node: Node }) {
  return (
    <Link
      href={`/notes/${node.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium text-zinc-950">
            {getNodeDisplayTitle(node)}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
            {getContentExcerpt(node.content) || "Sin contenido"}
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
