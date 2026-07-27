# VIN-008 - Linea base de recuperacion local

## 1. Problema

Vinema ya permite capturar ideas, convertirlas en notas, editarlas, archivarlas
y relacionarlas con contextos. Sin embargo, recuperar una fuente dependia
principalmente de listados temporales o de haber creado relaciones manuales.

Ese estado obligaba al usuario a recordar donde mirar. Para la filosofia de
Vinema, esa dependencia es insuficiente: la memoria local debe poder comenzar
desde una pista imperfecta, como una frase, un tema, una persona o un contexto.

## 2. Objetivo

VIN-008 establece la primera recuperacion textual local de Vinema.

El usuario puede buscar sobre fuentes existentes sin conexion, sin servicios
externos y sin cambiar el esquema de datos. El objetivo no es una busqueda
sofisticada, sino una base confiable para encontrar una nota recordando algo de
ella.

## 3. Alcance

Incluido:

- busqueda local por titulo;
- busqueda local por contenido;
- busqueda local por contextos asociados;
- normalizacion de mayusculas, acentos y espacios redundantes;
- resultados con fuente, extracto, fecha, contextos y razon de coincidencia;
- apertura del resultado en modo lectura;
- regreso al origen de busqueda cuando corresponde.

Fuera de alcance:

- embeddings;
- IA generativa;
- servicios remotos;
- indices vectoriales;
- grafos;
- nuevos tipos de contexto;
- cambios de esquema IndexedDB.

## 4. Comportamiento

La entrada visible es `/search`, presentada en la navegacion como "Buscar".

Una consulta vacia no devuelve ruido. Cuando existe una consulta, Vinema recorre
las notas activas del workspace local y compara la pista contra titulo,
contenido y nombres de contextos asociados.

Cada resultado muestra:

- titulo legible de la fuente;
- extracto cercano a la coincidencia cuando existe contenido coincidente;
- campos que explican la coincidencia;
- contextos relacionados;
- fecha de ultima actualizacion;
- enlace al detalle de la nota.

Los contextos mostrados siguen enlazando a su detalle existente. No se crean
jerarquias ni contenedores nuevos.

Tras VIN-008A, el recorrido preserva el origen cuando corresponde:

- busqueda;
- contexto seleccionado desde un resultado;
- nota relacionada abierta desde ese contexto;
- vuelta al contexto;
- vuelta a la busqueda original.

## 5. Modelo de resultado

El resultado de recuperacion se modela como una vista derivada, no como una
entidad persistida:

- `nodeId`;
- `title`;
- `excerpt`;
- `matchedFields`;
- `contexts`;
- `updatedAt`;
- `score`.

`matchedFields` puede indicar coincidencias en `title`, `content` o `context`.
Este modelo permite explicar por que aparece una fuente sin almacenar telemetria
ni introducir estructuras permanentes prematuras.

## 6. Ranking

El orden inicial favorece senales simples y verificables:

1. coincidencia exacta de titulo;
2. coincidencia parcial de titulo;
3. coincidencia en contexto;
4. coincidencia en contenido;
5. cantidad de tokens encontrados;
6. fecha de actualizacion como desempate.

La puntuacion es deliberadamente simple. Debe ser entendible, testeable y facil
de reemplazar cuando exista evidencia de uso real.

## 7. Decisiones tecnicas

La recuperacion se implementa como filtrado directo sobre IndexedDB mediante el
repositorio de nodos.

No se agregaron stores, indices ni migraciones. El volumen actual esperado no
justifica complejidad adicional, y el paquete busca validar la experiencia antes
de optimizar la infraestructura.

La logica quedo separada en:

- normalizacion de texto;
- rutas de recuperacion;
- modelo de resultado;
- caso de uso de busqueda;
- adaptacion de repositorio;
- componentes de interfaz.

## 8. Limites conocidos

- El extracto se calcula sobre contenido textual plano.
- No existe resaltado visual de terminos.
- No hay sinonimos, alias ni busqueda semantica.
- La busqueda no incluye notas archivadas.
- El rendimiento depende de recorrer fuentes activas del workspace.
- Referencias inconsistentes a contextos se ignoran para preservar la consulta.
- La validacion offline manual queda pendiente; la compatibilidad tecnica se
  apoya en IndexedDB y en el precache de `/search`.

## 8.1 Seguridad de navegacion

Los parametros de retorno se consideran datos no confiables. `returnTo` acepta
solo rutas internas seguras y rechaza URLs absolutas, protocolos y rutas que
comiencen con `//`.

Cuando `returnTo` es invalido, Vinema usa un destino interno seguro por defecto.

## 9. Relacion con la hipotesis

La hipotesis principal de Vinema es que el usuario no deberia recordar donde
guardo una nota, sino desde que pista quiere volver a ella.

VIN-008 valida el primer tramo de esa hipotesis: una fuente puede recuperarse por
fragmentos recordados y por contextos ya relacionados, sin exigir organizacion
previa ni conexion remota.

## 10. Pruebas

La linea base se cubre con pruebas para:

- coincidencia por titulo;
- coincidencia por contenido;
- coincidencia por contexto;
- normalizacion de acentos, mayusculas y espacios;
- consulta vacia;
- cero resultados;
- orden por relevancia y fecha;
- extracto relevante;
- actualizacion posterior a editar una fuente;
- desaparicion de fuentes archivadas;
- construccion de rutas de navegacion.

## 11. Siguientes experimentos

- Resaltar el fragmento exacto que hizo aparecer una fuente.
- Diferenciar mejor coincidencias por frase exacta y tokens dispersos.
- Medir localmente, sin telemetria externa, si la persona abre un resultado util.
- Permitir refinamientos por contexto o fecha sin convertirlos en filtros
  obligatorios.
- Evaluar alias de conceptos antes de introducir busqueda semantica.
