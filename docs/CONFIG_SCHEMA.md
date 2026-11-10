# Configuracion

## Pantalla general

La interfaz muestra el único ambiente Qa, permite editar IP, puerto y plazos de envío, controlar la
conexión, comprobar lectores y acceder a catálogos y carga. También presenta
evidencia de referencia, comprobaciones operativas y auditoría de envío. El diseño y sus criterios están en
[UX_SPEC.md](ux/UX_SPEC.md#configuración-general--2026-11-09).
Main valida y persiste el destino propuesto por el formulario. Los destinos explícitos
usan `evidenceId: null`; las fuentes documentales originales se conservan. No se
editan secretos desde el Renderer. Ver [ADR-041](adr/ADR-041-OPERATIONAL-SEND-SETTINGS.md).
La cabecera muestra Qa como indicador fijo.
Cada área tiene su propia página interna; la selección de página dura durante
la sesión y no se añade a las preferencias persistidas.

La auditoría de envío agrega `settings` opcional por evento: endpoint (host/port),
connectDeadlineMs y observationWindowMs. Main lo captura al guardar; los registros
anteriores mantienen la ausencia de detalle. `SendConfigurationSnapshot.audit`
expone hasta 100 eventos del ambiente solicitado, en orden reciente primero.

Ver [ambiente único y migración](operations/ENVIRONMENTS.md).

## Preferences

- version: 1
- environment: QA (PREPROD solo se admite al leer archivos históricos y se migra con respaldo)
- audit: ultimos 100 cambios, con UUID, timestamp UTC, ambiente previo/nuevo, usuario y equipo

Persistido por adaptador JSON desde Electron Main. No contiene secretos ni perfiles.
La configuración de envío es independiente de Preferences. Conectar utiliza su
destino guardado en Main; ver [configuración de envío](implementation/SEND_CONFIGURATION.md).

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
