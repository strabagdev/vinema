# VIN-011 - Paradigma de Organizacion de Vinema

## 1. Introduccion

Vinema cuestiona una premisa muy antigua del software personal: para volver a
encontrar algo, primero hay que decidir donde guardarlo.

Esa premisa aparece en carpetas, subcarpetas, notebooks, espacios, colecciones,
etiquetas y sistemas de categorias. Todos intentan resolver un problema real:
sin algun orden, la informacion se pierde. Pero tambien introducen una carga
previa: el usuario debe clasificar antes de saber como recordara esa informacion
en el futuro.

Vinema propone otro paradigma:

```text
Guardar primero.
Asociar despues.
Recuperar desde multiples caminos.
```

Este documento define el modelo conceptual de organizacion de Vinema. No disena
tablas, no modifica modelos, no implementa funcionalidades y no reemplaza la
teoria de indices. La complementa desde una pregunta anterior: como se organiza
una fuente sin obligarla a tener una ubicacion permanente.

## 2. Problema

La mayoria de aplicaciones actuales organiza informacion mediante estructuras
que el usuario debe elegir o mantener.

Ejemplos:

- carpetas;
- subcarpetas;
- notebooks;
- espacios;
- colecciones;
- etiquetas;
- areas;
- proyectos;
- listas;
- bases de datos.

Estas estructuras existen porque resuelven problemas reales:

- reducen caos inicial;
- permiten separar ambitos;
- dan una sensacion de control;
- hacen posible encontrar informacion por ubicacion;
- facilitan permisos o colaboracion en contextos empresariales;
- permiten archivar grandes volumenes con reglas conocidas.

Pero tambien tienen limites:

- fuerzan decisiones antes de que el valor de la fuente sea claro;
- asumen que existe una ubicacion correcta;
- empujan a duplicar informacion cuando una fuente pertenece a varios temas;
- exigen recordar la decision tomada al guardar;
- crean mantenimiento administrativo;
- envejecen mal cuando cambia el significado de la informacion;
- confunden ordenar con poder recuperar.

El problema no es que las carpetas sean inutiles. El problema es convertirlas en
la condicion principal para recordar.

## 3. Paradigma tradicional

El paradigma tradicional suele funcionar asi:

```text
Clasificar
  ↓
Guardar
  ↓
Buscar
```

Antes de guardar, el usuario debe responder preguntas como:

- en que carpeta va?;
- a que notebook pertenece?;
- que etiqueta corresponde?;
- es de este proyecto o de otro?;
- es personal, laboral, historico o activo?;
- lo guardo por cliente, por fecha, por tema o por documento?;
- como lo voy a buscar despues?

Esta forma de organizacion intenta anticipar el recuerdo futuro. Funciona bien
cuando el dominio es estable, la jerarquia es compartida y la informacion tiene
una ubicacion obvia.

Ejemplos donde puede funcionar:

- archivos contables por ano;
- documentacion legal por expediente;
- entregables de proyecto por version;
- repositorios de documentos con permisos;
- colecciones cerradas y normadas.

Su debilidad aparece cuando la informacion puede recordarse desde varias pistas.
Una reunion con Mitcom puede pertenecer a un proyecto, proveedor, persona,
problema, decision, fecha y norma. Elegir una sola ubicacion destruye rutas de
acceso. Elegir todas manualmente aumenta carga cognitiva.

## 4. Paradigma Vinema

El paradigma de Vinema invierte el orden:

```text
Guardar
  ↓
Asociar
  ↓
Recuperar
```

La captura no debe exigir clasificacion previa. La fuente entra primero al
sistema. Luego puede asociarse con pistas, indices, conceptos, fechas,
contextos, relaciones o fragmentos textuales.

La organizacion no es una decision unica tomada al inicio. Es una red evolutiva
de asociaciones que puede crecer despues de que la fuente existe.

La hipotesis principal es:

