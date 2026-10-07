# Consolidación de la promoción conceptual

La promoción local evalúa una unidad de conocimiento mediante cuatro señales: especificidad, autonomía, acción episódica y dependencia circunstancial. La decisión no depende del orden de los filtros ni del score de ranking. Se conserva el contrato original de 14 casos y se agregan ocho casos de generalización. No hay listas de conceptos positivos ni excepciones para sus nombres.

La referencia anterior es el commit `d6cc997b6cdbdeb2918a9a7821e946071b20f677`. La auditoría distingue condiciones de extracción, decisión conceptual, clasificación de evidencia y ranking. «Penalización» en las tablas describe un rechazo booleano, no una resta al score.

## Auditoría de extracción anterior

Estas condiciones estaban en `semantic-phrase-extractor.ts`. Las dependencias de `semantic-tokenizer.ts`, `structural-tokens.ts` y `normalize-text.ts` no cambian.

| Condición | Problema que intenta resolver | Señal positiva o penalización | Duplicación | Idioma | Generalización y eliminación |
|---|---|---|---|---|---|
| Tokenizar letras/números y compuestos con punto/guion; separar por puntuación y saltos de línea | Preservar referencias y evitar cruzar oraciones | Delimitación | Ninguna | Neutral | Conservar |
| Normalizar acentos, minúsculas, espacios y signos | Comparar formas visibles equivalentes | Identidad léxica | Compartida con asociaciones | Neutral, sensible a diacríticos | Conservar; no inferir lemas |
| Un término técnico, nombre capitalizado no inicial, o sustantivo saliente | Generar candidatos individuales | Positiva | Técnica/capitalización reaparecen en promoción | Neutral salvo evidencia nominal | Conservar como extracción |
| Forma técnica: mayúsculas/números, mayúscula+dígito, mayúscula+punto/guion, camel case | Detectar referencias por su forma | Positiva | Se reutiliza en promoción/ranking | Principalmente alfabeto latino | Conservar; no es un catálogo de términos conocidos |
| Nombre individual: `start > 0`, mayúscula y no capitalización puramente inicial de segmento | Evitar confundir inicio de oración con nombre propio | Positiva y filtro | Posición reaparece en promoción | Neutral | Conservar como indicio de extracción |
| Sustantivo saliente: longitud ≥6; no límite corto, adverbio, presente ni infinitivo; longitud ≥8 o evidencia nominal estructural | Evitar palabras aisladas débiles | Positiva y filtro | Longitudes 6/7/8 y filtros verbales se superponen | Morfología española | Conservar alcance; retirar comprobaciones inertes |
| Evidencia nominal estructural: longitud ≥7, término corto anterior, no infinitivo y ningún siguiente sustantivo/modificador útil | Evitar cortar un compuesto | Positiva y filtro | Comparte el test de infinitivo y límites | Español/forma léxica | Conservar |
| Evidencia de sustantivo aislado junto a término corto anterior/posterior | Permitir referencias nominales dentro de texto | Positiva | `(index === 1 && short(previous))` está cubierto por `short(previous)` | Neutral aproximada | Eliminar rama de índice y parámetro |
| `isLikelyAdjective` y `isLikelyGerund` | Supuesta desambiguación morfológica | Sin efecto: siempre `false` | Invocaciones repetidas | Supuestamente español | Eliminar funciones y llamadas |
| Ventanas contiguas de 2/3/4 tokens en un solo segmento | Enumerar fragmentos acotados | Delimitación | Ninguna | Neutral | Conservar |
| Inicio/final corto o incompleto; inicio dependiente | Evitar fragmentos incompletos | Penalización | `shortBoundary` ya incluye `incompleteBoundary` | Lista española + longitud neutral | Eliminar chequeos redundantes de final incompleto |
| Inicio capitalizado de segmento seguido de término corto distinto de `de/del` | Evitar encabezados sintácticos incompletos | Penalización | Usa inicio de segmento y conectores | Español | Conservar alcance |
| `isTemporalComplementFragment` | Supuesto filtro temporal | Sin efecto: siempre `false` | Ninguna efectiva | Supuestamente español | Eliminar |
| Verbo presente + artículo + nombre, o presente + infinitivo; excepción de frase visiblemente propia | Evitar extraer predicados como temas | Penalización | Presente/infinitivo ya intervienen en estructura nominal | Español | Conservar en extracción; no resolver NLP |
| Presente: palabra alfabética ≥6, no nominalización/infinitivo y sufijos `an/en/iza/iona/tiene/duce/mite/fine` | Aproximar formas verbales | Penalización | `iona` repetido tres veces | Español | Eliminar repeticiones, conservar reconocimiento |
| Infinitivo de extracción: base ≥5 y sufijos `ar/er/ir` con algunas formas pronominales | Aproximar acciones | Penalización o candidato de acción | Test de promoción similar pero con otro umbral | Español | Conservar extracción; documentar diferencia |
| Nominalización `cion/sion/dad/tad/miento/mento/aje/ncia/anza`; adverbio largo acabado en `mente` | No confundir nombres derivados con verbos/adverbios | Positiva/filtro | Se aplica en evidencia de sustantivos | Español | Conservar |
| Al menos dos términos no conectores | Evitar frases vacías | Positiva | Promoción vuelve a exigir especificidad | Neutral | Conservar: extracción no garantiza conceptualidad |
| Todos los términos significativos capitalizados/técnicos/números, estructura nominal o infinitivo+objeto | Exigir alguna forma reconocible para generar una frase | Positiva | Capitalización se vuelve a evaluar después | Neutral + nominal español | Conservar como generación de candidatos |
| Sustantivo enlazado: conector `de/del`; 1/2 términos antes y uno después; ≤3 significativos; sin infinitivos; término ≥8 o todos alfabéticos ≥4 | Evitar fragmentos conectados demasiado amplios | Positiva/filtro | Dos funciones llaman al mismo patrón flexible | Español | Conservar patrón y llamadas con responsabilidades distintas |
| Frase nominal general: no límites/dependientes/infinitivos/adverbios/presentes; con conector, patrón flexible; sin él, dos términos y modificador ≥4 + nombre ≥8 o dos palabras alfabéticas ≥4 | Generar temas por estructura | Positiva/filtro | Límite incompleto y adjetivo inerte | Español + forma neutral | Retirar redundancias; conservar estructura |
| Infinitivo+objeto: dos tokens, o tres con término corto central; no absorber siguiente nombre/modificador del mismo segmento | Permitir extraer acciones sin promoverlas automáticamente | Positiva de extracción | Se confunde con conceptualidad si se acepta la fuente sin evaluación | Español | Conservar separación |
| Infinitivo inicial sin patrón de acción; conector interno sin patrón nominal; nombre técnico absorbido después de conector | Evitar candidatos mal delimitados | Penalización | `isAllowedProperConnectorPhrase` siempre `false` | Español + forma técnica | Retirar función inerte, mantener rechazo efectivo |
| Derivación verbo+adverbio con nominalización/adjetivo | Supuesta generación de conceptos derivados | Sin efecto: ambas funciones devuelven `null` | Rama completa inalcanzable | Supuestamente español | Eliminar bucle, constructor y dos funciones |
| Fuente y score por estructura, cantidad de mayúsculas/técnicos y cantidad de términos; score máximo 0.96 | Ordenar candidatos de extracción | Prioridad; no promoción | Ranking posterior reutiliza score | Neutral | Conservar pesos |
| Deduplicar por texto normalizado y mejor score; suprimir candidatos contenidos y términos únicos incluidos en compuestos | Evitar fragmentos redundantes | Selección | Supresión individual se repite tras derivar etiquetas | Neutral | Conservar ambas: etiquetas posteriores pueden cambiar |
| Ordenar por score, posición y etiqueta; máximo 12 | Acotar los candidatos enviados al siguiente paso | Selección de extracción | No es el ranking final de sugerencias | Neutral | Conservar límite y orden |
| Capitalizar etiquetas nominales; conservar etiquetas propias/técnicas | Mostrar fragmentos legibles sin perder su forma | Presentación | Capitalización posterior de primera letra | Neutral | Conservar |

