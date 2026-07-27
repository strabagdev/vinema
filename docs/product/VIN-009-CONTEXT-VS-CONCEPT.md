# VIN-009 - Context vs Concept

## 1. Contexto

Vinema ya cuenta con una constitucion de producto, Punto Cero, auditoria del
repositorio, linea base de recuperacion local y revision de aceptacion de esa
recuperacion.

La direccion vigente define Vinema como un motor de acceso al conocimiento, no
como un gestor de notas. El producto debe permitir llegar a informacion
capturada desde pistas incompletas, conceptos, relaciones, contexto y tiempo,
preservando siempre la fuente original.

El modelo actual utiliza principalmente:

- `Node`;
- `Context`;
- `NodeContextRelation`.

Durante la auditoria inicial se decidio no renombrar `Context` hacia `Concept`
sin comprender primero el dominio. VIN-009 existe para responder esa pregunta
sin implementar cambios, migraciones ni refactorizaciones.

## 2. Problema

La palabra `Context` cumple hoy una funcion util, pero puede ocultar una tension
conceptual.

Por un lado, Vinema necesita puntos de entrada amplios: personas, proyectos,
proveedores, problemas, normas, decisiones, aprendizajes, lugares y temas. Esa
idea se parece al concepto de "Concepto" en la constitucion.

Por otro lado, el modelo implementado de `Context` esta limitado a Areas,
Proyectos y Personas. Es una entidad manual, nombrada por el usuario, vinculada
a notas y usada para navegar o recuperar fuentes.

La pregunta principal es:

```text
Context representa realmente un Concepto?
```

La respuesta corta es: no completamente.

`Context` representa hoy un punto de entrada contextual manual. Algunos
`Context` son conceptos, pero `Context` no alcanza para representar todo lo que
Vinema llama Concepto.

## 3. Estado actual

### Node

`Node` es la unidad persistida que contiene texto capturado. Puede ser `IDEA` o
`NOTE`, puede estar en Inbox u organizada, puede archivarse y conserva
metadatos de version, dispositivo, creacion, actualizacion y borrado logico.

En el producto, `Node` se comporta como la fuente textual inicial de Vinema. No
es todavia una abstraccion general de cualquier fuente posible, porque el MVP se
limita a texto plano escrito por el usuario.

### Context

`Context` tiene identidad propia, nombre, descripcion, tipo, workspace y estado
de archivo. Puede existir aunque no tenga fuentes relacionadas. Actualmente sus
tipos son:

- `AREA`;
- `PROJECT`;
- `PERSON`.

En la interfaz aparece como Areas, Proyectos y Personas. En la recuperacion
local, sus nombres pueden producir coincidencias y servir como razon de
aparicion de una fuente.

### NodeContextRelation

`NodeContextRelation` representa una vinculacion muchos-a-muchos entre una
fuente textual (`Node`) y un punto de entrada contextual (`Context`). No expresa
todavia tipo de relacion, direccion, evidencia, peso, origen ni motivo.

Su valor actual esta en evitar pertenencia unica. Una nota puede relacionarse
con varios contextos y un contexto puede reunir varias notas sin duplicarlas.

### Problemas conceptuales

- `Node` mezcla captura, fuente textual y nota editable.
- `Context` tiene nombre demasiado generico para su rol actual y demasiado
  estrecho para la vision de Concepto.
- `ContextType` limita la expresividad a tres casos iniciales.
- `NodeContextRelation` dice que existe una relacion, pero no que significa.
- La UI puede sugerir gestion manual de categorias si Areas, Proyectos y
  Personas ganan demasiado peso.
- El lenguaje "contexto" puede confundirse con circunstancia, ubicacion, filtro
  o agrupador.

### Partes reutilizables

- Identidad estable de fuentes.
- Persistencia local y relaciones muchos-a-muchos.
- Separacion entre fuente y punto de entrada.
- Pagina de detalle de contexto con fuentes relacionadas.
- Busqueda local que considera titulo, contenido y contextos.
- Reglas que impiden asociar notas a contextos archivados.

### Partes que deberian evolucionar

- Vocabulario de dominio.
- Expresividad de relaciones.
- Alcance de los puntos de entrada.
- Capacidad de representar temas, problemas, decisiones, normas y aprendizajes.
- Distincion entre fuente capturada y conocimiento derivado.

## 4. Definicion de cada entidad

### Fuente

Una Fuente es el origen preservable de una informacion. Es aquello a lo que el
usuario debe poder volver para verificar, releer o reinterpretar.

