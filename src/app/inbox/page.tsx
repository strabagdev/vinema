"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CornerDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { archiveNode } from "@/features/node/archive-node";
import { convertIdeaToNote } from "@/features/node/convert-idea-to-note";
import { getContentExcerpt } from "@/features/node/node-display";
import { useCreateNode } from "@/features/node/hooks/use-create-node";
import { useNodes } from "@/features/node/hooks/use-nodes";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getNodeDetailPath } from "@/features/node/node-routes";
import { nodeRepository } from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

export default function InboxPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const context = useVinemaContext();
  const { create, saving, error: createError } = useCreateNode();
  const { nodes, loading, error, refresh } = useNodes("inbox");

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleCapture() {
    if (saving || context.status !== "ready") {
      return;
    }

    const createdNode = await create({
      type: "IDEA",
      title: "",
      content,
      organizationStatus: "INBOX",
      workspace: context.workspace,
      device: context.device,
    });

    if (createdNode) {
      setContent("");
      setFeedback("Idea capturada.");
      await refresh();
      textareaRef.current?.focus();
    }
  }

  async function handleConvert(nodeId: string) {
    if (context.status !== "ready") {
      return;
    }

    setBusyNodeId(nodeId);
    try {
      const note = await convertIdeaToNote(nodeRepository, nodeId, context.device);
      router.push(getNodeDetailPath(note.id));
    } finally {
      setBusyNodeId(null);
    }
  }

  async function handleArchive(nodeId: string) {
    if (context.status !== "ready") {
      return;
    }

    setBusyNodeId(nodeId);
    try {
      await archiveNode(nodeRepository, nodeId, context.device);
      await refresh();
    } finally {
      setBusyNodeId(null);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleCapture();
    }
  }

  const visibleError =
    context.status === "error" ? context.error : createError ?? error;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Badge variant="secondary">Inbox</Badge>
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            Inbox
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Captura ideas rapidas antes de organizarlas.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => {
            setFeedback(null);
            setContent(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escribe algo antes de olvidarlo..."
          className="min-h-32 resize-y text-base"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            Ctrl+Enter o Cmd+Enter para capturar.
          </p>
          <Button
            onClick={handleCapture}
            disabled={saving || context.status !== "ready"}
          >
            Capturar
          </Button>
        </div>
      </div>

      {visibleError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {visibleError}
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {feedback}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando Inbox...
        </div>
      ) : nodes.length > 0 ? (
        <div className="space-y-3">
          {nodes.map((node) => (
            <article
              key={node.id}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-zinc-800">
                    {getContentExcerpt(node.content, 220)}
                  </p>
                  <time className="mt-2 block text-xs text-zinc-500">
                    {formatShortDate(node.createdAt)}
                  </time>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleConvert(node.id)}
                    disabled={busyNodeId === node.id}
                  >
                    <CornerDownRight className="h-4 w-4" />
                    Convertir
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(node.id)}
                    disabled={busyNodeId === node.id}
                  >
                    <Archive className="h-4 w-4" />
                    Archivar
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-60 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-medium text-zinc-950">Inbox vacio</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Las ideas capturadas apareceran aca y podras convertirlas en notas.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
