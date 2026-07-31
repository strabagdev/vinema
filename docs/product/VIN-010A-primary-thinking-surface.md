# VIN-010A - Superficie principal de pensamiento

## 1. Estado actual verificado

Esta definicion parte del codigo actual. No describe roadmap ni propone cambios tecnicos inmediatos.

### Ruta inicial real

La ruta inicial real es `/`.

El arbol principal es:

```text
src/app/page.tsx
-> CaptureHomeClient
-> useVinemaContext
-> CaptureSurface
```

La aplicacion completa pasa por:

```text
RootLayout
-> AppShell
-> AuthProvider
-> AuthGuard
-> AppHeader + AppSidebar + contenido
```

Las rutas publicas `/login` y `/register` no muestran el shell autenticado completo. La ruta `/` si lo muestra cuando el usuario esta autenticado.

### Componentes renderizados en Inicio

La superficie inicial autenticada contiene:

- `AppSidebar` permanente en desktop.
- `AppHeader`.
- `MobileNavigation`.
- boton flotante movil para enfocar escritura.
- `CaptureSurface`.
- `Textarea` principal.
- `CaptureRecoveryResults`, condicionado a que exista texto.
- `ConceptSuggestionChips`, condicionado a que exista texto.
- boton `Capturar`, condicionado a que exista texto.
- mensajes de borrador.
- mensajes de error/feedback de captura.
- listado de capturas recientes cuando el editor esta vacio.

### Input o editor principal

El editor actual es un `Textarea`.

Propiedades funcionales:

- `id="capture"`;
- `aria-label="Empieza a escribir"`;
- placeholder: `Empieza a escribir...`;
- foco automatico al montar;
- foco por evento local `FOCUS_CAPTURE_EVENT`;
- permite multiples lineas;
- no tiene manejo especial de Enter;
- Enter crea salto de linea por comportamiento nativo de textarea;
- guardar/capturar requiere boton `Capturar`.

Propiedades visuales actuales:

- altura minima grande;
- borde visible;
- fondo blanco translucido;
- padding amplio;
- texto `text-lg`;
- `leading-8`;
- sombra desactivada;
- focus ring.

### Listado de capturas recientes

Cuando no hay contenido escrito (`hasContent === false`), se muestra una seccion `Reciente`.

Comportamiento:

- lee hasta 8 capturas mediante `listKnowledgeCaptures`;
- se actualiza al montar;
- se actualiza despues de capturar;
- se actualiza con invalidacion de sync remota para entity type `capture`;
- cada item abre `/notes/detail?nodeId=<id>&returnTo=/`.

Informacion mostrada:

- preview del contenido;
- timestamp compacto.

### Recuperacion contextual

Mientras hay texto, aparece `CaptureRecoveryResults`.

El estado proviene de `useAssociationSuggestions`, que:

- espera texto no vacio;
- usa debounce de 320 ms;
- lee capturas del workspace;
- lee contextos;
- intenta leer relaciones;
- evalua recuperacion de capturas;
- evalua sugerencias conceptuales;
- entrega diagnosticos opcionales.

La recuperacion aparece solo mientras hay contenido. Si el editor esta vacio, no se muestra.

### Sugerencias de conceptos

Mientras hay texto, aparece `ConceptSuggestionChips`.

Puede mostrar:

- conceptos existentes;
- conceptos emergentes.

El usuario puede:

- seleccionar/deseleccionar conceptos existentes;
- seleccionar/deseleccionar conceptos emergentes;
- expandir/contraer chips.

Al capturar:

- los conceptos existentes seleccionados se relacionan con la captura;
- los conceptos emergentes seleccionados pueden crear un `Context` nuevo;
- el contexto emergente se crea hoy como tipo `AREA`;
- tambien pueden crearse relaciones hacia capturas usadas como evidencia.

### Acciones visibles

En la superficie principal actual:

- escribir;
- ver recuperacion;
- ver conceptos;
- abrir recuerdo relacionado;
- seleccionar conceptos;
- capturar;
- abrir captura reciente.

En el shell alrededor de la superficie:

