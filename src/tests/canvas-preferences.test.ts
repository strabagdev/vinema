import { describe, expect, it } from "vitest";
import {
  CANVAS_FONT_FAMILY,
  CANVAS_MAX_WIDTH,
  DEFAULT_CANVAS_PREFERENCES,
  getCanvasEditorStyle,
  getCanvasPreferenceAttributes,
  getCanvasPreferenceStyle,
  normalizeCanvasPreferences,
} from "@/features/canvas/canvas-preferences";
import {
  getCanvasPrompts,
  selectCanvasPrompt,
} from "@/features/canvas/canvas-prompts";

describe("canvas preferences", () => {
  it("uses safe defaults", () => {
    expect(normalizeCanvasPreferences(null)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(normalizeCanvasPreferences({})).toEqual(DEFAULT_CANVAS_PREFERENCES);
  });

  it("validates each preference independently", () => {
    expect(
      normalizeCanvasPreferences({
        width: "compact",
        textSize: 20,
        fontFamily: "mono",
        appearance: "light",
      }),
    ).toEqual({
      textSize: 20,
      appearance: "light",
    });
  });

  it("ignores removed and invalid values without losing valid values", () => {
    expect(
      normalizeCanvasPreferences({
        width: "huge",
        textSize: "massive",
        fontFamily: "serif",
        appearance: "dark",
      }),
    ).toEqual(DEFAULT_CANVAS_PREFERENCES);
  });

  it("migrates legacy text sizes to pixel values", () => {
    expect(normalizeCanvasPreferences({ textSize: "small" }).textSize).toBe(14);
    expect(normalizeCanvasPreferences({ textSize: "medium" }).textSize).toBe(16);
    expect(normalizeCanvasPreferences({ textSize: "large" }).textSize).toBe(20);
    expect(normalizeCanvasPreferences({ textSize: "18" }).textSize).toBe(18);
  });

  it("derives canvas attributes and token values from preferences", () => {
    const preferences = normalizeCanvasPreferences({
      ...DEFAULT_CANVAS_PREFERENCES,
      width: "wide",
      textSize: 14,
      fontFamily: "serif",
    });

    expect(getCanvasPreferenceAttributes(preferences)).toMatchObject({
      "data-canvas-text-size": 14,
    });
    expect(getCanvasPreferenceAttributes(preferences)).not.toHaveProperty(
      "data-canvas-width",
    );
    expect(getCanvasPreferenceAttributes(preferences)).not.toHaveProperty(
      "data-canvas-font",
    );
    expect(getCanvasPreferenceStyle()).toMatchObject({
      "--vinema-canvas-max-width": CANVAS_MAX_WIDTH,
      "--vinema-canvas-font-family": CANVAS_FONT_FAMILY,
    });
    expect(getCanvasEditorStyle(preferences)).toMatchObject({
      fontSize: "14px",
      lineHeight: "1.6",
      fontFamily: CANVAS_FONT_FAMILY,
    });
  });
});

describe("canvas prompts", () => {
  it("returns prompts by category and includes all categories in mixed", () => {
    expect(getCanvasPrompts("work")).toContain(
      "Anota el siguiente movimiento claro.",
    );
    expect(getCanvasPrompts("mixed").length).toBeGreaterThan(
      getCanvasPrompts("work").length,
    );
  });

  it("selects a deterministic prompt for a seed", () => {
    expect(selectCanvasPrompt("capture", 0)).toBe(
      "Escribe lo que acaba de aparecer.",
    );
    expect(selectCanvasPrompt("capture", 3)).toBe(
      "Escribe lo que acaba de aparecer.",
    );
  });
});
