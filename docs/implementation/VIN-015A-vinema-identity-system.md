# VIN-015A - Vinema Identity System

## Arquitectura

Se agrego `src/brand` como API publica de identidad:

- `BrandWordmark`;
- `BrandMonogram`;
- `BrandLockup`;
- `BrandIcon`;
- `BrandIntro`;
- `brandTokens`;
- `brandGeometry`.

La geometria oficial no depende de fuentes instaladas.

La direccion tipografica queda fijada como sans serif geometrica, moderna y
estilizada: peso ligero-regular, trazos uniformes, angulos limpios, vertices
definidos, tracking amplio y espacio negativo generoso. Se evita cualquier
lectura futurista, tecnologica, ornamental, condensada, demasiado redondeada o
corporativa generica.

## Fuente Maestra y Assets

Fuente oficial:

`src/brand/master/vinema-master.svg`

Assets derivados:

- `src/brand/assets/wordmark.svg`;
- `src/brand/assets/monogram.svg`;
- `src/brand/assets/lockup.svg`;
- `src/brand/assets/icon.svg`;
- `public/brand/favicon.svg`;
- `public/brand/favicon.ico`;
- `public/brand/apple-touch-icon.png`;
- `public/brand/pwa-192.png`;
- `public/brand/pwa-512.png`;
- `public/brand/pwa-maskable-512.png`;
- `src-tauri/icons/*`.

Los iconos Tauri fueron regenerados con `npx tauri icon public/brand/favicon.svg`.

## Componentes

`BrandWordmark` renderiza `VINEMA` como SVG. `BrandMonogram` renderiza `VA`.
`BrandLockup` combina ambos para usos documentales o secundarios.

Ningun consumidor debe reconstruir la marca con texto HTML.

## A Sin Travesano

La A oficial usa dos diagonales y no tiene travesano horizontal. Esta regla se
aplica en wordmark, monograma, lockup, favicon, PWA y Tauri.

La V y la A comparten peso, altura, terminaciones, inclinacion visual y logica
geometrica. No existen variantes pequenas con travesano; el monograma mantiene
una separacion visible entre V y A para evitar que se toquen o formen un bloque
cerrado.

## Intro

`BrandIntro` vive dentro del ancla visual definitiva del header. No es un splash
independiente: el mismo SVG aparece como wordmark y termina como monograma `VA`
sin cambiar de centro ni de ubicacion.

Duracion: `1500ms`.

Reduced motion: si el usuario prefiere movimiento reducido, se muestra
directamente el estado final `VA`.

## Header y Feedback

El header conserva la grilla de tres zonas y el centro geometrico. El centro
permanente ahora es el monograma `VA`.

El feedback visual se compone alrededor del monograma sin modificar el SVG
maestro:

- idle: solo VA;
- saving/capture/sync/error: icono pequeno secundario;
- aria-live permanece en `VisualFeedbackViewport`.

## Login

La pantalla de autenticacion usa el wordmark completo oficial. Se retiro la
marca previa construida con una caja `V` y texto HTML.

## PWA, Favicon y Tauri

`manifest.ts` apunta a los assets `public/brand`. El service worker precachea
los nuevos iconos principales. Tauri conserva su configuracion de iconos, pero
los archivos fueron regenerados desde el monograma oficial.

## Limitaciones

No se agrego libreria de animacion. La transicion usa CSS.

No se agrego splash nativo Tauri separado; la intro web cubre la experiencia de
arranque de forma consistente.

## Validacion

La suite cubre SVG, geometria VA, A sin travesano, intro, reduced motion, PWA y
Tauri. La validacion manual visual queda pendiente porque no se uso navegador
real ni Playwright.
