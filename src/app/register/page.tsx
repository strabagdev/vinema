import type { Metadata } from "next";
import { RegisterClient } from "@/app/register/register-client";

export const metadata: Metadata = {
  title: "Crear cuenta - Vinema",
};

export default function RegisterPage() {
  return <RegisterClient />;
}
