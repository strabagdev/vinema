import { describe, expect, it } from "vitest";
import {
  applyCanvasAppearance,
  CANVAS_FONT_FAMILY,
  CANVAS_MAX_WIDTH,
  DEFAULT_CANVAS_PREFERENCES,
  getCanvasEditorStyle,
  getCanvasPreferenceAttributes,
  getCanvasPreferenceStyle,
  normalizeCanvasPreferences,
  resolveCanvasAppearance,
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
    ).toEqual({
      textSize: 16,
      appearance: "dark",
    });

    expect(
      normalizeCanvasPreferences({
        width: "huge",
        textSize: "massive",
        fontFamily: "serif",
        appearance: "nocturne",
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
      "data-canvas-appearance": "system",
      "data-canvas-theme": "light",
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

  it("resolves light, dark and system appearances", () => {
    expect(resolveCanvasAppearance("light", createMedia(false))).toBe("light");
    expect(resolveCanvasAppearance("dark", createMedia(false))).toBe("dark");
    expect(resolveCanvasAppearance("system", createMedia(false))).toBe("light");
    expect(resolveCanvasAppearance("system", createMedia(true))).toBe("dark");
  });

  it("applies system appearance updates only while system is active", () => {
    const target = document.createElement("html");
    const systemMedia = createMedia(false);
    const cleanup = applyCanvasAppearance("system", {
      target,
      media: systemMedia,
    });

    expect(target.getAttribute("data-vinema-appearance")).toBe("system");
    expect(target.getAttribute("data-vinema-theme")).toBe("light");

    systemMedia.setMatches(true);
    expect(target.getAttribute("data-vinema-theme")).toBe("dark");

    cleanup();
    systemMedia.setMatches(false);
    expect(target.getAttribute("data-vinema-theme")).toBe("dark");

    const fixedTarget = document.createElement("html");
    const fixedMedia = createMedia(false);
    applyCanvasAppearance("dark", { target: fixedTarget, media: fixedMedia });
    fixedMedia.setMatches(false);

    expect(fixedTarget.getAttribute("data-vinema-appearance")).toBe("dark");
    expect(fixedTarget.getAttribute("data-vinema-theme")).toBe("dark");
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

function createMedia(initialMatches: boolean): MediaQueryList & {
  setMatches: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
    setMatches: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };

  return media as MediaQueryList & { setMatches: (matches: boolean) => void };
}
