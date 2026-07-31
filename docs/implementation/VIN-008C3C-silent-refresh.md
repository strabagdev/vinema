# VIN-008C3C - Silent Refresh

## Objetivo

VIN-008C3C mantiene una sesion autenticada activa renovando el access token
antes de que expire.

El access token sigue viviendo solo en memoria. El refresh token persiste en
`AuthSessionStorage` y se rota en cada refresh aceptado por el servidor.

## Modelo de expiracion

El cliente usa el campo explicito `accessTokenExpiresAt` devuelto por la API en:

- register;
- login;
- restore;
- refresh.

No se decodifica el JWT en el cliente para planificar renovaciones. La fuente
de verdad es el contrato de autenticacion.

## AuthRefreshCoordinator

`AuthRefreshCoordinator` coordina la renovacion sin depender de React,
IndexedDB ni HTTP directo.

Responsabilidades:

- programar un unico timeout;
- renovar 60 segundos antes de la expiracion;
- refrescar inmediatamente si el token ya esta cerca de vencer;
- compartir una unica promesa cuando hay llamadas concurrentes;
- aplicar reintentos acotados para errores temporales;
- reprogramar despues de cada exito;
- cancelar timers y resultados tardios durante logout o unmount;
- revisar expiracion al volver la pagina a primer plano.

Constantes:

- `AUTH_REFRESH_EARLY_MS`: 60 segundos;
- `AUTH_REFRESH_MIN_DELAY_MS`: 1 segundo;
- `AUTH_REFRESH_RETRY_DELAYS_MS`: 5 segundos y 15 segundos.

## Orden de rotacion

El orden seguro se mantiene:

1. usar el refresh token vigente;
2. llamar `/auth/refresh`;
3. recibir nuevo access token y refresh token;
4. validar consistencia de usuario, workspace y device;
5. persistir el refresh token rotado;
6. actualizar memoria;
7. publicar estado autenticado;
8. reprogramar el siguiente refresh.

Si falla la persistencia despues de que el servidor roto el refresh token, la
sesion local se limpia y el usuario debe iniciar sesion nuevamente.

## Integracion

Login, register y restore activan una sesion con `accessTokenExpiresAt`, lo que
permite al `AuthProvider` programar silent refresh.

El refresh silencioso usa `AuthService.refresh({ silent: true })`. Durante su
ejecucion Vinema mantiene la UI autenticada y no muestra spinner global.

Logout cancela el coordinador antes de limpiar la sesion. Si una respuesta de
refresh llega tarde, no puede volver a autenticar la aplicacion.

## Sync

`AuthService` sigue implementando `AccessTokenProvider`. Los clientes de sync
que reciben ese provider leen el access token actual en cada request, por lo que
un refresh exitoso deja disponibles las credenciales nuevas sin recrear el
cliente.

No se agregan interceptores globales 401 ni reintentos automaticos de requests
fallidas en esta fase.

## Errores

Errores definitivos como token invalido, token expirado, sesion inexistente,
dispositivo revocado o respuesta inconsistente limpian la sesion local.

Errores temporales de red o 5xx durante silent refresh:

- no limpian el refresh token persistido;
- mantienen la sesion si el access token aun no vencio;
- aplican dos reintentos acotados;
- interrumpen la sesion en memoria si ya no queda access token util.

No existen retries infinitos.

## Visibility y reanudacion

El coordinador escucha `visibilitychange` en cliente. Al volver a `visible`,
recalcula `Date.now()`:

- si el token esta vencido o proximo a vencer, ejecuta refresh;
- si sigue vigente, reprograma el timeout.

Esto cubre tabs suspendidas, PWA pausada y equipos que vuelven de suspension sin
agregar intervalos permanentes.

## Seguridad

- No se persiste access token.
- No se imprimen tokens en logs.
- El service worker no participa en refresh.
- `/auth` y `/api` no se cachean.
- No se agregan secretos `NEXT_PUBLIC`.
- La configuracion de TTL del servidor sigue en
  `VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS`.

## Exclusiones

VIN-008C3C no implementa:

- interceptor global de respuestas 401;
- reintento automatico de requests autenticadas fallidas;
- coordinacion entre multiples pestanas;
- Web Locks API;
- BroadcastChannel;
- refresh desde Service Worker;
- almacenamiento seguro nativo Tauri;
- gestion visual completa de dispositivos.

## Criterios de aceptacion

- login, register y restore programan refresh;
- refresh ocurre antes de expiracion;
- existe single-flight;
- el refresh token rotado se persiste antes de publicar memoria;
- el access token sigue solo en memoria;
- silent refresh no altera visualmente la UI;
- logout cancela timers y operaciones tardias;
- visibilitychange corrige timers atrasados;
- errores temporales tienen retries acotados;
- errores definitivos limpian sesion;
- SSR y build siguen funcionando.

## Siguiente etapa

VIN-008C3D podra abordar ciclo de vida avanzado: coordinacion entre pestanas,
offline prolongado, reintentos de requests fallidas y gestion mas rica de
sesiones/dispositivos.