```text
La organizacion no debe ocurrir antes del almacenamiento.
Debe construirse despues del almacenamiento.
```

### Argumentos a favor

- Reduce friccion de captura.
- Evita perder informacion por no saber donde ponerla.
- Reconoce que el valor de una fuente puede cambiar.
- Permite multiples caminos de recuperacion.
- Evita pertenencia unica.
- Alinea Vinema con memoria humana, donde el recuerdo suele ser asociativo.
- Permite que la organizacion surja de uso, contenido, tiempo y relaciones.

### Argumentos en contra

- Puede generar sensacion de desorden si no existe recuperacion confiable.
- Puede posponer decisiones necesarias en dominios regulados.
- Puede producir fuentes huerfanas si no hay busqueda o indices minimos.
- Puede ocultar demasiado la estructura y dejar al usuario sin control.
- Puede ser peor que una carpeta cuando la ubicacion es obvia y estable.
- Puede requerir buenos estados de recuperacion para no parecer una bandeja
  infinita.

### Intento de refutacion

La hipotesis falla si:

- el usuario necesita garantizar ubicacion antes de guardar por razones legales;
- el sistema no ofrece ningun mecanismo posterior de recuperacion;
- la fuente pertenece a una jerarquia externa obligatoria;
- la informacion debe publicarse o compartirse en una estructura fija;
- las asociaciones son tan invisibles que nadie entiende por que aparece nada.

Por lo tanto, la hipotesis no debe interpretarse como "nunca clasificar". Debe
interpretarse como:

```text
Vinema no debe exigir clasificacion previa para que la fuente sea valiosa.
```

## 5. Organizacion invisible

Organizacion invisible significa que el usuario no necesita mantener una
estructura explicita para que Vinema pueda recuperar informacion.

No significa organizacion inexistente. Significa que la carga de construir
caminos de acceso se desplaza desde una decision previa del usuario hacia una
combinacion de:

- contenido de la fuente;
- fecha;
- busqueda textual;
- asociaciones manuales opcionales;
- contexto de navegacion;
- indices derivados;
- relaciones confirmadas;
- uso posterior;
- correcciones del usuario.

### Decisiones que desaparecen

El usuario no deberia tener que decidir obligatoriamente:

- carpeta;
- subcarpeta;
- notebook;
- categoria unica;
- proyecto principal;
- etiqueta perfecta;
- ubicacion final;
- taxonomia futura.

### Responsabilidades que pasan al sistema

Vinema debe hacerse responsable de:

- preservar la fuente;
- permitir recuperacion aunque no haya clasificacion;
- mostrar caminos de acceso disponibles;
- permitir asociaciones posteriores;
- explicar por que una fuente aparece;
- evitar duplicacion innecesaria;
- proteger contra ruido;
- permitir correccion;
- mantener baja la carga cognitiva.

### Ventajas

- Captura mas rapida.
- Menos abandono por indecision.
- Mayor tolerancia a informacion incompleta.
- Mejor adaptacion a recuerdos futuros.
- Menos duplicados por pertenencia multiple.
- Mayor coherencia con memoria navegable.

### Riesgos

- Opacidad: el usuario puede no entender como esta organizado algo.
- Ruido: asociaciones malas pueden contaminar resultados.
- Confianza: si el sistema falla, la falta de estructura visible se vuelve
  ansiedad.
- Control: algunos usuarios necesitan ubicar explicitamente informacion critica.
- Deuda: fuentes sin asociaciones ni buen contenido pueden quedar pobres para
  recuperacion.

La organizacion invisible solo funciona si la recuperacion es visible,
explicable y corregible.

## 6. Asociaciones

Una asociacion es un vinculo entre una fuente y una pista de acceso.

Puede conectar una fuente con:

- una persona;
- una organizacion;
- un proyecto;
- una fecha;
- un lugar;
- un problema;
- una decision;
- una norma;
- un aprendizaje;
- un documento;
- un evento;
- otra fuente;
- un indice;
- un concepto futuro.

