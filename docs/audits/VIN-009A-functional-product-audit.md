# VIN-009A - Auditoria funcional de producto

## 1. Resumen ejecutivo

Esta auditoria describe el producto Vinema tal como existe hoy en el codigo actual. No evalua roadmap, intenciones futuras ni propuestas pendientes.

Vinema hoy es una aplicacion autenticada, local-first y sincronizable que gira alrededor de una superficie principal de captura llamada "Empieza a escribir". La captura crea registros locales `Node` de tipo `NOTE`, sin titulo, con contenido textual, estado activo/archivado, versionado y metadatos de dispositivo. La informacion se persiste en IndexedDB y, si hay sesion autenticada, las escrituras locales se registran en una outbox persistente para sincronizacion remota.

El producto actual tiene tres capas funcionales fuertes:

- Captura y recuperacion local mientras se escribe.
- Base de Conocimiento/Historial con busqueda, archivo y detalle editable.
- Modelo contextual de Areas, Proyectos y Personas, con relaciones entre capturas y contextos.

Tambien tiene una capa de autenticacion y sincronizacion bastante avanzada:

- registro/login/logout;
- sesion persistente;
- refresh silencioso;
- dispositivo confiable;
- outbox local;
- push/pull contra API;
- polling automatico;
- invalidacion local de UI despues de Pull.

La experiencia visible, sin embargo, esta deliberadamente reducida. La navegacion principal expone solo:

- Inicio;
- Historial.

Rutas como Areas, Proyectos, Personas, Archivo y detalle de contexto existen y funcionan, pero no estan presentes en la navegacion principal actual. Esto crea una diferencia importante entre capacidad real y descubribilidad del producto.

La mayor coherencia con la vision aparece en la superficie unica de entrada, la ausencia de titulos y la recuperacion por asociaciones mientras se escribe. Las zonas que mas se sienten heredadas de un CRUD son los listados y formularios de contextos, el detalle de contexto y algunas acciones explicitas de administracion.

## 2. Alcance funcional actual

### Incluido en el producto actual

- Autenticacion minima con registro, login, logout, restauracion de sesion y refresh.
- Shell autenticado con header, sidebar desktop y navegacion movil.
- Captura textual desde Inicio.
- Borrador persistente de captura.
- Recuperacion de capturas similares mientras se escribe.
- Sugerencias de conceptos existentes y emergentes mientras se escribe.
- Seleccion de conceptos sugeridos antes de capturar.
- Creacion de capturas locales.
- Creacion automatica de conceptos emergentes confirmados.
- Relacion entre capturas y contextos.
- Historial/Base de Conocimiento con listado paginado.
- Busqueda textual en capturas activas.
- Detalle de captura con modo lectura inicial.
- Edicion explicita de captura con autosave.
- Asociacion/desasociacion manual de contextos en detalle de captura.
- Archivo/restauracion de capturas.
- Listado y busqueda de Archivo.
- Contextos por tipo: Areas, Proyectos y Personas.
- Creacion, edicion, archivo y restauracion de contextos.
- Detalle de contexto con capturas relacionadas.
- Persistencia local IndexedDB.
- Sincronizacion local-remota por outbox y HTTP Push/Pull.
- Aplicacion local de cambios remotos.
- Invalidacion de vistas cuando Pull modifica IndexedDB.
- PWA manifest y service worker registrado.
- Pantallas globales de error y no encontrado.
- Redirects de rutas heredadas.

### No incluido como experiencia visible completa

- No existe una pagina de configuracion funcional.
- No existe una vista de estado de sincronizacion para el usuario.
- No existe onboarding guiado.
- No existe timeline o diario funcional dedicado.
- No existe navegacion principal por Areas/Proyectos/Personas.
- No existe pantalla explicita de "Explorar" como modulo separado.
- No existe edicion colaborativa en tiempo real.
- No existe SSE/WebSocket.
- No existe gestion visible de dispositivos.
- No existe resolucion UX de conflictos de sincronizacion.
- No existe papelera ni eliminacion definitiva expuesta.
- No existe panel de preferencias aunque aparece como item deshabilitado.

## 3. Recorrido completo del producto

### 3.1 Shell global

Archivo principal:

- `src/app/layout.tsx`
- `src/components/app-shell/app-shell.tsx`

Todas las rutas pasan por `AppShell`, que compone `AuthProvider` y `AuthGuard`.

En rutas publicas (`/login`, `/register`) se renderiza el contenido sin header/sidebar. En rutas privadas se muestra:

- sidebar desktop;
- navegacion movil;
- header superior;
- boton flotante movil para "Empezar a escribir".

El shell registra `/sw.js` si `navigator.serviceWorker` existe. Tambien escucha `Ctrl+Shift+K` o `Cmd+Shift+K` para enfocar la superficie de captura o navegar a `/#capture`.

Informacion consumida:

- estado de autenticacion;
- pathname actual;
- router de Next.

Informacion modificada:

- historial de navegacion;
- registro de service worker;
- evento local de foco de captura.

Observacion funcional:

