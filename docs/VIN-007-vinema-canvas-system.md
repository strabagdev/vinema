# VIN-007 Vinema Canvas System

## Alcance

VIN-007 transforma la superficie principal de captura en un sistema de escritura local-first. No cambia el modelo semantico, el flujo de sincronizacion, la persistencia de capturas ni la arquitectura de conocimiento.

## Componentes

- `VinemaCanvas`: region raiz del lienzo, con altura estable, overflow oculto y tokens CSS estables del canvas.
- `VinemaCanvasEditor`: editor de texto con scroll interno, seleccion Vinema y caret propio.
- `CanvasSubmitButton`: accion primaria visible solo con contenido valido, sin desmontarse.
- `CanvasPreferencesPanel`: ajustes locales de tamano de texto y apariencia.
- `CanvasWritingSurface`: region estable del canvas que contiene el editor, el viewport con scroll interno y una capa contextual no scrollable.
- `CanvasSidePanel`: panel unico reutilizado por herramientas permanentes y resultados contextuales.

## Navegacion De Superficie

El rail izquierdo contiene solo accesos permanentes de superficie y exploracion global:

- Explorar conocimiento (`Brain`);
- Explorar conceptos (`Network`);
- Canvas;
- Estado.

Las sugerencias de Memoria y Conceptos no modifican el rail. Cuando existen resultados reales para la captura actual, aparecen en una barra contextual propia del canvas, sobre la superficie de escritura y fuera del area editable.

La administracion del conocimiento no vive en el rail. El centro `Conocimiento`
se abre desde el menu de tres puntos y reune importar, exportar y vaciar.

Los paneles contextuales solo muestran sugerencias derivadas del contenido
actual. La exploracion global pertenece al rail; por eso Memoria y Conceptos no
incluyen CTAs para abrir los workspaces completos.

La barra contextual:

- no se renderiza cuando no hay resultados;
- ocupa una franja superior estructuralmente reservada del Canvas;
- puede mostrar Memoria, Conceptos o ambas;
- no vive dentro de `data-canvas-scroll-viewport`;
- no cambia la posicion visual de sus indicadores;
- deja que el contenido editable comience debajo de esa franja, existan o no
  sugerencias, para evitar interferencias y cambios de layout;
- no cambia el ancho del editor, el seguimiento del caret ni el scroll interno;
- reutiliza el mismo `CanvasSidePanel` y el mismo modelo de `pinnedPanel` / `previewPanel`;
- estabiliza indicadores con resultados confirmados, sin parpadear por estados
  intermedios de evaluacion;
- trata trigger, corredor y panel visible como una region interactiva continua,
  sin zonas muertas dentro de la superficie visible;
- coordina el hover contextual con estado explicito de trigger, corredor y
  panel, usando eventos pointer para que el cierre de 240ms solo avance cuando
  el puntero salio de toda la region y no hay panel fijado;
- actualiza sugerencias de forma silenciosa: no solicita refrescar manualmente
  resultados contextuales, conserva estable el snapshot abierto y usa el ultimo
  resultado confirmado al volver a abrir;
- prioriza recuperacion local para Memoria y no deja que `Recordando...`
  dependa de una carga indefinida o de sync remoto.

## Preferencias

Las preferencias viven en `vinema:canvas-preferences` usando `StorageAdapter`. Se validan al cargar, ignoran campos antiguos removidos y vuelven a defaults con reset.

Defaults:

- texto: `16`
- apariencia: `system`

El canvas usa siempre un ancho amplio y estable de `920px` en escritorio, adaptado por CSS al espacio disponible en tablet y movil. No existe selector de ancho.

La tipografia del canvas es unica: Geist Sans, ya configurada en la aplicacion mediante `next/font`. Se aplica de forma consistente al editor de captura, quick capture, edicion de notas, placeholder y futuras vistas estructuradas del canvas. El logo conserva su identidad tipografica propia.

El tamano de texto conserva cuatro niveles internos (`14`, `16`, `18`, `20`) y se ajusta mediante los controles compactos `-A` y `+A`. Los valores numericos no se muestran como selector principal.

## Prompts

Los prompts estan centralizados por categoria en `canvas-prompts.ts`. El placeholder usa la mezcla interna y se elige una vez para una captura vacia; no rota mientras la persona escribe.

## Revision Manual

- 375 x 667: no hay scroll global; solo el editor desplaza texto largo.
- 768 x 1024: panel de preferencias entra como panel lateral usable.
- 1440 x 900: lienzo centrado, ancho amplio estable de 920px, sin tarjeta decorativa.
- Verificar que el logo permanece centrado en el header y el menu a la derecha.
