# VIN-010B — Restore Emerging Concepts

## Contexto

La superficie principal de Vinema ya ejecutaba el motor local de asociaciones al escribir. El flujo real era:

1. `CaptureSurface` envía el texto actual a `useAssociationSuggestions`.
2. El hook lee capturas, contextos y relaciones del workspace actual.
3. `evaluateCaptureInput` calcula recuperación y sugerencias conceptuales.
4. `ConceptSuggestionChips` solo se renderiza cuando recibe sugerencias.
5. `commitCaptureText` persiste un contexto emergente únicamente si el usuario selecciona su chip.

El problema no estaba en el render de la superficie ni en la persistencia posterior. El motor sí se ejecutaba, pero la rama de conceptos emergentes dependía exclusivamente de clusters con evidencia histórica.

## Diagnóstico

`detectEmergingConcepts` exigía al menos tres capturas recuperadas antes de devolver cualquier concepto emergente. Cuando el usuario escribía una captura nueva con un término fuerte pero sin suficiente evidencia previa, el resultado era:

- recuperación: podía funcionar o quedar vacía;
- conceptos existentes: dependían de contextos ya creados;
- conceptos emergentes: siempre vacíos si había menos de tres capturas de evidencia.

Por eso `ConceptSuggestionChips` recibía `[]` y no aparecía. La derivación conceptual quedaba vacía aunque el motor hubiera procesado correctamente el texto.

## Corrección

Se mantuvo la vía original basada en evidencia y se agregó una vía controlada para el texto actual.

La nueva vía solo crea sugerencias emergentes cuando hay señal suficiente:

- términos conocidos por el motor, como `Railway`, `Mitcom` o `Reuniones`;
- términos con forma de nombre propio;
- expresiones con capitalización consistente, como `Rare Carbon`.

No se crean sugerencias para texto vacío, textos demasiado cortos o frases genéricas. Tampoco se persiste nada automáticamente.

## Existentes vs emergentes

Los conceptos existentes siguen teniendo prioridad. Si existe un contexto equivalente, la sugerencia emergente se descarta y se muestra el contexto real.

Los conceptos emergentes siguen siendo candidatos temporales:

- aparecen como chips;
- pueden ignorarse sin bloquear la captura;
- si se seleccionan, se crea o reutiliza un `Context`;
- la nueva captura queda relacionada con ese contexto.

## Persistencia

La persistencia sigue concentrada en `commitCaptureText`.

Cuando un concepto emergente nace desde el texto actual, puede no tener capturas de evidencia previas. En ese caso la descripción del contexto queda documentada como confirmada desde la captura actual, no desde un número falso de capturas históricas.

## Alcance

Este cambio no modifica:

- la superficie principal;
- el componente `Me recuerda a`;
- el modelo de dominio;
- la sincronización;
- la creación automática de conceptos no seleccionados;
- la noción de título.

## Pruebas cubiertas

Se agregaron regresiones para validar:

- conceptos emergentes desde el texto actual;
- ausencia de ruido en texto vacío, corto o genérico;
- deduplicación contra contextos existentes;
- render del chip en la superficie principal;
- selección del chip;
- creación de contexto al capturar;
- creación de relación entre captura y contexto;
- limpieza de chips al vaciar el editor;
- protección contra respuestas asincrónicas obsoletas.

