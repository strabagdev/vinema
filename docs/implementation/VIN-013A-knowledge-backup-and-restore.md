# VIN-013A - Knowledge Backup and Restore

> Ampliado por VIN-013D. El respaldo actual usa `vinema-memory-backup` version 2 y mantiene compatibilidad de lectura con `vinema-knowledge-backup` version 1.

## Alcance

VIN-013A introduce respaldo y restauracion segura del conocimiento local de Vinema.

El paquete no implementa reset, no vacia datos y no elimina conocimiento existente. La restauracion se aplica como merge seguro sobre el workspace autenticado.

## Formato

El respaldo es un JSON legible y versionado:

```json
{
  "format": "vinema-knowledge-backup",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "workspace": {
    "id": "...",
    "name": "Personal"
  },
  "knowledge": {
    "nodes": [],
    "contexts": [],
    "relations": []
  },
  "summary": {
    "nodes": 0,
    "contexts": 0,
    "relations": 0
  }
}
```

El nombre de archivo usa:

```text
vinema-knowledge-YYYY-MM-DD-HHmm.json
```

## Datos Incluidos

El respaldo incluye solo conocimiento del workspace autenticado:

- capturas `Node`;
- conceptos `Context`;
- relaciones `NodeContextRelation`;
- fechas de creacion, actualizacion, archivo y restauracion;
- estado activo o archivado;
- metadatos no sensibles;
- version del formato.

La identidad emergente no se exporta como titulo. Se reconstruye desde conceptos y relaciones.

## Datos Excluidos

El respaldo no incluye:

- access tokens;
- refresh tokens;
- sesiones;
- passwords;
- API keys;
- hashes;
- dispositivos;
- outbox de sincronizacion;
- metadata tecnica de sync;
- datos de servidor.

Los metadatos de capturas se sanitizan para omitir claves sensibles.

## Validacion

Antes de restaurar, Vinema valida de forma estricta:

- formato;
- version;
- estructura;
- tipos;
- IDs;
- fechas;
- conteos;
- duplicados;
- referencias de relaciones;
- workspace unico;
- etiquetas normalizadas;
- ausencia de campos sensibles.

Un respaldo invalido se rechaza sin modificar datos.

## Restauracion

La restauracion usa merge seguro:

- misma entidad con mismo contenido: idempotente;
- misma ID con contenido diferente: conflicto;
- concepto equivalente por etiqueta normalizada: se reutiliza;
- relacion duplicada: se omite;
- relacion huerfana: respaldo rechazado;
- backup de otro workspace: respaldo rechazado;
- conflictos: abortan toda la operacion antes de escribir.

VIN-013A no sobrescribe conocimiento local y no borra conocimiento existente.

## Local First y Sync

La restauracion utiliza repositorios locales sync-aware.

Cada entidad nueva restaurada:

- se guarda primero localmente;
- genera una mutacion en `sync_mutations`;
- puede ser enviada por el ciclo de sincronizacion;
- emite invalidacion local para refrescar vistas sin recargar.

Despues de aplicar una restauracion con cambios, Vinema solicita sincronizacion inmediata mediante el ciclo autenticado.

## UI

Desde VIN-013C, el menu de sesion contiene un acceso minimo a `Mi conocimiento`.

El centro `Mi conocimiento` contiene:

- Respaldar conocimiento;
- Restaurar conocimiento;

Respaldar descarga el JSON directamente.

Restaurar abre selector de archivo, valida el respaldo y muestra una confirmacion minima con:

- nombre del archivo;
- fecha del respaldo;
- conteos de capturas, conceptos y relaciones;
- advertencia sobre merge y conflictos.

La restauracion no se ejecuta al seleccionar el archivo. Requiere confirmacion.

## Feedback

VIN-013A usa el sistema visual unificado:

- `saving` para respaldar, validar o restaurar;
- `success` para respaldo listo, respaldo valido o restauracion exitosa;
- `error` para archivos invalidos, conflictos o errores de operacion.

No se agregan toasts ni paneles globales nuevos.

## Seguridad

El respaldo tiene limite maximo de importacion.

Vinema no imprime el contenido del respaldo ni cuerpos de capturas en logs. Los errores visibles son breves y no exponen secretos.

## Limitaciones

- La restauracion solo acepta backups del mismo workspace autenticado.
- No hay compresion.
- No hay formato binario.
- No se implementa reset.
- La atomicidad se garantiza por validacion previa y escritura solo despues de detectar conflictos. Las escrituras reales usan repositorios sync-aware por entidad.

## Siguiente Fase

VIN-013B - Knowledge Reset debera implementarse despues de que el usuario pueda crear, validar y restaurar un respaldo confiable.

VIN-013B no debe borrar datos si no existe una verificacion previa de respaldo valido.
