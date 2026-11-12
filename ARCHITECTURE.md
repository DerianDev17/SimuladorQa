# Arquitectura implementada

Estado de referencia: 2026-11-03. Las decisiones históricas y sus sustituciones
se consultan en el [índice ADR](docs/adr/README.md). Este documento describe los
componentes actuales; la arquitectura objetivo distribuida sigue siendo una propuesta.

## Capas y responsabilidades

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Dominio | `packages/domain/src` | Validación, contratos transaccionales y métricas; sin Node, Electron ni adaptadores |
| Contratos públicos | `packages/shared/src` | API tipada del puente IPC y mensajes entre procesos; sin secretos |
| UI | `apps/desktop/src/renderer` | Formularios y resultados; consume el puente de preload |
| Preload | `apps/desktop/src/preload.ts` | API mínima bajo context isolation |
| Aplicación | `apps/desktop/src/main/application.ts` | Valida contexto, ambiente y revisiones; coordina exclusión financiera |
| Motor financiero | `financial-execution-service.ts` en Main | Idempotencia, contexto, diario previo al envío, transporte, cierre y limpieza |
| Carga | `load-run-service.ts`, `physical-card-load-driver.ts` | Coordina corrida, tarjeta, ritmo, cancelación, métricas y resultados |
| Evidencia de carga | `load-history-service.ts`, `load-export-service.ts` | Consulta paginada y exportación mediante puertos separados del control de ejecución |
| Configuraciones de carga | `load-configuration-service.ts`, `load-configuration-ports.ts` | Biblioteca QA validada, con adaptador SQLite y auditoría independiente de las corridas |
| Adaptadores e infraestructura | Subdirectorios de Main | ISO/framing, TCP, PC/SC, cifrado TEST, SQL, SQLite y workers |

## Dependencias

```mermaid
flowchart TD
  UI[Renderer] --> Public[Contratos públicos / preload]
  Public --> App[DesktopApplication en Main]
  App --> Port[FinancialExecutionPort]
  Balance[Fachada de saldo] -. implementa .-> Port
  Withdrawal[Fachada de retiro] -. implementa .-> Port
  Deposit[Fachada de depósito] -. implementa .-> Port
  Balance --> Engine[FinancialExecutionService]
  Withdrawal --> Engine
  Deposit --> Engine
  Engine --> Financial[Puertos de builder, contexto, transporte y diario]
  Adapters[Adaptadores ISO / TCP / PIN-EMV / persistencia] -. implementan .-> Financial
  Load[LoadRunService] --> LoadPorts[load-ports]
  Driver[PhysicalCardLoadDriver] -. implementa .-> LoadPorts
  Driver --> App
  Worker[Scheduler worker y almacenamiento] -. implementan .-> LoadPorts
```

Las fachadas de saldo, retiro y depósito inyectan su builder y configuración al mismo motor.
Retiro no hereda del servicio de saldo. Los DTO de mensaje pertenecen a contratos
internos de Main y los adaptadores los consumen. El driver de carga depende de
interfaces de lector, operaciones financieras y ciclo de vida de sesiones; no
lee el PIN. Ver [ADR-032](docs/adr/ADR-032-FINANCIAL-EXECUTION-PORTS.md).

Lint y las pruebas de `architecture-boundaries.test.ts` protegen dominio,
contratos públicos, Renderer y motores frente a imports indebidos, incluyendo
imports de tipos, reexports e imports dinámicos.

## Ejecución y persistencia

Main deriva el destino desde configuración y vuelve a validar el ATM y la
seguridad antes de transmitir. El motor registra PENDING antes del envío y
conserva `runId`, `transactionId`, `requestId`, STAN/RRN cuando existen. La misma
solicitud no se retransmite tras reinicio. Los diarios serializan sus escrituras
para conservar respuestas fuera de orden.

