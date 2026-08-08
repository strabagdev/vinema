# VIN-002 - Fundacion tecnica

Este paquete deja Vinema ejecutable como web, PWA instalable y aplicacion de
escritorio mediante Tauri 2.

## Decisiones

- Next.js App Router con TypeScript estricto y `src/`.
- `output: "export"` para que Tauri empaquete assets estaticos desde `out/`.
- `npm run build` debe regenerar `out/`; Tauri no consume `.next` en
  produccion.
- shadcn/ui estilo `new-york`, base `zinc` y variables CSS.
- Componentes instalados/creados: Button, Input, Tooltip, Separator,
  DropdownMenu, Sheet y Badge.
- IndexedDB es el almacenamiento preferido en navegador; localStorage queda como
  fallback.
- SQLite queda preparado conceptualmente para escritorio, sin implementarse.
- La deteccion de plataforma vive exclusivamente en
  `src/infrastructure/platform/detect-platform.ts`.

## PWA

La app incluye `manifest.ts`, icono temporal y `public/sw.js`. El service worker
cachea el shell y permite abrir las rutas base tras la primera carga.

## Tauri

Configuracion principal:

- Producto: Vinema.
- Bundle identifier: `com.vinema.app`.
- Frontend empaquetado: `../out` segun `src-tauri/tauri.conf.json`.
- Ventana: 1100x720.
- Minimo: 900x620.
- Sin SQLite, AutoUpdate, tray ni plugins adicionales.
- Windows debe compilarse desde Windows nativo con Rust/MSVC/WebView2. WSL se
  puede usar para validar el build Linux y que Tauri encuentre `../out`, pero no
  para producir el `.exe` o instalador Windows.

## Validaciones esperadas

Ejecutar:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run tauri:dev
```
