# VIN-010C — Primary Thinking Surface Redesign

## Estado anterior

La ruta `/` ya funcionaba como superficie unica de captura, busqueda y asociacion. Sin embargo, visualmente compartia pantalla con elementos heredados de una aplicacion de notas:

- sidebar permanente en escritorio;
- badge permanente `Solo local`;
- encabezado visible de la superficie;
- textarea con borde, fondo y apariencia de formulario;
- lista de capturas recientes debajo del editor;
- acceso visual a historial dentro de Inicio.

Las capacidades funcionales estaban correctamente conectadas: autosave, recuperacion, conceptos emergentes, relaciones, persistencia local-first y sincronizacion autenticada.

## Elementos retirados de Inicio

Se retiro de la ruta principal:

- lista de capturas recientes;
- estado vacio `Todavia no hay capturas`;
- dependencia visual de Inicio como historial;
- sidebar permanente en escritorio;
- badge permanente `Solo local`;
- marco visual de formulario alrededor del editor.

No se eliminaron rutas, repositorios ni datos. Las capturas siguen disponibles desde `/notes` y `/notes/archive`.

## Elementos conservados

Se conservaron:

- autosave de borrador;
- restauracion de borrador;
- captura sin titulo;
- boton discreto de captura;
- `Ctrl/Cmd + Enter` para capturar;
- Enter nativo para escribir multiples lineas;
- `ConceptSuggestionChips`;
- `CaptureRecoveryResults`;
- preservacion de borrador al abrir un recuerdo;
- seleccion de conceptos existentes y emergentes;
- creacion de relaciones captura-contexto;
- outbox y sincronizacion local-first;
- atajo global `Ctrl/Cmd + Shift + K`.

## Decisiones visuales

El editor queda integrado al cuerpo de la pagina:

- sin borde permanente;
- sin tarjeta;
- sin sombra;
- fondo transparente;
- tipografia grande, regular y con line-height amplio;
- ancho maximo de lectura;
- foco automatico;
- `aria-label` conservado.

Se reutiliza Geist, la familia ya disponible en el proyecto. No se agregaron fuentes nuevas.

## Navegacion

El shell autenticado ahora utiliza una navegacion superior minima:

- Inicio: `/`;
- Explorar: `/notes`;
- Archivo: `/notes/archive`;
- perfil/sesion en menu.

La ruta no se renombro. `Explorar` es una etiqueta visual para el historial actual mientras no exista una nueva superficie de exploracion.

El componente de sidebar no fue eliminado porque sigue siendo reutilizado como contenido compacto para la navegacion movil.

## Conceptos

Los conceptos emergentes y existentes siguen viniendo del motor restaurado en VIN-010B.

La superficie solo cambia su ubicacion y contexto visual:

- aparecen cerca del editor;
- no se muestran si el editor esta vacio;
- no roban foco;
- no muestran etiquetas tecnicas;
- se preserva la seleccion actual.

## “Me recuerda a”

La recuperacion sigue usando `CaptureRecoveryResults` sin cambios de motor.

La seccion:

- aparece solo si hay resultados, loading o error;
- muestra fragmentos de capturas, no titulos fabricados;
- conserva el borrador antes de abrir un recuerdo;
- permanece subordinada al texto actual.

## Estado sync y conectividad

Se retiro `Solo local` porque no representaba el estado real del sistema.

Actualmente el header no consume directamente `SyncStateEngine`, por lo que no se inventaron estados visuales como `Sincronizado`, `Pendiente` o `Error`. La unica senal nueva respaldada por datos reales es `Modo local`, basada en `navigator.onLine`.

Pendiente para una fase futura:

- exponer un provider React de estado de sincronizacion;
- mostrar cambios pendientes;
- mostrar errores accionables;
- mostrar conflictos solo cuando requieran decision del usuario.

## Responsive

La superficie principal queda en una sola columna en movil y escritorio. El editor ocupa el ancho util y las acciones permanecen debajo del texto. La navegacion movil sigue disponible mediante el patron compacto existente.

No se fuerza layout de dos columnas ni se reintroduce sidebar permanente.

## Accesibilidad

Se mantiene:

- `aria-label` del editor;
- foco visible en navegacion y botones;
- `aria-live` para borrador, errores y confirmacion;
- botones con area clicable adecuada;
- navegacion por teclado;
- orden logico del DOM;
- contraste sobrio.

El editor conserva el cursor real como estado vacio principal. El placeholder es minimo y desaparece al enfocar.

## Limitaciones

No se implemento una nueva vista Explorar.

No se implementaron Plazas.

No se implemento grafo.

No se modifico sincronizacion, autenticacion, IndexedDB, Prisma ni motores de asociaciones.