- El header muestra un badge "Solo local" aunque el producto ya tiene autenticacion y sincronizacion. Funcionalmente es texto de UI, no estado real.

### 3.2 Navegacion principal

Archivos:

- `src/components/app-shell/app-sidebar.tsx`
- `src/components/app-shell/mobile-navigation.tsx`

Items visibles:

- Inicio (`/`)
- Historial (`/notes`)

No aparecen en la navegacion principal:

- Areas;
- Proyectos;
- Personas;
- Archivo;
- Configuracion;
- estado de sync.

La navegacion movil reutiliza los mismos items del sidebar dentro de un `Sheet`.

### 3.3 Header y acciones globales

Archivo:

- `src/components/app-shell/app-header.tsx`

Acciones:

- ver identidad de usuario en menu;
- cerrar sesion;
- ir a escribir cuando no se esta en Inicio;
- abrir items deshabilitados: Preferencias y Sincronizacion futura.

Informacion consumida:

- usuario autenticado;
- pathname.

Informacion modificada:

- logout;
- router a `/login`;
- foco/navegacion a captura.

Estado:

- funcional para logout y foco de captura;
- parcialmente implementado para preferencias/sincronizacion porque los items existen deshabilitados.

### 3.4 Autenticacion

Rutas:

- `/login`
- `/register`

Archivos:

- `src/app/login/login-client.tsx`
- `src/app/register/register-client.tsx`
- `src/features/auth/*`

Flujo de registro:

1. usuario ingresa nombre, email, password y confirmacion;
2. se valida nombre no vacio, email y password;
3. `useAuth().register()` llama al ciclo de autenticacion;
4. el cliente HTTP usa `NEXT_PUBLIC_API_URL`;
5. la API crea identidad, workspace personal y dispositivo;
6. se guarda sesion local persistente;
7. se redirige a `/`.

Flujo de login:

1. usuario ingresa email y password;
2. se valida email y password;
3. `useAuth().login()` autentica contra API;
4. se guarda sesion local;
5. se redirige a `/`.

Restauracion:

- `AuthProvider` inicializa el lifecycle al montar.
- Si hay sesion persistida, intenta restaurarla/renovarla.
- Durante `RESTORING`, las pantallas muestran "Restaurando sesion".

Logout:

- cancela refresh;
- detiene sincronizacion autenticada;
- llama logout del servicio;
- redirige a login desde header.

Informacion consumida:

- API URL publica;
- credenciales;
- sesion persistida;
- metadatos de dispositivo.

Informacion modificada:

- auth state;
- storage de sesion;
- sesiones remotas;
- estado de sync.

Estado:

- implementado y conectado.

### 3.5 Inicio: superficie unica de captura

Ruta:

- `/`

Archivos:

- `src/app/page.tsx`
- `src/app/capture-home-client.tsx`
- `src/features/capture/capture-surface.tsx`
- `src/features/capture/capture-flow.ts`

Proposito actual:

- Ser la entrada principal del producto.
- Permitir escribir sin titulo.
- Recuperar contenido relacionado mientras el usuario escribe.
- Sugerir conceptos.
- Capturar el texto como conocimiento local.

Estados de la vista:

- cargando contexto local/autenticado;
- error de contexto;
- editor listo;
- borrador guardandose/guardado/error;
- capturando;
- feedback de captura guardada;
- lista de recientes cuando no hay texto activo.

Acciones:

- escribir contenido;
- guardar borrador automaticamente;
- ver recuperacion de capturas similares;
- ver chips de conceptos sugeridos;
- seleccionar/deseleccionar conceptos existentes;
- seleccionar/deseleccionar conceptos emergentes;
- abrir captura relacionada preservando borrador;
- capturar;
- abrir recientes.

Informacion consumida:

- `workspaceId` y `deviceId` autenticados;
- IndexedDB `nodes`, `contexts`, `node_context_relations`;
- storage de borrador;
- motor de asociaciones.

Informacion modificada:

- borrador local;
- `nodes`;
- `contexts` si se confirma concepto emergente no existente;
- `node_context_relations`;
- `sync_mutations` por repositorios sync-aware;
- evento local `vinema:capture-created`.

Observaciones:

- La captura se crea como `Node` de tipo `NOTE`.
- No hay titulo.
- La organizacion inicial es `ORGANIZED`.
- El texto se limpia despues de capturar.
- El borrador se borra despues de capturar.

### 3.6 Recuperacion mientras se escribe

Archivos:

- `src/features/associations/use-association-suggestions.ts`
- `src/features/associations/association-engine.ts`
- `src/features/associations/capture-recovery-results.tsx`

Proposito actual:

- Mientras el usuario escribe, comparar el texto contra capturas existentes.
- Mostrar resultados que "esto me recordo a...".
- Evitar que buscar sea una pantalla separada obligatoria.

Funcionamiento:

- debounce de 320 ms;
- lee capturas por workspace;
- lee contextos;
- intenta leer relaciones;
- evalua recuperacion y sugerencias conceptuales;
- reporta diagnosticos solo si `sessionStorage["vinema:association-diagnostics"] === "1"`.

