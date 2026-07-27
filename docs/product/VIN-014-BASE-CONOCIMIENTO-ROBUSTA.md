# VIN-014 - Base de Conocimiento robusta

## 1. Objetivo

Fortalecer la Base de Conocimiento para que siga siendo usable cuando el volumen
de capturas crezca, sin introducir backend, IA, busqueda semantica, migraciones
ni cambios destructivos.

El paquete consolida una superficie capaz de:

- revisar capturas activas;
- buscar texto capturado;
- mostrar conteos;
- cargar contenido progresivamente;
- abrir, volver, editar y archivar;
- funcionar completamente offline sobre IndexedDB.

## 2. Estado previo

VIN-012 creo la superficie principal de captura y VIN-013 retiro formularios
heredados visibles. La Base de Conocimiento ya existia como `/notes`, pero aun
cargaba un lote fijo grande, no tenia busqueda integrada, no mostraba conteos ni
tenia una estrategia clara para crecer.

## 3. Decisiones

- `/notes` sigue siendo la ruta tecnica heredada de Base de Conocimiento.
- No se renombran `Node`, stores IndexedDB ni rutas tecnicas.
- La Base muestra contenido activo, incluyendo datos historicos `NOTE/ORGANIZED`
  e `IDEA/INBOX`.
- Las capturas archivadas se excluyen por defecto.
- La busqueda integrada reutiliza `searchNodes`.
- Contextos y relaciones no se muestran en la Base principal.
- El titulo sigue siendo opcional.

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

El orden predeterminado es:

```text
mas reciente -> mas antigua
```

La fecha principal es `updatedAt`. Esta decision es explicita: si una captura se
edita, vuelve al inicio porque acaba de ser relevante para el usuario.

Si dos capturas tienen la misma fecha, se desempata por `id` en orden
lexicografico ascendente para evitar movimientos arbitrarios entre renderizados.

## 6. Tamano de lote

El lote base es:

```text
20 capturas
```

La UI usa `Cargar mas` para aumentar el numero visible en incrementos de 20.
Cuando no quedan mas resultados, muestra el final de la Base de Conocimiento.

## 7. Flujo de busqueda

La busqueda de `/notes` usa el parametro:

```text
?q=<consulta>
```

La consulta:

- ignora espacios laterales;
- trata consulta vacia como ausencia de busqueda;
- busca en titulo y contenido;
- no exige titulo;
- excluye archivadas por defecto;
- ignora borradores porque los borradores no son nodos persistidos;
- muestra cantidad de resultados;
- permite limpiar busqueda;
- maneja caracteres especiales sin HTML inseguro.

El input aplica debounce de 300 ms para evitar reemplazos excesivos de URL.

## 8. Presentacion de resultados

Cada resultado muestra:

- titulo solo si existe;
- fragmento compacto de contenido;
- fecha;
- enlace al detalle.

Cuando hay busqueda activa, las coincidencias se resaltan con componentes React
y `mark`, sin usar `dangerouslySetInnerHTML` ni modificar el contenido original.

## 9. Persistencia del contexto

La Base conserva el termino de busqueda en la URL. Al abrir una captura desde
resultados, el enlace incluye:

```text
returnTo=/notes?q=<consulta>
```

El detalle ya respeta `returnTo`, por lo que `Volver` restaura la busqueda activa.
No se implemento persistencia compleja de scroll; el estado minimo conservado es
la consulta y la ruta de retorno.

## 10. Detalle y edicion

El detalle sigue abriendo en modo lectura. Ahora muestra:

- titulo solo si existe o fallback visible;
- contenido completo;
- fecha de creacion;
- fecha de actualizacion cuando difiere;
- `Editar`;
- `Volver`;
- `Archivar`.

La validacion existente impide consolidar una captura vacia. No se convierte una
captura vacia en eliminacion.

## 11. Archivado

Archivar conserva el registro, relaciones y datos locales. La Base y busqueda
activa excluyen capturas archivadas por defecto, por lo que una captura archivada
desaparece visualmente del listado activo al volver.

No se implementa papelera ni vista completa de archivo en este paquete.

## 12. Rendimiento

Mejoras realizadas:

- lote visible explicito;
- render progresivo con `Cargar mas`;
- orden estable centralizado;
- busqueda integrada sin duplicar motor;
- resultados de busqueda paginados visualmente.

Limitacion conocida: `searchNodes` y la paginacion actual aun dependen de cargar
el workspace local y filtrar en memoria. Es aceptable para el MVP local, pero
debera evolucionar con indices y paginacion real si el volumen crece de forma
significativa.

## 13. Archivos modificados

- `src/app/notes/page.tsx`
- `src/app/notes/knowledge-base-client.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/features/capture/list-knowledge-captures.ts`
- `src/features/recovery/search-nodes.ts`
- `src/features/recovery/highlight-text.ts`
- `src/tests/knowledge-base.test.ts`

## 14. Pruebas

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

## 15. Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 16. Deuda tecnica

- `/notes` conserva nombre tecnico heredado.
- `Node`, `NOTE`, `IDEA`, `INBOX` y `ORGANIZED` siguen en el dominio interno.
- La paginacion se realiza despues de leer el workspace local.
- No se conserva la posicion exacta de scroll al volver desde detalle.
- `/search` sigue existiendo como superficie de recuperacion heredada y avanzada.

## 17. Siguiente paquete recomendado

El siguiente paquete deberia decidir si `/search` se mantiene como busqueda
separada, se fusiona definitivamente con Base de Conocimiento o queda como una
vista avanzada de recuperacion.
