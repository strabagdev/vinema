# VIN-011C — Knowledge Base Surface

## Contexto

VIN-011C transforma el modo de exploracion contextual en una Base de conocimiento. La decision de producto es que Vinema no tiene una seccion global llamada Explorar ni una portada vacia de conocimiento. La Base de conocimiento siempre comienza desde un concepto actual y aparece como una profundizacion natural de la superficie principal.

## Estado anterior

VIN-011B ya habia creado la ruta estatica `/concepts/detail?contextId=<id>` con:

- carga de concepto central;
- recuerdos relacionados;
- navegacion entre conceptos por coocurrencia;
- invalidacion despues de sincronizacion;
- acceso desde identidad emergente en detalle, historial y archivo.

La experiencia aun usaba lenguaje de exploracion y no tenia un gesto explicito desde los paneles progresivos de Inicio.

## Acceso

No se agrego ningun boton global en el header. El acceso ocurre desde contexto existente:

- conceptos detectados mientras se escribe;
- panel "Me recuerda a..." cuando los recuerdos tienen identidad emergente;
- identidad emergente en detalle, historial y archivo;
- conexiones dentro de la propia Base de conocimiento.

El boton de panel usa el icono de expansion y el texto accesible `Profundizar en Base de conocimiento`. Solo aparece cuando existe un concepto persistido que puede ser centro. No se crea un concepto automaticamente para abrir la superficie.

## Superficie

La ruta `/concepts/detail` se mantiene porque ya es compatible con el modelo local-first y con rutas estaticas. En VIN-011C, la pantalla se presentaba como una Base de conocimiento centrada en el concepto:

- boton visible para volver;
- nombre del concepto actual;
- contador de recuerdos;
- contador de conceptos conectados;
- modos Recuerdos, Tiempo y Mapa;
- conexiones cercanas derivadas por coocurrencia.

No hay breadcrumbs, dashboard, CRUD ni listado global.

Desde VIN-UX-007, los modos Recuerdos, Tiempo y Mapa dejaron de ser parte del
detalle. `/concepts/detail` funciona como perfil vivo de lectura continua, y la
exploracion global de conexiones vive en `/concepts/explore`.

## Modos

### Recuerdos

Es el modo inicial. Muestra capturas relacionadas con el concepto actual usando fragmentos del contenido y la identidad emergente cuando existe. No fabrica titulos.

### Tiempo

Agrupa los mismos recuerdos por momento. Sigue siendo una forma de mirar el mismo centro, no otra ubicacion.

### Mapa

Queda preparado sin implementar Graphify ni un grafo visual. Muestra el centro actual, la actividad conectada y conceptos cercanos ya derivados por coocurrencia.

## Paneles progresivos

Los paneles conservan su comportamiento efimero:

- escritorio: popover flotante dentro del viewport;
- movil: bottom sheet parcial;
- cierre con Escape, click fuera o perdida de foco;
- foco del editor preservado;
- borrador persistido antes de profundizar.

El enlace de expansion incluye `from=panel` para que la Base de conocimiento pueda reconocer el origen de la transicion sin depender de una ruta global.

## Sincronizacion

La Base de conocimiento sigue escuchando invalidaciones de datos para:

- `capture`;
- `concept`;
- `captureConcept`.

Cuando otro cliente sincroniza cambios, la vista abierta se recarga desde los repositorios locales.

## Responsive y accesibilidad

La pantalla mantiene un layout de una columna en movil y agrega una columna lateral ligera en escritorio. Los modos son botones con `aria-label`, `aria-pressed` y foco visible. Los paneles tienen `role="dialog"`, titulo accesible y accion de cierre en movil.

## Restricciones respetadas

No se crearon tablas, stores, entidades, migraciones, contratos de sync, IA, SSE, Plazas, Graphify ni posiciones persistentes.

## Pendientes

- Diseñar el mapa visual real de conceptos.
- Decidir si el nombre visible de la ruta debe cambiar sin romper URLs existentes.
- Profundizar la transicion visual entre panel y superficie si se incorpora una capa de animacion mas rica.
