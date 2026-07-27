# VIN-019 - Motor local de asociaciones

## Objetivo

VIN-019 introduce un motor local, explicable y determinista para sugerir
capturas relacionadas mientras el usuario escribe.

El objetivo no es decidir significado automaticamente. Vinema detecta proximidad;
el usuario confirma significado seleccionando asociaciones antes de capturar.

## Estado previo

Vinema ya contaba con:

- captura principal en `/`;
- captura rapida global;
- borrador local compartido;
- Base de Conocimiento;
- busqueda textual local;
- Archivo seguro;
- contextos relacionales;
- timestamps separados para contenido, archivo y restauracion.

No existia una forma de sugerir conexiones entre capturas durante la escritura.

## Filosofia

La unidad de informacion sigue siendo la captura. VIN-019 no agrega carpetas,
etiquetas, categorias, temas, documentos ni una entidad visible nueva.

Las asociaciones confirmadas son relaciones entre capturas. Las sugerencias son
solo proximidad textual y relacional calculada localmente.

## Limites de la semantica sin IA

El motor no usa IA, embeddings ni modelos externos. Por lo tanto, no entiende el
significado profundo de una captura. Detecta cercania mediante senales
observables:

- terminos compartidos;
- frases compartidas;
- similitud TF-IDF;
- recuperacion BM25;
- n-gramas de palabras;
- n-gramas de caracteres;
- relaciones ya confirmadas;
- vecinos compartidos.

## Arquitectura

El modulo vive en:

```text
src/features/associations
```

La primera version reconstruye un indice en memoria desde IndexedDB al consultar
sugerencias. No se persisten vectores ni se agregan indices IndexedDB.

Esta decision mantiene el paquete compatible con datos existentes y evita una
migracion prematura. El rango objetivo inicial documentado es hasta 5.000
capturas locales activas.

## Normalizacion

La normalizacion aplica:

- minusculas;
- eliminacion de tildes;
- limpieza de puntuacion;
- normalizacion de espacios;
- eliminacion conservadora de palabras vacias frecuentes en espanol;
- tokens minimos;
- stemming ligero para plurales y sufijos frecuentes.

La lista de stopwords vive en `spanish-stopwords.ts` y puede ampliarse sin tocar
el motor.

## Algoritmo elegido

El puntaje final combina senales puras:

```text
score =
  BM25 * 0.34
  + lexical * 0.18
  + TF-IDF * 0.24
  + phrase * 0.14
  + character ngrams * 0.05
  + selected relation * 0.04
  + shared neighbors * 0.01
```

El resultado se normaliza entre 0 y 1. La UI no muestra el numero.

## Explicabilidad

Cada sugerencia incluye razones estructuradas:

- `TERM_MATCH`;
- `PHRASE_MATCH`;
- `SHARED_RELATION`;
- `SHARED_NEIGHBOR`.

La interfaz construye textos visibles solo desde esas razones. No inventa
explicaciones libres.

## Integracion con captura

La captura principal y la captura rapida muestran una seccion discreta:

```text
Esto me recordó a…
```

Mientras el usuario escribe:

1. se espera debounce;
2. se ignora texto demasiado corto;
3. se reconstruye el indice activo local;
4. se devuelven hasta cinco sugerencias;
5. se excluyen archivadas;
6. el foco permanece en el editor.

Seleccionar una sugerencia no persiste nada todavia.

## Persistencia de relaciones

No se creo un store nuevo. Las asociaciones confirmadas usan el store existente:

```text
node_context_relations
```

Se agregaron campos opcionales compatibles:

```ts
relationType?: "CONTEXT" | "CAPTURE_ASSOCIATION";
relatedNodeId?: string;
```

Las relaciones de contexto historicas siguen funcionando. Las asociaciones entre
capturas se guardan una sola vez con par canonico `nodeId/contextId`, marcadas
como `CAPTURE_ASSOCIATION`, y se consultan bidireccionalmente.

Si falla la persistencia de una asociacion, la captura ya creada se conserva. La
UI informa el error parcial sin duplicar la captura.

## Actualizacion del indice

