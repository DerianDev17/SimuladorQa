# Contratos iniciales Control Plane

## POST /agents/register
Registra una instancia.

## POST /agents/{id}/heartbeat
Estado periodico.

## POST /runs
Crea un run coordinado.

## POST /runs/{id}/metrics
Publica muestras agregadas.

## POST /runs/{id}/events
Publica eventos relevantes sanitizados.

## WebSocket
Canales sugeridos:
- fleet.status
- run.metrics
- run.events
- run.command

Los contratos exactos se formalizaran con OpenAPI durante desarrollo.

## Snapshot desktop: evidencia de capturas

`AppSnapshot.captureEvidence` es null si no se inyecta CaptureEvidenceCatalog.
En la app instalada expone el reporte sanitizado y versionado: UUID/UTC de
inspeccion, referencia documental, perfil observado, nombres/hashes/tamanos de
archivos, conteos MTI y direcciones no soportadas/con huecos/solapamientos.
El ambiente es UNCONFIRMED, independiente del ambiente activo y de la BD.
No contiene endpoints, RAW/HEX, datos de campos, identificadores de tarjeta ni
credenciales. No agrega APIs para importar payload o enviar TCP desde Renderer.
Ver `docs/protocols/PCAP_REVIEW.md` y `docs/adr/ADR-007-OFFLINE-CAPTURE-ENVELOPES.md`.