En el MVP, una fuente suele ser una nota textual. A futuro podria ser un
documento, correo, imagen, audio, enlace o fragmento importado. La fuente no es
la conclusion: es la evidencia.

### Captura

Una Captura es el acto o instancia mediante la cual una fuente entra en Vinema.
Puede ser escribir una idea, crear una nota, registrar una reunion o importar un
documento.

Hoy no existe como entidad separada. Esta absorbida por `Node` y por sus fechas
de creacion/modificacion.

### Contenido

Contenido es el material interno de una fuente: texto, datos o fragmentos que
pueden ser leidos, buscados y relacionados.

El contenido no es automaticamente conocimiento. Se vuelve util cuando puede ser
accedido desde una pista, un concepto, una relacion o un momento.

### Context

Un Context es, en el modelo actual, un punto de entrada contextual nombrado por
el usuario y limitado a Area, Proyecto o Persona.

No es carpeta. No es ubicacion fisica. No posee la fuente. Esta relacionado con
ella.

Un Context responde mejor a la pregunta:

```text
Desde que ambito, proyecto o persona quiero volver a esta fuente?
```

### Concepto

Un Concepto es una unidad de significado que puede funcionar como puerta de
acceso a fuentes y relaciones.

Puede representar una persona, empresa, proveedor, proyecto, lugar, tema,
problema, norma, decision, aprendizaje, accion o idea recurrente.

Un Concepto no es necesariamente manual ni necesariamente visible como categoria
principal. Puede nacer de escritura, seleccion, confirmacion del usuario,
importacion o deteccion futura. Lo esencial es que tenga identidad semantica y
permita recuperar conocimiento.

### Relacion

Una Relacion es un vinculo significativo entre dos unidades del sistema:

- fuente y concepto;
- fuente y fuente;
- concepto y concepto;
- concepto y tiempo;
- fuente y evento futuro.

La relacion actual (`NodeContextRelation`) solo expresa asociacion. Todavia no
expresa significado.

### Memoria

Memoria es la red viva de fuentes, conceptos, relaciones y tiempo que permite
volver a informacion capturada con menos esfuerzo cognitivo.

No es una coleccion de notas ni un arbol. Es una estructura de acceso.

### Acceder

Acceder significa llegar a la fuente correcta desde una pista disponible para el
usuario en ese momento. La pista puede ser parcial, ambigua o contextual.

Acceder no equivale a buscar por texto exacto. La busqueda textual es una puerta
inicial, no el modelo completo.

### Navegar

Navegar significa moverse entre fuentes, conceptos, relaciones y tiempo sin
depender de una ubicacion unica.

Navegar en Vinema no deberia sentirse como recorrer carpetas. Deberia sentirse
como seguir asociaciones utiles hasta encontrar la fuente adecuada.

## 5. Comparacion Context vs Concept

| Dimension | Mantener Context como entidad principal | Introducir Concept como entidad de dominio |
| --- | --- | --- |
| Claridad conceptual | Clara para Area/Proyecto/Persona, confusa para problema, norma o aprendizaje | Mas alineada con la constitucion y con memoria navegable |
| Facilidad para el usuario | Familiar si se presenta como ambito o persona, riesgosa si parece taxonomia | Potencialmente mas natural si se expresa como "cosas que recuerdas" |
| Escalabilidad | Limitada por `ContextType` y por gestion manual | Mayor capacidad de representar conocimiento diverso |
| Coherencia con constitucion | Parcial: evita carpetas, pero no cubre todos los conceptos | Alta, si no se convierte en etiquetas manuales |
| Complejidad tecnica | Baja: ya existe | Media: requiere plan de migracion o capa de transicion |
| Migracion | Ninguna si se mantiene | Requiere decision sobre stores, nombres, compatibilidad y UI |
| Mantenimiento futuro | Simple en corto plazo, deuda semantica en mediano plazo | Mas claro en mediano plazo, mas costoso al inicio |
| Representacion de conocimiento | Buena para ambitos personales iniciales | Mejor para entidades, temas, problemas, normas, decisiones y aprendizajes |

## 6. Casos reales

### Proveedor

Como `Context`: podria forzarse como Persona o Proyecto, pero no encaja bien. Si
se agregara tipo Proveedor, `ContextType` empezaria a crecer como taxonomia.

Como `Concept`: representa una entidad externa con identidad propia, relacionada
con proyectos, reuniones, decisiones y problemas.

