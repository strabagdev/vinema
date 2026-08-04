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

## Temporalidad

La relacion deriva:

- primera aparicion compartida;
- ultima aparicion compartida;
- recuerdos compartidos recientes;
- distribucion por meses.

Esto permite observar persistencia sin afirmar causalidad.

## Perfiles

`/concepts/detail` usa las relaciones derivadas en un perfil vivo de concepto.
La pantalla ya no separa el concepto en modos manuales; muestra una lectura
continua con identidad, actividad, conexiones principales, evolucion,
significados, patrones y recuerdos.

La vista muestra:

- concepto relacionado;
- fuerza visual y textual;
- cantidad de recuerdos compartidos;
- ultima actividad;
- fragmento de evidencia con acceso al detalle.

No muestra scores ni coeficientes.

## Exploracion Global

`/concepts/explore` permite explorar la red de conocimiento reconstruida desde
`Node`, `Context` y `NodeContextRelation`. Con `?focus=<conceptId>` ubica el
concepto enfocado al centro y despliega sus vecinos principales. Sin foco, elige
deterministicamente un concepto activo con conexiones suficientes para presentar
una vista global acotada.

El mapa visual no persiste posiciones ni introduce edicion manual. La lista
alternativa `Conexiones del foco` mantiene la navegacion accesible, permite abrir
perfiles y cambiar el foco sin depender del hover.

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
- embeddings;
- librerias de grafos;
- coordenadas visuales;
- taxonomias.

## Siguiente Fase

Una fase posterior podra usar esta evidencia para construir una vista de mapa o
explorar relaciones semanticas mas explicitas. La condicion permanente es que la
evidencia siga visible y que Vinema no invente lo que todavia no sabe.
