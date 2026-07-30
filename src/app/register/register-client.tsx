"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthScreen } from "@/app/login/login-client";
import {
  getAuthFormError,
  validateEmail,
  validatePassword,
} from "@/features/auth/auth-form-utils";
import { useAuth } from "@/features/auth/auth-provider";

export function RegisterClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading, register } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
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
    try {
      await register({
        displayName: displayName.trim() || undefined,
        email,
        password,
      });
      router.replace("/");
    } catch (submitError) {
      setError(getAuthFormError(submitError));
    }
  }

  return (
    <AuthScreen
      title="Crear cuenta"
      description="Crea tu identidad minima para sincronizar Vinema."
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
            Email
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
        {error ? (
          <p className="text-sm text-red-700" role="alert" aria-live="polite">
            {error}
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
