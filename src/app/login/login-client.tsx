"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  LocalKnowledgeIncorporationOffer,
} from "@/features/auth/local-knowledge-incorporation";
import { LocalKnowledgeIncorporationError } from "@/features/auth/local-knowledge-incorporation";
import {
  getAuthFormError,
  validateEmail,
  validatePassword,
} from "@/features/auth/auth-form-utils";
import { useAuth } from "@/features/auth/auth-provider";
import { VinemaBrandMark } from "@/components/brand/vinema-brand";

export function LoginClient() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading,
    state,
    login,
    enterLocalMode,
    checkLocalKnowledgeIncorporation,
    incorporateLocalKnowledge,
  } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [postAuthStatus, setPostAuthStatus] = useState<
    "idle" | "checking" | "offered" | "migrating" | "done"
  >("idle");
  const [localKnowledgeOffer, setLocalKnowledgeOffer] =
    useState<LocalKnowledgeIncorporationOffer | null>(null);
  const [localKnowledgeError, setLocalKnowledgeError] = useState<string | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isAuthenticated && postAuthStatus === "idle") {
      router.replace("/");
    }
  }, [isAuthenticated, postAuthStatus, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    const validationError = validateEmail(email) ?? validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPostAuthStatus("checking");
    try {
      await login({ email, password });
      const offer = await checkLocalKnowledgeIncorporation();
      if (offer) {
        setLocalKnowledgeOffer(offer);
        setPostAuthStatus("offered");
        return;
      }

      setPostAuthStatus("idle");
      router.replace("/");
    } catch (submitError) {
      setPostAuthStatus("idle");
      setError(getAuthFormError(submitError));
    }
  }

  async function handleLocalMode() {
    if (isLoading) {
      return;
    }

    setError(null);
    try {
      await enterLocalMode();
      router.replace("/");
    } catch {
      setError("No se pudo iniciar el modo local.");
    }
  }

  function handleSkipLocalKnowledge() {
    setLocalKnowledgeOffer(null);
    setLocalKnowledgeError(null);
    setPostAuthStatus("idle");
    router.replace("/");
  }

  async function handleIncorporateLocalKnowledge() {
    setLocalKnowledgeError(null);
    setPostAuthStatus("migrating");
    try {
      await incorporateLocalKnowledge();
      setLocalKnowledgeOffer(null);
      setPostAuthStatus("done");
      window.setTimeout(() => {
        setPostAuthStatus("idle");
        router.replace("/");
      }, 350);
    } catch (incorporationError) {
      setPostAuthStatus("offered");
      setLocalKnowledgeError(getLocalKnowledgeIncorporationError(incorporationError));
    }
  }

  if (state.status === "CHECKING_LOCAL_SESSION" || state.status === "VALIDATING_REMOTE") {
    return (
      <AuthScreen
        title="Restaurando sesion"
        description="Estamos comprobando tu sesion local."
      >
        <p className="text-sm text-zinc-500">Restaurando sesion...</p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Inicia sesion"
      description="Accede a tu memoria."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label htmlFor="login-email" className="text-sm font-medium text-zinc-800">
            Correo electronico
          </label>
          <Input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="text-sm font-medium text-zinc-800">
            Contrasena
          </label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        {error ?? state.error?.message ? (
          <p className="text-sm text-red-700" role="alert" aria-live="polite">
            {error ?? state.error?.message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        <span>No tienes cuenta? </span>
        <Link className="font-medium text-zinc-900 underline-offset-4 hover:underline" href="/register">
          Crear cuenta
        </Link>
      </p>
      <div className="mt-6 border-t border-zinc-200 pt-5 text-center">
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={isLoading}
          onClick={() => void handleLocalMode()}
        >
          Usar sin cuenta
        </Button>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Los datos permaneceran solo en este dispositivo y no se sincronizaran.
        </p>
      </div>
      <LocalKnowledgeIncorporationDialog
        offer={localKnowledgeOffer}
        busy={postAuthStatus === "migrating"}
        success={postAuthStatus === "done"}
        error={localKnowledgeError}
        onSkip={handleSkipLocalKnowledge}
        onIncorporate={() => void handleIncorporateLocalKnowledge()}
      />
    </AuthScreen>
  );
}

export function LocalKnowledgeIncorporationDialog({
  offer,
  busy,
  success,
  error,
  onSkip,
  onIncorporate,
}: {
  offer: LocalKnowledgeIncorporationOffer | null;
  busy: boolean;
  success: boolean;
  error: string | null;
  onSkip: () => void;
  onIncorporate: () => void;
}) {
  if (!offer && !success) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/25 px-5"
      role="presentation"
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="local-knowledge-title"
        aria-describedby="local-knowledge-description"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="space-y-3">
          <h2 id="local-knowledge-title" className="text-lg font-semibold text-zinc-950">
            Tienes conocimiento guardado en este dispositivo
          </h2>
          <p
            id="local-knowledge-description"
            className="text-sm leading-6 text-zinc-600"
          >
            Puedes incorporarlo a tu cuenta para sincronizarlo con tus otros dispositivos.
          </p>
          {busy ? (
            <p className="text-sm font-medium text-zinc-800" aria-live="polite">
              Incorporando conocimiento...
            </p>
          ) : null}
          {success ? (
            <p className="text-sm font-medium text-zinc-800" aria-live="polite">
              Conocimiento incorporado
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {success ? null : (
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onSkip}
          >
            No por ahora
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={onIncorporate}
          >
            {busy ? "Incorporando..." : "Incorporar a mi cuenta"}
          </Button>
        </div>
        )}
      </section>
    </div>
  );
}

export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-zinc-50 px-5 py-10 sm:px-6">
      <section
        className="flex w-full max-w-[25rem] flex-col items-stretch"
        data-auth-screen=""
      >
        <div className="mb-9 flex justify-center text-zinc-950 sm:mb-10">
          <VinemaBrandMark asset="wordmark" className="h-8 w-48 sm:w-52" />
        </div>
        <div className="space-y-6" data-auth-flow="">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-medium text-zinc-950">{title}</h1>
            <p className="text-sm leading-6 text-zinc-500">{description}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}

export function getLocalKnowledgeIncorporationError(error: unknown) {
  if (error instanceof LocalKnowledgeIncorporationError) {
    const code = error.code === "REMOTE_SYNC_NOT_CONFIRMED"
      ? "INCORPORATION_SYNC_FAILED"
      : error.code;
    return `No se pudo incorporar ahora. Tus datos locales siguen guardados. (${code})`;
  }

  return "No se pudo incorporar ahora. Tus datos locales siguen guardados.";
}