## Auditoría de promoción anterior

Estas condiciones estaban en `capture-input-evaluation.ts`. Se enumeran también sus funciones auxiliares; no se cuentan los filtros de memoria como promoción local.

| Condición | Problema | Positiva o penalización | Duplicación | Idioma | Consolidación o eliminación |
|---|---|---|---|---|---|
| Fuente entre las cinco fuentes locales | Excluir evidencia histórica | Filtro | El extractor local nunca produce `HISTORICAL_EVIDENCE` | Neutral | Retirar puerta inalcanzable de este circuito; clasificación de evidencia intacta |
| No cruzar coma, paréntesis, corchetes ni llaves | Evitar fragmentos dependientes | Penalización | Extracción ya limita segmentos, pero no esos signos | Neutral | Agrupar en dependencia |
| Término ≥4, no estructural y con soporte local significativo | Evitar referencias débiles | Positiva/filtro | Soporte significativo exige ≥5 y ya excluye estructurales | Neutral | Usar directamente `isMeaningfulLocalSupportToken` |
| Términos no vacíos; primer y último token no vacíos | Evitar candidatos vacíos | Filtro | Un candidato del extractor con términos ya tiene superficie | Neutral | Integrar términos no vacíos en especificidad; eliminar puerta de superficie redundante |
| Algún término en lista de acciones | Evitar predicados/circunstancias verbales conocidos | Penalización | Infinitivo detecta parte de la lista, pero no verbos conjugados ni adverbios | Español | Agrupar en acción episódica; no añadir vocabulario |
| Primer/último término en lista de límites débiles | Evitar complementos circunstanciales | Penalización | Debilidad del término único vuelve a comprobarse | Español | Agrupar en dependencia; quitar repetición individual |
| Algún conector inválido (`a/es/esta/estan/fue/son`) | Evitar fragmentos predicativos | Penalización | Extracción tiene otros límites, no exactamente este filtro | Español | Agrupar en dependencia |
| Un único término tras infinitivo + prefijo sólo estructural | Evitar promover el objeto de una tarea como tema | Penalización | Se evaluaba sólo dentro de rama individual | Español | Integrar en señal episódica conservando alcance individual |
| Individual: fuente técnica o término ≥8 | Exigir especificidad sin compuesto | Positiva | Longitud técnica/nominal reaparece en extracción | Neutral | Agrupar en especificidad, no basta por sí sola |
| Infinitivo inicial en frase con objeto | Evitar acciones puntuales | Penalización | Detección verbal duplicada con extracción | Español | Un predicado de superficie compartido por evaluación y ranking |
| Recurrencia explícita `todo/a/os/as los/las` | Distinguir práctica de episodio | Positiva | Era excepción posterior al rechazo de acción | Español | Feature de acción episódica; conservar evidencia explícita |
| Fuente `CAPITALIZED_PHRASE` | Evitar promover nombres incidentales por mayúsculas | Filtro por rama | Confunde fuente de extracción con conceptualidad | Neutral | Integrar indicios en autonomía sin rama especial |
| Frase técnica: todos los términos útiles tienen forma técnica | Permitir referencia independiente por forma | Positiva | Ya contribuye a extracción y ranking | Neutral | Feature de autonomía |
| Frase inicial: `start === 0`, varios términos útiles y capitalización mixta o texto completo | Permitir encabezados y temas visibles | Positiva | Posición/capitalización/igualdad se acumulaban como excepciones | Neutral | Feature conjunta de autonomía; no nueva excepción por nombre |
| Varias palabras capitalizadas incrustadas no técnicas | Evitar nombres incidentales | Penalización implícita | Es el complemento de la condición anterior | Neutral | Ausencia de autonomía; razón explícita |
| Etiqueta de frase propia enlazada: quitar cola capitalizada después de conector | Evitar absorber autor/nombre después del tema | Derivación de etiqueta | No decide aceptación | Neutral, conectores cortos | Conservar fuera de evaluación |
| Etiqueta sin términos significativos | Evitar sugerencias vacías después de derivar la etiqueta | Filtro de salida | Parece duplicar términos iniciales, pero la derivación cambia el texto | Neutral | Conservar |
| Deduplicar etiqueta sin depender del orden de sus términos y conservar mejor score | Evitar duplicados conceptuales | Identidad/prioridad | Deduplicación del extractor usa otra clave | Neutral | Conservar |
| Suprimir término individual si aparece en otro compuesto local | Evitar sugerencias redundantes | Selección | Extractor suprime antes de derivar etiquetas | Neutral | Conservar |
| Equivalencia con concepto existente: identidad exacta/alias/ambigua o igualdad del conjunto de términos | Evitar duplicar concepto persistido | Correspondencia existente | Identidad y subconjunto exacto se complementan | Neutral | Conservar fuera de conceptualidad |