### Que no es una asociacion

Una asociacion no es una ubicacion permanente. No es una carpeta. No es una
orden de archivo. No es necesariamente una etiqueta. No es una copia.

Una fuente asociada a Mitcom, Andes Norte y problema de ventilacion no vive
"dentro" de esos elementos. Puede aparecer desde todos ellos.

### Diferencia con carpeta

La carpeta contiene. La asociacion conecta.

Una carpeta suele responder:

```text
Donde esta guardado esto?
```

Una asociacion responde:

```text
Desde que pista puedo volver a esto?
```

### Diferencia con etiqueta

La etiqueta marca. La asociacion justifica un camino de recuperacion.

Una etiqueta puede ser un texto plano sin significado adicional. Una asociacion
debe poder explicar por que una fuente aparece desde una pista.

### Diferencia con categoria

La categoria clasifica. La asociacion permite multiples pertenencias no fisicas.

Una categoria tiende a dividir. Una asociacion tiende a enlazar.

### Puede una fuente existir sin asociaciones?

Si. Debe poder existir.

Una fuente recien capturada puede no tener asociaciones explicitas y aun asi ser
valida. Puede recuperarse por texto, fecha o listado temporal. Exigir
asociaciones al momento de capturar contradice el paradigma de Vinema.

### Cuando nace una asociacion?

Puede nacer:

- durante la captura, si el usuario la agrega sin friccion;
- al editar;
- al buscar y abrir una fuente;
- al seleccionar un contexto;
- al detectar un nombre repetido;
- al confirmar una sugerencia futura;
- al relacionar dos fuentes;
- al revisar una fuente antigua;
- al convertir una idea en nota.

### Quien la crea?

Puede crearla:

- el usuario explicitamente;
- el sistema como derivacion simple;
- una regla local;
- una sugerencia futura asistida;
- una importacion futura.

Pero la consistencia final debe poder ser corregida por el usuario. Una
asociacion automatica no debe convertirse en verdad incuestionable.

### Como evoluciona?

Una asociacion puede:

- ganar fuentes;
- perder fuentes;
- cambiar de nombre si cambia el indice o concepto;
- fusionarse con otra;
- dividirse;
- archivarse;
- ocultarse de la vista principal;
- volverse mas o menos relevante segun uso;
- pasar de implicita a explicita.

## 7. Casos reales

### Ejemplo 1: Reunion con Mitcom

Organizacion tradicional:

```text
Trabajo
  / Proveedores
    / Mitcom
      / Proyecto Andes Norte
        / Reuniones
```

Problemas:

- tambien podria ir en Proyecto Andes Norte;
- tambien podria ir en Problemas de ventilacion;
- tambien podria ir en Normas;
- tambien podria ir en Decisiones;
- meses despues el usuario puede recordar a Juan, no a Mitcom.

Organizacion Vinema:

La fuente se guarda como reunion o nota textual. Luego puede asociarse con:

- Mitcom;
- Juan;
- Proyecto Andes Norte;
- problema de ventilacion;
- norma aplicable;
- decision pendiente;
- fecha de reunion.

No hay ubicacion unica. Hay varios caminos de regreso.

### Ejemplo 2: Idea rapida

Organizacion tradicional:

El usuario debe decidir si la idea va en Inbox, proyecto, notas personales,
ideas, borradores o tarea futura.

Organizacion Vinema:

La idea se captura inmediatamente. Puede permanecer sin asociacion explicita.
Mas tarde puede convertirse en nota, asociarse a un problema o aparecer por
busqueda textual.

La captura no espera a la organizacion.

### Ejemplo 3: Norma

Organizacion tradicional:

La norma podria guardarse por tema, cliente, proyecto, ano, entidad reguladora o
tipo documental.

Organizacion Vinema:

La fuente normativa se conserva. Puede asociarse con:

- proyecto afectado;
- problema que resuelve;
- decision que justifica;
- contrato;
- proveedor;
- fecha de vigencia;
- organizacion emisora.

