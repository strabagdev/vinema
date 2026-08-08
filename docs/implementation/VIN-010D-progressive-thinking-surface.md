# VIN-010D — Progressive Thinking Surface

## Filosofia progresiva

La superficie principal debe dejar que el texto mande. En VIN-010D los conceptos y recuerdos dejan de ocupar espacio permanente bajo el editor y pasan a comportarse como ayuda contextual progresiva:

- mientras el usuario escribe, el editor conserva prioridad visual;
- si existen resultados, aparecen indicadores discretos;
- los detalles se abren solo por interaccion;
- al volver a escribir, los paneles se cierran;
- no se duplican chips completos bajo el editor.

No se modificaron motores, persistencia, sincronizacion ni autenticacion.

## Arquitectura visual permanente

A partir de VIN-010D.2, el centro visual de Vinema coincide siempre con el centro geometrico del viewport.

La palabra `Vinema` es el ancla visual principal de la aplicacion y nunca debe desplazarse por la presencia de otros elementos del header.

El header se estructura en tres zonas conceptuales:

- izquierda: espacio reservado para capacidades futuras;
- centro: wordmark;
- derecha: perfil y sesion.

La zona izquierda puede estar vacia. La existencia o ausencia de elementos en los extremos nunca modifica la posicion del wordmark.

El canvas principal conserva su eje de escritura y no cambia de posicion por la presencia de resultados contextuales. Toda futura funcionalidad debe respetar ese eje visual: las ayudas pueden aparecer alrededor del canvas, pero no deben recentrar ni desplazar la superficie de escritura.

El rail izquierdo queda reservado para herramientas permanentes de la aplicacion. Las sugerencias contextuales no pertenecen al rail.

Rail permanente:

- Canvas;
- Administrar;
- Estado.

Memoria y Conceptos viven en una barra contextual estructuralmente asociada al canvas. Esa barra aparece solo cuando existen resultados reales para la captura actual.

## Estados implementados

### Vacio

Muestra header minimo, editor y placeholder corto. No hay indicadores, paneles ni listados.

### Escribiendo sin resultados

Muestra texto, cursor, estado de borrador y accion de captura si corresponde. No hay paneles ni indicadores.

### Escribiendo con resultados

Muestra una barra contextual sobre la superficie de escritura, fuera del area editable y fuera del viewport con scroll interno. La barra puede contener:

- Memoria, cuando hay recuerdos sugeridos reales;
- Conceptos, cuando hay conceptos sugeridos reales.

No muestra listas completas por defecto.

### Panel abierto

El usuario puede abrir un panel por hover, foco o click/tap sobre el indicador. Solo un panel permanece abierto.

Desde VIN-010D.1, en escritorio el panel es efimero: permanece visible mientras hay intencion de interactuar con el indicador o con el panel, y desaparece al retirar cursor o foco.

### Al volver a escribir

Se cierran paneles abiertos, incluso si fueron abiertos por click, para priorizar la escritura. El borrador y las selecciones se conservan.

### Captura guardada

El editor se limpia, el foco vuelve al editor, desaparecen indicadores/paneles y se muestra feedback minimo.

### Offline

El header muestra `Modo local` solo cuando `navigator.onLine` indica desconexion.

## Barra Contextual Del Canvas

Las acciones contextuales son botones discretos con icono y nombre:

- `Lightbulb`: Memoria;
- `Brain`: Conceptos.

Cada accion conserva `aria-label` con el contexto o conteo cuando corresponde:

- `N conceptos sugeridos`;
- `Memoria`.

La interfaz no comunica la ausencia de una sugerencia. Solo aparece cuando existe algo util que mostrar.

Por eso:

- `Conceptos` solo existe cuando hay al menos un concepto sugerido;
- `Memoria` solo existe cuando hay al menos una idea o recuerdo relacionado;
- no se renderizan iconos inactivos, placeholders ni contadores en cero;
- si no hay indicadores, no se reserva espacio visual;
- si el indicador activo desaparece, el panel se cierra.

La barra contextual pertenece a `CanvasWritingSurface`, se ubica sobre el canvas y no esta dentro de `data-canvas-scroll-viewport`. Su aparicion no modifica la grilla del editor, el punto inicial de escritura, el seguimiento del caret ni el scroll interno del texto.

## Paneles contextuales

Desde VIN-010D.3, Memoria y Conceptos comparten el mismo sistema de panel visible efectivo usado por el rail:

- `pinnedPanel`;
- `previewPanel`;
- `visiblePanel = pinnedPanel ?? previewPanel`.

Solo existe una instancia visible de `CanvasSidePanel`. Si el panel visible es contextual, se renderiza desde la capa contextual del canvas; si es una herramienta permanente, se renderiza desde la columna reservada del rail.

