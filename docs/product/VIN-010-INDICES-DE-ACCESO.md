# VIN-010 - Teoria de los Indices de Acceso

## 1. Introduccion

Vinema no existe para almacenar notas. Existe para permitir volver a encontrar
conocimiento previamente capturado con el menor esfuerzo cognitivo posible.

La fuente conserva la verdad del sistema. Un indice no reemplaza esa verdad, no
la resume como autoridad y no modifica su contenido. Su papel es otro: convertir
una fuente en varios caminos posibles de regreso.

La pregunta central de VIN-010 es:

```text
Como convierte Vinema una fuente en multiples caminos para volver a encontrarla?
```

Esta teoria no disena tablas, modelos ni migraciones. Define una forma de pensar
el acceso antes de crear nuevas entidades de dominio.

## 2. Problema

Guardar informacion suele ser simple. Volver a ella es dificil porque una
persona rara vez recuerda la ubicacion exacta, el titulo perfecto o la estructura
mental que uso al guardar.

Una misma fuente puede ser recordada desde muchas pistas:

- una persona;
- una organizacion;
- un proyecto;
- una fecha aproximada;
- un problema;
- una decision;
- una norma;
- una frase;
- un aprendizaje;
- un proveedor.

Si Vinema obliga a elegir un solo lugar, pierde informacion de acceso. Si obliga
a mantener manualmente todas las rutas posibles, aumenta carga cognitiva. El
problema real es construir caminos de acceso sin transformar al usuario en
administrador de taxonomias.

## 3. Objetivos

Este documento busca:

- definir que es un indice de acceso;
- distinguir fuente, indice, etiqueta, categoria, concepto y relacion;
- explicar como una fuente produce multiples caminos de recuperacion;
- describir familias universales de indices;
- proponer criterios para crear, mantener, fusionar o descartar indices;
- comparar busqueda textual, indices y relaciones;
- delimitar el rol posible de IA sin convertirla en fuente de verdad;
- definir que necesita el MVP y que seria sobreingenieria.

No busca:

- implementar funcionalidad;
- crear entidades;
- cambiar el roadmap;
- migrar `Context` a `Concept`;
- decidir todos los tipos del MVP;
- introducir IA en el nucleo.

## 4. Definiciones

### Fuente

Una Fuente es el origen preservable de una informacion. Es lo que el usuario
puede volver a abrir para leer, verificar, reinterpretar o corregir.

En el MVP, una fuente es principalmente texto escrito por el usuario: una nota,
una idea convertida, una observacion o un registro. A futuro podria ser un
documento, correo, imagen, audio o enlace.

La fuente es la verdad del sistema porque conserva evidencia. Todo acceso debe
poder volver a ella.

### Indice

Un Indice es un camino de acceso hacia una o mas fuentes.

Existe para responder:

```text
Si el usuario recuerda esta pista, que fuentes deberian aparecer?
```

Un indice puede estar basado en persona, proyecto, fecha, tema, problema,
decision, norma, proveedor, lugar u otra pista recordable. No contiene la verdad
principal. Apunta hacia fuentes.

### Diferencia entre Fuente e Indice

La Fuente contiene la informacion original.

El Indice permite llegar a esa informacion.

Una fuente puede existir sin indices explicitos y seguir siendo verdad. Un indice
sin fuentes puede existir como intencion o entrada vacia, pero no aporta valor de
memoria hasta conectarse con evidencia.

### Diferencia entre Indice y etiqueta

Una etiqueta suele ser un marcador plano aplicado manualmente. Puede ayudar a
filtrar, pero no necesariamente tiene identidad, explicacion ni ciclo de vida.

Un indice no debe ser solo una palabra pegada a una nota. Debe justificar su
existencia porque reduce esfuerzo de acceso. Puede tener identidad, variantes,
evidencia, historial, relaciones y reglas de fusion cuando eso sea necesario.

La diferencia clave no es tecnica. Es de proposito:

```text
Etiqueta: clasificar.
Indice: volver a encontrar.
```

### Diferencia entre Indice y categoria

Una categoria suele dividir el mundo en grupos. Sugiere pertenencia y a menudo
obliga a elegir una ubicacion.

Un indice no divide. Conecta.

Una fuente puede estar asociada a muchos indices sin duplicarse ni pertenecer
fisicamente a ninguno. El indice representa un camino, no una caja.

