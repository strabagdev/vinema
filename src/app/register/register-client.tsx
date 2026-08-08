"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AuthScreen,
  getLocalKnowledgeIncorporationError,
  LocalKnowledgeIncorporationDialog,
} from "@/app/login/login-client";
import type {
  LocalKnowledgeIncorporationOffer,
} from "@/features/auth/local-knowledge-incorporation";
import {
  getAuthFormError,
  validateEmail,
  validatePassword,
} from "@/features/auth/auth-form-utils";
import { useAuth } from "@/features/auth/auth-provider";

export function RegisterClient() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading,
    state,
    register,
    checkLocalKnowledgeIncorporation,
    incorporateLocalKnowledge,
  } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [postAuthStatus, setPostAuthStatus] = useState<
    "idle" | "checking" | "offered" | "migrating" | "done"
  >("idle");
  const [localKnowledgeOffer, setLocalKnowledgeOffer] =
    useState<LocalKnowledgeIncorporationOffer | null>(null);
  const [localKnowledgeError, setLocalKnowledgeError] = useState<string | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
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

    const validationError = validateRegistration({
      displayName,
      email,
      password,
      confirmPassword,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPostAuthStatus("checking");
    try {
      await register({
        displayName: displayName.trim() || undefined,
        email,
        password,
      });
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
      title="Crear cuenta"
      description="Prepara tu memoria para sincronizar."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label htmlFor="register-name" className="text-sm font-medium text-zinc-800">
            Nombre
          </label>
          <Input
            ref={nameRef}
            id="register-name"
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="register-email" className="text-sm font-medium text-zinc-800">
            Correo electronico
          </label>
          <Input
            id="register-email"
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
          <label htmlFor="register-password" className="text-sm font-medium text-zinc-800">
            Contrasena
          </label>
          <Input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="register-confirm-password" className="text-sm font-medium text-zinc-800">
            Confirmar contrasena
          </label>
          <Input
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
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
          {isLoading ? "Creando..." : "Crear cuenta"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        <span>Ya tienes cuenta? </span>
        <Link className="font-medium text-zinc-900 underline-offset-4 hover:underline" href="/login">
          Iniciar sesion
        </Link>
      </p>
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

function validateRegistration({
  displayName,
  email,
  password,
  confirmPassword,
}: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  if (!displayName.trim()) {
    return "Ingresa tu nombre.";
  }

  const fieldError = validateEmail(email) ?? validatePassword(password);
  if (fieldError) {
    return fieldError;
  }

  if (password !== confirmPassword) {
    return "Las contrasenas no coinciden.";
  }

  return null;
}
