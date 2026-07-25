"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateNode } from "@/features/node/hooks/use-create-node";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";

export default function NewNotePage() {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const context = useVinemaContext();
  const { create, saving, error } = useCreateNode();

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function handleSave() {
    if (saving || context.status !== "ready") {
      return;
    }

    setFeedback("Guardando...");
    const node = await create({
      type: "NOTE",
      title,
      content,
      organizationStatus: "ORGANIZED",
      workspace: context.workspace,
      device: context.device,
    });

    if (node) {
      setFeedback("Nota guardada.");
      router.push(`/notes/${node.id}`);
    } else {
      setFeedback(null);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSave();
    }
  }

  const visibleError = context.status === "error" ? context.error : error;

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Badge variant="secondary">Notas</Badge>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            Nueva nota
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/notes">Cancelar</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving || context.status !== "ready"}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      {visibleError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {visibleError}
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          {feedback}
        </p>
      ) : null}

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <Input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Titulo"
          aria-label="Titulo"
          className="h-12 text-lg"
        />
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Contenido"
          aria-label="Contenido"
          className="min-h-[420px] resize-y text-base leading-7"
        />
        <p className="text-xs text-zinc-500">Ctrl+S o Cmd+S para guardar.</p>
      </div>
    </section>
  );
}
