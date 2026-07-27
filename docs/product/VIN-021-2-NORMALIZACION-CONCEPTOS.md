# VIN-021.2 - Normalizacion de conceptos

## Contexto

VIN-021 introdujo conceptos emergentes confirmables desde patrones de capturas
recuperadas. VIN-021.1 corrigio la generacion de etiquetas para preservar
expresiones naturales como `Rare Carbon` u `Ombre Leather`.

VIN-021.2 cierra dos efectos residuales: la interfaz exponia el estado interno
`nuevo` y algunas instalaciones podian conservar conceptos persistidos con
etiquetas invertidas creadas antes de la correccion.

## Problema visual

El chip de un concepto emergente mostraba un sufijo como `Rare Carbon · nuevo`.
Ese sufijo describia una condicion tecnica, no una decision que el usuario
necesite tomar. Para la experiencia de Vinema, un concepto existente y uno
pendiente de confirmacion son la misma cosa visible: una forma de recordar la
captura actual.

## Problema de datos historicos

Antes de preservar expresiones completas, algunas etiquetas podian derivarse de
tokens ordenados por peso. Eso permitia persistir nombres como:

- `Carbon Rare`
- `Leather Ombre`
- `Meeting Sponsor`
- `Documental Control`

La correccion nueva evita que se creen mas etiquetas invertidas, pero no corrige
por si sola los contextos ya guardados en IndexedDB.

## Decision de interfaz

Los chips muestran solo el nombre del concepto. El estado interno sigue
existiendo en los tipos de sugerencia:

- `existing`: concepto ya persistido.
- `emerging`: concepto temporal que se creara o reutilizara al capturar.

La accesibilidad conserva una descripcion humana de la evidencia, sin exponer
terminos tecnicos como `emergente`, `Context` o `IndexedDB`.

## Normalizacion persistida

Se incorporo `normalizePersistedConceptLabels()`, una rutina explicita,
testeable e idempotente que opera al inicializar el workspace local. La rutina:

- lista conceptos activos del workspace;
- agrupa candidatos por una clave equivalente;
- revisa evidencia textual asociada;
- elige una etiqueta canonica solo cuando hay senales suficientes;
- renombra conceptos unicos invertidos;
- fusiona duplicados seguros;
- transfiere relaciones al concepto canonico;
- elimina relaciones duplicadas;
- archiva el concepto duplicado sin borrar datos historicos.

## Equivalencia

`createConceptEquivalenceKey()` normaliza minusculas, acentos, puntuacion,
espacios y terminos significativos. La clave ordena tokens para detectar
inversiones potenciales:

```text
Rare Carbon  -> carbon|rare
Carbon Rare  -> carbon|rare
Ombré Leather -> leather|ombre
Leather Ombre -> leather|ombre
```

Esta clave no decide automaticamente una fusion. Solo identifica conceptos que
merecen revision.

## Canonicalidad

La etiqueta canonica se elige desde expresiones repetidas en capturas asociadas.
Si las capturas repiten `Rare Carbon`, ese orden gana sobre `Carbon Rare`. Si
repiten `Ombré Leather`, se preserva el acento y la capitalizacion natural.

Cuando no hay evidencia suficiente o el caso puede cambiar de significado, la
rutina no modifica los conceptos.

## Fusion

Cuando dos conceptos son equivalentes y la evidencia es clara:

1. Se conserva un concepto canonico activo.
2. Se renombra el canonico si su etiqueta no coincide con la evidencia.
3. Las relaciones del duplicado se trasladan al canonico.
4. Si la relacion ya existe, no se duplica.
5. El duplicado se archiva con una nota de fusion.

No se eliminan contextos definitivamente.

## Idempotencia

La normalizacion puede ejecutarse mas de una vez sin crear relaciones nuevas ni
volver a fusionar datos ya corregidos. Tambien registra su ejecucion con la clave
`vinema:concept-label-normalization:v1`.

La seguridad no depende solo de esa marca: las operaciones comprueban el estado
actual antes de renombrar, transferir o archivar.

## Diagnosticos

Con:

```js
sessionStorage.setItem("vinema:association-diagnostics", "1")
```

Vinema informa en consola:

- cantidad de conceptos persistidos;
- candidatos equivalentes;
- conceptos fusionados;
- conceptos renombrados;
- casos ambiguos omitidos;
- relaciones transferidas;
- relaciones deduplicadas;
- tiempo de normalizacion;
- detalle por candidato.

No se dejan logs permanentes cuando el diagnostico no esta activado.

## Pruebas

Se cubrieron:

- render de conceptos existentes sin `nuevo`;
- render de conceptos emergentes sin `nuevo`;
- persistencia emergente manteniendo `kind`;
- equivalencia de etiquetas;
- fusion de `Carbon Rare` y `Rare Carbon`;
- preservacion de acentos en `Ombré Leather`;
- renombre de concepto unico invertido;
- caso ambiguo sin modificaciones;
- deduplicacion de relaciones;
- idempotencia.

## Validacion manual

No se uso Playwright. La validacion manual debe confirmar en navegador:

- los chips no muestran `nuevo`;
- conceptos antiguos invertidos aparecen corregidos cuando hay evidencia clara;
- las capturas siguen relacionadas al concepto canonico;
- no aparecen simultaneamente `Rare Carbon` y `Carbon Rare`;
- los diagnosticos opcionales muestran renombres, fusiones y omisiones.

## Limitaciones

La normalizacion es conservadora. Si no hay evidencia textual repetida, Vinema
prefiere no modificar datos historicos antes que fusionar conceptos que podrian
tener significados distintos.
