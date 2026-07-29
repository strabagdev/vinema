# VIN-007A - Cliente HTTP de sincronizacion

## Responsabilidad

`SyncClient` es la capa HTTP reutilizable para comunicarse con la API remota de
sincronizacion de Vinema.

Expone:

- `health()`
- `push(input)`
- `pull(input)`

## Que Hace

- Construye URLs relativas a una `baseUrl` inyectada.
- Envia `Authorization: Bearer <token>` en `push` y `pull`.
- Envia `Content-Type: application/json` en `push`.
- Reutiliza los contratos de `@vinema/sync-contracts`.
- Valida respuestas con los schemas compartidos.
- Aplica timeout configurable mediante `AbortController`.
- Convierte fallos HTTP, red, timeout y respuestas invalidas en errores
  tipados.

## Que No Hace Todavia

- No crea cola de mutaciones.
- No persiste cursor remoto.
- No lee ni escribe IndexedDB.
- No integra repositorios locales.
- No ejecuta sincronizacion automatica.
- No hace polling.
- No hace retry automatico.
- No resuelve conflictos.
- No crea `SyncProvider`.
- No usa WebSocket ni SSE.

## Configuracion

El cliente se crea con una factory:

```ts
const client = createSyncClient({
  baseUrl,
  accessToken,
  timeoutMs,
});
```

`baseUrl` debe venir desde configuracion del entorno que use el llamador.

`accessToken` se inyecta como dependencia. El cliente no lee
`VINEMA_SYNC_API_KEY` ni ninguna variable publica. Esto permite que, en una fase
posterior, el token provenga de una sesion de usuario u otro mecanismo seguro.

La API key tecnica actual no debe exponerse al navegador mediante
`NEXT_PUBLIC_*`, `VITE_*` ni codigo empaquetado.

## Separacion de Responsabilidades

`SyncClient` solo transporta datos por HTTP.

Un futuro `SyncCoordinator` debera encargarse de:

- leer cambios locales;
- generar `mutationId`;
- mantener cola;
- persistir estado remoto;
- hacer push/pull;
- resolver conflictos;
- coordinar reintentos y conectividad.

## Errores

El cliente puede distinguir:

- `AUTH_ERROR`
- `NETWORK_ERROR`
- `TIMEOUT`
- `ABORTED`
- `VERSION_CONFLICT`
- `SERVER_ERROR`
- `INVALID_RESPONSE`
- `INVALID_REQUEST`
- `UNKNOWN_ERROR`

La capa no contiene mensajes de UI.