La cadena central tenía nueve `if` y nueve operadores `&&/||`: aproximadamente 18 condiciones/decisiones sintácticas. El flujo local y sus auxiliares sumaban 13 `if` y 16 operadores booleanos. No equivale a 18 reglas semánticas independientes: varias comprobaciones eran defensas o repeticiones.

## Evidencia y ranking conservados

| Etapa | Regla efectiva | Problema y naturaleza | Idioma / duplicación / decisión |
|---|---|---|---|
| Conceptos existentes | Texto completo, frases y tokens resuelven identidad canonical/alias/forma compacta/acrónimo; coincidencias directas y de capturas relacionadas producen score; selección aporta boost; umbral 0.18 | Recuperar identidad conocida; no crear un concepto por heurística nueva | Neutral; implementación intacta |
| CURRENT_TEXT existente | Coincidencia directa o concepto seleccionado/presente en entrada | Clasificar origen de evidencia | No es conceptualidad; intacto |
| CURRENT_TEXT local | Candidato aceptado, sin IDs de capturas de evidencia | Clasificar origen directo | No es score; intacto |
| MEMORY | Evidencia histórica o conocimiento relacionado sin concepto presente en entrada | Clasificar origen histórico | Circuito independiente; intacto |
| Score local | Score de extracción + fuente (`0.08/0.06/0.04/0.02/-0.08`) + compuesto (≤0.09) + conector (0.03) + acción aceptada (0.22) + técnico (0.04) + longitud ≥10 (0.02); acotado a [0,0.98] | Ordenar sólo candidatos conceptualmente válidos | Forma neutral y conectores españoles; seis ajustes conservados, no umbral conceptual |
| Ranking final | Score, prioridad local dentro de margen 0.05, cantidad de evidencia, tipo y etiqueta estable | Ordenar sugerencias válidas | No decide CURRENT_TEXT/MEMORY; intacto |

