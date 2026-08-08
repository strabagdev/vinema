# VIN-000 - Auditoria del estado actual

## 1. Resumen ejecutivo

Vinema existe hoy como una aplicacion Next.js local-first/offline-first con
persistencia en IndexedDB, PWA, Tauri configurado y una arquitectura local
separada en dominio, features, infraestructura, componentes y pruebas.

El producto actual permite:

- capturar texto en Inbox mediante boton `Capturar`;
- crear notas desde una pantalla separada;
- listar notas activas;
- abrir una nota;
- editar una nota con autosave;
- archivar una nota;
- buscar texto localmente por titulo, contenido y contextos asociados;
- gestionar Areas, Proyectos y Personas como contextos relacionales.

Respecto del dominio vigente del MVP "escribir, capturar y volver a encontrar",
el trabajo previo sigue siendo valioso, pero el producto esta mas grande y mas
conceptualmente cargado que el MVP deseado. El nucleo tecnico es reutilizable;
el lenguaje y algunos flujos deben simplificarse.

Brechas principales:

- No existe borrador automatico persistido antes de capturar.
- No existe un unico flujo central "escribir -> Capturar -> Base de
  Conocimiento".
- El concepto `Nota` sigue dominando UI, rutas y dominio de features.
- Existen tipos `NOTE`/`IDEA`, estados `INBOX`/`ORGANIZED` y contextos
  Area/Proyecto/Persona, todos mas complejos que el MVP actual.
- No hay eliminacion visible; existe archivado reversible como sustituto parcial.
- No hay Prisma, PostgreSQL, Railway, backend, APIs ni Server Actions reales.

Conclusion: no hay evidencia para reconstruir desde cero. El siguiente paquete
debe ser pequeno y partir de lo existente: crear una superficie central de
captura con borrador automatico local, boton `Capturar` y listado/busqueda
basica de capturas, reutilizando `Node` e IndexedDB temporalmente.

## 2. Estado tecnico del proyecto

### Stack real detectado

Respaldado por `package.json`, configuraciones y estructura:

- Next.js 16.2.11 con App Router.
- React 19.2.4.
- TypeScript estricto.
- Tailwind CSS 4 mediante `@tailwindcss/postcss`.
- Componentes UI locales compatibles con shadcn/ui (`components.json` estilo
  `new-york`, base `zinc`, iconos `lucide`).
- IndexedDB mediante `idb`.
- localStorage como fallback para `Device`.
- Vitest 4 con jsdom/fake-indexeddb.
- Tauri 2 configurado.
- PWA con manifest y service worker.

### Stack esperado no presente

No existe evidencia real de:

- Prisma;
- `@prisma/client`;
- `prisma/schema.prisma`;
- migraciones Prisma;
- seed Prisma;
- PostgreSQL;
- `DATABASE_URL`;
- Railway;
- rutas API;
- Server Actions.

`npm ls prisma @prisma/client` devuelve `(empty)`.

### Scripts reales

En `package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:run`
- `npm run tauri:dev`
- `npm run tauri:build`

### Configuracion

- `next.config.ts`: `output: "export"` y root de Turbopack.
- `tsconfig.json`: `strict: true`, alias `@/* -> ./src/*`,
  `moduleResolution: "bundler"`.
- `postcss.config.mjs`: Tailwind 4 via `@tailwindcss/postcss`.
- `eslint.config.mjs`: `eslint-config-next` core web vitals y TypeScript,
  ignorando `.next`, `out`, `build`, `src-tauri/target`.
- `components.json`: shadcn style `new-york`, `rsc: true`, CSS en
  `src/app/globals.css`.

## 3. Estado funcional verificable

La siguiente reconstruccion se basa en inspeccion de codigo, pruebas
automatizadas y build. No se realizo validacion manual en navegador ni
Playwright, por restriccion explicita.

### Puede escribir texto?

Si.

- `/inbox` permite escribir en un textarea.
- `/notes/new` permite escribir titulo y contenido.
- `/notes/detail?nodeId=<id>` permite editar titulo y contenido en modo edicion.

### Existe autoguardado del borrador?

Parcialmente.

- En detalle de nota existe autosave del contenido ya persistido.
- No existe autoguardado del borrador antes de capturar en Inbox.
- No existe un store dedicado a draft de captura.

