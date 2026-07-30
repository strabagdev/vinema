# VIN-008C1 - Trusted Device Model

## Objetivo

VIN-008C1 introduce el modelo formal de dispositivo confiable asociado a un
usuario. Prepara Vinema para persistencia segura de sesion, refresh tokens,
restauracion silenciosa, sincronizacion multi-dispositivo y revocacion futura.

Esta fase no implementa refresh tokens, persistencia de access tokens, cookies,
restore session, logout remoto ni gestion visual de dispositivos.

## Modelo Conceptual

Un `Device` representa una instalacion local de Vinema que un usuario uso para
registrarse o iniciar sesion.

Campos principales:

- `id`: identificador interno del servidor.
- `userId`: usuario propietario.
- `clientDeviceId`: identificador persistente generado por la instalacion local.
- `name`: nombre legible.
- `platform`: plataforma general.
- `appType`: `WEB`, `PWA`, `TAURI` o `UNKNOWN`.
- `appVersion`: version opcional del cliente.
- `createdAt`: fecha de registro inicial.
- `updatedAt`: ultima actualizacion de metadata.
- `lastSeenAt`: ultima accion autenticada relevante.
- `revokedAt`: futura marca de revocacion.

La restriccion central es:

```text
unique(userId, clientDeviceId)
```

El mismo `clientDeviceId` puede existir para usuarios distintos sin colision.

## clientDeviceId

Vinema ya tenia un identificador local canonico en:

```text
src/features/device/get-or-create-device.ts
```

VIN-008C1 lo reutiliza como `clientDeviceId`. No se crea un segundo identificador
paralelo.

El `clientDeviceId`:

- no es un secreto;
- no se obtiene del hardware;
- no usa MAC address;
- no usa numero de serie;
- no usa IP;
- no usa fingerprinting;
- sobrevive logout;
- sobrevive recargas;
- es independiente del usuario;
- se persiste mediante la capa local existente de Vinema.

## Persistencia Local

El cliente usa `DeviceIdentityProvider`, que a su vez reutiliza:

```text
getOrCreateDevice(new IndexedDbAdapter())
```

La persistencia ocurre en IndexedDB mediante `app_settings`, con el fallback
legado ya existente. El logout local no elimina el dispositivo.

## Metadata

La metadata se detecta de forma conservadora:

- `WEB` para navegador normal;
- `PWA` para modo standalone;
- `TAURI` para runtime Tauri;
- `UNKNOWN` cuando no se puede determinar.

La plataforma se limita a:

- `windows`;
- `macos`;
- `linux`;
- `android`;
- `ios`;
- `web`;
- `unknown`.

No se agrega parsing complejo ni librerias de fingerprinting.

## Integracion con Register

`POST /auth/register` ahora exige:

```text
device.clientDeviceId
device.name
device.platform
device.appType
device.appVersion?
```

Despues de crear usuario y workspace personal, el servidor registra el
dispositivo y emite un access token con `deviceId`.

## Integracion con Login

`POST /auth/login` tambien exige metadata de dispositivo. Si el dispositivo ya
existe para el usuario, se actualiza metadata permitida y `lastSeenAt`.

Si el dispositivo esta revocado, el login falla con `DEVICE_REVOKED`.

## Access Token

El access token incluye:

- `sub`;
- `workspaceId`;
- `deviceId`;
- `iat`;
- `exp`;
- `iss`;
- `aud`.

No incluye email, nombre, `clientDeviceId`, user-agent, password, hashes ni
metadata completa.

## Validacion del Device

El servidor valida el dispositivo:

- al emitir token, registrando o reutilizando el device;
- en `/auth/session`;
- en `/auth/device`.

VIN-008C1 no agrega una consulta adicional de device en cada request de sync.
Los endpoints de sync siguen validando token, workspace y usuario. La revocacion
completa por request queda preparada para una fase posterior.

## GET /auth/device

Endpoint autenticado que devuelve el dispositivo asociado al access token
actual.

Rechaza:

- token ausente;
- token invalido;
- device inexistente;
- device de otro usuario;
- device revocado.

No existen todavia endpoints de listado, renombre, revocacion ni gestion visual.

## Cliente

`AuthService` obtiene metadata desde `DeviceIdentityProvider` antes de llamar a
`AuthClient.register()` o `AuthClient.login()`.

La UI no pide datos tecnicos. `/login` y `/register` conservan la experiencia de
VIN-008B.

## Privacidad

VIN-008C1 evita identificadores invasivos. El modelo usa un UUID local de la
aplicacion y metadata general no sensible.

## Compatibilidad Web, PWA y Tauri

Web usa `appType=WEB` y `platform=web`.

PWA usa `appType=PWA` y `platform=web`.

Tauri usa `appType=TAURI` y la plataforma nativa detectada cuando es posible.

## Logout y Reload

Logout:

- elimina solo el access token en memoria;
- no borra `clientDeviceId`;
- no borra IndexedDB;
- no revoca el device remoto.

Reload:

- conserva `clientDeviceId`;
- no conserva sesion;
- exige volver a iniciar sesion.

La sesion aún no persiste.

## Limitaciones

VIN-008C1 no implementa:

- refresh tokens;
- rotacion de refresh tokens;
- restore session;
- cookies;
- logout remoto;
- revocacion desde UI;
- listado de dispositivos;
- sincronizacion automatica al autenticar.

## Queda para VIN-008C2

La siguiente fase puede introducir persistencia segura de sesion, refresh tokens,
restore controlado, revocacion real por request y administracion visible de
dispositivos sin cambiar el modelo base introducido aqui.
