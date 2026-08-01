# VIN-012A — Unified Visual Feedback System

## Filosofia

Vinema comunica el estado del sistema desde un unico lugar: un pulso visual superior, centrado bajo el header. No es un toast, una notificacion ni una barra de estado tecnica. Es una senal estable que permite que la superficie de pensamiento siga tranquila.

La regla permanente es:

- los exitos se comunican visualmente;
- los errores se comunican con texto;
- mientras todo funciona no aparecen palabras visibles.

## Ubicacion

El pulso vive en una capa fija:

- parte superior;
- centrado horizontalmente;
- debajo del header;
- sin desplazar layout;
- sin tapar el editor.

La ubicacion es igual en desktop, tablet y movil.

## Servicio

El mecanismo oficial es `VisualFeedbackService`.

Los componentes publican eventos simples:

- `feedback.saving()`;
- `feedback.capture()`;
- `feedback.concept()`;
- `feedback.idea()`;
- `feedback.relation()`;
- `feedback.syncing()`;
- `feedback.synced()`;
- `feedback.offline()`;
- `feedback.error(message)`.

Ningun componente debe decidir donde mostrar el feedback. La unica superficie visual es `VisualFeedbackViewport`.

## Estados

| Estado | Icono | Color | Texto visible |
| --- | --- | --- | --- |
| Reposo | Circulo | Gris suave | No |
| Guardando | Sparkle | Violeta suave | No |
| Captura | Sparkle | Violeta suave | No |
| Concepto | Brain | Indigo suave | No |
| Idea | Lightbulb | Ambar suave | No |
| Relacion | Link | Azul suave | No |
| Sincronizando | LoaderCircle | Ambar | No |
| Sincronizado | Check | Verde | No |
| Offline | CircleDashed | Gris | No |
| Error | AlertCircle | Rojo | Si |

Los lectores de pantalla reciben texto accesible mediante `aria-live="polite"`.

## Prioridades

Si ocurren varios eventos, el servicio mantiene una cola y muestra solo uno a la vez.

Orden de prioridad:

1. Errores.
2. Sincronizacion y offline.
3. Capturas y sincronizado.
4. Eventos menores: guardado, concepto, idea, relacion.

Los eventos persistentes se deduplican para evitar ruido.

## Animaciones

Las animaciones son discretas:

- fade;
- scale leve;
- rotacion solo en sincronizacion;
- duracion corta;
- soporte de `prefers-reduced-motion`.

No se usan rebotes, entradas laterales ni animaciones constantes fuera de sincronizacion.

## Migracion inicial

Se migraron los feedbacks locales de:

- superficie principal de captura;
- captura rapida heredada;
- detalle de captura;
- estado offline del header.

Los mensajes como `Borrador guardado`, `Captura guardada`, `Guardando...` y `Modo local` dejan de aparecer como texto visible fuera del pulso.

## Reglas para futuros modulos

- No agregar mensajes locales de exito.
- No crear toasts ni notificaciones paralelas.
- No usar strings arbitrarios de estado repartidos por componentes.
- Los errores pueden tener texto, pero deben publicarse con `feedback.error(message)`.
- Si el evento no requiere accion del usuario, debe ser iconografico.
- Si un modulo necesita comunicar un nuevo tipo de pulso, debe extender el servicio central.
