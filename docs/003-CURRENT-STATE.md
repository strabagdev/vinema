# CURRENT STATE

Versión: 1.0

Estado: Oficial

Última actualización: 2026-08-05

Último commit relevante: `a3adcfb feat: refine user experience and knowledge capture`

Propósito: Registrar la fotografía oficial del estado real de Vinema hoy.

---

# Resumen Ejecutivo

Vinema es una aplicación personal de conocimiento, local-first y offline-first.
La experiencia principal gira alrededor de una superficie de captura mínima.
El usuario puede capturar texto sin título, recuperar memoria mientras escribe y
relacionar capturas con conceptos aceptados.
Memoria existe como superficie para buscar, ver hilos y abrir capturas.
Conceptos existe como índice de conceptos y como perfil vivo por concepto.
El Motor Cognitivo v1 está implementado como derivación local y determinista.
La autenticación, sesión persistente y sincronización remota existen.
El Estado de la memoria permite verificar integridad, pendientes y conflictos.
El branding oficial está integrado en header, login y registro.
La documentación oficial está en consolidación.

---

# Estado General

Producto

Estado: MVP operativo.

Motor Cognitivo

Estado: Operativo.

Versión: v1.

Captura

Estado: Operativa.

Memoria

Estado: Operativa, en refinamiento.

Conceptos

Estado: Operativo.

Explorador de conocimiento

Estado: MVP operativo.

Offline-first

Estado: Operativo.

Sincronización

Estado: Operativa, en refinamiento.

Estado de la memoria

Estado: Operativo, en refinamiento.

Branding

Estado: Integrado.

Login

Estado: Operativo.

Mobile

Estado: En refinamiento.

Documentación

Estado: En consolidación.

---

# Capacidades actuales

- Captura de texto desde la superficie principal.
- Captura sin título editable.
- Autosave de borrador de captura.
- Captura mediante acción explícita.
- Captura de selección para convertir texto seleccionado en concepto aceptado.
- Resolución de conceptos existentes por identidad canónica, alias y siglas.
- Creación confirmada de conceptos nuevos desde selección o sugerencias
  emergentes.
- Normalización visual de conceptos nuevos.
- Filtrado de palabras vacías y conceptos espurios en sugerencias.
- Recuperación de memorias sugeridas mientras se escribe.
- Navegación desde memorias sugeridas hacia el detalle de captura.
- Sugerencia de conceptos existentes y emergentes mientras se escribe.
- Selección de conceptos para asociarlos a una captura.
- Identidad emergente de captura derivada desde conceptos aceptados.
- Memoria en `/memory` con búsqueda integrada.
- Visualización de Memoria por hilos derivados.
- Capturas individuales cuando no forman hilo.
- Navegación al detalle de captura.
- Edición, autosave, archivo y restauración de capturas.
- Archivo de capturas en `/memory/archive`.
- Índice de conceptos en `/concepts`.
- Perfil vivo de concepto en `/concepts/detail`, con ficha editorial y pestañas
  de Recuerdos, Relaciones, Evolución y Patrones.
- Explorador de conocimiento en `/concepts/explore`.
- Relaciones derivadas entre conceptos por evidencia compartida.
- Motor Cognitivo v1 con patrones conductuales, comprensión semántica,
  evolución de memoria, sugerencias de conocimiento y orquestación.
- Login y registro con sesión persistente.
- Restauración de sesión local.
- Renovación silenciosa de sesión.
- Funcionamiento offline para memoria local previamente disponible.
- Outbox persistente de mutaciones locales.
- Push y pull de sincronización.
- Aplicación de cambios remotos.
- Invalidación de vistas después de cambios locales o remotos.
- Estado de la memoria con verificación manual.
- Reconciliación de memoria.
- Ledger local de acknowledgements de sincronización.
- Ciclo de vida de conflictos por entidad lógica.
- Resolución inicial de conflictos de captura.
- Feedback visual central para captura, sincronización, offline y errores.
- Branding oficial mediante monograma y wordmark.
- Experiencia móvil con composer inferior persistente.

---

# Arquitectura vigente

Vinema mantiene una base web, PWA y escritorio desde un mismo repositorio.

El frontend usa una aplicación web con rutas estáticas y superficies cliente para
trabajar con memoria local. La persistencia operativa de la memoria vive en
almacenamiento local del navegador. La memoria primaria está compuesta por
capturas, conceptos y relaciones.

La sincronización usa una API remota separada. El cliente escribe primero en
local, encola mutaciones y luego sincroniza mediante ciclos de push y pull. La
API remota persiste cambios para convergencia entre clientes.

El funcionamiento offline es parte del comportamiento normal: capturar, leer y
editar memoria local no requiere conexión inmediata. La sincronización retoma
cuando hay sesión y conectividad disponibles.

La autenticación usa sesión persistente, restauración local, renovación
silenciosa y logout coordinado.

El Motor Cognitivo no persiste conocimiento nuevo como motor separado. Deriva
perfiles, relaciones, patrones, evolución y sugerencias desde capturas,
conceptos y relaciones existentes.

---

# Pendientes reales

- Consolidar la documentación oficial iniciada en `000`, `001`, `002` y este
  documento.
- Crear un registro oficial de decisiones vigentes.
- Resolver la convivencia documental entre documentos oficiales nuevos y
  documentos VIN históricos.
- Mantener alineado `README.md` con la documentación oficial nueva.
- No hay otro pendiente funcional aceptado que este documento deba presentar
  como operativo.

---

# Últimos hitos

- Superficie principal centrada en captura.
- Captura sin título y con identidad emergente.
- Memoria como superficie de búsqueda y hilos.
- Conceptos con identidad canónica y aliases.
- Captura de selección.
- Perfil vivo de concepto.
- Explorador de conocimiento.
- Motor Cognitivo v1.
- Sincronización autenticada con reconciliación.
- Branding oficial integrado.

---

# Documentos relacionados

- `docs/000-VINEMA-CONSTITUTION.md`
- `docs/001-PRODUCT-VISION.md`
- `docs/002-LANGUAGE.md`
