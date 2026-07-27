# VIN-019.2 - Correccion runtime de asociaciones

## Sintoma

En la superficie principal `/`, al escribir:

```text
Después de muchas reuniones me cuesta concentrarme.
```

la interfaz mostraba:

```text
No pude buscar asociaciones en este momento.
```

Eso indicaba que `useAssociationSuggestions` entraba en estado de error durante
la ejecucion real.

## Excepcion

La excepcion reproducida para el esquema historico fue:

```text
NotFoundError
The operation failed because the requested database object could not be found.
```

La etapa afectada era la carga de relaciones en:

```text
IndexedDbNodeContextRelationRepository.listByWorkspace()
```

El acceso usaba el indice:

```text
by-workspace
```

La ubicacion de codigo afectada era:

```text
src/infrastructure/context/indexed-db-node-context-relation-repository.ts
```

La forma anterior de `listByWorkspace()` llamaba `getAllFromIndex()` con el
indice `by-workspace`. En bases historicas sin ese indice, IndexedDB rechazaba
la operacion con `NotFoundError`.

## Causa raiz

VIN-019 agrego `listByWorkspace` para relaciones usando el indice
`by-workspace`. En una instalacion real, la base `vinema` podia estar ya en
version 4 antes de que ese indice existiera. Como no se subio version ni se
ejecuto `upgrade`, IndexedDB no agrego el indice faltante.

Las pruebas pasaban porque creaban bases limpias con el esquema actual. El
navegador usaba una base historica version 4 sin ese indice.

## Estado posterior a VIN-019.3

VIN-019.2 corrigio el caso de store existente con indice `by-workspace` ausente.
Despues se confirmo otro caso historico: bases version 4 donde el object store
`node_context_relations` no existia. Ese segundo caso no podia resolverse con
`getAll()` y se corrige mediante la migracion versionada de `VIN-019.3`.

## Diferencias entre tests y runtime

- Tests: esquema creado desde cero con todos los indices actuales.
- Runtime: base version 4 ya existente, sin upgrade y con indices incompletos.
- Tests: relaciones tipadas y controladas.
- Runtime: relaciones historicas sin `relationType` ni `relatedNodeId`.

## Solucion

El repositorio real de relaciones ya no depende de indices para lecturas
basicas. Usa `getAll()` y filtra en memoria para:

- `getByNodeAndContext`;
- `listByNodeId`;
- `listByContextId`;
- `listByWorkspace`.

Esto mantiene compatibilidad con bases version 4 historicas sin subir version ni
crear stores nuevos.

## Compatibilidad historica

El motor ahora tolera:

- relaciones sin `relationType`;
- relaciones sin `relatedNodeId`;
- relaciones de contexto antiguas;
- referencias huerfanas;
- capturas con datos invalidos;
- contenido no string;
- ids vacios.

Las relaciones antiguas se tratan como contexto y no alimentan el grafo de
asociaciones captura-captura.

## Manejo de estados

`useAssociationSuggestions` ahora distingue:

- `idle`;
- `loading`;
- `ready`;
- `error`.

Tambien descarta respuestas obsoletas mediante contador de solicitud para evitar
que una consulta vieja sobrescriba una mas reciente.

## Resiliencia

La carga textual y el enriquecimiento relacional se separaron:

```text
capturas activas -> sugerencias textuales
relaciones -> enriquecimiento opcional
```

Si fallan las relaciones, se registra el error en desarrollo y las sugerencias
textuales siguen funcionando.

Si falla la consulta completa, la UI muestra:

```text
No pude buscar asociaciones.
Reintentar
```

El reintento conserva texto y selecciones.

## Logging de desarrollo

En desarrollo se registra:

```text
[associations] suggestion query failed
```

Incluye codigo, etapa, nombre, mensaje, stack, longitud de consulta, capturas
indexadas y relaciones cargadas. No registra contenido completo de capturas.

## Validacion visual

Se levanto Next en:

```text
http://localhost:3001
```

El sandbox normal no podia conectar al puerto; con permisos elevados se verifico
respuesta HTTP 200 para `/`.

Tambien se reviso que no quedaran procesos escuchando en `3000` ni en `3001`
despues de detener el servidor.

No se uso Playwright. La interaccion visual completa queda cubierta por pruebas
de render jsdom y por los casos reproducibles exactos del paquete.

## Pruebas

Se agrego cobertura para:

- store version 4 historico sin indice `by-workspace`;
- relaciones antiguas sin campos nuevos;
- relaciones sin `relatedNodeId`;
- capturas invalidas;
- fallo de enriquecimiento relacional sin bloquear sugerencias;
- fallo de consulta con accion `Reintentar`;
- flujo reuniones/concentracion;
- preservacion de texto durante reintento.

Resultado final:

```text
20 archivos de prueba pasaron.
148 pruebas pasaron.
```

## Validaciones tecnicas

```text
npm run lint      OK
npm run typecheck OK
npm run test      OK
npm run build     OK
```

El build estatico genero correctamente `/`.

## Limitaciones restantes

- La validacion en navegador interactivo no se realizo por falta de herramienta
  permitida distinta de Playwright.
- Las lecturas relacionales filtran en memoria para compatibilidad. Si el volumen
  de relaciones crece mucho, convendra una migracion versionada para indices.
