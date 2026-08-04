"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAuthFormError,
  validateEmail,
  validatePassword,
} from "@/features/auth/auth-form-utils";
import { useAuth } from "@/features/auth/auth-provider";
import { VinemaBrandMark } from "@/components/brand/vinema-brand";

export function LoginClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading, state, login } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

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
    try {
      await login({ email, password });
      router.replace("/");
    } catch (submitError) {
      setError(getAuthFormError(submitError));
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
    </AuthScreen>
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
