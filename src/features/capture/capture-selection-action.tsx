import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type {
  CapturedTextSelection,
  CaptureSelectionResolution,
} from "@/features/capture/capture-selection";
import { normalizeConceptDisplayLabel } from "@/features/concepts/concept-display-label";
import { cn } from "@/lib/cn";

export function CaptureSelectionAction({
  selection,
  resolution,
  processing,
  touch,
  anchorElement,
  onCapture,
  onConfirmNew,
  onChoose,
  onCancel,
}: {
  selection: CapturedTextSelection | null;
  resolution: CaptureSelectionResolution | null;
  processing: boolean;
  touch: boolean;
  anchorElement: HTMLElement | null;
  onCapture: () => void;
  onConfirmNew: () => void;
  onChoose: (contextId: string) => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const portalElement = useMemo(() => {
    const element = document.createElement("div");
    element.setAttribute("data-vinema-floating-layer-root", "popover");

    return element;
  }, []);
  const [position, setPosition] = useState({ left: "50%", top: "4rem" });

  useLayoutEffect(() => {
    document.body.appendChild(portalElement);

    return () => {
      portalElement.remove();
    };
  }, [portalElement]);

  useLayoutEffect(() => {
    if (!selection || touch || !anchorElement) {
      return;
    }

    const currentAnchor = anchorElement;

    function updatePosition() {
      const anchorRect = currentAnchor.getBoundingClientRect();
      const panelRect = panelRef.current?.getBoundingClientRect();
      const panelHeight = panelRect?.height ?? 44;
      const viewportPadding = 12;
      const headerClearance = 64;
      const preferredTop = anchorRect.top - panelHeight - 8;
      const fallbackTop = anchorRect.top + 12;
      const maxTop = Math.max(
        headerClearance,
        window.innerHeight - panelHeight - viewportPadding,
      );
      const nextTop =
        preferredTop >= headerClearance
          ? preferredTop
          : Math.min(Math.max(fallbackTop, headerClearance), maxTop);
      const nextLeft = Math.min(
        Math.max(anchorRect.left + anchorRect.width / 2, viewportPadding),
        window.innerWidth - viewportPadding,
      );

      setPosition({
        left: `${nextLeft}px`,
        top: `${nextTop}px`,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement, selection, touch]);

  if (!selection) {
    return null;
  }

  const newConceptLabel = normalizeConceptDisplayLabel(selection.text);

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "z-[60] rounded-xl border border-zinc-200 bg-white/95 p-2 text-sm shadow-lg backdrop-blur-sm",
        touch
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "fixed max-w-[calc(100vw-1.5rem)] -translate-x-1/2",
      )}
      style={touch ? undefined : position}
      role="group"
      aria-label={`Seleccion capturada: ${selection.text}`}
      data-capture-selection-action=""
      data-floating-layer="popover"
      onMouseDown={(event) => event.preventDefault()}
    >
      {!resolution ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={processing}
          onClick={onCapture}
        >
          Capturar seleccion
        </Button>
      ) : null}
      {resolution?.status === "NEW" ? (
        <div className="space-y-2">
          <p className="px-2 text-xs text-zinc-500">Nuevo concepto</p>
          <p className="max-w-xs truncate px-2 font-medium text-zinc-800">
            {newConceptLabel}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={onConfirmNew}>
              Confirmar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
      {resolution?.status === "AMBIGUOUS" ? (
        <div className="space-y-2">
          <p className="px-2 text-xs text-zinc-500">Elegir concepto</p>
          <div className="grid gap-1">
            {resolution.candidates.slice(0, 4).map((context) => (
              <Button
                key={context.id}
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                onClick={() => onChoose(context.id)}
              >
                {context.name}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onConfirmNew}>
              Crear nuevo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(panel, portalElement);
}
