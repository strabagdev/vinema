# Vinema

Vinema es una aplicacion personal de conocimiento y notas, local-first y
offline-first. Esta fundacion tecnica deja una misma base de codigo para web,
PWA instalable y escritorio mediante Tauri 2.

## Stack

- Next.js App Router
- React
- TypeScript estricto
- Tailwind CSS
- shadcn/ui
- IndexedDB con fallback a localStorage
- Tauri 2

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:run
npm run tauri:dev
npm run tauri:build
```

## Desarrollo

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## Escritorio

```bash
npm run tauri:dev
```

Tauri consume el servidor local en desarrollo y empaqueta `out/` en build.

## Alcance actual

- Shell responsive con sidebar, header y navegacion movil.
- Rutas `/`, `/inbox` y `/notes`.
- Dispositivo persistente con `getOrCreateDevice()`.
- `StorageAdapter`, `IndexedDbAdapter` y `LocalStorageAdapter`.
- PWA con manifest, icono temporal y service worker.

Fuera de alcance: CRUD, markdown, tags, proyectos, autenticacion, PostgreSQL,
Prisma, Railway, realtime, sincronizacion e IA.
