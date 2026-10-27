# ATM20521 como plantilla funcional

## Uso vigente (2026-10-27)

En QA, los ATM activos de la entidad 205 usan automáticamente la plantilla
de envío ATM20521 cuando no tienen un perfil específico. Aplica también a
ATM20524 ya existente. No hace falta aportar otro perfil ISO, importar una
clave, asignar una fecha contable o repartir reservas por cada alta.

1. Abrir **Perfiles ATM → Nuevo perfil ATM**, o **Clonar**.
2. Completar alias y Terminal ID nuevo de ocho caracteres alfanuméricos en
   mayúsculas. Crear preselecciona entidad y Acquirer ID de ATM20521; clonar
   conserva los del origen.
3. Guardar activo y seleccionarlo en **Transacciones** o **Carga y estrés**.
   No se requiere reiniciar entre altas.

El cajero debe existir y estar habilitado en el switch para que este lo acepte.
La plantilla conserva el alcance de ATM20521: QA/205/LOCAL/ahorros, consulta y
retiro con sus montos/políticas existentes. Carga continúa usando un ATM y una
tarjeta física por corrida. La admisión remota se distingue de la preparación
local; no se promete una aprobación financiera al crear el registro.

## Comportamiento

Main resuelve la plantilla y el catálogo en cada operación. Hereda campos ISO,
EMV, endpoint y referencia protegida de enlace. Usa UUID, revisión, Terminal ID
y adquirente del ATM seleccionado. No exporta secretos al Renderer ni duplica
claves o datos de tarjeta. Un perfil privado específico tiene prioridad.

Todos los derivados consumen **un único pool persistente** del origen. El
bloqueo de archivo evita reutilizar STAN; no se copian rangos ni se consulta el
serial de un cajero físico. El pool es finito y al agotarse conserva el bloqueo
existente de la estación. Reiniciar o crear otro ATM no lo repone.

El contrato de retiro se hereda comprobando la huella de la plantilla. Los
cambios/revocaciones durante una operación se verifican antes de TCP. Una
nueva selección resuelve la versión actual, sin una vinculación obsoleta de
arranque. Desactivar/eliminar un ATM o la entidad impide su uso.

No se solicita fecha contable por ATM ni se depende de SQL para crear/enviar.
F15 conserva el valor de la plantilla funcional, identificado en UI como fecha
ISO enviada. No se interpreta como fecha contable efectiva del switch ni se
cambia el bitmap por suposición. Las fechas transaccionales y EMV se generan
de nuevo según la zona configurada. Ver [ADR-024](../adr/ADR-024-REUSABLE-ATM-TEMPLATE.md).

## Evidencia y pendientes externos

Configuración real verificada el 2026-10-27T17:37:53Z: ATM20521 y ATM20524
resuelven desde un único perfil privado, con la misma clave DPAPI disponible,
contrato de retiro y 959 secuencias compartidas. ATM20524 tenía el adquirente
abreviado; se alineó al de la plantilla mediante el catálogo con auditoría y
respaldo SQLite, quedando revisión 2. ATM20521 y su archivo privado se mantienen
intactos. Cero solicitudes PIN, secuencias consumidas, consultas SQL al host o
envíos financieros. Informe local: `artifacts/atm-template-20261027-result.json`.

Las pruebas integradas ejecutan ATM20521 → ATM20524 → ATM20521 por TCP local
para saldo y retiro, con seguridad nueva y una sola referencia/pool. SQLite
real verifica alta posterior al arranque, recuperación tras reinicio y
agotamiento. E2E verifica herencia del adquirente y resolución real en Main.

- **TODO-DATA MULTI-ATM-QA-RESULT:** comprobar respuesta del host para nuevos
  Terminal ID, incluido ATM20524. Las pruebas locales no certifican Switch/Core.
- **TODO-DATA MULTI-ATM-CONCURRENCY:** la ejecución actual es serial; múltiples
  tarjetas, estaciones y rangos distribuidos requieren coordinación separada.

Las exigencias previas MULTI-ATM-EXECUTION-PROFILE, MULTI-ATM-PIN-KEY y reserva
individual MULTI-ATM-STAN-ALLOCATION quedan sustituidas, dentro de este alcance,
por la instrucción de reutilizar ATM20521. La historia de clave compartida está
en [ADR-023](../adr/ADR-023-SHARED-QA-LINK-KEY.md). La fecha histórica de la
plantilla no se obtuvo de una nueva consulta SQL; el intento anterior falló TLS
y dejó de ser una dependencia del alta por la instrucción posterior del usuario.
