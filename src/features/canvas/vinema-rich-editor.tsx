"use client";

import Code from "@tiptap/extension-code";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  X,
} from "lucide-react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  ReactNode,
} from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import type { CanvasPreferences } from "@/features/canvas/canvas-preferences";
import { getCanvasEditorStyle } from "@/features/canvas/canvas-preferences";
import {
  CANVAS_FORMAT_TOOLBAR_SAFE_GAP,
  createElementCaretFollower,
} from "@/features/canvas/caret-following";
import {
  createEmptyRichDocument,
  markdownToRichDocument,
  richDocumentToMarkdown,
  richDocumentToPlainText,
  sanitizeRichTextUrl,
} from "@/features/canvas/rich-content";
import { cn } from "@/lib/cn";

export type RichTextSelectionSnapshot = {
  text: string;
  start: number;
  end: number;
  selectionRect?: DOMRectReadOnly;
};

export type VinemaCanvasEditorHandle = {
  focus: () => void;
  blur: () => void;
  getPlainText: () => string;
  getSelection: () => RichTextSelectionSnapshot | null;
  element: HTMLElement | null;
};

export type VinemaCanvasRichEditorChange = {
  markdown: string;
  plainText: string;
  document: JSONContent;
};

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    code: false,
    link: false,
  }),
  Code,
  Link.configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: true,
    HTMLAttributes: {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    },
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
];

export const VinemaCanvasRichEditor = forwardRef<
  VinemaCanvasEditorHandle,
  {
    id: string;
    value: string;
    preferences: CanvasPreferences;
    placeholder: string;
    formatToolbarOpen: boolean;
    className?: string;
    onFormatToolbarOpenChange: (open: boolean) => void;
    onChange: (change: VinemaCanvasRichEditorChange) => void;
    onFocusChange: (focused: boolean) => void;
    onSelectionChange: (selection: RichTextSelectionSnapshot | null) => void;
    onModEnter: () => void;
  }
