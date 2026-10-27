# Arquitectura de alto nivel

## Objetivo

Permitir que varias estaciones QA ejecuten transacciones ATM funcionales y carga controlada, mientras una capa central monitorea agentes, consolida metricas y permite correlacionar cada transaccion con Switch y Core.

## Componentes

1. **Desktop App / Electron Agent**
   - React Renderer
   - Electron Main
   - Card Reader Adapter
   - ATM/Card Profile Manager
   - Transaction Engine
   - ISO8583 Engine
   - TCP Engine
   - Load Engine
   - Local SQLite
   - Realtime Agent

2. **Control Plane**
   - REST API
   - WebSocket Gateway
   - Agent Registry / Heartbeats
   - Run Coordinator
   - Metrics Aggregator
   - PostgreSQL

3. **Transaction Targets**
   - SVFE / Switch Coonecta
   - Core Adapter(s)
   - BANRED / Externa segun escenario

4. **Observers**
   - SmartVista Observer: consulta datos de correlacion del Switch.
   - Core Observer: valida aplicacion contable o respuesta Core.
   - Consulta Mediator: Inicio usa el mismo origen SQL para QA y PREPROD;
     Historial conserva su consulta manual PREPROD. Ambos viven fuera del
     Renderer. Inicio proyecta una referencia protegida de tarjeta y no asigna
     resultados financieros. Ver ADR-009.

La evidencia documental de red se carga en Main desde un archivo privado
acotado mediante NetworkEvidenceCatalog. Se valida y se proyecta por ambiente
en Configuracion; no reemplaza los adaptadores de transporte ni autoriza sockets.

## Restricciones

Plantilla reutilizable (2026-10-27): QaAtmTemplate resuelve el catálogo actual
y el perfil de ATM20521 en Main por operación. QaTemplateContextProvider
proyecta identidad/adquirente para nuevos ATM QA/205 y comparte referencia
DPAPI, parámetros ISO/EMV, contrato de retiro y pool persistente del origen.
No exige un archivo por terminal ni reinicio tras el alta. Se revalida el
contexto antes de TCP. La fecha F15 se hereda del mensaje funcional, sin
consulta SQL por ATM ni afirmación sobre la contabilidad del switch. ADR-024
sustituye el aprovisionamiento individual dentro del mismo enlace/entidad.

Comprobante local de retiro (2026-10-19): WithdrawalReceiptService recibe un UUID
por IPC validado y consulta el diario, sin invocar transporte financiero. El puerto
ReceiptPrinter encapsula la impresion Electron en una ventana aislada sin Node/JS.
Renderer solo muestra vista previa y solicita imprimir la referencia. F54 de retiro
aprobado se conserva hasta el diario/UI con tipos neutrales, sin inferir debito Core
ni saldo disponible. Ver docs/transactions/WITHDRAWAL.md.

Retiro QA (2026-10-16): WithdrawalService reutiliza el motor de escritura unica
de BalanceInquiryService con validacion/armado de retiro y diario separado.
Renderer usa IPC dedicado; Main deriva destino y comparte la exclusion de
ejecuciones con saldo. Los registros de retiro incluyen monto/cuenta/tipo de
caso y preservan pendientes tras reinicio. QaWithdrawalExecutionProvider se
vincula en Main y comparte infraestructura PIN/PCSC con saldo, parametrizada
explicitamente para efectivo. FileQaWithdrawalPolicies mantiene un contrato
independiente por huella del perfil, montos permitidos y resultado conservador.
Se revalida hasta antes de TCP; ausencia, revocacion o contradiccion impiden
solo retiro. La implementacion CASH/01 no activa ATM20521 sin validacion de
la discrepancia 9F02/9C. La instruccion posterior del usuario habilita un
contrato separado BOUND_PROFILE/ZERO para ATM20521/USD20: reutiliza la
preparacion EMV de saldo con seguridad nueva, manteniendo F3/F4 de retiro.
Fuente USER_QA_INSTRUCTION y alcance en ADR-016 y docs/transactions/WITHDRAWAL.md.

