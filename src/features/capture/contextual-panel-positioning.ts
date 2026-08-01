export type PanelAnchorRect = Pick<DOMRect, "left" | "right" | "top">;

export type DesktopPanelPlacementInput = {
  anchorRect: PanelAnchorRect;
  viewportWidth: number;
  viewportHeight: number;
  panelWidth?: number;
  panelGap?: number;
  viewportMargin?: number;
};

export type DesktopPanelPlacement = {
  left: number;
  maxHeight: number;
  placement: "right" | "left" | "clamped";
  top: number;
  width: number;
};

export const CONTEXTUAL_PANEL_DESKTOP_GAP = 10;
export const CONTEXTUAL_PANEL_DESKTOP_MARGIN = 16;
export const CONTEXTUAL_PANEL_DESKTOP_MIN_USABLE_HEIGHT = 240;
export const CONTEXTUAL_PANEL_DESKTOP_WIDTH = 360;

export function calculateDesktopPanelPlacement({
  anchorRect,
  viewportWidth,
  viewportHeight,
  panelWidth = CONTEXTUAL_PANEL_DESKTOP_WIDTH,
  panelGap = CONTEXTUAL_PANEL_DESKTOP_GAP,
  viewportMargin = CONTEXTUAL_PANEL_DESKTOP_MARGIN,
}: DesktopPanelPlacementInput): DesktopPanelPlacement {
  const preferredMaxHeight = Math.min(
    Math.round(viewportHeight * 0.6),
    viewportHeight - viewportMargin * 2,
  );
  const width = Math.min(panelWidth, viewportWidth - viewportMargin * 2);
  const rightSideLeft = anchorRect.right + panelGap;
  const leftSideLeft = anchorRect.left - width - panelGap;
  const placement =
    rightSideLeft + width <= viewportWidth - viewportMargin
      ? "right"
      : leftSideLeft >= viewportMargin
        ? "left"
        : "clamped";
  const left =
    placement === "right"
      ? rightSideLeft
      : placement === "left"
        ? leftSideLeft
        : clamp(
            anchorRect.left,
            viewportMargin,
            viewportWidth - width - viewportMargin,
          );
  const availableBelow = viewportHeight - anchorRect.top - viewportMargin;
  const top =
    availableBelow >= CONTEXTUAL_PANEL_DESKTOP_MIN_USABLE_HEIGHT
      ? Math.max(anchorRect.top, viewportMargin)
      : clamp(
          anchorRect.top,
          viewportMargin,
          viewportHeight - preferredMaxHeight - viewportMargin,
        );
  const maxHeight = Math.min(preferredMaxHeight, viewportHeight - top - viewportMargin);

  return {
    left,
    maxHeight,
    placement,
    top,
    width,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
