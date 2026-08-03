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
  onCapture,
  onConfirmNew,
  onChoose,
  onCancel,
}: {
  selection: CapturedTextSelection | null;
  resolution: CaptureSelectionResolution | null;
  processing: boolean;
  touch: boolean;
  onCapture: () => void;
  onConfirmNew: () => void;
  onChoose: (contextId: string) => void;
  onCancel: () => void;
}) {
  if (!selection) {
    return null;
  }

  const newConceptLabel = normalizeConceptDisplayLabel(selection.text);

  return (
    <div
      className={cn(
        "z-30 rounded-xl border border-zinc-200 bg-white/95 p-2 text-sm shadow-lg backdrop-blur-sm",
        touch
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)]",
      )}
      role="group"
      aria-label={`Seleccion capturada: ${selection.text}`}
      data-capture-selection-action=""
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
}
