# VIN-016 - Archivo y recuperacion segura

## 1. Objetivo

Crear una experiencia segura para consultar capturas archivadas y restaurarlas
sin perdida de datos. Archivar retira una captura de la Base de Conocimiento
activa, pero no la elimina.

No se implementa eliminacion definitiva, papelera, backend, sincronizacion,
migraciones destructivas ni renombrado de rutas tecnicas heredadas.

## 2. Estado previo

Antes de VIN-016, una captura podia archivarse desde detalle y desaparecia de la
Base activa y de la busqueda principal. El registro seguia persistido en
IndexedDB, pero no existia una superficie visible para revisarlo o restaurarlo.

## 3. Decision de producto

El Archivo es una vista secundaria y segura:

- muestra solo capturas archivadas;
- permite buscar dentro de archivadas;
- permite abrir detalle en lectura;
- permite restaurar;
- no elimina registros.

## 4. Ruta elegida

La ruta elegida es:

```text
/notes/archive
```

Con busqueda:

```text
/notes/archive?q=<consulta>
```

Se mantiene bajo `/notes` porque `/notes` sigue siendo la ruta tecnica heredada
de la Base de Conocimiento. No se renombra esa estructura en este paquete.

## 5. Arquitectura de consultas

Se agrego `listArchivedCapturePage`, que reutiliza el repositorio de nodos con
`includeArchived: true`, filtra `status: "ARCHIVED"` y devuelve:

- `items`;
- `total`;
- `hasMore`.

La busqueda de Archivo reutiliza `searchNodes` con alcance explicito:

```text
scope: "archived"
```

El comportamiento predeterminado de `searchNodes` sigue siendo buscar capturas
activas.

## 6. Criterio de orden

El Archivo ordena por:

```text
updatedAt descendente -> id ascendente
```

El modelo actual de `Node` no tiene `archivedAt`. Como `archiveNode` actualiza
`updatedAt` al archivar, esa fecha representa temporalmente el momento de
archivado. Esta limitacion queda documentada para un paquete futuro.

## 7. Busqueda

La busqueda de Archivo:

- ignora espacios laterales;
- usa `q` en URL;
- busca titulo opcional y contenido;
- no devuelve capturas activas;
- maneja caracteres especiales;
- muestra cantidad de resultados;
- resalta coincidencias de forma segura;
- permite limpiar busqueda.

No se creo un segundo motor de busqueda.

## 8. Flujo de archivado

Desde detalle activo, `Archivar` ahora abre una confirmacion ligera:

```text
Archivar esta captura?
Podras restaurarla desde Archivo.
```

Acciones:

- `Cancelar`;
- `Archivar`.

Al confirmar, se usa `archiveNode`, se conserva el registro y se vuelve al
origen mediante `returnTo`.

## 9. Flujo de restauracion

Una captura archivada puede restaurarse desde:

- listado de Archivo;
- detalle de captura archivada.

Restaurar usa `restoreNode`, no crea copias, conserva el mismo `id`, contenido,
titulo, fecha de creacion, relaciones y contextos. El estado tecnico restaurado
es `ACTIVE`, manteniendo `type` y `organizationStatus` originales.

## 10. Detalle archivado

El detalle de captura archivada:

- abre en modo lectura;
- muestra `Captura archivada`;
- muestra contenido y fechas;
- muestra `Volver`;
- muestra `Restaurar`;
- oculta `Editar` y `Archivar`.

La captura archivada no se edita directamente desde la experiencia visible.
Primero debe restaurarse.

## 11. Conservacion de relaciones y contextos

Archivar y restaurar actualizan el registro `Node`, pero no eliminan ni recrean
relaciones. `NodeContextRelation` y `Context` permanecen intactos.

## 12. Navegacion y returnTo

Los resultados del Archivo abren detalle con:

```text
returnTo=/notes/archive
returnTo=/notes/archive?q=<consulta>
```

El boton `Volver` del detalle respeta ese origen, conservando la consulta activa.

Despues de restaurar desde Archivo se refresca la lista y se ofrece un enlace
discreto para volver a la Base de Conocimiento.

## 13. Service worker y PWA

Se agrego `/notes/archive` al precache principal. No se cambio la estrategia
general del service worker.

## 14. Archivos modificados

- `src/app/notes/archive/page.tsx`
- `src/app/notes/archive/archive-client.tsx`
- `src/app/notes/knowledge-base-client.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/features/capture/list-knowledge-captures.ts`
- `src/features/recovery/search-nodes.ts`
- `src/features/recovery/recovery-routes.ts`
- `public/sw.js`
- `README.md`
- `src/tests/archive.test.ts`
- `src/tests/note-detail-read-mode.test.ts`

## 15. Pruebas

Se agrego cobertura para:

- listado exclusivo de archivadas;
- exclusion de activas;
- orden estable;
- desempate por `id`;
- carga por lotes;
- fin de resultados;
- busqueda en archivadas;
- exclusion de activas en busqueda de Archivo;
- resaltado seguro;
- `returnTo` con consulta de Archivo;
- estado vacio y sin resultados;
- restauracion sin duplicar registro;
- detalle archivado con `Restaurar` y sin `Editar`/`Archivar`;
- confirmacion antes de archivar.

## 16. Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

No se uso Playwright.

## 17. Limitaciones

- No existe `archivedAt` en `Node`; se usa `updatedAt` como fecha temporal de
  archivado.
- No existe vista de papelera ni eliminacion definitiva.
- No hay restauracion masiva.

## 18. Deuda tecnica

- Evaluar agregar `archivedAt` sin migracion destructiva.
- Decidir si Archivo deberia tener un acceso secundario mas visible cuando el
  volumen crezca.
- Mantener la decision futura sobre renombrar `/notes`.

## 19. Siguiente paquete recomendado

Agregar una auditoria no destructiva de metadata temporal para eventos de
captura, archivado y restauracion, sin cambiar la experiencia principal ni
introducir sincronizacion.
