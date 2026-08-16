# Cognitive Engine

Vinema evoluciona mediante motores cognitivos pequeños, locales y deterministas.
El objetivo no es agregar pantallas, sino mejorar la capacidad de observar la
memoria del usuario sin aumentar su carga cognitiva.

## Memory Evidence Model

El `MemoryEvidenceModel` es la capa temporal compartida para motores cognitivos
que leen capturas, conceptos y asociaciones. No fusiona motores ni agrega
semántica: normaliza la evidencia observable para que Behavioral Engine, Memory
Evolution y Knowledge Suggestions no reimplementen reglas temporales o filtros
de actividad.

Responsabilidades:

- construir nodos de evidencia desde `Node`, `Context` y
  `NodeContextRelation`;
- consolidar identidad conceptual y aliases por captura;
- aceptar solo relaciones de concepto vigentes y excluir
  `CAPTURE_ASSOCIATION`;
- calcular ventanas reciente, anterior, histórica y dormancia cuando aplica;
- construir series temporales de conceptos y relaciones;
- exponer conteos, dispersión mensual, primera evidencia, última evidencia y
  conexiones principales con orden determinista.

Regla de archivado y ausencia:

- `deletedAt` excluye una captura de la evidencia cognitiva;
- `node.archivedAt` representa una captura olvidada/tombstone y también la
  excluye;
- `context.archivedAt` se conserva como compatibilidad histórica y no excluye
  por sí solo un concepto de análisis cognitivo;
- las relaciones no aceptadas y las asociaciones descartadas no participan.

## Behavioral Engine v1

El Behavioral Engine observa series compartidas de evidencia y detecta patrones
demostrables. No interpreta significado, no sugiere acciones y no usa IA,
embeddings, LLM ni servicios externos.

Patrones implementados:

- `RECURRENT_PAIR`: dos conceptos aparecen juntos varias veces.
- `EMERGING_RELATIONSHIP`: una relación aumenta en el periodo reciente frente
  al periodo anterior equivalente.
- `DECLINING_RELATIONSHIP`: una relación antes activa disminuye claramente.
- `STABLE_RELATIONSHIP`: una relación se mantiene distribuida en el tiempo.
- `RECURRING_CLUSTER`: un grupo pequeño de conceptos aparece repetidamente.

Reglas:

- consume `MemoryEvidenceModel` cuando el orquestador ya lo construyó;
- solo capturas presentes en evidencia compartida;
- solo asociaciones aceptadas;
- capturas eliminadas u olvidadas mediante `node.archivedAt` no cuentan;
- conceptos con `context.archivedAt` legado pueden seguir contando mientras
  exista evidencia activa;
- asociaciones descartadas no cuentan;
- aliases no se tratan como conceptos independientes;
- una captura cuenta una sola vez por patrón;
- los patrones son derivados y no se persisten;
- el tiempo actual puede inyectarse para pruebas.

Límites:

- no interpreta semántica;
- no explica causas;
- no crea relaciones con verbo;
- no activa memoria proactiva;
- no genera visualizaciones de grafo;
- no modifica el motor de conceptos ni la sincronización.

Invariantes:

- todo resultado debe reconstruirse desde `Context`, `Node` y
  `NodeContextRelation`;
- los ids son estables y derivados del tipo de patrón y los conceptos;
- el orden de salida es determinista;
- reset o restore se reflejan al recalcular, sin migraciones ni persistencia
  adicional.

## Semantic Understanding v1

El Semantic Understanding Engine detecta relaciones semánticas explícitas dentro
del texto de las capturas. Interpreta únicamente expresiones demostrables en una
misma oración y no infiere causalidad desde coocurrencia.

Relaciones explícitas soportadas:

- `IS_A`;
- `PART_OF`;
- `LOCATED_IN`;
- `USES`;
- `DEPENDS_ON`;
- `PRODUCES`;
- `CREATES`;
- `WORKS_AT`;
- `WORKS_WITH`;
- `RESPONSIBLE_FOR`.

También existe `RELATED_TO` como señal contextual interna de baja confianza,
derivada de recurrencia conductual. No reemplaza relaciones verbales explícitas.