- navegar a Inicio;
- navegar a Historial;
- abrir menu movil;
- abrir menu de usuario;
- cerrar sesion;
- usar boton de escribir cuando se esta fuera de Inicio;
- usar boton flotante movil de escritura.

### Mensajes de estado

Estados visibles de `CaptureHomeClient`:

- `Cargando Base de Conocimiento...`;
- error de contexto local/autenticado.

Estados visibles de `CaptureSurface`:

- `Guardando borrador`;
- `Borrador guardado`;
- `Error al guardar`;
- error de captura;
- `Captura guardada en la Base de Conocimiento.`;
- `Captura guardada. Algunas asociaciones no pudieron persistirse.`;
- `Capturando`;
- `Todavia no hay capturas.`;
- `No se pudo cargar la Base de Conocimiento.`

Estado visible del shell:

- badge persistente `Solo local`.

No hay indicador visible de:

- sincronizando;
- sincronizado;
- cambios pendientes;
- error de sync;
- conflicto de sync;
- offline.

### Atajos

El shell escucha:

```text
Ctrl+Shift+K
Cmd+Shift+K
```

Si el usuario esta en `/`, enfoca la escritura y actualiza hash a `/#capture`.

Si el usuario esta fuera de `/`, navega a `/#capture`.

El atajo se ignora si el target actual es `input`, `textarea`, `select` o contenido editable.

### Comportamiento al guardar/capturar

El boton `Capturar` ejecuta `handleCapture`.

Flujo actual:

1. Si ya hay captura en curso, no hace nada.
2. Si el contenido esta vacio, muestra error.
3. Cancela timer de borrador pendiente.
4. Espera la promesa de guardado de borrador si existe.
5. Ejecuta `commitCaptureText`.
6. Crea un `Node` de tipo `NOTE`.
7. Usa workspace y device autenticados.
8. Persiste en IndexedDB.
9. Encola mutacion en `sync_mutations`.
10. Persiste relaciones seleccionadas.
11. Puede crear contextos emergentes seleccionados.
12. Borra el borrador.
13. Emite evento local de captura creada.
14. Limpia editor, conceptos seleccionados y estado expandido.
15. Muestra feedback minimo.
16. Refresca recientes.

### Comportamiento mientras escribe

Mientras el usuario escribe:

- el contenido se guarda como borrador con debounce de 500 ms;
- si el texto no esta vacio, el estado pasa a `saving`;
- se ejecuta recuperacion/asociacion con debounce propio de 320 ms;
- se muestran paneles/chips solo cuando hay contenido;
- el boton `Capturar` aparece solo cuando hay contenido;
- el listado de recientes desaparece.

### Comportamiento vacio

Cuando no hay contenido:

- se muestra el heading `Empieza a escribir`;
- se muestra el textarea con placeholder;
- no se muestran recuperacion ni chips;
- no se muestra boton Capturar;
- se muestra seccion `Reciente`;
- si no hay capturas, se muestra `Todavia no hay capturas.`

### Comportamiento offline

Desde la superficie principal no hay tratamiento visual especifico para offline.

Por arquitectura, la captura local puede persistirse en IndexedDB y en outbox aun sin red, pero la superficie no comunica:

- sin conexion;
- modo local temporal;
- cambios pendientes;
- reintento de sync.

### Comportamiento sincronizando

La sincronizacion existe en el lifecycle autenticado, pero no hay estado visible en la superficie principal.

La superficie solo reacciona a cambios remotos aplicados por Pull mediante `useSyncDataInvalidation`.

### Comportamiento autenticado

`AuthGuard` exige autenticacion para `/`. Si el usuario esta autenticado:

- `useVinemaContext` resuelve workspace y device autenticados;
- se crean repositorios sync-aware;
- las capturas locales quedan en outbox;
- `AuthenticatedSyncLifecycle` administra sync.

### Comportamiento no autenticado

Si el usuario no esta autenticado:

- `AuthGuard` redirige a `/login`;
- mientras carga muestra `Preparando Vinema...` o `Restaurando sesion...`;
- la superficie principal no se presenta como modo anonimo.

### Capacidades ya implementadas

