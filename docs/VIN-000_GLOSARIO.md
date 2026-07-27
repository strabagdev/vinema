# VIN-000 - Glosario

## Terminos oficiales provisionales

### Fuente

Origen original de una informacion. En el MVP puede ser texto plano escrito por
el usuario. Debe mantenerse trazable y visible.

### Captura

Accion o instancia mediante la cual una fuente entra en Vinema. Todavia no se
decide si sera entidad persistente separada.

### Contenido

Texto o datos de una fuente. En el estado actual corresponde principalmente a
`Node.content`.

### Concepto

Idea, entidad, persona, lugar, proyecto, problema o tema que permite acceder a
fuentes relacionadas. No es una carpeta ni una etiqueta decorativa.

### Relacion

Vinculo significativo entre fuente y concepto, conceptos entre si o
eventualmente fuentes. Hoy existe parcialmente como `NodeContextRelation`.

### Memoria

Red formada por fuentes, conceptos y relaciones. No es una nota individual ni un
archivo.

### Acceso

Proceso de llegar a la informacion correcta con el menor esfuerzo cognitivo
posible.

### Navegacion

Movimiento entre fuentes, conceptos, relaciones, tiempo y pistas recordadas. No
equivale a recorrer un arbol.

### Contexto

Termino actualmente implementado para Areas, Proyectos y Personas. Uso permitido
durante la transicion como punto de entrada manual. Reemplazo posible:
`Concepto`.

### Origen

Lugar o fuente desde donde proviene una informacion. Debe conservar trazabilidad.

### Recuerdo

Resultado humano de recuperar una parte de la memoria. No usar como nombre
automatico de la unidad persistida.

### Nota

Termino de interfaz para una fuente textual editable. Uso permitido en UI
mientras se valida el modelo de Fuente.

### Etiqueta

Marcador manual simple. Vinema no debe reducir conceptos a etiquetas
tradicionales.

### Carpeta

Ubicacion jerarquica. No pertenece al modelo mental de Vinema.

## Terminos anteriores y transicion

| Termino antiguo | Reemplazo sugerido | Motivo | Uso permitido |
| --- | --- | --- | --- |
| Nota | Fuente textual | La nota es hoy la fuente inicial, pero no define el producto | UI actual y transicion |
| Contexto | Concepto | El roadmap habla de puntos de entrada amplios | Codigo actual hasta validar busqueda |
| Proyecto | Concepto tipo proyecto | Evitar confundir con gestion de tareas | UI actual |
| Area | Concepto tipo area | Evitar taxonomia obligatoria | UI actual |
| Persona | Concepto tipo persona | Punto de entrada util | UI actual |
| Organizar | Relacionar / hacer accesible | Organizar sugiere archivo | Evitar en nuevas UI |
| Guardar en | Relacionar con | Implica ubicacion | No usar para relaciones |
| Recuerdo | Resultado de recuperacion | No es insumo almacenado | Solo lenguaje conceptual |
