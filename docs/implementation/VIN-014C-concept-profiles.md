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
- que recuerdos lo sostienen;
- como ha evolucionado.

La interfaz normal no convierte esas respuestas en un panel de metricas. Fechas
como primera aparicion o ultima actividad existen en el modelo derivado, pero se
reservan para detalle progresivo o para senales excepcionales.

Por eso el perfil no introduce taxonomia, categorias ni relaciones persistidas
concepto-concepto.

## Datos derivados

El perfil se deriva desde:

- `Context`;
- `Node`;
- `NodeContextRelation`.
- `MemoryEvidenceModel` como evidencia compartida para motores derivados.

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

El limite derivado inicial sigue siendo cinco recuerdos representativos para el
modelo puro. La vista de detalle no usa esa seleccion como corte visual de la
evidencia principal: la pestaña `Recuerdos` muestra todos los recuerdos asociados
disponibles, ordenados por fecha descendente. No se fabrican titulos.

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

## Representacion vectorial local

Semantic Similarity puede construir una representacion textual deterministica de
un concepto desde el mismo modelo de evidencia:

- `Nombre: {canonicalName}`;
- `Aliases: {aliases}`;
- `Evidencia:` con recuerdos representativos limitados.

No se generan resumenes con IA y no se incluyen todas las capturas
indiscriminadamente. La version inicial es
`CONCEPT_REPRESENTATION_VERSION = 1`; cambios en nombre canonico, aliases,
evidencia representativa o version invalidan el embedding conceptual local.

La representacion vectorial no forma parte del perfil persistido. Puede estar
disponible como evidencia progresiva para exploracion, pero no crea conexiones
ni modifica recuerdos.

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

El detalle de Concepto se presenta como una ficha editorial de una sola columna.
El encabezado permanece estable y muestra nombre, cantidad de recuerdos,
cantidad de conexiones, descripcion cuando existe y aliases confirmados cuando
aportan identidad. Debajo del encabezado, el contenido se organiza en pestañas
accesibles sin crear rutas adicionales:

- Recuerdos;
- Relaciones;
- Evolucion;
- Patrones.

`Recuerdos` es siempre la pestaña inicial al abrir un concepto. Muestra todos los
recuerdos asociados ordenados por fecha descendente, con extracto, fecha discreta
y acceso al detalle de captura. `Relaciones` muestra conceptos relacionados por
evidencia compartida y permite abrir cada concepto relacionado. `Evolucion`
muestra solo señales temporales existentes del motor derivado; si no hay
informacion suficiente, presenta un estado vacio honesto. `Patrones` muestra
observaciones del sistema respaldadas por evidencia cuando existen y usa el
nombre visible `Patrones`.

En el workspace modal de Conceptos, el perfil no se presenta como una tercera
region horizontal ni compite con la busqueda. La navegacion de conceptos vive en
una franja superior compacta que integra `Conceptos`, buscador, carrusel
horizontal de nombres y cierre al extremo derecho. No hay header separado,
subtitulo visible, divisor ni espacio vertical redundante. El perfil ocupa el
area inferior izquierda, mientras el mapa permanece visible a la derecha en una
distribucion aproximada 40/60. La lectura del perfil se vuelve mas selectiva:

- no muestra el titulo `Perfil`;
- no muestra `Perfil vivo` ni `Activo`, porque son condiciones normales;
- no muestra textos normales de confirmacion como `Concepto emergente
  confirmado desde la captura actual`;
- no muestra `Archivado`: el archivado dejo de ser un estado visible de
  producto y los datos legacy se tratan como memoria disponible;
- resume la evidencia como `N recuerdos · N conexiones`;
- renderiza descripcion y aliases solo cuando existen;
- distribuye recuerdos, relaciones, evolucion y patrones en pestañas debajo del
  encabezado estable;
- omite fechas derivadas si no aportan decision o navegacion inmediata;
- muestra estados vacios dentro de cada pestaña cuando los datos derivados no
  respaldan contenido.

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
- IA generativa;
- inferencia semantica universal;
- persistencia de perfiles;
- cache persistente.

## Preparacion para VIN-014D

Los perfiles dejan visible la evidencia necesaria para una fase posterior de
relaciones conceptuales. VIN-014D podra apoyarse en coocurrencia, actividad y
recuerdos compartidos sin inventar estructura antes de tiempo.