Informacion consumida:

- texto actual;
- capturas del workspace;
- contextos del workspace;
- relaciones del workspace;
- selecciones actuales.

Informacion modificada:

- estado local React de sugerencias;
- no modifica persistencia por si sola.

Estado:

- implementado y conectado en la superficie principal.

### 3.7 Sugerencias de conceptos

Archivos:

- `src/features/associations/concept-suggestions.ts`
- `src/features/associations/concept-suggestion-chips.tsx`
- `src/features/associations/concept-label-normalization.ts`

Proposito actual:

- Sugerir contextos existentes relacionados con el texto.
- Sugerir conceptos emergentes derivados de patrones en capturas.

Acciones:

- seleccionar chips existentes;
- seleccionar chips emergentes;
- al capturar, crear contexto emergente si no existe;
- relacionar evidencia/captura con el contexto confirmado.

Informacion consumida:

- texto actual;
- contextos existentes;
- relaciones;
- capturas.

Informacion modificada:

- seleccion local antes de capturar;
- al confirmar captura, puede crear `Context` tipo `AREA`;
- puede crear relaciones.

Observacion:

- Los conceptos emergentes se materializan como `Context` de tipo `AREA`, no como entidad `Concept` separada.

### 3.8 Historial / Base de Conocimiento

Ruta:

- `/notes`

Archivo:

- `src/app/notes/knowledge-base-client.tsx`

Proposito actual:

- Mostrar capturas activas del workspace.
- Buscar dentro de capturas activas.
- Servir como historial de conocimiento.

Acciones:

- buscar;
- limpiar busqueda;
- cargar mas;
- abrir captura;
- ir a Archivo;
- ir a escribir.

Informacion consumida:

- `nodes` activos;
- busqueda por contenido;
- opcionalmente relaciones/contextos a traves de `searchNodes`, aunque la pantalla pasa `includeContexts: false`.

Informacion modificada:

- query param `q`;
- estado local de resultados;
- no modifica persistencia.

Reactividad:

- recarga ante `vinema:capture-created`;
- recarga ante `SyncDataChangedEvent` de capture/concept/captureConcept;
- recarga por cambios de query y paginacion.

Estado:

- implementado;
- visible en navegacion principal.

### 3.9 Detalle de captura

Ruta:

- `/notes/detail?nodeId=<id>`

Archivo:

- `src/app/notes/detail/note-detail-client.tsx`

Proposito actual:

- Leer una captura.
- Editarla explicitamente.
- Asociarla a contextos.
- Archivarla/restaurarla.

Estados:

- falta `nodeId`;
- cargando;
- contexto local cargando;
- captura no encontrada;
- modo lectura;
- modo edicion;
- confirmacion de archivo;
- captura archivada.

Acciones:

- volver;
- editar;
- cancelar edicion;
- autosave durante edicion;
- marcar relaciones de contexto;
- archivar;
- confirmar archivo;
- restaurar si esta archivada.

Informacion consumida:

- `nodeId` desde query params;
- captura desde IndexedDB;
- contextos relacionados;
- opciones de Areas, Proyectos y Personas.

Informacion modificada:

- contenido de `Node`;
- estado archivado/restaurado;
- relaciones `NodeContextRelation`;
- outbox sync.

Reactividad:

- recarga ante `SyncDataChangedEvent`.

Estado:

- implementado con modo lectura inicial y edicion explicita.
- La edicion usa autosave, no boton manual de guardar.

### 3.10 Archivo

Ruta:

- `/notes/archive`

Archivo:

- `src/app/notes/archive/archive-client.tsx`

Proposito actual:

- Mostrar capturas archivadas.
- Buscar dentro de capturas archivadas.
- Restaurar capturas.

Acciones:

- buscar;
- limpiar busqueda;
- abrir captura archivada;
- restaurar desde listado;
- cargar mas;
- volver a Historial.

Informacion consumida:

- `nodes` archivados;
- busqueda en scope `archived`.

Informacion modificada:

- restauracion de `Node`;
- outbox sync;
- query params.

Estado:

- implementado, pero no visible en sidebar; accesible desde Historial.

### 3.11 Contextos: Areas, Proyectos y Personas

Rutas:

- `/contexts/areas`
- `/contexts/projects`
- `/contexts/people`

Archivo:

- `src/app/contexts/context-list-client.tsx`

Proposito actual:

- Gestionar contextos de pensamiento por tipo.
- Ver activos/archivados.
- Crear contextos.
- Ver cantidad de capturas relacionadas.

Acciones:

- alternar activos/archivados;
- abrir/cerrar formulario de creacion;
- crear contexto con nombre y descripcion;
- cancelar creacion;
- abrir detalle de contexto.

Informacion consumida:

- `contexts` filtrados por workspace y tipo;
- relaciones para contar capturas.

Informacion modificada:

- `contexts`;
- outbox sync.

Estado:

- funcional, pero no visible en navegacion principal.
- La UX se parece a administracion manual de categorias.

### 3.12 Detalle de contexto

Ruta:

