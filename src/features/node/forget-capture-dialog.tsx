"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCapturePreview } from "@/features/node/node-display";

export const FORGET_CAPTURE_CONFIRMATION_PHRASE = "olvidar para siempre";

export function ForgetCaptureDialog({
  open,
  captureContent,
  processing = false,
  error = null,
  inline = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  captureContent: string;
  processing?: boolean;
  error?: string | null;
  inline?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [phrase, setPhrase] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canConfirm = phrase === FORGET_CAPTURE_CONFIRMATION_PHRASE;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (inline) {
      inputRef.current?.focus();
    }
  }, [inline, open]);

  const content = (
    <ForgetCaptureContent
      captureContent={captureContent}
      processing={processing}
      error={error}
      phrase={phrase}
      canConfirm={canConfirm}
      inputRef={inputRef}
      title={<Dialog.Title className="text-lg font-semibold text-zinc-950">Olvidar captura</Dialog.Title>}
      description={
        <Dialog.Description className="text-sm leading-6 text-zinc-600">
          Esta captura dejara de aparecer en Memoria, busqueda, sugerencias
          y navegacion normal. El cambio se sincronizara entre tus
          dispositivos.
        </Dialog.Description>
      }
      onPhraseChange={setPhrase}
      onCancel={() => {
        setPhrase("");
        onOpenChange(false);
      }}
      onConfirm={() => {
        setPhrase("");
        return onConfirm();
      }}
    />
  );

  if (inline) {
    if (!open) {
      return null;
    }

    return (
      <div
        className="absolute inset-0 z-[30] flex items-center justify-center bg-zinc-950/25 p-4 backdrop-blur-sm"
        role="presentation"
        data-forget-capture-inline-layer=""
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !processing) {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="forget-capture-title"
          aria-describedby="forget-capture-description"
          className="w-[min(calc(100vw-2rem),30rem)] rounded-lg border border-zinc-200 bg-white p-5 shadow-xl focus:outline-none"
        >
          <ForgetCaptureContent
            captureContent={captureContent}
            processing={processing}
            error={error}
            phrase={phrase}
            canConfirm={canConfirm}
            inputRef={inputRef}
            title={
              <h2
                id="forget-capture-title"
                className="text-lg font-semibold text-zinc-950"
              >
                Olvidar captura
              </h2>
            }
            description={
              <p
                id="forget-capture-description"
                className="text-sm leading-6 text-zinc-600"
              >
                Esta captura dejara de aparecer en Memoria, busqueda,
                sugerencias y navegacion normal. El cambio se sincronizara entre
                tus dispositivos.
              </p>
            }
            onPhraseChange={setPhrase}
            onCancel={() => {
              setPhrase("");
              onOpenChange(false);
            }}
            onConfirm={() => {
              setPhrase("");
              return onConfirm();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPhrase("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-zinc-950/25 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[81] w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white p-5 shadow-xl focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            setPhrase("");
            inputRef.current?.focus();
          }}
        >
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ForgetCaptureContent({
  captureContent,
  processing,
  error,
  phrase,
  canConfirm,
  inputRef,
  title,
  description,
  onPhraseChange,
  onCancel,
  onConfirm,
}: {
  captureContent: string;
  processing: boolean;
  error: string | null;
  phrase: string;
  canConfirm: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  title: ReactNode;
  description: ReactNode;
  onPhraseChange: (phrase: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <>
      <div className="space-y-2">
        {title}
        {description}
      </div>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
        {getCapturePreview(captureContent, { maxLength: 180 }) || "Sin contenido"}
      </div>

      <div className="mt-4 space-y-2">
        <label
          htmlFor="forget-capture-confirmation"
          className="block text-sm font-medium text-zinc-800"
        >
          Escribe &quot;{FORGET_CAPTURE_CONFIRMATION_PHRASE}&quot; para confirmar.
        </label>
        <Input
          id="forget-capture-confirmation"
          ref={inputRef}
          value={phrase}
          onChange={(event) => onPhraseChange(event.target.value)}
          disabled={processing}
          aria-describedby={error ? "forget-capture-error" : undefined}
        />
      </div>

      {error ? (
        <p
          id="forget-capture-error"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={processing}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!canConfirm || processing}
          onClick={() => void onConfirm()}
          className="bg-red-700 text-white hover:bg-red-800"
        >
          {processing ? "Olvidando..." : "Olvidar captura"}
        </Button>
      </div>
    </>
  );
}
