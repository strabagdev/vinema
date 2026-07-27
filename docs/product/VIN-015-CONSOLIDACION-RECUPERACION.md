# VIN-015 - Consolidacion de recuperacion

## 1. Objetivo

Consolidar toda la recuperacion textual dentro de la Base de Conocimiento y
retirar `/search` como superficie paralela visible.

La experiencia principal queda reducida a:

```text
Capturar -> Base de Conocimiento -> Buscar -> Abrir -> Editar
```

No se renombraron `Node`, stores IndexedDB ni rutas tecnicas de detalle. No se
introdujo backend, IA, embeddings, busqueda semantica ni migraciones.

## 2. Auditoria de `/search`

### Enlaces y navegacion

Se detecto una entrada principal `Buscar` en el sidebar apuntando a `/search`.
Tambien existian referencias en pruebas, service worker y README.

### Parametros

`/search` usaba el parametro `q`. La Base de Conocimiento robusta de VIN-014 ya
usa el mismo parametro en:

```text
/notes?q=<consulta>
```

### Logica exclusiva

`/search` tenia una pantalla completa propia con resultados, conteo y enlaces a
contextos. La recuperacion textual principal ya esta cubierta por `/notes`.

La utilidad compartida `searchNodes` se conserva. La pantalla especifica
`SearchClient` se retiro.

### Diferencias encontradas

- `/search` mostraba contextos en resultados.
- `/notes` muestra resultados centrados en capturas, sin contextos ni
  organizacion avanzada.
- `/notes` agrega carga progresiva, resaltado seguro y estados robustos de
  Base.

La diferencia de contextos no se traslado porque VIN-015 consolida la
recuperacion principal en Base de Conocimiento y deja organizacion avanzada fuera
del flujo principal.

## 3. Estrategia de redireccion

La ruta `/search` se mantiene como compatibilidad estatica y redirige en cliente
a la Base:

```text
/search -> /notes
/search?q=mitcom -> /notes?q=mitcom
```

La redireccion usa `router.replace`, evita crear historial extra y conserva
caracteres especiales mediante el mismo helper de rutas de recuperacion.

## 4. Parametros conservados

Se conserva:

- `q`

Una consulta vacia redirige a `/notes`. Una consulta con espacios laterales se
normaliza al construir el destino.

## 5. Cambios de navegacion

La navegacion principal queda en:

- `Capturar`
- `Base de Conocimiento`

Se retiro `Buscar` del sidebar. El header mantiene una accion rapida que lleva a
`/notes#knowledge-search`, no a `/search`.

## 6. Cambios en Inicio

La busqueda de `/` se mantiene como busqueda rapida local:

- muestra resultados breves;
- permite abrir un resultado;
- no enlaza a `/search`;
- cuando hay mas resultados, deriva a `/notes?q=<consulta>`.

No evoluciona como segunda Base de Conocimiento.

## 7. Service worker

`/search` se retiro del precache principal.

Para compatibilidad offline razonable, el service worker intercepta requests GET
a `/search` y, si la red no esta disponible, responde con el shell cacheado de
`/notes` cuando existe.

No se cambio la estrategia general del service worker.

## 8. Codigo retirado

Eliminado:

- `src/app/search/search-client.tsx`

Reemplazado:

- `src/app/search/page.tsx`
- `src/app/search/search-redirect-client.tsx`

Conservado:

- `searchNodes`
- `getRecoveryPath`, ahora apuntando a `/notes`
- `getReturnToFromSearchParams`
- rutas tecnicas de detalle

## 9. Pruebas

Se agregaron o actualizaron pruebas para:

- `/search` redirige a `/notes`;
- `/search?q=...` conserva consulta y caracteres especiales;
- sidebar no muestra `Buscar`;
- sidebar conserva `Capturar` y `Base de Conocimiento`;
- no existen enlaces principales hacia `/search`;
- `getRecoveryPath` construye `/notes?q=...`;
- `returnTo` usa `/notes?q=...`;
- la Base conserva busqueda, conteo, resaltado y carga progresiva;
- rutas heredadas de VIN-013 siguen redirigiendo.

## 10. Validaciones

Validaciones requeridas:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

No se uso Playwright.

## 11. Limitaciones

- `/search` sigue existiendo como ruta tecnica estatica para compatibilidad.
- La redireccion offline de `/search?q=...` depende de que el shell de `/notes`
  este cacheado.
- No se implemento restauracion avanzada de scroll.

## 12. Deuda tecnica

- El nombre tecnico `/notes` sigue representando la Base de Conocimiento.
- `getRecoveryPath` conserva nombre historico aunque ahora apunta a `/notes`.
- La recuperacion por contextos queda fuera del flujo principal hasta una
  decision futura.

## 13. Siguiente paquete recomendado

Revisar nomenclatura tecnica heredada: decidir si `/notes` debe evolucionar a
una ruta de Base de Conocimiento y si `Node` debe mantenerse como entidad
interna o evolucionar hacia `Capture`.
