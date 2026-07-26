# VIN-005 - Contextual Thinking Model

## Objetivo

Implementar la base de dominio y persistencia para que una nota pueda aparecer
desde distintos contextos de pensamiento sin duplicarse.

Vinema no organiza informacion mediante carpetas. Areas, proyectos y personas
son perspectivas de acceso a la misma informacion, no ubicaciones fisicas ni
contenedores excluyentes.

## Modelo de dominio

VIN-005 introduce tres piezas independientes:

- `ContextType`
- `Context`
- `NodeContextRelation`

`ContextType` es un conjunto cerrado inicial:

- `AREA`
- `PROJECT`
- `PERSON`

`Context` representa un contexto de pensamiento dentro de un workspace. Guarda
su tipo, nombre, descripcion opcional y estado de archivado.

`NodeContextRelation` representa la relacion entre una nota y un contexto. Esta
relacion es independiente del nodo y del contexto.

## Relaciones

Una nota puede relacionarse con cero, uno o muchos contextos. Un contexto puede
relacionarse con cero, una o muchas notas.

La nota no almacena sus relaciones contextuales. No contiene listas de areas,
proyectos, personas ni ids de contexto. La pertenencia contextual vive solamente
en `NodeContextRelation`.

Esto permite que la misma nota aparezca desde multiples perspectivas sin
duplicarse y sin convertir ninguna perspectiva en una ubicacion fisica.

## Perspectivas derivadas

Las perspectivas `Ideas`, `Diario` y `Archivo` no se modelan como contextos en
este paquete.

- Ideas deriva de `type` y `organizationStatus`.
- Archivo deriva de `status`.
- Diario podra derivarse de fechas cuando esa perspectiva exista.

Estas perspectivas no son carpetas ni contenedores independientes.

## Persistencia

IndexedDB usa la version 4 para crear dos stores:

- `contexts`
- `node_context_relations`

`contexts` usa clave in-line con `keyPath: "id"` e indices por workspace, tipo,
archivado y workspace+tipo.

`node_context_relations` usa clave in-line con `keyPath: "id"` e indices por
workspace, nodo, contexto y un indice unico compuesto por `nodeId + contextId`
para impedir relaciones duplicadas.

La migracion preserva los nodos existentes y no agrega datos contextuales al
nodo. Los indices experimentales basados en listas embebidas dentro de `nodes`
no forman parte del esquema definitivo.

## Casos de uso

VIN-005 agrega casos de uso para:

- crear, actualizar, archivar, restaurar y listar contextos;
- asociar y desvincular notas con contextos;
- listar contextos de una nota;
- listar notas relacionadas con un contexto.

La navegacion completa por areas, proyectos y personas todavia no forma parte de
este paquete.

## Decisiones

- Los contextos no son carpetas.
- Las notas no pertenecen fisicamente a una unica ubicacion.
- Las relaciones se modelan como entidades independientes.
- Archivar un nodo no elimina sus relaciones.
- Archivar un contexto no elimina sus relaciones.
- La implementacion respeta la constitucion de Vinema: local first, offline
  first, menor carga cognitiva y pensamiento antes que organizacion manual.
