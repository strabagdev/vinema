# VIN-000 - Inventario funcional

| Funcionalidad | Estado real | Archivos principales | Entidades | Terminologia UI | Alineacion | Riesgos | Recomendacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Shell responsive | Implementado | `src/components/app-shell/*`, `src/app/layout.tsx` | Ninguna | Vinema, navegacion | MANTENER COMO INFRAESTRUCTURA | Sidebar puede priorizar contextos sobre acceso | Mantener y ajustar luego |
| PWA/service worker | Implementado | `src/app/manifest.ts`, `public/sw.js` | Ninguna | App instalable | MANTENER COMO INFRAESTRUCTURA | Cache de rutas debe mantenerse al agregar busqueda | Mantener |
| Tauri | Configurado | `src-tauri`, docs VIN-002 | Ninguna | Escritorio | MANTENER COMO INFRAESTRUCTURA | No validar en cada paquete puede ocultar drift | Mantener |
| StorageAdapter | Implementado | `src/infrastructure/storage/*` | Settings, key-value | No visible | MANTENER COMO INFRAESTRUCTURA | Store legado puede confundir docs | Mantener |
| Device local | Implementado | `src/domain/device/*`, `src/features/device/*` | Device | No visible | MANTENER COMO INFRAESTRUCTURA | Aun no aporta acceso, pero prepara sync | Mantener |
| Workspace local | Implementado | `src/domain/workspace/*`, `src/features/workspace/*` | Workspace | Personal | MANTENER COMO INFRAESTRUCTURA | No debe convertirse en separacion conceptual visible | Mantener |
| Captura Inbox | Implementado | `src/app/inbox/page.tsx`, `create-node.ts` | Node IDEA | Idea, Inbox | MANTENER | Inbox puede verse como bandeja, pero reduce friccion | Mantener |
| Crear nota | Implementado | `src/app/notes/new/page.tsx`, `create-node.ts` | Node NOTE | Nota | MANTENER | Titulo aun puede parecer obligatorio aunque no lo es si hay contenido | Mantener |
| Listado de notas | Implementado | `src/app/notes/page.tsx`, `use-nodes.ts` | Node | Notas | ADAPTAR | Lista por recencia no basta para acceso | Mantener, complementar con busqueda |
| Detalle modo lectura | Implementado | `note-detail-client.tsx` | Node | Nota, Editar | MANTENER | Ninguno relevante | Mantener |
| Autosave de nota | Implementado | `note-detail-client.tsx`, tests | Node | Guardado | MANTENER | Relacionado con contenido, no relaciones | Mantener |
| Archivar/restaurar nota | Implementado en dominio; restaurar sin UI principal completa | `archive-node.ts`, `restore-node.ts` | Node | Archivar | ADAPTAR | Archivo no tiene vista de recuperacion robusta | Mantener como estado |
| Conversion IDEA -> NOTE | Implementado | `convert-idea-to-note.ts` | Node | Convertir | MANTENER | Ninguno | Mantener |
| Contextos AREA/PROJECT/PERSON | Implementado | `src/domain/context/*` | Context | Areas, Proyectos, Personas | ADAPTAR | Puede volverse taxonomia manual | Congelar expansion |
| Gestion de contextos | Implementado | `src/app/contexts/*`, `features/context/*` | Context | Crear area/proyecto/persona | ADAPTAR | Exceso de gestion antes de busqueda | Mantener, no ampliar |
| Relaciones nota-contexto | Implementado | `node-context-relations.ts`, `note-detail-client.tsx` | NodeContextRelation | Contextos | MANTENER | Manualidad puede aumentar carga | Mantener como opcion |
| Notas relacionadas por contexto | Implementado | `context-detail-client.tsx` | Node, Context, Relation | Notas relacionadas | ADAPTAR | No explica relevancia | Complementar con busqueda |
| Busqueda textual local | Implementado | `src/app/search/*`, `src/features/recovery/*`, `search-nodes.ts` | Node, Context, NodeContextRelation | Buscar | MANTENER | Ranking simple; rendimiento depende de scan local | Mejorar explicabilidad |
| Conceptos generales | No implementado | N/A | Concept futuro | N/A | ADAPTAR | Context no basta para tema/lugar/problema | Posponer hasta busqueda |
| Grafo visible | No implementado | N/A | N/A | N/A | DEJAR FUERA DEL NUCLEO | Puede distraer | No implementar ahora |
| IA/RAG/chatbot | No implementado | N/A | N/A | N/A | DEJAR FUERA DEL NUCLEO | Puede ocultar fuente | No implementar ahora |
| Documentacion historica VIN | Implementada | `docs/VIN-*` | N/A | N/A | MANTENER COMO INFRAESTRUCTURA | Algunas piezas quedaron desactualizadas | Preservar y marcar |
