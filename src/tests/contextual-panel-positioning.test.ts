import { describe, expect, it } from "vitest";
import {
  calculateDesktopPanelPlacement,
  CONTEXTUAL_PANEL_DESKTOP_GAP,
} from "@/features/capture/contextual-panel-positioning";

describe("contextual panel positioning", () => {
  it("places a desktop panel 10px to the right of the active indicator at 1920x1080", () => {
    const indicatorRect = rect({ left: 760, right: 796, top: 520 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: indicatorRect,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    expect(placement.placement).toBe("right");
    expect(placement.left - indicatorRect.right).toBe(
      CONTEXTUAL_PANEL_DESKTOP_GAP,
    );
    expect(placement.top - indicatorRect.top).toBe(0);
  });

  it("places a desktop panel 10px to the right of the active indicator at 1366x768", () => {
    const indicatorRect = rect({ left: 420, right: 456, top: 500 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: indicatorRect,
      viewportWidth: 1366,
      viewportHeight: 768,
    });

    expect(placement.placement).toBe("right");
    expect(placement.left - indicatorRect.right).toBe(10);
    expect(placement.top - indicatorRect.top).toBe(0);
  });

  it("falls back to the left with a 10px gap when the right side does not fit", () => {
    const indicatorRect = rect({ left: 940, right: 976, top: 420 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: indicatorRect,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(placement.placement).toBe("left");
    expect(indicatorRect.left - (placement.left + placement.width)).toBe(10);
  });

  it("clamps vertical position inside the viewport", () => {
    const placement = calculateDesktopPanelPlacement({
      anchorRect: rect({ left: 420, right: 456, top: 740 }),
      viewportWidth: 1366,
      viewportHeight: 768,
    });

    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(768 - 16);
  });

  it("uses the latest viewport-relative rect after scroll", () => {
    const scrolledIndicatorRect = rect({ left: 420, right: 456, top: 220 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: scrolledIndicatorRect,
      viewportWidth: 1366,
      viewportHeight: 768,
    });

    expect(placement.left).toBe(466);
    expect(placement.top).toBe(220);
  });

  it("recomputes against a resized viewport", () => {
    const indicatorRect = rect({ left: 700, right: 736, top: 420 });
    const widePlacement = calculateDesktopPanelPlacement({
      anchorRect: indicatorRect,
      viewportWidth: 1366,
      viewportHeight: 768,
    });
    const narrowPlacement = calculateDesktopPanelPlacement({
      anchorRect: indicatorRect,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(widePlacement.placement).toBe("right");
    expect(narrowPlacement.placement).toBe("left");
  });

  it("uses the concept indicator rect as the anchor", () => {
    const conceptIndicatorRect = rect({ left: 420, right: 456, top: 500 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: conceptIndicatorRect,
      viewportWidth: 1366,
      viewportHeight: 768,
    });

    expect(placement.left).toBe(466);
  });

  it("uses the memory indicator rect as the anchor", () => {
    const memoryIndicatorRect = rect({ left: 500, right: 536, top: 500 });
    const placement = calculateDesktopPanelPlacement({
      anchorRect: memoryIndicatorRect,
      viewportWidth: 1366,
      viewportHeight: 768,
    });

    expect(placement.left).toBe(546);
  });
});

function rect({
  left,
  right,
  top,
}: {
  left: number;
  right: number;
  top: number;
}) {
  return { left, right, top };
}