El indice se reconstruye desde repositorios locales. Por eso:

- crear una captura la hace disponible en consultas posteriores;
- editar contenido cambia su representacion;
- archivar la excluye de sugerencias;
- restaurar la reincorpora;
- las relaciones persistidas alimentan senales relacionales.

No hay sincronizacion entre pestanas ni cache persistente de indice en esta
version.

## Metricas del grafo

Se agregaron utilidades puras para:

- contar relaciones directas;
- obtener vecinos;
- contar vecinos compartidos;
- calcular grado normalizado;
- detectar centros locales simples.

No se implemento PageRank, centralidad pesada ni visualizacion grafica.

## Plaza

VIN-019 no crea una entidad Plaza.

Una Plaza no se crea. Se descubre como un patron emergente alrededor de capturas
altamente conectadas.

En esta version solo existen metricas puras que podrian alimentar esa lectura en
un paquete futuro.

## Privacidad

Las asociaciones se calculan localmente en el dispositivo.

No se envia contenido a servidores externos, APIs, servicios de analitica,
modelos remotos ni almacenamiento remoto.

## Rendimiento

La reconstruccion actual recorre capturas activas del workspace y calcula el
indice en memoria. Es aceptable para colecciones pequenas y medianas.

Las pruebas cubren colecciones pequenas y comportamiento estable. Si el volumen
crece mas alla del rango objetivo inicial, convendra medir tiempos reales y
evaluar indices IndexedDB o cache local de representaciones.

## Archivos modificados

- `src/domain/context/node-context-relation.ts`
- `src/domain/context/node-context-relation-repository.ts`
- `src/infrastructure/context/indexed-db-node-context-relation-repository.ts`
- `src/features/capture/capture-flow.ts`
- `src/features/capture/capture-surface.tsx`
- `src/features/capture/quick-capture-sheet.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/tests/fakes/in-memory-node-context-relation-repository.ts`
- `src/tests/capture-surface.test.ts`
- `src/tests/quick-capture.test.ts`
- `src/tests/knowledge-base.test.ts`
- `src/tests/archive.test.ts`

## Archivos creados

- `src/features/associations/spanish-stopwords.ts`
- `src/features/associations/normalize-text.ts`
- `src/features/associations/tokenize.ts`
- `src/features/associations/ngrams.ts`
- `src/features/associations/association-types.ts`
- `src/features/associations/association-engine.ts`
- `src/features/associations/graph-metrics.ts`
- `src/features/associations/node-associations.ts`
- `src/features/associations/use-association-suggestions.ts`
- `src/features/associations/capture-association-suggestions.tsx`
- `src/tests/associations.test.ts`
- `docs/product/VIN-019-MOTOR-LOCAL-ASOCIACIONES.md`

## Pruebas

Se agrego cobertura para:

- normalizacion y stopwords;
- stemming conservador;
- n-gramas;
- BM25;
- TF-IDF;
- puntaje hibrido;
- razones explicables;
- exclusion de archivadas;
- exclusion de captura actual;
- seleccion sin persistencia temprana;
- persistencia al capturar;
- ausencia de duplicados;
- fallo parcial de relaciones;
- vecinos, grado, vecinos compartidos y centros locales.

## Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Limitaciones

- La gestion completa de asociaciones desde detalle queda fuera de esta primera
  version.
- El indice se reconstruye en memoria; no hay cache persistente.
- No hay busqueda semantica real.
- No hay deteccion multi-tab avanzada.
- Las relaciones captura-captura reutilizan un store historicamente nombrado
  `node_context_relations`.

## Deuda tecnica

- Medir rendimiento con miles de capturas reales.
- Evaluar un repositorio relacional con nombre menos historico cuando exista una
  migracion conceptual mayor.
- Diseñar gestion visible de asociaciones desde detalle.
- Decidir si el indice debe tener cache local si el volumen crece.

## Siguiente paquete recomendado

Disenar una experiencia minima para revisar y ajustar asociaciones ya
confirmadas desde el detalle, manteniendo la regla: Vinema sugiere proximidad,
el usuario confirma significado.
