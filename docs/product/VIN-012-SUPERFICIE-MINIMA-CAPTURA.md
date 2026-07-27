# VIN-012 - Superficie minima de captura y Base de Conocimiento

## 1. Contexto

Vinema definio en su constitucion que no existe para almacenar notas, sino para
ayudar a pensar y recordar con menor carga cognitiva. La auditoria del estado
actual detecto que el proyecto ya tenia una base local solida, pero la
experiencia principal estaba fragmentada entre Inbox, Notas, busqueda y detalle.

VIN-012 introduce una superficie minima que concentra el flujo esencial:

1. escribir;
2. preservar el borrador localmente;
3. capturar de forma explicita;
4. ver contenido reciente de la Base de Conocimiento;
5. buscar y abrir capturas.

No se incorporan backend, autenticacion, Prisma, PostgreSQL, Server Actions,
APIs ni migraciones de datos.

## 2. Objetivo

El objetivo de este paquete es que el usuario pueda entrar a Vinema y empezar a
escribir sin tener que decidir tipo, estado, carpeta, contexto o ubicacion.

La superficie principal debe sentirse como una sola experiencia local-first y
offline-first:

- un editor de captura;
- un indicador discreto de guardado de borrador;
- una accion visible `Capturar`;
- busqueda local;
- contenido reciente de la Base de Conocimiento.

## 3. Lenguaje visible

La superficie minima usa el lenguaje de producto:

- Capturar;
- Captura;
- Base de Conocimiento;
- Buscar;
- Editar;
- Volver.

El lenguaje heredado del modelo interno se mantiene solo donde todavia existe
por compatibilidad tecnica. En la nueva superficie no se pide al usuario elegir
tipo, estado, Inbox, Nota ni Contexto.

## 4. Borrador local

El borrador principal se guarda en la persistencia local existente, dentro de
`app_settings`, mediante la clave:

```text
vinema:capture-draft:v1
```

La estructura persistida es:

```text
{
  content: string,
  updatedAt: string
}
```

El guardado se realiza con debounce de 500 ms. Mientras se escribe, la interfaz
muestra estados discretos:

- `Guardando borrador`;
- `Borrador guardado`;
- `Error al guardar`.

El borrador no crea un `Node`, no aparece en la Base de Conocimiento, no aparece
en busqueda y se conserva tras recargar la ruta o reabrir la aplicacion sobre la
misma capa local.

Si el contenido esta vacio o contiene solo espacios, el borrador persistido se
elimina y no se crea captura.

## 5. Captura

La accion `Capturar` valida que exista contenido real. Si el contenido esta
vacio, se muestra un mensaje claro y no se escribe en IndexedDB.

Cuando la captura es valida:

- se crea un unico registro persistido;
- se usa el repositorio existente de nodos;
- se conserva compatibilidad con el modelo actual usando internamente
  `type: "NOTE"` y `organizationStatus: "ORGANIZED"`;
- se limpia el editor;
- se elimina el borrador persistido;
- se actualiza la lista reciente;
- el contenido queda disponible para busqueda local.

La interfaz bloquea envios simultaneos para evitar duplicados por doble click o
submits repetidos.

## 6. Base de Conocimiento reciente

La seccion reciente muestra capturas activas del workspace actual, ordenadas por
`updatedAt` descendente y limitadas a un conjunto compacto.

Cada item muestra:

- fragmento de contenido;
- fecha compacta;
- titulo solo si ya existe y aporta valor.

No se muestran badges de tipo, estado ni contexto. Una captura sin titulo sigue
siendo completamente valida.

## 7. Busqueda

La busqueda reutiliza el caso de uso local existente `searchNodes`.

No se implementa un segundo motor de busqueda. La consulta se realiza sobre la
persistencia local y permite abrir resultados en la pantalla de detalle.

El borrador no participa en la busqueda porque no es conocimiento capturado.

## 8. Detalle y edicion

Las capturas se abren mediante la ruta estatica compatible con export:

```text
/notes/detail?nodeId=<id>
```

La pantalla de detalle existente se mantiene:

- abre inicialmente en modo lectura;
- editar requiere la accion explicita `Editar`;
- existe accion visible `Volver`;
- los cambios de edicion se persisten con la logica ya existente.

El archivado sigue disponible en el detalle, pero no es el centro de la nueva
superficie minima.

## 9. Compatibilidad interna

VIN-012 no renombra entidades ni migra datos. El modelo `Node` sigue siendo la
unidad tecnica persistida para conservar compatibilidad con el dominio y los
repositorios actuales.

La decision de usar internamente `NOTE` y `ORGANIZED` es una adaptacion
temporal para que las capturas entren directamente en la Base de Conocimiento
sin introducir una nueva entidad ni reconstruir el proyecto.

## 10. Multi-tab

La implementacion mantiene un borrador principal local. Si dos pestanas escriben
al mismo tiempo, prevalece la ultima escritura persistida en la clave de
borrador. No se introduce coordinacion multi-tab avanzada en este paquete para
evitar complejidad prematura.

## 11. Validacion

La validacion de VIN-012 cubre:

- guardado automatico del borrador;
- restauracion despues de remontar la vista;
- ausencia de creacion de captura mientras solo existe borrador;
- limpieza del borrador despues de capturar;
- rechazo de contenido vacio o solo espacios;
- prevencion de duplicados por doble click;
- aparicion de la captura en recientes;
- aparicion de la captura en busqueda;
- apertura mediante ruta estatica de detalle.

## 12. Decisiones

- La ruta principal `/` pasa a ser la superficie minima de captura.
- La persistencia del borrador usa `app_settings`; no se crea una segunda base.
- La accion `Capturar` crea un `Node` compatible con el modelo vigente.
- La Base de Conocimiento reciente usa nodos activos y organizados.
- La busqueda se reutiliza desde el modulo de recuperacion local.
- No se implementa VIN-010, VIN-011 ni VIN-013 en este paquete.
