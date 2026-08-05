# Decisiones oficiales de Vinema

**Versión:** 1.0  
**Estado:** Vigente  
**Última actualización:** 2026-08-04  
**Propósito:** Registrar las decisiones consolidadas que explican la forma actual del producto y proteger su coherencia futura.

> Una decisión vigente solo puede modificarse mediante una nueva decisión que la reemplace explícitamente. Las decisiones anteriores no se eliminan: cambian de estado y conservan su trazabilidad.

## DEC-001 — Vinema no es una aplicación de notas

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

Vinema se define como una herramienta para ayudar a pensar y como motor de
acceso al conocimiento previamente capturado, no como una aplicación cuyo fin
sea almacenar notas.

### Motivo

El problema central que resuelve Vinema no es guardar información, sino reducir
el esfuerzo cognitivo necesario para volver a ella.

### Consecuencias

Las decisiones de producto deben evaluarse por su capacidad de mejorar captura,
memoria, acceso, relaciones y confianza, no por parecerse a gestores de notas.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `001-PRODUCT-VISION.md`
- `product/VIN-000-AUDITORIA-ESTADO-ACTUAL.md`

## DEC-002 — La unidad original es la captura

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

La entrada primaria de información en Vinema es la captura.

### Motivo

La captura permite que la fuente entre primero al sistema sin exigir que el
usuario decida una ubicación o estructura previa.

### Consecuencias

El lenguaje visible debe favorecer capturar sobre crear notas, clasificar o
archivar manualmente.

### Evidencia

- `002-LANGUAGE.md`
- `product/VIN-011-PARADIGMA-ORGANIZACION.md`
- `implementation/VIN-010C-primary-thinking-surface-redesign.md`

## DEC-003 — Las capturas no requieren título obligatorio

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

Una captura no requiere título obligatorio y no debe pedir al usuario nombrarla
para poder guardarla.

### Motivo

Pedir título introduce una decisión organizativa antes de que el usuario haya
terminado de capturar.

### Consecuencias

La identidad visible de una captura se deriva de su contenido y de sus conceptos
aceptados, no de un campo de título.

### Evidencia

- `implementation/VIN-011A-emergent-capture-identity.md`
- `product/VIN-020-1-ELIMINACION-TITULO-CAPTURAS.md`
- `000-VINEMA-CONSTITUTION.md`

## DEC-004 — El usuario no organiza antes de capturar

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

Vinema no debe exigir clasificación, carpeta, etiqueta, proyecto o contexto
antes de permitir capturar.

### Motivo

La organización previa aumenta fricción y obliga al usuario a anticipar cómo
recordará la información en el futuro.

### Consecuencias

La superficie principal debe permitir escribir y capturar primero; las
asociaciones, conceptos y relaciones pueden aparecer después o durante el flujo,
sin bloquearlo.

### Evidencia

- `product/VIN-011-PARADIGMA-ORGANIZACION.md`
- `001-PRODUCT-VISION.md`
- `implementation/VIN-010C-primary-thinking-surface-redesign.md`

## DEC-005 — Los conceptos emergen desde capturas

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Dominio

### Decisión

Los conceptos pueden surgir desde el texto capturado, desde selecciones
explícitas o desde patrones observables en la memoria.

### Motivo

Vinema debe permitir que la organización aparezca desde la evidencia capturada,
no desde una taxonomía diseñada por adelantado.

### Consecuencias

Los conceptos sugeridos no deben imponerse; el usuario conserva la decisión de
aceptarlos o confirmarlos.

### Evidencia

- `product/VIN-021-CONCEPTOS-EMERGENTES.md`
- `implementation/VIN-014A-semantic-phrase-extraction.md`
- `roadmap.md`

## DEC-006 — Concepto no equivale a etiqueta

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

Un concepto es un punto de entrada a fuentes relacionadas, no una etiqueta
decorativa ni una marca manual simple.

### Motivo

Vinema busca recuperar conocimiento desde pistas significativas, no construir
un sistema tradicional de tags.

### Consecuencias

Las relaciones entre captura y concepto deben mejorar acceso, memoria y
trazabilidad; no deben convertirse en mantenimiento administrativo.

### Evidencia

- `002-LANGUAGE.md`
- `001-PRODUCT-VISION.md`
- `VIN-000_GLOSARIO.md`

## DEC-007 — Contexto permanece como término transicional

**Fecha:** 2026-08-04  
**Estado:** En transición  
**Ámbito:** Dominio

### Decisión

`Contexto` permanece como término implementado y transicional frente a
`Concepto`.

### Motivo