Reglas de evidencia:

- source y target deben ser conceptos aceptados en la captura;
- ambos conceptos deben aparecer en la misma oración;
- la expresión verbal conocida debe estar entre ambos conceptos;
- aliases se consolidan bajo el concepto canónico;
- dos capturas explícitas independientes elevan la confianza a `HIGH`;
- una captura explícita clara produce `MEDIUM`;
- señales contextuales quedan en `LOW` y no se muestran en UI.

Negación, dudas y preguntas:

- una oración negada no produce afirmación positiva;
- preguntas no producen afirmaciones;
- expresiones de duda no producen afirmaciones;
- contradicciones directas se marcan sin decidir cuál evidencia es verdadera.

Límites:

- no usa IA, LLM, embeddings ni servicios externos;
- no crea conceptos automáticamente;
- no persiste relaciones concepto-concepto;
- no realiza razonamiento encadenado;
- no renderiza grafos.

## Memory Evolution v1

El Memory Evolution Engine observa cambios temporales demostrables en las series
de conceptos compartidas. No interpreta por qué ocurren ni propone acciones.

Señales implementadas:

- `NEW_CONCEPT`: concepto cuya primera aparición es reciente.
- `GROWING_CONCEPT`: actividad reciente mayor que el periodo anterior.
- `STABLE_CONCEPT`: actividad sostenida y distribuida.
- `DECLINING_CONCEPT`: actividad reciente menor que actividad previa relevante.
- `DORMANT_CONCEPT`: concepto previamente activo sin apariciones recientes.
- `REVIVED_CONCEPT`: concepto con historia que reaparece tras inactividad.
- `SHIFTING_CONTEXT`: conexiones recientes distintas de conexiones históricas.

Ventanas temporales iniciales:

- reciente: últimos 30 días;
- anterior: 30 días previos equivalentes;
- dormancia: 90 días sin nuevas apariciones.

Reglas:

- consume `MemoryEvidenceModel` cuando el orquestador ya lo construyó;
- solo capturas presentes en evidencia compartida;
- solo asociaciones aceptadas;
- capturas eliminadas u olvidadas mediante `node.archivedAt` no cuentan;
- conceptos con `context.archivedAt` legado pueden seguir contando mientras
  exista evidencia activa;
- aliases no generan conceptos duplicados;
- timestamps originales gobiernan restore y backup;
- reset elimina señales al no existir evidencia local;
- `now` puede inyectarse para pruebas.

Límites:

- no predice actividad futura;
- no archiva ni elimina conceptos;
- no sugiere acciones;
- no explica causalidad;
- no modifica Behavioral Engine, Semantic Understanding ni relaciones derivadas.

## Knowledge Suggestions v1

El Knowledge Suggestions Engine convierte señales cognitivas derivadas en
sugerencias de conocimiento existente mientras el usuario escribe. Su propósito
es ayudar a recordar en el momento de captura, no organizar manualmente ni
predecir lo que el usuario debería hacer.

Tipos implementados:

- `RELATED_NOW`: conceptos existentes relacionados con lo que está presente en
  la captura actual.
- `MISSING_CONTEXT`: conceptos que históricamente aparecen dentro del mismo
  grupo contextual y podrían faltar en la captura.
- `REVISIT`: conceptos antiguos, dormidos o reactivables que vuelven a ser
  relevantes por su relación con el texto actual.

Fuentes de señal:

- relaciones derivadas entre conceptos;
- patrones del Behavioral Engine;
- afirmaciones del Semantic Understanding Engine;
- señales temporales del Memory Evolution Engine;
- conceptos detectados directamente en el texto actual;
- conceptos seleccionados explícitamente por el usuario.
- similitud semántica local hacia conceptos existentes, solo para
  `RELATED_NOW`.

Reglas:

