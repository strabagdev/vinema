# Railway

## Dominios

- Web: `https://vinema-web.up.railway.app`
- API: `https://vinema-api.up.railway.app`

## vinema-web

Build:

```bash
npm run db:generate && npm run build
```

Start:

```bash
npm run start -- --hostname 0.0.0.0 --port $PORT
```

Target Port:

```text
8080
```

Variables:

```env
NEXT_PUBLIC_API_URL=https://vinema-api.up.railway.app
```

No configurar `VINEMA_SYNC_API_KEY` como variable publica del cliente web. Si la
web necesita consumir sincronizacion desde el navegador, debe hacerlo mediante un
canal server-side autenticado que no exponga la clave al cliente. En el estado
actual, la UI local de Vinema persiste en IndexedDB y no ejecuta sincronizacion
remota automatica desde el navegador.

`NEXT_PUBLIC_API_URL` debe estar configurada en `vinema-web` durante el build.
Cambiarla requiere redeploy del servicio web para generar un nuevo bundle.

---

## vinema-api

Build:

```bash
npm run db:generate && npm run server:build
```

Start:

```bash
npm run server:start
```

Target Port:

```text
8080
```

Pre-deploy:

```bash
npm run db:migrate:deploy
```

Variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
VINEMA_SYNC_API_KEY=<secreto>
VINEMA_SEED_EMAIL=<email>
VINEMA_SEED_WORKSPACE_NAME=Personal
VINEMA_ALLOWED_ORIGINS=https://vinema-web.up.railway.app
PORT=<inyectado por Railway>
```

Para desarrollo local puede agregarse el origen local necesario, separado por
coma:

```env
VINEMA_ALLOWED_ORIGINS=https://vinema-web.up.railway.app,http://localhost:3000
```

No usar `*` en produccion.

Healthcheck:

```text
/api/health
```

Endpoints:

- `GET /api/health`: publico, no requiere API key.
- `POST /api/sync/push`: requiere `Authorization: Bearer <VINEMA_SYNC_API_KEY>`.
- `GET /api/sync/pull`: requiere `Authorization: Bearer <VINEMA_SYNC_API_KEY>`.

## Tauri

Tauri usa `http://localhost:3000` en desarrollo segun `src-tauri/tauri.conf.json`.
En produccion, Tauri empaqueta `../out`, por lo que `next.config.ts` debe
mantener `output: "export"` y `npm run build` debe regenerar `out/` antes de
`npm run tauri:build`.

WSL/Linux sirve para validar la integracion Linux y que Tauri consume el
frontend estatico. El ejecutable e instalador Windows deben generarse desde
Windows nativo, no mediante cross-compilacion desde WSL.

La aplicacion local mantiene IndexedDB como base offline. El repositorio contiene
contratos y mappers de sincronizacion, pero todavia no contiene un motor cliente
Tauri que seleccione automaticamente entre URL local y URL de produccion ni que
ejecute push/pull en segundo plano.

Cuando se implemente ese cliente, debe usar:

- desarrollo API: `http://localhost:8000`
- produccion API: `https://vinema-api.up.railway.app`
- timeout de red;
- reintentos idempotentes por `mutationId`;
- preservacion del modo offline cuando no haya conexion;
- almacenamiento seguro de cualquier credencial temporal.

## Prueba de Integracion

La prueba controlada contra Railway usa:

```env
VINEMA_API_URL=https://vinema-api.up.railway.app
VINEMA_SYNC_API_KEY=<secreto>
VINEMA_TEST_WORKSPACE_ID=<workspace-id>
```

Ejecutar:

```bash
npm run sync:test-api
```

La prueba valida:

- healthcheck con PostgreSQL conectado;
- rechazo sin API key;
- rechazo con API key incorrecta;
- push de captura, concepto y relacion;
- pull incremental;
- idempotencia por `mutationId`;
- conflicto `VERSION_CONFLICT` con `baseVersion` obsoleta;
- archivado final de los registros `E2E_RAILWAY_`.
