# VIN-014 - Memoria robusta

## 1. Objetivo

Fortalecer Memoria para que siga siendo usable cuando el volumen
de capturas crezca, sin introducir backend, IA, busqueda semantica, migraciones
ni cambios destructivos.

El paquete consolida una superficie capaz de:

- revisar capturas activas;
- buscar texto capturado;
- recorrer la memoria por hilos contextuales derivados;
- conservar una vista temporal cronologica;
- mostrar conteos;
- cargar contenido progresivamente;
- abrir, volver, editar y archivar;
- funcionar completamente offline sobre IndexedDB.

## 2. Estado previo

VIN-012 creo la superficie principal de captura y VIN-013 retiro formularios
heredados visibles. Memoria existia tecnicamente como `/notes`, pero aun
cargaba un lote fijo grande, no tenia busqueda integrada, no mostraba conteos ni
tenia una estrategia clara para crecer.

## 3. Decisiones

- `/memory` es la ruta visible de Memoria.
- `/notes` queda como ruta tecnica heredada de compatibilidad.
- Memoria ofrece dos modos: Hilos y Tiempo.
- Hilos es el modo inicial.
- Tiempo conserva la lista cronologica previa.
- No se renombran `Node`, stores IndexedDB ni rutas tecnicas.
- La Base muestra contenido activo, incluyendo datos historicos `NOTE/ORGANIZED`
  e `IDEA/INBOX`.
- Las capturas archivadas se excluyen por defecto.
- La busqueda integrada reutiliza `searchNodes`.
- Los hilos son una vista derivada desde `Node`, `Context` y
  `NodeContextRelation`; no se persisten ni se sincronizan como entidad propia.
- Las capturas siguen sin titulo editable.

## 4. Arquitectura de consultas

La Base usa `listKnowledgeCapturePage`, que:

1. consulta el repositorio por workspace;
2. filtra contenido activo recuperable;
3. ordena de forma estable;
4. devuelve un lote con `items`, `total` y `hasMore`.

La implementacion actual sigue leyendo los registros activos del workspace y
pagina en memoria. Es suficiente para el volumen local esperado del MVP. Cuando
el volumen crezca a miles o decenas de miles de capturas, convendra exponer una
consulta paginada real desde IndexedDB usando indices.

## 5. Criterio de orden

En modo Tiempo, el orden predeterminado es:

```text
mas reciente -> mas antigua
```

La fecha principal es `updatedAt`. Esta decision es explicita: si una captura se
edita, vuelve al inicio porque acaba de ser relevante para el usuario.

Si dos capturas tienen la misma fecha, se desempata por `id` en orden
lexicografico ascendente para evitar movimientos arbitrarios entre renderizados.

En modo Hilos, cada unidad visual se ordena por:

1. actividad mas reciente;
2. cantidad de capturas;
3. identidad estable derivada desde IDs canonicos.

## 6. Hilos de memoria

Un hilo de memoria agrupa capturas activas y no archivadas que comparten
exactamente el mismo conjunto de conceptos aceptados y activos.

La identidad del hilo se deriva de:

- IDs canonicos de conceptos;
- conceptos activos;
- aliases ya resueltos hacia su identidad canonica;
- IDs ordenados de forma estable.

No se agrupa por similitud textual, coincidencia parcial, orden de asociacion ni
relaciones semanticas inferidas.

Reglas visibles:

- solo se crea hilo cuando existen al menos dos capturas con la misma identidad;
- capturas sin conceptos permanecen como capturas individuales;
- identidades unicas permanecen como capturas individuales;
- las capturas dentro de un hilo se muestran de mas reciente a mas antigua;
- el hilo muestra inicialmente hasta dos capturas y permite expandir o contraer
  el resto sin navegar.

## 7. Tamano de lote

El lote base es:

```text
20 capturas
```

La UI usa `Cargar mas` para aumentar el numero visible en incrementos de 20.
Cuando no quedan mas resultados, muestra el final de Memoria.

## 8. Flujo de busqueda

La busqueda de `/memory` usa el parametro:

```text
?q=<consulta>
```

La consulta:

- ignora espacios laterales;
- trata consulta vacia como ausencia de busqueda;
- en modo Tiempo busca en contenido mediante la recuperacion local compartida;
- en modo Hilos busca en contenido, identidad emergente y aliases canonicos
  resueltos;