### Diferencia entre Indice y Concepto

Un Concepto es una unidad de significado: Mitcom, Andes Norte, ventilacion,
norma sanitaria, Juan Perez, una decision o un aprendizaje recurrente.

Un Indice es el uso de una unidad como camino de acceso.

Muchos indices pueden apoyarse en conceptos, pero no todo indice tiene que ser
un concepto persistido. La fecha, una frase textual o una senal de actividad
pueden ser indices sin convertirse necesariamente en Concepto.

En otras palabras:

```text
Concepto: que significa algo.
Indice: como uso algo para volver a una fuente.
```

### Relacion

Una Relacion es un vinculo significativo entre unidades. Puede conectar una
fuente con un indice, una fuente con otra fuente, un concepto con otro concepto o
un indice con otro indice.

La relacion explica por que el camino existe. El indice permite usar ese camino.

### Por que existe un Indice

Un indice existe porque una fuente puede ser recordada desde mas de una pista.

Su proposito es reducir la distancia entre recuerdo e informacion, preservando
la fuente original y evitando que el usuario dependa de una ubicacion unica.

## 5. Teoria de los indices

### Flujo completo

```text
Captura
  ↓
Persistencia
  ↓
Construccion de indices
  ↓
Recuperacion
  ↓
Navegacion
  ↓
Nueva recuperacion
```

### Captura

La captura ocurre cuando una fuente entra en Vinema. La experiencia ideal exige
la menor decision posible: escribir primero, organizar despues si es realmente
necesario.

Durante la captura ya aparecen pistas: nombres, fechas, proyectos, lugares,
frases, problemas, decisiones, tono temporal y relaciones implicitas. Vinema no
debe exigir que el usuario modele todo en ese momento.

### Persistencia

La persistencia conserva la fuente original. Guarda contenido, fecha, identidad,
estado y procedencia local.

La persistencia no debe depender de que existan indices perfectos. Una fuente
capturada pobremente indexada sigue siendo valida y debe poder recuperarse por
texto o tiempo.

### Construccion de indices

Construir indices significa identificar caminos potenciales de regreso. Algunos
pueden ser explicitos, como asociar una nota con una persona. Otros pueden ser
derivados, como fecha de creacion o palabras presentes en el contenido.

La construccion puede ocurrir en momentos distintos:

- durante la captura;
- al editar una fuente;
- al buscar;
- al navegar;
- al confirmar una sugerencia;
- al detectar uso repetido;
- al fusionar duplicados.

La regla central es que el indice no debe aumentar mas carga cognitiva de la que
reduce.

### Recuperacion

La recuperacion empieza con una pista. Puede ser texto, persona, proyecto,
fecha, problema o cualquier entrada recordable.

Vinema debe traducir esa pista a caminos de acceso y mostrar fuentes
probablemente relevantes, explicando por que aparecen.

### Navegacion

La navegacion ocurre cuando el usuario abre un indice, revisa fuentes
relacionadas, abre una fuente y desde ella descubre nuevos indices.

La navegacion debe permitir seguir asociaciones sin perder la fuente original ni
obligar a entender el modelo de datos.

### Nueva recuperacion

Cada recuperacion puede mejorar futuras recuperaciones. No necesariamente con
telemetria remota ni automatizacion agresiva, sino con senales locales:

- que caminos fueron utiles;
- que indices estan vacios;
- que nombres aparecen duplicados;
- que relaciones se repiten;
- que fuentes se abren juntas.

La memoria de Vinema se fortalece cuando los caminos usados revelan nuevos
caminos.

## 6. Principios

1. Un indice existe unicamente para facilitar acceso.
2. La fuente continua siendo la fuente de verdad.
3. Los indices no modifican la fuente.
4. Los indices representan caminos, no conocimiento final.
5. Una fuente puede aparecer en muchos indices sin duplicarse.
6. Una fuente no pertenece fisicamente a un indice.
7. Un indice debe poder explicar por que muestra una fuente.
8. Un indice vacio debe justificar su existencia o desaparecer de la experiencia
   principal.