Conexion QA (actualizado 2026-10-19): Main mantiene un socket de observacion mediante
SwitchConnectionPort/QaSwitchConnection. IPC solo acepta el ambiente; el destino
procede de SendConfigurationService. Renderer consulta metadata de estado cada
segundo y ofrece conectar/desconectar. Al cambiar ambiente, salir o abrir el
transporte financiero se libera el socket de observacion. Se espera su cierre
antes de enviar y se restaura una vez al terminar si el operador lo tenia
abierto para el mismo destino. Se respeta cierre/cambio de entorno/desconexion;
la restauracion nunca reenvia la transaccion ni cambia su resultado. No hay respuestas
ISO automaticas ni dependencia de PIN/lector para comprobar conectividad.
Ver docs/implementation/SWITCH_CONNECTION.md.

Actualizacion posterior 2026-10-13: Main carga perfiles aprobados y conecta
QaBalanceExecutionProvider por ATM. PIN por proceso nativo privado, cifrado
TEST Windows/DPAPI y primera AC PC/SC fuera del Renderer. La activacion requiere
vinculacion TEST aprobada; no instala perfiles sinteticos. No es un kernel EMV
completo ni genera seguridad virtual sin chip. Ver ADR-013 y
docs/implementation/QA_PIN_EXECUTION.md; las observaciones siguientes conservan
el estado anterior a esta implementacion.

Precision de alcance 2026-10-13: cada ATM es un perfil de software; no requiere
un cajero fisico. Main inyecta QaBalanceContextRouter para resolver proveedores
independientes por UUID/revision/terminal/destino. El Router no consulta lectores.
Backends financieros reales y seleccion de tarjetas QA virtuales siguen
pendientes; las pruebas actuales de varios ATM son sinteticas/TCP local.
Ver docs/implementation/MULTI_ATM_CONTEXT.md.

- Produccion bloqueada.
- El Control Plane no genera tramas ISO por si mismo; coordina agentes.
- Las pruebas de carga deben tener limites configurados por ambiente.
- Los datos sensibles se enmascaran antes de salir del agente.

## Diagrama

Ver `docs/architecture/architecture_overview.png`.

Configuracion de envio (2026-10-11): el Renderer usa tres IPC protegidos para
leer/guardar configuracion y preparar un plan. SendConfigurationService depende
de un puerto de almacenamiento y evidencia documental, sin transporte. Main
deriva el endpoint, serializa cambios y audita UUID/revision/UTC. La generacion
de nuevos payloads y la ejecucion permanecen bloqueadas por fuentes pendientes.
Ver `docs/implementation/SEND_CONFIGURATION.md`; no se conecta el replay historico
al recorrido de nuevas transacciones.

Ejecucion de saldo (2026-10-12): BalanceInquiryService en Main depende de
BalanceContextProvider, BalanceTransport y BalanceJournal. El dominio conserva
contratos/resultados; reglas del proveedor y wire permanecen en adaptadores.
Renderer envia una referencia de tarjeta y clave de idempotencia, sin secretos.
Se registra PENDING antes del write y no se repite una referencia tras reinicio.
La fuente física QA genera contexto por operación; si falta un perfil válido,
se bloquea el transporte antes de conectar. Ver ADR-012 y
`docs/implementation/BALANCE_EXECUTION.md`.

Carga física QA (2026-10-20): LoadRunService coordina un worker de ritmo y un
PhysicalCardLoadDriver que reutiliza DesktopApplication/BalanceInquiryService.
Cada operación obtiene lectura nueva y conserva el runId común. IPC expone solo
inicio, estado y parada con metadatos validados. LoadPinSession conserva una copia
acotada del PIN exclusivamente en Main por autorización explícita del usuario;
se borra al cerrar la corrida. No cambia el protocolo ISO. Cancelación propagada
al proveedor y socket, con resultado incierto después de transmitir. El diario
financiero y qa-load-runs.json impiden reintentos y reanudación silenciosa.
Ver docs/adr/ADR-020-PHYSICAL-CARD-LOAD.md.
