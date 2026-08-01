# VIN-011B — Contextual Exploration Mode

## Decision de producto

Explorar no es una seccion global equivalente a Inicio. En Vinema la exploracion comienza al abrir un concepto concreto.

El recorrido esperado es:

```text
Superficie de pensamiento
-> concepto
-> recuerdos / tiempo / conexiones
-> otro concepto
```

No se introduce una entidad Plaza, grafo persistido, IA, SSE ni contratos nuevos.

## Ruta canonica

La ruta canonica implementada es:

```text
/concepts/detail?contextId=<id>
```

Se eligio una ruta estatica con query param para mantener compatibilidad con el patron actual de Vinema, Tauri y rutas restaurables. Las rutas heredadas `/contexts/*` siguen existiendo como compatibilidad.

## Modo contextual

Un `Context` pasa a ser el centro actual de exploracion. La pantalla muestra:

- nombre del concepto;
- cantidad de recuerdos relacionados;
- cantidad de conceptos conectados;
- vista `Recuerdos`;
- vista `Tiempo`;
- caminos cercanos por coocurrencia.

No se muestra breadcrumb CRUD ni una pantalla global de Explorar.

## Recuerdos

Los recuerdos son capturas relacionadas al concepto central por `NodeContextRelation`.

Cada recuerdo muestra:

- identidad emergente si existe;
- fragmento del contenido;
- fecha;
- link al detalle.

No se fabrica titulo ni se duplica la primera linea.

## Conexiones derivadas

Como no existe una relacion concepto-concepto persistida, las conexiones se derivan por coocurrencia:

Dos conceptos estan conectados cuando aparecen aceptados en una o mas capturas activas comunes.

La funcion pura `deriveConceptNeighborhood` calcula:

- concepto central;
- conceptos relacionados;
- cantidad de capturas compartidas;
- ultima actividad compartida;
- capturas compartidas como evidencia.

Orden:

1. mayor cantidad de capturas compartidas;
2. actividad compartida mas reciente;
3. label estable.

Se excluyen:

- concepto actual;
- conceptos archivados;
- capturas archivadas;
- duplicados por label normalizado.

## Historial local

La navegacion entre conceptos mantiene un historial local de la sesion.

Al abrir un concepto conectado, el centro cambia y la URL se actualiza. `Volver` regresa al concepto anterior. Si la ruta se abre directamente o no hay historial local, `Volver` usa el `returnTo` recibido o vuelve a `/`.

No se persiste ni sincroniza este historial.

## Tiempo

VIN-011B implementa una vista temporal basica porque las capturas ya tienen timestamps confiables.

La agrupacion usa:

- Hoy;
- Ayer;
- Ultimos 7 dias;
- mes y año.

No se genera narrativa ni timeline ornamental.

## Preparacion para Mapa

No se renderiza un grafo visual. El modelo `ConceptNeighborhood` deja lista la informacion que una fase futura podria usar para VIN-011C:

- concepto central;
- conceptos relacionados;
- fuerza por coocurrencia;
- evidencia por capturas compartidas.

## Navegacion global

El header principal queda reducido a:

- marca Vinema, que vuelve a Inicio;
- accion de escritura;
- estado local cuando corresponde;
- menu de sesion.

`Explorar` ya no existe como boton global. `Archivo` se movio al menu de sesion.

## Paneles progresivos

Los paneles contextuales de la superficie principal ahora se anclan al indicador activo, no a toda la fila. Esto mantiene la relacion visual inmediata entre icono y panel.

Se conserva:

- comportamiento efimero;
- hover/focus/click;
- delay de cierre;
- bottom sheet en touch/mobile;
- desktop sin X;
- sin divisor interno.

## Sincronizacion

La vista usa `useSyncDataInvalidation()` para reaccionar a cambios locales o recibidos por Pull en:

- capturas;
- conceptos;
- relaciones captura-concepto.

No hay polling adicional.

## Limitaciones

- No existe grafo completo.
- No existe IA.
- No existe SSE.
- No existe Plaza.
- No se persisten conexiones derivadas.
- Las vistas heredadas de Contextos siguen disponibles por compatibilidad.