9. Crear indices no debe ser requisito para capturar.
10. El usuario no debe mantener una taxonomia perfecta.
11. Un indice manual debe ser opcional y reversible.
12. Un indice sugerido debe ser revisable.
13. Un indice derivado debe ser transparente cuando afecte resultados.
14. Dos indices equivalentes deben poder fusionarse.
15. Un indice demasiado amplio debe poder dividirse o perder prioridad.
16. Un indice obsoleto no debe contaminar la recuperacion.
17. La navegacion entre indices debe preservar trazabilidad hacia fuentes.
18. Los indices deben reducir intentos, no multiplicar decisiones.
19. La busqueda textual, los indices y las relaciones conviven.
20. La tecnologia usada para implementar indices es intercambiable.

## 7. Familias de indices

Las siguientes familias parecen universales, pero no todas pertenecen al MVP.
La lista describe caminos posibles, no una decision de implementacion.

### Persona

Permite recuperar fuentes asociadas a alguien: conversaciones, reuniones,
decisiones, compromisos, aprendizajes y problemas.

Riesgo: convertir personas en contactos administrativos en vez de puertas de
acceso a memoria.

### Organizacion

Representa empresas, instituciones, equipos o unidades externas. Mitcom puede
ser una organizacion.

Riesgo: duplicar proveedor, cliente y organizacion sin criterios claros.

### Proyecto

Agrupa fuentes relacionadas con un esfuerzo sostenido. Andes Norte es un buen
ejemplo.

Riesgo: parecer gestor de proyectos o carpeta principal.

### Lugar

Permite recordar por ubicacion fisica o espacial: oficina, obra, ciudad,
sucursal, planta, sala o sitio.

Riesgo: usar lugar como categoria obligatoria cuando solo es una pista ocasional.

### Fecha

Permite recuperar por tiempo: hoy, semana pasada, antes de vacaciones, durante
una etapa o cerca de una reunion.

Riesgo: exigir precision que la memoria humana no tiene. Debe admitir rangos y
aproximaciones.

### Tema

Representa asuntos recurrentes: masa madre, IndexedDB, ventilacion, contratos,
seguridad, costos.

Riesgo: degenerar en etiquetas infinitas si no hay criterios de utilidad.

### Problema

Conecta fuentes sobre una dificultad: problema de ventilacion, error de
persistencia, retraso de proveedor.

Riesgo: convertir cada incidente menor en indice permanente.

### Decision

Permite volver a una conclusion tomada y sus fuentes: que se decidio, cuando,
por que y con que evidencia.

Riesgo: confundir Vinema con gestor de aprobaciones o tareas.

### Aprendizaje

Conecta fuentes que produjeron una comprension nueva. Es util para conocimiento
acumulado.

Riesgo: un aprendizaje puede ser fuente, sintesis o indice. Antes de persistirlo
hay que definir esa diferencia.

### Documento

Permite acceder desde un documento relevante: contrato, norma, minuta, informe,
cotizacion.

Riesgo: convertir Vinema en gestor documental antes de resolver acceso local.

### Evento

Representa una reunion, llamada, visita, hito o incidente temporal.

Riesgo: algunos eventos son fuentes, no indices. Una reunion puede ser la fuente
original, no necesariamente una puerta persistente.

### Norma

Permite regresar a fuentes relacionadas con reglas, estandares, leyes o
procedimientos.

Riesgo: requiere version, vigencia y autoridad. No debe modelarse superficialmente.

### Proveedor

Permite recuperar informacion asociada a una entidad que entrega bienes o
servicios.

Riesgo: proveedor puede ser organizacion, rol comercial o relacion contextual.
No conviene duplicarlo sin modelo claro.

### Cliente

Permite acceder a fuentes relacionadas con una contraparte receptora de valor.

Riesgo: comparte estructura con organizacion/persona y puede introducir sesgo
empresarial en un producto personal.

### Contrato

Permite recuperar decisiones, normas, obligaciones, proveedores, clientes y
problemas asociados a un acuerdo.

Riesgo: un contrato es tambien documento y fuente. Como indice solo debe existir
si ayuda a regresar a multiples fuentes.

## 8. Criterios de creacion

### Cuando merece existir un indice

Un indice merece existir cuando:

- reduce el esfuerzo para volver a fuentes;
- representa una pista que el usuario probablemente recordara;
- conecta mas de una fuente o una fuente muy importante;
- puede explicar por que una fuente aparece;
- evita una busqueda textual repetida;
- tiene identidad suficientemente estable;
- puede mantenerse sin trabajo administrativo excesivo;
- habilita navegacion hacia otras fuentes utiles.

### Cuando no merece existir

