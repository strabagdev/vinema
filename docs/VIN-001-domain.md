# VIN-001 - Dominio inicial

Vinema se define como una aplicacion personal de conocimiento y notas,
local-first y offline-first.

## Principios

- La logica de dominio vive fuera de los adaptadores de plataforma.
- Web, PWA y escritorio deben compartir casos de uso.
- La persistencia local es obligatoria desde el inicio.
- Sin autenticacion, servidor remoto, realtime ni sincronizacion en esta etapa.

## Entidades iniciales

### Device

Representa la instalacion o navegador actual de Vinema.

- `id`: identificador estable persistido localmente.
- `name`: nombre legible del dispositivo.
- `platform`: plataforma detectada de forma centralizada.
- `createdAt`: fecha de primera creacion.
- `lastSeenAt`: fecha de ultima apertura.

## Proximos dominios

Notas, proyectos, etiquetas, markdown y sincronizacion quedan fuera de VIN-002.