El proyecto conserva superficies y modelos existentes basados en contextos,
pero la dirección conceptual consolidada usa conceptos como puntos de entrada.

### Consecuencias

La documentación oficial debe explicar la transición y evitar que `Contexto` se
interprete como carpeta, taxonomía obligatoria o ubicación física.

### Evidencia

- `002-LANGUAGE.md`
- `product/VIN-009-CONTEXT-VS-CONCEPT.md`
- `VIN-000_GLOSARIO.md`

## DEC-008 — Memoria reemplaza a Historial como nombre de producto

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La superficie de revisión y recuperación se llama Memoria, no Historial.

### Motivo

Memoria describe una red de capturas, conceptos y relaciones; Historial reduce
la experiencia a una lista cronológica.

### Consecuencias

La navegación visible debe usar Memoria para el destino de recuperación general.
Las rutas heredadas pueden permanecer por compatibilidad.

### Evidencia

- `002-LANGUAGE.md`
- `product/VIN-014-BASE-CONOCIMIENTO-ROBUSTA.md`
- `../README.md`

## DEC-009 — Memoria se navega principalmente mediante hilos

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La vista principal de Memoria se organiza mediante hilos derivados desde
identidades conceptuales compartidas.

### Motivo

Los hilos permiten reconocer continuidades de pensamiento sin fusionar capturas
ni convertirlas en carpetas.

### Consecuencias

Las capturas con la misma identidad emergente exacta se agrupan visualmente; las
capturas individuales permanecen visibles sin envoltorios innecesarios.

### Evidencia

- `002-LANGUAGE.md`
- `product/VIN-014-BASE-CONOCIMIENTO-ROBUSTA.md`

## DEC-010 — Tiempo no es navegación principal de Memoria

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

El modo Tiempo dejó de ser una navegación principal de Memoria.

### Motivo

La evolución de Memoria privilegia recuperar por contexto e identidad emergente
antes que por cronología plana.

### Consecuencias

La pantalla Memoria debe mantener búsqueda, hilos y navegación a capturas, sin
presentar un selector principal Hilos/Tiempo.

### Evidencia

- `product/VIN-014-BASE-CONOCIMIENTO-ROBUSTA.md`
- `002-LANGUAGE.md`

## DEC-011 — Los hilos son derivados y no persistidos

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

Los hilos de memoria son una vista derivada y no una entidad persistida.

### Motivo

La memoria persistida real se compone de capturas, conceptos y relaciones; los
hilos se reconstruyen desde esa evidencia.

### Consecuencias

No se deben crear modelos, stores ni contratos específicos para hilos salvo que
una decisión futura reemplace esta regla.

### Evidencia

- `product/VIN-014-BASE-CONOCIMIENTO-ROBUSTA.md`
- `implementation/VIN-013D-complete-user-memory-lifecycle.md`

## DEC-012 — El perfil de concepto es lectura viva

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

El detalle de un concepto funciona como perfil vivo de lectura continua.

### Motivo

Vinema primero observa cómo un concepto aparece en la memoria antes de
clasificarlo o asignarle un tipo.

### Consecuencias

El perfil muestra evidencia, recuerdos, conexiones, actividad y evolución
derivada; no introduce taxonomías, categorías ni relaciones persistidas
concepto-concepto.

### Evidencia

- `implementation/VIN-014C-concept-profiles.md`
- `implementation/VIN-011C-knowledge-base-surface.md`
- `002-LANGUAGE.md`

## DEC-013 — El mapa no pertenece al perfil individual de concepto

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

El mapa y la exploración gráfica no forman parte del perfil individual de un
concepto.

### Motivo

El perfil debe mantenerse como lectura viva de evidencia del concepto actual,
sin mezclarlo con una navegación global de conexiones.

### Consecuencias

La ruta de detalle de conceptos mantiene el perfil vivo; la exploración global de conexiones
vive en una superficie separada.

### Evidencia

- `implementation/VIN-011C-knowledge-base-surface.md`
- `002-LANGUAGE.md`

## DEC-014 — Explorar conocimiento es navegación global

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

Explorar conocimiento es una navegación global por conexiones entre conceptos.

### Motivo

La exploración global responde cómo está conectada la memoria, no qué evidencia
sostiene un concepto puntual.

### Consecuencias

El explorador debe mantenerse separado del perfil vivo y no debe confundirse
con una portada genérica ni con una carpeta visual.

### Evidencia

- `002-LANGUAGE.md`
- `implementation/VIN-011C-knowledge-base-surface.md`

## DEC-015 — La interfaz principal funciona como canvas de captura

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La ruta principal funciona como una superficie de pensamiento y captura.

