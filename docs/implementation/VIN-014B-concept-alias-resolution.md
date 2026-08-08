# VIN-014B - Alias and Concept Identity Resolution

## Estado anterior

VIN-014A permitia extraer frases semanticas completas, pero la identidad persistida
de un concepto seguia dependiendo casi exclusivamente de `Context.name` y de claves
de equivalencia derivadas del label.

Eso permitia que expresiones como `Operational Core`, `OC`, `Ops Core` y
`OperationalCore` terminaran como conceptos distintos, aun cuando representaran la
misma identidad conceptual.

## Decision

Vinema distingue ahora entre:

- la forma textual que aparece en una captura;
- el label canonico visible del concepto;
- alias explicitos o derivados que permiten reconocer la misma identidad.

Un alias no es otro concepto. Es otra forma de acceder al mismo concepto.

Regla permanente:

> Un concepto puede tener muchas formas de ser nombrado, pero una sola identidad.

## Modelo minimo

`Context` incorpora dos campos opcionales y normalizados en los bordes de
persistencia:

- `aliases`;
- `normalizedAliases`.

Los contextos antiguos siguen siendo validos. Al leerse desde IndexedDB o desde
repositorios fake se normalizan con listas vacias cuando no traen alias.

## Resolucion deterministica

El nucleo puro vive en:

`src/features/concepts/concept-identity.ts`

Orden de resolucion:

1. label canonico exacto;
2. label canonico normalizado;
3. alias exacto;
4. alias normalizado;
5. sigla derivada unica;
6. ambiguo si hay mas de una coincidencia;
7. nuevo si no hay coincidencia.

No se usa similitud difusa, Levenshtein, embeddings, IA ni servicios externos.

## Normalizacion

La normalizacion cubre:

- mayusculas y minusculas;
- tildes;
- puntuacion superficial;
- guiones;
- espacios repetidos;
- variantes compactas como `OperationalCore`.

El label visible nunca se reemplaza por la forma normalizada.

## Siglas

Vinema puede derivar siglas desde el label canonico:

- `Operational Core` -> `OC`;
- `Mina Andes Norte` -> `MAN`;
- `Access Tracking` -> `AT`.

La sigla no se persiste automaticamente como alias. Si una sigla coincide con mas
de un concepto, el resultado es ambiguo y no se elige un concepto de forma
arbitraria.

## Sugerencias

Las sugerencias de conceptos existentes usan alias y siglas. Si el texto dice
`OC` y existe `Operational Core`, la sugerencia visible conserva el canonico:

`Operational Core`

y puede mostrar de forma discreta:

`Detectado como OC`

Los conceptos emergentes se filtran contra la identidad existente. Si una frase
extraida resuelve a un concepto existente por alias, no se crea un emergente
paralelo.

## Captura

Al confirmar una captura con conceptos emergentes seleccionados:

1. se resuelve la identidad existente;
2. se reutiliza el concepto canonico si hay coincidencia exacta o por alias;
3. se rechaza la resolucion si es ambigua;
4. solo se crea un `Context` nuevo si no existe coincidencia valida.

La captura no se bloquea si una relacion falla; se conserva el comportamiento
local-first previo.

## Backup y restore

Los respaldos nuevos incluyen `aliases` y `normalizedAliases` dentro de cada
concepto.

La restauracion:

- preserva alias;
- mantiene compatibilidad con respaldos antiguos sin alias;
- reutiliza conceptos existentes por label, clave historica o alias;
- marca conflicto si una identidad o alias es ambiguo;
- no fusiona conceptos silenciosamente.

## Sincronizacion

El contrato remoto de concepto incluye alias con default vacio:

- `aliases`;
- `normalizedAliases`.

Los mappers locales/remotos transportan estos campos. Prisma incorpora columnas
`TEXT[]` con default vacio para que los alias converjan entre dispositivos.

## UI minima

El panel de conceptos muestra el label canonico. Si la coincidencia vino por alias,
muestra una linea secundaria segura:

`Detectado como OC`

La misma regla visual aplica a cualquier sugerencia no literal que ya traiga una
razon desde el motor mediante `knowledgeSuggestionReasons`: la UI solo renderiza
esa explicacion disponible. Las sugerencias literales no muestran explicacion y
la interfaz no inventa motivos cuando el modelo no entrega uno.

El detalle de concepto muestra `Tambien aparece como` solo cuando hay alias.

No se implementa CRUD de alias en esta fase.

## Limites

VIN-014B no implementa:

- fusion manual de conceptos;
- edicion pesada de alias;
- similitud difusa;
- aliases sugeridos persistidos automaticamente;
- embeddings;
- IA;
- grafo semantico nuevo.

La resolucion sigue siendo deliberadamente conservadora.
