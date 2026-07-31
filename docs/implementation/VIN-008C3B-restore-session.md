# VIN-008C3B - Restore Session

## Objetivo

VIN-008C3B restaura automaticamente una sesion persistida al iniciar Vinema.

El cliente carga `StoredAuthSession`, usa su refresh token contra
`POST /auth/refresh`, persiste el refresh token rotado y reconstruye el estado
autenticado. El access token sigue viviendo solo en memoria.

## Estados

El estado inicial de autenticacion ahora es `RESTORING`.

Flujo de estados:

```text
RESTORING -> AUTHENTICATED
RESTORING -> UNAUTHENTICATED
RESTORING -> UNAUTHENTICATED con error recuperable
```

`AuthGuard` no redirige mientras restaura. Las rutas publicas `/login` y
`/register` muestran una espera discreta para evitar parpadeos del formulario.

## Flujo de Restauracion

1. `AuthProvider` monta.
2. `AuthService.restoreSession()` ejecuta `AuthSessionStorage.load()`.
3. Si no hay sesion, pasa a `UNAUTHENTICATED` sin llamar a la API.
4. Si hay sesion, llama `authClient.refresh()` con el refresh token persistido.
5. Si el servidor acepta el token, emite access token y refresh token rotado.
6. El cliente guarda la sesion rotada.
7. Solo despues de guardar, publica `AUTHENTICATED`.

No se implementan timers, silent refresh ni interceptores 401.

## Orden de Rotacion

El orden es deliberado:

1. enviar refresh token persistido;
2. recibir token rotado;
3. persistir la sesion rotada;
4. descartar token anterior;
5. actualizar memoria;
6. publicar estado autenticado.

Si guardar el token rotado falla, Vinema limpia storage y memoria, queda
`UNAUTHENTICATED` y exige login. Esto evita reutilizar un refresh token que el
servidor ya invalido.

## Errores

Sin sesion persistida:

- no hay request a `/auth/refresh`;
- no hay mensaje visible;
- el estado final es `UNAUTHENTICATED`.

Token invalido, expirado, revocado o reutilizado:

- se limpia `auth_session/current`;
- no se muestra detalle tecnico;
- el usuario puede iniciar sesion normalmente.

Error temporal de red:

- se conserva la sesion persistida;
- no se autentica;
- se muestra: `No fue posible restaurar la sesion. Puedes iniciar sesion nuevamente.`

Error al persistir token rotado:

- se limpia storage;
- se limpian tokens en memoria;
- no se publica `AUTHENTICATED`.

## Concurrencia

`AuthService` usa una generacion interna de operacion. Login, logout,
refresh manual y restore invalidan operaciones anteriores.

Si una respuesta tardia de restore llega despues de logout o login manual, no
puede volver a autenticar la aplicacion.

`restoreSession()` comparte una promesa in-flight dentro de la instancia del
servicio para evitar refresh duplicado en el mismo ciclo de montaje.

## Device

`StoredAuthSession.deviceId` se compara con `deviceId` retornado por refresh.
Si no coinciden, Vinema considera la sesion inconsistente, limpia storage y
queda no autenticado.

`sessionId` puede cambiar durante refresh porque el servidor rota la sesion. No
se usa como credencial.

## Sync

`AuthSyncStateBridge` publica `UNKNOWN` durante `RESTORING`. La sincronizacion
solo puede activarse cuando el estado pasa a `AUTHENTICATED` y existe access
token en memoria.

## Service Worker

El service worker no intercepta requests cross-origin y excluye rutas `/auth` y
`/api`. No cachea respuestas de autenticacion ni cuerpos con tokens.

## Seguridad

- el access token no se persiste;
- el refresh token solo vive en `AuthSessionStorage`;
- no se usan cookies, `localStorage` ni `sessionStorage`;
- no se imprimen tokens;
- no se almacenan passwords ni usuario completo.

IndexedDB no es un keychain criptografico. Tauri debera usar almacenamiento
seguro nativo en una etapa posterior.

## Limitacion Actual

VIN-008C3B solo restaura al inicio. Si el access token expira durante una sesion
larga, no se renueva automaticamente. Eso pertenece a VIN-008C3C.

## Criterios de Aceptacion

- `AuthProvider` comienza en `RESTORING`;
- sesion ausente termina `UNAUTHENTICATED`;
- sesion valida llama `/auth/refresh`;
- token rotado se persiste antes de autenticar;
- token invalido limpia storage;
- error de red conserva storage;
- logout invalida restore pendiente;
- `AuthGuard` no redirige durante restore;
- no se implementa silent refresh.

## Siguiente Etapa

VIN-008C3C podra agregar renovacion silenciosa controlada antes de expiracion,
sin cambiar el contrato de almacenamiento introducido en C3A.