- Superficie inicial unica en `/`.
- Escritura sin titulo.
- Autosave de borrador.
- Recuperacion contextual mientras se escribe.
- Sugerencias de conceptos.
- Seleccion de conceptos.
- Captura local.
- Asociacion con conceptos.
- Creacion de conceptos emergentes seleccionados.
- Outbox sync.
- Recientes.
- Foco automatico y atajo global.
- Apertura de recuerdos relacionados.
- Preservacion de borrador antes de abrir un recuerdo.

### Piezas desconectadas

- `QuickCaptureSheet` existe, pero no forma parte de la superficie principal actual.
- Sync tiene estado interno, pero no tiene expresion visual funcional en Inicio.
- Header muestra `Solo local`, aunque hay sincronizacion autenticada.
- Rutas de contextos existen, pero no forman parte de la navegacion principal de la superficie.

### Elementos heredados

- Sidebar permanente.
- Badge persistente `Solo local`.
- Seccion `Reciente`.
- Caja/borde visible del textarea.
- Boton grande `Capturar`.
- Header con menu estilo aplicacion de gestion.
- Texto `Base de Conocimiento` en feedback de captura.

### Elementos contradictorios con la vision

- `Solo local` persistente contradice sync real.
- La sidebar permanente compite con la idea de que la interfaz desaparezca.
- La seccion de recientes hace que Inicio se parezca parcialmente a un historial.
- El textarea con borde/fondo/tarjeta visual hace que la entrada parezca formulario.
- El boton `Capturar` puede reforzar una accion de formulario, aunque la accion sigue siendo necesaria.

### Elementos que deberian conservarse aunque cambie su apariencia

- Editor principal.
- Autosave de borrador.
- Recuperacion contextual.
- ConceptSuggestionChips como capacidad, no necesariamente como apariencia final.
- Apertura de recuerdos relacionados preservando borrador.
- Captura sin titulo.
- Outbox/sync invisible.
- Invalidacion local post-Pull.
- Foco por atajo.
- Estados accesibles `aria-live`.

## 2. Proposito

La superficie principal de Vinema debe definirse como:

> El lugar donde el usuario piensa con Vinema.

No es conceptualmente:

- Inbox;
- Nueva nota;
- Buscar;
- Captura;
- Editor aislado;
- Historial.

La ruta tecnica puede seguir siendo `/`, pero el significado de producto es una unica superficie de pensamiento.

Debe permitir simultaneamente:

- escribir una captura nueva;
- recuperar contenido existente;
- detectar conceptos;
- mostrar conocimiento que "me recuerda a";
- abrir conocimiento relacionado;
- guardar sin exigir titulo;
- guardar sin exigir clasificacion previa.

La decision "estoy buscando" versus "estoy creando" no debe recaer sobre el usuario. Escribir debe ser suficiente para que Vinema entienda ambos modos a la vez.

## 3. Principios

### Capturar y buscar son la misma accion

El usuario escribe. Vinema decide si ese texto se parece a una captura nueva, a una consulta, a una memoria anterior o a una mezcla de todo eso.

### No hay titulo obligatorio

La captura se identifica por contenido, tiempo, relaciones y conceptos. No debe aparecer un campo titulo ni un sustituto obligatorio.

### No se organiza antes de pensar

Los contextos y conceptos no deben ser una tarea previa. Pueden aparecer como sugerencias y pueden ser aceptados, ignorados o corregidos, pero no deben bloquear la captura.

### La interfaz debe ceder prioridad al pensamiento

La escritura es protagonista. Navegacion, estados, recuerdos y conceptos deben ser secundarios y silenciosos.

### La recuperacion es central

"Me recuerda a" no es una funcion auxiliar. Es una de las formas principales en que Vinema ayuda a pensar.

### La sincronizacion es invisible salvo excepcion

Cuando todo funciona, no debe mostrarse estado tecnico. El usuario solo necesita saber cuando algo requiere atencion.

### Local-first no significa "solo local"

Vinema puede operar localmente y sincronizar despues. "Modo local" describe una condicion temporal o una garantia de captura, no una identidad permanente si hay sync configurado.

## 4. Elementos conservados

### Editor actual

Conservar:

