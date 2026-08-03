# Cognitive Engine

Vinema evoluciona mediante motores cognitivos pequeños, locales y deterministas.
El objetivo no es agregar pantallas, sino mejorar la capacidad de observar la
memoria del usuario sin aumentar su carga cognitiva.

## Behavioral Engine v1

El Behavioral Engine observa la memoria y detecta patrones demostrables. No
interpreta significado, no sugiere acciones y no usa IA, embeddings, LLM ni
servicios externos.

Patrones implementados:

- `RECURRENT_PAIR`: dos conceptos aparecen juntos varias veces.
- `EMERGING_RELATIONSHIP`: una relación aumenta en el periodo reciente frente
  al periodo anterior equivalente.
- `DECLINING_RELATIONSHIP`: una relación antes activa disminuye claramente.
- `STABLE_RELATIONSHIP`: una relación se mantiene distribuida en el tiempo.
- `RECURRING_CLUSTER`: un grupo pequeño de conceptos aparece repetidamente.

Reglas:

- solo capturas activas;
- solo conceptos activos;
- solo asociaciones aceptadas;
- capturas archivadas o eliminadas no cuentan;
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

El Memory Evolution Engine observa cambios temporales demostrables en conceptos
y conexiones. No interpreta por qué ocurren ni propone acciones.

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

- solo capturas activas;
- solo conceptos activos;
- solo asociaciones aceptadas;
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

Reglas:

- solo sugiere conceptos existentes;
- no crea conceptos automáticamente;
- no usa IA, LLM, embeddings ni servicios externos;
- no persiste sugerencias;
- no modifica `Node`, `Context` ni `NodeContextRelation`;
- no muestra sugerencias de baja confianza en la superficie principal;
- excluye capturas archivadas o eliminadas;
- excluye conceptos archivados;
- excluye conceptos ya presentes o seleccionados;
- consolida aliases bajo el concepto canónico;
- ordena de forma determinista por confianza, evidencia e intención contextual.

Integración de producto:

- la superficie principal agrupa sugerencias visibles como `Relacionado ahora`,
  `Podría faltar` y `Retomar`;
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