- `/contexts/detail?contextId=<id>`

Archivo:

- `src/app/contexts/detail/context-detail-client.tsx`

Proposito actual:

- Leer un contexto.
- Editar nombre/descripcion.
- Archivarlo/restaurarlo.
- Ver capturas relacionadas.

Acciones:

- volver;
- editar;
- cancelar;
- listo;
- archivar;
- restaurar;
- abrir captura relacionada.

Informacion consumida:

- `contextId` desde query params;
- contexto;
- relaciones;
- capturas relacionadas.

Informacion modificada:

- `Context`;
- outbox sync.

Estado:

- funcional, pero no visible en navegacion principal salvo por links desde listados de contextos.

### 3.13 Rutas heredadas

Rutas:

- `/notes/new`
- `/inbox`
- `/search`

Archivos:

- `src/app/notes/new/page.tsx`
- `src/app/inbox/page.tsx`
- `src/app/search/search-redirect-client.tsx`
- `src/components/app-shell/legacy-route-redirect.tsx`

Comportamiento:

- `/notes/new` muestra mensaje y redirige a `/`.
- `/inbox` muestra mensaje y redirige a `/`.
- `/search?q=...` redirige a `/notes?q=...`.

Proposito actual:

- Mantener compatibilidad con rutas antiguas.
- Reforzar que la captura empieza en una unica superficie.

Estado:

- implementado como redirects, no como pantallas funcionales independientes.

### 3.14 Pantallas de error

Archivos:

- `src/app/global-error.tsx`
- `src/app/global-not-found.tsx`

Comportamiento:

- `global-error` muestra error general y boton Reintentar.
- `global-not-found` muestra pagina no encontrada.

Estado:

- implementadas, autonomas, sin AppShell.

### 3.15 PWA

Archivos:

- `src/app/manifest.ts`
- registro de `/sw.js` en AppShell.

Capacidades:

- manifest con nombre, descripcion, icono, scope y display standalone.
- service worker registrado si existe soporte de navegador.

Estado:

- parcialmente implementado desde experiencia de usuario; no se audito aqui contenido de `public/sw.js` porque la pregunta se centra en funcionalidad producto visible y flujos.

## 4. Mapa funcional del producto

### Inicio

Estado: maduro.

Nivel de implementacion:

- captura sin titulo;
- autosave de borrador;
- recuperacion mientras se escribe;
- conceptos sugeridos;
- captura con asociaciones;
- recientes;
- foco por atajo global.

Dependencias:

- AuthProvider;
- useVinemaContext;
- IndexedDB;
- repositorios sync-aware;
- motor de asociaciones;
- outbox sync.

### Historial / Base de Conocimiento

Estado: maduro.

Nivel de implementacion:

- listado activo;
- busqueda;
- paginacion;
- apertura de detalle;
- reactividad local post-captura y post-Pull.

Dependencias:

- NodeRepository;
- Recovery search;
- SyncDataChangedEvent.

### Detalle de captura

Estado: maduro.

Nivel de implementacion:

- lectura inicial;
- edicion explicita;
- autosave;
- archivo/restauracion;
- relaciones con contextos;
- mensajes de error.

Dependencias:

- NodeRepository;
- ContextRepository;
- NodeContextRelationRepository;
- sync-aware repositories.

### Archivo

Estado: maduro parcial.

Nivel de implementacion:

- listado archivado;
- busqueda archivada;
- restauracion;
- apertura de detalle.

Dependencias:

- NodeRepository;
- SearchNodes;
- sync-aware repositories.

Limitacion de producto:

- accesible desde Historial, no desde navegacion principal.

### Contextos

Estado: funcional/experimental.

Nivel de implementacion:

- Areas, Proyectos y Personas;
- listados por tipo;
- creacion;
- archivo/restauracion;
- detalle;
- capturas relacionadas.

Dependencias:

- ContextRepository;
- NodeContextRelationRepository;
- NodeRepository;
- sync-aware repositories.

Limitacion de producto:

- representa una gestion manual de categorias/contextos.
- existe poca integracion visible con la navegacion principal.

### Recuperacion y asociaciones

Estado: avanzado.

Nivel de implementacion:

- recuperacion mientras se escribe;
- busqueda en Historial/Archivo;
- sugerencias de conceptos existentes;
- sugerencias emergentes;
- diagnosticos opcionales;
- normalizacion de etiquetas.

Dependencias:

- nodes;
- contexts;
- relations;
- motor local.

### Autenticacion

Estado: maduro.

Nivel de implementacion:

- registro;
- login;
- logout;
- restore session;
- silent refresh;
- almacenamiento seguro/obfuscado de sesion;
- trusted device model.

Dependencias:

- API remota;
- AuthClient;
- AuthService;
- AuthStateEngine;
- IndexedDB/local storage.

### Sincronizacion

Estado: avanzado/experimental.

Nivel de implementacion:

- outbox persistente;
- mutaciones locales atomicas;
- PushCoordinator;
- PullCoordinator;
- AutomaticSyncOrchestrator;
- SyncStateEngine;
- AuthenticatedSyncLifecycle;
- invalidacion UI post-Pull;
- pruebas E2E locales y scripts API.

