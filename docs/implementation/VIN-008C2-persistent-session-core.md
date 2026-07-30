# VIN-008C2 - Persistent Session Core

## Objetivo

VIN-008C2 introduce el nucleo de sesiones persistentes asociadas a dispositivos confiables.

La fase permite crear sesiones persistentes despues de registro o login, emitir access tokens cortos, emitir refresh tokens opacos, renovar sesiones mediante rotacion, detectar reutilizacion de tokens antiguos y revocar sesiones con logout.

## Modelo

El modelo agregado es `AuthSession`.

Una sesion pertenece exactamente a:

- un `User`;
- un `Device`.

Cada sesion guarda:

- `refreshTokenHash`;
- `tokenFamilyId`;
- `generation`;
- fechas de creacion, actualizacion, ultimo uso y expiracion;
- estado de revocacion;
- referencia opcional a la generacion que la reemplazo.

No guarda refresh tokens en texto plano, access tokens, JWTs completos, passwords, IPs en texto plano ni identificadores de hardware.

## User, Device y Session

`User` representa la identidad.

`Device` representa un cliente confiable declarado por la aplicacion mediante `clientDeviceId`.

`AuthSession` representa una sesion persistente de ese usuario en ese dispositivo.

El login en el mismo `User + Device` revoca sesiones activas anteriores con la razon `LOGIN_REPLACED_SESSION` y crea una nueva sesion. Otros dispositivos del mismo usuario mantienen sus sesiones.

## Refresh Token Opaco

El refresh token es opaco y tiene el formato:

```text
<sessionId>.<secret>
```

`sessionId` permite localizar la sesion.

`secret` es aleatorio criptograficamente con 256 bits de entropia y se codifica como `base64url`.

El servidor autentica exclusivamente el secreto. El `sessionId` no se considera secreto ni suficiente para autenticar.

## Hash

El servidor almacena solo SHA-256 del componente secreto.

Como el secreto tiene alta entropia criptografica, no se usa bcrypt. bcrypt se reserva para passwords de baja entropia.

La verificacion usa comparacion constante cuando los hashes tienen la misma longitud.

## Token Family y Rotacion

La estrategia usa un registro por generacion.

Una familia agrupa generaciones por `tokenFamilyId`:

```text
generacion 1 -> reemplazada por generacion 2
generacion 2 -> reemplazada por generacion 3
generacion 3 -> activa
```

Cada refresh valido:

1. verifica el token actual;
2. marca la generacion actual como usada;
3. crea una nueva generacion;
4. emite un nuevo access token;
5. emite un nuevo refresh token.

El refresh token anterior deja de ser valido inmediatamente.

## Concurrencia

La rotacion se realiza mediante una operacion atomica del repositorio.

En Prisma se usa una transaccion con `updateMany` condicional sobre la sesion activa antes de crear la generacion nueva. Si dos refresh simultaneos usan el mismo token, solo uno puede consumir la generacion activa.

## Reutilizacion

Si llega un refresh token criptograficamente correcto para una generacion ya reemplazada, se clasifica como `REFRESH_TOKEN_REUSED`.

En ese caso se revoca toda la familia con razon `TOKEN_REUSE_DETECTED` y no se emite ningun token nuevo.

## Expiracion y Revocacion

El access token conserva un TTL corto. Por defecto son 15 minutos.

El refresh token usa `VINEMA_AUTH_REFRESH_TOKEN_TTL_SECONDS`. Por defecto son 30 dias.

Logout revoca la sesion identificada por el refresh token con razon `USER_LOGOUT`. No elimina el Device, no elimina el `clientDeviceId` local y no borra datos locales.

Un access token ya emitido puede seguir siendo valido hasta expirar. Las operaciones ordinarias siguen validando el JWT de forma stateless en esta fase.

## Endpoints

`POST /auth/register`

Crea usuario, workspace personal, device, sesion persistente, access token y refresh token.

`POST /auth/login`

Valida credenciales, registra o reutiliza device, revoca sesiones activas previas del mismo `User + Device`, crea sesion nueva y devuelve tokens.

`POST /auth/refresh`

No requiere access token. Recibe refresh token, lo valida, rota la sesion y devuelve nuevo par de tokens.

`POST /auth/logout`

No requiere access token. Recibe refresh token, revoca la sesion y responde de forma idempotente.

## JWT

El access token incluye:

- `userId` como `sub`;
- `workspaceId`;
- `deviceId`;
- `sessionId`;
- issuer;
- audience;
- issued at;
- expiration.

No incluye refresh token, hash ni `tokenFamilyId`.

## Privacidad

VIN-008C2 no usa fingerprinting, MAC, IP, hardware ID ni user-agent completo como identificador.

Los logs estructurados nunca incluyen access tokens, refresh tokens, hashes, passwords ni cabeceras `Authorization`.

## Variables

```text
VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS=900
VINEMA_AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
```

## Web, PWA y Tauri

El cliente mantiene access token y refresh token solo en memoria mediante `AuthService`.

No se usa `localStorage`.

No se usan cookies.

No se persiste refresh token en IndexedDB.

No hay restore automatico al iniciar la app.

Al recargar o cerrar la aplicacion, la sesion se pierde todavia.

El service worker no debe cachear rutas `/auth` ni `/api`.

## Limitaciones

VIN-008C2 no implementa:

- persistencia segura del refresh token;
- restore session;
- silent refresh;
- refresh anticipado por temporizador;
- Tauri secure storage;
- gestion visual de sesiones;
- logout de todos los dispositivos;
- OAuth;
- recuperacion de password;
- verificacion de email.

## VIN-008C3

VIN-008C3 debera agregar almacenamiento seguro del refresh token y restauracion automatica de sesion sin romper el principio local-first ni exponer tokens a almacenamiento inseguro.