- una unica area de escritura;
- foco automatico;
- soporte multilinea;
- label accesible;
- borrador persistente;
- integracion con captura.

Refinar en futura implementacion:

- reducir apariencia de caja/formulario;
- eliminar bordes ornamentales;
- ajustar tipografia y ancho de lectura.

### Autosave

Conservar:

- guardado de borrador durante escritura;
- limpieza tras captura;
- feedback accesible.

La visibilidad del estado puede reducirse, pero no eliminarse para tecnologias asistivas.

### Recuperacion contextual

Conservar:

- evaluacion mientras se escribe;
- apertura de recuerdos relacionados;
- preservacion del texto al abrir un recuerdo.

Refinar:

- presentacion menos abrupta;
- priorizar pocos resultados altamente relevantes.

### Conceptos sugeridos

Conservar:

- conceptos existentes;
- conceptos emergentes;
- seleccion opcional;
- relacion al capturar.

Refinar:

- evitar apariencia de tags obligatorios;
- presentar como identidad emergente de la captura.

### Captura sin clasificacion previa

Conservar:

- boton/accion de captura;
- persistencia local inmediata;
- outbox de sync;
- ausencia de titulo.

### Atajo global

Conservar:

- `Ctrl+Shift+K` / `Cmd+Shift+K`;
- comportamiento de volver a la escritura desde otras vistas.

### Invalidacion post-Pull

Conservar:

- recarga local de vistas despues de cambios remotos aplicados;
- IndexedDB como fuente de verdad.

## 5. Elementos retirados o marcados para retiro visual

Estos elementos no deben eliminarse necesariamente del codigo en esta fase. Se marcan para retiro de la representacion visual de la superficie principal futura.

### Listado de capturas recientes

Marcado para retiro de Inicio.

Razon:

- convierte la superficie en una mezcla de editor e historial;
- compite con el pensamiento activo;
- la capacidad debe conservarse en Explorar/Historial.

### Sidebar permanente

Marcado para retiro de la superficie principal futura.

Razon:

- ocupa presencia visual fija;
- comunica aplicacion de navegacion/gestion;
- reduce la sensacion de espacio mental.

### Badge "Solo local"

Marcado para retiro.

Razon:

- no representa el estado real cuando existe sync;
- confunde local-first con ausencia de sincronizacion;
- el estado debe aparecer solo cuando necesita atencion.

### Caja visible permanente del editor

Marcada para refinamiento fuerte.

Razon:

- el textarea actual se ve como input de formulario;
- la superficie deseada debe sentirse mas como pensamiento directo.

### Encabezado redundante

`Empieza a escribir` puede mantenerse como frase minima o desaparecer si el cursor y el foco bastan.

Debe evitar convertirse en hero, titulo de pantalla o instruction copy.

### Botones grandes de navegacion

La superficie no debe invitar a cambiar de modulo antes de escribir.

### Formularios de contexto manual

No deben aparecer en la superficie principal. Pueden existir en vistas secundarias, pero no como exigencia de captura.

### Indicadores tecnicos permanentes

No mostrar permanentemente:

- Online;
- Sincronizado;
- Solo local;
- servidor conectado;
- contadores de outbox.

## 6. Flujo de interaccion

### Estado vacio

Estado actual:

- muestra heading;
- muestra textarea con placeholder;
- muestra recientes;
- foco automatico.

Definicion futura:

- el cursor debe estar disponible inmediatamente;
- puede existir una frase minima;
- no debe mostrarse listado reciente;
- no debe presentarse como formulario;
- no debe exigir decision de modo.

Pendiente:

- decidir si se conserva placeholder minimo o se elimina.

### Primeros caracteres

Estado actual:

- texto aparece en textarea;
- estado de borrador pasa a saving;
- se ocultan recientes;
- aparecen areas reservadas de recuperacion/conceptos si hay contenido.

Definicion futura:

- no debe haber saltos visuales bruscos;
- recuperacion y conceptos deben entrar de forma discreta;
- el editor mantiene prioridad absoluta;
- no se debe convertir inmediatamente en panel de resultados.

### Mientras continua escribiendo

Estado actual:

- autosave cada 500 ms;
- asociaciones con debounce de 320 ms;
- conceptos y recuerdos se actualizan;
- boton Capturar visible.

Definicion futura:

- conceptos sugeridos se actualizan cerca del texto o en una zona secundaria tranquila;
- "Me recuerda a" muestra pocos recuerdos;
- los cambios no deben empujar el texto de forma molesta;
- el usuario puede ignorarlo todo y seguir escribiendo.

### Al abrir un recuerdo

Estado actual:

- `CaptureRecoveryResults` recibe `onOpenCapture`;
- antes de abrir, se persiste el borrador actual;
- el recuerdo se abre por link al detalle.

Definicion futura:

- abrir un recuerdo debe preservar el texto en curso;
- debe existir una forma clara de volver al editor;
- volver debe restaurar el texto.

### Al guardar/capturar

Estado actual:

- la accion visible es boton `Capturar`;
- Enter crea salto de linea;
- captura limpia editor;
- borra borrador;
- conserva feedback minimo;
- foco no se reasigna explicitamente despues de captura, aunque el textarea permanece en la vista.

Definicion futura:

- persistir localmente;
- encolar sync;
- no exigir titulo;
- no exigir contexto;
- confirmacion visual minima;
- limpiar o no limpiar debe decidirse explicitamente;
- foco debe volver al punto de escritura si el editor se limpia.

### Enter

Estado actual verificado:

- Enter crea salto de linea por comportamiento nativo de `textarea`.
- No guarda.
- Captura se realiza con boton.

Decision pendiente:

- mantener Enter como salto de linea;
- definir combinacion para capturar;
- o conservar solo boton/accion visible.

No debe cambiarse sin decision de producto.

## 7. Conceptos emergentes

### Rol

Los conceptos sugeridos funcionan como titulo virtual de la captura.

Esto significa que ayudan a responder:

- De que parece tratarse esto.
- Con que conocimiento previo conecta.
- Que identidad puede emerger sin pedir un titulo.

### No son

- tags manuales obligatorios;
- decoracion visual;
- campos title ocultos;
- duplicados de la primera linea;
- clasificacion previa obligatoria.

### Que ve el usuario

La experiencia esperada debe permitir ver:

- conceptos existentes relacionados;
- conceptos nuevos/emergentes;
- terminos importantes detectados;
- si una sugerencia ya existe o podria crearse;
- estado seleccionado/no seleccionado.

### Acciones

El usuario puede:

- aceptar una sugerencia;
- ignorarla;
- corregirla, si se define una UI futura;
- capturar sin seleccionar ninguna.

### Estado actual

Hoy existen chips con seleccion. Los conceptos emergentes seleccionados pueden crear `Context` tipo `AREA`. Esta capacidad debe conservarse, pero su presentacion debe evitar parecer un sistema de tags manual.

## 8. "Me recuerda a"

### Definicion

"Me recuerda a" es la capacidad central que responde:

> Mientras escribo esto, que conocimiento previo parece relacionado?

No es una lista generica de resultados. Es memoria activa.

### Contenido posible

Debe poder mostrar:

- fragmento de captura relacionada;
- fecha o tiempo aproximado;
- conceptos compartidos;
- razon de relacion cuando exista;
- acceso al detalle.

### Cantidad maxima visible

Decision propuesta para discusion futura:

- pocos resultados visibles;
- priorizar relevancia sobre cantidad;
- evitar scroll largo dentro de Inicio.

No se fija numero definitivo en esta fase.

### Cuando aparece

Estado actual:

- aparece si hay texto;
- depende del motor de asociaciones;
- no aparece con editor vacio.

Definicion futura:

- no debe aparecer ante señales demasiado debiles;
- debe entrar de forma discreta;
- debe desaparecer si el texto deja de tener contenido significativo;
- debe conservar espacio mental.

### Al seleccionar un resultado

Estado actual:

- guarda borrador;
- navega al detalle;
- el texto queda preservado en storage.

Definicion futura:

- debe mantenerse este principio;
- el usuario debe poder volver al editor con su texto;
- abrir un recuerdo no debe significar perder la captura en curso.

