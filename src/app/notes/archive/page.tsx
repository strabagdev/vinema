import { Suspense } from "react";
import { LegacyMemoryRouteRedirect } from "@/components/app-shell/legacy-memory-route-redirect";

export default function ArchivePage() {
  return (
    <Suspense fallback={null}>
      <LegacyMemoryRouteRedirect target="/memory/archive" />
    </Suspense>
  );
}
