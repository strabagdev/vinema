import { Suspense } from "react";
import { SearchRedirectClient } from "@/app/search/search-redirect-client";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchRedirectClient />
    </Suspense>
  );
}
