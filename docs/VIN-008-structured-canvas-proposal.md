# VIN-008 - Structured Canvas Proposal

## Decision central

Vinema debe permitir escribir primero y estructurar despues.

La estructura debe aparecer como una ayuda posterior, progresiva y reversible. Si el usuario tiene que elegir "titulo", "cita" o "bloque" antes de pensar, el canvas pierde su ventaja principal: capturar sin friccion.

## Objetivo

Evolucionar el canvas hacia contenido visualmente estructurado y expresivo, similar a una respuesta bien organizada, sin convertir Vinema en un procesador de texto tradicional.

El canvas debe seguir siendo un lugar para capturar pensamiento vivo. La estructura debe servir para leer, recuperar, relacionar y convertir conocimiento, no para decorar texto ni administrar formato manual.

## Elementos de contenido

VIN-008 debe considerar estos elementos como representaciones posibles, no como elecciones obligatorias al inicio:

- Parrafo.
- Titulo.
- Subtitulo.
- Lista ordenada.
- Lista con vinetas.
- Cita.
- Callout.
- Separador.
- Codigo.
- Tabla simple.
- Bloque de decision.
- Tarea.
- Concepto.
- Relacion.
- Fragmento.
- Hecho.
- Evento.

## Principios

- Captura rapida: abrir, escribir, capturar.
- Estructura opcional: el texto plano siempre debe ser valido.
- Sin formato previo obligatorio: el usuario no debe elegir bloque antes de escribir.
- Conversion posterior: texto plano puede convertirse a bloques despues de existir.
- Trazabilidad: la captura original se conserva como fuente canonica.
- Navegacion por teclado: Enter, flechas, Tab, Escape y shortcuts deben sentirse naturales.
- Consistencia responsive: movil, tablet y escritorio comparten modelo mental.
- Sin scroll global: el viewport queda fijo y el scroll vive dentro del canvas.
- Identidad visual propia: no parecer Notion, Google Docs ni un CMS.
- Sistema visual estable: el canvas conserva ancho amplio, tipografia unica y ajuste de tamano mediante `-A`/`+A`; la estructura futura no debe reintroducir configuracion de ancho o fuente.
- Seleccion personalizada: seleccionar texto debe seguir habilitando captura de conceptos y fragmentos.
- Local-first: escritura, edicion y conversion deben funcionar offline.
- Sync-ready: el modelo debe admitir sincronizacion futura y resolucion de conflictos.

## Evaluacion tecnica

### Textarea enriquecido

Complejidad: baja inicialmente, alta si se simulan bloques.
Accesibilidad: excelente para texto plano.
Soporte movil: excelente.
Colaboracion: limitada.
Serializacion: simple.
Migraciones: simples.
Offline: excelente.
Rendimiento: excelente.
Control visual: limitado.
Dependencia externa: ninguna.

Uso recomendado: VIN-008A como puente, manteniendo escritura simple y aplicando estructura visual ligera fuera del flujo de entrada.

### contenteditable

Complejidad: media-alta.
Accesibilidad: variable, requiere mucho cuidado.
Soporte movil: irregular, especialmente seleccion, IME y teclado virtual.
Colaboracion: posible pero dificil sin modelo robusto.
Serializacion: riesgosa si se depende del DOM.
Migraciones: medianas.
Offline: buena si el modelo propio esta bien separado.
Rendimiento: bueno con documentos pequenos.
Control visual: alto.
Dependencia externa: ninguna.

Uso recomendado: evitar como base propia salvo que el alcance sea muy pequeno. El costo oculto esta en seleccion, normalizacion y compatibilidad movil.

### Editor por bloques propio

Complejidad: alta.
Accesibilidad: alta exigencia.
Soporte movil: requiere diseno cuidadoso.
Colaboracion: viable si el modelo de operaciones se disena desde el inicio.
Serializacion: excelente si el modelo es propio.
Migraciones: controlables.
Offline: excelente.
Rendimiento: bueno si se virtualiza cuando haga falta.
Control visual: maximo.
Dependencia externa: ninguna.

Uso recomendado: posible a mediano plazo, pero no como primer salto. Conviene llegar despues de validar tipos semanticos y conversion desde texto.

### ProseMirror / Tiptap

Complejidad: media-alta.
Accesibilidad: buena si se implementa con disciplina.
Soporte movil: razonable, con bordes conocidos.
Colaboracion: fuerte ecosistema.
Serializacion: buena mediante schema JSON.
Migraciones: buenas si el schema se versiona.
Offline: viable.
Rendimiento: bueno.
Control visual: alto.
Dependencia externa: alta.

Uso recomendado: candidato fuerte si Vinema necesita edicion rica real sin construir todo desde cero. Tiptap acelera UI, ProseMirror da control mas bajo nivel.

### Lexical

Complejidad: media.
Accesibilidad: buena.
Soporte movil: bueno, aunque requiere pruebas intensivas.
Colaboracion: posible, menos neutral que ProseMirror.
Serializacion: buena.
Migraciones: buenas si se controla el schema.
Offline: viable.
Rendimiento: muy bueno.
Control visual: alto.
Dependencia externa: media-alta.

