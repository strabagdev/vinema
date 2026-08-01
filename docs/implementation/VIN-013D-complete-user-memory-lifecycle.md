# VIN-013D - Complete User Memory Lifecycle

## Semantica

Una cuenta posee una unica memoria activa.

El workspace tecnico sigue existiendo como limite interno para aislar datos entre usuarios, pero no forma parte del modelo mental del producto.

## Inventario

La auditoria completa esta documentada en:

```text
docs/audits/VIN-013D-complete-memory-inventory.md
```

Conclusion principal: la memoria persistida real de Vinema esta compuesta por capturas, conceptos y relaciones. Archivo, Base de conocimiento, recuperacion, sugerencias e identidad emergente se derivan desde esas entidades.

## Formato v2

VIN-013D introduce el respaldo v2:

```json
{
  "format": "vinema-memory-backup",
  "version": 2,
  "exportedAt": "...",
  "applicationVersion": "0.1.0",
  "memory": {
    "captures": [],
    "concepts": [],
    "relations": []
  },
  "summary": {
    "captures": 0,
    "concepts": 0,
    "relations": 0,
    "archivedCaptures": 0,
    "archivedConcepts": 0
  },
  "integrity": {
    "algorithm": "vinema-json-stable-v1",
    "checksum": "fnv1a32:..."
  },
  "compatibility": {
    "acceptsLegacyV1": true,
    "restoredIntoCurrentAccount": true
  },
  "technical": {
    "sourceWorkspaceId": "...",
    "sourceWorkspaceName": "..."
  }
}
```

El campo `technical` existe solo para validacion interna del archivo. La UI no muestra workspace ni lo convierte en una decision del usuario.

## Compatibilidad v1

Vinema sigue aceptando:

```text
vinema-knowledge-backup v1
```

El v1 se trata como respaldo heredado parcial y se normaliza internamente al modelo de restauracion existente.

## Export

`Respaldar memoria` exporta el estado local completo de la memoria activa:

- capturas activas;
- capturas archivadas;
- conceptos activos;
- conceptos archivados;
- relaciones;
- fechas originales;
- metadata semantica sanitizada;
- checksum.

No exporta:

- tokens;
- sesiones;
- password hashes;
- dispositivos;
- outbox;
- cursores;
- errores de sync;
- credenciales;
- URLs privadas.

## Cambios Locales Pendientes

Vinema es local-first. El respaldo v2 se construye desde la memoria local canonicamente visible para el usuario, por lo que incluye cambios locales pendientes que aun no hayan sido empujados.

No exporta la outbox como infraestructura; exporta las entidades actuales.

## Restore

La restauracion mantiene el merge seguro existente:

- preflight completo;
- rechazo de conflictos;
- no aplicacion parcial;
- deduplicacion de conceptos equivalentes;
- reconstruccion de relaciones;
- sync posterior cuando se aplican cambios.

La restauracion sobre memoria vacia preserva IDs del respaldo dentro del workspace tecnico actual.

## Reset

`Vaciar memoria` conserva:

- usuario;
- sesion;
- dispositivo;
- workspace tecnico;
- preferencias tecnicas;
- estructura de almacenamiento.

Elimina:

- capturas;
- conceptos;
- relaciones;
- archivados;
- borrador;
- outbox de conocimiento;
- metadata local incompatible;
- resultados derivados al invalidar UI.

## Barrera de Generacion

VIN-013D fortalece el reset remoto con una barrera minima sin migracion.

El servidor consulta el ultimo evento `workspaceKnowledgeReset`. Si llega una mutacion cuyo `payload.updatedAt` es anterior o igual al `occurredAt` del ultimo reset, la rechaza con:

```text
MEMORY_RESET_CONFLICT
```

Esto evita que una mutacion antigua de una generacion previa reviva datos despues de vaciar memoria.

## Propagacion

El evento `workspaceKnowledgeReset` sigue viajando por Pull.

Cuando un cliente lo recibe:

- limpia `nodes`;
- limpia `contexts`;
- limpia `node_context_relations`;
- limpia `sync_mutations`;
- avanza cursor;
- invalida UI.

La limpieza local iniciada desde el centro tambien elimina el borrador.

## UI

VIN-013D actualiza el centro:

- `Respaldar memoria`;
- `Restaurar memoria`;
- `Vaciar memoria`.

No aparece la palabra workspace.

## Seguridad

VIN-013D no crea migraciones, no toca credenciales, no exporta secretos y no elimina sesiones.

La operacion remota sigue autenticada y limitada al workspace tecnico de la sesion.

## Limitaciones

- No hay tablas persistentes de embeddings o caches que reconstruir.
- El checksum es una integridad local deterministica, no una firma criptografica.
- El endpoint conserva compatibilidad de request con `workspaceId`, pero el servidor valida que coincida con la sesion.
- No se ejecuto reset real durante desarrollo.

## Flujo Manual

Ejecutar solo con confirmacion explicita del usuario:

1. Generar respaldo v2.
2. Descargarlo.
3. Abrir el JSON y revisar conteos.
4. Confirmar ausencia de secretos.
5. Guardar copia externa.
6. Abrir cliente local y web.
7. Ejecutar `Vaciar memoria`.
8. Confirmar ambas superficies vacias.
9. Recargar ambas.
10. Confirmar que siguen vacias.
11. Escribir texto nuevo y confirmar sugerencias desde cero.
12. Restaurar respaldo v2.
13. Confirmar capturas, conceptos, relaciones y archivados.
14. Confirmar Base de conocimiento.
15. Confirmar sincronizacion al segundo cliente.
