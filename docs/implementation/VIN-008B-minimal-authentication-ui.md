# VIN-008B - Minimal Authentication UI

## Objetivo

VIN-008B agrega la superficie minima para que una persona pueda registrarse,
iniciar sesion, entrar a Vinema, ver su identidad basica y cerrar la sesion
local.

La fase consume la API real creada en VIN-008A. No agrega refresh tokens,
cookies, OAuth, recuperacion de contrasena, verificacion de email ni
persistencia de sesion.

## Arquitectura

La integracion mantiene la separacion definida en VIN-008A:

```text
UI
AuthProvider
AuthService
AuthClient / AuthStateEngine
API VIN-008A
```

React no es dueño del dominio de autenticacion. `AuthProvider` crea una sola
instancia de `AuthStateEngine` y una sola instancia de `AuthService`, se
suscribe al estado y expone acciones mediante `useAuth()`.

El token de acceso vive encapsulado en `AuthService` y solo se expone en memoria
para integraciones cliente que lo necesiten.

## Rutas

VIN-008B agrega dos rutas publicas:

- `/login`
- `/register`

Las rutas autenticadas existentes quedan protegidas en el shell principal. La
proteccion es del lado cliente y es suficiente para esta fase porque todavia no
hay persistencia local de sesion.

## Flujo de Registro

`/register` permite ingresar:

- nombre;
- email;
- contrasena;
- confirmacion de contrasena.

El formulario valida campos obligatorios, email valido, longitud minima de
contrasena y coincidencia de confirmacion. Al registrarse correctamente,
`AuthService` conserva el access token en memoria y el usuario entra a la
aplicacion principal.

## Flujo de Login

`/login` permite ingresar email y contrasena. El formulario valida antes de
enviar, evita doble submit y traduce errores tecnicos a mensajes comprensibles.

Un login correcto actualiza `AuthStateEngine`, conserva el token en memoria y
redirige a `/`.

## Logout Local

El header autenticado muestra la identidad basica del usuario y la accion
`Cerrar sesion`.

Cerrar sesion:

- llama a `clearLocalSession()`;
- elimina el access token en memoria;
- actualiza `AuthStateEngine`;
- notifica al `SyncStateEngine` mediante `AuthSyncStateBridge`;
- redirige a `/login`;
- no borra IndexedDB ni contenido local.

## AuthProvider

`AuthProvider` expone `useAuth()` con:

- `state`;
- `user`;
- `workspaceId`;
- `accessToken`;
- `isAuthenticated`;
- `isLoading`;
- `error`;
- `register(input)`;
- `login(input)`;
- `logout()`.

La sesion inicial es anonima porque VIN-008B no intenta restaurar sesiones.

## AuthGuard

`AuthGuard` protege el shell autenticado:

- deja renderizar cuando el estado es autenticado;
- redirige a `/login` cuando no hay sesion;
- no protege `/login` ni `/register`;
- evita middleware para preservar compatibilidad con PWA y Tauri.

## Variables de Entorno

La unica variable publica nueva es:

```text
NEXT_PUBLIC_API_URL
```

Debe apuntar a la API HTTP publica, por ejemplo en desarrollo:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

No se agregan secretos al bundle web.

Estas variables siguen siendo solo del servidor API:

- `VINEMA_AUTH_ACCESS_TOKEN_SECRET`;
- `VINEMA_AUTH_ISSUER`;
- `VINEMA_AUTH_AUDIENCE`;
- `VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS`.

## Comportamiento al Recargar

La sesion vive solo en memoria. Al recargar la aplicacion, el usuario debe
volver a iniciar sesion.

Esto es intencional en VIN-008B. La persistencia de sesion queda fuera de esta
fase.

## Compatibilidad PWA

El service worker precachea `/login` y `/register` como parte del shell minimo.
La autenticacion remota requiere conectividad con la API; no se intenta login
offline.

## Compatibilidad Tauri

La proteccion es cliente y no depende de middleware ni rutas dinamicas. Tauri
puede abrir las rutas estaticas y usar la misma variable publica de API durante
el build correspondiente.

## Relacion con VIN-008A

VIN-008B no redefine contratos. Reutiliza:

- `AuthClient`;
- `AuthService`;
- `AuthStateEngine`;
- `AuthSyncStateBridge`;
- contratos de `@vinema/sync-contracts`.

## Queda para VIN-008C

Quedan fuera:

- refresh token;
- persistencia de sesion;
- recuperacion automatica al recargar;
- dispositivos;
- logout remoto;
- sincronizacion automatica condicionada por login;
- gestion de perfil.
