import { AuthClientError } from "@/features/auth/auth-client";
import { PublicApiUrlError } from "@/features/auth/public-api-url";

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(value: string) {
  const email = value.trim();
  if (!email) {
    return "Ingresa tu email.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Ingresa un email valido.";
  }

  return null;
}

export function validatePassword(value: string) {
  if (!value) {
    return "Ingresa tu contrasena.";
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  return null;
}

export function getAuthFormError(error: unknown) {
  if (error instanceof PublicApiUrlError) {
    return "La API de Vinema no esta configurada.";
  }

  if (!(error instanceof AuthClientError)) {
    return "No pudimos completar la accion. Intentalo nuevamente.";
  }

  switch (error.code) {
    case "VALIDATION_ERROR":
      return "Revisa los datos ingresados.";
    case "INVALID_CREDENTIALS":
      return "Email o contrasena incorrectos.";
    case "EMAIL_ALREADY_EXISTS":
      return "Ese email ya esta registrado.";
    case "DEVICE_REVOKED":
      return "Este dispositivo ya no tiene acceso. Vuelve a iniciar sesion desde un dispositivo autorizado.";
    case "NETWORK_ERROR":
      return "No se pudo conectar con la API.";
    case "SERVER_ERROR":
      return "La API no esta disponible en este momento.";
    default:
      return "No pudimos completar la accion. Intentalo nuevamente.";
  }
}
