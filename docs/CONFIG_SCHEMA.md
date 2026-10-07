# Configuracion

## Preferences (primera entrega)

- version: 1
- environment: QA | PREPROD
- audit: ultimos 100 cambios, con UUID, timestamp UTC, ambiente previo/nuevo, usuario y equipo

Persistido por adaptador JSON desde Electron Main. No contiene secretos ni perfiles.
Los contratos de endpoints/framing siguen pendientes y no habilitan conexiones desde la UI.
Ver `adr/ADR-003-DESKTOP-BOOTSTRAP.md`.

## Catalogos locales (segunda entrega)

- EntityValues: code, name, networkType (COONECTA/BANRED/EXTERNAL), active.
- ATMValues: alias, entityId, terminalId, acquirerId, active.
- Cada registro: UUID, revision, createdAt/updatedAt UTC y status DRAFT.
- ATM agrega environment QA/PREPROD; entidades compartidas.
- SaveRequest: environment, id/revision nulos para crear o UUID/revision para editar, values.
- DeleteRequest: environment, id y revision.

Los payloads exactos se validan en Main y SQLite. Ver `adr/ADR-004-LOCAL-CATALOGS.md`.
El modelo ATMProfile completo de abajo sigue pendiente de evidencias ISO.

## EnvironmentConfig
- id
- label
- enabled
- host
- port
- tls
- timeoutMs
- maxTps
- maxConnections
- framingProfileId
- switchObserverId
- coreAdapterId

## ATMProfile
- id
- alias
- entityId
- terminalId
- acquirerId
- network
- fixedFields
- active

## CardProfile
Ver `cards/CARD_PROFILES.md`.

## FramingProfile
- vliBytes
- vliEncoding
- headerLength
- staticHeader / headerStrategy
- payloadEncoding
