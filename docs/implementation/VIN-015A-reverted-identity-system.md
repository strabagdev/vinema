# VIN-015A.0 - Reverted Vector Identity System

## Contexto

VIN-015A introdujo una identidad vectorial completa con wordmark SVG, monograma
VA, lockups, animacion `VINEMA -> VA`, favicon, iconos PWA y assets Tauri
derivados.

La geometria fue rechazada visualmente antes de publicarse.

## Decision

Vinema vuelve temporalmente a una identidad simple de texto:

`VN`

Esta identidad temporal no es el sistema definitivo de marca. Sirve solo para
mantener una presencia visual discreta mientras se define una geometria SVG
profesional aprobada.

## Infraestructura Removida

Se removieron:

- `src/brand`;
- SVG maestro;
- wordmark vectorial;
- monograma VA;
- lockup;
- iconos PWA derivados;
- favicon derivado;
- iconos Tauri derivados;
- intro de marca;
- tests especificos de identidad vectorial;
- documentacion oficial de la geometria rechazada.

## Estado Final

El header conserva su estructura de tres zonas:

- izquierda reservada;
- centro geometrico con `VN`;
- derecha con perfil/sesion.

El sistema visual de feedback permanece activo alrededor de `VN`.

Login y registro usan texto simple, sin SVG ni animacion.

## Pendiente

La identidad SVG definitiva queda postergada hasta contar con una construccion
visual profesional aprobada.