### Donde se guarda el borrador?

El borrador de Inbox se guarda solo en estado React local (`useState`). Se pierde
al recargar antes de pulsar `Capturar`.

El borrador de edicion de una nota existe en estado React y se autosalva hacia
IndexedDB despues de debounce.

### Existe un boton Capturar?

Si, en `/inbox`.

### Que ocurre al capturar?

`InboxPage.handleCapture` llama `useCreateNode().create` con:

- `type: "IDEA"`;
- `title: ""`;
- `content`;
- `organizationStatus: "INBOX"`;
- workspace y device locales.

Si se crea, limpia el textarea, muestra "Idea capturada." y refresca el listado.

### El texto se persiste realmente?

Si. `createNode` persiste via `IndexedDbNodeRepository.create`, que usa
`db.add(NODES_STORE, node)`.

### Existe una Base de Conocimiento visible?

No con ese nombre. Existen:

- `/notes`: listado de notas activas organizadas;
- `/inbox`: listado de ideas capturadas;
- `/search`: recuperacion textual local.

El concepto visual "Base de Conocimiento" no esta formalizado.

### Las capturas se muestran cronologicamente?

Si, por `updatedAt` descendente en repositorio para listas. Inbox muestra
`createdAt`, pero el orden lo entrega `listInbox()` por `updatedAt`.

### Existe busqueda textual?

Si. `/search` usa `searchNodes`.

### La busqueda consulta servidor o filtra en cliente?

Filtra en cliente sobre IndexedDB. No hay servidor.

`searchNodes` carga nodos por workspace desde IndexedDB, normaliza texto y
compara titulo, contenido y nombres de contextos asociados.

### Puede abrir una captura?

Puede abrir notas organizadas desde `/notes` y resultados de `/search`.

Las ideas en Inbox no se abren directamente como detalle: se pueden convertir a
nota, lo que navega al detalle del mismo `Node`.

### Puede editarla?

Si, en detalle de nota. Abre en modo lectura y requiere accion `Editar`.

### Puede eliminarla?

No existe eliminacion visible ni borrado definitivo.

Existe `Archivar`, que cambia `status` a `ARCHIVED`. `deletedAt` esta modelado,
pero no hay UI ni caso de uso de eliminacion definitiva.

### Existe titulo obligatorio?

No estrictamente. La validacion permite titulo vacio si hay contenido.

Pero el flujo `/notes/new` presenta el titulo como primer input y usa lenguaje
"Nueva nota". Esto puede sugerir que el titulo es importante aunque no sea
obligatorio.

### Existen conceptos antiguos que contradigan el dominio actual?

Si:

- `Note`/`Nota` domina UI, rutas y componentes.
- `NodeType` exige `NOTE` o `IDEA`, contradiciendo "no existen tipos de
  captura" para el MVP nuevo.
- `Context`, `ContextType`, Areas, Proyectos, Personas y relaciones quedan fuera
  del MVP inicial definido en esta auditoria.
- `organizationStatus: "INBOX" | "ORGANIZED"` introduce un concepto de
  organizacion prematuro.

### Hay funcionalidades incompletas o simuladas?

No se detectaron datos simulados en las rutas principales. Hay funcionalidades
reales pero fuera del MVP actual:

- contextos;
- relaciones nota-contexto;
- archivado/restauracion de contextos;
- Tauri configurado;
- PWA.

### Hay datos hardcodeados?

Si, aceptables pero relevantes:

- workspace local por defecto `Personal`;
- labels de UI;
- nombre de device `Vinema ${platform}`;
- base IndexedDB `vinema`;
- version IndexedDB `4`;
- rutas precacheadas en `public/sw.js`.

### Hay rutas muertas o componentes sin uso?

No se detectaron rutas muertas obvias. Todas las rutas listadas por build se
exportan:

- `/`
- `/inbox`
- `/notes`
- `/notes/new`
- `/notes/detail`
- `/search`
- `/contexts/areas`
- `/contexts/projects`
- `/contexts/people`
- `/contexts/detail`

## 4. Flujo actual del usuario

### Flujo Inbox

1. Usuario abre `/inbox`.
2. Escribe texto en textarea.
3. Pulsa `Capturar` o `Ctrl/Cmd+Enter`.
4. Se crea un `Node` tipo `IDEA`.
5. La idea aparece en Inbox.
6. Puede convertirla a nota o archivarla.

