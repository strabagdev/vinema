# VIN-008C3A - Secure Session Storage

## Objetivo

VIN-008C3A agrega la infraestructura cliente para persistir el refresh token de
la sesion autenticada.

La fase prepara la restauracion futura de sesion, pero no la implementa. Al
recargar Vinema, el usuario sigue apareciendo como no autenticado y debe iniciar
sesion nuevamente.

## Alcance

Esta etapa introduce:

- un modelo minimo de sesion persistida;
- una interfaz `AuthSessionStorage`;
- una implementacion Web/PWA sobre IndexedDB;
- una implementacion in-memory para tests;
- integracion con register, login, refresh y logout;
- manejo seguro de datos corruptos.

No introduce:

- restauracion automatica;
- silent refresh;
- timers;
- interceptores 401;
- cookies;
- `localStorage`;
- `sessionStorage`;
- almacenamiento del access token;
- almacenamiento seguro nativo de Tauri.

## Modelo Persistido

El modelo `StoredAuthSession` conserva solo:

```ts
refreshToken: string;
sessionId: string;
deviceId: string;
storedAt: string;
```

`storedAt` usa ISO 8601.

No se persisten:

- `accessToken`;
- password;
- usuario completo;
- email;
- hashes;
- secretos adicionales.

`sessionId` y `deviceId` ayudan a identificar la sesion local, pero no
reemplazan la validacion del servidor. El unico material autenticante persistido
es el refresh token.

## Interfaz

La abstraccion estable es:

```ts
interface AuthSessionStorage {
  load(): Promise<StoredAuthSession | null>;
  save(session: StoredAuthSession): Promise<void>;
  clear(): Promise<void>;
}
```

La interfaz no depende de React, Next.js, IndexedDB ni Tauri. Esto permite
reemplazar la implementacion Web por un almacenamiento seguro nativo en una fase
posterior.

## Web y PWA

Web/PWA usan `IndexedDbAuthSessionStorage`.

La implementacion reutiliza la base IndexedDB central `vinema` y agrega el store
`auth_session`. La tabla guarda una sola sesion activa con clave fija
`current`.

`save()` sobrescribe la sesion anterior. `clear()` es idempotente. `load()`
devuelve `null` cuando no hay sesion o cuando encuentra datos corruptos. Si los
datos son corruptos, el registro se elimina de forma segura.

## Tauri

VIN-008C3A no implementa un storage seguro Tauri.

La extension futura debe usar almacenamiento seguro del sistema operativo cuando
la arquitectura Tauri lo defina. No debe simular seguridad usando IndexedDB como
si fuese un keychain nativo.

## Integracion Auth

Despues de `register` exitoso:

1. se recibe la sesion del servidor;
2. se guarda `StoredAuthSession`;
3. se conserva el access token solo en memoria;
4. se transiciona a estado autenticado.

Despues de `login` exitoso se sobrescribe cualquier sesion persistida anterior.

Despues de `refresh` exitoso se guarda inmediatamente el refresh token rotado
antes de actualizar memoria. Si guardar falla, Vinema limpia la sesion local y
exige un nuevo login. Esto evita conservar o reutilizar un refresh token antiguo
despues de una rotacion del servidor.

Durante `logout`, Vinema intenta revocar remotamente la sesion y siempre limpia
la persistencia local en `finally`, incluso si la API esta caida o el token ya no
es valido.

## Errores

Si falla la persistencia despues de register, login o refresh:

- no se considera completado el login;
- se limpia el storage local;
- se limpian tokens en memoria;
- se actualiza el estado a error o no autenticado segun el flujo;
- no se imprime el refresh token.

## Datos Corruptos

`load()` valida:

- `refreshToken` no vacio;
- `sessionId` no vacio;
- `deviceId` no vacio;
- `storedAt` ISO 8601 valido.

Los datos invalidos producen `null` y no disparan refresh.

## Seguridad

IndexedDB no es un almacenamiento criptografico. Su proteccion depende del
origen del navegador y no protege frente a XSS. Por eso VIN-008C3A evita
persistir access tokens, passwords o datos de usuario completos.

## Criterios de Aceptacion

- existe `AuthSessionStorage`;
- existe `IndexedDbAuthSessionStorage`;
- existe `InMemoryAuthSessionStorage`;
- register y login persisten refresh token, `sessionId` y `deviceId`;
- refresh reemplaza el refresh token rotado;
- logout limpia la sesion persistida;
- `AuthProvider` no accede directamente a IndexedDB;
- montar `AuthProvider` no llama `load()`;
- recargar no restaura sesion todavia;
- build SSR funciona.

## Siguiente Etapa

VIN-008C3B debera usar `AuthSessionStorage.load()` para restaurar sesion de forma
controlada y rotar el refresh token al iniciar, sin almacenar access tokens y sin
introducir timers o reintentos indefinidos.
