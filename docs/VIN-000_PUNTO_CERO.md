# VIN-000 - Punto Cero

## 1. Proposito

El Punto Cero define la linea base consciente desde la cual Vinema continuara.
No reinicia el repositorio ni borra trabajo previo. Distingue que se conserva,
que se adapta y que deja de orientar el nucleo.

## 2. Estado actual

Vinema es una aplicacion Next.js local-first/offline-first con persistencia en
IndexedDB. Permite capturar ideas, crear notas, editar con autosave, archivar,
crear contextos de Area/Proyecto/Persona, relacionarlos con notas y recuperar
fuentes mediante busqueda textual local.

La recuperacion ya no depende solo de listados, navegacion por contextos manuales
y orden temporal. Existe una linea base textual offline por titulo, contenido y
contextos asociados.

## 3. Elementos conservados

- `Node` como fuente textual inicial.
- Captura rapida en Inbox.
- Conversion de IDEA a NOTE sin duplicacion.
- Detalle de nota en modo lectura.
- Edicion explicita y autosave de contenido.
- Archivado reversible.
- Persistencia local IndexedDB.
- Rutas estaticas con query params.
- Busqueda textual local como primera capa de recuperacion.
- Separacion dominio/casos de uso/infraestructura.
- Tests unitarios con fake-indexeddb.

## 4. Elementos adaptados

- `Context` se conserva como punto de entrada provisional, pero debe dejar de
  orientar el roadmap como taxonomia principal.
- Areas, Proyectos y Personas se interpretan como casos iniciales de concepto,
  no como ubicaciones ni carpetas.
- `NodeContextRelation` se conserva como antecedente de relaciones entre fuente
  y concepto.
- La navegacion lateral debera seguir dando prioridad progresiva a acceso y
  busqueda, no a clasificacion manual.

## 5. Elementos congelados

No ampliar por ahora:

- tipos de `ContextType`;
- campos especificos de proyecto/persona/area;
- gestion avanzada de contextos;
- relaciones entre contextos;
- visualizaciones de grafo.

## 6. Elementos fuera del nucleo

Quedan fuera del MVP inmediato:

- markdown avanzado;
- documentos externos;
- OCR;
- audio/video;
- IA generativa;
- RAG;
- chatbot;
- embeddings como condicion;
- sincronizacion remota;
- grafo global visible.

## 7. Elementos a retirar posteriormente

No se elimina codigo en esta tarea. Deben revisarse mas adelante:

- lenguaje de UI que haga pensar en proyectos/personas/areas como clasificacion
  previa;
- documentos historicos que llamen a Vinema "aplicacion de notas" sin matiz;
- README desactualizado cuando avance el modelo de recuperacion;
- posible nombre `Context` si se valida que `Concept` comunica mejor.

## 8. Riesgos

- Continuar con contextos configurables antes de mejorar recuperacion.
- Convertir conceptos en etiquetas tradicionales.
- Hacer una migracion conceptual prematura.
- Confundir fuente con conocimiento procesado.
- Disenar una UI de grafo antes de validar acceso.

## 9. Decisiones pendientes

- Si `Fuente` y `Captura` seran entidades distintas.
- Si `Node` debe renombrarse a `Source`, `Note` o mantenerse interno.
- Si `Context` debe migrar a `Concept`.
- Si las relaciones necesitan tipo, direccion y evidencia en el MVP.
- Que significa "navegar" en la primera version.
- Como medir esfuerzo cognitivo sin analitica pesada.

## 10. Siguiente incremento recomendado

Mejorar la explicabilidad y ergonomia de los resultados de recuperacion.

Objetivo: que una persona no solo encuentre una nota, sino que entienda
rapidamente por que aparecio y pueda refinar la pista sin transformar Vinema en
un sistema de filtros o carpetas.

No implementar todavia IA, embeddings, grafos ni migraciones destructivas.
