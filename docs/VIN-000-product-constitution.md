# VIN-000 - Product Constitution

## 1. Vision

Vinema no es una aplicacion para almacenar notas.

Vinema existe para ayudar a pensar. Su proposito es funcionar como una extension
de la memoria del usuario: un lugar donde las ideas puedan aparecer, permanecer,
relacionarse y volver a la superficie sin exigir esfuerzo innecesario.

La aplicacion debe reducir la carga cognitiva, no aumentarla. Cada decision de
producto, diseno y arquitectura debe favorecer que el usuario piense mejor, con
menos friccion y con menos miedo a perder lo que importa.

## 2. Filosofia

El objetivo de Vinema no es organizar informacion. El objetivo es recordar sin
esfuerzo.

Vinema debe acercarse mas a la forma en que recuerda una persona que a la forma
en que funciona un sistema tradicional de archivos. Las ideas rara vez viven en
un unico lugar mental. Aparecen por asociaciones, momentos, personas,
proyectos, preocupaciones, contextos y recorridos.

El usuario deberia concentrarse unicamente en escribir. La organizacion debe
surgir del sistema, no imponerse como una tarea adicional. Cuando Vinema pide al
usuario clasificar demasiado pronto, nombrar demasiado, elegir demasiadas
opciones o mantener una estructura manual, se aleja de su proposito.

## 3. Principios Irrenunciables

Estos principios son permanentes. Ningun paquete de trabajo debe romperlos.

- **Local First.** Vinema debe funcionar desde los datos locales del usuario.
- **Offline First.** La aplicacion debe seguir siendo util sin conexion.
- **Propiedad de datos.** El usuario es duenio de su informacion.
- **Sincronizacion segura.** La sincronizacion nunca debe poner en riesgo la
  informacion existente.
- **Simplicidad antes que cantidad de funciones.** Una funcion nueva solo es
  valiosa si ayuda sin sobrecargar.
- **Menor carga cognitiva.** Reducir el esfuerzo mental siempre tiene prioridad.
- **Pensamiento antes que organizacion manual.** Las decisiones deben favorecer
  pensar, capturar y recordar antes que administrar estructuras.

## 4. Modelo Mental

Vinema no trabaja mediante carpetas.

El usuario navega mediante contextos. Las perspectivas iniciales del sistema
son:

- Ideas
- Areas
- Proyectos
- Personas
- Diario
- Archivo

Estas perspectivas no representan ubicaciones fisicas. Representan distintas
formas de acceder a la misma informacion.

Una nota puede aparecer simultaneamente en multiples perspectivas sin
duplicarse. La misma idea puede pertenecer a un proyecto, estar relacionada con
una persona, haber nacido en el diario y terminar en el archivo. Vinema debe
permitir esa continuidad sin obligar al usuario a decidir una unica ubicacion.

## 5. Navegacion

La navegacion debe minimizar el esfuerzo mental.

El usuario no deberia preguntarse:

> Donde guarde esta nota?

Deberia preguntarse:

> Desde que contexto quiero verla?

La navegacion de Vinema debe construirse alrededor de esa diferencia. El sistema
debe ayudar a recuperar informacion desde el contexto natural del pensamiento,
no desde una jerarquia artificial que el usuario deba recordar.

## 6. Busqueda

La busqueda debe existir.

Sin embargo, no es la funcionalidad principal. Debe considerarse un mecanismo
secundario: una herramienta de rescate, precision o acceso rapido, no el camino
central para usar Vinema.

Si un usuario necesita utilizar constantemente la busqueda para encontrar lo que
necesita, la navegacion principal probablemente esta fallando. Vinema debe
aspirar a que la informacion importante reaparezca por contexto antes que por
esfuerzo de busqueda.

## 7. Experiencia de Usuario

La experiencia de Vinema debe favorecer concentracion sobre complejidad.

Decisiones permanentes ya adoptadas:

- Las notas abren inicialmente en modo lectura.
- Editar es una accion explicita.
- Debe existir una accion visible para volver.
- El guardado automatico reduce el riesgo de perdida.
- La interfaz debe evitar ruido, sobreexplicacion y controles innecesarios.

Vinema debe sentirse confiable, sobrio y directo. La interfaz no debe competir
con el pensamiento del usuario.

## 8. Arquitectura

La arquitectura debe proteger la identidad del producto.

Principios permanentes:

- **Dominio antes que interfaz.** La logica central debe expresar el modelo de
  conocimiento de Vinema, no los detalles de una pantalla.
- **Infraestructura desacoplada.** La aplicacion no debe quedar atrapada por una
  tecnologia especifica de almacenamiento, sincronizacion o ejecucion.
- **Persistencia independiente.** Guardar datos debe ser una capacidad estable y
  separada de la presentacion.
- **Preparado para sincronizacion futura.** El sistema debe poder evolucionar
  hacia sincronizacion sin comprometer datos locales.
- **Cambios registrables.** Las modificaciones importantes deben poder
  representarse y auditarse cuando el producto lo requiera.
- **Componentes pequenos y reutilizables.** La interfaz debe componerse con
  piezas claras, mantenibles y de responsabilidad acotada.
- **Codigo simple antes que soluciones sofisticadas.** La sofisticacion solo se
  justifica cuando reduce complejidad real.

## 9. Que No Es Vinema

Vinema no pretende ser:

- un explorador de archivos;
- un sistema basado en carpetas;
- un gestor tradicional de documentos;
- un clon de Obsidian;
- un clon de Notion;
- un gestor de tareas.

Vinema puede compartir algunas capacidades superficiales con otras herramientas,
pero su identidad debe permanecer claramente diferenciada. Su centro no es
administrar documentos, construir bases de datos personales ni gestionar
tareas. Su centro es ayudar al usuario a pensar y recordar.

## 10. Reglas Para Futuros Paquetes

Antes de implementar cualquier paquete `VIN-XXX`, debe verificarse que:

1. La implementacion respeta esta constitucion.
2. No contradice la filosofia del producto.
3. No aumenta innecesariamente la carga cognitiva.
4. No introduce complejidad sin una justificacion clara.

Si una propuesta entra en conflicto con esta constitucion, la propuesta debe
cambiar. La constitucion representa la identidad permanente de Vinema.
