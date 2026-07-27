# VIN-020.3 - Auditoria de recuperacion y conceptos en tiempo real

## Problema observado

Al escribir una consulta corta y especifica como `mitcom`, Inicio podia quedar
mostrando `Recordando...` durante demasiado tiempo. La recuperacion local no
debe sentirse indefinida: debe esperar el debounce, evaluar una vez y cerrar el
estado de carga aunque no existan resultados.

## Causa real

La causa principal estaba en la estabilidad de dependencias del hook
`useAssociationSuggestions`.

La superficie pasaba `selectedCaptureIds: []` como literal. Ese array era nuevo
en cada render. El hook lo usaba como dependencia del `useEffect`.

El ciclo problematico era:

1. El usuario escribe.
2. El hook programa el debounce.
3. Al terminar el debounce, el hook marca `status: "loading"`.
4. Ese cambio renderiza el componente.
5. El render crea un nuevo `[]`.
6. El efecto detecta una dependencia distinta.
7. Cancela la busqueda anterior y programa otra.
8. La UI puede permanecer en `Recordando...`.

Esto no era un problema de IndexedDB lento ni de falta de permisos.

## Problema secundario

El motor VIN-019 exigia una consulta minima de 12 caracteres y 2 tokens. Una
palabra especifica como `mitcom` tenia 6 caracteres y 1 token, por lo que nunca
podia producir recuperacion aunque fuera una coincidencia clara.

## Flujo auditado

Al escribir se ejecuta `useAssociationSuggestions`.

El hook:

1. normaliza el texto;
2. espera el debounce;
3. lee capturas una vez;
4. lee conceptos existentes una vez;
5. lee relaciones una vez;
6. construye el indice de recuperacion una vez;
7. ejecuta recuperacion;
8. ejecuta sugerencia de conceptos;
9. actualiza estado solo si la solicitud sigue vigente.

Recuperacion y conceptos comparten los mismos datos leidos. No se consultan
capturas por separado para cada funcion.

## Correccion

Se reemplazo la dependencia directa de arrays por claves estables derivadas de
su contenido. Un array nuevo con el mismo contenido ya no reinicia el efecto.

Tambien se adelanto el contador de solicitud al inicio del efecto. Asi, una
busqueda anterior no puede sobrescribir una consulta mas nueva durante la ventana
de debounce.

Las consultas vacias terminan inmediatamente en `idle` sin tocar IndexedDB.

## Consultas cortas

La recuperacion ahora permite una consulta util desde 4 caracteres y 1 token.
Esto permite que terminos especificos como `mitcom` recuperen capturas locales
sin exigir frases largas.

La sugerencia de conceptos tambien puede evaluar un unico token significativo.

## Instrumentacion

El estado del hook incluye `diagnostics`, con:

- tiempo de debounce;
- lectura de capturas;
- lectura de conceptos;
- lectura de relaciones;
- preparacion de indice;
- tiempo de recuperacion;
- tiempo de conceptos;
- tiempo total;
- capturas evaluadas;
- conceptos evaluados;
- relaciones leidas;
- resultados producidos.

La instrumentacion queda como dato interno de diagnostico. No se muestra al
usuario y no bloquea la escritura.

## Estados

Si no hay resultados, la seccion de recuperacion desaparece cuando el estado
termina. No queda `Recordando...` visible.

Si hay resultados, se muestran en `Esto me recordó a...`.

Si hay error de relaciones, la recuperacion textual sigue funcionando. La
inteligencia asistente no bloquea capturar.

## Pruebas

Se agregaron pruebas para:

- `mitcom` con captura existente;
- `mitcom` sin resultados;
- ausencia de reinicios provocados por `selectedCaptureIds` vacio;
- consultas cortas con un solo token;
- conceptos sugeridos desde un token relacionado.

## Decision

No se oculto simplemente `Recordando...`. Se corrigio la causa del reinicio del
hook y se ajusto el umbral del motor para consultas locales especificas.

## Validacion manual

No se uso Playwright. La validacion manual en navegador queda pendiente para el
usuario o para una ejecucion futura solicitada explicitamente.

## Limitaciones

El indice todavia se reconstruye por consulta. Con el volumen local actual es
aceptable; una cache incremental puede evaluarse cuando existan datos reales que
lo justifiquen.

## Estado posterior a VIN-021

La auditoria de estabilidad se conserva. Sobre esa base, VIN-021 consolida una
evaluacion semantica unica que produce recuperacion y conceptos emergentes desde
la misma evidencia.
