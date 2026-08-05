# Captura

## Definición

Una captura es la forma en que una fuente entra en Vinema. En el producto
actual corresponde a contenido textual escrito por el usuario, sin titulo como
campo activo.

## Propósito

Permitir que el usuario incorpore informacion con minima friccion, sin decidir
donde guardarla antes de escribir.

## Qué no es

No es una nota tradicional, no es una carpeta, no es una tarea y no depende de un
titulo para existir.

## Relacionado con

Memoria, concepto, relacion, identidad emergente, capturar seleccion, memoria
sugerida.

# Memoria

## Definición

La memoria es la red formada por capturas, conceptos y relaciones. Es la forma
en que Vinema permite volver a informacion previamente capturada.

## Propósito

Reducir el esfuerzo cognitivo necesario para acceder a conocimiento capturado.

## Qué no es

No es historial cronologico, no es una lista de notas, no es archivo y no es una
ubicacion fisica.

## Relacionado con

Captura, concepto, relacion, hilo, estado de la memoria, reconciliacion,
sincronizacion.

# Concepto

## Definición

Un concepto es una idea, entidad, persona, lugar, proyecto, problema o tema que
funciona como punto de entrada hacia fuentes relacionadas.

## Propósito

Permitir acceder a la memoria desde aquello que el usuario recuerda, no desde el
lugar donde algo fue guardado.

## Qué no es

No es una carpeta, no es una etiqueta decorativa y no debe comportarse como una
ubicacion unica.

## Relacionado con

Alias, identidad, contexto, relacion, concepto sugerido, perfil vivo,
explorador de conocimiento.

# Contexto

## Definición

Contexto es el termino actualmente usado en Vinema para Areas, Proyectos y
Personas. Su uso esta permitido durante la transicion como punto de entrada
manual.

## Propósito

Representar una forma actual de relacionar capturas con una perspectiva de
pensamiento.

## Qué no es

No es una carpeta y no debe convertirse en una taxonomia obligatoria.

## Relacionado con

Concepto, captura, relacion, identidad emergente, perfil vivo.

# Alias

## Definición

Un alias es otra forma de nombrar un concepto ya existente. No crea una identidad
nueva.

## Propósito

Permitir que distintas formas textuales conduzcan al mismo concepto canonico.

## Qué no es

No es otro concepto, no es una etiqueta independiente y no reemplaza el label
canonico visible.

## Relacionado con

Concepto, identidad, concepto sugerido, capturar seleccion.

# Identidad

## Definición

La identidad de un concepto es su unidad canonica: puede tener muchas formas de
ser nombrada, pero representa un solo punto de acceso.

## Propósito

Evitar duplicados conceptuales y mantener consistente la recuperacion de la
memoria.

## Qué no es

No es la forma normalizada visible, no es un alias aislado y no es una similitud
difusa.

## Relacionado con

Concepto, alias, identidad emergente, concepto sugerido.

# Identidad emergente

## Definición

La identidad emergente es una vista calculada de una captura a partir de sus
conceptos aceptados. No se persiste como titulo.

## Propósito

Permitir reconocer una captura por sus asociaciones validadas sin pedir al
usuario que escriba o mantenga un titulo.

## Qué no es

No es un titulo, no se genera desde la primera linea, no duplica el contenido y
no usa inferencia automatica no aceptada.

## Relacionado con

Captura, concepto, relacion, hilo, memoria sugerida, perfil vivo.

# Relación

## Definición

Una relacion es un vinculo significativo entre una captura y un concepto, entre
conceptos o eventualmente entre fuentes.

## Propósito

Crear contexto para que la memoria pueda recuperarse desde multiples entradas.

## Qué no es

No es una ubicacion, no es una carpeta y no debe exigir una jerarquia manual.

## Relacionado con

Captura, concepto, contexto, memoria, evidencia, perfil vivo.

# Hilo

## Definición

Un hilo agrupa capturas activas y no archivadas que comparten exactamente el
mismo conjunto de conceptos aceptados y activos.

## Propósito

Mostrar continuidades de un mismo contexto de pensamiento sin fusionar ni
modificar las capturas originales.

## Qué no es

No es una carpeta, no es una entidad persistida y no agrupa por texto parecido,
orden temporal o coincidencia parcial.

## Relacionado con

Memoria, captura, concepto, identidad emergente, relacion.

# Memoria sugerida

## Definición

Una memoria sugerida es una captura relacionada que Vinema muestra mientras el
usuario escribe, como parte de la experiencia "Me recuerda a".

## Propósito

Ayudar al usuario a volver a informacion relacionada sin abandonar el flujo de
captura.

## Qué no es

No es un resultado de buscador tradicional, no es una recomendacion remota y no
crea relaciones por si misma.

## Relacionado con

Captura, memoria, concepto sugerido, identidad emergente, evidencia.

# Concepto sugerido

## Definición

Un concepto sugerido es un concepto existente o emergente que Vinema propone
mientras el usuario escribe.

## Propósito

Ayudar a relacionar la captura actual con conceptos utiles sin imponer
organizacion manual.

## Qué no es

No es una decision automatica, no es una etiqueta obligatoria y no se persiste
como concepto nuevo hasta que el usuario lo acepta cuando corresponde.

## Relacionado con

Concepto, alias, identidad, capturar seleccion, motor cognitivo.

# Capturar selección

## Definición

Capturar seleccion es la accion mediante la cual una seleccion explicita de
texto dentro del editor puede convertirse en concepto aceptado para la captura
actual.