Dependencias:

- Auth;
- API;
- PostgreSQL en servidor;
- IndexedDB;
- sync contracts.

Limitaciones de producto:

- no hay UI visible de estado;
- no hay resolucion visual de conflictos;
- no hay SSE/WebSocket;
- header aun dice "Solo local".

### Configuracion

Estado: no implementado.

Evidencia:

- Header tiene `Preferencias` deshabilitado.
- No hay ruta funcional de settings.

### Inbox

Estado: retirado como superficie.

Evidencia:

- `/inbox` redirige a `/`.
- El dominio todavia mantiene `organizationStatus: "INBOX" | "ORGANIZED"`.
- Hay hooks `useNodes("inbox")` y `listInboxNodes`, pero no pantalla activa.

### Nueva nota

Estado: retirado como superficie.

Evidencia:

- `/notes/new` redirige a `/`.

### Search

Estado: retirado como superficie independiente.

Evidencia:

- `/search` redirige a `/notes?q=...`.

## 5. Capacidades reales existentes

### Captura

- Si existe: crear capturas desde Inicio.
- Funciona: si hay sesion autenticada y contexto local listo.
- Integrada: si, con IndexedDB, outbox, recuperacion y conceptos.
- Pendiente: captura desde un overlay global real; `QuickCaptureSheet` existe pero no se encontro montado en rutas/componentes activos.

### Autosave

- Existe: borrador de captura y autosave de detalle.
- Funciona: si.
- Integrada: si.
- Pendiente: no hay UI central para gestionar borradores.

### Sin titulos

- Existe: `Node` no tiene titulo.
- Funciona: si.
- Integrada: si.
- Pendiente: algunos textos de UI aun usan terminos como nota/captura mezclados, pero el modelo no guarda titulo.

### Recuperacion por asociaciones

- Existe: en captura mientras se escribe.
- Funciona: si, basada en lectura local.
- Integrada: si.
- Pendiente: no es una navegacion completa por red de conocimiento.

### Conceptos/contextos

- Existe: `Context` con tipos AREA, PROJECT, PERSON.
- Funciona: si.
- Integrada: parcialmente.
- Pendiente: navegacion principal y experiencia mas organica.

### Relaciones

- Existe: `NodeContextRelation`.
- Funciona: si.
- Integrada: si en detalle, captura y contextos.
- Pendiente: visualizacion mas rica de red/grafo.

### Historial

- Existe: `/notes`.
- Funciona: si.
- Integrada: si.
- Pendiente: nombre "Historial" puede reforzar linea temporal/listado mas que memoria contextual.

### Archivo

- Existe: `/notes/archive`.
- Funciona: si.
- Integrada: si, aunque secundaria.
- Pendiente: no visible en nav principal.

### Autenticacion

- Existe: registro/login/logout/restore/refresh.
- Funciona: si segun codigo y tests previos.
- Integrada: si.
- Pendiente: UX de cuenta/dispositivos/configuracion.

### Sincronizacion

- Existe: Push/Pull automatico.
- Funciona: si segun codigo y pruebas.
- Integrada: funcionalmente si; visualmente no.
- Pendiente: estado visible, conflictos visibles, notificaciones en tiempo real.

### Offline/local-first

- Existe: IndexedDB como fuente local, outbox persistente.
- Funciona: si.
- Integrada: si.
- Pendiente: UX explicita de offline/online.

### PWA

- Existe: manifest y registro de SW.
- Funciona: parcialmente verificable desde codigo.
- Integrada: basica.
- Pendiente: experiencia offline visible y auditoria de cache/precache.

## 6. Auditoria UX

### Experiencia que entrega hoy

Vinema se siente como una aplicacion de captura local con inteligencia contextual emergente. El primer contacto autenticado lleva directamente a escribir. No hay eleccion inicial de carpeta, titulo, tipo de nota ni ubicacion. Eso esta fuertemente alineado con la vision.

Mientras se escribe, la aplicacion intenta recordar por el usuario: muestra capturas relacionadas y conceptos. Esta es la parte que mas se acerca a "ayudar a pensar" en lugar de "administrar notas".

Despues de capturar, la experiencia se desplaza a un Historial con busqueda y listados. Ahi el producto se vuelve mas tradicional: tarjetas, busqueda, archivo, detalle, edicion, relaciones. Sigue funcionando, pero se siente mas como una base de datos de capturas.

### Partes coherentes

- La entrada principal es escribir.
- No hay titulo.
- El detalle abre en lectura.
- Editar es explicito.
- Guardado automatico reduce riesgo.
- Archivo no elimina.
- La recuperacion aparece mientras se escribe.
- El sistema puede sugerir asociaciones.
- IndexedDB es la fuente local.

### Partes que rompen o tensionan la filosofia

