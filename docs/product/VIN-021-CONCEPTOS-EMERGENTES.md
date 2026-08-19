# VIN-021 - Conceptos emergentes

## Problema anterior

VIN-020 separo recuperacion y conceptos, pero los conceptos debian existir antes
en persistencia. Si el usuario nunca habia creado un contexto, Vinema podia
recordar capturas parecidas pero no podia proponer un concepto nuevo desde ese
patron.

## Decision conceptual

La recuperacion es la evidencia desde la cual nace el conocimiento. El motor
semantico evalua el texto una vez y produce dos salidas:

- capturas similares;
- conceptos existentes o emergentes.

El usuario no crea conceptos manualmente en este flujo. Solo confirma o descarta
lo que Vinema propone.

## Motor semantico unico

Se creo `evaluateCaptureInput()`.

La funcion es pura, determinista y recibe datos ya cargados. No lee IndexedDB,
no persiste, no toca React y no crea relaciones.

La evaluacion comparte:

- normalizacion;
- tokenizacion;
- indice semantico;
- ranking de recuperacion;
- relaciones cargadas;
- diagnosticos.

## Recuperacion

La recuperacion mantiene el comportamiento de VIN-020:

- filas de una linea;
- truncamiento visual por CSS;
- apertura de detalle;
- conservacion del borrador;
- sin checkbox;
- sin relaciones directas.

## Evidencia

Los conceptos emergentes se derivan solo desde capturas recuperadas. No se
analiza toda la base para inventar conceptos en cada pulsacion.

La evidencia se limita a una ventana controlada de recuperacion y exige varias
capturas con patron compartido.

## Cluster candidato

Un cluster candidato es una hipotesis temporal basada en:

- capturas recuperadas;
- terminos representativos;
- frecuencia dentro de la evidencia;
- score de recuperacion;
- ausencia de concepto existente equivalente.

No se persiste hasta confirmacion.

## Concepto consolidado

`Context` se reutiliza como concepto consolidado por compatibilidad historica.
No se elimina ni migra el modelo existente.

Un concepto existente se sugiere cuando su nombre o sus capturas asociadas
explican la consulta.

## Concepto emergente

Un concepto emergente incluye:

- `candidateId` estable;
- etiqueta sugerida;
- score;
- capturas de evidencia;
- terminos representativos.

La UI lo muestra igual que un concepto existente. El estado emergente se
conserva internamente para persistencia y diagnosticos, pero no se expone como
texto visible.

## Etiquetado

El etiquetado no usa servicios externos ni LLM.

La estrategia inicial prioriza terminos recurrentes no genericos y etiquetas
conocidas para expresiones frecuentes, por ejemplo `Perfumes` o `Reuniones`.
Si no hay etiqueta clara, no se sugiere concepto.

Desde VIN-021.1, si la evidencia contiene una expresion repetida, la etiqueta
preserva su orden textual y su forma natural antes de reconstruir nombres desde
tokens individuales.

## Umbrales

Los umbrales quedan centralizados en el motor:

- minimo de capturas de evidencia;
- minimo de frecuencia de termino;
- minimo de score emergente;
- minimo de score individual de evidencia.

El sistema prefiere no sugerir nada antes que mostrar ruido.

## Deduplicacion

Si existe un concepto equivalente, se prioriza el existente y se elimina el
emergente equivalente.

La comparacion normaliza minusculas, acentos, espacios y una equivalencia simple
entre `reunion` y `reuniones`.

Desde VIN-021.2, las comparaciones para conceptos emergentes y la normalizacion
historica tambien detectan inversiones artificiales como `Carbon Rare` frente a
`Rare Carbon` sin modificar casos ambiguos.

## Confirmacion

Seleccionar un concepto existente guarda su relacion al capturar.

Seleccionar un emergente mantiene el candidato temporal. Al capturar:

1. se comprueba si ya existe un concepto equivalente;
2. se reutiliza si existe;
3. se crea si no existe;
4. se asocia la nueva captura;
5. se asocian capturas de evidencia del candidato.

Deseleccionar o ignorar no persiste nada.

## Persistencia

La persistencia usa `Context` y `node_context_relations`.

Los conceptos emergentes confirmados se guardan como contextos compatibles de
tipo `AREA`. Esta es una decision de compatibilidad: no introduce una entidad
nueva ni una migracion destructiva.

## Compatibilidad historica

Se preservan:

- contextos existentes;
- relaciones `node_context_relations`;
- relaciones `CAPTURE_ASSOCIATION`;
- capturas existentes;
- IndexedDB.

VIN-021.2 agrega una rutina idempotente de normalizacion de etiquetas
persistidas. Cuando hay evidencia suficiente, renombra o fusiona conceptos
invertidos y archiva duplicados sin borrar datos historicos.

## Rendimiento

La deteccion emergente opera sobre la ventana de recuperacion, no sobre toda la
base. El hook sigue leyendo capturas, contextos y relaciones una vez por
evaluacion debounced.

## Diagnosticos

Los diagnosticos incluyen:

- capturas evaluadas;
- candidatos de evidencia;
- clusters detectados;
- sugerencias existentes;
- sugerencias emergentes;
- tiempos de cluster, etiquetas y deduplicacion.

Se activan con:

```js
sessionStorage.setItem("vinema:association-diagnostics", "1")
```

## Pruebas

Se agregaron pruebas para:

- evaluacion semantica unica;
- concepto existente `Reuniones`;
- concepto emergente `Perfumes`;
- confirmacion emergente;
- descarte emergente;
- deduplicacion contra existente;
- evidencia minima;
- persistencia de nueva captura y evidencia.

## Validacion manual

No se uso Playwright. La validacion manual en navegador queda pendiente para el
usuario o para una ejecucion futura solicitada explicitamente.

## Limitaciones

La etiqueta emergente es heuristica y conservadora. La persistencia emergente usa
`Context` tipo `AREA` por compatibilidad hasta que el dominio defina una entidad
`Concept` independiente.

## Siguiente paso funcional

Despues de cerrar la secuencia actual de calibracion, incluyendo Captura 5 y una
captura final de prueba antes de guardar, queda planificado automatizar la
asociacion de conceptos al guardar una captura:

- conceptos detectados directamente/localmente en la captura se asocian
  automaticamente;
- conceptos recuperados por significado, relaciones o memoria se muestran como
  contexto relacionado, pero no se asocian automaticamente;
- el flujo normal no deberia requerir que el usuario seleccione manualmente
  todos los conceptos;
- mantener abierta la posibilidad de intervencion manual unicamente para casos
  ambiguos.
