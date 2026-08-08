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

El canvas principal, el grupo de indicadores y los paneles contextuales se alinean respecto de este mismo eje central. Toda futura funcionalidad debe respetar ese eje visual: no se debe recentrar respecto del espacio disponible, sino respecto del viewport.

## Estados implementados

### Vacio

Muestra header minimo, editor y placeholder corto. No hay indicadores, paneles ni listados.

### Escribiendo sin resultados

Muestra texto, cursor, estado de borrador y accion de captura si corresponde. No hay paneles ni indicadores.

### Escribiendo con resultados

Muestra indicadores:

- conceptos sugeridos;
- ideas relacionadas.

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

## Indicadores

Los indicadores son botones discretos con icono y cantidad:

- `Brain`: conceptos;
- `Lightbulb`: ideas o recuerdos relacionados.

Cada indicador incluye `aria-label` con el conteo:

- `N conceptos sugeridos`;
- `N ideas relacionadas`.

La interfaz no comunica la ausencia de una sugerencia. Solo aparece cuando existe algo util que mostrar.

Por eso:

- `Brain` solo existe cuando hay al menos un concepto;
- `Lightbulb` solo existe cuando hay al menos una idea o recuerdo relacionado;
- no se renderizan iconos inactivos, placeholders ni contadores en cero;
- si no hay indicadores, no se reserva espacio visual;
- si el indicador activo desaparece, el panel se cierra.

Cuando el panel correspondiente esta abierto, el contador visual se oculta para reducir redundancia, pero la informacion accesible permanece.

## Paneles contextuales

Desde VIN-010D.2, los indicadores forman un unico grupo centrado. En escritorio y tablet con `(hover: hover) and (pointer: fine)`, el panel flota directamente arriba de ese grupo:

- `bottom: calc(100% + 10px)`;
- `left: 50%`;
- `transform: translateX(-50%)`.

El panel queda centrado respecto del grupo de indicadores, no respecto de un indicador individual ni de un borde lateral. No usa `getBoundingClientRect()` para el posicionamiento normal de escritorio, no persigue el cursor y no ejecuta fallbacks laterales.

En dispositivos tactiles o bajo el breakpoint movil, conserva el comportamiento de bottom sheet parcial.

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
- hover abre el panel en escritorio;
- foco de teclado abre el panel;
- click abre el panel sin fijarlo permanentemente en escritorio;
- tap abre bottom sheet en superficies tactiles;
- escribir cierra el panel;
- abrir un panel cierra el otro.

El cierre de escritorio tiene un retardo breve y cancelable. Si el puntero sale del indicador pero entra al panel durante ese intervalo, el cierre se cancela para evitar parpadeo.

El retardo se limpia al desmontar, al escribir, al cambiar de panel y al capturar.

## Estructura visual

Los paneles ya no muestran encabezado visible redundante ni separan header y body con divisor interno. El icono activo comunica el contexto y el nombre del panel se conserva como `aria-label`.

Regla aplicada:

> En Vinema los elementos no estan contenidos por cajas. Estan contenidos por espacio.

En escritorio no se renderiza boton X ni se reserva espacio para el. En mobile se conserva el cierre iconografico porque el bottom sheet no tiene hover ni salida de cursor.

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

En escritorio con `(hover: hover) and (pointer: fine)`, el panel se ubica sobre el grupo centrado de indicadores sin mover el layout y se comporta como popover efimero.

En tablet tactil y movil, el mismo panel usa posicion fija inferior, con altura maxima y scroll interno. Esto funciona como bottom sheet parcial sin introducir una nueva dependencia ni reusar el sheet global de navegacion.

La decision no depende solo del ancho: una pantalla amplia sin puntero fino usa comportamiento tactil.

La composicion normal evita scroll vertical inicial. Si el texto crece demasiado, el contenido puede desplazarse naturalmente.

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
