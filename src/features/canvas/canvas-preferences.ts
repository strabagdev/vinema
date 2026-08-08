import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const CANVAS_PREFERENCES_KEY = "vinema:canvas-preferences";

export const CANVAS_TEXT_SIZES = [14, 16, 18, 20] as const;
export const CANVAS_APPEARANCES = ["system", "light"] as const;
export const CANVAS_MAX_WIDTH = "920px";
export const CANVAS_FONT_FAMILY =
  "var(--font-geist-sans), Arial, Helvetica, sans-serif";

export type CanvasTextSize = (typeof CANVAS_TEXT_SIZES)[number];
export type CanvasAppearance = (typeof CANVAS_APPEARANCES)[number];

export type CanvasPreferences = {
  textSize: CanvasTextSize;
  appearance: CanvasAppearance;
};

export const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
  textSize: 16,
  appearance: "system",
};

export function normalizeCanvasPreferences(
  value: unknown,
): CanvasPreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_CANVAS_PREFERENCES;
  }

  const candidate = value as Partial<
    Record<keyof CanvasPreferences, unknown>
  >;

  return {
    textSize: normalizeCanvasTextSize(candidate.textSize),
    appearance: isCanvasAppearance(candidate.appearance)
      ? candidate.appearance
      : DEFAULT_CANVAS_PREFERENCES.appearance,
  };
}

export function getCanvasPreferenceAttributes(preferences: CanvasPreferences) {
  return {
    "data-canvas-text-size": preferences.textSize,
    "data-canvas-appearance": preferences.appearance,
  };
}

export function getCanvasPreferenceStyle(): CSSProperties {
  return {
    "--vinema-canvas-max-width": CANVAS_MAX_WIDTH,
    "--vinema-canvas-font-family": CANVAS_FONT_FAMILY,
  } as CSSProperties;
}

export function getCanvasEditorStyle(
  preferences: CanvasPreferences,
): CSSProperties {
  return {
    fontSize: `${preferences.textSize}px`,
    lineHeight: lineHeightToCssValue(preferences.textSize),
    fontFamily: CANVAS_FONT_FAMILY,
  };
}

export function useCanvasPreferences(storage: StorageAdapter) {
  const [preferences, setPreferencesState] = useState<CanvasPreferences>(
    DEFAULT_CANVAS_PREFERENCES,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const stored = await storage.get<unknown>(CANVAS_PREFERENCES_KEY);

        if (!cancelled) {
          setPreferencesState(normalizeCanvasPreferences(stored));
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreferences = useCallback(
    (next: CanvasPreferences) => {
      const normalized = normalizeCanvasPreferences(next);
      setPreferencesState(normalized);
      void storage.set(CANVAS_PREFERENCES_KEY, normalized);
    },
    [storage],
  );

  const updatePreferences = useCallback(
    (patch: Partial<CanvasPreferences>) => {
      setPreferencesState((current) => {
        const normalized = normalizeCanvasPreferences({ ...current, ...patch });
        void storage.set(CANVAS_PREFERENCES_KEY, normalized);
        return normalized;
      });
    },
    [storage],
  );

  const resetPreferences = useCallback(() => {
    setPreferencesState(DEFAULT_CANVAS_PREFERENCES);
    void storage.remove(CANVAS_PREFERENCES_KEY);
  }, [storage]);

  return useMemo(
    () => ({
      preferences,
      loaded,
      setPreferences,
      updatePreferences,
      resetPreferences,
    }),
    [loaded, preferences, resetPreferences, setPreferences, updatePreferences],
  );
}

function isCanvasTextSize(value: unknown): value is CanvasTextSize {
  return (
    typeof value === "number" &&
    CANVAS_TEXT_SIZES.includes(value as CanvasTextSize)
  );
}

function normalizeCanvasTextSize(value: unknown): CanvasTextSize {
  if (isCanvasTextSize(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);

    if (isCanvasTextSize(numericValue)) {
      return numericValue;
    }

    switch (value) {
      case "small":
        return 14;
      case "large":
        return 20;
      case "medium":
        return 16;
    }
  }

  return DEFAULT_CANVAS_PREFERENCES.textSize;
}

function isCanvasAppearance(value: unknown): value is CanvasAppearance {
  return (
    typeof value === "string" &&
    CANVAS_APPEARANCES.includes(value as CanvasAppearance)
  );
}

function lineHeightToCssValue(textSize: CanvasTextSize) {
  switch (textSize) {
    case 14:
      return "1.6";
    case 18:
      return "1.7";
    case 20:
      return "1.75";
    case 16:
      return "1.65";
  }
}