### Mitcom

Como `Context`: podria crearse como Proyecto o Persona segun el usuario, lo que
genera ambiguedad.

Como `Concept`: Mitcom es un concepto-entidad. Puede relacionarse con Proyecto
Andes Norte, reuniones, proveedores, decisiones y personas.

### Proyecto Andes Norte

Como `Context`: encaja bien en `PROJECT`.

Como `Concept`: tambien encaja. La diferencia es que no queda encerrado como una
categoria especial; puede ser una unidad de significado relacionada con personas,
proveedores, normas y decisiones.

### Persona

Como `Context`: encaja bien en `PERSON`.

Como `Concept`: tambien encaja. Concept permitiria relacionar persona con
empresa, proyecto, reunion, decision o tema sin tratarla como silo.

### Reunion

Como `Context`: no encaja bien. Una reunion suele ser fuente o evento, no
agrupador estable.

Como `Concept`: podria existir solo si la reunion se vuelve punto de acceso
recurrente, pero en la mayoria de casos debe ser fuente/captura con fecha.

### Idea

Como `Context`: no encaja. Hoy `IDEA` vive como `Node`.

Como `Concept`: una idea recurrente podria convertirse en concepto si conecta
varias fuentes. Una idea aislada deberia seguir siendo captura/fuente.

### Problema

Como `Context`: no encaja en Area/Proyecto/Persona. Agregar `PROBLEM` como tipo
de contexto seria tentador, pero abre expansion taxonomica.

Como `Concept`: encaja naturalmente como punto de entrada a fuentes, decisiones,
acciones y aprendizajes.

### Norma

Como `Context`: no encaja salvo que se use como Proyecto o Area de forma
artificial.

Como `Concept`: puede ser entidad de conocimiento vinculada a fuentes,
aplicaciones, decisiones y cambios.

### Aprendizaje

Como `Context`: no encaja como agrupador estable salvo forzarlo como Area.

Como `Concept`: puede ser conocimiento derivado de una o varias fuentes. Antes
de persistirlo, Vinema debe definir si un aprendizaje es fuente, concepto o
resultado sintetizado.

### Accion

Como `Context`: no encaja. Accion se acerca mas a tarea o evento.

Como `Concept`: podria relacionarse con una fuente o decision, pero no deberia
convertir Vinema en gestor de tareas.

### Decision

Como `Context`: no encaja bien. Una decision suele requerir fuente, fecha,
motivo y consecuencias.

Como `Concept`: podria ser unidad de significado relacionada con fuentes,
personas, proyectos y problemas. Tambien podria requerir un tipo propio futuro
si la experiencia lo justifica.

## 7. Ventajas

### Ventajas de mantener Context

- Ya existe en dominio, infraestructura, UI y pruebas.
- No requiere migracion ni cambio de datos.
- Satisface casos iniciales importantes: Area, Proyecto y Persona.
- Evita introducir abstracciones prematuras.
- Permite seguir validando recuperacion local con relaciones existentes.

### Ventajas de introducir Concept

- Alinea el lenguaje tecnico con la constitucion.
- Representa mejor la variedad real del conocimiento.
- Reduce la tentacion de ampliar `ContextType` indefinidamente.
- Permite distinguir punto de entrada semantico de contexto operacional.
- Prepara relaciones concepto-concepto sin forzar estructuras de carpetas.
- Hace mas clara la diferencia entre fuente y conocimiento accesible.

## 8. Desventajas

### Desventajas de mantener Context

- El nombre puede inducir a pensar en contenedores o ambitos manuales.
- Sus tipos actuales no cubren temas, problemas, normas, decisiones ni
  aprendizajes.
- Puede llevar a una taxonomia creciente si se agregan tipos cada vez que
  aparece un caso nuevo.
- Puede desplazar el foco desde recuperacion hacia gestion de contextos.

### Desventajas de introducir Concept

- Puede ser demasiado abstracto para el usuario si se expone de forma directa.
- Requiere disenar migracion o capa de compatibilidad.
- Puede duplicar `Context` si se agrega sin retirar o reinterpretar lo anterior.
- Puede convertirse en etiquetas tradicionales si no se define bien la relacion
  con fuentes y evidencia.
- Puede abrir discusiones de grafo antes de validar mas recuperacion.

## 9. Riesgos

- Renombrar prematuramente `Context` a `Concept` y creer que el dominio quedo
  resuelto.
