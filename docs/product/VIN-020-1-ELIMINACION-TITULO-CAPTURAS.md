# VIN-020.1 - Eliminacion del titulo en capturas

## Razon conceptual

Vinema no necesita un titulo para identificar una captura. La identidad visible
surge del contenido. Agregar un campo separado obliga al usuario a clasificar,
nombrar o resumir antes de pensar.

Desde este paquete, las capturas se muestran mediante vista previa de contenido.

## Auditoria

Se revisaron referencias a `title` en:

- dominio `Node`;
- creacion y edicion;
- validacion;
- repositorios IndexedDB e in-memory;
- busqueda local;
- motor de asociaciones;
- Historial;
- Archivo;
- detalle;
- contextos relacionados;
- capturas recientes;
- pruebas;
- documentacion vigente.

Las referencias legitimas restantes son:

- `metadata.title` de Next;
- atributos/props genericos de componentes que no representan capturas;
- `aria-labelledby`/ids HTML;
- normalizacion historica de IndexedDB para leer y limpiar `title` antiguo;
- documentacion historica que describe el estado anterior.

## Modelo anterior

El modelo activo tenia:

```ts
title: string;
content: string;
```

La busqueda ponderaba titulo, el motor de asociaciones indexaba titulo mas
contenido, y varias pantallas mostraban titulo si existia.

## Modelo nuevo

El modelo activo de `Node` ya no contiene `title`.

La captura conserva contenido, estado, timestamps, metadatos internos,
relaciones y campos de compatibilidad existentes, pero su identidad visible sale
de:

```ts
content
```

## Compatibilidad historica

Las lecturas de IndexedDB aceptan objetos antiguos con `title`.

- Si `content` existe, `title` se ignora.
- Si `content` esta vacio y `title` contiene informacion, ese texto se recupera
  como `content`.
- El dominio nunca recibe `title`.

## Decision sobre IndexedDB

No se subio la version de IndexedDB.

No existe indice `by-title`, store auxiliar de titulos ni columna rigida que
requiera `upgrade`. IndexedDB almacena objetos completos, por lo que la limpieza
se puede hacer de forma progresiva.

## Limpieza progresiva

Al crear o actualizar capturas, el repositorio elimina:

```text
title
context
```

de los objetos persistidos. Esto limpia capturas historicas cuando vuelven a
guardarse sin recorrer toda la base al inicio.

## Vista previa de contenido

Se creo `getCapturePreview(content, options)`.

La utilidad:

- recorta espacios externos;
- colapsa saltos de linea y espacios multiples;
- mantiene contenido corto completo;
- trunca de forma legible;
- usa `…`;
- devuelve `Captura sin contenido` cuando el contenido historico es invalido.

## Creacion

Las nuevas capturas se crean solo con contenido. No se envia ni se genera
`title`.

## Edicion

El detalle de captura permite editar contenido. No existe campo de titulo,
placeholder de titulo ni regeneracion desde primera linea.

## Historial

Historial muestra previews de contenido y fecha. La busqueda resalta fragmentos
de contenido, no titulo.

## Recientes

Las capturas recientes de Inicio muestran preview derivada del contenido y
desaparecen cuando el usuario empieza a escribir.

## Asociaciones

Las sugerencias muestran contenido. El motor indexa solo `content`.

## Estado posterior a VIN-020.2

La recuperacion de capturas similares ya no es una accion de organizacion. Las
capturas recuperadas se abren como memoria previa y no se seleccionan ni crean
relaciones nuevas.

La organizacion visible durante la escritura ocurre mediante `Conceptos`, que se
muestran como chips y se persisten solo cuando el usuario los selecciona.

## Busqueda

La busqueda opera sobre contenido y contextos. `matchedFields` ya no incluye
`title` y no existe ponderacion especial por titulo.

## Importacion y exportacion

No se encontro un flujo activo de importacion/exportacion de capturas. La regla
queda definida para paquetes futuros: exportaciones nuevas no deben emitir
`title`; importaciones historicas pueden aceptarlo y descartarlo o recuperar
contenido si era la unica fuente de informacion.

## Pruebas

Se agregaron o actualizaron pruebas para:

- dominio sin `title`;
- creacion y edicion solo con contenido;
- compatibilidad historica en IndexedDB;
- limpieza progresiva;
- previews cortas, largas, multilínea, unicode y vacias;
- busqueda sin campo titulo;
- asociaciones indexando contenido;
- Historial, Archivo, recientes y detalle sin titulo visible.

## Validacion manual

No se ejecuto validacion interactiva en navegador porque el usuario indico no
usar Playwright y no habia otra herramienta de navegador disponible. La
validacion tecnica cubre render, flujos y persistencia con tests automatizados.

## Limitaciones

Quedan documentos historicos que mencionan titulo porque describen paquetes
anteriores. No se reescribio esa historia; VIN-020.1 documenta la decision nueva.
