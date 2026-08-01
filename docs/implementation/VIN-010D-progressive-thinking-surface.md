# VIN-010D — Progressive Thinking Surface

## Filosofia progresiva

La superficie principal debe dejar que el texto mande. En VIN-010D los conceptos y recuerdos dejan de ocupar espacio permanente bajo el editor y pasan a comportarse como ayuda contextual progresiva:

- mientras el usuario escribe, el editor conserva prioridad visual;
- si existen resultados, aparecen indicadores discretos;
- los detalles se abren solo por interaccion;
- al volver a escribir, los paneles se cierran;
- no se duplican chips completos bajo el editor.

No se modificaron motores, persistencia, sincronizacion ni autenticacion.

## Estados implementados

### Vacio

Muestra header minimo, editor y placeholder corto. No hay indicadores, paneles ni listados.

### Escribiendo sin resultados

Muestra texto, cursor, estado de borrador y accion de captura si corresponde. No hay paneles ni indicadores.

### Escribiendo con resultados

Muestra indicadores:

- conceptos detectados;
- recuerdos relacionados.

No muestra listas completas por defecto.

### Panel abierto

El usuario puede abrir un panel por hover, foco o click/tap sobre el indicador. Solo un panel permanece abierto.

### Al volver a escribir

Se cierran paneles abiertos, incluso si fueron abiertos por click, para priorizar la escritura. El borrador y las selecciones se conservan.

### Captura guardada

El editor se limpia, el foco vuelve al editor, desaparecen indicadores/paneles y se muestra feedback minimo.

### Offline

El header muestra `Modo local` solo cuando `navigator.onLine` indica desconexion.

## Indicadores

Los indicadores son botones discretos con icono y cantidad:

- `Brain`: conceptos;
- `History`: recuerdos.

Cada indicador incluye `aria-label` con el conteo. Cuando el panel correspondiente esta abierto, el contador visual se oculta para reducir redundancia, pero la informacion accesible permanece.

## Panel de conceptos

El panel `Conceptos detectados` muestra hasta cinco conceptos existentes o emergentes. La seleccion se mantiene con `aria-pressed`.

Seleccionar un concepto:

- no cierra el borrador;
- no crea datos inmediatamente;
- conserva el comportamiento existente de persistir relaciones solo al capturar.

No se muestran scores, confidence ni payloads internos.

## Panel “Me recuerda a…”

El panel muestra los primeros recuerdos segun la logica existente. Cada recuerdo conserva:

- fragmento del cuerpo;
- fecha compacta;
- link al detalle;
- preservacion del borrador antes de abrir.

No se fabrica titulo ni se duplica la primera linea.

## Politica de apertura

Se adopto la version conservadora del paquete:

- no hay apertura automatica por pausa;
- hover/focus abre preview;
- click/tap abre y fija el panel;
- escribir cierra el panel.

Esta politica evita comportamiento invasivo hasta validar uso real.

## Header

El header ya no tiene divisor horizontal. La separacion se produce por espacio y composicion.

La navegacion superior es iconografica:

- Inicio;
- Explorar;
- Archivo.

Los labels no son visibles permanentemente; se conservan como `aria-label`, texto `sr-only` y tooltip.

## Captura

Se mantiene:

- `Ctrl/Cmd + Enter` para capturar;
- Enter normal para escritura multilinea;
- boton discreto por mouse/tap;
- foco de vuelta al editor tras guardar.

## Responsive

En escritorio, el panel se ancla cerca del editor sin mover el layout.

En tablet y movil, el mismo panel usa posicion fija inferior, con altura maxima y scroll interno. Esto funciona como bottom sheet parcial sin introducir una nueva dependencia ni reusar el sheet global de navegacion.

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
- feedback mediante `aria-live`.

## Animaciones

Se usan transiciones cortas de opacidad/color/posicion. No hay animacion constante.

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

