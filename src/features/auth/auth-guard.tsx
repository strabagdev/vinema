"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, state } = useAuth();
  const publicRoute = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated && !publicRoute) {
      redirect(router, "/login");
      return;
    }

    if (isAuthenticated && publicRoute) {
      redirect(router, "/");
    }
  }, [isAuthenticated, isLoading, publicRoute, router]);

  if (publicRoute && !isLoading && !isAuthenticated) {
    return <>{children}</>;
  }

  if (isLoading || (publicRoute && isAuthenticated) || !isAuthenticated || state.status === "ERROR") {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-6 text-sm text-zinc-500">
        {state.status === "RESTORING" ? "Restaurando sesion..." : "Preparando Vinema..."}
      </div>
    );
  }

  return <>{children}</>;
}

export function isPublicAuthRoute(pathname: string) {
  return PUBLIC_ROUTES.has(pathname);
}

function redirect(
  router: ReturnType<typeof useRouter>,
  path: string,
) {
  if (typeof router.replace === "function") {
    router.replace(path);
    return;
  }

  router.push(path);
}
