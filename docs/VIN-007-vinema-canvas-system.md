# VIN-007 Vinema Canvas System

## Alcance

VIN-007 transforma la superficie principal de captura en un sistema de escritura local-first. No cambia el modelo semantico, el flujo de sincronizacion, la persistencia de capturas ni la arquitectura de conocimiento.

## Componentes

- `VinemaCanvas`: region raiz del lienzo, con altura estable, overflow oculto y tokens CSS estables del canvas.
- `VinemaCanvasEditor`: editor de texto con scroll interno, seleccion Vinema y caret propio.
- `CanvasSubmitButton`: accion primaria visible solo con contenido valido, sin desmontarse.
- `CanvasPreferencesPanel`: ajustes locales de tamano de texto y apariencia.

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