La norma no necesita una carpeta final para ser recuperable.

### Ejemplo 4: Definicion personal

Una definicion personal puede ser algo como:

```text
Para mi, una fuente es evidencia antes que conocimiento procesado.
```

Organizacion tradicional:

Podria perderse entre filosofia de producto, glosario, notas personales o ideas.

Organizacion Vinema:

Se guarda como fuente textual y puede asociarse con:

- Vinema;
- fuente;
- glosario;
- decision conceptual;
- aprendizaje;
- fecha;
- documento futuro donde se use.

La definicion puede ganar valor despues de ser escrita.

### Ejemplo 5: Documento PDF

Organizacion tradicional:

El PDF se guarda en una carpeta por proveedor, cliente, proyecto, contrato o ano.

Organizacion Vinema:

Aunque el PDF no pertenezca al MVP actual, conceptualmente seria una fuente. Sus
caminos de recuperacion podrian ser:

- texto extraido;
- nombre del documento;
- proveedor;
- contrato;
- proyecto;
- norma;
- fecha;
- personas mencionadas;
- decisiones relacionadas.

El PDF puede requerir estructura externa por cumplimiento o archivo, pero Vinema
no deberia depender solo de esa estructura para recuperarlo.

## 8. Contraejemplos

### Cuando una carpeta es objetivamente mejor

Una carpeta puede ser mejor cuando:

- la informacion debe entregarse como paquete cerrado;
- existe una norma externa de archivo;
- se necesita replicar una estructura compartida;
- hay permisos por carpeta;
- el usuario trabaja con archivos que deben moverse juntos;
- la ubicacion es parte del contrato o proceso;
- el volumen exige archivo historico frio mas que recuperacion asociativa.

Ejemplo: una carpeta fiscal por ano y mes puede ser superior a asociaciones
libres si el objetivo es cumplimiento, no memoria personal.

### Cuando una jerarquia tiene sentido

Una jerarquia sigue teniendo sentido cuando representa una relacion real de
parte-todo:

- pais / ciudad / direccion;
- empresa / area / equipo;
- contrato / anexo / version;
- proyecto / entregable / revision;
- expediente / documento / folio.

El error no es usar jerarquia. El error es obligar a que toda memoria personal
sea jerarquia.

### Cuando las asociaciones no bastan

Las asociaciones pueden no bastar cuando:

- hay demasiadas asociaciones irrelevantes;
- no hay nombres estables;
- se requiere orden secuencial estricto;
- se necesita versionado formal;
- hay responsabilidad legal;
- el usuario necesita exportar una estructura;
- una fuente tiene contenido pobre y ningun contexto;
- no existe busqueda confiable.

Estos contraejemplos obligan a Vinema a ser humilde: su paradigma es mejor para
acceso asociativo al conocimiento, no para todos los problemas de archivo.

## 9. Principios

1. Nunca obligar al usuario a decidir una ubicacion permanente antes de capturar.
2. La captura debe ser inmediata.
3. La fuente permanece estable aunque cambien sus asociaciones.
4. La organizacion puede evolucionar despues del almacenamiento.
5. Las asociaciones pueden cambiar sin destruir la fuente.
6. La recuperacion nunca debe depender de una unica clasificacion.
7. Una fuente puede aparecer desde multiples caminos sin duplicarse.
8. Asociar no es guardar dentro.
9. Clasificar manualmente debe ser opcional, no requisito.
10. La organizacion invisible debe ser explicable.
11. El sistema debe permitir corregir asociaciones.
12. Una asociacion debe reducir esfuerzo de acceso.
13. Las asociaciones inutiles deben poder desaparecer u ocultarse.
14. Una estructura externa puede coexistir, pero no definir la identidad de
    Vinema.
