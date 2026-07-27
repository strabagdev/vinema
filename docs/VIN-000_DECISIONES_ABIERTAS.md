# VIN-000 - Decisiones abiertas

## Fuente y Captura como entidades distintas

Contexto: hoy `Node` contiene texto y metadata de captura.

Opciones:

- mantener `Node` como fuente textual;
- crear `Source` y `Capture`;
- crear `Source` y mapear captura como metadata.

Ventajas: separar conceptos puede ayudar con documentos futuros.

Riesgos: duplicar modelo antes de necesitarlo.

Recomendacion provisional: no separar todavia.

Momento sugerido: despues de busqueda textual local.

## El texto plano como Fuente

Opciones:

- si, cada nota textual es fuente;
- no, la fuente es una entidad futura y la nota es captura.

Recomendacion provisional: tratar `Node` como fuente textual inicial.

## Unidad minima de conocimiento

Opciones: `Node`, `Source`, `Note`, fragmento o concepto.

Recomendacion provisional: mantener `Node` como unidad tecnica y "fuente
textual" como lenguaje conceptual.

## Conceptos sin fuentes

Opciones:

- permitir conceptos vacios;
- crearlos solo desde fuentes;
- permitir manualmente pero mostrarlos como sin fuentes.

Recomendacion provisional: permitirlos solo si ayudan a navegar; no priorizar.

## Relaciones con tipo

Opciones:

- sin tipo inicialmente;
- tipos livianos opcionales;
- tipos obligatorios.

Recomendacion provisional: no agregar tipos hasta validar busqueda y uso real de
relaciones.

## Relaciones dirigidas

Opciones: no dirigidas, dirigidas, mixtas.

Recomendacion provisional: no decidir. La relacion fuente-concepto actual no
necesita direccion visible.

## Evidencia de una relacion

Opciones:

- relacion manual sin evidencia;
- relacion con fragmento de fuente;
- relacion generada/sugerida con justificacion.

Recomendacion provisional: para busqueda, explicar coincidencias textuales antes
de persistir evidencia relacional.

## Relaciones manuales en el MVP

Opciones:

- manuales solamente;
- sugeridas no persistidas;
- automaticas persistidas.

Recomendacion provisional: manuales y sugerencias no destructivas mas adelante.

## Que significa navegar

Opciones:

- abrir fuente desde resultados;
- saltar fuente -> concepto -> fuente;
- explorar grafo local;
- navegar por tiempo.

Recomendacion provisional: empezar por busqueda y saltos simples con fuente
visible.

## Medir esfuerzo cognitivo

Opciones:

- tiempo hasta encontrar;
- cantidad de acciones;
- intentos de busqueda;
- necesidad de recordar titulo/ubicacion;
- evaluacion subjetiva de confianza.

Recomendacion provisional: usar pruebas manuales y criterios cualitativos antes
de analitica.

## Comparar con carpetas y busqueda tradicional

Recomendacion provisional: definir escenarios concretos, por ejemplo "pan
humedo", y medir pasos necesarios para llegar a la fuente.

## Grafo visible

Opciones: no visible, contexto local, grafo global.

Recomendacion provisional: no implementar grafo visible en el MVP. Si aparece,
debe ser local y explicar contexto.

## Terminologia de usuario

Opciones: Nota/Contexto, Fuente/Concepto, lenguaje mixto.

Recomendacion provisional: no renombrar UI de golpe. Introducir "fuente" y
"concepto" primero en docs y busqueda.
