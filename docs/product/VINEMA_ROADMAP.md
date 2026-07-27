VINEMA — Roadmap de Producto y Desarrollo

Estado: Documento rectorVersión: 1.0Fecha: 25 de julio de 2026

1. Propósito

Vinema no busca ser otro gestor de notas organizado mediante carpetas, cuadernos o etiquetas.

Su propósito es permitir que una persona:

capture información sin decidir dónde guardarla;

recupere conocimiento sin recordar su ubicación;

llegue a una nota a partir de fragmentos, asociaciones, conceptos, relaciones o tiempo;

reconstruya progresivamente lo que sabe sobre un tema.

La experiencia objetivo se resume así:

En Vinema, el usuario no debería preguntarse dónde guardar algo. Solo debería capturarlo. Recuperarlo debe ser responsabilidad del sistema.

2. Problema que se quiere resolver

Las aplicaciones tradicionales obligan a decidir una ubicación física o lógica:

Trabajo
└── Proveedores
    └── Mitcom
        └── Reuniones

Este modelo funciona mientras el usuario recuerda la jerarquía utilizada.

El problema aparece cuando recuerda solamente una parte:

una empresa;

una persona;

una fecha aproximada;

un tema;

una frase;

un lugar;

una decisión;

algo relacionado.

Vinema debe permitir recuperar la información desde cualquiera de esas entradas, sin exigir recordar el árbol donde fue archivada.

3. Cambio de paradigma

Modelo tradicional

Carpeta
→ Subcarpeta
→ Nota
→ Contenido

Modelo de Vinema

Pista recordada
→ Conceptos y relaciones
→ Fuentes relevantes
→ Contenido

La ubicación deja de ser importante.

La recuperación pasa a depender de:

contenido;

relaciones;

conceptos;

tiempo;

procedencia;

actividad;

coincidencia semántica.

4. Principios de producto

4.1 Capturar primero

Crear una nota debe ser inmediato.

El usuario no debe verse obligado a seleccionar:

carpeta;

cuaderno;

categoría;

proyecto;

proveedor;

tipo de contexto;

taxonomía.

Toda organización obligatoria antes de escribir se considera fricción.

4.2 Las notas son fuentes

Una nota contiene evidencia, contexto y contenido original.

Puede representar:

una reunión;

una idea;

una conversación;

una observación;

una decisión;

un aprendizaje;

una referencia;

una experiencia.

La nota se conserva como fuente completa, incluso cuando el sistema extraiga o relacione conceptos.

4.3 Los conceptos son puntos de entrada

Un concepto no debe comportarse como una carpeta.

Debe funcionar como una entrada desde la cual recuperar todo lo relacionado.

Ejemplos:

una persona;

una empresa;

una tecnología;

un lugar;

un proyecto;

un tema;

un objeto;

una idea.

Al abrir un concepto, el usuario no ve “archivos guardados dentro”, sino conocimiento asociado.

4.4 Las relaciones generan contexto

El valor no está solo dentro de cada nota.

También está en las conexiones entre:

notas;

conceptos;

personas;

eventos;

decisiones;

lugares;

periodos.

Las relaciones deben ayudar a recuperar información, no convertirse en un grafo decorativo que nadie comprende.

4.5 El tiempo es una dimensión principal

La fecha no debe ser solo metadata.

Debe permitir:

ubicar cuándo apareció un concepto;

revisar actividad reciente;

seguir evolución;

reconstruir secuencias;

comparar estados anteriores y posteriores.

4.6 La inteligencia propone, no impone

Vinema puede sugerir:

conceptos detectados;

posibles relaciones;

notas similares;

fuentes relacionadas;

coincidencias temporales.

Pero el sistema no debe crear una red caótica sin control del usuario.

5. Modelo conceptual inicial

El modelo debe mantenerse deliberadamente simple mientras se valida la experiencia.

Entidades mínimas

Note
Concept
NoteConceptRelation
ConceptRelation

También puede evaluarse un modelo unificado:

Node
NodeRelation

Esta decisión no debe tomarse por elegancia técnica, sino por la experiencia que permita construir.

Regla de diseño

No crear tipos especiales salvo que exista una necesidad real de interfaz, comportamiento o consulta.

Una reunión, una persona o un proyecto pueden usar plantillas o propiedades diferentes, pero no deben quedar encerrados en silos incompatibles.

6. Experiencia mínima objetivo

Captura

El usuario crea una nota y escribe normalmente.

Ejemplo:

Probé una receta de pan con masa madre.
La fermentación fue demasiado larga.
El horno estaba a 230 °C.
El resultado tuvo buena corteza, pero la miga quedó húmeda.

