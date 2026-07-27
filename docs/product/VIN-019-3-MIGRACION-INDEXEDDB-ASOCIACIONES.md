# VIN-019.3 - Migracion IndexedDB de asociaciones

## Sintoma

En runtime, la superficie principal `/` seguia mostrando el error general de
asociaciones al escribir una captura que debia encontrar memoria relacionada.

El error confirmado fue:

```text
NotFoundError

Failed to execute 'transaction' on 'IDBDatabase':
One of the specified object stores was not found.
```

La traza relevante apuntaba a:

```text
IndexedDbNodeContextRelationRepository.listAll
-> db.getAll(NODE_CONTEXT_RELATIONS_STORE)
-> IndexedDbNodeContextRelationRepository.listByWorkspace
-> runSuggestions
```

## Causa raiz

VIN-019.2 corrigio el caso de indice faltante, pero aun asumio que el store
`node_context_relations` existia. Algunas instalaciones historicas tenian la base
`vinema` en version 4 sin ese object store.

IndexedDB solo permite crear object stores dentro de una transaccion de upgrade.
Por eso `getAll()` no podia resolver una base donde el store completo no existia.

## Store e indice

Un indice ausente significa que el store existe, pero no tiene una ruta de acceso
secundaria. Ese caso se puede evitar leyendo con `getAll()` y filtrando.

Un store ausente significa que no existe el contenedor de datos. En ese caso,
abrir una transaccion contra el store lanza `NotFoundError`. La solucion correcta
es una migracion versionada.

## Migracion v4 -> v5

La version de IndexedDB paso de:

```text
vinema v4
```

a:

```text
vinema v5
```

Durante `upgrade`, la definicion central de esquema verifica y crea
idempotentemente:

```text
node_context_relations
```

con:

```text
keyPath: "id"
```

No se elimina ni recrea ningun store existente. Las capturas, workspaces,
devices, settings, contextos y relaciones existentes se preservan.

## Stores

La base v5 espera estos stores:

- `app_settings`
- `contexts`
- `devices`
- `key-value`
- `node_context_relations`
- `nodes`
- `workspaces`

`node_context_relations` se crea solamente si falta.

## Indices

Para `node_context_relations`, la migracion garantiza los indices faltantes:

- `by-workspace`: listar relaciones del workspace.
- `by-node`: consultar relaciones desde un nodo.
- `by-context`: consultar relaciones desde un contexto.
- `by-node-and-context`: evitar duplicados del mismo par.
- `by-related-node`: acceder por captura asociada.
- `by-relation-type`: separar relaciones de contexto y asociaciones.

Los indices se crean solo si no existen.

## Compatibilidad

La migracion contempla:

- base nueva;
- base v4 sin `node_context_relations`;
- base v4 con store relacional pero sin indices;
- base v4 con indices parciales;
- base v4 con relaciones antiguas;
- base v5 ya migrada;
- relaciones sin `relationType`;
- relaciones sin `relatedNodeId`;
- referencias huerfanas.

## Multi-tab

Las conexiones abiertas se cierran ante `versionchange`. Si una migracion queda
bloqueada por otra pestana, en desarrollo se registra un aviso claro indicando
que debe cerrarse otra pestana de Vinema y recargar.

No se implementa sincronizacion multi-tab completa en este paquete.

## Lectura defensiva

Aunque v5 debe crear el store, el repositorio relacional verifica su existencia
antes de leer. Si el store sigue ausente en una base ya corrupta o parcialmente
migrada, las lecturas devuelven:

```text
[]
```

Para el motor de asociaciones, eso significa que no existen relaciones todavia.
Las sugerencias textuales siguen funcionando.

## Escritura defensiva

Las escrituras no crean stores fuera de `upgrade`. Si el store relacional falta,
el repositorio lanza `VinemaDatabaseSchemaError`.

Esto evita fallar silenciosamente, duplicar capturas o corromper el commit.

## Pruebas

Se agrego cobertura con `fake-indexeddb` para:

- creacion limpia de base v5;
- migracion desde v4 sin store relacional;
- preservacion de capturas historicas;
- consultas relacionales vacias tras migracion;
- sugerencias textuales sin relaciones;
- migracion desde v4 con store sin indices completos;
- creacion de indices faltantes;
- reapertura de una base v5;
- escritura y lectura de asociaciones despues de migrar;
- base v5 anomala sin store relacional, con lectura defensiva.

## Validacion real

Se levanto la aplicacion en desarrollo para validar que `/` responde despues de
la migracion de esquema.

El servidor respondio:

```text
HEAD / 200
```

Durante la revision del log historico de desarrollo se confirmo el error real:

```text
[associations] suggestion query failed
NotFoundError: Failed to execute 'transaction' on 'IDBDatabase':
One of the specified object stores was not found.
```

Luego del cambio tambien se observo el aviso de migracion bloqueada cuando una
pestana antigua mantenia abierta la conexion v4:

```text
[vinema-db] IndexedDB upgrade blocked from v4 to v5.
Close other Vinema tabs and reload.
```

Ese estado no corrompe datos; indica que la migracion debe reintentarse al
cerrar la conexion antigua.

La validacion interactiva en navegador y DevTools no se realizo porque no habia
herramienta de navegador permitida distinta de Playwright, y Playwright fue
excluido por instruccion del usuario.

## Recuperacion

No se usa `deleteDatabase()`.

No se solicita borrar IndexedDB como solucion normal.

Si una instalacion queda bloqueando la migracion desde otra pestana, la accion de
recuperacion esperada es cerrar las pestanas antiguas de Vinema y recargar.

## Limitaciones

La lectura relacional conserva el fallback `getAll()` + filtro para soportar
esquemas historicos. Si el volumen de relaciones crece de manera importante,
puede introducirse una migracion futura para usar indices en consultas
especializadas sin comprometer compatibilidad.
