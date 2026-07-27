# VIN-019.1 - Auditoria de interfaz de asociaciones

## Objetivo

Corregir la experiencia visible del motor local de asociaciones para que pueda
comprobarse claramente desde la interfaz real de captura.

## Estado posterior

VIN-019.1 queda conceptualmente como `PARCIAL`: mejoro la visibilidad de la
interfaz, pero la validacion visual en navegador no quedo completada y luego se
detecto un fallo runtime al consultar asociaciones. Ese fallo se diagnostica y
corrige en `VIN-019.2`.

## Causa raiz

La funcionalidad existia a nivel de componentes, hook y motor, pero la interfaz
no la expresaba con claridad por cuatro causas:

- el encabezado `Relacionado` era demasiado discreto y tecnico para comunicar
  memoria;
- el umbral minimo de score descartaba coincidencias razonables con pocas
  palabras compartidas;
- el stemming no aproximaba casos como `concentracion` y `concentrarme`;
- una captura seleccionada podia desaparecer visualmente si un recalculo la
  sacaba del top cinco.

## Ruta y superficie real

La captura principal usada actualmente esta en:

```text
/
```

El componente montado es:

```text
src/app/capture-home-client.tsx
src/features/capture/capture-surface.tsx
```

La captura rapida global usa:

```text
src/features/capture/quick-capture-sheet.tsx
```

Ambas superficies usan el mismo borrador y `commitCaptureText`.

## Correcciones realizadas

- Se cambio el encabezado visible a `Esto me recordó a…`.
- Se redujo el umbral minimo de sugerencia para no ocultar coincidencias utiles.
- Se extendio el stemming conservador para variaciones pronominales simples.
- Se preservan sugerencias seleccionadas aunque queden fuera del top cinco.
- Se cambio el detalle de captura a `Conectada con`.
- Se excluyen capturas archivadas del bloque de asociaciones visibles en detalle.
- Se mejoro la presentacion con selector circular, check y razon secundaria.
- Se agrego resaltado sobrio de terminos coincidentes.

## Evidencia reproducible

Captura existente:

```text
Las reuniones extensas reducen mi capacidad de concentración durante la tarde.
```

Texto nuevo:

```text
Después de muchas reuniones me cuesta concentrarme.
```

Resultado esperado y cubierto por pruebas:

```text
Esto me recordó a…
Las reuniones extensas reducen mi capacidad de concentración durante la tarde.
Coincide en “reuniones” y “concentración”
```

Segundo caso:

```text
Preparar el avance del contrato para el informe semanal.
```

Sugiere:

```text
Revisar el avance semanal del contrato y preparar el informe de gestión.
```

## Limitaciones de validacion manual

Se intento levantar la aplicacion. El sandbox bloqueo el primer arranque por
permisos de puerto. Con permisos elevados, Next detecto un servidor previo del
mismo repo en puerto 3000, pero ese puerto no aceptaba conexion desde `curl`.
No se mato el proceso existente para evitar una accion destructiva no solicitada.

La validacion visual se cubrio con pruebas de render en jsdom y pruebas puras del
motor. No se uso Playwright.

## Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
