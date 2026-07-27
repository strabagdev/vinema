# VIN-013 - Consolidacion del flujo principal

## 1. Objetivo

Consolidar la experiencia principal introducida en VIN-012 y retirar del flujo
visible las superficies heredadas que duplicaban la incorporacion de contenido.

El flujo principal vigente queda centrado en:

```text
Escribir -> Capturar -> Base de Conocimiento -> Buscar -> Abrir -> Editar
```

No se realizaron migraciones destructivas, cambios de stores, backend remoto,
Prisma, PostgreSQL, APIs, autenticacion ni sincronizacion.

## 2. Auditoria de superficies heredadas

### Rutas revisadas

- `/`: superficie principal de captura creada en VIN-012.
- `/notes`: listado heredado de notas, reinterpretado como Base de
  Conocimiento.
- `/notes/new`: formulario heredado de creacion de nota.
- `/inbox`: captura heredada de ideas pendientes.
- `/notes/detail?nodeId=<id>`: detalle y edicion existente.
- `/search`: busqueda local existente.
- `/contexts/*`: superficies de contextos existentes.

### Botones y enlaces revisados

- Boton superior `Nueva nota`.
- CTA `Nueva nota` dentro de `/notes`.
- Formulario de captura de `/inbox`.
- Accesos de sidebar a Inbox, Notas y Contextos.
- Estados vacios que invitaban a crear notas o convertir ideas.

### Codigo conservado por compatibilidad

- Dominio `Node`.
- Tipos internos `NOTE` e `IDEA`.
- Estados internos `INBOX` y `ORGANIZED`.
- Repositorios IndexedDB.
- Casos de uso de conversion y listas heredadas.
- Rutas `/inbox` y `/notes/new`, ahora sin formulario paralelo.
- Rutas de contextos, fuera de la navegacion principal.

## 3. Elementos retirados

- El formulario visible de `Nueva nota` en `/notes/new`.
- El formulario visible de captura paralela en `/inbox`.
- El CTA `Nueva nota` en el header.
- El CTA `Nueva nota` en `/notes`.
- Accesos principales de sidebar a Inbox y Contextos.
- Lenguaje visible dominante de `Notas` en Base y detalle.

## 4. Elementos redirigidos

Las rutas heredadas se conservan como compatibilidad temporal y redirigen al
flujo principal:

- `/notes/new` -> `/#capture`
- `/inbox` -> `/#capture`

Ambas muestran un mensaje de transicion con accion `Capturar texto` por si la
redireccion cliente tarda o no se ejecuta.

## 5. Cambios de navegacion

La navegacion principal queda reducida a:

- `Capturar`
- `Base de Conocimiento`
- `Buscar`

Los contextos siguen existiendo por ruta directa y compatibilidad, pero no
compiten visualmente con el flujo principal.

## 6. Cambios de lenguaje

Se reemplazo lenguaje visible heredado por lenguaje del producto:

- `Notas` -> `Base de Conocimiento` o `Captura`, segun contexto.
- `Nueva nota` -> `Capturar texto`.
- `Cargando nota` -> `Cargando captura`.
- `Nota no encontrada` -> `Captura no encontrada`.
- `Nota archivada` -> `Captura archivada`.
- `Notas relacionadas` -> `Capturas relacionadas`.

Los nombres tecnicos de archivos, rutas y entidades internas no fueron
renombrados en este paquete.

## 7. Base de Conocimiento

La Base de Conocimiento ya no depende del estado tecnico `ORGANIZED`.

El listado reciente y `/notes` muestran nodos activos del workspace actual,
incluyendo capturas historicas que internamente sigan como `IDEA`/`INBOX`.

Las capturas archivadas quedan fuera de la Base activa y se preservan sin
eliminacion destructiva.

## 8. Pruebas

Se agrego cobertura para:

- navegacion principal con `Capturar`, `Base de Conocimiento` y `Buscar`;
- ausencia de `Inbox`, contextos y `Nueva nota` en la navegacion principal;
- redireccion de `/notes/new` y `/inbox` hacia `/#capture`;
- Base de Conocimiento incluyendo capturas historicas activas sin exigir
  organizacion;
- ausencia de llamados visibles heredados a creacion de notas en `src/app` y
  `src/components`;
- capturas historicas visibles en la superficie de VIN-012.

Tambien se actualizaron pruebas existentes por el cambio de lenguaje visible en
detalle y contextos.

## 9. Validaciones

Validaciones ejecutadas durante el cierre:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

No se uso Playwright.

## 10. Deuda tecnica

- `/notes`, `/notes/detail` y `NoteDetail*` conservan nombres tecnicos
  heredados.
- `Node`, `NOTE`, `IDEA`, `INBOX` y `ORGANIZED` siguen existiendo como modelo
  interno.
- `useNodes("inbox")`, conversion de ideas y repositorios heredados se mantienen
  para compatibilidad.
- Las rutas de contextos siguen disponibles por acceso directo.
- README y documentacion historica todavia contienen lenguaje de paquetes
  anteriores y deben tratarse como historicos o actualizarse en un paquete
  documental especifico.

## 11. Rutas heredadas pendientes de eliminacion

No se eliminaron en VIN-013:

- `/notes/new`
- `/inbox`
- `/contexts/areas`
- `/contexts/projects`
- `/contexts/people`
- `/contexts/detail`

Su eliminacion tecnica debe esperar evidencia de que no sostienen datos
historicos, pruebas, PWA, Tauri ni recorridos de recuperacion.

## 12. Siguiente paquete recomendado

El siguiente paquete recomendado es una limpieza controlada de lenguaje tecnico
y documentacion viva:

- decidir si `/notes` debe renombrarse tecnicamente en rutas futuras;
- definir si `Node` sigue siendo la entidad interna adecuada o si debe aparecer
  una entidad `Capture`;
- revisar README y documentos no historicos para que reflejen el flujo
  consolidado;
- decidir el destino de rutas heredadas despues de observar compatibilidad.
