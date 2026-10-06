# Configuracion

## Preferences (primera entrega)

- version: 1
- environment: QA | PREPROD
- audit: ultimos 100 cambios, con UUID, timestamp UTC, ambiente previo/nuevo, usuario y equipo

Persistido por adaptador JSON desde Electron Main. No contiene secretos ni perfiles.
Los contratos siguientes son objetivos pendientes y no habilitan endpoints desde la UI.
Ver `adr/ADR-003-DESKTOP-BOOTSTRAP.md`.

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