El panel contextual aparece bajo su barra de acciones, dentro del viewport disponible y sin cubrir el texto activo innecesariamente. No usa `getBoundingClientRect()` para perseguir el cursor y no modifica la posicion del canvas.

En dispositivos tactiles, tocar una accion contextual fija el panel. La composicion sigue siendo compacta y no introduce overlays completos salvo que el espacio disponible lo exija en una futura iteracion.

## Panel de conceptos

El panel de conceptos muestra hasta cinco conceptos existentes o emergentes. La seleccion se mantiene con `aria-pressed`.

Seleccionar un concepto:

- no cierra el borrador;
- no crea datos inmediatamente;
- conserva el comportamiento existente de persistir relaciones solo al capturar.
- un concepto sugerido que ya fue capturado permanece visible y seleccionado en
  la lista mientras siga asociado a la captura actual.
- si una fila ya visible recibe despues `matchedAlias` o
  `knowledgeSuggestionReasons` para el mismo concepto, el panel puede enriquecer
  esa fila sin reconstruir la vista ni perder seleccion.

No se muestran scores, confidence ni payloads internos.

## Panel “Me recuerda a…”

El panel de recuerdos muestra los primeros recuerdos segun la logica existente. Cada recuerdo conserva:

- fragmento del cuerpo;
- fecha compacta;
- link al detalle;
- preservacion del borrador antes de abrir.

No se fabrica titulo ni se duplica la primera linea.

## Politica de apertura

Se adopto una politica basada en intencion:

- no hay apertura automatica por pausa;
- hover abre preview en escritorio;
- foco de teclado abre preview;
- click fija el panel;
- segundo click, X o Escape cierran el panel fijado;
- tap abre y fija el panel en superficies tactiles;
- escribir cierra el panel;
- abrir un panel cierra el otro.

El cierre de escritorio tiene un retardo breve y cancelable. Si el puntero sale del indicador pero entra al panel durante ese intervalo, el cierre se cancela para evitar parpadeo.

El retardo se limpia al desmontar, al escribir, al cambiar de panel y al capturar.

## Estructura visual

Los paneles ya no muestran encabezado visible redundante ni separan header y body con divisor interno. El icono activo comunica el contexto y el nombre del panel se conserva como `aria-label`.

Regla aplicada:

> En Vinema los elementos no estan contenidos por cajas. Estan contenidos por espacio.

En escritorio no se renderiza boton X ni se reserva espacio para el en previews efimeros. En superficies tactiles, el click/tap fija el panel y mantiene el cierre iconografico porque no hay salida por cursor.

## Header

El header ya no tiene divisor horizontal. La separacion se produce por espacio y composicion.

El wordmark `Vinema` esta centrado geometricamente mediante una estructura de tres zonas. No hay isotipo `V` ni navegacion principal visible en la superficie principal.

El perfil/sesion permanece accesible en la zona derecha sin desplazar el centro visual.

## Captura

Se mantiene:

- `Ctrl/Cmd + Enter` para capturar;
- Enter normal para escritura multilinea;
- boton discreto por mouse/tap;
- foco de vuelta al editor tras guardar.

## Responsive

En escritorio con `(hover: hover) and (pointer: fine)`, el panel se ubica bajo la barra contextual del canvas sin mover el layout y se comporta como preview efimero mientras no este fijado.

En tablet tactil y movil, la barra contextual se mantiene compacta sobre el canvas y el panel se fija por tap. No se usa overlay completo como comportamiento base.

La decision no depende solo del ancho: una pantalla amplia sin puntero fino usa comportamiento tactil.

La composicion normal evita scroll vertical global. Si el texto crece demasiado, solo se desplaza el viewport interno del canvas.

## Accesibilidad

Se mantiene:

- `aria-label` del editor;
- botones con area tactil adecuada;
- indicadores con `aria-label`;
- paneles con `role="dialog"` y `aria-modal="false"`;
- cierre con Escape;
- foco devuelto al editor al cerrar panel o capturar;
- navegacion por teclado;
- Tab permite entrar al contenido del panel sin atraparlo como modal;
- al abandonar foco de indicador y panel, el cierre se programa con retardo;
- feedback mediante `aria-live`.

## Animaciones

Se usan transiciones cortas de opacidad/color. No hay animacion constante ni movimiento de layout.

Las clases usan `motion-reduce` para respetar preferencias de reduccion de movimiento.

## Limitaciones

No se implemento apertura automatica por pausa.

No se expuso `SyncStateEngine` al header; por eso solo se muestra offline real por `navigator.onLine`.

No se implemento Explorar nuevo, Plazas, grafo, SSE ni IA.

## Decisiones futuras

Quedan para discutir:

- si una pausa debe abrir panel automaticamente;
- si el estado de sincronizacion necesita provider React;
- si Explorar debe reemplazar visualmente el historial actual;
- si los paneles deben compartir un componente UI reutilizable formal.