- excluye archivadas por defecto;
- ignora borradores porque los borradores no son nodos persistidos;
- muestra cantidad de resultados;
- permite limpiar busqueda;
- maneja caracteres especiales sin HTML inseguro.

El input aplica debounce de 300 ms para evitar reemplazos excesivos de URL.

## 9. Presentacion de resultados

En modo Tiempo, cada resultado muestra:

- identidad emergente si existe;
- fragmento compacto de contenido;
- fecha;
- enlace al detalle.

Cuando hay busqueda activa, las coincidencias se resaltan con componentes React
y `mark`, sin usar `dangerouslySetInnerHTML` ni modificar el contenido original.

En modo Hilos, cada hilo muestra:

- identidad emergente como encabezado;
- cantidad de capturas;
- fecha de ultima actividad;
- capturas contenidas, con expansion progresiva;
- enlace al detalle desde cada captura.

Las capturas individuales se mezclan en el mismo flujo, sin una seccion separada
de "otros".

## 10. Persistencia del contexto

La Base conserva el termino de busqueda en la URL. Al abrir una captura desde
resultados, el enlace incluye:

```text
returnTo=/memory?q=<consulta>
```

El detalle ya respeta `returnTo`, por lo que `Volver` restaura la busqueda activa.
No se implemento persistencia compleja de scroll; el estado minimo conservado es
la consulta y la ruta de retorno.

## 11. Detalle y edicion

El detalle sigue abriendo en modo lectura. Ahora muestra:

- contenido completo;
- fecha de creacion;
- fecha de actualizacion cuando difiere;
- `Editar`;
- `Volver`;
- `Archivar`.

La validacion existente impide consolidar una captura vacia. No se convierte una
captura vacia en eliminacion.

## 12. Archivado

Archivar conserva el registro, relaciones y datos locales. La Base y busqueda
activa excluyen capturas archivadas por defecto, por lo que una captura archivada
desaparece visualmente del listado activo al volver.

No se implementa papelera ni vista completa de archivo en este paquete.

## 13. Rendimiento

Mejoras realizadas:

- lote visible explicito;
- render progresivo con `Cargar mas`;
- orden estable centralizado;
- busqueda integrada sin duplicar motor;
- resultados de busqueda paginados visualmente.
- agrupacion derivada en memoria sin crear nuevas entidades persistidas.

Limitacion conocida: `searchNodes` y la paginacion actual aun dependen de cargar
el workspace local y filtrar en memoria. Es aceptable para el MVP local, pero
debera evolucionar con indices y paginacion real si el volumen crece de forma
significativa.

## 14. Archivos modificados

- `src/app/notes/page.tsx`
- `src/app/notes/knowledge-base-client.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/features/capture/list-knowledge-captures.ts`
- `src/features/memory/memory-threads.ts`
- `src/features/recovery/search-nodes.ts`
- `src/features/recovery/highlight-text.ts`
- `src/tests/knowledge-base.test.ts`
- `src/tests/memory-threads.test.ts`

## 15. Pruebas

Se agregaron pruebas para:

- orden estable;
- exclusion de archivadas;
- desempate por `id`;
- carga por lotes;
- ausencia de duplicados al cargar mas;
- deteccion de fin;
- busqueda con espacios laterales;
- busqueda en titulo y contenido;
- exclusion de archivadas en busqueda;
- conteo de resultados;
- `returnTo` con consulta activa;
- resaltado seguro con caracteres especiales;
- limpieza de busqueda sin resultados.
- clave estable por IDs canonicos ordenados;
- agrupacion por conjunto exacto de conceptos;
- no agrupar coincidencias parciales, identidades unicas ni capturas sin
  conceptos;
- exclusion de capturas archivadas;
- modo Hilos inicial;
- expansion y contraccion accesible de hilos;
- modo Tiempo como lista cronologica;
- busqueda de hilos por identidad emergente y aliases.

## 16. Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 17. Deuda tecnica

- `/notes` conserva compatibilidad tecnica heredada.
- `Node`, `NOTE`, `IDEA`, `INBOX` y `ORGANIZED` siguen en el dominio interno.
- La paginacion se realiza despues de leer el workspace local.
- No se conserva la posicion exacta de scroll al volver desde detalle.
- `/search` sigue existiendo como superficie de recuperacion heredada y avanzada.

## 18. Siguiente paquete recomendado

El siguiente paquete deberia decidir si `/search` se mantiene como busqueda
separada, se fusiona definitivamente con Memoria o queda como una
vista avanzada de recuperacion.