- Header muestra "Solo local" pese a sincronizacion.
- Areas/Proyectos/Personas existen como pantallas CRUD manuales.
- Contextos requieren nombre/descripcion y gestion explicita.
- La navegacion visible no incluye contextos, aunque el dominio los considera importantes.
- Historial puede sentirse como lista de notas.
- Busqueda en Historial/Archivo es prominente como formulario tradicional.
- Preferencias y Sincronizacion futura deshabilitados sugieren funcionalidades incompletas dentro de la UI.

### Partes heredadas de CRUD

- Formularios de crear contexto.
- Listados de contextos con Activos/Archivados.
- Detalle de contexto con Editar/Listo/Archivar.
- Busqueda con input y boton Buscar.
- Cargar mas.
- Archivo como listado administrativo.

### Partes que parecen segundo cerebro

- Superficie "Empieza a escribir".
- Recuperacion instantanea mientras se redacta.
- ConceptSuggestionChips.
- Relaciones de una captura con multiples contextos.
- Detalle en lectura primero.
- Ausencia de titulo.
- Flujo local-first con sincronizacion por debajo.

## 7. Consistencia con la vision

| Principio | Estado | Evidencia |
| --- | --- | --- |
| Captura no es nota tradicional | Cumple parcialmente | La UI usa "captura" con frecuencia y no hay titulo, pero rutas y nombres internos mantienen `notes` y `NodeType` tiene `NOTE`. |
| Sin titulos | Cumple | `Node` no tiene campo titulo; preview deriva del contenido. |
| Superficie unica de entrada | Cumple | `/` es la entrada; `/notes/new` e `/inbox` redirigen a `/`. |
| Busqueda + captura simultanea | Cumple parcialmente | En Inicio hay recuperacion mientras se escribe; busqueda formal vive en Historial/Archivo. |
| Recuperacion por asociaciones | Cumple parcialmente | Existe en captura y usa motor local; aun no es una navegacion completa por conocimiento. |
| Navegacion por conocimiento | Cumple parcialmente | Contextos y relaciones existen, pero no son navegacion principal visible. |
| Local-first | Cumple | IndexedDB, repositorios locales y outbox persistente. |
| Sincronizacion segura | Cumple parcialmente | Sync existe con outbox, push/pull, auth y conflictos tecnicos; falta UX de conflictos/estado. |
| Simplicidad | Cumple parcialmente | Inicio es simple; contextos/listados agregan complejidad manual. |
| Reducir carga cognitiva | Cumple parcialmente | Captura reduce carga; gestion de contextos puede aumentarla. |

## 8. Deuda de producto

Esta seccion evita deuda tecnica y se centra solo en producto.

### Navegacion incompleta

El producto tiene rutas funcionales para contextos y archivo, pero solo Inicio e Historial aparecen en sidebar. Esto hace que capacidades existentes sean poco descubribles.

### Contextos como gestion manual

Areas, Proyectos y Personas existen como entidades que el usuario puede crear, editar, archivar y restaurar. Esto puede contradecir la idea de que la organizacion debe emerger del sistema.

### Terminologia mixta

Coexisten:

- capturas;
- notas;
- historial;
- base de conocimiento;
- contextos;
- conceptos.

El modelo historico aun usa `Node`, rutas `notes`, `Context` para conceptos y `NOTE` como tipo.

### Sincronizacion invisible

La sincronizacion esta implementada, pero el usuario no ve estado, ultima sync, errores o conflictos. El header incluso dice "Solo local".

### Pantallas heredadas retiradas pero presentes

`/inbox`, `/notes/new` y `/search` existen como redirects. Funcionalmente es correcto para compatibilidad, pero indican transicion de producto.

### Quick Capture no montado

`QuickCaptureSheet` existe como componente, pero no se encontro uso activo en `src`. Producto-visible, no existe captura rapida global en forma de sheet.

### Preferencias inexistentes

La UI muestra item de preferencias deshabilitado. No hay modulo funcional asociado.

## 9. Mapa de informacion

### Captura primaria

```text
Usuario escribe
-> CaptureSurface.content
-> saveCaptureDraft(storage)
-> useAssociationSuggestions
-> nodes/contexts/relations locales
-> sugerencias de recuperacion y conceptos
-> usuario captura
-> commitCaptureText
-> captureText
-> createNode
-> IndexedDbLocalSyncNodeRepository.create
-> nodes + sync_mutations en una transaccion
-> relaciones opcionales
-> clearCaptureDraft
-> CAPTURE_CREATED_EVENT
-> Historial/recientes recargan
```

El flujo termina localmente en IndexedDB y en outbox. Remotamente continua cuando el orchestrator ejecuta Push.

### Asociacion con conceptos existentes

```text
Seleccion de chip existente
-> selectedContextIds
-> commitCaptureText
-> attachNodeToContext
-> node_context_relations
-> sync_mutations
```

Termina en una relacion local y mutacion pendiente.

### Concepto emergente

```text
Motor sugiere concepto emergente
-> usuario selecciona chip
-> commitCaptureText
-> getOrCreateEmergingConceptContext
-> contexts tipo AREA
-> relaciones con evidencia/captura
-> sync_mutations
```

Termina como `Context`, no como entidad `Concept` separada.

