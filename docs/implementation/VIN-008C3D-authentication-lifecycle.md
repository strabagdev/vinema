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
- no contiene tokens.

`AuthSyncStateBridge`:

- observa solo estados publicados;
- traduce `AUTHENTICATED` a sync autenticada;
- traduce `UNAUTHENTICATED` a sync detenida;
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