El permiso previo al `socket.write` vuelve a validar perfil, contexto, vigencia y
cancelación después de conectar/esperar el enlace, tanto en operaciones manuales
como en carga. Los transportes admiten una sola escritura del original aunque el
permiso se invoque dos veces. El retiro con reverso aplica este permiso al 0200;
el 0420 conserva su propia intención persistida y su flujo aprobado. Ver
[correcciones de envío del 2026-11-09](docs/implementation/FINANCIAL_SEND_GUARDS_20261109.md).

Los diarios financieros y de carga usan SQLite; las importaciones desde JSON
conservan el original como respaldo. Una corrida activa recuperada se marca
interrumpida y no se reanuda. Un resultado incierto conserva esa clasificación.
La conexión SQLite de carga y sus consultas de historial se ejecutan en un worker
dedicado detrás de los mismos puertos. El esquema 2 agrega índices de consulta;
un timeout del worker no provoca reenvío de escrituras. Ver [ADR-039](docs/adr/ADR-039-LOAD-STORAGE-WORKER.md).
Los errores históricos de retiro terminados y guardados permiten una nueva
solicitud explícita; pendientes, reversos activos y fallos de persistencia mantienen
su bloqueo. Ver [ADR-025](docs/adr/ADR-025-QA-WITHDRAWAL-AFTER-ERROR.md).

## Concurrencia y recursos

Las consultas de presentación de catálogo y feed Mediator usan opcionalmente
`ReadCachePort`, implementado por Redis en Main sobre loopback. TTL de 30 s/2 s,
invalidación en comandos de catálogo y fallback acotado a la fuente original.
La validación financiera conserva lecturas directas; mensajes completos de
sesión, secretos y estados de hardware no se cachean. Ver [ADR-045](docs/adr/ADR-045-OPTIONAL-REDIS-READ-CACHE.md).

- **Enlace QA:** una conexión financiera activa. La cola de QaSwitchConnection
  espera turno, respeta cancelación y plazo, y cierra antes de liberar el enlace.
- **Saldo en carga:** 1–5 operaciones en preparación/envío; chip exclusivo y
  posibilidad de preparar mientras el host responde.
- **Retiro:** una operación activa, también en carga. Operaciones manuales
  conservan exclusión respecto de la corrida.
- **Ritmo:** límite global antes de cada escritura, sin créditos acumulados.
  El objetivo de TPS no garantiza el caudal observado.
- **Sesiones:** PC/SC y cifrado reutilizan procesos durante la corrida, con
  lectura y seguridad nuevas por operación. PIN de sesión solo en Main y borrado
  al cerrar. No se cachean tramas ni claves descifradas.
- **Observación:** la conexión de observación se libera antes del transporte
  financiero y se restaura al terminar cuando corresponde al mismo destino.

Fuentes: [ADR-028](docs/adr/ADR-028-LOAD-PREPARATION-REUSE.md),
[ADR-029](docs/adr/ADR-029-QA-SINGLE-FINANCIAL-CONNECTION.md) y
[ADR-031](docs/adr/ADR-031-WITHDRAWAL-LOAD.md). Parámetros operativos en la
[guía de carga](docs/implementation/LOAD_TEST.md).

## Seguridad y perfiles

Configuración permite proponer IPv4, puerto y plazos desde Renderer mediante IPC.
Main valida y persiste los valores, cierra el enlace anterior al guardar y usa
el destino guardado al conectar. Los perfiles financieros conservan su vinculación
al endpoint autorizado. Ver [ADR-041](docs/adr/ADR-041-OPERATIONAL-SEND-SETTINGS.md).

Excepción de historial QA autorizada el 2026-11-12: `SessionMessagePort` recibe
diagnósticos completos y `EncryptedMessageArchive` los persiste fuera del Renderer,
con archivos atómicos cifrados por `ElectronMessageEncryption`/Windows. No hay
caducidad ni expulsión de registros; el cierre drena escrituras y conserva archivos.
IPC dedicado valida ambiente, UUID y emisor antes de recuperar un registro completo
para Mensajes. No modifica `BalanceExecution`, diarios públicos, logs ni exportaciones.
Renderer retira datos al ocultar; reabrir descifra bajo demanda en Main. Sustituye
la retención temporal de ADR-037; ver [ADR-046](docs/adr/ADR-046-ENCRYPTED-QA-MESSAGE-HISTORY.md).

