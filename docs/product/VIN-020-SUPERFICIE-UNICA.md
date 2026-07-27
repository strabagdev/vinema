# VIN-020 - Superficie Unica

## Filosofia

Vinema deja de presentar la captura y la exploracion como acciones separadas.
La accion principal es escribir.

Mientras el usuario escribe, el sistema recuerda: muestra asociaciones,
coincidencias y capturas relacionadas sin mover el foco ni interrumpir el flujo.

## Objetivo

La pantalla inicial debe ser una unica superficie de escritura. No hay dashboard,
no hay explorador como entrada principal y no hay captura rapida como editor
separado.

El usuario llega a `/`, el editor recibe el foco y puede empezar a escribir.

## Decisiones de UX

- El encabezado visible principal es `Empieza a escribir`.
- El editor es el centro de la pantalla.
- El boton `Capturar` solo aparece cuando existe contenido valido.
- Las capturas recientes aparecen solamente con el editor vacio.
- Al escribir, las recientes desaparecen y su lugar lo ocupan asociaciones.
- Las asociaciones seleccionadas permanecen visibles aunque cambien las
  sugerencias.
- El atajo global y los botones de escritura enfocan la superficie principal.

## Estado posterior a VIN-020.1

Las capturas ya no tienen titulo como propiedad activa ni como campo de edicion.
La identidad visible de una captura surge de su contenido mediante una vista
previa breve, suficiente para reconocerla sin pedirle al usuario una decision
organizativa adicional.

Los datos historicos que todavia contengan `title` pueden leerse por
compatibilidad, pero las escrituras actuales no preservan ni regeneran ese
campo.

## Estado posterior a VIN-020.2

La superficie separa recuperacion y conceptos.

`Esto me recordó a…` muestra capturas similares como memoria navegable. Abrir una
captura recuperada no crea relaciones y conserva el borrador actual.

`Conceptos` muestra chips compactos basados en contextos existentes. Solo los
conceptos seleccionados se relacionan con la captura al guardar.

La seccion heredada `Contextos` deja de formar parte del detalle de captura. Si
una captura tiene conceptos, se muestran como chips; si no los tiene, no se
renderiza ningun bloque vacio.

## Estado posterior a VIN-021

Los conceptos ya no necesitan existir previamente. La misma evaluacion semantica
que recupera capturas similares puede proponer conceptos emergentes basados en
patrones encontrados en esas capturas.

Los emergentes se muestran como chips `nuevo` y solo se persisten si el usuario
los confirma al capturar.

## Componentes reutilizados

- `CaptureSurface`: se adapto como superficie unica.
- `CaptureAssociationSuggestions`: se mantiene para sugerencias y seleccion.
- `useAssociationSuggestions`: se reutiliza sin cambiar el motor local.
- `listKnowledgeCaptures`: se reutiliza para recientes cuando el editor esta
  vacio.
- `AppShell`, `AppHeader` y `AppSidebar`: se simplificaron sin crear una nueva
  arquitectura de navegacion.

## Componentes eliminados del flujo principal

- `QuickCaptureSheet` deja de montarse desde el shell.
- El buscador embebido en `/` se retira como seccion separada.
- La accion global de captura rapida deja de abrir un segundo editor.

El archivo de `QuickCaptureSheet` se conserva por compatibilidad historica, pero
ya no forma parte de la experiencia principal.

## Flujo de usuario

1. Abrir Vinema.
2. El foco queda en el editor.
3. Escribir.
4. Vinema muestra asociaciones sin bloquear.
5. Seleccionar asociaciones opcionales.
6. Capturar cuando exista contenido valido.
7. Volver al editor vacio con recientes visibles.

## Navegacion

La navegacion principal queda reducida a:

- `Inicio`: superficie unica de escritura.
- `Historial`: herramienta secundaria para revisar contenido existente.

`/inbox` y `/notes/new` siguen redirigiendo a `Inicio`.

## Compatibilidad

VIN-020 no modifica:

- modelo de datos;
- dominio;
- repositorios;
- persistencia;
- migraciones;
- IndexedDB;
- motores BM25, TF-IDF o n-gramas.

## Rendimiento

No se introduce un motor nuevo ni calculos duplicados. La superficie reutiliza el
hook de asociaciones existente y mantiene el listado de recientes limitado.

## Accesibilidad

El editor tiene etiqueta accesible, recibe foco inicial y conserva navegacion por
teclado. El atajo global no roba eventos desde inputs, textareas, selects ni
elementos editables.

## Responsive

Las asociaciones se muestran debajo del editor, tambien en mobile. No se agregan
paneles laterales ni dashboards.

## Evolucion futura

La superficie queda preparada para reemplazar el `textarea` por un editor
enriquecido en el futuro. La experiencia de producto no cambia: el usuario sigue
escribiendo y Vinema sigue recordando alrededor de esa escritura.
