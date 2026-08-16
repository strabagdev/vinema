# VIN-014D - Derived Concept Relationships

## Filosofia

VIN-014D no interpreta semanticamente las relaciones. Una relacion derivada
significa solamente que dos conceptos aparecen juntos de manera significativa en
la memoria.

Regla:

> Vinema no inventa relaciones. Las deriva de recuerdos compartidos y siempre conserva la evidencia.

## Coocurrencia

Dos conceptos se relacionan cuando aparecen aceptados en una misma captura. La
relacion es bidireccional y no tiene verbo:

- no significa pertenencia;
- no significa causalidad;
- no significa dependencia;
- no significa ubicacion;
- no significa jerarquia.

El motor excluye capturas archivadas, conceptos archivados, relaciones de
asociacion no aceptadas y duplicados por label normalizado.

## Similitud semantica no es relacion derivada

Semantic Similarity puede encontrar conceptos cercanos en el espacio vectorial
local. Esa cercania no significa coocurrencia, dependencia, jerarquia ni
`RELATED_TO` persistido.

VIN-014D sigue derivando relaciones desde evidencia compartida o significado
explicito observado por Semantic Understanding. La similitud concepto-concepto
puede mostrarse o exponerse como evidencia de exploracion progresiva, pero no
crea edges ni modifica `NodeContextRelation`.

## Modelo Derivado

El nucleo vive en:

`src/features/exploration/concept-relationships.ts`

Expone funciones puras:

- `deriveConceptRelationships`;
- `calculateRelationshipStrength`;
- `selectRelationshipEvidence`;
- `deriveConceptGraphNeighborhood`.

No persiste edges y no modifica Prisma, IndexedDB, contratos sync, backup, reset
ni autenticacion.

## Fuerza

La fuerza inicial usa una puntuacion deterministica interna. El score no se
muestra al usuario.

Senales positivas:

- cantidad de recuerdos compartidos;
- actividad reciente;
- distribucion mensual;
- duracion entre primera y ultima aparicion;
- recuerdos con pocos conceptos, porque la coocurrencia es mas especifica.

Senales negativas:

- poca evidencia;
- recuerdos con demasiados conceptos;
- conceptos muy frecuentes en la memoria.

Umbrales iniciales:

- `WEAK`: score menor que `0.45`;
- `MEDIUM`: score desde `0.45` y menor que `0.72`;
- `STRONG`: score desde `0.72`.

Estos umbrales son deliberadamente conservadores: una sola captura tiende a ser
debil, varias apariciones en mas de un momento tienden a ser medias, y una
relacion sostenida con actividad reciente puede ser fuerte.

## Conceptos Genericos

Un concepto que aparece en una proporcion alta de capturas reduce su peso como
conexion. No se elimina, pero necesita mas evidencia para competir con
relaciones especificas.

La penalizacion solo se aplica cuando existe una memoria suficientemente amplia.
En datasets pequenos, aparecer en todo puede significar simplemente que todavia
hay poca evidencia.

## Evidencia

Cada relacion conserva hasta tres recuerdos compartidos:

1. el mas reciente;
2. el mas antiguo;
3. uno especifico o intermedio.

La evidencia muestra fragmentos reales, fecha e identidad emergente. No fabrica
una explicacion textual.

En la interfaz del perfil, esa evidencia no aparece en todas las filas por
defecto. La fila normal de una relacion es compacta: nombre del concepto y
cantidad de recuerdos compartidos. Los fragmentos, la fecha precisa y las
senales derivadas se muestran al pedir `Ver evidencia`.

## Temporalidad

La relacion deriva:

- primera aparicion compartida;
- ultima aparicion compartida;
- recuerdos compartidos recientes;
- distribucion por meses.

Esto permite observar persistencia sin afirmar causalidad.

## Perfiles

`/concepts/detail` usa las relaciones derivadas en un perfil de concepto. La
pantalla ya no separa el concepto en modos manuales; muestra una lectura
continua con identidad, conexiones principales, evidencia representativa y
senales progresivas cuando aportan valor.

La vista normal de relaciones muestra:

- concepto relacionado;
- cantidad de recuerdos compartidos.

La vista expandida de una relacion puede mostrar:

- fragmentos de evidencia con acceso al detalle;
- ultima actividad;
- una senal excepcional, por ejemplo relacion fuerte por evidencia.

No muestra scores, coeficientes ni badges constantes como `Reciente`, `Estable`,
`Frecuente`, `Recurrente` u `Ocasional` cuando no representan una excepcion.

## Exploracion Global

`/concepts/explore` permite explorar la red de conocimiento reconstruida desde
`Node`, `Context` y `NodeContextRelation`. Con `?focus=<conceptId>` ubica el
concepto enfocado al centro y despliega sus vecinos principales. Sin foco, elige
deterministicamente un concepto activo con conexiones suficientes para presentar
una vista global acotada.

El mapa visual no persiste posiciones ni introduce edicion manual. La lista
alternativa `Conexiones del foco` mantiene la navegacion accesible, permite abrir
perfiles y cambiar el foco sin depender del hover.

## Workspace Modal de Conceptos

Dentro de `ApplicationWorkspaceDialog`, Conceptos utiliza una unica superficie de
exploracion. La composicion vigente usa una franja superior compacta que integra
titulo `Conceptos`, busqueda, navegacion horizontal y cierre; el area inferior se
dedica al perfil del concepto seleccionado y al mapa conceptual interactivo.

En desktop, el area inferior mantiene una distribucion aproximada 40/60: perfil
a la izquierda, mapa a la derecha. En tablet la proporcion puede acercarse a
44/56 para conservar legibilidad. En movil se mantiene la franja superior y las
vistas internas `Perfil` / `Mapa`.

El usuario no navega paginas separadas para explorar conceptos: seleccionar un
concepto desde el carrusel, desde un nodo del mapa o desde una relacion actualiza
un unico `selectedConceptId` compartido.

El listado vertical permanente fue reemplazado por un carrusel horizontal de
nombres. La franja superior no muestra descripcion, contadores, estado ni
metadata por concepto; solo busqueda y nombres navegables.

El perfil vive en el area inferior izquierda para ayudar a comprender el
concepto seleccionado sin hacer desaparecer el mapa.

Principio visual:

> La interfaz solo muestra metadatos cuando aportan comprension, navegacion o
> capacidad de decision. Los estados normales permanecen implicitos; las
> excepciones se hacen visibles.

Reglas aplicadas en el workspace:

- el carrusel muestra solamente nombres;
- `Activo` y `Perfil vivo` permanecen implicitos;
- `Archivado` no se muestra; ya no es un estado visible de producto y los datos
  legacy se leen como memoria disponible;
- los contadores se resumen como `N recuerdos · N conexiones`;
- descripciones, aliases, relaciones y recuerdos solo aparecen si tienen
  contenido real;
- fechas como primera aparicion o ultima actividad no ocupan una franja
  permanente;
- recuerdos y relaciones navegan dentro del mismo workspace/modal y no cambian
  la URL.

## Mapa De Dos Niveles

El mapa conceptual es una superficie de navegacion 2D interactiva, no una
visualizacion estatica. Muestra relaciones directas y una vista previa acotada
de segundo nivel para anticipar caminos de navegacion:

```text
centro -> relaciones directas -> preview de relaciones secundarias
```

No se muestra un tercer nivel simultaneamente. El segundo nivel se prepara desde
las relaciones derivadas existentes usando `deriveConceptRelationships`; no crea
otro motor de grafo ni persiste posiciones.

Limites actuales:

- hasta 8 relaciones directas;
- hasta 4 previews secundarios por relacion directa;
- hasta 32 nodos visibles en total.

Si existen mas relaciones secundarias para una rama, se muestra una indicacion
discreta `+N`. Si un concepto secundario aparece por mas de una rama, se
representa como un unico nodo visual compartido cuando el `conceptId` coincide.

El espacio negativo no se rellena artificialmente cuando existen pocas
relaciones. Un concepto con dos vinculos debe seguir viendose simple.

