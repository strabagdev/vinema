"use client";

import { Archive, MoreHorizontal } from "lucide-react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type MenuPosition = {
  top: number;
  left: number;
};

export function CaptureActionsMenu({
  onForget,
  buttonClassName,
  embedded = false,
}: {
  onForget: () => void;
  buttonClassName?: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (
        target &&
        (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const container = embedded
      ? event.currentTarget.closest<HTMLElement>("[data-application-workspace-dialog]") ??
        event.currentTarget.parentElement
      : document.body;

    setPortalContainer(container);

    if (embedded && container) {
      const containerRect = container.getBoundingClientRect();
      setPosition({
        top: rect.bottom - containerRect.top + 6,
        left: Math.max(8, rect.right - containerRect.left - 176),
      });
    } else {
      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - 176),
      });
    }

    setOpen((current) => !current);
  }

  function handleForget(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    onForget();
  }

  function stopMenuPointerEvent(
    event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
  ) {
    event.stopPropagation();
  }

  function handleTriggerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  function handleForgetPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    stopMenuPointerEvent(event);
  }

  function handleForgetMouseDown(event: ReactMouseEvent<HTMLButtonElement>) {
    stopMenuPointerEvent(event);
  }

  const menu = open && position ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label="Acciones de captura"
      data-card-interactive=""
      className={
        embedded
          ? "absolute z-[90] min-w-44 rounded-md border border-zinc-200 bg-white p-1 text-zinc-950 shadow-md"
          : "fixed z-[90] min-w-44 rounded-md border border-zinc-200 bg-white p-1 text-zinc-950 shadow-md"
      }
      style={{ top: position.top, left: position.left }}
      onPointerDown={stopMenuPointerEvent}
      onMouseDown={stopMenuPointerEvent}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        data-card-interactive=""
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 outline-none transition-colors hover:bg-red-50 focus:bg-red-50 focus:text-red-800"
        onPointerDown={handleForgetPointerDown}
        onMouseDown={handleForgetMouseDown}
        onClick={handleForget}
      >
        <Archive className="h-4 w-4" />
        Olvidar
      </button>
    </div>
  ) : null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClassName ?? "h-8 w-8 shrink-0"}
        aria-label="Abrir acciones de captura"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-card-interactive=""
        onClick={toggleMenu}
        onPointerDown={handleTriggerPointerDown}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {menu && portalContainer ? createPortal(menu, portalContainer) : null}
    </>
  );
}