Un indice no merece existir cuando:

- solo replica una palabra casual;
- no ayuda a recuperar nada;
- exige mantenimiento manual constante;
- compite con otro indice equivalente;
- es demasiado ambiguo para orientar resultados;
- es tan especifico que nunca se reutilizara;
- se crea solo porque el sistema puede detectarlo;
- transforma Vinema en una taxonomia pesada.

### Caracteristicas necesarias

Un indice util deberia tener:

- nombre o pista reconocible;
- fuente o fuentes asociadas;
- razon de asociacion;
- alcance comprensible;
- posibilidad de correccion;
- trazabilidad hacia fuentes;
- comportamiento claro al archivar, fusionar o dividir;
- baja friccion de uso.

### Problemas que evita

- recordar carpetas;
- depender del titulo exacto;
- repetir busquedas;
- duplicar notas;
- perder fuentes relacionadas;
- navegar jerarquias artificiales;
- convertir cada fuente en una ubicacion unica.

### Problemas que puede generar

- ruido;
- duplicados;
- falsa sensacion de organizacion;
- mantenimiento manual;
- resultados irrelevantes;
- dependencia de nombres mal elegidos;
- abstracciones que el usuario no entiende;
- clasificacion prematura.

## 9. Ciclo de vida

### Nacimiento

Un indice puede nacer de:

- una accion explicita del usuario;
- un contexto actual existente;
- texto seleccionado;
- repeticion de una entidad en varias fuentes;
- una busqueda frecuente;
- una fecha o evento;
- una sugerencia aceptada;
- una importacion futura.

### Evolucion

Un indice evoluciona cuando:

- se asocian nuevas fuentes;
- cambia su nombre;
- aparecen aliases;
- se corrige una asociacion;
- se relaciona con otros indices;
- gana o pierde relevancia;
- cambia su interpretacion.

### Deja de ser util

Un indice deja de ser util cuando:

- no tiene fuentes;
- no se usa para recuperar;
- sus fuentes son obsoletas;
- se duplico con otro indice mejor;
- su significado se volvio demasiado amplio;
- su significado se volvio demasiado estrecho;
- aumenta ruido en vez de reducir esfuerzo.

### Eliminacion

Eliminar un indice no debe eliminar fuentes. Como el indice es camino, su
eliminacion solo retira una via de acceso.

Debe distinguirse entre:

- eliminar el indice;
- archivar el indice;
- ocultarlo de la navegacion principal;
- retirar una fuente de ese indice.

### Fusion

Fusionar indices es necesario cuando dos caminos representan la misma pista:
Mitcom, MITCOM Ltda., Proveedor Mitcom.

La fusion debe preservar fuentes, aliases y trazabilidad. No debe borrar
evidencia.

### Division

Dividir indices es necesario cuando uno se vuelve demasiado amplio. Por ejemplo,
"Ventilacion" podria dividirse en "Problema de ventilacion bodega" y "Norma de
ventilacion".

La division debe ocurrir solo si mejora acceso. Dividir por orden estetico seria
volver a carpetas.

## 10. Navegacion

La navegacion por indices deberia seguir este patron:

```text
Indice
  ↓
Fuentes relacionadas
  ↓
Nueva fuente
  ↓
Nuevos indices visibles
  ↓
Mas fuentes
```

Ejemplo:

```text
Mitcom
  ↓
Reunion con Mitcom
  ↓
Problema de ventilacion
  ↓
Norma aplicable
  ↓
Decision tomada
```

Esta navegacion difiere de una busqueda tradicional:

- no empieza siempre con texto;
- no termina en una lista plana;
- permite moverse por asociaciones;
- conserva la fuente original;
- muestra nuevas pistas mientras se navega;
- no requiere conocer una jerarquia.

La navegacion ideal no obliga a elegir entre buscar o explorar. Una busqueda
puede abrir un indice, un indice puede revelar fuentes, una fuente puede revelar
otros indices y esos indices pueden iniciar nuevas recuperaciones.

## 11. Comparacion con busqueda

### Busqueda textual

Fortalezas:

- inmediata;
- no requiere modelado previo;
- funciona con contenido no organizado;
- excelente para frases recordadas;
- util como primera linea de recuperacion.

Debilidades:

- depende de palabras presentes;
- falla con sinonimos o recuerdos vagos;
- entrega listas planas;
- puede no explicar relaciones;
- puede requerir muchos intentos.

