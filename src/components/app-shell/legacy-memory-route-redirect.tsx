"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function LegacyMemoryRouteRedirect({ target }: { target: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    router.replace(query ? `${target}?${query}` : target);
  }, [query, router, target]);

  return null;
}