### Motivo

El usuario debe poder escribir, recibir memoria sugerida, aceptar conceptos y
capturar sin pasar por formularios o pantallas administrativas.

### Consecuencias

Inicio no debe comportarse como dashboard, historial ni lista de notas. El
editor y las señales cognitivas son el centro de la experiencia.

### Evidencia

- `product/VIN-010A-primary-thinking-surface.md`
- `implementation/VIN-010C-primary-thinking-surface-redesign.md`
- `product/VIN-020-SUPERFICIE-UNICA.md`

## DEC-016 — La navegación principal usa destinos

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La navegación principal utiliza destinos estables: Capturar, Memoria, Conceptos
y Administrar.

### Motivo

La navegación describe lugares del producto; los verbos se reservan para
acciones reales.

### Consecuencias

No deben coexistir opciones duplicadas como Ver memoria, Explorar memoria o Ver
conceptos cuando llevan al mismo destino.

### Evidencia

- `002-LANGUAGE.md`
- `../README.md`

## DEC-017 — La complejidad técnica no se expone en la interfaz normal

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La complejidad técnica debe vivir en el sistema y no en la interfaz cotidiana.

### Motivo

Vinema debe reducir carga cognitiva; mostrar detalles internos en estados
normales debilita la confianza y desvía el foco del pensamiento.

### Consecuencias

La interfaz normal no debe mostrar cursores, identificadores, métricas internas
ni diagnósticos salvo cuando exista un problema que explicar.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `002-LANGUAGE.md`
- `implementation/VIN-007E2-sync-state-engine.md`

## DEC-018 — La simplicidad tiene prioridad

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

La simplicidad tiene prioridad sobre agregar funcionalidades.

### Motivo

Una función nueva solo es valiosa si ayuda sin aumentar innecesariamente la
carga cognitiva.

### Consecuencias

Las propuestas futuras deben justificar su costo cognitivo y pueden ser
descartadas aunque sean técnicamente posibles.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `001-PRODUCT-VISION.md`

## DEC-019 — Offline-first es requisito permanente

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

Vinema debe seguir funcionando sin conexión para usuarios con memoria local y
sesión previamente válida.

### Motivo

La continuidad del pensamiento no debe depender de la red.

### Consecuencias

Capturar, consultar memoria local y conservar cambios deben funcionar offline.
La conexión remota puede mejorar convergencia, pero no es requisito para el
núcleo local.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `002-LANGUAGE.md`
- `implementation/VIN-007C-domain-outbox-integration.md`

## DEC-020 — La sincronización tiende a una memoria lógica común

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

La sincronización debe permitir que la memoria converja entre dispositivos sin
poner en riesgo la información existente.

### Motivo

El producto debe preservar local-first y, a la vez, permitir continuidad
multi-dispositivo.

### Consecuencias

Las escrituras locales deben poder publicarse, recuperarse y aplicarse sin
sobrescrituras silenciosas.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `implementation/VIN-007D3-end-to-end-sync-validation.md`
- `implementation/VIN-007E1-automatic-sync-orchestrator.md`

## DEC-021 — Estado de la memoria es simple para el usuario

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

El Estado de la memoria debe responder de forma simple si la memoria es
confiable.

### Motivo

El usuario necesita confianza, no una consola de sincronización.

### Consecuencias

En estado normal el panel muestra estado, última verificación y acción Verificar
memoria. Los detalles aparecen solo ante problemas.

### Evidencia

- `002-LANGUAGE.md`
- `implementation/VIN-007E2-sync-state-engine.md`

## DEC-022 — Cada estado importante tiene una fuente de verdad

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

Los estados importantes de producto deben derivarse desde una única fuente de
verdad.

### Motivo

Estados calculados en lugares distintos pueden mostrar mensajes contradictorios
y erosionar la confianza.

### Consecuencias

Indicadores, paneles, aria-labels, severidades y acciones deben consumir el
mismo modelo derivado cuando representan el mismo estado.

### Evidencia

- `implementation/VIN-007E2-sync-state-engine.md`
- `002-LANGUAGE.md`

## DEC-023 — Los conflictos se representan por entidad lógica

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

Un conflicto pertenece a una entidad lógica, no a cada intento técnico de
sincronización.

### Motivo

Contar cada intento como conflicto multiplica ruido y puede crear ciclos de
reintento sin resolver el problema real.

### Consecuencias

Varias mutaciones conflictivas de la misma captura se consolidan como un solo
conflicto visible que requiere atención.

### Evidencia

- `implementation/VIN-007E2-sync-state-engine.md`
- `002-LANGUAGE.md`