### Historial

```text
Usuario abre /notes
-> useVinemaContext
-> listKnowledgeCapturePage(nodeRepository)
-> cards de captura
-> /notes/detail?nodeId=...
```

Si hay busqueda:

```text
query q
-> searchNodes
-> nodos activos
-> highlights/excerpts
```

### Detalle de captura

```text
/notes/detail?nodeId
-> useNode
-> nodeRepository.findById
-> listContextsForNode
-> listContextsByType
-> lectura
-> editar
-> updateNode
-> sync_mutations
```

Archivo:

```text
archiveNode
-> status ARCHIVED
-> sync_mutations
-> router a /notes o returnTo
```

### Contextos

```text
/contexts/:type
-> listContextsByType
-> count relations
-> crear contexto
-> contexts + sync_mutations
```

Detalle:

```text
/contexts/detail?contextId
-> getContextById
-> listNodesForContext
-> editar/archivar/restaurar
-> contexts + sync_mutations
```

### Sincronizacion

```text
Escritura local
-> sync_mutations PENDING
-> AutomaticSyncOrchestrator
-> PushCoordinator
-> SyncClient POST /api/sync/push
-> API processPush
-> PostgreSQL/sync store
-> PullCoordinator
-> SyncClient GET /api/sync/pull
-> RemoteChangeApplier
-> IndexedDB
-> SyncDataChangedEvent
-> vistas recargan
```

El flujo termina en convergencia local/remota si no hay conflictos.

## 10. Gap analysis

| Capacidad | Existe | Funciona | Integrada | Pendiente |
| --- | --- | --- | --- | --- |
| Registro | Si | Si | Si | UX avanzada de cuenta |
| Login | Si | Si | Si | Recuperacion de password no existe |
| Logout | Si | Si | Si | Confirmacion/estado visible |
| Restore session | Si | Si | Si | UX mas detallada |
| Silent refresh | Si | Si | Si | Indicador visible no existe |
| Trusted device | Si | Si | Si | Gestion visible de dispositivos |
| Captura principal | Si | Si | Si | Ninguna evidente funcional |
| Captura rapida global sheet | Parcial | No visible | No | Montaje/flujo producto |
| Borrador de captura | Si | Si | Si | Gestion visible de borradores |
| Captura sin titulo | Si | Si | Si | Terminologia consistente |
| Recuperacion mientras se escribe | Si | Si | Si | Navegacion mas profunda |
| Sugerencias de conceptos | Si | Si | Si | Modelo conceptual final |
| Conceptos emergentes | Si | Si | Parcial | Se guardan como AREA |
| Historial | Si | Si | Si | Mejor alineacion conceptual |
| Busqueda activa | Si | Si | Si | No depender demasiado de busqueda |
| Archivo | Si | Si | Parcial | Descubribilidad |
| Detalle lectura | Si | Si | Si | Ninguna funcional evidente |
| Edicion explicita | Si | Si | Si | Conflictos remotos visibles |
| Autosave en detalle | Si | Si | Si | Estado remoto/conflicto |
| Contextos Areas | Si | Si | Parcial | Navegacion principal |
| Contextos Proyectos | Si | Si | Parcial | Navegacion principal |
| Contextos Personas | Si | Si | Parcial | Navegacion principal |
| Relaciones captura-contexto | Si | Si | Si | Visualizacion mas organica |
| Inbox | Ruta existe | Redirige | Retirado | Decidir si dominio INBOX sigue |
| Nueva nota | Ruta existe | Redirige | Retirado | Ninguno si se mantiene superficie unica |
| Search route | Ruta existe | Redirige | Retirado | Ninguno si busqueda vive en Historial |
| Local-first | Si | Si | Si | UX offline visible |
| Outbox | Si | Si | Si | UI de pendientes |
| Push | Si | Si | Si | Estado visible |
| Pull | Si | Si | Si | Estado visible |
| UI post-Pull | Si | Si | Si | SSE futuro si se quiere menor latencia |
| Conflictos sync | Si tecnico | Parcial | No UX | Resolucion usuario |
| PWA manifest | Si | Parcial | Basica | Auditoria offline/cache |
| Service worker | Si registrado | No auditado | Parcial | UX offline |
| Configuracion | No | No | No | Pantalla inexistente |
| Preferencias | Item deshabilitado | No | No | Definir o retirar |
| Estado de sync visible | No | No | No | Definir si corresponde |

## 11. Que esta mas avanzado de lo que parecia

- La sincronizacion no es solo un cliente HTTP: incluye outbox persistente, coordinadores, orquestador, estado, lifecycle autenticado y aplicacion remota.
- La autenticacion no es superficial: tiene sesion persistente, refresh, logout, trusted device y validacion de API URL publica.
- La captura no solo guarda texto: integra borrador, recuperacion, conceptos, relaciones y mutaciones atomicas.
- Los contextos no son solo documentos: tienen repositorios, UI, archivo/restauracion, relaciones y sync.
- La UI ya reacciona a cambios remotos aplicados por Pull mediante invalidacion local.
- La ruta dinamica de detalle fue reemplazada por rutas estaticas con query params, compatible con la arquitectura actual.

