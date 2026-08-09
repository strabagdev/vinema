"use client";

import { RotateCcw, SendHorizontal, Settings2 } from "lucide-react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasPreferences } from "@/features/canvas/canvas-preferences";
import {
  CANVAS_APPEARANCES,
  CANVAS_TEXT_SIZES,
  getCanvasEditorStyle,
  getCanvasPreferenceAttributes,
  getCanvasPreferenceStyle,
} from "@/features/canvas/canvas-preferences";
import {
  CANVAS_CARET_VISUAL_FOLLOW_RATIO,
  CANVAS_EDITOR_INITIAL_ANCHOR,
  createTextareaCaretFollower,
} from "@/features/canvas/caret-following";
import { cn } from "@/lib/cn";

export function VinemaCanvas({
  preferences,
  children,
}: {
  preferences: CanvasPreferences;
  children: ReactNode;
}) {
  return (
    <main
      className="vinema-canvas grid h-full min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden pt-2"
      style={getCanvasPreferenceStyle()}
      data-capture-canvas=""
      {...getCanvasPreferenceAttributes(preferences)}
    >
      <h1 className="sr-only">Capturar</h1>
      {children}
    </main>
  );
}

export function CanvasMainRegion({ children }: { children: ReactNode }) {
  return (
    <section
      className="vinema-canvas-main-grid row-[1] grid h-full min-h-0 w-full overflow-hidden"
      data-canvas-main-region=""
    >
      {children}
    </section>
  );
}

export const VinemaCanvasEditor = forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof Textarea> & { preferences: CanvasPreferences }
>(function VinemaCanvasEditor(
  {
    className,
    preferences,
    style,
    onChange,
    onKeyUp,
    onScroll,
    ...props
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretFollowerRef = useRef<ReturnType<
    typeof createTextareaCaretFollower
  > | null>(null);

  const getCaretFollower = useCallback(() => {
    caretFollowerRef.current ??= createTextareaCaretFollower({
      getTextarea: () => textareaRef.current,
    });

    return caretFollowerRef.current;
  }, []);

  useEffect(
    () => () => {
      caretFollowerRef.current?.dispose();
    },
    [],
  );

  const resizeEditor = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    resizeEditor();
  }, [props.value, preferences.textSize, resizeEditor]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const viewport = textarea?.closest("[data-canvas-scroll-viewport]");

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const follower = getCaretFollower();

    viewport.addEventListener("scroll", follower.handleScroll);

    return () => {
      viewport.removeEventListener("scroll", follower.handleScroll);
    };
  }, [getCaretFollower]);

  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  return (
    <Textarea
      ref={setTextareaRef}
      className={cn(
        "vinema-canvas-editor min-h-[1lh] resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-zinc-950 shadow-none outline-none ring-0 placeholder:text-[color:var(--vinema-canvas-placeholder)] focus-visible:ring-0 focus-visible:ring-offset-0 focus:placeholder:text-transparent",
        className,
      )}
      style={{
        ...style,
        ...getCanvasEditorStyle(preferences),
      }}
      onChange={(event) => {
        onChange?.(event);
        resizeEditor();
        getCaretFollower().follow(true);
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        getCaretFollower().follow(false);
      }}
      onScroll={onScroll}
      data-canvas-caret-follow-ratio={CANVAS_CARET_VISUAL_FOLLOW_RATIO}
      {...props}
    />
  );
});
VinemaCanvasEditor.displayName = "VinemaCanvasEditor";

export function CanvasWritingSurface({
  children,
  contextLayer = null,
}: {
  children: ReactNode;
  contextLayer?: ReactNode;
}) {
  return (
    <div
      className="relative col-[2] row-[1] h-full min-h-0 w-full max-w-[var(--vinema-canvas-max-width)] px-[var(--vinema-canvas-padding-x)] py-[var(--vinema-canvas-padding-y)]"
      style={{
        "--vinema-canvas-editor-start": CANVAS_EDITOR_INITIAL_ANCHOR,
      } as CSSProperties}
      data-mobile-capture-composer=""
      data-canvas-writing-surface=""
    >
      {contextLayer}
      <div
        className="vinema-scrollbar h-full min-h-0 overflow-y-auto"
        data-canvas-scroll-viewport=""
      >
        <div
          className="relative grid min-h-full grid-rows-[minmax(var(--vinema-canvas-context-reserve),calc(var(--vinema-canvas-editor-start)_+_var(--vinema-canvas-context-reserve)))_auto_minmax(var(--vinema-canvas-editor-end-space),1fr)]"
          data-canvas-context-reserve="structural"
          data-canvas-writing-track=""
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function CanvasIconRail({ children }: { children: ReactNode }) {
  return (
    <nav
      className="relative z-20 col-[1] row-[1] grid h-full min-h-0 grid-cols-[var(--vinema-canvas-icon-width)_minmax(0,var(--vinema-canvas-panel-width))_minmax(0,1fr)] items-center overflow-hidden"
      aria-label="Herramientas del canvas"
      data-canvas-icon-rail=""
    >
      <div className="col-[1] flex flex-col items-center justify-center gap-4">
        {children}
      </div>
    </nav>
  );
}

export function CanvasPanelColumn({
  children,
  ...hoverCorridorProps
}: {
  children: ReactNode;
} & Pick<
  HTMLAttributes<HTMLDivElement>,
  "onMouseEnter" | "onMouseLeave" | "onFocus" | "onBlur"
>) {
  return (
    <div
      className="pointer-events-none relative z-30 col-[1] row-[1] grid h-full min-h-0 grid-cols-[var(--vinema-canvas-icon-width)_minmax(0,var(--vinema-canvas-panel-width))_minmax(0,1fr)] items-center overflow-visible"
      data-canvas-panel-column=""
    >
      <div
        className="pointer-events-auto col-[2] min-h-0 overflow-visible pl-[var(--vinema-canvas-panel-gutter)]"
        data-canvas-panel-hover-corridor=""
        {...hoverCorridorProps}
      >
        {children}
      </div>
    </div>
  );
}

export function CanvasCaptureDock({ children }: { children: ReactNode }) {
  return (
    <div
      className="col-[3] row-[1] grid h-full min-h-0 grid-cols-[var(--vinema-canvas-submit-gap)_var(--vinema-canvas-dock-width)_minmax(0,1fr)] items-center overflow-hidden"
      data-canvas-capture-dock=""
    >
      <div className="col-[2] flex min-h-0 items-center justify-start">
        {children}
      </div>
    </div>
  );
}

export function CanvasActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-11 w-full shrink-0 items-center justify-between gap-3 overflow-visible md:gap-4"
      data-capture-action-row=""
    >
      {children}
    </div>
  );
}