## 9. Estado de sincronizacion

### Semantica final

Cuando todo funciona:

- no mostrar nada.

Cuando hay mutaciones pendientes:

- mostrar senal discreta;
- no interrumpir escritura;
- no mostrar contadores tecnicos salvo que se defina una vista secundaria.

Cuando esta offline:

- mostrar `Sin conexion` o `Modo local`;
- indicar que se puede seguir capturando;
- indicar que los cambios se sincronizaran despues;
- no bloquear captura.

Cuando hay error temporal:

- mostrar mensaje breve;
- permitir reintento si corresponde;
- no mostrar detalles tecnicos.

Cuando hay conflicto:

- distinguirlo de error temporal;
- indicar que requiere atencion;
- no resolver automaticamente en la superficie principal sin una experiencia clara.

### Que no debe mostrarse

- `Solo local` permanente.
- `Online`.
- `Sincronizado`.
- Estado del servidor cuando todo funciona.

### Web y Tauri

La semantica depende de conectividad y sync, no del contenedor.

- Web online y sincronizado no es "Solo local".
- Tauri online y sincronizado no es "Solo local".
- Web offline es modo local temporal.
- Tauri offline es modo local temporal.

## 10. Navegacion

### Estado actual

La navegacion actual usa:

- sidebar desktop permanente;
- sheet movil;
- header superior;
- links visibles a Inicio e Historial;
- menu de usuario con Preferencias y Sincronizacion futura deshabilitados.

### Definicion futura

La superficie principal debe evitar sidebar permanente.

La navegacion superior debe ser minima y secundaria. Debe permitir acceso a:

- superficie principal;
- Explorar;
- Vista conceptual;
- perfil/configuracion.

No debe existir accion separada de busqueda en la navegacion principal, porque buscar ocurre al escribir.

### Numero maximo de acciones

Definicion:

- maximo 4 acciones principales visibles;
- labels accesibles obligatorios;
- iconos permitidos si no requieren explicacion visual excesiva.

### Estado activo

Debe existir estado activo accesible, pero no dominante.

### Movil

En movil:

- la escritura debe seguir siendo protagonista;
- la navegacion puede comprimirse en una barra superior o menu minimo;
- el boton flotante de escribir solo tiene sentido fuera de la superficie principal.

### Relacion con header actual

El header actual debe considerarse transicional. Contiene acciones utiles, pero su forma actual no representa aun la superficie principal deseada.

## 11. Criterios visuales

La futura superficie debe sentirse:

- calmada;
- silenciosa;
- ligera;
- precisa;
- tipograficamente cuidada;
- sin estetica de dashboard;
- sin tarjetas por defecto;
- sin ruido de bordes;
- sin exceso de iconos.

### Tipografia

Estado actual:

- Geist como fuente base;
- editor `text-lg`;
- `leading-8`;
- heading `text-2xl`/`text-3xl`.

Criterio futuro:

- el texto del usuario debe tener prioridad;
- ancho comodo de lectura;
- line-height amplio pero no disperso;
- sin escalado agresivo;
- headings minimos.

### Editor

Contradicciones actuales:

- borde visible;
- fondo tipo caja;
- padding de formulario;
- apariencia de textarea convencional.

Criterio futuro:

- sin caja visible permanente;
- cursor claro;
- foco visible;
- area amplia y tranquila;
- no parecer formulario.

### Sugerencias

Criterio:

- aparecer con transicion discreta;
- no empujar violentamente el editor;
- no usar tarjetas pesadas;
- no competir con la escritura.

### Color y contraste

Mantener:

- contraste suficiente;
- foco visible;
- no depender solo de color para estado.

## 12. Accesibilidad

La reduccion visual no debe reducir claridad.

Mantener:

- label accesible para editor;
- foco visible;
- navegacion por teclado;
- roles y botones reales;
- feedback de guardado con `aria-live`;
- errores con texto claro;
- contraste suficiente;
- tamanos tactiles adecuados;
- soporte de lectores de pantalla.

El cursor minimalista no puede ser una interfaz indescifrable. Si se retiran bordes y labels visibles, deben permanecer nombres accesibles y estados claros para tecnologias asistivas.

