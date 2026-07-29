# VIN-007B - Cola persistente de mutaciones de sincronizacion

## Proposito

VIN-007B agrega una outbox persistente en IndexedDB para conservar mutaciones
locales antes de enviarlas a la API remota. La outbox permite que una mutacion
pendiente sobreviva cierres de la aplicacion, reinicios, caidas de red y fallos
temporales del servidor.

Esta fase tambien agrega metadatos locales de sincronizacion por workspace y
dispositivo.

## Version IndexedDB

- Version anterior: `5`
- Version nueva: `6`

La migracion agrega stores nuevas sin eliminar ni recrear stores de dominio
existentes.

## Stores

### `sync_mutations`

Clave primaria:

- `mutationId`

Indices:

- `by-workspace`: `workspaceId`
- `by-status`: `status`
- `by-created-at`: `createdAt`
- `by-workspace-and-status`: `[workspaceId, status]`
- `by-next-at`: `nextAttemptAt`

Modelo:

```ts
type SyncMutationOutboxRecord = {
  mutationId: string;
  workspaceId: string;
  deviceId: string;
  mutation: SyncMutation;
  status: "PENDING" | "PROCESSING" | "FAILED" | "CONFLICT";
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  conflictData?: unknown;
};
```

### `sync_metadata`

Clave primaria:

- `[workspaceId, deviceId]`

Indices:

- `by-workspace`: `workspaceId`
- `by-device`: `deviceId`

Modelo:

```ts
type SyncMetadataRecord = {
  workspaceId: string;
  deviceId: string;
  pullCursor: string;
  lastSuccessfulPushAt: string | null;
  lastSuccessfulPullAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## Estados

Estados persistidos:

- `PENDING`
- `PROCESSING`
- `FAILED`
- `CONFLICT`

No se persiste `SYNCED`. Una mutacion aceptada por el servidor se eliminara de
la outbox en una fase posterior.

## Transiciones

Transiciones validas:

- `PENDING -> PROCESSING`
- `PROCESSING -> PENDING`
- `PROCESSING -> FAILED`
- `PROCESSING -> CONFLICT`
- `FAILED -> PENDING`
- `CONFLICT -> PENDING`

La funcion pura `canTransition(from, to)` define estas reglas. Las transiciones
arbitrarias lanzan `INVALID_STATUS_TRANSITION`.

## Idempotencia Local

`mutationId` es unico.

- Si `enqueue` recibe un `mutationId` nuevo, crea un registro `PENDING`.
- Si recibe un `mutationId` existente con contenido equivalente, devuelve el
  registro existente sin reiniciar estado ni `attemptCount`.
- Si recibe el mismo `mutationId` con contenido distinto, lanza
  `DUPLICATE_MUTATION_CONFLICT`.

La comparacion usa serializacion estable con claves ordenadas para evitar falsos
conflictos por orden de propiedades.

## Orden

Las listas pendientes, fallidas y en conflicto ordenan por:

1. `createdAt` ascendente.
2. `mutationId` ascendente.

Los listados filtran por workspace y validan `limit`.

## Recuperacion De PROCESSING

`resetStaleProcessing(cutoff)` queda disponible para fases posteriores.

Comportamiento:

- busca registros `PROCESSING`;
- usa `lastAttemptAt` o, si no existe, `updatedAt`;
- si el valor es anterior a `cutoff`, vuelve a `PENDING`;
- conserva `attemptCount`;
- limpia `nextAttemptAt`;
- actualiza `updatedAt`.

No se ejecuta automaticamente en esta fase.

## Seguridad

La outbox y metadata no almacenan:

- `accessToken`;
- `VINEMA_SYNC_API_KEY`;
- sesiones;
- credenciales;
- secretos.

## Exclusiones

VIN-007B no implementa:

- HTTP;
- `SyncClient`;
- push automatico;
- pull automatico;
- polling;
- retry automatico;
- `SyncProvider`;
- integracion con repositorios de dominio;
- resolucion visual de conflictos;
- WebSocket, SSE o Background Sync.

## Relacion Futura

VIN-007C podra usar estos repositorios para registrar mutaciones locales desde
operaciones de dominio.

VIN-007D podra coordinar procesamiento, reintentos, recuperacion de
`PROCESSING`, push/pull y manejo de conflictos.