La correspondencia con un concepto existente continúa resolviéndose en identidad/deduplicación. No se usa para convertir una acción no aceptada en un concepto nuevo. El límite de 12 candidatos y sus scores de extracción se conserva; es selección de fragmentos, no el ranking final.

## Modelo consolidado

`assessConceptuality(candidate, fullText)` devuelve las cuatro señales, una decisión y cuatro razones independientes. No recibe memoria, nodos, relaciones ni fechas, y no consulta el score del candidato. La evidencia y el ranking se aplican después.

| Señal | Features conservadas | Interpretación |
|---|---|---|
| Especificidad | Algún término útil; compuesto útil, forma técnica conocida o término largo | El fragmento tiene suficiente contenido léxico |
| Autonomía | Unidad individual, estructura nominal del extractor, forma técnica o contexto de encabezado inicial/completo | El fragmento puede nombrarse sin depender únicamente de un nombre incidental capitalizado |
| Acción episódica | Vocabulario verbal existente, infinitivo sin recurrencia explícita, objeto individual dependiente de infinitivo | Predomina una acción concreta sobre una unidad reutilizable |
| Dependencia circunstancial | Puntuación interna, límites débiles y conectores predicativos existentes | El fragmento no es autosuficiente |

La decisión es `specific && autonomous && !episodic && !dependent`. No se introduce un número de «conceptualidad» ni un umbral arbitrario. El score numérico existente queda exclusivamente en ranking. La longitud, capitalización y posición no bastan para aceptar un candidato: una acción larga/capitalizada sigue siendo episódica.

Se conserva la distinción entre un objeto individual episódico y una frase nominal completa dentro de una instrucción: `Ir al supermercado` no promueve `Supermercado`, mientras `Aprender fotografía analógica` conserva `Fotografía analógica`. Unificar ambos como «todo objeto de infinitivo es episódico» rompe comportamiento existente.

La única corrección funcional es reconocer enclíticos españoles en el mismo predicado general de infinitivo (`me/te/se/nos/os/le/les/lo/la/los/las`) y aplicar la señal episódica también a candidatos individuales. No se añadieron nombres, verbos concretos ni conceptos a las tablas léxicas.

## Simplificación medida

Conteo mediante AST de TypeScript sobre los mismos ámbitos, incluyendo callbacks y auxiliares. Los cuatro ternarios nuevos sólo eligen textos explicativos y no intervienen en la decisión.

| Ámbito | Antes | Después |
|---|---|---|
| Flujo de extracción: `if` | 42 | 38 |
| Extracción: operadores booleanos | 104 | 92 |
| Extracción: ternarios | 14 | 14 |
| Promoción local + auxiliares: `if` | 13 | 2 |
| Promoción local + evaluación: operadores booleanos | 16 | 22 |
| Ternarios de explicación | 0 | 4 |
| Decisión conceptual central | 9 salidas condicionadas | 1 fórmula sobre 4 señales |

La simplificación no pretende eliminar todos los features: algunos operadores booleanos aumentan al hacer explícitas las señales. La reducción real está en las ramas de aceptación, la eliminación de auxiliares inertes/duplicados y la independencia entre decisión, razones, evidencia y ranking.