Problema frente al MVP nuevo: el borrador no se conserva automaticamente antes
de capturar.

### Flujo nueva nota

1. Usuario abre `/notes/new`.
2. Escribe titulo opcional y contenido.
3. Pulsa `Guardar` o `Ctrl/Cmd+S`.
4. Se crea `Node` tipo `NOTE`.
5. Navega al detalle.

Problema frente al MVP nuevo: mantiene el concepto dominante de nota y un flujo
paralelo a Capturar.

### Flujo detalle

1. Usuario abre `/notes/detail?nodeId=<id>`.
2. Ve la fuente en modo lectura.
3. Pulsa `Editar`.
4. Modifica titulo/contenido.
5. Autosave persiste tras debounce de 700 ms.
6. `Listo` vuelve a lectura.
7. Puede archivar.

Problema frente al MVP nuevo: hay contextos en el editor y archivado, pero no
eliminacion.

### Flujo busqueda

1. Usuario abre `/search`.
2. Escribe query.
3. La URL queda `/search?q=...`.
4. Se filtran fuentes locales.
5. Resultado muestra titulo, extracto, fecha, matched fields y contextos.
6. Puede abrir fuente o contexto.

Esto esta alineado con "volver a encontrar".

## 5. Arquitectura y estructura

### Estructura principal

- `src/app`: rutas App Router.
- `src/domain`: tipos de dominio y contratos de repositorio.
- `src/features`: casos de uso, hooks y helpers por feature.
- `src/infrastructure`: IndexedDB, storage, plataforma y repositorios.
- `src/components`: app shell y componentes UI.
- `src/tests`: pruebas unitarias/comportamiento con jsdom/fake-indexeddb.
- `docs`: documentacion VIN.
- `docs/product`: documentos conceptuales y auditorias.
- `src-tauri`: configuracion Tauri.

### Persistencia

La persistencia real esta en IndexedDB:

- `src/infrastructure/storage/vinema-db.ts`
- repositorios IndexedDB por entidad.

No hay servidor ni base remota.

### Estado

No hay estado global. Se usa React local state, hooks y refrescos explicitos.

Esto es adecuado para el MVP, aunque el borrador automatico requiere persistir
estado local antes de capturar.

### Diseño y responsive

La app tiene shell con sidebar desktop y header. Usa clases Tailwind y
componentes UI locales. El diseño es responsive por estructura `sm`, `lg` y
sidebar oculta en pantallas pequenas mediante header/mobile navigation.

### Accesibilidad basica

Hay labels visibles o `aria-label` en inputs principales, botones con texto e
indicadores de loading/error. No se audito con herramientas de accesibilidad ni
navegador.

## 6. Modelo de datos

### Prisma

No existe modelo Prisma.

No hay:

- `prisma/schema.prisma`;
- migraciones Prisma;
- `@prisma/client`;
- seed;
- conexion PostgreSQL;
- restricciones SQL;
- modelo relacional remoto.

Por lo tanto, la seccion "modelo Prisma actual completo" no aplica al estado
real del repo.

### Modelo IndexedDB real

Base:

- nombre: `vinema`;
- version: `4`.

Stores:

- `app_settings`: clave string out-of-line.
- `key-value`: legado.
- `devices`: `keyPath: "id"`.
- `workspaces`: `keyPath: "id"`.
- `nodes`: `keyPath: "id"`, indices `by-updated-at`, `by-workspace`.
- `contexts`: `keyPath: "id"`, indices `by-workspace`, `by-type`,
  `by-archived-at`, `by-workspace-and-type`.
- `node_context_relations`: `keyPath: "id"`, indices `by-workspace`,
  `by-node`, `by-context`, `by-node-and-context` unico.

### Entidades actuales

#### Node

Campos:

- `id`;
- `workspaceId`;
- `type`: `NOTE | IDEA`;
- `title`;
- `content`;
- `status`: `ACTIVE | ARCHIVED`;
- `organizationStatus`: `INBOX | ORGANIZED`;
- `metadata`;
- `version`;
- `createdAt`;
- `updatedAt`;
- `deletedAt`;
- `createdByDeviceId`;
- `lastModifiedByDeviceId`.

Participa directamente en el producto.

