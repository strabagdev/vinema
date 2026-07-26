# VIN-006 - Gestion minima de contextos

## Objetivo

VIN-006 agrega la gestion minima de Areas, Proyectos y Personas, y permite
relacionar notas con esos contextos desde la interfaz.

El alcance se mantiene deliberadamente simple: no hay carpetas, jerarquias,
etiquetas libres, navegacion en grafo ni automatizacion.

## Relacion Con VIN-000

La implementacion respeta la constitucion de Vinema: los contextos son formas de
recordar y consultar informacion, no ubicaciones fisicas. Relacionar una nota
con un contexto no la mueve ni la duplica.

Una nota puede estar relacionada con multiples contextos al mismo tiempo y
seguir siendo una sola nota.

## Relacion Con VIN-005

VIN-006 usa el modelo aprobado en VIN-005:

- `ContextType`
- `Context`
- `NodeContextRelation`

Las relaciones se guardan de forma independiente en
`node_context_relations`. `Node` no almacena ids contextuales.

## Rutas Agregadas

- `/contexts/areas`
- `/contexts/projects`
- `/contexts/people`
- `/contexts/detail?contextId=<id>`

Todas las rutas son compatibles con export estatico. El detalle usa query params
en lugar de segmentos dinamicos.

## Areas

La vista de Areas permite listar, crear y consultar contextos `AREA`. El tipo se
deriva de la ruta; el usuario no selecciona un tipo manualmente.

## Proyectos

La vista de Proyectos permite listar, crear y consultar contextos `PROJECT`.
Estos proyectos son contextos de pensamiento, no gestores de tareas ni carpetas.

## Personas

La vista de Personas permite listar, crear y consultar contextos `PERSON`. No se
agregan datos de contacto, avatar ni campos adicionales en este paquete.

## Detalle En Modo Lectura

El detalle de contexto abre en modo lectura. Muestra tipo, nombre, descripcion,
estado y notas relacionadas. La edicion es una accion explicita.

## Edicion

La edicion de contexto usa campos simples de nombre y descripcion, con acciones
`Listo` y `Cancelar`. No usa autosave.

`Cancelar` descarta cambios visuales no persistidos. `Listo` valida y guarda.

## Archivado Y Restauracion

Archivar un contexto actualiza `archivedAt`, lo retira del listado activo y lo
muestra en archivados. Restaurar limpia `archivedAt`.

Archivar o restaurar no elimina relaciones ni modifica notas.

## Relaciones Desde Notas

El modo lectura de una nota muestra sus contextos agrupados por tipo. Los
contextos archivados relacionados siguen visibles con indicador de archivado.

Durante la edicion de una nota se pueden seleccionar contextos activos y
desvincular contextos existentes. Los cambios contextuales se mantienen en
estado local y se confirman con `Listo`.

`Cancelar` descarta cambios contextuales no guardados.

## Persistencia

VIN-006 mantiene IndexedDB version 4. No agrega stores nuevos.

Stores usados:

- `contexts`
- `node_context_relations`
- `nodes`

El contenido de la nota conserva el autosave de VIN-004. Las relaciones se
persisten aparte al presionar `Listo`, para evitar condiciones de carrera y
mantener el alcance simple.

## Decisiones De UX

- No hay arboles ni carpetas.
- No hay creacion inline de contextos desde el editor de notas.
- No hay modales complejos.
- Los contextos archivados no aparecen como opciones nuevas.
- La nota no requiere contextos para ser creada ni editada.

## Exclusiones

VIN-006 no incluye busqueda global, recomendaciones, IA, drag and drop,
relaciones entre contextos, campos dinamicos, estados de proyecto ni gestion
masiva.

## Proximos Pasos

La navegacion definitiva de Vinema podra construir perspectivas mas ricas sobre
este modelo, manteniendo los contextos como relaciones y no como ubicaciones.