>(function VinemaCanvasRichEditor(
  {
    id,
    value,
    preferences,
    placeholder,
    formatToolbarOpen,
    className,
    onFormatToolbarOpenChange,
    onChange,
    onFocusChange,
    onSelectionChange,
    onModEnter,
  },
  ref,
) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const caretFollowerRef = useRef<ReturnType<typeof createElementCaretFollower> | null>(
    null,
  );
  const activeEditorRef = useRef<NonNullable<ReturnType<typeof useEditor>> | null>(
    null,
  );
  const callbacksRef = useRef({
    onChange,
    onFocusChange,
    onModEnter,
    onSelectionChange,
  });
  const lastEmittedMarkdownRef = useRef(value);
  const lastPlainTextRef = useRef(richDocumentToPlainText(markdownToRichDocument(value)));

  const getCaretFollower = () => {
    caretFollowerRef.current ??= createElementCaretFollower({
      getEditor: () =>
        editorHostRef.current?.querySelector<HTMLElement>(
          "[data-canvas-rich-editor-content]",
        ) ?? null,
      measureCaretOffset: () =>
        activeEditorRef.current
          ? measureRichEditorCaretOffset(activeEditorRef.current)
          : 0,
    });

    return caretFollowerRef.current;
  };

  useEffect(() => {
    callbacksRef.current = {
      onChange,
      onFocusChange,
      onModEnter,
      onSelectionChange,
    };
  }, [onChange, onFocusChange, onModEnter, onSelectionChange]);
  const placeholderExtension = useMemo(
    () =>
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
    [placeholder],
  );
  const editor = useEditor(
    {
      extensions: [...EDITOR_EXTENSIONS, placeholderExtension],
      content: markdownToRichDocument(value),
      editorProps: {
        attributes: {
          id,
          "aria-label": "Capturar",
          "data-canvas-rich-editor-content": "",
          "data-canvas-caret-follow-ratio": "0.7",
          class: cn(
            "vinema-canvas-editor vinema-rich-editor min-h-[1lh] w-full text-zinc-950 outline-none",
            className,
          ),
        },
        handleKeyDown(_view, event) {
          if (
            event.key === "Enter" &&
            (event.ctrlKey === true || event.metaKey === true)
          ) {
            event.preventDefault();
            callbacksRef.current.onModEnter();
            return true;
          }

          return false;
        },
      },
      immediatelyRender: false,
      onUpdate({ editor: currentEditor }) {
        activeEditorRef.current = currentEditor;
        const document = currentEditor.getJSON();
        const markdown = richDocumentToMarkdown(document);
        const plainText = richDocumentToPlainText(document);

        lastPlainTextRef.current = plainText;
        getCaretFollower().follow(true);

        if (markdown === lastEmittedMarkdownRef.current) {
          return;
        }

        lastEmittedMarkdownRef.current = markdown;
        callbacksRef.current.onChange({ markdown, plainText, document });
      },
      onSelectionUpdate({ editor: currentEditor }) {
        activeEditorRef.current = currentEditor;
        getCaretFollower().follow(false);
        callbacksRef.current.onSelectionChange(getSelectionSnapshot(currentEditor));
      },
      onFocus({ editor: currentEditor }) {
        activeEditorRef.current = currentEditor;
        callbacksRef.current.onFocusChange(true);
        callbacksRef.current.onSelectionChange(getSelectionSnapshot(currentEditor));
        getCaretFollower().follow(false);
      },
      onBlur() {
        callbacksRef.current.onSelectionChange(null);
      },
    },
    [placeholderExtension],
  );

  useEffect(() => {
    caretFollowerRef.current?.dispose();
    caretFollowerRef.current = null;
    activeEditorRef.current = editor;

    if (!editor) {
      return;
    }

    const viewport = editor.view.dom.closest("[data-canvas-scroll-viewport]");

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const follower = getCaretFollower();

    viewport.addEventListener("scroll", follower.handleScroll);

    return () => {
      viewport.removeEventListener("scroll", follower.handleScroll);
    };
  }, [editor]);

  useEffect(
    () => () => {
      caretFollowerRef.current?.dispose();
      caretFollowerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!editor || value === lastEmittedMarkdownRef.current) {
      return;
    }

    const document = value.trim() ? markdownToRichDocument(value) : createEmptyRichDocument();

    lastEmittedMarkdownRef.current = value;
    lastPlainTextRef.current = richDocumentToPlainText(document);
    editor.commands.setContent(document, { emitUpdate: false });
    callbacksRef.current.onSelectionChange(getSelectionSnapshot(editor));
  }, [editor, value]);

  useLayoutEffect(() => {
    if (!editor) {
      return;
    }

    Object.assign(editor.view.dom.style, getCanvasEditorStyle(preferences));
    editor.view.dom.setAttribute("placeholder", placeholder);
    editor.view.dom.setAttribute("aria-placeholder", placeholder);
  }, [editor, placeholder, preferences]);

  useEffect(() => {
    const host = editorHostRef.current;

    if (!editor || !host) {
      return;
    }

    const currentEditor = editor;

    function setMarkdown(event: Event) {
      const markdown =
        event instanceof CustomEvent && typeof event.detail?.markdown === "string"
          ? event.detail.markdown
          : null;

      if (markdown === null) {
        return;
      }

      const document = markdown.trim()
        ? markdownToRichDocument(markdown)
        : createEmptyRichDocument();
      const plainText = richDocumentToPlainText(document);

      lastEmittedMarkdownRef.current = markdown;
      lastPlainTextRef.current = plainText;
      currentEditor.commands.setContent(document, { emitUpdate: false });
      callbacksRef.current.onChange({ markdown, plainText, document });
    }

    function setSelection(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;

      if (
        typeof detail?.start !== "number" ||
        typeof detail?.end !== "number" ||
        detail.start >= detail.end
      ) {
        return;
      }

      currentEditor.commands.setTextSelection({
        from: detail.start + 1,
        to: detail.end + 1,
      });
      callbacksRef.current.onSelectionChange(getSelectionSnapshot(currentEditor));
    }

    host.addEventListener("vinema:set-rich-editor-markdown", setMarkdown);
    host.addEventListener("vinema:set-rich-editor-selection", setSelection);

    return () => {
      host.removeEventListener("vinema:set-rich-editor-markdown", setMarkdown);
      host.removeEventListener("vinema:set-rich-editor-selection", setSelection);
    };
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editor?.commands.focus(undefined, { scrollIntoView: false });
      },
      blur() {
        editor?.commands.blur();
      },
      getPlainText() {
        return editor ? richDocumentToPlainText(editor.getJSON()) : lastPlainTextRef.current;
      },
      getSelection() {
        return editor ? getSelectionSnapshot(editor) : null;
      },
      get element() {
        return editorHostRef.current;
      },
    }),
    [editor],
  );

  if (!editor) {
    return (
      <div
        className={cn(
          "vinema-canvas-editor vinema-rich-editor min-h-[1lh] w-full outline-none",
          className,
        )}
        data-canvas-rich-editor=""
      />
    );
  }

  return (
    <div
      ref={editorHostRef}
      className={cn(
        "relative min-h-[1lh] w-full",
        "vinema-canvas-editor vinema-rich-editor text-zinc-950",
        className,
      )}
      style={getCanvasEditorStyle(preferences) as CSSProperties}
      data-canvas-rich-editor=""
      data-canvas-rich-editor-host=""
      data-canvas-caret-follow-ratio="0.7"
    >
      <EditorContent
        className="w-full"
        editor={editor}
        data-canvas-rich-editor-content-host=""
      />
      {formatToolbarOpen ? (
        <RichFormatToolbar
          editor={editor}
          onClose={() => onFormatToolbarOpenChange(false)}
        />
      ) : null}
    </div>
  );
});
VinemaCanvasRichEditor.displayName = "VinemaCanvasRichEditor";

