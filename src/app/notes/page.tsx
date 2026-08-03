import { Suspense } from "react";
import { LegacyMemoryRouteRedirect } from "@/components/app-shell/legacy-memory-route-redirect";

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <LegacyMemoryRouteRedirect target="/memory" />
    </Suspense>
  );
}
