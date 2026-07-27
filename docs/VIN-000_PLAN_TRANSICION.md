# VIN-000 - Plan de transicion

## Principio

No reescribir Vinema. Convertir el estado actual en una base para validar acceso
al conocimiento con pasos pequenos y reversibles.

## Paso 1 - Consolidacion documental

Objetivo: establecer constitucion, Punto Cero, glosario y auditorias.

Cambios esperados: solo documentacion.

Archivos afectados: `docs/VIN-000_*`, `README.md`, documentos rectores.

Datos afectados: ninguno.

Compatibilidad: total.

Riesgos: duplicar documentos rectores.

Validacion: lint, typecheck, tests, build.

Criterio de finalizacion: documentos creados y referencias visibles.

## Paso 2 - Busqueda textual local

Estado tras VIN-008: implementado como linea base.

Objetivo: recuperar fuentes por frase, fragmento o tema.

Cambios esperados:

- caso de uso `searchNodes`;
- repositorio o helper de busqueda;
- ruta estatica `/search`;
- UI de resultados con fragmentos y fuente visible.

Archivos afectados:

- `src/features/node`;
- `src/infrastructure/node`;
- `src/app/search`;
- tests.

Datos afectados: ninguno inicialmente.

Compatibilidad: no requiere migracion.

Riesgos: rendimiento de scan local si crece el volumen.

Validacion: busquedas por fragmentos conocidos, tests, build.

Criterio de finalizacion: encontrar una nota sin contexto recordando solo texto.

## Paso 3 - Resultados explicables

Objetivo: mostrar por que aparecio cada resultado.

Cambios esperados:

- puntaje textual simple;
- fragmentos destacados;
- senales por titulo, contenido, fecha y relacion existente.

Datos afectados: ninguno.

Riesgos: explicaciones demasiado verbosas.

Criterio: cada resultado conserva fuente y razon breve.

## Paso 4 - Reinterpretar Context como Concept

Objetivo: decidir si se renombra o se crea capa conceptual.

Cambios esperados: documentacion, nombres de UI, posible capa de dominio.

Datos afectados: potencial migracion futura de `contexts`.

Compatibilidad: requiere plan de migracion si cambia store.

Riesgos: migracion cosmetica antes de valor real.

Criterio: decidir solo despues de busqueda funcional.

## Paso 5 - Relaciones con significado

Objetivo: evaluar tipos, direccion y evidencia de relaciones.

Cambios esperados:

- posibles campos en relaciones;
- UI de navegacion local;
- tests de trazabilidad.

Datos afectados: `node_context_relations` o nuevo store futuro.

Riesgos: complejidad cognitiva.

Criterio: agregar solo si mejora acceso medible.

## Paso 6 - Limpieza historica

Objetivo: archivar documentos o terminologia obsoleta sin perder trazabilidad.

Cambios esperados:

- posible `docs/archive`;
- README actualizado;
- glosario aplicado.

Datos afectados: ninguno.

Riesgos: borrar contexto historico.

Criterio: mantener enlaces o notas de reemplazo.

## Cambios que no deben hacerse todavia

- migraciones destructivas;
- renombrado masivo de entidades;
- IA/RAG/chatbot;
- embeddings como dependencia central;
- grafo visible;
- importacion de documentos;
- relaciones automaticas persistidas.
