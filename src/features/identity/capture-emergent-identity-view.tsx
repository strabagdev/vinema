import Link from "next/link";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { cn } from "@/lib/cn";

export function CaptureEmergentIdentityLabel({
  identity,
  className,
  getConceptHref,
}: {
  identity: CaptureEmergentIdentity;
  className?: string;
  getConceptHref?: (conceptId: string) => string;
}) {
  if (!identity.displayText) {
    return null;
  }

  const fullLabel = identity.concepts.map((concept) => concept.label).join(" · ");

  return (
    <p
      className={cn(
        "min-w-0 text-sm font-medium leading-6 text-zinc-700",
        className,
      )}
      aria-label={`Identidad emergente: ${fullLabel}`}
      title={fullLabel}
    >
      {identity.visibleConcepts.map((concept, index) => {
        const href = getConceptHref?.(concept.id);
        const content = (
          <>
            {index > 0 ? <span aria-hidden="true"> · </span> : null}
            <span>{concept.label}</span>
          </>
        );

        if (!href) {
          return <span key={concept.id}>{content}</span>;
        }

        return (
          <span key={concept.id}>
            {index > 0 ? <span aria-hidden="true"> · </span> : null}
            <Link
              href={href}
              className="rounded-sm outline-none hover:text-zinc-950 hover:underline focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {concept.label}
            </Link>
          </span>
        );
      })}
      {identity.hiddenCount > 0 ? (
        <>
          <span aria-hidden="true"> · </span>
          <span aria-label={`${identity.hiddenCount} conceptos adicionales`}>
            +{identity.hiddenCount}
          </span>
        </>
      ) : null}
    </p>
  );
}
