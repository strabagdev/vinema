# VIN-000 - Auditoria de dominio

## Modelo actual

Entidad central actual: `Node`.

`Node` representa texto capturado por el usuario. En UI aparece como Nota o
Idea. En dominio es una fuente textual inicial, aunque el nombre no lo exprese
todavia.

Entidades complementarias:

- `Context`: punto de entrada manual con tipo `AREA`, `PROJECT` o `PERSON`.
- `NodeContextRelation`: relacion entre `Node` y `Context`.
- `Workspace`: espacio local.
- `Device`: instalacion local.

## Modelo conceptual objetivo

Modelo provisional:

```text
Fuente original
      ↓
Contenido capturado
      ↓
Conceptos
      ↓
Relaciones
      ↓
Memoria navegable
      ↓
Acceso al conocimiento
```

El modelo minimo debe probar si el usuario encuentra informacion con menos
esfuerzo usando fuentes, conceptos y relaciones que usando ubicaciones.

## Respuestas de auditoria

1. Entidad central hoy: `Node`.
2. El sistema esta centrado en notas/ideas textuales.
3. `Node` representa contenido capturado y puede ser tratado como fuente textual
   inicial.
4. No hay diferencia persistida entre contenido, fuente y conocimiento.
5. Los conceptos existen parcialmente como `Context`, pero con tipos cerrados.
6. Las relaciones son entidades de dominio (`NodeContextRelation`), no simples
   arrays.
7. Las relaciones no tienen tipo, direccion, origen ni significado explicito.
8. Una fuente puede vincularse a multiples contextos/conceptos.
9. Un `Context` puede existir sin notas relacionadas.
10. Hay trazabilidad desde contexto a nota y desde nota a contexto; no hay
    trazabilidad para conocimiento derivado porque aun no existe.
11. La navegacion no depende de carpetas ni jerarquias.
12. La busqueda no existe; los listados dependen de recencia y relaciones.
13. El modelo permite probar parcialmente la hipotesis, pero falta busqueda.
14. Reutilizable: `Node`, relaciones independientes, timestamps, repositorios.
15. Requiere migracion conceptual: `Context` hacia `Concept` si se valida.
16. Cambios costosos: renombrar stores/dominio antes de una estrategia de
    compatibilidad; migrar relaciones sin plan.
17. Evitar decidir todavia: tipos de relaciones, grafo visible, embeddings,
    separacion Fuente/Captura.

## Coincidencias con el objetivo

- No hay carpetas.
- Las notas no guardan ids contextuales.
- La fuente textual original se conserva.
- Una nota puede relacionarse con multiples puntos de entrada.
- IndexedDB local-first protege propiedad de datos.

## Conflictos

- `ContextType` limita conceptos a tres clases.
- No existe busqueda textual.
- No hay relacion concepto-concepto.
- No hay explicacion de por que una fuente aparece.
- Tiempo solo ordena, no guia recuperacion.

## Reutilizacion posible

`Node` puede mantenerse como nombre interno mientras se valida Fuente. `Context`
puede reinterpretarse temporalmente como Concepto tipado. `NodeContextRelation`
puede evolucionar a `SourceConceptRelation` o `NoteConceptRelation`.

## Cambios necesarios

1. Implementar busqueda textual local.
2. Agregar lenguaje de fuente/concepto en docs y gradualmente en UI.
3. Medir si contextos manuales ayudan a acceder o agregan friccion.
4. Diseñar relaciones con significado solo cuando exista necesidad.

## Riesgos de migracion

- Migrar `Context` a `Concept` sin validar busqueda puede ser trabajo cosmetico.
- Introducir relaciones tipadas puede complicar captura.
- Crear una entidad `Source` demasiado pronto puede duplicar `Node`.

## Incognitas

- Si una captura textual es Fuente o Captura.
- Si `Node` debe seguir existiendo como entidad generica.
- Si los conceptos nacen manualmente, por seleccion de texto o sugeridos.
- Si todas las relaciones necesitan evidencia.

## Recomendacion del modelo minimo

Mantener por ahora:

```text
Node
Context
NodeContextRelation
```

Agregar busqueda textual y tratar `Node` como fuente textual. No migrar schema en
el Punto Cero. Evaluar `Concept` despues de validar recuperacion por fragmentos.