15. La busqueda textual sigue siendo indispensable.
16. Los indices nacen naturalmente de asociaciones utiles.
17. Las relaciones deben aportar contexto, no decoracion.
18. La organizacion no debe convertirse en mantenimiento administrativo.
19. El usuario debe poder escribir aunque no sepa como organizar.
20. La fuente original siempre debe permanecer visible y recuperable.

## 10. Riesgos

### Riesgo de invisibilidad excesiva

Si la organizacion es demasiado invisible, el usuario puede sentir que no tiene
control. Vinema debe mostrar caminos, razones y opciones de correccion.

### Riesgo de bandeja infinita

Si guardar primero no se acompana de recuperacion real, Vinema se convierte en
un inbox permanente. La busqueda textual y los indices basicos son necesarios
para que el paradigma funcione.

### Riesgo de asociaciones ruidosas

Asociar demasiado puede ser tan malo como clasificar demasiado. Los caminos de
acceso deben tener utilidad, no solo existencia.

### Riesgo de taxonomia encubierta

Vinema podria abandonar carpetas visibles pero recrearlas como contextos,
etiquetas o indices obligatorios. Eso romperia el paradigma.

### Riesgo de falta de estructura cuando si importa

Algunos casos requieren estructura formal. Vinema debe reconocer esos limites y
no presentarse como sustituto universal de archivo documental.

### Riesgo de confianza

El usuario confiara en la organizacion invisible solo si puede encontrar fuentes
consistentemente y entender por que aparecieron.

## 11. Conclusiones

La hipotesis principal queda aceptada con matices:

```text
La organizacion de Vinema no debe ser requisito previo para almacenar.
Debe poder construirse despues, mediante asociaciones e indices de acceso.
```

Pero no queda aceptada como regla universal contra toda estructura. Hay casos
donde carpetas, jerarquias y categorias siguen siendo mejores, especialmente
cuando responden a cumplimiento, permisos, entrega formal o relaciones
parte-todo.

Principales conclusiones:

- La fuente no necesita una ubicacion permanente para ser valiosa.
- Guardar sin clasificar no significa guardar sin recuperacion.
- La asociacion reemplaza la pertenencia como mecanismo principal.
- La organizacion invisible debe ser explicable y corregible.
- Los indices de acceso nacen de asociaciones utiles.
- La busqueda textual sostiene el paradigma cuando aun no existen asociaciones.
- Vinema debe organizar para recuperar, no para administrar.

Hipotesis confirmadas:

- Decidir ubicacion antes de capturar aumenta carga cognitiva.
- Una misma fuente puede necesitar multiples caminos de acceso.
- La fuente debe permanecer estable mientras cambian sus asociaciones.
- La recuperacion no debe depender de una unica clasificacion.
- La organizacion puede evolucionar despues del almacenamiento.

Hipotesis refutadas o limitadas:

- "Las carpetas siempre son malas": falso.
- "Toda jerarquia debe evitarse": falso.
- "Guardar primero basta": falso si no hay recuperacion posterior.
- "Las asociaciones resuelven todo": falso si no son explicables y utiles.
- "La organizacion invisible puede ser completamente invisible": falso; debe
  mostrarse cuando afecta confianza y recuperacion.

## 12. Preguntas abiertas

- Cuales asociaciones deben nacer automaticamente y cuales solo manualmente?
- Como se muestra una asociacion sin convertirla en etiqueta?
- Cuando una asociacion merece convertirse en indice visible?
- Como se corrige una asociacion incorrecta con minima friccion?
- Como evitar una bandeja infinita de fuentes poco asociadas?
- Que casos de estructura formal debe respetar Vinema en el futuro?
- Como conviven archivos externos con fuentes internas?
- Como medir si guardar primero reduce realmente esfuerzo cognitivo?
- Que lenguaje de UI comunica asociacion sin sonar tecnico?
- Como distinguir "organizacion invisible" de "organizacion inexistente"?
- Que debe ver el usuario al abrir una fuente recien capturada sin asociaciones?
- Cual es el minimo de recuperacion necesario antes de ampliar asociaciones?
