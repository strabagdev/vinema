# VIN-008A - Revision de aceptacion de recuperacion local

## 1. Alcance revisado

Esta revision valida la linea base de recuperacion local implementada en
VIN-008. El alcance se limita a busqueda textual offline sobre fuentes locales,
contextos asociados, navegacion hacia detalle y cierre documental.

No se revisan ni implementan IA, embeddings, grafos, nuevos tipos de contexto,
sincronizacion ni optimizaciones de indexacion.

## 2. Matriz de aceptacion

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Coincidencia por titulo | CUMPLE | `searchNodes` y pruebas de recuperacion. |
| Coincidencia por contenido | CUMPLE | Prueba con extracto relevante. |
| Coincidencia por contexto | CUMPLE | Pruebas con `NodeContextRelation`. |
| Normalizacion de mayusculas | CUMPLE | `normalizeRecoveryText`. |
| Normalizacion de tildes | CUMPLE | `normalizeRecoveryText`. |
| Normalizacion de espacios | CUMPLE | `normalizeRecoveryText`. |
| Consulta vacia | CUMPLE | Devuelve lista vacia sin ruido. |
| Cero resultados | CUMPLE | Estado UI y prueba de dominio. |
| Ordenamiento | CUMPLE | Ranking por titulo, contexto, contenido y fecha. |
| Extracto | CUMPLE | Extracto cerca de coincidencia o fallback legible. |
| Exclusion de archivadas/eliminadas | CUMPLE | Repositorio filtra y pruebas lo confirman. |
| Fuente reconocible | CUMPLE | Titulo visible con fallback de display title. |
| Razon del resultado | CUMPLE | `matchedFields` muestra titulo, contexto o contenido. |
| Contextos asociados visibles | CUMPLE | Resultados muestran chips enlazables. |
| Fecha de modificacion | CUMPLE | Se muestra `updatedAt` formateado. |
| Apertura de resultado | CUMPLE | Enlace a `/notes/detail?nodeId=...`. |
| Modo lectura inicial | CUMPLE | Detalle de nota conserva lectura inicial. |
| Editar explicito | CUMPLE | Accion `Editar` visible en detalle. |
| Volver visible | CUMPLE | Detalle de nota y contexto tienen `Volver`. |
| Preservacion de `/search?q=...` | CUMPLE | `returnTo` se propaga desde resultados. |
| `returnTo` invalido o externo | CUMPLE | Se rechazan URLs absolutas, protocolos y `//host`. |
| Contextos seleccionables | CUMPLE | Contextos de resultado enlazan a detalle. |
| Acceso a fuentes del contexto | CUMPLE | Detalle de contexto lista notas relacionadas. |
| Volver sin perder recorrido | CUMPLE | Busqueda -> contexto -> nota -> contexto -> busqueda. |
| `/search` en service worker | CUMPLE | `public/sw.js` incluye la ruta. |
| Sin llamadas remotas obligatorias | CUMPLE | Busqueda usa IndexedDB/repositorios locales. |
| Cache antigua | CUMPLE PARCIALMENTE | La ruta esta en precache nuevo; una cache antigua requiere activacion del SW actualizado. |
| Validacion manual offline | NO APLICA | No se uso navegador ni Playwright por instruccion explicita. |
| Fuente nueva aparece | CUMPLE | Busqueda consulta repositorio actual en cada ejecucion. |
| Fuente editada actualiza resultado | CUMPLE | Prueba con `updateNode`. |
| Relacion agregada actualiza resultado | CUMPLE | Prueba agregada en VIN-008A. |
| Relacion retirada deja de coincidir | CUMPLE | Prueba agregada en VIN-008A. |
| Fuente archivada/eliminada desaparece | CUMPLE | Prueba agregada en VIN-008. |
| Rendimiento razonable inicial | CUMPLE | Filtrado directo adecuado para volumen local inicial. |

## 3. Criterios cumplidos

VIN-008 cumple la definicion funcional de una linea base de recuperacion local:
permite encontrar notas activas por pistas textuales, explicar por que aparecen
y navegar hacia la fuente original sin depender de red.

Tambien cumple la decision de no ampliar taxonomias ni introducir infraestructura
prematura. Los contextos siguen siendo relaciones reutilizadas, no carpetas ni
nuevas jerarquias.

## 4. Criterios parciales

La compatibilidad offline es tecnica, no validacion manual completa. `/search`
esta incluida en el service worker y el flujo no requiere llamadas remotas, pero
no se realizo una prueba manual en navegador con red desactivada.

Una cache antigua puede no contener `/search` hasta que el nuevo service worker
se instale y active. No se implemento una estrategia adicional de versionado de
cache porque excede el cierre de VIN-008A.

## 5. Correcciones realizadas

- Se endurecio la validacion de `returnTo` para aceptar solo rutas internas
  seguras.
- Se rechazo `//host`, URLs absolutas y protocolos como `javascript:`.
- Se preservo el recorrido busqueda -> contexto -> nota -> contexto -> busqueda.
- Se agregaron pruebas de relacion contextual agregada y retirada.
- Se agrego prueba de resultado con multiples campos coincidentes.
- Se agregaron pruebas de `returnTo` interno valido y externo rechazado.

## 6. Validaciones automatizadas

Ejecutadas durante VIN-008A:

- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run build`

## 7. Validaciones manuales realizadas

No se realizo validacion manual en navegador. La instruccion vigente del usuario
indica no usar Playwright salvo solicitud explicita, y no se abrio navegador
durante esta revision.

## 8. Validaciones manuales pendientes

- Abrir `/search` en una instalacion PWA precacheada.
- Desactivar red y confirmar carga de la superficie.
- Crear una nota desde la UI y buscarla.
- Abrir resultado, volver a busqueda y repetir desde contexto relacionado.
- Confirmar comportamiento tras actualizacion de service worker desde una cache
  antigua.

## 9. Rendimiento

La complejidad aproximada es lineal sobre las fuentes activas del workspace:
`O(n * r)`, donde `n` es la cantidad de nodos y `r` el costo de cargar relaciones
y contextos asociados.

El filtrado directo puede dejar de ser suficiente cuando:

- la apertura de resultados sea perceptiblemente lenta;
- existan miles de fuentes activas con contenido largo;
- la carga de relaciones por nodo domine el tiempo de busqueda;
- las pruebas de rendimiento locales muestren latencia incompatible con escribir
  y recuperar sin esfuerzo.

La senal concreta para justificar un indice derivado sera una degradacion
observada en busquedas reales o pruebas locales representativas, no una
optimizacion anticipada.

## 10. Limitaciones

- No hay resaltado visual de terminos.
- No hay sinonimos ni busqueda semantica.
- No se buscan fuentes archivadas.
- No hay filtros por fecha o tipo de contexto.
- No hay medicion de exito de recuperacion.

## 11. Riesgos

- El ranking simple puede ordenar mal consultas ambiguas.
- El recorrido por contexto todavia depende de una pagina de contexto pensada
  originalmente para gestion minima.
- La explicacion `matchedFields` es util, pero todavia poco granular.

## 12. Conclusion formal

Estado: ACEPTADO CON PENDIENTES NO BLOQUEANTES.

VIN-008 cumple la linea base de recuperacion local y queda cerrado como
incremento funcional. Los pendientes restantes corresponden a validacion manual
offline, mejoras de explicabilidad y futura evaluacion de rendimiento, ninguno
de los cuales bloquea el cierre de VIN-008.