No elige una carpeta.

Recuperación posterior

Meses después busca:

pan húmedo

Vinema puede devolver:

la nota original;

conceptos relacionados;

otras notas sobre masa madre;

experiencias con fermentación;

resultados similares;

fechas relevantes.

El usuario llega a la información aunque no recuerde dónde la escribió ni el título exacto.

7. Roadmap

Fase 0 — Definición y protección del paradigma

Objetivo

Evitar que Vinema derive accidentalmente en otro gestor de notas jerárquico.

Entregables

Este documento rector.

Casos de uso de recuperación.

Glosario mínimo.

Decisiones arquitectónicas registradas.

Lista explícita de antiobjetivos.

Criterio de salida

El equipo puede explicar Vinema sin usar como idea principal:

carpetas;

cuadernos;

etiquetas;

árbol de navegación;

grafo visual.

Fase 1 — Captura libre y búsqueda confiable

Objetivo

Permitir guardar información sin decidir su ubicación y recuperarla mediante texto.

Funcionalidades

Crear, editar y eliminar notas.

Título opcional.

Contenido completo.

Fecha de creación y modificación.

Búsqueda por texto.

Búsqueda tolerante a coincidencias parciales.

Resultados ordenados por relevancia y tiempo.

Historial o notas recientes.

Acceso rápido a captura.

Todavía no incluir

IA generativa;

narrativas;

grafos complejos;

jerarquías configurables;

tipos ilimitados;

automatización agresiva.

Criterio de éxito

El usuario puede encontrar una nota recordando solo una frase, tema o fragmento.

Fase 2 — Conceptos como puntos de entrada

Objetivo

Permitir recuperar conocimiento desde conceptos sin convertirlos en etiquetas tradicionales.

Funcionalidades

Crear un concepto desde texto seleccionado.

Vincular una nota a uno o más conceptos.

Detectar menciones de conceptos existentes.

Abrir una página de concepto.

Mostrar notas relacionadas.

Mostrar actividad reciente.

Mostrar conceptos asociados.

Indicar por qué cada nota aparece relacionada.

Evitar duplicados mediante alias o coincidencias.

Experiencia esperada

Al abrir “masa madre”, el usuario ve:

notas donde aparece;

conceptos relacionados;

actividad reciente;

fuentes más relevantes;

evolución temporal básica.

No ve una carpeta llamada “masa madre”.

Criterio de éxito

El usuario puede comenzar desde una idea recordada y llegar a sus notas relevantes sin navegar una jerarquía.

Fase 3 — Relaciones y navegación asociativa

Objetivo

Permitir desplazarse entre piezas de conocimiento como ocurre al recordar.

Funcionalidades

Relacionar conceptos entre sí.

Relacionar notas entre sí.

Tipos de relación livianos y opcionales.

Navegación desde cualquier elemento relacionado.

Sugerencias de relaciones basadas en contenido.

Vista de contexto local.

Caminos de recuperación.

Ejemplos de relaciones

se relaciona con
ocurrió durante
menciona
depende de
contradice
continúa
originó
resuelve

No todas deben existir desde el inicio.

Restricción

No implementar un grafo global como interfaz principal.

El grafo solo se utilizará cuando ayude a comprender el contexto local.

Criterio de éxito

El usuario puede saltar desde una pista a otra hasta encontrar lo que buscaba.

Fase 4 — Recuperación combinada

Objetivo

Permitir búsquedas similares a la memoria humana, donde se combinan pistas incompletas.

Funcionalidades

Filtrar por conceptos.

Filtrar por fechas aproximadas.

Filtrar por personas o fuentes.

Combinar texto, tiempo y relaciones.

Consultas en lenguaje natural.

Resultados explicables.

Agrupación por relevancia.

Sugerencias de refinamiento.

Ejemplos

La nota donde hablé de una receta italiana antes de vacaciones.

Algo que aprendí sobre PostgreSQL cuando trabajaba en el inventario.

La conversación donde alguien recomendó un libro sobre hábitos.

Criterio de éxito

El usuario recupera información aunque no recuerde título, fecha exacta ni ubicación.

Fase 5 — Memoria temática

Objetivo

Construir una vista útil de todo lo que Vinema sabe sobre un tema.

Funcionalidades

Resumen estructurado de fuentes.

Última actividad.

Conceptos más relacionados.

Notas principales.

Línea temporal.

Cambios, decisiones o hitos detectados.

Fuentes contradictorias o desactualizadas.

Posibilidad de fijar elementos relevantes.

