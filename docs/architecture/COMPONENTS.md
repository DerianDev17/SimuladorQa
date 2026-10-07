# Componentes

## Estado de implementacion inicial

Implementados: Desktop UI, preload IPC tipado, DesktopApplication en Main y
PreferencesStore como puerto con adaptador de archivo para ambiente y auditoria.
La segunda entrega agrega CatalogStore como puerto, adaptador WorkerCatalogStore y
SqliteCatalog en Worker. Main valida IPC y el ambiente activo; el Worker controla
integridad referencial, revisiones y transacciones de catalogo/auditoria.
La preparacion transaccional agrega OperationCatalog como puerto del dominio y
CmsV36Catalog como adaptador documental inyectado en Main. DraftRequest se valida
por IPC y se revalida contra preferencias/catalogos vigentes; no ejecuta tramas.
Renderer recibe los metadatos del catalogo y un DraftReview siempre BLOCKED.
DestinationInspector agrega comparacion de compatibilidad con evidencia guardada;
MediatorSchemaInspector implementa ese puerto en Main solo para PREPROD. No abre
conexion remota ni hereda la excepcion TLS de la inspeccion puntual.
CaptureEvidenceCatalog inyecta en Main los metadatos sanitizados del analisis
offline; el Renderer recibe conteos/fuentes, sin RAW ni endpoints. El codec
InclusiveBe16Framing (infraestructura) y CapturedBanredEnvelope (adaptador del
perfil observado) no acceden a Electron, sockets ni BD. La herramienta local
inspect-pcaps valida el pipeline y conserva payload solo en memoria.
El dominio cataloga escenarios/transacciones, valida contexto y sus requisitos
pendientes; no implementa el motor transaccional descrito mas abajo.

```mermaid
flowchart LR
  Renderer[React: catalogos y preparacion] --> Preload[IPC tipado]
  Preload --> Main[Main: validacion y ambiente]
  Main --> Port[CatalogStore]
  Port --> Worker[Node Worker: SqliteCatalog]
  Worker --> SQLite[(catalogs.sqlite)]
  Main --> OperationPort[OperationCatalog]
  CMS[CmsV36Catalog: metadatos del manual] -. implementa .-> OperationPort
  Main --> DestinationPort[DestinationInspector]
  Mediator[MediatorSchemaInspector: esquema observado PREPROD] -. implementa .-> DestinationPort
  Main --> CapturePort[CaptureEvidenceCatalog]
  Captures[CapturedEvidenceCatalog: metadatos sanitizados PCAP] -. implementa .-> CapturePort
  Offline[Herramienta local: inspeccion PCAP] --> Framing[InclusiveBe16Framing]
  Framing --> Envelope[CapturedBanredEnvelope: cuerpo opaco]
  Offline -. metadatos revisados .-> Captures
```

El resto de componentes sigue planificado. Ver `../implementation/BOOTSTRAP.md`
y `../adr/ADR-003-DESKTOP-BOOTSTRAP.md`.
Para preparacion documental: `../implementation/TRANSACTION_PREPARATION.md` y
`../adr/ADR-005-TRANSACTION-PREPARATION.md`.

## Desktop UI
Responsable de interaccion con QA. No accede directamente a sockets, BD remotas ni secretos.

## CardReaderAdapter
Abstraccion de PC/SC. Detecta lector, insercion/retiro y obtiene datos permitidos por la tarjeta.

## Profile Manager
Administra entidades, ATM y tarjetas.

## Transaction Engine
Orquesta una transaccion funcional y mantiene su state machine.

Estados sugeridos:
`CREATED -> BUILDING -> CONNECTING -> SENT -> WAITING -> RECEIVED -> VALIDATING -> CORRELATING -> COMPLETED/FAILED/TIMED_OUT/REVERSED`.

## ISO8583 Engine
Construccion, parsing, bitmap, codecs y validacion de campos.

## TCP Engine
Framing, conexiones persistentes, reconexion, timeout y correlacion socket/request.

## Load Engine
Generacion de concurrencia, rate limiting y workers.

## Switch Observer
Busca evidencia de la transaccion en SmartVista sin alterar datos.

## Core Adapter
Interfaz comun para consultar diferentes Cores.

## Realtime Agent
Heartbeats y streaming de metricas al Control Plane.
