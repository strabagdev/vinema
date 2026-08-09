import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const CANVAS_PREFERENCES_KEY = "vinema:canvas-preferences";
export const CANVAS_APPEARANCE_MIRROR_KEY = "vinema:appearance";

export const CANVAS_TEXT_SIZES = [14, 16, 18, 20] as const;
export const CANVAS_APPEARANCES = ["light", "dark", "system"] as const;
export const CANVAS_MAX_WIDTH = "920px";
export const CANVAS_FONT_FAMILY =
  "var(--font-geist-sans), Arial, Helvetica, sans-serif";

export type CanvasTextSize = (typeof CANVAS_TEXT_SIZES)[number];
export type CanvasAppearance = (typeof CANVAS_APPEARANCES)[number];

export type CanvasPreferences = {
  textSize: CanvasTextSize;
  appearance: CanvasAppearance;
};
export type ResolvedCanvasAppearance = "light" | "dark";

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
    "data-canvas-theme": resolveCanvasAppearance(preferences.appearance),
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
          const normalized = normalizeCanvasPreferences(stored);
          setPreferencesState(normalized);
          mirrorCanvasAppearance(normalized.appearance);
        }
      } catch {
        if (!cancelled) {
          setPreferencesState(DEFAULT_CANVAS_PREFERENCES);
          mirrorCanvasAppearance(DEFAULT_CANVAS_PREFERENCES.appearance);
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
      mirrorCanvasAppearance(normalized.appearance);
      void persistCanvasPreferences(storage, normalized);
    },
    [storage],
  );

  const updatePreferences = useCallback(
    (patch: Partial<CanvasPreferences>) => {
      setPreferencesState((current) => {
        const normalized = normalizeCanvasPreferences({ ...current, ...patch });
        mirrorCanvasAppearance(normalized.appearance);
        void persistCanvasPreferences(storage, normalized);
        return normalized;
      });
    },
    [storage],
  );

  const resetPreferences = useCallback(() => {
    setPreferencesState(DEFAULT_CANVAS_PREFERENCES);
    mirrorCanvasAppearance(DEFAULT_CANVAS_PREFERENCES.appearance);
    void removeCanvasPreferences(storage);
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

export function useApplyCanvasAppearance(preferences: CanvasPreferences) {
  useEffect(() => {
    return applyCanvasAppearance(preferences.appearance);
  }, [preferences.appearance]);
}

export function applyCanvasAppearance(
  appearance: CanvasAppearance,
  {
    target = getDefaultAppearanceTarget(),
    media = getDefaultColorSchemeMedia(),
  }: {
    target?: HTMLElement | null;
    media?: MediaQueryList | null;
  } = {},
) {
  if (!target) {
    return () => undefined;
  }

  function applyResolvedAppearance() {
    const resolved = resolveCanvasAppearance(appearance, media);
    target?.setAttribute("data-vinema-appearance", appearance);
    target?.setAttribute("data-vinema-theme", resolved);
    target?.style.setProperty("color-scheme", resolved);
  }

  applyResolvedAppearance();

  if (appearance !== "system" || !media) {
    return () => undefined;
  }

  media.addEventListener("change", applyResolvedAppearance);

  return () => {
    media.removeEventListener("change", applyResolvedAppearance);
  };
}

export function resolveCanvasAppearance(
  appearance: CanvasAppearance,
  media = getDefaultColorSchemeMedia(),
): ResolvedCanvasAppearance {
  if (appearance === "dark") {
    return "dark";
  }

  if (appearance === "light") {
    return "light";
  }

  return media?.matches ? "dark" : "light";
}

function mirrorCanvasAppearance(appearance: CanvasAppearance) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CANVAS_APPEARANCE_MIRROR_KEY, appearance);
  } catch {
    // localStorage is only a pre-hydration mirror; IndexedDB remains canonical.
  }
}

async function persistCanvasPreferences(
  storage: StorageAdapter,
  preferences: CanvasPreferences,
) {
  try {
    await storage.set(CANVAS_PREFERENCES_KEY, preferences);
  } catch {
    // Preferences are local convenience state; keep the in-memory update.
  }
}

async function removeCanvasPreferences(storage: StorageAdapter) {
  try {
    await storage.remove(CANVAS_PREFERENCES_KEY);
  } catch {
    // Preferences reset should remain usable even when persistence is unavailable.
  }
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

function getDefaultAppearanceTarget() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
}

function getDefaultColorSchemeMedia() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia("(prefers-color-scheme: dark)");
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