- Mantener `Context` demasiado tiempo y consolidar una taxonomia insuficiente.
- Agregar tipos a `ContextType` como solucion a cada caso nuevo.
- Confundir conceptos con etiquetas manuales.
- Confundir fuentes con conclusiones o conocimiento derivado.
- Crear relaciones concepto-concepto sin significado, evidencia ni utilidad de
  acceso.
- Exponer al usuario una abstraccion demasiado teorica.
- Convertir Vinema en gestor de tareas si Accion y Decision se modelan sin
  cuidado.

## 10. Recomendacion

No renombrar `Context` todavia.

La recomendacion es mantener `Context` como entidad implementada de transicion y
definir `Concept` como entidad de dominio futura, mas amplia que `Context`.

En terminos de producto:

```text
Todo Context actual puede interpretarse como un caso inicial de Concept.
No todo Concept deberia ser un Context.
```

`Context` deberia entenderse temporalmente como "concepto contextual manual"
para Areas, Proyectos y Personas. `Concept` deberia reservarse para la unidad
semantica general que puede representar proveedores, problemas, normas,
decisiones, aprendizajes, temas y otras puertas de acceso.

La siguiente evolucion no deberia ser una migracion directa. Antes hace falta
definir:

- que hace que un Concept exista;
- como se crea sin aumentar carga cognitiva;
- que diferencia un Concept de una etiqueta;
- que significa relacionar conceptos;
- que evidencia respalda una relacion;
- como se muestra al usuario sin obligarlo a administrar una taxonomia.

## 11. Preguntas abiertas

### Puede existir un Concept sin ninguna Fuente?

Si, pero con cautela. Puede representar una idea, persona o tema que el usuario
quiere recordar antes de tener fuentes asociadas. Sin embargo, Vinema debe evitar
llenarse de conceptos vacios que no mejoren acceso.

### Puede existir un Context sin ninguna Fuente?

Si. Hoy puede existir por diseno. Un proyecto, area o persona puede crearse antes
de relacionar notas.

### Un Concept puede relacionarse con otro Concept?

Si, probablemente. Esta es una capacidad importante para memoria navegable. Pero
no debe implementarse hasta definir tipo, direccion, evidencia y uso real de esa
relacion.

### Context tiene identidad propia?

Si. En el modelo actual tiene id, nombre, descripcion, tipo, estado y pagina de
detalle. No es solo texto incrustado en una nota.

### Context es solamente un agrupador?

No deberia serlo. En la practica actual puede parecer agrupador, pero su mejor
interpretacion es punto de entrada contextual hacia fuentes relacionadas.

### Todo Context es un Concept?

Conceptualmente, si: Area, Proyecto y Persona pueden ser conceptos. En el modelo
actual, son casos iniciales y limitados de concepto.

### Todo Concept es un Context?

No. Problemas, normas, aprendizajes, decisiones, proveedores, lugares o temas no
deberian forzarse necesariamente dentro de `ContextType`.

### Una Fuente pertenece a un Context?

No. Una fuente se relaciona con uno o mas contextos/conceptos. No pertenece
fisicamente a ninguno.

### El usuario piensa en Context o en Conceptos?

El usuario probablemente piensa en cosas concretas: Mitcom, Juan Perez, Proyecto
Andes Norte, el problema del contrato, la norma nueva, la decision tomada. No
piensa naturalmente en "Context" como categoria tecnica.

La UI futura deberia hablar menos de la entidad tecnica y mas de puntos de
entrada recordables.

## 12. Decision propuesta

Decision propuesta para despues de VIN-009:

1. Mantener `Context` sin cambios inmediatos.
2. No agregar nuevos `ContextType` en el corto plazo.
3. Documentar `Context` como punto de entrada contextual manual y transitorio.
4. Disenar `Concept` como entidad futura solamente cuando exista un flujo claro
   de creacion, recuperacion y relacion que reduzca esfuerzo cognitivo.
5. Tratar Areas, Proyectos y Personas como casos iniciales de concepto, no como
   carpetas ni contenedores.
6. Evitar migraciones hasta que se defina la relacion entre Fuente, Concepto y
   Relacion con evidencia suficiente.

La conclusion de VIN-009 no es "renombrar Context a Concept". La conclusion es
que `Context` y `Concept` no son equivalentes: `Context` es la forma implementada
y limitada de un punto de entrada; `Concept` es la abstraccion de dominio que
Vinema probablemente necesita, pero todavia debe disenarse antes de existir en
codigo.
