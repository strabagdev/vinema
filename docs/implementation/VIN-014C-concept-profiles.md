# VIN-014C - Concept Profiles

## Filosofia

VIN-014C no clasifica conceptos. Vinema primero observa como un concepto aparece
en la memoria y solo despues, en fases futuras, podra intentar comprender que es.

Regla:

> Vinema primero observa un concepto. Solo despues intenta comprender que es.

## Perfil vs tipo

Un tipo diria algo como `Tom Ford -> Marca`.

Un perfil responde preguntas mas concretas y verificables:

- donde aparecio este concepto;
- con que otros conceptos aparece;
- cuando comenzo;
- cuando fue la ultima vez;
- que recuerdos lo sostienen;
- como ha evolucionado.

Por eso el perfil no introduce taxonomia, categorias ni relaciones persistidas
concepto-concepto.

## Datos derivados

El perfil se deriva desde:

- `Context`;
- `Node`;
- `NodeContextRelation`.

No se persiste completo y no modifica Prisma, IndexedDB, sync contracts, backup,
restore ni reset.

## Modelo

El nucleo vive en:

`src/features/exploration/concept-profile.ts`

Deriva:

- identidad canonica;
- aliases confirmados;
- cantidad de recuerdos;
- primera aparicion;
- ultima actividad;
- conceptos relacionados por coocurrencia;
- recuerdos representativos;
- actividad de 7 y 30 dias;
- buckets mensuales.

## Identidad y aliases

El perfil muestra el label canonico y los aliases confirmados. No muestra:

- IDs;
- `normalizedAliases`;
- scores;
- metadata tecnica.

## Recuerdos representativos

La seleccion inicial es deterministica:

1. recuerdo mas reciente;
2. recuerdo mas antiguo;
3. recuerdos con mas conceptos compartidos;
4. recuerdos distribuidos temporalmente;
5. deduplicacion simple por fragmento.

El limite inicial es cinco recuerdos. No se fabrican titulos.

## Conexiones

Los conceptos relacionados se derivan desde capturas compartidas. Dos conceptos
estan relacionados cuando aparecen aceptados en una misma captura.

El perfil excluye:

- el concepto actual;
- conceptos archivados;
- capturas archivadas;
- aliases como conceptos independientes.

Si otro `Context` existente tiene el mismo nombre normalizado que el label
canonico o que un alias confirmado del concepto actual, el perfil no lo muestra
como conexion. La identidad canonica tiene prioridad sobre la lista visual de
relaciones.

## Actividad

La actividad temporal es un resumen ligero:

- total;
- ultimos 7 dias;
- ultimos 30 dias;
- buckets mensuales.

No es un dashboard y no introduce graficos complejos.

Cuando el perfil tiene una sola captura, la interfaz muestra la evidencia y no
comunica evolucion temporal innecesaria. La interfaz no comunica ausencia cuando
basta con no mostrarla.

## Navegacion

`/concepts/detail` usa el perfil como superficie principal de evidencia. Los
conceptos relacionados abren su propio perfil y conservan la navegacion local
entre conceptos.

## Sync

Como el perfil es derivado, se actualiza con la infraestructura existente de
invalidacion cuando cambian capturas, conceptos o relaciones. No requiere polling
React ni F5.

Backup, restore y reset no exportan ni importan perfiles calculados. Al restaurar
`Context`, `Node` y `NodeContextRelation`, el perfil vuelve a construirse desde
esa evidencia. Al vaciar la memoria del workspace, el perfil queda vacio porque
ya no existen recuerdos ni relaciones que lo sostengan.

## Performance

Las funciones puras separan:

- `deriveConceptProfile`;
- `deriveRepresentativeMemories`;
- `deriveConceptActivity`;
- `deriveRelatedConcepts`.

La vista usa `useMemo` para evitar recalculo innecesario durante renders. No se
introduce cache persistente.

Los tests cubren 1.000 capturas y un escenario de 10.000 relaciones simuladas
como linea base local. Escenarios mayores podran requerir indices derivados o
paginacion en fases futuras.

## Limitaciones

VIN-014C no implementa:

- tipos de concepto;
- relaciones explicitas concepto-concepto;
- IA;
- embeddings;
- inferencia semantica universal;
- persistencia de perfiles;
- cache persistente.

## Preparacion para VIN-014D

Los perfiles dejan visible la evidencia necesaria para una fase posterior de
relaciones conceptuales. VIN-014D podra apoyarse en coocurrencia, actividad y
recuerdos compartidos sin inventar estructura antes de tiempo.
