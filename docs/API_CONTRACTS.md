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

## Casos documentales locales

`CatalogSnapshot.cases` contiene solo los casos DRAFT del ambiente solicitado.
IPC `catalog:case:save` recibe environment, id/revision (null para crear) y values
con name/DraftRequest. Main y SQLite validan campos exactos, ambiente y revision
ATM; el Renderer no puede aportar evidenciaDocuments o reviewedAt.
`catalog:case:delete` recibe environment, id y revision actuales. Ambas devuelven
CatalogSnapshot y confirman auditoria CASE atomicamente. UUID/UTC vienen del
Worker. Los errores usan los codigos existentes; cargar un caso no recupera una
autorizacion ni un resumen ReviewedDraft. Ver ADR-008.