Usarla cuando el usuario recuerda una palabra, frase o titulo aproximado.

### Indices

Fortalezas:

- permiten volver desde pistas recordables;
- agrupan fuentes sin duplicarlas;
- reducen busquedas repetidas;
- habilitan navegacion;
- pueden explicar por que algo aparece.

Debilidades:

- pueden crear ruido;
- pueden duplicarse;
- requieren criterios de vida y muerte;
- pueden convertirse en etiquetas o categorias si se disenan mal;
- pueden aumentar carga cognitiva si son obligatorios.

Usarlos cuando una pista tiene valor recurrente de acceso.

### Relaciones

Fortalezas:

- explican conexiones;
- permiten navegar entre unidades;
- dan contexto;
- habilitan caminos indirectos;
- evitan silos.

Debilidades:

- pueden volverse invisibles o decorativas;
- requieren significado;
- pueden crear complejidad;
- si no tienen evidencia, generan desconfianza.

Usarlas cuando importa el porque del vinculo, no solo la coincidencia.

### Como conviven

La busqueda textual encuentra fuentes desde palabras.

Los indices encuentran fuentes desde pistas estables.

Las relaciones explican y amplian los caminos.

Ninguno reemplaza completamente a los otros. Vinema necesita los tres, en orden
de madurez: primero busqueda confiable, luego indices utiles, luego relaciones
mas expresivas.

## 12. Rol de la IA

La IA no forma parte del nucleo de Vinema.

Puede colaborar en el futuro como asistente, no como autoridad.

Usos posibles:

- sugerir indices candidatos;
- detectar nombres repetidos;
- detectar duplicados;
- proponer aliases;
- proponer relaciones;
- resumir fuentes;
- sugerir que dos indices deberian fusionarse;
- detectar una decision, norma o aprendizaje en una fuente.

Restricciones:

- la IA no crea la verdad del sistema;
- la fuente original sigue siendo autoridad;
- las sugerencias deben ser revisables;
- el usuario debe poder corregir o descartar;
- el dominio debe mantener consistencia;
- una sugerencia no aceptada no debe contaminar recuperacion principal;
- no debe requerirse red para el nucleo local-first/offline-first.

La IA puede reducir esfuerzo, pero tambien puede producir ruido. Por eso debe
entrar despues de que el modelo de indices sea comprensible sin IA.

## 13. MVP

### Imprescindible

El MVP necesita:

- fuente textual preservada;
- busqueda textual local;
- fechas como indices implicitos basicos;
- puntos de entrada manuales existentes mientras sigan ayudando;
- posibilidad de ver fuentes relacionadas a un punto de entrada;
- explicacion minima de por que aparece un resultado;
- navegacion de fuente a indices visibles y de indices a fuentes;
- correccion simple de asociaciones manuales;
- no exigir organizacion antes de escribir.

### Puede esperar

Puede esperar:

- indice universal de Concept;
- relaciones concepto-concepto;
- aliases avanzados;
- fusion/division formal de indices;
- deteccion automatica de entidades;
- IA;
- importacion documental;
- grafos visibles;
- analitica de uso;
- indices para todas las familias descritas.

### Seria sobreingenieria

Seria sobreingenieria ahora:

- crear una taxonomia completa de tipos de indice;
- modelar proveedor, cliente, contrato, norma y decision como entidades
  separadas antes de validar acceso;
- implementar motor de grafo;
- introducir embeddings como requisito;
- crear workflow de aprobaciones;
- construir jerarquias configurables;
- medir todo antes de que exista una experiencia simple de navegacion.

### Necesidad real del MVP

El MVP no necesita saber todo sobre el conocimiento. Necesita probar si una
persona puede capturar sin friccion y volver a una fuente desde varias pistas
sin mantener carpetas.

## 14. Casos reales

### Reunion con Mitcom

Fuente:

```text
Reunion de seguimiento con Mitcom.
Juan indico que el problema de ventilacion afecta la sala norte.
Se revisara la norma aplicable antes de decidir cambio de proveedor.
```

Indices posibles:

- Mitcom;
- Juan;
- Reunion;
- Proyecto Andes Norte;
- problema de ventilacion;
- sala norte;
- norma aplicable;
- proveedor;
- fecha de la reunion.

Caminos de regreso:

- "Mitcom" devuelve la reunion.
- "ventilacion" devuelve la reunion y otras fuentes del problema.
- "Juan" devuelve conversaciones relacionadas.
- "norma" devuelve fuentes normativas y decisiones relacionadas.

### Proyecto Andes Norte

Una fuente sobre avance del proyecto puede ser recuperada por:

- Proyecto Andes Norte;
- Mitcom;
- contrato;
- decision de alcance;
- fecha de hito;
- problema de ventilacion;
- proveedor pendiente.

El proyecto es un indice util, pero no debe convertirse en carpeta exclusiva.

### Problema de ventilacion

Varias fuentes pueden apuntar al mismo problema:

- minuta de reunion;
- observacion tecnica;
- norma;
- decision de cambio;
- conversacion con proveedor.

El indice "Problema de ventilacion" permite reunir evidencia sin copiarla.

### Norma

Una norma puede aparecer como:

- fuente documental futura;
- indice hacia notas que la mencionan;
- criterio de decision;
- relacion con problemas y contratos.

No debe ser tratada superficialmente: vigencia y autoridad importan.

### Decision

Una decision puede ser recuperada desde:

- proyecto;
- problema;
- fecha;
- persona que la aprobo;
- fuente donde fue registrada;
- norma que la justifica.

Antes de modelarla como entidad, Vinema debe saber si la decision es fuente,
indice, concepto o resultado derivado.

### Proveedor

Mitcom podria ser organizacion y proveedor al mismo tiempo. El usuario quizas
solo recuerde "Mitcom", no si era proveedor, empresa o contraparte.

Vinema deberia permitir recuperar por ese nombre sin obligar a elegir
clasificacion perfecta.

### Aprendizaje

Una nota puede decir:

```text
Aprendi que registrar el problema apenas aparece evita perder decisiones
posteriores.
```

Ese aprendizaje puede ser:

- contenido de una fuente;
- indice si conecta varias fuentes;
- concepto si se vuelve unidad recurrente de conocimiento;
- resumen futuro si se deriva de evidencia.

La forma correcta depende de como ayude al acceso, no de una taxonomia previa.

## 15. Conclusiones

1. El indice es una teoria de acceso, no una entidad que deba implementarse ya.
2. La fuente conserva la verdad; el indice solo abre caminos.
3. Un indice no es etiqueta ni categoria: existe para recuperar, no para ordenar.
4. Concepto e indice no son sinonimos. Un concepto puede servir como indice, pero
   tambien existen indices no conceptuales como fecha o texto.
5. `Context` actual puede verse como una forma inicial y manual de indice
   contextual, no como modelo completo.
6. La busqueda textual de VIN-008 es una primera familia de acceso, no el destino
   final.
7. El MVP debe evitar taxonomias universales y enfocarse en caminos simples que
   reduzcan intentos.
8. La IA puede sugerir indices en el futuro, pero no debe crear verdad ni
   consistencia por si sola.

Hipotesis confirmadas:

- Una fuente necesita multiples caminos de acceso.
- Forzar pertenencia unica contradice la vision de Vinema.
- La recuperacion no puede depender solo de busqueda textual.
- Los indices deben poder explicar por que una fuente aparece.
- La fuente original debe permanecer visible.

Hipotesis descartadas:

- Que un indice sea simplemente una etiqueta.
- Que una categoria jerarquica resuelva el problema de acceso.
- Que `Concept` deba implementarse antes de entender indices.
- Que IA sea necesaria para el nucleo inicial.
- Que todas las familias de indices deban modelarse desde el MVP.

## 16. Preguntas abiertas

- Como se representa un indice sin convertirlo inmediatamente en entidad
  persistida?
- Que indices deben ser visibles y cuales deben ser implicitos?
- Cuando un indice implicito merece volverse editable?
- Como se explica la razon de una asociacion sin sobrecargar la interfaz?
- Como se evita que indices manuales se conviertan en etiquetas tradicionales?
- Que senales locales indican que un indice fue util?
- Como se fusionan indices sin perder trazabilidad?
- Como se distinguen organizacion, proveedor y cliente sin duplicar entidades?
- Una decision debe ser fuente, indice, concepto o tipo propio futuro?
- Un aprendizaje debe ser contenido, concepto, indice o sintesis?
- Que familia minima de indices debe validar el proximo incremento?
- Como medir reduccion de esfuerzo cognitivo sin telemetria invasiva?
