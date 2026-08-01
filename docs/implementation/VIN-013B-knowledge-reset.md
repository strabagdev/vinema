# VIN-013B - Knowledge Reset

> Ampliado por VIN-013D. El reset actual incorpora inventario completo de memoria y barrera remota para rechazar mutaciones anteriores al ultimo vaciado.

## Alcance

VIN-013B introduce una operacion segura para vaciar el conocimiento del workspace autenticado.

El reset elimina conocimiento, no identidad. La sesion actual, el usuario, el workspace, los dispositivos, preferencias, credenciales y estructura de IndexedDB se conservan.

El flujo previsto para el usuario es:

1. Respaldar conocimiento.
2. Vaciar conocimiento.
3. Confirmar workspace vacio.
4. Restaurar el respaldo cuando corresponda.
5. Confirmar que el conocimiento reaparece y vuelve a sincronizar.

## Datos Eliminados

El reset elimina, solo para el workspace autenticado:

- capturas `Node`, incluidas archivadas;
- conceptos `Context`, incluidos archivados;
- relaciones `NodeContextRelation`;
- borrador local de captura;
- mutaciones pendientes de sync asociadas al workspace;
- metadata local de sync que podria reactivar contenido antiguo.

## Datos Conservados

El reset no elimina:

- usuario;
- workspace;
- membership;
- dispositivos;
- sesion autenticada;
- tokens almacenados;
- preferencias;
- configuracion local;
- stores de IndexedDB;
- esquema Prisma;
- migraciones;
- variables de entorno.

## Estrategia Remota

El vaciado remoto se ejecuta mediante:

```text
POST /api/knowledge/reset
```

El body exige:

```json
{
  "workspaceId": "...",
  "confirmation": "VACIAR"
}
```

El endpoint:

- requiere autenticacion;
- valida la confirmacion literal `VACIAR`;
- compara el `workspaceId` solicitado con el workspace del token;
- rechaza resets cross-workspace;
- comprueba que el workspace exista;
- ejecuta una transaccion;
- elimina relaciones, capturas y conceptos;
- registra un evento remoto de reset;
- devuelve solo conteos y metadata del reset.

La respuesta no transporta contenido eliminado.

## Estrategia Sync

El modelo actual no tiene tombstones masivos para representar miles de eliminaciones como cambios independientes.

VIN-013B usa un evento remoto especial:

```text
workspaceKnowledgeReset
```

El evento incluye:

- `workspaceId`;
- `resetVersion`;
- `occurredAt`.

Para evitar una migracion Prisma, el servidor registra el reset como un marcador en `SyncChange` usando el esquema existente. El marcador usa la combinacion interna `CAPTURE` + `ARCHIVE` + `entityVersion: 0` y `entityId` igual al workspace. Al listar cambios, ese marcador se proyecta al contrato publico `workspaceKnowledgeReset`.

Cuando otro cliente recibe el evento por Pull:

- limpia capturas locales del workspace;
- limpia conceptos locales del workspace;
- limpia relaciones locales del workspace;
- elimina outbox pendiente incompatible;
- avanza el cursor;
- invalida la UI.

Esto evita que Pull vuelva a hidratar contenido remoto eliminado.

## Limpieza Local

La limpieza local ocurre solo despues de que el reset remoto responde con exito.

Si el reset remoto falla, IndexedDB local permanece intacto.

La limpieza local usa una transaccion IndexedDB sobre:

- `node_context_relations`;
- `nodes`;
- `contexts`;
- `sync_mutations`;
- `sync_metadata`.

Luego limpia el borrador de captura mediante el adaptador de storage y emite invalidacion para refrescar la UI sin recargar.

## Confirmacion

Desde VIN-013C, el reset vive dentro del centro `Mi conocimiento`.

El centro agrega:

```text
Vaciar conocimiento
```

La accion abre un dialogo con:

- conteo de capturas;
- conteo de conceptos;
- conteo de relaciones;
- advertencia de alcance en todos los dispositivos;
- recomendacion de respaldar primero;
- campo de confirmacion.

El boton destructivo solo se habilita cuando el usuario escribe exactamente:

```text
VACIAR
```

La logica vuelve a validar esa confirmacion antes de llamar al endpoint.

## Concurrencia

VIN-013B bloquea resets concurrentes en el runtime actual mediante un lock de modulo.

Mientras el reset esta en curso:

- el menu impide iniciar restore;
- el menu impide iniciar otro reset;
- CaptureSurface y QuickCaptureSheet rechazan nuevas capturas;
- la outbox del workspace se limpia despues del exito remoto.

El reset remoto idempotente devuelve exito aun cuando ya no existan datos, con conteos cero.

## Feedback

La UI usa el sistema visual unificado:

- `saving` durante la preparacion o ejecucion;
- `success` cuando el conocimiento fue vaciado;
- `error` si falla la preparacion, confirmacion, autenticacion, API o limpieza.

No se agregan toasts ni una pantalla nueva.

## Seguridad

La operacion:

- no acepta `userId` desde el cliente;
- no imprime contenido eliminado;
- no expone tokens;
- no borra datos de otros workspaces locales;
- no usa `deleteDatabase`;
- no modifica Prisma;
- no crea migraciones.

## Restore Posterior

VIN-013A sigue siendo el camino de recuperacion.

Despues del reset, el usuario puede seleccionar `Restaurar conocimiento` desde el mismo centro. La restauracion mantiene su comportamiento de merge seguro y genera nuevas mutaciones locales sync-aware para volver a publicar el conocimiento.

## Guia Manual

No ejecutar esta guia contra datos reales sin respaldo verificado.

1. Iniciar sesion.
2. Usar `Respaldar conocimiento`.
3. Abrir el JSON descargado y verificar conteos.
4. Guardar copia fuera del proyecto.
5. Abrir `Vaciar conocimiento`.
6. Revisar los conteos del dialogo.
7. Escribir `VACIAR`.
8. Confirmar.
9. Revisar que Inicio quede sin recuerdos ni conceptos locales.
10. Revisar Archivo.
11. Revisar Base de conocimiento.
12. Confirmar que otro cliente recibe el reset por Pull.
13. Restaurar el JSON.
14. Confirmar que capturas, conceptos y relaciones reaparecen.
15. Confirmar que la sincronizacion publica la restauracion.

## Limitaciones

- El bloqueo de mutaciones concurrentes es local al runtime del cliente.
- No se implementa una pantalla dedicada de auditoria del reset.
- No se ejecuta Pull de verificacion desde esta funcion; el ciclo de sync existente puede hacerlo despues.
- No se implementa rate limit nuevo en este paquete.
- La garantia de respaldo queda en manos del usuario porque el navegador no puede comprobar que el archivo descargado fue conservado.