Importante

Esta fase no debe inventar una narrativa.

Debe organizar evidencia existente.

Criterio de éxito

Abrir un concepto permite comprender rápidamente el contexto acumulado sin revisar todas las notas.

Fase 6 — Reconstrucción temporal y narrativa

Objetivo

Ayudar a comprender cómo evolucionó un tema.

Funcionalidades posibles

Línea narrativa basada en fechas y fuentes.

Evolución de ideas.

Decisiones y consecuencias.

Antes y después.

Resúmenes por periodo.

Diferencias entre versiones.

Preguntas y respuestas sobre la historia del concepto.

Condición previa

Solo se desarrollará cuando:

exista suficiente información real;

las relaciones sean confiables;

la recuperación básica funcione bien;

las respuestas puedan citar sus fuentes;

el usuario pueda revisar y corregir el resultado.

Criterio de éxito

La narrativa reduce trabajo de revisión sin reemplazar ni distorsionar las fuentes.

8. Antiobjetivos

Vinema no debe convertirse en:

un sistema de carpetas disfrazado;

un administrador de taxonomías;

una aplicación donde todo deba etiquetarse manualmente;

un grafo visual como fin en sí mismo;

un chatbot que responde sin mostrar fuentes;

un sistema que clasifica automáticamente todo sin control;

una herramienta que obliga a mantener estructuras complejas;

un gestor documental empresarial genérico;

una copia de Obsidian, OneNote, Notion o Apple Notes con otro diseño.

9. Preguntas para comparar cada avance

Antes de aprobar una funcionalidad, responder:

¿Reduce la necesidad de decidir dónde guardar algo?

¿Ayuda a recuperar información desde una pista incompleta?

¿Mantiene visible la fuente original?

¿Aporta una relación útil o solo más metadata?

¿Exige mantenimiento manual constante?

¿Funciona sin que el usuario comprenda el modelo de datos?

¿Acerca Vinema a una memoria navegable?

¿O lo acerca a otro archivador digital?

Si una funcionalidad falla repetidamente estas preguntas, debe simplificarse o descartarse.

10. Métricas de producto

Captura

tiempo para crear una nota;

cantidad de decisiones previas a escribir;

porcentaje de notas guardadas sin organización manual.

Recuperación

porcentaje de búsquedas exitosas;

tiempo hasta encontrar la fuente correcta;

cantidad de intentos necesarios;

búsquedas realizadas con información incompleta.

Relaciones

porcentaje de relaciones realmente utilizadas;

sugerencias aceptadas;

relaciones ignoradas o eliminadas;

conceptos duplicados.

Confianza

frecuencia con que el usuario abre la fuente original;

correcciones realizadas a sugerencias;

respuestas con trazabilidad suficiente.

11. Orden de prioridad

1. Capturar
2. Buscar
3. Encontrar
4. Relacionar
5. Comprender
6. Reconstruir

No invertir este orden.

Una narrativa espectacular no compensa una búsqueda mediocre.

Un grafo impresionante no compensa una captura incómoda.

Una arquitectura flexible no compensa una experiencia confusa.

12. Estado de implementacion reciente

VIN-007 reviso el modelo de recuperacion, VIN-008 implemento la primera linea
base de busqueda textual local y VIN-008A acepto el incremento con pendientes no
bloqueantes. Vinema ya puede recuperar fuentes por titulo, contenido y contextos
asociados sin servicios remotos ni cambios de esquema.

La siguiente prioridad no debe ser ampliar los tipos de contexto. Debe ser
mejorar la explicabilidad de resultados, la ergonomia de refinamiento y la
validacion de que el usuario puede encontrar fuentes con pistas incompletas.

13. Próximo paso de desarrollo

Continuar desde la Fase 1 ya iniciada por VIN-008.

La siguiente tarea no debe ser ampliar los tipos de contexto.

Debe ser:

un incremento posterior a VIN-008 enfocado en resultados explicables y
refinamiento liviano.

Objetivo

Mejorar la utilidad de la recuperacion local sin introducir IA, embeddings,
grafos ni jerarquias configurables.

Trabajo esperado

mostrar mejor por que aparece cada resultado;

mejorar extractos y senales;

permitir refinamiento simple por contexto o fecha;

validar busquedas con informacion incompleta;

mantener la fuente original siempre visible.

Resultado

Una busqueda local mas clara y confiable, sin convertir Vinema en un sistema de
filtros ni taxonomias manuales.

14. Regla final

Vinema no organiza conocimiento según dónde fue guardado. Lo recupera según cómo puede ser recordado.
