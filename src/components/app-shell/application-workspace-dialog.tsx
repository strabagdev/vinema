"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/cn";

export function ApplicationWorkspaceDialog({
  open,
  title,
  description,
  hideHeader = false,
  returnFocusRef,
  onBack,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  hideHeader?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onBack?: () => void;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const descriptionId = description
    ? `application-workspace-dialog-${normalizeId(title)}-description`
    : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-zinc-950/20" />
        <Dialog.Content
          aria-label={title}
          aria-describedby={descriptionId}
          data-application-workspace-dialog=""
          className={cn(
            "fixed left-1/2 top-1/2 z-[71] flex h-[min(90dvh,calc(100dvh-48px))] w-[min(96vw,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none",
            "sm:w-[min(1400px,calc(100vw-64px))] sm:rounded-2xl",
          )}
          onCloseAutoFocus={(event) => {
            const returnFocusTarget = returnFocusRef?.current;
            if (!returnFocusTarget) {
              return;
            }

            event.preventDefault();
            returnFocusTarget.focus();
          }}
        >
          {hideHeader ? (
            <>
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description id={descriptionId} className="sr-only">
                  {description}
                </Dialog.Description>
              ) : null}
            </>
          ) : (
            <header className="flex min-h-[56px] shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
              {onBack ? (
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded-md p-2 text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                  aria-label="Volver"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-lg font-semibold text-zinc-950">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description
                    id={descriptionId}
                    className="sr-only"
                  >
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-2 text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                  aria-label={`Cerrar ${title}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function normalizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
