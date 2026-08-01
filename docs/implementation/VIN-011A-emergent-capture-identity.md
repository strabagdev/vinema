# VIN-011A — Emerging Capture Identity

## Filosofia

Una captura en Vinema no tiene titulo. El titulo no se escribe ni se genera. La identidad emerge de las asociaciones que el usuario valida.

La captura sigue siendo una fuente: su cuerpo conserva el contenido escrito y sus conceptos aceptados ofrecen una forma contextual de reconocerla sin duplicar la primera linea.

## Titulo vs identidad

La identidad emergente no es un campo persistido.

No se guarda como `title`, `displayTitle` ni texto derivado. Tampoco se genera desde la primera linea, no duplica el cuerpo y no usa IA. Es una vista calculada desde datos de dominio ya existentes:

- `Context`;
- `NodeContextRelation`;
- `Node`.

## Origen

Solo forman parte de la identidad los conceptos que ya tienen una relacion persistida con la captura.

Las sugerencias ignoradas no aparecen. Los conceptos inferidos mientras se escribe tampoco aparecen hasta que el usuario los acepta y se crea o reutiliza un `Context` con su `NodeContextRelation`.

## Derivacion

La funcion pura `deriveCaptureEmergentIdentity` recibe contextos y relaciones, filtra, ordena, deduplica y construye una representacion compacta.

Reglas actuales:

- excluye conceptos archivados;
- excluye relaciones que no pertenecen a la captura evaluada;
- deduplica por nombre normalizado;
- preserva el label visible del primer concepto aceptado;
- no usa contenido como fallback conceptual;
- devuelve `displayText: null` cuando no hay conceptos aceptados.

## Orden

`NodeContextRelation` no tiene un campo de orden explicito. VIN-011A usa `createdAt` de la relacion como mejor aproximacion del orden de aceptacion.

Si dos relaciones tienen la misma fecha, el orden cae a `label` y luego a `id` para mantenerse deterministico.

## Limite visible

La identidad compacta muestra hasta 3 conceptos visibles.

Si hay mas, se muestra un contador adicional:

```text
Railway · Sincronizacion · Workspace · +2
```

El componente conserva todos los conceptos en el `title` y en el `aria-label`.

## Integracion

La identidad se integra en:

- detalle de captura;
- Historial;
- Archivo;
- resultados de "Me recuerda a" en la superficie principal;
- resultados de "Me recuerda a" en captura rapida.

Cuando no hay conceptos aceptados, la vista omite la identidad y muestra solo el fragmento del contenido. No se escribe "Sin titulo".

## Sincronizacion

No se sincroniza ningun titulo.

La identidad converge entre dispositivos porque ya se sincronizan:

- capturas (`Node`);
- conceptos (`Context`);
- relaciones (`NodeContextRelation`).

Despues de un Pull, las vistas se invalidan por los eventos existentes y recalculan la identidad desde IndexedDB local.

## Casos sin conceptos

Una captura historica o nueva sin relaciones no tiene identidad emergente visible. En listados se muestra solamente el fragmento de contenido.

## Limitaciones

Las relaciones actuales no tienen estado archivado. Desasociar una captura elimina la relacion, por lo que una relacion eliminada deja de participar en la identidad. Si en el futuro existe archivado de relaciones, el selector debera excluirlas explicitamente.

El orden por `createdAt` representa el orden de persistencia, no necesariamente el orden exacto de seleccion visual si varias relaciones se guardan en paralelo.

## Relacion futura con Plazas

Plazas, mapas o vistas conceptuales podran reutilizar la identidad emergente sin introducir titulos persistidos. La regla permanente se mantiene: la identidad de una captura surge de sus asociaciones aceptadas.