## Aceptación original

`∅` significa ningún concepto CURRENT_TEXT con memoria vacía. Los candidatos y resultados anteriores se capturaron antes de modificar código.

| Texto | Candidatos antes y después | Antes | Después | Señal decisiva |
|---|---|---|---|---|
| Daily Report | Daily Report | Daily Report | Daily Report | Especificidad + autonomía |
| Entrenamiento guitarra | Entrenamiento guitarra | Entrenamiento guitarra | Entrenamiento guitarra | Especificidad + autonomía |
| Machine Learning | Machine Learning | Machine Learning | Machine Learning | Especificidad + autonomía |
| Informe Diario | Informe Diario | Informe Diario | Informe Diario | Especificidad + autonomía |
| Project Management | Project Management | Project Management | Project Management | Especificidad + autonomía |
| Control Documental | Control Documental | Control Documental | Control Documental | Especificidad + autonomía |
| Planificación Semanal | Planificación Semanal | Planificación Semanal | Planificación Semanal | Especificidad + autonomía |
| Proyecto solar departamento | Proyecto solar; Solar departamento | Proyecto solar | Proyecto solar | Primera autónoma; segunda coincide con forma de infinitivo |
| Comprar pan | ∅ | ∅ | ∅ | No genera candidato |
| Enviar correo al jefe | Enviar correo | ∅ | ∅ | Acción episódica |
| Lavar ropa | Lavar ropa | ∅ | ∅ | Acción episódica; especificidad insuficiente |
| Llamar a Juan | Juan | ∅ | ∅ | Objeto episódico; especificidad insuficiente |
| Ir al supermercado | Supermercado | ∅ | ∅ | Objeto episódico |
| Revisar esto después | Esto después | ∅ | ∅ | Especificidad insuficiente |

## Generalización

| Texto | Candidatos antes y después | Antes | Después | Señal decisiva |
|---|---|---|---|---|
| Arquitectura software | Arquitectura software | Arquitectura software | Arquitectura software | Especificidad + autonomía |
| Reunión semanal | Reunión semanal | Reunión semanal | Reunión semanal | Especificidad + autonomía |
| Gestión documental | Gestión documental | Gestión documental | Gestión documental | Especificidad + autonomía |
| Data Analytics | Data Analytics | Data Analytics | Data Analytics | Especificidad + autonomía |
| Comprar detergente | Comprar detergente | ∅ | ∅ | Acción episódica |
| Cambiar ampolleta baño | Ampolleta baño | ∅ | ∅ | Objeto episódico individual tras filtrar términos cortos |
| Sacar la basura | ∅ | ∅ | ∅ | No genera candidato |
| Escribirle a Pedro | Escribirle; Pedro | Escribirle, incorrecto | ∅ | Infinitivo con enclítico; objeto episódico |

## Validación

La suite original permanece en `semantic-core-acceptance.test.ts`, ampliada con los casos nuevos. Comprueba los candidatos exactos, salida CURRENT_TEXT, repetibilidad, ocho permutaciones independientes de nodos/conceptos/relaciones y el ciclo de confirmación, persistencia, reapertura de IndexedDB y recuperación para todos los positivos.

`conceptuality.test.ts` verifica instrucciones capitalizadas, enclíticos distintos, independencia del score, prácticas recurrentes, temas dentro de instrucciones y razones de dependencia. Los tests existentes de extracción, asociaciones y UI siguen vigentes.

Una comparación exploratoria sobre 401 textos literales de los tests de asociaciones, extracción y aceptación más los ocho nuevos casos no encontró cambios en candidatos extraídos. El único cambio de sugerencias con memoria vacía fue eliminar `Escribirle`. Esta comparación no constituye una prueba de equivalencia para todo texto posible.

Las tablas léxicas españolas, longitudes, posición de encabezado y patrones morfológicos siguen siendo aproximaciones. Agruparlas no las convierte en análisis lingüístico completo. El objetivo del refactor es que se pueda explicar y probar la interacción entre las señales existentes, sin sumar un carril, modelo, servicio ni capacidad semántica.

Verificación final:

- `npm test -- --run`: 1163 tests, 92 archivos; todos pasan.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: correcto.
- `npm run build`: correcto; exportación de 21 páginas completada.
- `git diff --check`: correcto.

Sin cambios en CURRENT_TEXT/MEMORY, recoveryMatches, sync, IndexedDB, persistencia ni arquitectura local-first. Sin commit ni push de este refactor.
