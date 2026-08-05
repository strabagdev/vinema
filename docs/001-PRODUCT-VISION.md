# Product Vision

Version: 1.0

Estado: Documento rector

Ultima actualizacion: 2026-08-05

Proposito: Definir la vision de producto de Vinema como motor de acceso al conocimiento.

## 1. Contexto

Vinema comenzo como una aplicacion local de notas, ideas y contextos. La
direccion conceptual actual la redefine como un motor de acceso al conocimiento
previamente capturado.

El producto no debe evaluarse por cuanta informacion almacena, sino por cuanto
reduce el esfuerzo cognitivo necesario para llegar a informacion ya capturada.

## 2. Problema

Guardar informacion es facil. Encontrarla despues suele depender de recordar:

- el titulo exacto;
- la carpeta o lugar donde fue guardada;
- una etiqueta;
- una fecha precisa;
- una estructura mental mantenida manualmente.

Vinema existe para reducir esa dependencia. Debe permitir partir desde una pista
incompleta, un concepto, una relacion o parte del contexto y llegar a la fuente
original.

## 3. Vision

Vinema debe evolucionar hacia una memoria navegable: una red simple de fuentes,
conceptos y relaciones que permita acceder al conocimiento sin exigir una
taxonomia perfecta.

La interfaz debe ayudar a recordar, no a administrar archivos.

## 4. Mision

Permitir que una persona capture informacion con minima friccion y pueda volver
a ella mediante conceptos, relaciones, contexto y tiempo, preservando siempre la
fuente original.

## 5. Definicion de Vinema

Vinema es un motor de acceso al conocimiento personal que permite llegar a
informacion previamente capturada mediante conceptos, relaciones y contexto,
preservando siempre la fuente original.

Esta definicion es de producto. No debe reemplazarse por una tecnologia como
grafo, embeddings, RAG, chatbot o buscador semantico.

## 6. Que no es Vinema

Vinema no es:

- una aplicacion de notas como fin en si mismo;
- una wiki;
- un sistema de carpetas;
- un gestor de archivos;
- una coleccion de etiquetas;
- un chatbot;
- un sistema RAG;
- una aplicacion de grafos;
- un clon de Obsidian, Notion, OneNote o Apple Notes.

Algunas de esas capacidades pueden aparecer como medios futuros. Ninguna define
el proposito.

## 7. Hipotesis fundacional

Una persona puede acceder a conocimiento previamente capturado con menor
esfuerzo cognitivo cuando navega una red de conceptos y relaciones que cuando
depende de carpetas, titulos o busquedas lineales.

El MVP debe existir para probar esta hipotesis.

## 8. Principios

### La fuente nunca se pierde

Toda informacion accesible debe poder rastrearse hasta su origen. Vinema no debe
ocultar ni reemplazar la fuente.

### El acceso es mas importante que el almacenamiento

El problema central no es guardar. Es llegar a lo guardado cuando vuelve a ser
necesario.

### Los conceptos son puntos de entrada

Personas, proyectos, ideas, lugares, problemas y temas deben poder funcionar
como puertas de acceso. No deben reducirse a carpetas ni etiquetas decorativas.

### Las relaciones producen contexto

Una misma fuente puede relacionarse con multiples conceptos. Forzar una unica
ubicacion empobrece el conocimiento.

### La complejidad debe vivir dentro del sistema

El usuario no debe disenar una taxonomia perfecta para empezar. La organizacion
no puede transformarse en trabajo administrativo permanente.

### La memoria humana se amplifica, no se reemplaza

Vinema no pretende pensar por el usuario. Reduce la distancia entre una pista y
la informacion ya capturada.

### La tecnologia es intercambiable

IndexedDB, grafos, bases relacionales, embeddings o modelos de lenguaje son
medios. No son la identidad del producto.

### Toda funcionalidad debe justificar su costo cognitivo

Una capacidad nueva debe demostrar como facilita el acceso. Si agrega
mantenimiento mental sin mejorar recuperacion, debe simplificarse o posponerse.

## 9. Modelo mental

Modelo provisional:

```text
Fuente original
      ↓
Contenido capturado
      ↓
Conceptos
      ↓
Relaciones
      ↓
Memoria navegable
      ↓
Acceso al conocimiento
```

El acceso puede empezar desde:

- una palabra parcial;
- una persona;
- un proyecto;
- un lugar;
- un problema;
- una fecha aproximada;
- una fuente conocida;
- una relacion con otro concepto.

## 10. Criterio de exito

Vinema tiene exito cuando el usuario puede llegar a una fuente correcta con
menos esfuerzo que usando carpetas, titulos exactos o busquedas lineales.

Senales de exito:

- menor tiempo para encontrar informacion;
- menos intentos;
- menos necesidad de recordar ubicacion;
- mayor confianza en la fuente encontrada;
- relaciones realmente usadas para acceder.

## 11. Limites actuales

El alcance inicial se limita a texto plano:

```text
Texto plano
    ↓
Fuente o captura
    ↓
Conceptos
    ↓
Relaciones
    ↓
Navegacion
    ↓
Acceso al conocimiento
```

Quedan fuera por ahora: PDF, Word, Excel, correos, imagenes, OCR, audio, video,
embeddings como requisito central, RAG, chatbot, agentes, resumenes automaticos
y clasificacion automatica compleja.

## 12. Criterio para futuras funcionalidades

Antes de aprobar una funcionalidad, responder:

1. Reduce el esfuerzo cognitivo para acceder a conocimiento capturado?
2. Mantiene visible la fuente original?
3. Permite recuperar informacion desde una pista incompleta?
4. Evita exigir una ubicacion unica?
5. Aporta relaciones utiles o solo metadata?
6. Puede usarse sin comprender el modelo de datos?
7. Mantiene el MVP enfocado en validar la hipotesis?

Si la respuesta es negativa en puntos centrales, la funcionalidad no pertenece
al nucleo inmediato.
