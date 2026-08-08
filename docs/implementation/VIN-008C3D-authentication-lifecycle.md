# VIN-008C3D - Authentication Lifecycle

## Objetivo

VIN-008C3D consolida el subsistema de autenticacion de Vinema en una unica
autoridad de ciclo de vida.

No agrega MFA, OAuth, SSO, gestion visual de dispositivos, interceptores 401,
BroadcastChannel ni pantallas nuevas.

## Arquitectura final

La autoridad de ciclo de vida es `AuthenticationLifecycle`.

`AuthProvider` queda como adaptador React:

- crea el runtime;
- llama `initialize()` al montar;
- escucha estados publicados;
- expone acciones a componentes;
- llama `dispose()` al desmontar.

No agenda timers, no decide refresh, no conoce IndexedDB y no coordina sync.

## Responsabilidades

`AuthService`:

- posee access token y refresh token en memoria;
- persiste refresh token rotado mediante `AuthSessionStorage`;
- publica eventos de estado;
- invalida respuestas tardias mediante generacion interna;
- limpia sesion local;
- expone `dispose()` para cerrar operaciones pendientes.

`AuthRefreshCoordinator`:

- agenda silent refresh;
- asegura single-flight;
- aplica retries acotados;
- escucha `visibilitychange`;
- cancela timers/listeners en `dispose()`.

`AuthenticationLifecycle`:

- inicializa restore;
- delega login/register/refresh/logout;
- reacciona a estados publicados para agendar o cancelar refresh;
- dispone service, coordinator y sync bridge;
- centraliza errores de configuracion publica del API.

`AuthStateEngine`:

- representa la maquina de estados publica;
- ignora eventos tardios una vez que el estado es `DISPOSING`;
- no contiene tokens;
- distingue `AUTHENTICATED_LOCAL` de `AUTHENTICATED_OFFLINE`.

`AuthSyncStateBridge`:

- observa solo estados publicados;
- traduce `AUTHENTICATED` a sync autenticada;
- traduce `UNAUTHENTICATED` a sync detenida;
- publica `AUTHENTICATED_LOCAL` como modo local sin sincronizacion remota;
- mantiene `UNKNOWN` durante restore y otros estados intermedios.

## Maquina de estados

Estados principales:

```text
BOOT
  |
  v
RESTORING
  |
  +--> AUTHENTICATED
  |
  +--> UNAUTHENTICATED

AUTHENTICATED
  |
  +--> UNAUTHENTICATED
  |
  +--> DISPOSING

UNAUTHENTICATED
  |
  +--> AUTHENTICATING
  |
  +--> DISPOSING

DISPOSING
  |
  x  eventos tardios ignorados
```

`REFRESHING`, `AUTHENTICATING`, `LOGGING_OUT` y `ERROR` siguen existiendo como
estados operativos, pero silent refresh no cambia la UI a loading global.

`AUTHENTICATED_LOCAL` representa una identidad local persistente elegida por el
usuario mediante `Usar sin cuenta`. Tiene usuario/workspace/device locales, no
tiene access token ni refresh token, no llama `/auth/register`, `/auth/login` ni
`/auth/refresh`, y no inicia el lifecycle de sync autenticado.

`AUTHENTICATED_OFFLINE` conserva su significado previo: una cuenta remota ya
validada que puede usarse temporalmente sin red y revalidarse cuando vuelve la
conexion. No debe usarse para representar modo local sin cuenta.

## Flujo completo

1. `AuthProvider` monta.
2. `AuthenticationLifecycle.initialize()` ejecuta restore una sola vez.
3. `AuthService` carga `AuthSessionStorage`.
4. Si existe refresh token, rota sesion con `/auth/refresh`.
5. El refresh token rotado se persiste antes de publicar memoria.
6. `AuthStateEngine` publica `AUTHENTICATED`.
7. `AuthenticationLifecycle` agenda refresh con `AuthRefreshCoordinator`.
8. Sync recibe solo el estado publicado.
9. Logout cancela refresh y limpia sesion.
10. Dispose cancela todo y bloquea respuestas tardias.

Flujo local:

1. Login muestra `Usar sin cuenta`.
2. La accion crea o reactiva una identidad local en IndexedDB.
3. Vinema publica `AUTHENTICATED_LOCAL` y entra al canvas.
4. `AuthGuard` lo considera sesion valida.
5. App resume, refresh y sync remoto no revalidan ni sincronizan.
6. Salir del modo local desactiva la identidad, vuelve a login y conserva el
   conocimiento local.

Flujo de incorporacion local a cuenta:

1. Login o registro remoto finaliza correctamente.
2. Antes de entrar al uso normal de la cuenta, Vinema revisa si la identidad
   local pendiente contiene capturas, conceptos o relaciones.
3. Si no hay conocimiento real, entra a la cuenta sin dialogo.
4. Si hay conocimiento local, muestra el dialogo `Tienes conocimiento guardado
   en este dispositivo`.
5. `No por ahora` entra a la cuenta sin modificar el workspace ni la identidad
   local.
6. `Incorporar a mi cuenta` marca la identidad local como `LOCAL_MIGRATING`,
   crea un snapshot, deduplica contra el workspace remoto, escribe capturas,
   conceptos y relaciones mediante los repositorios con outbox/sync remoto,
   ejecuta sync y verifica que las mutaciones incorporadas queden confirmadas.
7. Solo tras esa verificacion se limpia el workspace local migrado y la
   identidad queda `LOCAL_MIGRATED`, inactiva y ligada al workspace remoto de
   destino.
8. Si falla red, persistencia o sync, la identidad vuelve a `LOCAL_PENDING` y
   el contenido local permanece intacto para reintento posterior.

Vinema nunca incorpora conocimiento local a una cuenta de forma silenciosa.

## Concurrencia

Logout y dispose ganan siempre.

`AuthService` usa una generacion interna de operacion. Si una respuesta de
restore o refresh llega despues de logout, dispose u otra operacion dominante,
no puede volver a autenticar Vinema.

`AuthRefreshCoordinator` tambien mantiene su propia generacion para cancelar
timers, retries y promesas en curso.

## Dispose

`AuthenticationLifecycle.dispose()` es idempotente y limpia:

- timers de refresh;
- listener de visibilidad;
- bridge de sync;
- operaciones pendientes del servicio;
- access token en memoria;
- refresh token en memoria.

No borra datos locales de conocimiento ni identidad de dispositivo.

## Puntos de extension futuros

Fases futuras pueden agregar:

- coordinacion entre pestanas;
- manejo avanzado offline;
- interceptores 401;
- UI de sesiones y dispositivos;
- almacenamiento seguro nativo Tauri.

Esas extensiones deben integrarse con `AuthenticationLifecycle` en lugar de
volver a distribuir decisiones de autenticacion en React.

## Criterios de aceptacion cubiertos

- autoridad unica de autenticacion;
- provider reducido;
- maquina de estados con `BOOT` y `DISPOSING`;
- dispose idempotente;
- logout idempotente;
- restore tardio no revive sesion;
- refresh tardio no revive sesion;
- sync depende de estados publicados;
- timers/listeners viven en el coordinador;
- build y SSR permanecen estables.