## DEC-024 — El Motor Cognitivo propone, pero no impone

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

El Motor Cognitivo observa, deriva y sugiere, pero no decide por el usuario.

### Motivo

Vinema debe ayudar a recordar sin reemplazar el pensamiento ni imponer
organización automática.

### Consecuencias

Las sugerencias cognitivas deben ser aceptables, ignorables y respaldadas por
evidencia.

### Evidencia

- `cognitive-engine.md`
- `roadmap.md`
- `002-LANGUAGE.md`

## DEC-025 — Toda afirmación cognitiva conserva evidencia

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

Toda afirmación cognitiva mostrada por Vinema debe conservar evidencia trazable.

### Motivo

El producto no debe presentar conocimiento sin respaldo verificable en la
memoria capturada.

### Consecuencias

Perfiles, relaciones, patrones y sugerencias deben poder rastrearse hasta
capturas o relaciones existentes.

### Evidencia

- `cognitive-engine.md`
- `002-LANGUAGE.md`
- `001-PRODUCT-VISION.md`

## DEC-026 — La captura original permanece como fuente trazable

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

La fuente original debe mantenerse visible y trazable.

### Motivo

Vinema amplifica la memoria humana, pero no reemplaza ni oculta la fuente.

### Consecuencias

Sugerencias, perfiles, relaciones y conocimiento derivado no deben sustituir la
captura original.

### Evidencia

- `001-PRODUCT-VISION.md`
- `002-LANGUAGE.md`
- `VIN-000_GLOSARIO.md`

## DEC-027 — Seleccionar texto declara relevancia

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

La selección explícita de texto dentro de una captura se considera una señal de
relevancia declarada por el usuario.

### Motivo

La selección permite que el usuario indique directamente qué expresión debe
funcionar como concepto o asociación.

### Consecuencias

Capturar selección puede asociar un concepto existente, preparar un concepto
emergente o crear uno nuevo con confirmación, sin inferir tipos adicionales.

### Evidencia

- `roadmap.md`
- `cognitive-engine.md`
- `002-LANGUAGE.md`

## DEC-028 — Capturar selección crea o asocia conceptos

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** UX

### Decisión

Capturar selección crea o asocia conceptos; no convierte automáticamente la
selección en otros tipos de entidad.

### Motivo

El gesto debe seguir siendo simple y controlado.

### Consecuencias

La selección se resuelve contra identidad canónica y aliases; si no existe una
coincidencia válida, el usuario confirma antes de crear un concepto nuevo.

### Evidencia

- `roadmap.md`
- `cognitive-engine.md`
- `implementation/VIN-014B-concept-alias-resolution.md`

## DEC-029 — El mapa y sus posiciones son derivados

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Arquitectura

### Decisión

Las conexiones visuales del mapa y sus posiciones se derivan desde conceptos,
capturas y relaciones existentes.

### Motivo

La exploración visual debe ayudar a comprender conexiones sin crear una capa de
estado persistido independiente.

### Consecuencias

No se deben persistir posiciones visuales ni grafos como memoria primaria salvo
decisión futura explícita.

### Evidencia

- `implementation/VIN-011C-knowledge-base-surface.md`
- `implementation/VIN-011B-contextual-exploration-mode.md`
- `../src/app/concepts/explore/concept-knowledge-explorer-client.tsx`

## DEC-030 — La documentación oficial consolida los documentos VIN

**Fecha:** 2026-08-04  
**Estado:** Vigente  
**Ámbito:** Producto

### Decisión

La documentación oficial se organiza como una capa consolidada, mientras los
documentos VIN permanecen como evidencia histórica.

### Motivo

El proyecto necesita una fuente de verdad estable sin perder trazabilidad de las
decisiones que la originaron.

### Consecuencias

Los documentos oficiales pueden sintetizar conocimiento; los documentos VIN no
se borran al consolidarlo.

### Evidencia

- `000-VINEMA-CONSTITUTION.md`
- `001-PRODUCT-VISION.md`
- `002-LANGUAGE.md`

## Decisiones pendientes de consolidación

- Las vistas de lectura pueden conservar scroll natural. Falta una fuente
  documental oficial que lo formule como decisión vigente general, más allá del
  comportamiento actual de algunas pantallas.
- Vinema utilizará progresivamente su propio producto para gestionar su
  documentación y conocimiento interno. Falta respaldo dentro de la
  documentación consolidada actual.
- La documentación oficial forma parte de la Definition of Done para cambios
  relevantes. Falta una decisión vigente previa que lo establezca como regla de
  proceso.
