# VIN-000 - Auditoria documental

## Criterio

Los documentos historicos se conservan por trazabilidad. Cuando contradicen la
direccion actual, no se sobrescriben; se clasifican y se propone accion.

| Documento | Proposito actual | Vigencia | Accion propuesta | Motivo |
| --- | --- | ---: | --- | --- |
| `README.md` | Entrada tecnica del repo | Media | actualizar | Debe apuntar a documentos rectores y evitar definir Vinema solo como app de notas. |
| `docs/VIN-000-product-constitution.md` | Constitucion anterior | Media | mantener como historico, reemplazar como rector por `VIN-000_CONSTITUCION.md` | Sigue alineada en local-first y anti-carpetas, pero no explicita motor de acceso/fuente/concepto. |
| `docs/VIN-001-domain.md` | Dominio inicial | Media | mantener historico | Define `Node` y `Device`; util pero previo al modelo Fuente/Concepto/Relacion. |
| `docs/VIN-002-foundation.md` | Fundacion tecnica | Alta | mantener | Describe stack y decisiones tecnicas vigentes. |
| `docs/VIN-003-local-core.md` | Nucleo funcional local | Media | mantener historico | Correcto para VIN-003, pero version DB y limitaciones quedaron antiguas. |
| `docs/VIN-004-local-ux.md` | Experiencia de nota | Alta | mantener | Lectura, edicion explicita y autosave siguen vigentes. |
| `docs/VIN-005-contextual-thinking-model.md` | Modelo de contextos | Media | mantener historico y adaptar mentalmente | Relaciones separadas son vigentes; tipos cerrados no deben expandirse ahora. |
| `docs/VIN-006-context-management.md` | Gestion minima de contextos | Media | mantener historico | UI existente valida relaciones, pero no debe definir el nucleo futuro. |
| `docs/product/VINEMA_ROADMAP.md` | Roadmap rector | Alta | mantener | Define direccion actual de recuperacion. |
| `docs/product/VIN-007-RECOVERY-MODEL-REVIEW.md` | Revision de recuperacion | Alta | mantener/fusionar con esta auditoria si se consolida | Alineado con la nueva direccion; menos amplio que la serie Punto Cero. |
| `docs/VIN-000_CONSTITUCION.md` | Constitucion nueva | Alta | mantener como rector | Define motor de acceso al conocimiento. |
| `docs/VIN-000_PUNTO_CERO.md` | Linea base | Alta | mantener | Establece desde donde continuar. |
| `docs/VIN-000_AUDITORIA_REPOSITORIO.md` | Auditoria tecnica | Alta | mantener | Contrasta codigo y docs. |
| `docs/VIN-000_AUDITORIA_DOCUMENTAL.md` | Inventario documental | Alta | mantener | Este documento. |
| `docs/VIN-000_AUDITORIA_DOMINIO.md` | Auditoria de dominio | Alta | mantener | Evalua modelo actual contra fuente/concepto/relacion. |
| `docs/VIN-000_INVENTARIO_FUNCIONAL.md` | Inventario funcional | Alta | mantener | Clasifica funcionalidades existentes. |
| `docs/VIN-000_GLOSARIO.md` | Terminologia | Alta | mantener | Reduce ambiguedad de terminos. |
| `docs/VIN-000_DECISIONES_ABIERTAS.md` | Registro de decisiones | Alta | mantener | Evita cerrar arquitectura antes de validar. |
| `docs/VIN-000_PLAN_TRANSICION.md` | Plan incremental | Alta | mantener | Ordena proximos paquetes. |

## Recomendacion documental

1. Usar `docs/VIN-000_CONSTITUCION.md` como constitucion vigente.
2. Usar `docs/product/VINEMA_ROADMAP.md` como roadmap rector.
3. Mantener documentos `VIN-001` a `VIN-006` como historia de implementacion.
4. No borrar documentos historicos hasta que exista un directorio `docs/archive`
   acordado.