#### Context

Campos:

- `id`;
- `workspaceId`;
- `type`: `AREA | PROJECT | PERSON`;
- `name`;
- `description`;
- `createdAt`;
- `updatedAt`;
- `archivedAt`.

Participa en funcionalidades actuales, pero queda fuera del MVP inicial
definido en esta auditoria.

#### NodeContextRelation

Campos:

- `id`;
- `workspaceId`;
- `nodeId`;
- `contextId`;
- `createdAt`.

Participa en funcionalidades actuales, pero queda fuera del MVP inicial.

#### Workspace

Workspace local por defecto `Personal`. Participa como aislamiento local simple.

#### Device

Identifica instalacion/navegador local. Participa para metadatos de creacion y
modificacion.

### Comparacion con modelo minimo conceptual

Referencia:

```prisma
model Capture {
  id        String   @id @default(cuid())
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

El modelo actual es mucho mas amplio que esta referencia.

Campos adicionales con razon concreta para conservar temporalmente:

- `updatedAt`: necesario para recientes y busqueda ordenada.
- `status`: permite archivar; podria sustituir temporalmente eliminacion.
- `deletedAt`: existe para borrado logico futuro, pero no se usa en UI.
- `version`: util para autosave/sync futura; no esencial para MVP.
- `workspaceId`: no visible para usuario, pero soporta local default.
- `createdByDeviceId`/`lastModifiedByDeviceId`: preparan sync futura; no
  esenciales para MVP.
- `title`: opcional; puede conservarse si no se exige.

Campos/conceptos que sobran para el MVP nuevo:

- `type`;
- `organizationStatus`;
- `metadata` si no se usa;
- contextos y relaciones.

Riesgo de perdida de datos al simplificar:

- Alto si se eliminan stores o campos sin migracion.
- Bajo si se reinterpreta UI y se reutiliza `Node` como `Capture` tecnica.

## 7. Alineacion con el dominio actual

### Alineado

- Captura de texto en Inbox con boton `Capturar`.
- Titulo no obligatorio cuando hay contenido.
- Persistencia local.
- Busqueda textual local.
- Apertura y edicion de una fuente.
- Modo lectura antes de editar.
- Offline-first.
- Sin IA, embeddings, servidor ni autenticacion.

### Parcialmente alineado

- Autosave: existe para edicion de notas, no para borrador pre-captura.
- Listado reciente: existe en `/notes` e Inbox, pero separado por tipo/estado.
- Base de Conocimiento: existe como `/notes`, pero no con el lenguaje nuevo.
- Eliminacion: existe archivado, no eliminacion.

### Contradictorio o fuera del MVP

- Dominio `Note`/`Nota` dominante.
- `NodeType` con `NOTE`/`IDEA`.
- `organizationStatus` con `INBOX`/`ORGANIZED`.
- Contextos Area/Proyecto/Persona.
- Relaciones nota-contexto.
- Sidebar con Areas, Proyectos y Personas.
- Pantalla `/notes/new` con boton `Guardar`, paralela a `Capturar`.

Estos elementos no deben eliminarse sin plan. Deben aislarse, ocultarse o
reinterpretarse gradualmente.

## 8. Inventario clasificado

### Conservar

| Elemento | Ubicacion | Funcion actual | Justificacion | Accion recomendada |
| --- | --- | --- | --- | --- |
| Next/React/TypeScript/Tailwind | `package.json`, configs | Base frontend | Funciona y build pasa | Mantener |
| IndexedDB | `src/infrastructure/storage/vinema-db.ts` | Persistencia local | Alineado con local-first | Mantener |
| Busqueda textual | `src/app/search/*`, `src/features/recovery/*` | Recuperacion local | Central para MVP | Mantener y acercar a Base de Conocimiento |
| Autosave de edicion | `note-detail-client.tsx` | Evita perdida en captura ya persistida | Util, probado | Reutilizar patrones para borrador |
| Modo lectura/editar | `note-detail-client.tsx` | Reduce edicion accidental | Alineado | Mantener |
| Tests | `src/tests/*` | Validan dominio/UI/persistencia | 92 tests pasan | Mantener |
| Static export | `next.config.ts` | Compatible Tauri/PWA | Build pasa | Mantener |

### Reutilizar

| Elemento | Ubicacion | Funcion actual | Justificacion | Accion recomendada |
| --- | --- | --- | --- | --- |
| `Node` | `src/domain/node/node.ts` | Nota/idea persistida | Puede funcionar como `Capture` tecnica | Reinterpretar sin renombrar aun |
| `createNode` | `src/features/node/create-node.ts` | Crea `Node` | Sirve para capturar texto | Envolver con caso de uso `captureText` futuro |
| `/inbox` | `src/app/inbox/page.tsx` | Captura ideas | Tiene boton Capturar | Convertir en superficie principal o fusionar |
| `/notes` | `src/app/notes/page.tsx` | Lista notas | Puede ser Base de Conocimiento | Cambiar lenguaje, no modelo primero |
| `archiveNode` | `src/features/node/archive-node.ts` | Archiva | Sustituto parcial de eliminar | Decidir si MVP exige eliminar real |
| Device/Workspace | `src/features/device`, `src/features/workspace` | Metadata local | No molesta al usuario | Mantener invisible |

### Refactorizar

| Elemento | Ubicacion | Funcion actual | Justificacion | Accion recomendada |
| --- | --- | --- | --- | --- |
| `/notes/new` | `src/app/notes/new/page.tsx` | Nueva nota con Guardar | Duplica captura y lenguaje antiguo | Integrar con Capturar o esconder |
| `NodeType` | `src/domain/node/node.ts` | `NOTE`/`IDEA` | Contradice "no tipos de captura" | No migrar aun; dejar valor unico en nuevo flujo |
| `organizationStatus` | `src/domain/node/node.ts` | `INBOX`/`ORGANIZED` | Introduce organizacion prematura | Reinterpretar como estado tecnico transitorio |
| Validacion de Node | `node-validation.ts` | Requiere titulo o contenido | Bien, pero mensaje dice "nota" | Ajustar lenguaje futuro |
| Sidebar | `app-sidebar.tsx` | Navegacion por Buscar/Inbox/Notas/Contextos | Contextos dominan demasiado para MVP | Simplificar en paquete futuro |

### Retirar

No se recomienda retirar codigo inmediatamente.

Candidatos a retirar u ocultar del MVP cuando sea seguro:

| Elemento | Ubicacion | Funcion actual | Justificacion | Accion recomendada |
| --- | --- | --- | --- | --- |
| Gestion visible de contextos | `src/app/contexts/*` | Areas/Proyectos/Personas | Fuera del MVP actual | Ocultar, no borrar aun |
| Relaciones desde editor | `note-detail-client.tsx` | Asociar contextos | Fuera del MVP inicial | Aislar detras de flag/ruta secundaria futura |

### Posponer

| Elemento | Ubicacion | Funcion actual | Justificacion | Accion recomendada |
| --- | --- | --- | --- | --- |
| Conceptos | Docs, `Context` futuro | Modelo conceptual | Prematuro para MVP | Posponer |
| Relaciones | `NodeContextRelation` | Asociacion manual | Fuera del MVP inicial | Posponer visible |
| Grafos | No implementado | Ninguna | Fuera de MVP | No introducir |
| IA/embeddings | No implementado | Ninguna | Fuera de nucleo | No introducir |
| Prisma/PostgreSQL/Railway | No implementado | Ninguna | No necesario para local MVP | No agregar aun |

## 9. Resultados de validacion

### Instalacion

Comando:

```bash
npm install
```

Resultado: OK.

Salida relevante: `up to date in 8s`.

### Prisma

Comandos intentados:

```bash
npx prisma validate
npx prisma generate
```

Resultado: no aplicable.

Motivo: Prisma no esta instalado ni configurado. `npx prisma ...` quedo
intentando resolver un paquete externo y fue interrumpido para no instalar
dependencias. `npm ls prisma @prisma/client` confirma `(empty)`.

### Lint

Comando:

```bash
npm run lint
```

Resultado: OK.

### Pruebas

Comando:

```bash
npm run test
```

Resultado: OK.

Resultado: 12 archivos, 92 tests pasados.

### Build

Comando:

```bash
npm run build
```

Resultado: OK.

Rutas estaticas generadas:

- `/`
- `/_not-found`
- `/contexts/areas`
- `/contexts/detail`
- `/contexts/people`
- `/contexts/projects`
- `/inbox`
- `/manifest.webmanifest`
- `/notes`
- `/notes/detail`
- `/notes/new`
- `/search`

## 10. Riesgos

### Dominio

Riesgo real para MVP:

- `Nota`, `IDEA`, `NOTE`, `INBOX`, `ORGANIZED` contradicen el modelo simple de
  captura unica.

Deuda tolerable:

- Mantener `Node` como entidad tecnica temporal.

Mejora futura:

- Definir si `Capture` reemplaza o envuelve `Node`.

### Arquitectura

Riesgo real:

- El flujo esta repartido entre Inbox, Notas, Nueva nota y Search.

Deuda tolerable:

- No hay estado global; para MVP local es aceptable.

### Base de datos

Riesgo real:

- Simplificar borrando stores/campos podria perder datos.

Deuda tolerable:

- Modelo IndexedDB mas amplio que MVP.

### Experiencia de usuario

Riesgo real:

- No hay borrador persistente antes de capturar.
- Sidebar puede distraer con contextos.

Deuda tolerable:

- Archivar en vez de eliminar.

### Rendimiento

Deuda tolerable:

- Busqueda textual hace scan local; adecuado para volumen MVP.

Mejora futura:

- Indice textual derivado si aparecen miles de capturas.

### Seguridad

Riesgo bajo:

- Sin backend ni auth, superficie remota minima.

Deuda:

- Datos solo locales; perdida del navegador/dispositivo implica perdida si no
  hay backup futuro.

### Despliegue

Riesgo:

- No hay configuracion Railway aunque se mencione como orientacion futura.

Deuda tolerable:

- Tauri/PWA/static export funcionan para local-first.

### Mantenimiento

Riesgo:

- Documentacion y dominio se mueven mas rapido que UI/codigo.

### Perdida de trabajo previo

Riesgo:

- Retirar contextos o cambiar stores sin migracion podria perder relaciones.

Recomendacion:

- No borrar; ocultar o aislar hasta decidir migracion.

## 11. Brechas respecto al MVP

| Requisito MVP | Estado actual | Brecha |
| --- | --- | --- |
| Escribir texto | Cumple | Hay multiples lugares para escribir |
| Conservar borrador automatico | No cumple para captura inicial | Solo estado React en Inbox |
| Capturar con accion explicita | Cumple en Inbox | No es flujo principal unico |
| Almacenar en Base de Conocimiento | Parcial | Se almacena en `nodes`, pero UI dice Notas/Inbox |
| Mostrar capturas recientes | Parcial | Notas e Inbox separados |
| Buscar por texto | Cumple | Cliente/IndexedDB |
| Abrir captura | Parcial | Notas si; ideas requieren convertir |
| Editar captura | Cumple para notas | No para ideas sin convertir |
| Eliminar captura | No cumple | Solo archivar |
| Titulo opcional | Cumple tecnicamente | UI lo destaca en nueva nota |
| Sin tipos | No cumple | `NOTE`/`IDEA` |
| Sin relaciones/contextos | No cumple en UI actual | Existen y son visibles |
| Sin IA | Cumple | No hay IA |

## 12. Proximo paquete recomendado

### Codigo VIN sugerido

VIN-012.

### Nombre

Superficie minima de captura y Base de Conocimiento.

### Problema que resuelve

El producto tiene piezas validas, pero el flujo principal esta fragmentado entre
Inbox, Nueva nota, Notas y Search. Ademas no existe borrador automatico
persistido antes de capturar, que ahora es requisito central del MVP.

### Objetivo

Crear una experiencia principal simple:

```text
Escribir
  ↓
Borrador automatico local
  ↓
Capturar
  ↓
Base de Conocimiento
  ↓
Buscar / abrir / editar
```

### Alcance

- Agregar borrador automatico persistido localmente para la captura principal.
- Usar boton `Capturar` como accion principal.
- Capturar texto sin titulo obligatorio.
- Mostrar capturas recientes en una Base de Conocimiento visible.
- Reutilizar `Node` e IndexedDB sin migraciones.
- Mantener busqueda textual existente.
- No eliminar datos ni contextos.

### Fuera de alcance

- Migrar a Prisma/PostgreSQL.
- Crear entidad `Capture` persistida nueva.
- Borrar contextos.
- Implementar IA, relaciones, grafos o indices.
- Redisenar toda la app.
- Eliminar stores IndexedDB.

### Archivos probablemente afectados

- `src/app/page.tsx` o nueva ruta central de captura.
- `src/app/inbox/page.tsx`.
- `src/app/notes/page.tsx`.
- `src/features/node/create-node.ts` o wrapper nuevo `capture-text`.
- `src/infrastructure/storage/*` para borrador local.
- `src/components/app-shell/app-sidebar.tsx`.
- tests de captura/listado/borrador.
- README/docs del MVP.

### Cambios de datos

Sin migraciones.

El borrador puede guardarse en `app_settings` o `key-value` con clave estable.
Las capturas pueden seguir guardandose como `Node` temporalmente.

### Criterios de aceptacion

- Escribir texto crea/actualiza borrador persistente.
- Recargar conserva el borrador.
- `Capturar` persiste contenido aunque no haya titulo.
- Capturar limpia el borrador.
- La captura aparece en Base de Conocimiento reciente.
- La busqueda encuentra la captura por contenido.
- Se puede abrir y editar.
- No se exige carpeta, contexto, etiqueta ni tipo visible.
- Contextos quedan fuera del flujo principal.
- Validaciones pasan.

### Validaciones

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

### Riesgos

- Duplicar Inbox si no se decide que ruta sera principal.
- Romper datos previos si se cambia `Node` en vez de envolverlo.
- Mantener visible demasiada navegacion lateral y diluir el MVP.

### Motivo por el cual debe ser el siguiente

Es el paquete mas pequeno que alinea el producto real con el MVP vigente sin
reescribir dominio ni perder trabajo previo. Ataca la brecha critica: borrador
automatico + Capturar + Base de Conocimiento.

## 13. Archivos relevantes

### Configuracion

- `package.json`
- `next.config.ts`
- `tsconfig.json`
- `postcss.config.mjs`
- `eslint.config.mjs`
- `components.json`

### Rutas

- `src/app/page.tsx`
- `src/app/inbox/page.tsx`
- `src/app/notes/page.tsx`
- `src/app/notes/new/page.tsx`
- `src/app/notes/detail/page.tsx`
- `src/app/notes/detail/note-detail-client.tsx`
- `src/app/search/page.tsx`
- `src/app/search/search-client.tsx`
- `src/app/contexts/*`

### Dominio y features

- `src/domain/node/node.ts`
- `src/domain/context/context.ts`
- `src/domain/context/node-context-relation.ts`
- `src/features/node/*`
- `src/features/recovery/*`
- `src/features/context/*`
- `src/features/device/get-or-create-device.ts`
- `src/features/workspace/get-or-create-default-workspace.ts`

### Infraestructura

- `src/infrastructure/storage/vinema-db.ts`
- `src/infrastructure/node/indexed-db-node-repository.ts`
- `src/infrastructure/context/*`
- `src/infrastructure/workspace/*`
- `src/infrastructure/repositories.ts`

### Pruebas

- `src/tests/node-core.test.ts`
- `src/tests/note-detail-read-mode.test.ts`
- `src/tests/recovery-search.test.ts`
- `src/tests/indexed-db-repositories.test.ts`
- `src/tests/context-core.test.ts`
- `src/tests/context-detail-ui.test.ts`

### Documentacion

- `README.md`
- `docs/VIN-000_CONSTITUCION.md`
- `docs/product/VIN-011-PARADIGMA-ORGANIZACION.md`
- `docs/product/VIN-AUDITORIA-ALINEACION-000-011.md`

## 14. Conclusion

Vinema ya tiene una base tecnica solida y validada para un MVP local-first:
captura, persistencia local, listado, apertura, edicion, autosave de edicion y
busqueda textual funcionan.

El problema principal no es tecnico. Es de alineacion y simplicidad de producto.
El sistema actual aun arrastra un modelo de notas, ideas, contextos y
organizacion mas amplio que el MVP vigente.

No se debe borrar ni migrar precipitadamente. Lo correcto es reutilizar la base
actual y crear una superficie principal que exprese el nuevo MVP:

```text
Escribir, capturar y volver a encontrar.
```

El primer cambio debe ser pequeno, reversible y sin migraciones: borrador
automatico local y Capturar como flujo principal hacia una Base de Conocimiento.