Interaccion:

- rueda o gesto equivalente: zoom centrado en la posicion del cursor;
- drag sobre fondo: pan interno del mapa;
- drag sobre nodo: posicion manual temporal durante la sesion del workspace;
- hover sobre nodo: destaca nodo y relaciones inmediatas;
- click o teclado sobre nodo: selecciona el concepto y sincroniza listado,
  perfil y mapa;
- doble click sobre nodo: usa el mismo `selectedConceptId` para convertirlo en
  centro logico sin cambiar URL;
- `centrar`: recupera escala y pan utiles alrededor del concepto seleccionado.

La distribucion usa un force-directed layout controlado sobre el SVG propio de
Vinema: repulsion entre nodos, distancia de enlace por nivel, atraccion moderada
al centro y colision simple. La simulacion es deterministica y se estabiliza al
calcular posiciones; no deja nodos vibrando ni animacion continua.

No se incorporo una dependencia externa. La implementacion actual usa SVG propio
en React; se eligio evolucionarla antes que introducir D3-force porque las
interacciones requeridas caben en el componente existente sin cambiar la
identidad visual ni el modelo de datos.

La accion `Explorar conexiones` fue eliminada del perfil: el mapa permanente es
el explorador. Seleccionar una relacion en el perfil actualiza el mismo
`selectedConceptId` compartido.

El workspace no usa un header separado del dialogo para Conceptos. La franja
superior propia mantiene titulo, busqueda, carrusel y accion de cierre en una
misma fila, sin subtitulo visible ni divisor redundante.

Cuando la navegacion modal profundiza desde Conceptos hacia una relacion o hacia
un recuerdo, el stack de `CaptureSurface` conserva entradas con forma logica:

```text
WorkspaceHistoryEntry {
  view
  params
  state
}
```

Los cambios internos del workspace, como busqueda, seleccion desde carrusel,
foco del mapa, scroll del perfil o transform del mapa, actualizan el snapshot de
la entrada activa. Abrir una relacion o un recuerdo hace `PUSH`; cambiar
busqueda o foco dentro de la misma superficie hace `REPLACE` sobre el estado.
`BACK` restaura el snapshot anterior sin cambiar URL ni cerrar el modal.

Las rutas externas `/concepts`, `/concepts/detail` y `/concepts/explore` se
mantienen para compatibilidad, pero la experiencia modal conserva el canvas como
pantalla base y evita cambios de URL.

## Base de Conocimiento

`/concepts` incorpora una senal minima de conexiones derivadas. La lista sigue
siendo navegacion de conocimiento, no dashboard.

## Modelo de Grafo

`deriveConceptGraphNeighborhood` prepara:

- nodo central;
- nodos relacionados;
- edges con fuerza y recuerdos compartidos.

Las posiciones visuales de `/concepts/explore` son derivadas, deterministicas y
temporales. No se guardan, no modifican el dominio y no introducen librerias de
grafos.

## Sync, Backup, Restore y Reset

Las relaciones derivadas se reconstruyen desde:

- `Node`;
- `Context`;
- `NodeContextRelation`.

La invalidacion existente recarga capturas, conceptos y relaciones despues de
sync. Backup no exporta edges, restore los reconstruye y reset deja la red vacia.

## Performance

Las pruebas cubren:

- 100 y 1.000 capturas mediante escenarios del perfil;
- 10.000 relaciones;
- 1.000 conceptos simulados.

No se introduce cache persistente. Si la memoria crece mucho mas, las proximas
fases podran agregar indices derivados o paginacion sin cambiar el contrato de
dominio.

## Limitaciones

VIN-014D no implementa:

- relaciones con verbo;
- relaciones persistidas concepto-concepto;
- IA;
- conversion automatica de embeddings en relaciones;
- librerias de grafos;
- coordenadas visuales;
- taxonomias.

## Siguiente Fase

Una fase posterior podra usar esta evidencia para construir una vista de mapa o
explorar relaciones semanticas mas explicitas. La condicion permanente es que la
evidencia siga visible y que Vinema no invente lo que todavia no sabe.
