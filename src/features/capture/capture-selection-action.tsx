import { ScanText } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  readValidTextareaSelection,
  type CapturedTextSelection,
  type CaptureSelectionResolution,
} from "@/features/capture/capture-selection";
import { normalizeConceptDisplayLabel } from "@/features/concepts/concept-display-label";
import { cn } from "@/lib/cn";

type FloatingRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type FloatingPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

const FLOATING_GAP = 10;
const FLOATING_BOUNDARY_PADDING = 12;
const FALLBACK_PANEL_SIZE = {
  width: 168,
  height: 36,
};

export function CaptureSelectionAction({
  selection,
  resolution,
  processing,
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
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    document.body.appendChild(portalElement);

    return () => {
      portalElement.remove();
    };
  }, [portalElement]);

  useLayoutEffect(() => {
    if (!selection || !anchorElement) {
      return;
    }

    const currentAnchor = anchorElement as HTMLTextAreaElement;
    const currentSelectionState = selection;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    function updatePosition() {
      const currentSelection =
        currentAnchor instanceof HTMLTextAreaElement
          ? readValidTextareaSelection(currentAnchor)
          : null;
      const liveSelectionRect = getLiveSelectionRect(currentAnchor);
      const selectionRect =
        liveSelectionRect ??
        currentSelection?.selectionRect ??
        currentSelectionState.selectionRect ??
        currentAnchor.getBoundingClientRect();
      const panelRect = panelRef.current?.getBoundingClientRect() ?? null;
      const panelSize = {
        width: panelRect?.width || FALLBACK_PANEL_SIZE.width,
        height: panelRect?.height || FALLBACK_PANEL_SIZE.height,
      };
      const boundaryRect = getVisibleBoundaryRect(currentAnchor);
      const nextPosition = calculateSelectionPopoverPosition({
        selectionRect,
        panelSize,
        boundaryRect,
      });

      setPosition({
        left: nextPosition.left,
        top: nextPosition.top,
        placement: nextPosition.placement,
      });
    }

    function scheduleUpdatePosition() {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updatePosition();
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", scheduleUpdatePosition, true);

    if (typeof ResizeObserver !== "undefined" && panelRef.current) {
      resizeObserver = new ResizeObserver(scheduleUpdatePosition);
      resizeObserver.observe(panelRef.current);
    }

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }

      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", scheduleUpdatePosition, true);
    };
  }, [anchorElement, processing, resolution, selection]);

  if (!selection) {
    return null;
  }

  const newConceptLabel = normalizeConceptDisplayLabel(selection.text);
  const panelStyle = getPanelStyle({ position });

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-[60] max-w-[calc(100vw-1.5rem)] rounded-full border border-[var(--vinema-border)] bg-[var(--vinema-surface-elevated)] p-1 text-sm text-[var(--vinema-text-primary)] shadow-[var(--vinema-shadow-panel)] backdrop-blur-sm",
        resolution && "rounded-xl p-2",
      )}
      style={panelStyle}
      role="group"
      aria-label={`Seleccion capturada: ${selection.text}`}
      data-capture-selection-action=""
      data-floating-layer="popover"
      data-placement={position?.placement ?? "top"}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {!resolution ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-full px-3 text-[var(--vinema-text-primary)] hover:bg-[var(--vinema-hover)]"
          disabled={processing}
          onClick={onCapture}
        >
          <ScanText className="h-4 w-4" aria-hidden="true" />
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

export function calculateSelectionPopoverPosition({
  selectionRect,
  panelSize,
  boundaryRect,
}: {
  selectionRect: FloatingRect;
  panelSize: { width: number; height: number };
  boundaryRect: FloatingRect;
}): FloatingPosition {
  const minimumLeft = boundaryRect.left + FLOATING_BOUNDARY_PADDING;
  const maximumLeft = boundaryRect.right - panelSize.width - FLOATING_BOUNDARY_PADDING;
  const centeredLeft =
    selectionRect.left + selectionRect.width / 2 - panelSize.width / 2;
  const left = clamp(centeredLeft, minimumLeft, Math.max(minimumLeft, maximumLeft));
  const topCandidate = selectionRect.top - panelSize.height - FLOATING_GAP;
  const bottomCandidate = selectionRect.bottom + FLOATING_GAP;
  const minimumTop = boundaryRect.top + FLOATING_BOUNDARY_PADDING;
  const maximumTop = Math.max(
    minimumTop,
    boundaryRect.bottom - panelSize.height - FLOATING_BOUNDARY_PADDING,
  );
  const hasRoomAbove = topCandidate >= minimumTop;

  if (hasRoomAbove) {
    return {
      left,
      top: clamp(topCandidate, minimumTop, maximumTop),
      placement: "top",
    };
  }

  return {
    left,
    top: clamp(bottomCandidate, minimumTop, maximumTop),
    placement: "bottom",
  };
}

function getPanelStyle({ position }: { position: FloatingPosition | null }): CSSProperties {
  if (!position) {
    return {
      left: 0,
      top: 0,
      visibility: "hidden",
    };
  }

  return {
    left: `${position.left}px`,
    top: `${position.top}px`,
  };
}

function getVisibleBoundaryRect(anchorElement: HTMLElement): FloatingRect {
  const reservedTop = getFloatingTopBoundary();
  const viewportRect = rectFromBounds({
    top: reservedTop,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  });
  const document = anchorElement.ownerDocument;
  let boundary = viewportRect;
  let element: HTMLElement | null = anchorElement;

  while (element && element !== document.body && element !== document.documentElement) {
    const style = window.getComputedStyle(element);

    if (clipsOverflow(style)) {
      boundary = intersectRects(boundary, element.getBoundingClientRect());
    }

    element = element.parentElement;
  }

  return boundary;
}

function getLiveSelectionRect(anchorElement: HTMLElement): DOMRectReadOnly | null {
  const selection = anchorElement.ownerDocument.defaultView?.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  const host =
    ancestor instanceof Element ? ancestor : ancestor.parentElement;

  if (!host || !anchorElement.contains(host)) {
    return null;
  }

  const firstVisibleRect = typeof range.getClientRects === "function"
    ? Array.from(range.getClientRects()).find(
        (rect) => rect.width > 0 && rect.height > 0,
      )
    : null;

  if (firstVisibleRect) {
    return firstVisibleRect;
  }

  if (typeof range.getBoundingClientRect !== "function") {
    return null;
  }

  const fallback = range.getBoundingClientRect();

  return fallback.width > 0 || fallback.height > 0 ? fallback : null;
}

function getFloatingTopBoundary() {
  const header = document.querySelector<HTMLElement>("[data-app-header]");
  const toolbar = document.querySelector<HTMLElement>("[data-canvas-format-toolbar]");
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const toolbarBottom = toolbar?.getBoundingClientRect().bottom ?? 0;

  return Math.max(headerBottom, toolbarBottom);
}

function clipsOverflow(style: CSSStyleDeclaration) {
  return /(auto|scroll|hidden|clip)/.test(
    `${style.overflow} ${style.overflowX} ${style.overflowY}`,
  );
}

function intersectRects(first: FloatingRect, second: DOMRect | DOMRectReadOnly) {
  return rectFromBounds({
    top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom),
    left: Math.max(first.left, second.left),
  });
}

function rectFromBounds({
  top,
  right,
  bottom,
  left,
}: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): FloatingRect {
  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
