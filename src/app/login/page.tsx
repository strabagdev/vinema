import type { Metadata } from "next";
import { LoginClient } from "@/app/login/login-client";

export const metadata: Metadata = {
  title: "Iniciar sesion - Vinema",
};

export default function LoginPage() {
  return <LoginClient />;
}
