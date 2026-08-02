# VIN-014A - Semantic Phrase Extraction Core

## Regla de producto

Vinema sugiere unidades de significado, no palabras aisladas.

Un concepto puede ser una palabra, una frase nominal, un nombre propio compuesto, una marca, un producto, una persona, un lugar, un proyecto o una expresion significativa.

## Problema anterior

El flujo anterior de conceptos emergentes del input actual estaba concentrado en `collectInputConceptCandidates()` dentro de `capture-input-evaluation.ts`.

Ese flujo:

- tokenizaba principalmente palabras;
- agregaba palabras individuales capitalizadas si aparecian despues del inicio del texto;
- generaba solo bigramas y trigramas capitalizados;
- ordenaba por score y label;
- limitaba el resultado visible a tres sugerencias.

Por eso, en:

```text
Los perfumes que quiero comprar son Ombre Leather de Tom Ford y Erba Pura.
```

el motor podia sugerir partes como `Ombre`, `Ford` o `Erba`. La frase completa existia parcialmente como posibilidad heuristica, pero competia con tokens individuales y podia perderse por ordenamiento, limite visual o falta de supresion por contencion.

## Arquitectura

VIN-014A separa tres responsabilidades:

1. Extraccion textual: detectar unidades presentes en el texto.
2. Resolucion conceptual: comparar esas unidades con conceptos existentes.
3. Asociacion con memoria: relacionar texto actual con capturas previas.

La implementacion nueva vive en:

- `src/features/semantics/semantic-tokenizer.ts`;
- `src/features/semantics/semantic-phrase-extractor.ts`.

La integracion con sugerencias existentes sigue ocurriendo en `capture-input-evaluation.ts`.

## Tokenizacion

El tokenizador semantico preserva:

- texto original;
- indices de inicio y fin;
- capitalizacion;
- tildes en el label visible;
- numeros;
- puntos y guiones internos significativos.

Ejemplos preservados:

- `Next.js`;
- `VIN-013D`;
- `212 VIP Black`;
- `Ombre Leather`;
- `Tom Ford`.

La normalizacion se usa para comparar, no para mostrar.

## Candidatos

El extractor genera candidatos de uno a cuatro tokens cuando existen senales fuertes:

- terminos conocidos;
- nombres propios compuestos;
- frases capitalizadas;
- frases con conectores internos validos;
- frases nominales simples.

No genera combinaciones ciegas. Rechaza fragmentos como:

- `quiero comprar`;
- `de Tom`;
- `Access Tracking debe`;
- `Base de conocimiento necesita`.

## Stopwords y conectores

Las stopwords no forman conceptos por si solas.

Algunas pueden aparecer dentro de una frase valida:

- `Banco de Chile`;
- `Base de conocimiento`;
- `Motor de conceptos`.

Los conectores no permiten unir cualquier cosa. Por ejemplo, `Ombre Leather de Tom Ford` se divide en las unidades utiles `Ombre Leather` y `Tom Ford`.

## Puntuacion

El score es interno y no se muestra en UI.

Senales positivas:

- termino conocido completo;
- varias palabras capitalizadas consecutivas;
- patron tecnico;
- frase nominal reconocible;
- longitud informativa razonable;
- posicion estable en el texto.

Senales negativas:

- empieza o termina en stopword;
- contiene verbo generico;
- absorbe un nombre propio dentro de una frase nominal;
- es subfrase de un candidato mayor;
- es una palabra generica.

## Supresion por contencion

Si existe una unidad mayor, se suprimen sus partes accidentales:

- `Tom Ford` suprime `Tom` y `Ford`;
- `Ombre Leather` suprime `Ombre` y `Leather`;
- `Erba Pura` suprime `Erba` y `Pura`;
- `Mina Andes Norte` suprime `Mina Andes` y `Andes Norte`;
- `Base de conocimiento` suprime `Base` y `Conocimiento`.

Una palabra puede mantenerse si aparece independientemente o si ya es un concepto existente consolidado.

## Existentes vs emergentes

La regla existente se mantiene:

- `EXISTING`: Context persistido con coincidencia exacta normalizada.
- `EMERGING`: frase nueva detectada desde el texto actual.

Un concepto existente exacto gana frente a un emergente equivalente.

Un concepto existente parcial no destruye una frase nueva mas completa. Si existe `Ford` y el texto dice `Tom Ford`, Vinema puede sugerir `Ford` como existente y `Tom Ford` como emergente.

## Corpus

Casos cubiertos:

- `Perfumes`;
- `Ombre Leather`;
- `Tom Ford`;
- `Erba Pura`;
- `Operational Core`;
- `Gestion contractual`;
- `Mina Andes Norte`;
- `Access Tracking`;
- `PostgreSQL`;
- `Next.js`;
- `212 VIP Black`;
- `Banco de Chile`;
- `El Teniente`;
- `Base de conocimiento`;
- `Sincronizacion automatica`;
- `Motor de conceptos`.

## Integracion UI

La superficie principal no cambia su comportamiento funcional:

- las sugerencias aparecen como conceptos emergentes;
- siguen requiriendo aceptacion manual;
- no se persisten hasta capturar;
- no modifican `Me recuerda a`;
- no cambian sync, auth ni persistencia.

El limite visual de conceptos emergentes del input actual queda en cinco sugerencias.

## Reset y memoria vacia

Con memoria vacia, Vinema puede sugerir frases desde el texto actual.

Despues de un reset completo, el extractor no revive conceptos eliminados porque no lee persistencia historica para crear candidatos actuales. Solo vuelve a sugerir lo que aparece en el texto que el usuario esta escribiendo.

## Limitaciones

No se implementa:

- alias;
- tipos de concepto;
- relaciones semanticas persistidas;
- embeddings;
- IA;
- grafo persistido;
- servicio externo.

El extractor es determinista y conservador. Prefiere sugerir menos conceptos antes que llenar la superficie de ruido.
