# VIN-018 - Captura rapida global

## Objetivo

VIN-018 agrega una entrada de captura rapida disponible desde el App Shell para
que el usuario pueda escribir y capturar sin abandonar el contexto actual.

La ruta `/` sigue siendo la superficie completa de captura. La captura rapida no
la reemplaza: ofrece una entrada ligera al mismo flujo local, offline-first y
centrado en contenido.

## Estado previo

Antes de este paquete, el usuario podia capturar desde `/` y navegar a la Base de
Conocimiento, Archivo o detalle. Desde esas superficies, iniciar una nueva
captura exigia volver a la ruta principal.

El borrador principal ya existia en `app_settings` bajo la clave:

```text
vinema:capture-draft:v1
```

## Decision de producto

La accion global se llama visualmente `Capturar`, pero su nombre accesible y
tooltip la distinguen como captura rapida. La navegacion principal `Capturar`
del sidebar mantiene su rol: abrir la superficie completa `/`.

Cuando el usuario ya esta en `/`, la accion rapida no abre un segundo editor.
Enfoca la superficie completa para evitar editores simultaneos sobre el mismo
borrador.

## Captura rapida

La captura rapida se presenta como un sheet ligero del App Shell. Incluye solo:

- editor de texto;
- estado discreto del borrador;
- accion `Capturar`;
- accion `Cerrar`;
- accion secundaria `Abrir captura completa`.

No muestra tipo, estado interno, contextos, relaciones, carpetas, etiquetas,
fechas ni metadata.

## Atajo global

El atajo elegido es:

```text
Ctrl+Shift+K
Cmd+Shift+K
```

El listener vive en el App Shell, se desmonta con el componente y no se activa
cuando el foco esta en `input`, `textarea`, `select` o un elemento editable.

## Borrador compartido

La captura rapida usa la misma abstraccion `capture-draft.ts` y la misma clave
`vinema:capture-draft:v1` que la superficie `/`.

Cerrar el sheet no elimina el borrador. El texto se guarda con debounce y se
restaura desde la ultima version persistida cada vez que se abre. El contenido
vacio o compuesto solo por espacios no se persiste.

## Flujo de captura

El commit de captura se centralizo en `commitCaptureText`:

1. valida contenido real;
2. reutiliza `captureText`;
3. crea un unico `Node` interno `NOTE` organizado;
4. conserva las reglas temporales de VIN-017;
5. limpia el borrador compartido;
6. emite un evento local de captura creada.

La UI bloquea doble accion mientras la captura esta en curso.

## Navegacion y foco

Al abrir la captura rapida, el foco va al editor. El sheet puede cerrarse con
`Escape` o con `Cerrar`, y devuelve foco al disparador cuando corresponde.

`Abrir captura completa` guarda primero el borrador actual, cierra el sheet y
navega a:

```text
/#capture
```

La superficie principal escucha el evento de foco y enfoca el editor completo.

## Actualizacion de superficies

El App Shell emite un evento local `vinema:capture-created` despues de capturar.
La Base de Conocimiento abierta escucha ese evento y recarga su listado o su
busqueda activa usando la logica existente.

Archivo no incorpora esa captura porque consulta explicitamente capturas
archivadas. Detalle puede abrir captura rapida sin cambiar de ruta ni perder el
detalle actual.

## PWA y Tauri

No se agregaron rutas nuevas ni APIs nativas. La captura rapida vive dentro del
App Shell existente, por lo que funciona sobre las rutas estaticas ya exportadas.

El service worker no requiere nuevas entradas de precache para este paquete. La
persistencia sigue usando IndexedDB y `app_settings`; no se agregaron stores,
indices ni migraciones.

## Pruebas

Se agrego cobertura para:

- apertura desde accion global;
- apertura mediante atajo;
- foco inicial en editor;
- cierre con `Escape`;
- retorno de foco;
- restauracion y guardado del borrador compartido;
- cierre sin crear captura;
- borrador whitespace sin persistencia;
- captura unica con timestamps;
- limpieza de borrador;
- navegacion a captura completa conservando texto;
- no abrir segundo editor en `/`;
- refresco de Base ante una captura creada.

## Validaciones

Validaciones requeridas para el cierre:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Archivos modificados

- `src/components/app-shell/app-shell.tsx`
- `src/components/app-shell/app-header.tsx`
- `src/components/ui/sheet.tsx`
- `src/features/capture/capture-events.ts`
- `src/features/capture/capture-flow.ts`
- `src/features/capture/capture-surface.tsx`
- `src/features/capture/quick-capture-sheet.tsx`
- `src/app/notes/knowledge-base-client.tsx`
- `src/tests/quick-capture.test.ts`
- `src/tests/knowledge-base.test.ts`
- `docs/product/VIN-018-CAPTURA-RAPIDA-GLOBAL.md`

## Limitaciones

- No hay sincronizacion compleja entre pestanas.
- No hay atajo global del sistema operativo fuera de la ventana de la app.
- No hay Share Target de PWA ni captura desde fuera de Vinema.
- La actualizacion de superficies usa un evento local simple, no un sistema
  general de invalidacion.

## Deuda tecnica

- Si crece el numero de superficies que necesitan reaccionar a cambios locales,
  convendra formalizar una capa pequena de invalidacion local.
- La ruta tecnica `/notes` sigue representando la Base de Conocimiento por
  compatibilidad historica.

## Proximo paquete recomendado

Revisar ergonomia fina de captura en movil y decidir si conviene evolucionar el
sheet hacia un patron compartido con otras acciones locales, sin introducir
nuevos flujos de captura ni nuevos borradores.
