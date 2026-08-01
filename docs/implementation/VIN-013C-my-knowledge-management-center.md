# VIN-013C - My Knowledge Management Center

## Decision de Producto

VIN-013C consolida las acciones de memoria en un unico centro llamado `Mi conocimiento`.

El menu de sesion vuelve a ser minimo:

- Archivo;
- Mi conocimiento;
- Cerrar sesion.

Las acciones de respaldo, restauracion y vaciado dejan de vivir directamente en el menu. El usuario administra su memoria activa desde un lugar claro y no desde una lista de comandos destructivos mezclados con la sesion.

## Centro Mi Conocimiento

`Mi conocimiento` es un dialogo responsive que reune:

- `Respaldar conocimiento`;
- `Restaurar conocimiento`;
- `Vaciar conocimiento`.

El centro muestra un resumen compacto:

```text
22 capturas · 6 conceptos · 15 relaciones
```

No muestra IDs, detalles de base de datos ni el concepto tecnico de workspace.

## Backup

El respaldo reutiliza la implementacion de VIN-013A:

- exporta el JSON versionado;
- descarga el archivo;
- publica feedback visual unificado;
- mantiene abierto el centro para que el usuario continue.

No se modifica el formato del respaldo.

## Restore

La restauracion reutiliza el flujo de VIN-013A:

1. seleccionar JSON;
2. validar;
3. mostrar resumen;
4. confirmar;
5. restaurar;
6. solicitar sync.

La confirmacion aparece dentro del mismo centro. No se apilan modales.

## Reset

El vaciado reutiliza VIN-013B:

- no se ejecuta desde el overview;
- abre una vista de confirmacion fuerte;
- muestra conteos;
- recomienda respaldar primero;
- exige escribir exactamente `VACIAR`;
- no usa `confirm()` nativo;
- no muestra la palabra workspace.

El reset real sigue pasando por el endpoint autenticado y la estrategia de sync `workspaceKnowledgeReset`.

## Estados Internos

El centro usa estados de vista:

- `overview`;
- `restore-confirmation`;
- `reset-confirmation`.

El procesamiento se representa por operacion:

- `backup`;
- `restore`;
- `reset`.

Cerrar el centro limpia seleccion de archivo, confirmacion `VACIAR` y errores temporales cuando no hay una operacion critica en curso.

## Responsive

Desktop:

- dialogo centrado;
- ancho maximo cercano a 640 px;
- alto maximo basado en viewport;
- scroll interno.

Tablet:

- ancho calculado desde viewport;
- max-width razonable;
- acciones y botones adaptables.

Mobile:

- ancho `calc(100vw - 24px)`;
- alto maximo `calc(100dvh - 24px)`;
- botones a ancho completo cuando corresponde;
- contenido con scroll interno;
- sin posicionamiento absoluto para acciones.

El viewport minimo objetivo es 320 px de ancho sin overflow horizontal.

## Accesibilidad

El centro usa Radix Dialog:

- portal fuera del dropdown;
- foco atrapado;
- Escape cierra cuando no hay operacion en curso;
- cierre accesible;
- titulo y descripcion asociados;
- botones con area tactil suficiente;
- selector de archivo con `aria-label`;
- foco inicial en el titulo.

## Feedback

VIN-013C no introduce toasts ni banners.

Se mantiene el feedback visual centralizado del wordmark:

- actividad para backup, restore y reset;
- confirmacion de exito;
- error con texto seguro.

Los errores que requieren decision del usuario tambien pueden aparecer dentro del centro.

## Seguridad

VIN-013C no cambia:

- autenticacion;
- repositorios;
- IndexedDB;
- Prisma;
- contratos remotos;
- endpoint de reset;
- formato de respaldo;
- autorizacion de workspace.

Regla de producto: una cuenta posee una unica memoria activa. El workspace tecnico sigue siendo invisible para la UI.

## Limitaciones

- No existe metadata local persistida para mostrar el ultimo respaldo real. El centro lo deja documentado como pendiente y no inventa una fecha.
- No se agregan opciones de administracion avanzada.
- No se ejecuta reset real durante validacion de desarrollo.
- Las pruebas responsive son de clases/layout DOM; la verificacion visual manual debe hacerse en navegador real cuando se autorice.
