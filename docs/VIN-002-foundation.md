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
- Vinema puede iniciar en modo local sin cuenta. Ese modo usa IndexedDB,
  conserva un workspace local persistente y no requiere API ni sincronizacion.
- La incorporacion de conocimiento local a una cuenta existe solo como accion
  explicita posterior a login/registro y nunca borra datos antes de verificar la
  sync remota.
- SQLite queda preparado conceptualmente para escritorio, sin implementarse.
- La deteccion de plataforma vive exclusivamente en
  `src/infrastructure/platform/detect-platform.ts`.

## PWA

La app incluye `manifest.ts`, icono temporal y `public/sw.js`. El service worker
cachea el shell y permite abrir las rutas base tras la primera carga.

El modo local sin cuenta permite usar la experiencia principal desde el primer
uso en PWA, navegador o Tauri. Los datos permanecen en este dispositivo hasta
que el usuario decida incorporarlos a una cuenta despues de login o registro.
Si elige `No por ahora`, el espacio local queda separado e intacto.

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