Uso recomendado: candidato fuerte para VIN-008A/VIN-008B si se prioriza rendimiento, composicion moderna y una experiencia expresiva.

### Slate

Complejidad: media-alta.
Accesibilidad: depende mucho de la implementacion.
Soporte movil: historicamente mas delicado.
Colaboracion: posible, pero menos directa.
Serializacion: flexible.
Migraciones: flexibles pero faciles de desordenar.
Offline: viable.
Rendimiento: variable.
Control visual: alto.
Dependencia externa: media.

Uso recomendado: no parece la mejor primera opcion para Vinema salvo que se valore mucho su flexibilidad de modelo.

### Implementacion propia completa

Complejidad: muy alta.
Accesibilidad: responsabilidad total.
Soporte movil: responsabilidad total.
Colaboracion: responsabilidad total.
Serializacion: maxima libertad.
Migraciones: maxima libertad, maximo riesgo.
Offline: excelente si se disena bien.
Rendimiento: controlable.
Control visual: maximo.
Dependencia externa: ninguna.

Uso recomendado: evitar como primer editor enriquecido. Puede ser destino final si Vinema descubre una interaccion muy propia que las librerias no puedan sostener.

## Modelo conceptual

La captura original debe conservarse como fuente. Los bloques son una vista estructurada, derivada o enriquecida, no un reemplazo irreversible.

```ts
type Capture = {
  id: string;
  originalText: string;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
  metadata: CaptureMetadata;
};

type Block = {
  id: string;
  captureId: string;
  type: BlockType;
  content: BlockContent;
  order: BlockOrder;
  metadata: BlockMetadata;
  sourceRange?: SourceRange;
  derivedFrom?: DerivedFrom;
};

type BlockType =
  | "paragraph"
  | "heading"
  | "subheading"
  | "ordered_list"
  | "bullet_list"
  | "quote"
  | "callout"
  | "divider"
  | "code"
  | "simple_table"
  | "decision"
  | "task"
  | "concept"
  | "relation"
  | "fragment"
  | "fact"
  | "event";

type BlockContent = {
  text?: string;
  items?: string[];
  language?: string;
  rows?: string[][];
  checked?: boolean;
  conceptId?: string;
  relationId?: string;
};

type BlockOrder = {
  index: number;
  parentBlockId?: string;
};

type BlockMetadata = {
  version: number;
  confidence?: number;
  createdBy: "user" | "system";
  acceptedByUser?: boolean;
};

type SourceRange = {
  start: number;
  end: number;
};

type DerivedFrom = {
  captureId: string;
  blockId?: string;
  sourceRange?: SourceRange;
  method: "manual" | "parser" | "suggestion" | "model";
};
```

## Conversion desde texto plano

La conversion debe ser posterior y transparente:

- El usuario escribe texto plano.
- Vinema guarda `originalText`.
- Un parser local detecta candidatos: titulos, listas, tareas, decisiones, fechas, conceptos.
- Vinema puede mostrar una vista estructurada sugerida.
- El usuario acepta, edita o ignora.
- Cada bloque conserva `sourceRange` cuando proviene del texto original.

## Fases propuestas

### VIN-008A: editor enriquecido basico

- Mantener entrada rapida.
- Permitir parrafos, saltos, seleccion robusta y estilos visuales basicos.
- Definir serializacion inicial.
- Evaluar Lexical y ProseMirror con pruebas moviles reales.

### VIN-008B: bloques semanticos

- Introducir `Block`, `BlockType`, `BlockOrder` y `BlockMetadata`.
- Soportar bloques de decision, tarea, concepto, hecho y evento.
- Mantener lectura desde `originalText`.

### VIN-008C: conversion automatica desde texto

- Convertir texto plano a bloques sugeridos.
- Mantener trazabilidad con `SourceRange`.
- Permitir aceptar o descartar conversion.

### VIN-008D: relaciones y conceptos visuales

- Mostrar conceptos y relaciones como elementos del canvas.
- Permitir navegar desde bloque a memoria relacionada.
- Conservar seleccion de texto como accion primaria.

### VIN-008E: comandos y atajos

- Agregar comandos posteriores a escritura.
- Usar shortcuts para transformar seleccion o bloque actual.
- Evitar una barra de herramientas dominante.

## Recomendacion inicial

Para VIN-008A, la opcion mas razonable es prototipar Lexical y ProseMirror/Tiptap en paralelo con criterios estrictos:

- Escritura primero.
- Seleccion movil confiable.
- Serializacion JSON controlada.
- Bloques derivados desde texto plano.
- Offline sin servidor.
- Sin scroll global.

Recomendacion inicial: empezar con Lexical como prototipo principal por rendimiento, arquitectura moderna y control visual, y mantener ProseMirror/Tiptap como comparador por madurez de schema, ecosistema y colaboracion.
