# Vinema Identity System

## Concepto

La identidad visual de Vinema expresa claridad, calma, precision, orden y
permanencia. No compite con el contenido: acompana la superficie de pensamiento
sin agregar friccion.

## Fuente Maestra

La geometria oficial vive en:

`src/brand/master/vinema-master.svg`

Los componentes, assets PWA y assets Tauri derivan de la misma decision formal:

- wordmark completo: `VINEMA`;
- monograma: `VA`;
- lockup: monograma + wordmark;
- icono: monograma VA en area cuadrada segura.

## Geometria

La marca usa una construccion tipografica sans serif geometrica: proporciones
elegantes y contemporaneas, peso ligero-regular, trazos uniformes, vertices
definidos, tracking amplio y mucho espacio negativo.

El resultado debe sentirse sobrio y premium, no ornamental. La identidad no debe
verse futurista, tecnologica, corporativa generica, condensada ni excesivamente
redondeada.

La V y la A comparten peso, altura, terminaciones rectas, inclinacion visual y
tension angular. Esa relacion define el caracter de la marca.

La A oficial no tiene travesano horizontal. Su construccion permanente conserva:

- dos diagonales limpias;
- vertice superior definido;
- apertura interior suficiente;
- peso uniforme;
- legibilidad clara como A;
- coherencia geometrica con la V.

La misma A sin travesano se reutiliza en:

- wordmark VINEMA;
- monograma VA;
- lockup;
- favicon;
- iconos PWA;
- iconos Tauri.

Nunca debe agregarse una variante con travesano en tamanos pequenos.
La A tampoco debe cerrarse hasta parecer un triangulo ni tocar la V en el
monograma.

## Reticula y Tokens

Los tokens viven en:

`src/brand/tokens/brand-tokens.ts`

Valores principales:

- wordmark: viewBox `0 0 330 80`;
- monograma: viewBox `0 0 82 80`;
- lockup: viewBox `0 0 436 80`;
- icono: viewBox `0 0 128 128`;
- trazo: `8`;
- separacion VA oficial: `10`;
- duracion intro: `1500ms`;
- easing: `cubic-bezier(0.22, 1, 0.36, 1)`.

## Usos

Header:

- usa el monograma `VA`;
- centrado respecto del viewport;
- no muestra el wordmark completo.

Login:

- usa el wordmark completo `VINEMA`;
- no repite VA adicional.

PWA y Tauri:

- usan el monograma `VA`;
- no usan el wordmark en iconos cuadrados.

Estados vacios:

- no repiten el logo salvo que aporte claridad.

## Animacion

La intro representa destilacion:

`VINEMA -> VA`

La transicion ocurre exactamente sobre la posicion definitiva del monograma en
el layout. No existe splash independiente, segundo logotipo ni reemplazo visual:
el elemento que inicia como wordmark es el mismo elemento que termina como
monograma.

La identidad nunca cambia de ubicacion durante la transicion. El centro
geometrico del viewport coincide con el centro geometrico de la identidad
durante todo el ciclo, y el contenido aparece alrededor de ese ancla.

Las letras internas pierden opacidad y V/A se desplazan a su posicion final. No
hay spinner, rebote, glow, blur intenso ni morphing.

Con `prefers-reduced-motion`, la intro se omite.

## Accesibilidad

Cuando la marca identifica la aplicacion, los componentes usan nombre accesible
`Vinema`. Cuando es decorativa, se usa `aria-hidden`.

La intro no roba foco y no bloquea funcionalidad.

## Prohibiciones

No deformar, estirar, inclinar, reconstruir con texto, cambiar tracking, cambiar
separacion VA, unir V y A, agregar sombra, contorno, glow, degradado, simbolos
tecnologicos, cerebros, circuitos, nodos ni isotipos abstractos.