## 12. Que se pensaba que existia pero no existe como producto visible

- Captura rapida global como sheet/modal visible: existe componente `QuickCaptureSheet`, pero no se encontro montado.
- Navegacion por Areas/Proyectos/Personas desde la navegacion principal: las rutas existen, pero no estan expuestas.
- Configuracion/Preferencias: aparece deshabilitado, no existe pantalla.
- Estado de sincronizacion para usuario: existe maquinaria interna, no superficie visible.
- Gestion de dispositivos: existe modelo y API, no pantalla.
- SSE/WebSocket: no existe.
- Diario: no existe pantalla funcional dedicada.
- Exploracion tipo grafo/mapa de conocimiento: no existe.

## 13. Que existe pero estaba desconectado o poco visible

- Contextos: funcionales pero sin entrada principal.
- Archivo: funcional, accesible desde Historial, no desde nav global.
- Search route: existe solo como redirect.
- Inbox: dominio/hook existe, ruta redirige.
- QuickCaptureSheet: componente existente sin uso activo detectado.
- Sincronizacion: funcional pero invisible para usuario.

## 14. Modulos maduros

- Captura principal.
- Persistencia IndexedDB.
- Repositorios sync-aware para escrituras locales.
- Historial/Base de Conocimiento.
- Detalle de captura.
- Archivo basico.
- Autenticacion lifecycle.
- Sync Push/Pull y outbox.
- Recuperacion local mientras se escribe.

## 15. Modulos experimentales o incompletos desde producto

- Contextos como experiencia de navegacion.
- Conceptos emergentes como producto final.
- QuickCaptureSheet.
- Estado visible de sincronizacion.
- Resolucion de conflictos.
- PWA/offline como experiencia comunicada.
- Preferencias/configuracion.
- Navegacion por conocimiento.

## 16. Contradicciones con la vision original

### Organizacion emergente vs gestion manual

La vision indica que el usuario deberia concentrarse en escribir y que la organizacion debe surgir del sistema. Las pantallas de contextos exigen creacion manual, nombres, descripciones, archivo y restauracion. Funcionalmente son utiles, pero se acercan a administracion manual.

### Contextos como navegacion principal vs sidebar minima

La constitucion habla de navegar por contextos. El producto tiene contextos, pero la navegacion visible solo muestra Inicio e Historial.

### Sincronizacion real vs mensaje "Solo local"

El producto ya sincroniza, pero la cabecera comunica "Solo local". Esto puede confundir la experiencia.

### Busqueda secundaria vs presencia fuerte en Historial

La busqueda es secundaria segun la vision. En Historial y Archivo aparece como formulario prominente. En Inicio, la recuperacion mientras se escribe si cumple mejor la filosofia.

### Captura vs notas

El usuario ve "capturas" en muchas partes, pero rutas y entidades internas siguen usando `notes`, `NOTE` y `Node`. Como producto visible, la mezcla aun puede filtrar conceptos antiguos.

## 17. Temas que deberian discutirse antes de seguir desarrollando

Esta seccion no propone soluciones; enumera discusiones necesarias.

1. Si Areas/Proyectos/Personas deben ser navegacion principal visible o permanecer como soporte secundario.
2. Si la gestion manual de contextos contradice demasiado la idea de organizacion emergente.
3. Si "Historial" es el nombre correcto para la Base de Conocimiento.
4. Si el producto debe mostrar estado de sincronizacion o mantener sync invisible.
5. Si el badge "Solo local" debe seguir existiendo cuando hay sync.
6. Que rol real tendra `INBOX`, dado que la ruta fue retirada pero el dominio conserva el estado.
7. Si `QuickCaptureSheet` debe convertirse en producto visible o eliminarse como superficie no usada.
8. Como se explicara al usuario la diferencia entre captura, concepto, contexto, historial y archivo.
9. Si los conceptos emergentes deben seguir materializandose como Areas.
10. Como se resolveran conflictos de sincronizacion sin aumentar carga cognitiva.
11. Si la busqueda debe seguir siendo formulario destacado o quedar subordinada a recuperacion contextual.
12. Si se quiere priorizar SSE/notificaciones remotas o consolidar primero la experiencia local visible.

## 18. Conclusion

Vinema hoy ya no es solamente una aplicacion de notas. El codigo actual implementa una base local de capturas, recuperacion contextual, asociaciones, conceptos/contextos y sincronizacion autenticada. La parte mas diferenciadora es la superficie de captura con memoria activa mientras se escribe.

El producto todavia conserva superficies y estructuras que se sienten heredadas de un CRUD: listados, formularios de contextos, archivo y busqueda explicita. Algunas capacidades avanzadas existen pero no son visibles o no estan integradas en la navegacion principal.

La discusion funcional mas importante antes de continuar no es tecnica. Es decidir que lugar deben ocupar los contextos y la sincronizacion dentro de la experiencia visible sin romper la promesa central: reducir carga cognitiva y ayudar a pensar.