function RichFormatToolbar({
  editor,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  onClose: () => void;
}) {
  const [linkDraft, setLinkDraft] = useState("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkPopoverPosition, setLinkPopoverPosition] = useState({
    left: 16,
    top: 96,
  });
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const linkButtonRef = useRef<HTMLButtonElement | null>(null);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);

  function preserveSelection(event: ReactMouseEvent | ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function applyLink() {
    const sanitized = sanitizeRichTextUrl(linkDraft);

    if (!sanitized) {
      focusEditor(editor).unsetLink().run();
      setLinkDraft("");
      setLinkPopoverOpen(false);
      return;
    }

    focusEditor(editor).extendMarkRange("link").setLink({ href: sanitized }).run();
    setLinkDraft("");
    setLinkPopoverOpen(false);
  }

  function openLinkPopover() {
    const href = editor.getAttributes("link").href;

    setLinkDraft(typeof href === "string" ? href : "");
    setLinkPopoverOpen((open) => !open);
  }

  function removeLink() {
    focusEditor(editor).unsetLink().run();
    setLinkDraft("");
    setLinkPopoverOpen(false);
  }

  useLayoutEffect(() => {
    function updateCanvasSafeArea() {
      const toolbar = toolbarRef.current;
      const viewport = document.querySelector<HTMLElement>(
        "[data-canvas-scroll-viewport]",
      );

      if (!toolbar || !viewport) {
        return;
      }

      const toolbarRect = toolbar.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const safeTop = Math.max(
        0,
        toolbarRect.bottom - viewportRect.top + CANVAS_FORMAT_TOOLBAR_SAFE_GAP,
      );

      viewport.style.setProperty(
        "--vinema-canvas-format-toolbar-safe-top",
        `${safeTop}px`,
      );
    }

    updateCanvasSafeArea();
    window.addEventListener("resize", updateCanvasSafeArea);
    window.addEventListener("scroll", updateCanvasSafeArea, true);

    const toolbar = toolbarRef.current;
    const resizeObserver =
      typeof ResizeObserver === "undefined" || !toolbar
        ? null
        : new ResizeObserver(updateCanvasSafeArea);

    if (resizeObserver && toolbar) {
      resizeObserver.observe(toolbar);
    }

    return () => {
      window.removeEventListener("resize", updateCanvasSafeArea);
      window.removeEventListener("scroll", updateCanvasSafeArea, true);
      resizeObserver?.disconnect();

      const viewport = document.querySelector<HTMLElement>(
        "[data-canvas-scroll-viewport]",
      );

      viewport?.style.removeProperty("--vinema-canvas-format-toolbar-safe-top");
    };
  }, []);

  useLayoutEffect(() => {
    if (!linkPopoverOpen) {
      return;
    }

    function updatePosition() {
      const buttonRect = linkButtonRef.current?.getBoundingClientRect();

      if (!buttonRect) {
        return;
      }

      const safeMargin = 12;
      const popoverWidth = Math.min(280, window.innerWidth - safeMargin * 2);
      const preferredLeft = buttonRect.left + buttonRect.width / 2 - popoverWidth / 2;
      const left = Math.min(
        Math.max(safeMargin, preferredLeft),
        Math.max(safeMargin, window.innerWidth - popoverWidth - safeMargin),
      );
      const top = Math.min(
        buttonRect.bottom + 8,
        Math.max(safeMargin, window.innerHeight - 132),
      );

      setLinkPopoverPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [linkPopoverOpen]);

  useEffect(() => {
    if (!linkPopoverOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        linkButtonRef.current?.contains(target) ||
        linkPopoverRef.current?.contains(target)
      ) {
        return;
      }

      setLinkPopoverOpen(false);
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer, true);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [linkPopoverOpen]);

  return (
    <>
      <div
        ref={toolbarRef}
        className="fixed left-1/2 top-[4.25rem] z-[70] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full border border-zinc-200/80 bg-white/95 px-1.5 py-1 text-zinc-700 shadow-md backdrop-blur-sm max-sm:top-[3.75rem]"
        role="toolbar"
        aria-label="Formato"
        data-canvas-format-toolbar=""
        data-canvas-format-toolbar-safe-gap={CANVAS_FORMAT_TOOLBAR_SAFE_GAP}
        data-canvas-format-toolbar-layout="single-row"
        data-canvas-format-toolbar-width="content"
        data-canvas-format-toolbar-scroll="horizontal"
        onPointerDown={preserveSelection}
        onMouseDown={preserveSelection}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setLinkPopoverOpen(false);
            onClose();
            editor.commands.focus(undefined, { scrollIntoView: false });
          }
        }}
      >
        <ToolbarButton label="Normal" active={editor.isActive("paragraph")} onClick={() => focusEditor(editor).setParagraph().run()}>
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="H1" active={editor.isActive("heading", { level: 1 })} onClick={() => focusEditor(editor).toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => focusEditor(editor).toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="H3" active={editor.isActive("heading", { level: 3 })} onClick={() => focusEditor(editor).toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label="Negrita" active={editor.isActive("bold")} onClick={() => focusEditor(editor).toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Cursiva" active={editor.isActive("italic")} onClick={() => focusEditor(editor).toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Codigo inline" active={editor.isActive("code")} onClick={() => focusEditor(editor).toggleCode().run()}>
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label="Lista con vinetas" active={editor.isActive("bulletList")} onClick={() => focusEditor(editor).toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => focusEditor(editor).toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Tarea" active={editor.isActive("taskList")} onClick={() => focusEditor(editor).toggleTaskList().run()}>
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Cita" active={editor.isActive("blockquote")} onClick={() => focusEditor(editor).toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Separador" onClick={() => focusEditor(editor).setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton
          label="Enlace"
          active={editor.isActive("link") || linkPopoverOpen}
          buttonRef={linkButtonRef}
          onClick={openLinkPopover}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label="Cerrar barra de formato" onClick={onClose}>
          <X className="h-4 w-4" />
        </ToolbarButton>
      </div>
      {linkPopoverOpen ? (
        <div
          ref={linkPopoverRef}
          className="fixed z-[75] w-[min(17.5rem,calc(100vw-1.5rem))] rounded-lg border border-zinc-200/80 bg-white/95 p-2 text-zinc-700 shadow-lg backdrop-blur-sm"
          style={{
            left: linkPopoverPosition.left,
            top: linkPopoverPosition.top,
          }}
          role="dialog"
          aria-label="Editar enlace"
          data-canvas-link-popover=""
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setLinkPopoverOpen(false);
              editor.commands.focus(undefined, { scrollIntoView: false });
            }
          }}
        >
          <label className="flex min-w-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 focus-within:ring-2 focus-within:ring-zinc-950">
            <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">URL</span>
            <input
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              value={linkDraft}
              placeholder="URL"
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <div className="mt-2 flex items-center justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={removeLink}>
              Quitar enlace
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={applyLink}>
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ToolbarButton({
  label,
  active = false,
  buttonRef,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  onClick: ButtonProps["onClick"];
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      ref={buttonRef}
      className={cn(
        "h-7 w-7 shrink-0 rounded-full text-zinc-600 focus-visible:ring-2",
        active && "bg-zinc-100 text-zinc-950",
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function focusEditor(editor: NonNullable<ReturnType<typeof useEditor>>) {
  return editor.chain().focus(undefined, { scrollIntoView: false });
}

function measureRichEditorCaretOffset(
  editor: NonNullable<ReturnType<typeof useEditor>>,
) {
  try {
    const caretRect = editor.view.coordsAtPos(editor.state.selection.from);
    const editorRect = editor.view.dom.getBoundingClientRect();

    return caretRect.top - editorRect.top;
  } catch {
    return 0;
  }
}

function ToolbarSeparator() {
  return (
    <span
      className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200"
      aria-hidden="true"
      data-canvas-format-separator=""
    />
  );
}

function getSelectionSnapshot(
  editor: NonNullable<ReturnType<typeof useEditor>>,
): RichTextSelectionSnapshot | null {
  const { from, to, empty } = editor.state.selection;

  if (empty || from === to) {
    return null;
  }

  const text = editor.state.doc.textBetween(from, to, "\n", "\n").trim();

  if (!text) {
    return null;
  }

  return {
    text,
    start: from,
    end: to,
    selectionRect: getEditorSelectionRect(editor, from, to),
  };
}

function getEditorSelectionRect(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  from: number,
  to: number,
): DOMRectReadOnly {
  let start: { left: number; right: number; top: number; bottom: number };
  let end: { left: number; right: number; top: number; bottom: number };

  try {
    start = editor.view.coordsAtPos(from);
    end = editor.view.coordsAtPos(to);
  } catch {
    const fallback = editor.view.dom.getBoundingClientRect();

    return new DOMRect(
      fallback.left,
      fallback.top,
      Math.max(1, fallback.width),
      Math.max(1, fallback.height),
    );
  }
  const left = Math.min(start.left, end.left);
  const top = Math.min(start.top, end.top);
  const right = Math.max(start.right, end.right);
  const bottom = Math.max(start.bottom, end.bottom);

  return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
}
