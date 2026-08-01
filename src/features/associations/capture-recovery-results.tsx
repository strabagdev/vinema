"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssociationSuggestion } from "@/features/associations/association-types";
import type { AssociationError } from "@/features/associations/association-errors";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";

const INITIAL_RESULT_LIMIT = 3;
const EXPANDED_RESULT_LIMIT = 10;

export function CaptureRecoveryResults({
  suggestions,
  loading,
  error,
  identities = new Map(),
  onRetry,
  onOpenCapture,
}: {
  suggestions: AssociationSuggestion[];
  loading: boolean;
  error: AssociationError | null;
  identities?: Map<string, CaptureEmergentIdentity>;
  onRetry: () => void;
  onOpenCapture?: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (suggestions.length === 0 && !loading && !error) {
    return null;
  }

  const visibleLimit = expanded ? EXPANDED_RESULT_LIMIT : INITIAL_RESULT_LIMIT;
  const visibleSuggestions = suggestions.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, suggestions.length - INITIAL_RESULT_LIMIT);

  return (
    <section className="space-y-2" aria-labelledby="capture-recovery-heading">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2
          id="capture-recovery-heading"
          className="text-sm font-medium text-zinc-700"
        >
          Esto me recordó a…
        </h2>
        {loading ? (
          <span className="text-xs text-zinc-400" aria-live="polite">
            Recordando...
          </span>
        ) : null}
      </div>
      {visibleSuggestions.length > 0 ? (
        <div className="space-y-1">
          {visibleSuggestions.map((suggestion) => {
            const preview = getCapturePreview(suggestion.node.content, {
              maxLength: 600,
            });
            const identity = identities.get(suggestion.node.id) ?? null;

            return (
              <Link
                key={suggestion.node.id}
                href={getNodeDetailPath(suggestion.node.id, { returnTo: "/" })}
                aria-label={`Abrir captura: ${preview}`}
                title={preview}
                className="block min-w-0 rounded-sm py-1 text-sm leading-6 text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                onClick={() => {
                  void onOpenCapture?.();
                }}
              >
                {identity?.displayText ? (
                  <CaptureEmergentIdentityLabel
                    identity={identity}
                    className="truncate text-sm leading-6"
                  />
                ) : null}
                <span className="block min-w-0 truncate">{preview}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
      {suggestions.length > INITIAL_RESULT_LIMIT ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-0 text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-950"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Ver menos" : `Ver ${hiddenCount} más`}
        </Button>
      ) : null}
      {error ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </section>
  );
}