- solo sugiere conceptos existentes;
- no crea conceptos automáticamente;
- no usa IA generativa, LLM ni servicios externos;
- no usa similitud semántica local para `MISSING_CONTEXT` por sí sola;
- no persiste sugerencias;
- no modifica `Node`, `Context` ni `NodeContextRelation`;
- no muestra sugerencias de baja confianza en la superficie principal;
- excluye capturas eliminadas u olvidadas mediante `node.archivedAt`;
- conserva conceptos con `context.archivedAt` legado si tienen evidencia activa;
- excluye conceptos ya presentes o seleccionados;
- consolida aliases bajo el concepto canónico;
- ordena de forma determinista por confianza, evidencia e intención contextual.

Integración de producto:

- la superficie principal agrupa sugerencias visibles como `Relacionado ahora`,
  `Podría faltar` y `Retomar`;
- las sugerencias literales no necesitan explicación. Toda sugerencia no literal
  debe mostrar de forma breve el origen disponible en el motor de Vinema;
- hoy esa explicación viaja en los campos existentes `matchedAlias` y
  `knowledgeSuggestionReasons`;
- seleccionar una sugerencia reutiliza el flujo existente de aceptación de
  conceptos;
- las sugerencias emergentes existentes continúan siendo locales a la captura y
  no se convierten automáticamente en conceptos persistidos.
- una selección explícita de texto dentro del editor puede convertirse en
  concepto aceptado para la captura actual; primero se resuelve contra conceptos
  canónicos, aliases normalizados y acrónimos, y solo crea un concepto nuevo
  cuando el usuario lo confirma.

Límites:

- no decide por el usuario;
- no explica causas profundas;
- no propone acciones;
- no genera navegación nueva;
- no reemplaza la recuperación “Me recuerda a”;
- no sincroniza datos adicionales.

## Semantic Similarity Engine v1

El Semantic Similarity Engine agrega evidencia probabilística local para
recordar capturas parecidas aunque no compartan las mismas palabras. No declara
verdad, causalidad ni relación persistente entre capturas.

Implementación inicial:

- usa embeddings locales de capturas activas con
  `intfloat/multilingual-e5-small` mediante Transformers.js y ONNX Runtime
  Web/WASM;
- carga el runtime de forma lazy y reutiliza tokenizer/modelo mientras la app
  viva;
- convierte Markdown a texto plano con los helpers de rich text existentes y
  normaliza solo espacios y saltos repetidos;
- conserva acentos, idioma y forma original; no aplica stemming,
  lematización ni traducción;
- aplica los prefijos E5 de forma centralizada: `query: {texto}` para consultas
  de capturas, `passage: {texto}` para capturas almacenadas y conceptos
  almacenados, y usa consulta semántica equivalente para buscar vecinos de un
  concepto;
- almacena vectores normalizados en IndexedDB como `ArrayBuffer`, nunca como
  `number[]`;
- calcula similitud por producto punto/coseno sobre vectores normalizados con
  búsqueda lineal local.

Reglas:

- las embeddings se guardan en un repositorio local no sincronizado;
- cada registro incluye modelo, versión, dimensiones, hash de fuente y estado
  `PENDING`, `PROCESSING`, `READY` o `FAILED`;
- el hash se deriva del texto plano normalizado para reutilizar embeddings
  válidos y descartar resultados obsoletos;
- capturas con `deletedAt` o `node.archivedAt` no se embeben ni aparecen como
  resultados;
- los conceptos pueden tener una representación vectorial derivada desde
  `MemoryEvidenceModel`, identidad canónica, aliases y evidencia representativa
  limitada;
- `CONCEPT_REPRESENTATION_VERSION = 1` participa en el hash conceptual junto a
  nombre canónico, aliases y evidencia usada;
- la cola procesa en segundo plano, con reintentos limitados, sin bloquear
  escrituras locales;
- si una captura cambia mientras se procesa, el resultado viejo se descarta y
  se encola la versión nueva;
- backfill, pull aplicado, restore/import y nuevas capturas pueden pedir
  actualización gradual del índice local.

Politica de uso:

- Search optimiza precision; Discovery optimiza recall.
- En busqueda manual, Semantic Similarity complementa evidencia literal y
  conceptual, pero no la desplaza.
