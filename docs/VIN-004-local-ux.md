# VIN-004 - Experiencia local

## VIN-004A - Modo lectura en detalle

El detalle de nota abre en modo lectura. El usuario entra al formulario solo con
la accion explicita `Editar`; `Cancelar` descarta el borrador no guardado y
`Guardar` persiste manualmente y vuelve a lectura.

## VIN-004B - Autosave controlado

El editor de notas incorpora autosave durante el modo edicion.

### Debounce

El autosave usa un debounce de 700 ms. No se escribe en IndexedDB por cada tecla:
el guardado se programa solo cuando hay cambios reales respecto del ultimo
estado persistido.

### Estados de guardado

El estado visual se modela como un unico valor:

- `idle`: sin actividad visible.
- `dirty`: cambios sin guardar.
- `saving`: guardando.
- `saved`: guardado.
- `error`: error al guardar.

La interfaz muestra texto visible: `Cambios sin guardar`, `Guardando...`,
`Guardado` o `Error al guardar`.

### Autosave, Guardar y Ctrl+S

- Autosave: guarda despues del debounce, mantiene el modo edicion abierto y
  actualiza la base usada para detectar cambios futuros.
- Boton `Guardar`: cancela el debounce pendiente, guarda inmediatamente si hay
  cambios validos y vuelve a modo lectura. Si no hay cambios, vuelve a lectura
  sin escribir.
- `Ctrl+S` / `Cmd+S`: cancela el debounce pendiente, guarda inmediatamente y
  mantiene la edicion abierta.

### Cancelar

`Cancelar` cancela cualquier debounce pendiente y vuelve a lectura mostrando el
ultimo contenido efectivamente persistido. Si un autosave ya finalizo, esos
cambios se consideran guardados; cancelar solo descarta cambios posteriores.

### Errores

Si falla el guardado, el borrador permanece en pantalla, se muestra el error y
el usuario puede reintentar con `Guardar`, `Ctrl+S` o con el siguiente cambio
que reactive el autosave.

### Condiciones de carrera

Cada guardado usa un snapshot del borrador. Cuando termina, el editor compara ese
snapshot con el borrador actual. Si el usuario escribio algo mas nuevo mientras
el guardado estaba en curso, la UI conserva `Cambios sin guardar` y agenda otro
autosave, evitando marcar como guardados cambios que aun no se persistieron.

### Salida

La accion `Volver` intenta guardar cambios pendientes antes de navegar a
`/notes`. Si el flush falla, no navega y muestra el error.
