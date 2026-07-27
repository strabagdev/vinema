# VIN-017 - Integridad temporal de capturas

## 1. Objetivo

Separar las fechas principales de una captura para que `updatedAt` deje de
representar simultaneamente edicion de contenido, archivado, restauracion y
mutaciones tecnicas.

El cambio es compatible con datos existentes y no realiza migraciones
destructivas.

## 2. Problema previo

Hasta VIN-016, Vinema usaba `updatedAt` para:

- ordenar Base de Conocimiento;
- ordenar Archivo;
- mostrar fechas visibles;
- registrar edicion;
- registrar archivado;
- registrar restauracion.

Eso hacia que archivar o restaurar pudiera parecer una edicion reciente y que el
Archivo dependiera de una fecha ambigua.

## 3. Auditoria de timestamps

### Creacion

`createNode` establecia `createdAt` y `updatedAt`.

### Edicion

`updateNode` modificaba `updatedAt` al cambiar titulo o contenido.

### Archivado

`archiveNode` modificaba `updatedAt` al cambiar `status` a `ARCHIVED`.

### Restauracion

`restoreNode` modificaba `updatedAt` al volver a `ACTIVE`.

### Orden

Base y Archivo ordenaban indirectamente por `updatedAt`.

### Presentacion

Detalle mostraba `Actualizada` usando `updatedAt`, incluso si el cambio era
archivar o restaurar.

## 4. Modelo temporal implementado

Se agregaron campos opcionales al modelo `Node`:

```ts
contentUpdatedAt?: string;
archivedAt?: string | null;
restoredAt?: string | null;
```

`updatedAt` se conserva como fecha tecnica de ultima mutacion del registro.

## 5. Semantica de fechas

### `createdAt`

Fecha de creacion original. No cambia.

### `contentUpdatedAt`

Fecha de ultima modificacion real de titulo o contenido. Cambia al editar y al
convertir una idea en captura organizada si se genera titulo.

No cambia al archivar ni restaurar.

### `archivedAt`

Fecha en que se archivo la captura. Se establece al archivar y se limpia al
restaurar.

### `restoredAt`

Fecha de la restauracion mas reciente. Se establece al restaurar.

### `updatedAt`

Fecha tecnica de ultima mutacion persistida. No se usa como fecha visible de
edicion.

## 6. Estrategia de compatibilidad

No se subio la version de IndexedDB porque los object stores aceptan objetos
flexibles y no se agregaron indices.

Los campos nuevos son opcionales. Para datos historicos:

```text
contentUpdatedAt = updatedAt ?? createdAt
```

Para capturas archivadas antiguas:

```text
archivedAt = updatedAt ?? createdAt
```

Ese fallback es una estimacion de compatibilidad, no un hecho historico exacto.

## 7. Utilidad temporal

Se centralizo la logica en:

```text
src/features/capture/capture-timestamps.ts
```

Incluye:

- `getCaptureTimestamps`;
- `getContentTimestamp`;
- `getArchivedTimestamp`;
- `compareByContentTimestamp`;
- `compareByArchivedTimestamp`.

## 8. Flujo de creacion

Una captura nueva establece:

```text
createdAt = now
contentUpdatedAt = now
updatedAt = now
archivedAt = null
restoredAt = null
```

## 9. Flujo de edicion

Editar titulo o contenido establece:

```text
contentUpdatedAt = now
updatedAt = now
```

Conserva:

- `createdAt`;
- `archivedAt`;
- `restoredAt`;
- `id`;
- relaciones;
- contextos.

## 10. Flujo de archivado

Archivar establece:

```text
archivedAt = now
updatedAt = now
```

Conserva `contentUpdatedAt`, por lo que archivar no aparece como edicion.

## 11. Flujo de restauracion

Restaurar establece:

```text
archivedAt = null
restoredAt = now
updatedAt = now
```

Conserva `contentUpdatedAt`, por lo que restaurar no hace que una captura antigua
suba en Base como si hubiera sido editada.

## 12. Orden de Base

La Base de Conocimiento ordena por:

```text
contentUpdatedAt descendente
id ascendente como desempate
```

Consecuencia: crear y editar suben una captura; archivar/restaurar no falsean su
fecha de contenido.

## 13. Orden de Archivo

El Archivo ordena por:

```text
archivedAt descendente
id ascendente como desempate
```

Para datos historicos sin `archivedAt`, se usa fallback desde `updatedAt`.

## 14. Presentacion visible

### Base

Muestra la fecha de contenido relevante.

### Archivo

Muestra la fecha de archivado.

### Detalle

Muestra:

- `Creada`;
- `Editada`, solo si `contentUpdatedAt` difiere de `createdAt`;
- `Archivada`, si corresponde.

Ya no muestra `updatedAt` como "Actualizada" visible.

## 15. Busqueda

`searchNodes` conserva el motor textual, pero la fecha de resultado ahora usa:

- `contentUpdatedAt` en busqueda activa;
- `archivedAt` en busqueda de Archivo.

El ranking textual no cambia.

## 16. IndexedDB y persistencia

No se cambio el esquema ni la version de la base `vinema`. No se agregaron
indices ni migraciones. Los registros nuevos persistiran los campos nuevos; los
registros antiguos seguiran cargando mediante fallback.

## 17. Archivos modificados

- `src/domain/node/node.ts`
- `src/features/capture/capture-timestamps.ts`
- `src/features/capture/list-knowledge-captures.ts`
- `src/features/recovery/search-nodes.ts`
- `src/features/node/create-node.ts`
- `src/features/node/update-node.ts`
- `src/features/node/archive-node.ts`
- `src/features/node/restore-node.ts`
- `src/features/node/convert-idea-to-note.ts`
- `src/app/notes/knowledge-base-client.tsx`
- `src/app/notes/archive/archive-client.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/features/capture/capture-surface.tsx`
- `src/tests/capture-timestamps.test.ts`

## 18. Pruebas

Se agrego cobertura para:

- compatibilidad de registros antiguos;
- fechas iniciales al crear;
- edicion actualizando `contentUpdatedAt`;
- archivado sin modificar `contentUpdatedAt`;
- restauracion sin modificar `contentUpdatedAt`;
- Base ordenada por fecha de contenido;
- Archivo ordenado por fecha de archivado;
- desempate por `id`;
- presentacion de fechas en detalle mediante tests existentes y actualizados.

## 19. Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

No se uso Playwright.

## 20. Limitaciones

Los registros historicos archivados sin `archivedAt` usan `updatedAt` como
estimacion. No existe historial completo de eventos ni auditoria detallada.

## 21. Deuda tecnica

- Evaluar indices IndexedDB para `contentUpdatedAt` y `archivedAt` cuando el
  volumen lo justifique.
- Definir si `restoredAt` debe mostrarse en alguna superficie futura.
- Diseñar historial de eventos solo si sincronizacion o auditoria lo requieren.

## 22. Siguiente paquete recomendado

Revisar rendimiento de consultas temporales cuando el volumen crezca y decidir
si se justifica una migracion versionada para indices de fecha.
