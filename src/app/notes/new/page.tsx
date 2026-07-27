import { LegacyRouteRedirect } from "@/components/app-shell/legacy-route-redirect";

export default function NewNotePage() {
  return (
    <LegacyRouteRedirect
      heading="Inicio"
      message="La incorporacion de contenido ahora empieza directamente escribiendo."
    />
  );
}
