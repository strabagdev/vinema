# VIN-023A - Sistema de apariencia

## Estado

Implementado.

## Objetivo

Vinema soporta tres opciones de apariencia:

- Claro;
- Oscuro;
- Sistema.

La seleccion vive en las preferencias existentes del canvas, bajo
`vinema:canvas-preferences`, en el campo `appearance`. Los valores validos son
`light`, `dark` y `system`. Cualquier valor desconocido vuelve al fallback seguro
`system`.

## Aplicacion del tema

El tema se aplica en `document.documentElement` mediante:

- `data-vinema-appearance`: preferencia seleccionada por el usuario;
- `data-vinema-theme`: tema resuelto efectivo, `light` o `dark`;
- `color-scheme`: tema resuelto para controles nativos.

Cuando `appearance` es `system`, Vinema observa
`prefers-color-scheme: dark` y actualiza el tema resuelto si cambia la
preferencia del sistema. Cuando `appearance` es `light` o `dark`, los cambios del
sistema no alteran la interfaz.

Para reducir parpadeos antes de la hidratacion, Vinema mantiene un espejo
sincronico de la seleccion en `localStorage` con la clave `vinema:appearance`.
La preferencia canonica sigue siendo `vinema:canvas-preferences` en el
adaptador de almacenamiento existente.

## Tokens semanticos

Los tokens viven en `src/app/globals.css` y cubren:

- `--vinema-background`;
- `--vinema-canvas-surface`;
- `--vinema-surface`;
- `--vinema-surface-elevated`;
- `--vinema-surface-panel`;
- `--vinema-surface-modal`;
- `--vinema-text-primary`;
- `--vinema-text-secondary`;
- `--vinema-text-muted`;
- `--vinema-text-faint`;
- `--vinema-border`;
- `--vinema-border-subtle`;
- `--vinema-border-strong`;
- `--vinema-hover`;
- `--vinema-selection`;
- `--vinema-input`;
- `--vinema-input-border`;
- `--vinema-focus`;
- `--vinema-overlay`;
- `--vinema-shadow-panel`;
- `--vinema-shadow-modal`;
- `--vinema-accent-amber-soft`;
- `--vinema-accent-amber`;
- `--vinema-accent-amber-muted`;
- `--vinema-accent-indigo-soft`;
- `--vinema-accent-indigo`;
- `--vinema-accent-indigo-muted`.

El modo oscuro usa una base grafito/zinc oscura, no negro puro. Canvas, paneles y
modales tienen diferencias sutiles de superficie para mantener la lectura
editorial.

## Guia para nuevas superficies

Las nuevas superficies deben preferir tokens semanticos cuando definan colores
propios. Si reutilizan clases Tailwind existentes de Vinema (`bg-white`,
`text-zinc-*`, `border-zinc-*`, acentos ambar/indigo), el puente global de
`globals.css` las adapta al tema oscuro.

No se deben duplicar componentes por tema. Los estados de foco deben seguir
usando `focus-visible` y no depender unicamente del color para comunicar estado.

## Alcance cubierto

El sistema aplica a:

- canvas principal;
- rail izquierdo;
- boton de captura;
- paneles de conceptos, memoria, configuracion y estado;
- editor de captura;
- modales y stack del workspace;
- detalle de captura;
- detalle de concepto y sus tabs;
- inputs, botones, chips, estados vacios y scrollbars personalizados.

Algunos colores directos permanecen cuando expresan semantica especifica de
estado o marca, por ejemplo acentos ambar/indigo, errores rojos y estados
tecnicos de sincronizacion. Esos colores se ajustan mediante tokens o se
mantienen por su significado funcional.