export function CanvasSubmitButton({
  visible,
  capturing,
  onCapture,
}: {
  visible: boolean;
  capturing: boolean;
  onCapture: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={() => {
        if (visible) {
          onCapture();
        }
      }}
      disabled={capturing}
      tabIndex={visible ? 0 : -1}
      aria-disabled={!visible || capturing}
      variant="ghost"
      className={cn(
        "h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full border border-zinc-200 bg-zinc-950 p-0 text-white transition-[opacity,transform,background-color,color] duration-200 hover:bg-zinc-800 hover:text-white motion-reduce:transition-none",
        visible
          ? "scale-100 opacity-100"
          : "pointer-events-none scale-95 opacity-0",
      )}
      aria-label="Capturar"
      title="Capturar con Ctrl/Cmd + Enter"
      data-capture-submit=""
    >
      <SendHorizontal className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{capturing ? "Capturando" : "Capturar"}</span>
    </Button>
  );
}

export function CanvasPreferencesPanel({
  preferences,
  onChange,
  onReset,
}: {
  preferences: CanvasPreferences;
  onChange: (patch: Partial<CanvasPreferences>) => void;
  onReset: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
          aria-label="Preferencias de escritura"
          title="Preferencias de escritura"
          data-canvas-preferences-trigger=""
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="right-0 left-auto w-[min(28rem,92vw)] max-w-[92vw] border-l border-r-0">
        <CanvasPreferencesContent
          preferences={preferences}
          onChange={onChange}
          onReset={onReset}
        />
      </SheetContent>
    </Sheet>
  );
}

export function CanvasPreferencesContent({
  preferences,
  onChange,
  onReset,
}: {
  preferences: CanvasPreferences;
  onChange: (patch: Partial<CanvasPreferences>) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-5 py-5">
      <div className="pr-2">
        <h2 className="text-base font-semibold text-zinc-950">
          Escritura
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Ajustes locales para este espacio.
        </p>
      </div>
      <PreferenceGroup label="Texto">
        <TextSizeStepper
          value={preferences.textSize}
          onChange={(textSize) => onChange({ textSize })}
        />
      </PreferenceGroup>
      <PreferenceGroup label="Apariencia">
        <SegmentedOptions
          value={preferences.appearance}
          options={CANVAS_APPEARANCES}
          labels={{ system: "Sistema", light: "Clara" }}
          onChange={(appearance) => onChange({ appearance })}
        />
      </PreferenceGroup>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 justify-start"
        onClick={onReset}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Restablecer
      </Button>
    </div>
  );
}

function PreferenceGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase text-zinc-500">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function TextSizeStepper({
  value,
  onChange,
}: {
  value: CanvasPreferences["textSize"];
  onChange: (value: CanvasPreferences["textSize"]) => void;
}) {
  const currentIndex = CANVAS_TEXT_SIZES.indexOf(value);
  const canDecrease = currentIndex > 0;
  const canIncrease = currentIndex < CANVAS_TEXT_SIZES.length - 1;

  return (
    <div
      className="inline-grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1"
      role="group"
      aria-label="Tamaño del texto"
    >
      <span className="sr-only">{`Tamaño actual: ${value} px`}</span>
      <button
        type="button"
        className="min-h-11 min-w-11 rounded-[0.375rem] px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-white hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:text-zinc-300 disabled:hover:bg-transparent motion-reduce:transition-none"
        aria-label="Reducir tamaño del texto"
        disabled={!canDecrease}
        onClick={() => {
          if (canDecrease) {
            onChange(CANVAS_TEXT_SIZES[currentIndex - 1]);
          }
        }}
      >
        −A
      </button>
      <button
        type="button"
        className="min-h-11 min-w-11 rounded-[0.375rem] px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-white hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:text-zinc-300 disabled:hover:bg-transparent motion-reduce:transition-none"
        aria-label="Aumentar tamaño del texto"
        disabled={!canIncrease}
        onClick={() => {
          if (canIncrease) {
            onChange(CANVAS_TEXT_SIZES[currentIndex + 1]);
          }
        }}
      >
        +A
      </button>
    </div>
  );
}

function SegmentedOptions<T extends string | number>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-md bg-zinc-100 p-1" style={getGridStyle(options.length)}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "min-h-10 rounded-[0.375rem] px-2 text-sm font-medium transition-colors motion-reduce:transition-none",
            value === option
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-500 hover:text-zinc-950",
          )}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function getGridStyle(count: number): CSSProperties {
  return {
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  };
}