Renderer no abre sockets ni accede a secretos. Los valores públicos están
sanitizados y el PAN enmascarado; no se registran PIN, CVV, PIN Block ni Track 2.
Qa es el único ambiente operativo y producción permanece bloqueada. Main
rechaza otros ambientes por IPC; `QaPreferencesStore` respalda y corrige la
selección histórica sin mezclar datos. Ver [ADR-040](docs/adr/ADR-040-SINGLE-QA-ENVIRONMENT.md).

La plantilla ATM20521 resuelve los perfiles actuales QA/205 y comparte parámetros,
referencia de clave y pool persistente. Crear otro ATM no duplica reservas. La
fecha contable del mensaje no certifica la fecha efectiva del switch. Ver
[ADR-024](docs/adr/ADR-024-REUSABLE-ATM-TEMPLATE.md).

El asistente Qa crea el perfil mediante un comando idempotente en el Worker
de catálogos. `AtmInspectionService`, detrás de `AtmInspectionPort`, inspecciona
la misma resolución de plantilla en Main sin tarjeta, PIN, reservas ni TCP.
El Renderer recibe solo comprobaciones públicas y reutiliza el flujo financiero
existente para la consulta de saldo explícita. Ver [ADR-042](docs/adr/ADR-042-QA-ATM-ONBOARDING.md).

La ampliación por entidad conserva la herencia solo para 205; otras entidades
usan identidad/adquirente explícitos y muestran sus pendientes. La inspección
lee entidad/revisión/clasificación desde el catálogo y detecta cambios concurrentes.
El canal de prueba guiada revalida en Main antes de preparar saldo y comprueba
la entidad nuevamente al autorizar el envío. Reutiliza exclusión, diario y
transporte financieros existentes. Ver [ADR-044](docs/adr/ADR-044-ATM-ENTITY-ONBOARDING.md).

## Observación y alcance pendiente

Mediator tiene adaptador SQL fuera de Renderer para Inicio e Historial. El feed
no garantiza captura completa bajo carga y no sustituye un asiento Core validado.
SmartVista/Core generales dependen de fuentes y adaptadores pendientes.

Control Plane, coordinación distribuida, agregación central, PostgreSQL y pool
financiero virtual son alcance propuesto, no componentes operativos de esta
entrega. El [diagrama inicial](docs/architecture/architecture_overview.png) describe
esa visión; para la estructura implementada usar el diagrama anterior.
Los datos faltantes y sus bloqueos están en [TODO-DATA](docs/TODO_DATA.md).

Historial y exportación usan los registros locales existentes. Dominio proyecta
campos permitidos; Main valida consulta/ambiente y coordina los puertos de lectura
y guardado. Adaptadores gestionan SQLite, diálogo nativo y reemplazo de archivos.
Renderer no proporciona rutas ni contenidos. Ver [ADR-033](docs/adr/ADR-033-LOAD-HISTORY-EXPORT.md).

La pantalla Transacciones separa `useTransactionPreparation` de las vistas de
preparación e inspección. `transaction-inspection` proyecta etapas y filtros
sin efectos; `TransactionHistoryStore` lee los diarios mediante un puerto y
descarta respuestas de generaciones anteriores. La selección del resultado
se identifica por `requestId` y no modifica el borrador. Ver
[ADR-036](docs/adr/ADR-036-TRANSACTION-INSPECTION.md). El desarrollo usa un
puerto loopback libre por sesión según [ADR-035](docs/adr/ADR-035-ISOLATED-DEVELOPMENT-PORT.md).

Depósito usa el motor común, transporte con selección DEPOSIT y diario SQLite
independiente. La plantilla QA aplica 9C=30/9F02=monto antes de GENERATE AC
por instrucción del operador; resultados inciertos bloquean otro depósito.
Ver [ADR-038](docs/adr/ADR-038-QA-DEPOSIT.md).
