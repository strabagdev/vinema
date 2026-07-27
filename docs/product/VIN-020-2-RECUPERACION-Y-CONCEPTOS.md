# VIN-020.2 - Recuperacion y conceptos en tiempo real

## Problema anterior

La superficie de escritura mezclaba dos intenciones distintas. Las capturas
similares aparecian como sugerencias seleccionables y esa seleccion podia crear
relaciones directas entre capturas al guardar.

Eso confundia recordar con organizar. Vinema mostraba memoria previa, pero la UI
la trataba como una accion de clasificacion.

## Separacion final

Mientras el usuario escribe, Vinema hace dos cosas separadas:

- Recuperacion: responde si ya existe una captura parecida.
- Conceptos: propone agrupaciones semanticas existentes para la nueva captura.

La recuperacion no modifica datos. Los conceptos seleccionados si se persisten
como relaciones conceptuales.

## Recuperacion

La seccion `Esto me recordó a…` muestra capturas existentes en filas compactas
de una sola linea. Cada fila abre el detalle de la captura y conserva el
borrador actual.

Las filas no tienen checkbox, estado seleccionado ni accion de relacion. Son
navegacion hacia memoria previa.

## Conceptos

Los conceptos se muestran como chips horizontales. Se alimentan de los
`Context` existentes y de capturas ya relacionadas con esos contextos.

VIN-020.2 no crea una entidad nueva ni convierte conceptos en etiquetas libres.
El usuario solamente confirma o rechaza propuestas existentes.

## Flujo mientras se escribe

Con el editor vacio se muestran solo el editor, capturas recientes e interfaz
minima.

Con contenido se muestran, si existen:

1. Editor.
2. `Esto me recordó a…`.
3. `Conceptos`.
4. `Capturar`.

No se muestran bloques vacios ni mensajes negativos cuando no hay resultados.

## Altura y ancho

La recuperacion muestra inicialmente tres capturas y permite expandir de forma
compacta. Cada fila usa el ancho disponible y deja el truncamiento visual al CSS.

Los conceptos muestran inicialmente cinco chips y pueden expandirse sin
convertirse en una lista vertical grande.

## Borrador

El borrador temporal conserva:

- contenido;
- conceptos seleccionados.

Antes de abrir una captura recuperada se guarda el borrador. Al volver a Inicio,
el editor recupera el texto y las selecciones conceptuales.

## Motor reutilizado

La recuperacion sigue usando el motor local VIN-019 para capturas similares. La
sugerencia de conceptos reutiliza normalizacion, tokenizacion, contextos,
relaciones y capturas existentes.

No se agrego un motor paralelo ni se persisten scores temporales.

## Relaciones

Al capturar se persisten solo las relaciones con conceptos seleccionados.

Las capturas recuperadas no se guardan como relaciones directas. Las relaciones
`CAPTURE_ASSOCIATION` historicas se preservan, pero la superficie principal ya
no crea nuevas relaciones de ese tipo.

## Detalle

El detalle no muestra `Contextos` ni `Sin contextos relacionados`.

Si existen conceptos asociados, se muestran como chips compactos. Si no existen,
la seccion no se renderiza.

## Limpieza visual

La barra lateral se redujo visualmente para funcionar como navegacion secundaria.
La barra superior se volvio mas baja y discreta. El indicador `Solo local` se
mantiene como estado, no como accion principal.

En Inicio no se muestra un boton grande `Escribir`, porque el editor ya es la
accion principal.

## Compatibilidad historica

No se destruye IndexedDB, no se eliminan capturas y no se borran relaciones
existentes. Las relaciones directas antiguas siguen estando disponibles para el
dominio y repositorios, aunque ya no se crean desde la recuperacion.

## Pruebas

Se cubrio:

- recuperacion como links de una linea;
- ausencia de checkbox en recuperacion;
- conservacion de borrador al abrir una captura recuperada;
- chips de conceptos con `aria-pressed`;
- persistencia de conceptos seleccionados;
- no persistencia de capturas recuperadas;
- detalle sin bloques vacios de conceptos;
- ranking basico de conceptos existentes.

## Validacion manual

No se ejecuto Playwright por instruccion explicita del usuario. La validacion
manual en navegador queda pendiente si el usuario la solicita o la realiza en su
entorno.

## Limitaciones

`Context` sigue siendo la estructura tecnica reutilizada para representar
conceptos existentes. El renombrado conceptual profundo queda fuera de este
paquete.

## Estado posterior a VIN-020.3

La recuperacion fue auditada y corregida para consultas cortas especificas. El
hook evita reinicios por dependencias inestables, cierra siempre el estado de
carga y permite recuperar por un token local como `mitcom`.

## Estado posterior a VIN-021

La recuperacion pasa a ser evidencia para conceptos emergentes. La salida visual
sigue separada, pero ambas nacen de una evaluacion semantica unica.
