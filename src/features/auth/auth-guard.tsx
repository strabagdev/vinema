"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  VinemaInitialLoading,
  type VinemaInitialLoadingStage,
} from "@/components/app-shell/vinema-initial-loading";
import { useAuth } from "@/features/auth/auth-provider";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { authStatus, isAuthenticated, isLoading, syncState } = useAuth();
  const publicRoute = PUBLIC_ROUTES.has(pathname);
  const blocking = isLoading || (publicRoute && isAuthenticated) || !isAuthenticated;
  const stage: VinemaInitialLoadingStage =
    authStatus === "AUTHENTICATED_OFFLINE" || syncState.connectivity === "OFFLINE"
      ? "offline"
      : "auth";

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

  return (
    <VinemaInitialLoading active={blocking} stage={stage}>
      {blocking ? null : children}
    </VinemaInitialLoading>
  );
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