## Propósito

Permitir que el usuario convierta una expresion relevante en concepto sin salir
del flujo de escritura.

## Qué no es

No es creacion automatica indiscriminada, no acepta palabras vacias como
conceptos y no duplica conceptos ya existentes.

## Relacionado con

Captura, concepto, alias, concepto sugerido, identidad.

# Motor Cognitivo

## Definición

El Motor Cognitivo es el conjunto de motores locales y deterministas que observan
la memoria del usuario y derivan patrones, relaciones, evolucion y sugerencias
basadas en evidencia.

## Propósito

Mejorar la capacidad de Vinema para recordar alrededor del usuario sin aumentar
su carga cognitiva.

## Qué no es

No es inteligencia artificial generativa, no usa servicios externos, no inventa
evidencia y no decide por el usuario.

## Relacionado con

Memoria, concepto sugerido, evidencia, perfil vivo, explorador de conocimiento,
conocimiento.

# Estado de la memoria

## Definición

El estado de la memoria es la representacion simple de si la memoria esta
integra, pendiente, offline, verificandose, con error o requiere atencion.

## Propósito

Responder si el usuario puede confiar en que su memoria esta integra.

## Qué no es

No es una consola de sincronizacion, no es un dashboard tecnico y no debe mostrar
detalles internos salvo que exista un problema que explicar.

## Relacionado con

Memoria, sincronizacion, reconciliacion, conflicto, offline-first.

# Explorador de conocimiento

## Definición

El explorador de conocimiento es la superficie que permite ver conexiones entre
conceptos y navegar la memoria desde esas conexiones.

## Propósito

Permitir una lectura global de como esta conectada la memoria sin convertir esa
lectura en una carpeta ni en una portada vacia.

## Qué no es

No es el perfil vivo de un concepto, no es la pantalla principal de captura y no
es un grafo persistido.

## Relacionado con

Concepto, perfil vivo, memoria, relacion, evidencia, conocimiento.

# Offline-first

## Definición

Offline-first significa que Vinema debe seguir siendo util sin conexion y que
las operaciones locales no dependen de disponibilidad remota inmediata.

## Propósito

Proteger la continuidad de captura y recuperacion de memoria aun cuando no haya
conexion.

## Qué no es

No es ausencia de sincronizacion y no significa que los datos deban quedar solo
locales para siempre.

## Relacionado con

Memoria, captura, sincronizacion, estado de la memoria, reconciliacion.

# Sincronización

## Definición

La sincronizacion es el proceso por el cual los cambios locales y remotos de la
memoria convergen entre clientes.

## Propósito

Mantener la memoria disponible en mas de un cliente sin poner en riesgo la
informacion existente.

## Qué no es

No es el centro visible de la experiencia, no reemplaza offline-first y no debe
sobrescribir contenido silenciosamente.

## Relacionado con

Memoria, offline-first, estado de la memoria, reconciliacion, conflicto.

# Reconciliación

## Definición

La reconciliacion es la verificacion y reparacion controlada de la memoria
completa para detectar cambios pendientes, divergencias o entidades que no han
convergido.

## Propósito

Complementar la sincronizacion incremental y ayudar a confirmar que la memoria
esta integra.

## Qué no es

No es un reemplazo de la sincronizacion normal, no es una eliminacion de datos y
no debe declarar convergencia si no puede demostrarla.

## Relacionado con

Estado de la memoria, sincronizacion, conflicto, memoria, evidencia.

# Conflicto

## Definición

Un conflicto es una divergencia real de una entidad logica de memoria que no debe
resolverse mediante sobrescritura automatica.

## Propósito

Proteger informacion local y remota cuando ambas versiones no pueden converger
sin decision.

## Qué no es

No es cada intento fallido de sincronizacion, no es un contador de mutaciones y
no debe multiplicarse visualmente por reintentos historicos.

## Relacionado con

Sincronizacion, reconciliacion, estado de la memoria, evidencia.

# Evidencia

## Definición

Evidencia es la fuente, captura o relacion que sostiene una sugerencia, perfil,
conexion, patron o diagnostico dentro de Vinema.

## Propósito

Mantener trazable por que una informacion aparece y evitar que Vinema invente
conocimiento sin soporte verificable.

## Qué no es

No es una explicacion fabricada, no es contenido generado y no reemplaza la
fuente original.

## Relacionado con

Captura, concepto, relacion, motor cognitivo, perfil vivo, conocimiento.

# Perfil vivo

## Definición

Un perfil vivo es la superficie de un concepto que muestra como ese concepto
aparece en la memoria: recuerdos, aliases, actividad, conexiones y evidencia
derivada.

## Propósito

Permitir comprender un concepto desde la memoria acumulada sin clasificarlo en
una taxonomia fija.

## Qué no es

No es un tipo de concepto, no es una ficha administrativa y no persiste una
interpretacion cerrada del concepto.

## Relacionado con

Concepto, alias, evidencia, explorador de conocimiento, memoria, relacion.

# Conocimiento

## Definición

Conocimiento es la informacion previamente capturada que puede recuperarse
mediante fuentes, conceptos, relaciones, contexto y tiempo.

## Propósito

Ser accesible con menor esfuerzo que mediante carpetas, titulos exactos o
busquedas lineales.

## Qué no es

No es una base documental generica, no es una taxonomia y no es una respuesta
sin fuente visible.

## Relacionado con

Memoria, captura, concepto, relacion, evidencia, motor cognitivo, explorador de
conocimiento.
