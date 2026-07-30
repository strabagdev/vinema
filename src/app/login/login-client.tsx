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

export function LoginClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();
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

  return (
    <AuthScreen
      title="Iniciar sesion"
      description="Entra a tu memoria local de Vinema."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label htmlFor="login-email" className="text-sm font-medium text-zinc-800">
            Email
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
        {error ? (
          <p className="text-sm text-red-700" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Entrando..." : "Iniciar sesion"}
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
    <main className="flex min-h-screen w-full items-center justify-center bg-zinc-50 px-5 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white">
            V
          </span>
          <span className="text-lg font-semibold text-zinc-900">Vinema</span>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-950">{title}</h1>
            <p className="text-sm leading-6 text-zinc-500">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
