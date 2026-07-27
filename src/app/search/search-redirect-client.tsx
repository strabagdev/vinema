"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getKnowledgeBasePath } from "@/features/recovery/recovery-routes";

export function SearchRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  useEffect(() => {
    router.replace(getKnowledgeBasePath(query));
  }, [query, router]);

  return null;
}