## 13. Compatibilidad con capacidades actuales

| Capacidad actual | Mapeo a superficie futura |
| --- | --- |
| `CaptureSurface` | Conservar como base funcional; refinar visualmente. |
| `Textarea` | Conservar comportamiento multilinea; redefinir apariencia. |
| Autosave de borrador | Conservar. |
| `useAssociationSuggestions` | Conservar. |
| `CaptureRecoveryResults` | Conservar como "Me recuerda a"; refinar presentacion. |
| `ConceptSuggestionChips` | Conservar capacidad; evitar apariencia de tags obligatorios. |
| `commitCaptureText` | Conservar. |
| Outbox sync-aware | Conservar invisible. |
| `useSyncDataInvalidation` | Conservar. |
| Recientes en Inicio | Retirar de Inicio; conservar capacidad en Explorar/Historial. |
| Sidebar | Retirar de superficie principal futura; reemplazar por navegacion superior minima. |
| Header actual | Replantear como navegacion minima. |
| Badge `Solo local` | Retirar; reemplazar por estado contextual solo si hace falta. |
| `QuickCaptureSheet` | Evaluar si sigue teniendo sentido cuando Inicio ya es escritura inmediata. |
| Rutas heredadas | No eliminar todavia. |
| Historial | Conservar como Explorar/Historial secundario. |
| Contextos | No introducir formularios en Inicio; conservar como capacidad secundaria. |

## 14. Preguntas abiertas

Estas decisiones quedan pendientes y no deben resolverse arbitrariamente:

1. Enter guarda o crea linea?
2. Debe existir combinacion de teclado para capturar?
3. Como se confirma visualmente una captura?
4. El editor se limpia inmediatamente despues de capturar?
5. Debe el foco volver explicitamente al editor despues de capturar?
6. Cuantos conceptos se muestran?
7. Los conceptos pueden aceptarse manualmente, corregirse o solo ignorarse?
8. Como se distingue visualmente concepto existente de concepto emergente?
9. Cuantos recuerdos se muestran en "Me recuerda a"?
10. Donde se ubican conceptos y recuerdos en escritorio?
11. Donde se ubican conceptos y recuerdos en movil?
12. Como vuelve el usuario desde un recuerdo al texto en curso?
13. Debe existir un nombre visible para esta superficie?
14. Cual es la accion exacta para abrir Explorar?
15. Donde vive Archivo si se retira de Inicio?
16. Como se muestra un conflicto de sync sin romper concentracion?
17. Se mantiene un boton visible Capturar o se vuelve una accion mas sutil?
18. Que pasa si hay sugerencias aun cargando al capturar?
19. Que nivel de feedback necesita una persona usando lector de pantalla?

## 15. Alcance propuesto para una futura implementacion

La futura implementacion deberia limitarse a la superficie principal y su shell inmediato. No deberia redisenar Historial, Archivo, Contextos, autenticacion ni sincronizacion interna.

Alcance probable:

- ajustar layout de `/`;
- refinar editor principal;
- retirar recientes de Inicio;
- retirar o reemplazar sidebar en la superficie principal;
- retirar badge `Solo local`;
- presentar estado sync solo cuando requiere atencion;
- refinar "Me recuerda a";
- refinar conceptos emergentes;
- conservar autosave, recovery, capture flow y outbox;
- conservar rutas existentes;
- conservar accesibilidad.

Fuera de alcance para esa implementacion:

- IA;
- rediseño de motor de asociaciones;
- rediseño de autenticacion;
- rediseño de sync;
- SSE/WebSocket;
- modelo nuevo de conceptos;
- cambios de rutas;
- pantalla de configuracion completa;
- rediseño total de Historial o Contextos.

## 16. Cierre

La superficie principal de Vinema ya contiene la semilla correcta: escribir, recordar, sugerir conceptos y capturar sin titulo. Lo que falta definir no es la capacidad base, sino su presencia.

La proxima implementacion deberia hacer que la interfaz deje de parecer una pantalla de captura dentro de una aplicacion de gestion y empiece a sentirse como el lugar donde el usuario piensa con Vinema.