- En busqueda manual, Semantic Similarity no constituye evidencia suficiente de
  elegibilidad por si sola: `VECTOR_SIMILARITY` puede enriquecer o desempatar un
  resultado ya respaldado, pero nunca producir un resultado independiente.
- “Me recuerda a” conserva una politica exploratoria mas amplia y puede usar el
  umbral semantico interno provisional para sugerir vecinos utiles. Discovery
  puede utilizar similitud vectorial como fuente independiente de candidatos.

Integración:

- participa solo como fuente adicional de recuperación interna para
  “Me recuerda a” y búsqueda de Memoria;
- puede sugerir conceptos existentes para `RELATED_NOW` cuando una captura es
  semánticamente cercana a la representación de un concepto;
- puede exponer conceptos semánticamente cercanos entre sí como evidencia de
  exploración/perfil;
- corre en paralelo conceptual con señales literales, conceptos, relaciones y
  tiempo;
- no alimenta `MISSING_CONTEXT` por sí sola;
- no persiste `NodeContextRelation` ni relaciones concepto-concepto;
- no sincroniza texto, vectores ni metadatos de embeddings.

Disponibilidad:

- funciona en `AUTHENTICATED_LOCAL` sin API, Railway ni sync remoto;
- PWA descarga/cachea el modelo en el primer uso según soporte del navegador;
- Tauri usa la misma estrategia común por ahora; empaquetar el modelo queda para
  una fase posterior;
- si el modelo, WASM o caché no están disponibles, Vinema conserva las fuentes
  existentes sin mostrar errores dramáticos ni degradar salud;
- no hay API externa, telemetría ni logs del texto embebido.

Límites:

- la similitud es probabilística y calibrada de forma interna;
- la similitud captura-concepto puede sugerir conceptos existentes, pero nunca
  aceptarlos automáticamente ni crear conceptos nuevos;
- la similitud concepto-concepto no constituye una relación persistida;
- no existe umbral universal duro aplicable a todo usuario o idioma;
- BPE, tokenización y pooling pertenecen al modelo/runtime, no a reglas de
  Vinema;
- no reemplaza Semantic Understanding ni Evidence Fusion.

## Memory Orchestrator v1

El Memory Orchestrator es la capa pública superior del Motor Cognitivo. No
descubre conocimiento nuevo: coordina motores existentes y devuelve una única
respuesta estructurada, derivada y respaldada por evidencia.

Responsabilidades:

- recibir una consulta de memoria con texto, conceptos detectados, conceptos
  seleccionados y fecha de observación;
- resolver identidad conceptual y aliases;
- coordinar perfiles de concepto;
- coordinar relaciones derivadas;
- coordinar Behavioral Engine;
- coordinar Semantic Understanding;
- coordinar Memory Evolution;
- coordinar Knowledge Suggestions;
- construir la evidencia temporal compartida una vez por consulta para los
  motores que comparten ventanas equivalentes;
- fusionar resultados;
- deduplicar conceptos, relaciones, patrones, señales, sugerencias y evidencia;
- ordenar la respuesta de forma determinista;
- entregar un `MemorySummary` apto para cualquier UI futura.

Motores coordinados:

- Concept Profiles;
- Derived Relationships;
- Behavioral Engine;
- Semantic Understanding;
- Memory Evolution;
- Knowledge Suggestions.

Flujo:

1. Resolver conceptos de la consulta.
2. Derivar perfiles.
3. Derivar relaciones.
4. Obtener patrones conductuales.
5. Obtener significados semánticos.
6. Obtener señales de evolución.
7. Obtener sugerencias de conocimiento.
8. Fusionar y deduplicar.
9. Ordenar.
10. Devolver `MemoryResponse`.

Reglas:

- no persiste;
- no crea tablas;
- no modifica IndexedDB;
- no modifica Prisma;
- no altera scores ni resultados internos de los motores;
- no introduce IA, LLM ni embeddings;
- no inventa relaciones ni evidencia;
- las APIs previas se mantienen como internas;
- la UI futura debe consumir `deriveMemoryResponse()` como punto de entrada
  cognitivo.
