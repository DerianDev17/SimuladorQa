# ADR-022: expectativas y veredictos locales de casos QA

## Decision

Extender los casos DRAFT de ADR-008 con una expectativa opcional declarada por el
operador: resultado del host aprobado/no aprobado, codigo de respuesta opcional y
fuente textual obligatoria. No se importan reglas ni scripts de VTS3 al perfil ATM.
La expectativa se guarda en `catalogs.sqlite` mediante el Worker existente.
La migracion atomica v2 -> v3 agrega `expectation_json` nullable; los casos
anteriores conservan su borrador y quedan sin expectativa.

Al cargar un caso, una nueva ejecucion puede asociarse a su ID y revision si el
borrador vigente coincide exactamente. El evaluador puro de dominio compara la
respuesta del diario con la expectativa. El veredicto se muestra por separado
del resultado financiero. No se modifica el builder, el transporte, el PIN/EMV,
la politica de envio, la recuperacion ni la idempotencia.

## Veredictos

- `PASS`: respuesta financiera terminada, transmitida y correlacionada; contexto
  ATM/ambiente/escenario/operacion/monto compatible y todas las comprobaciones
  declaradas coinciden.
- `FAIL`: existe esa respuesta confirmada, pero difiere el resultado o el codigo
  esperado.
- `INCONCLUSIVE`: sin expectativa, bloqueo, timeout, resultado pendiente o
  incierto, correlacion ausente, contexto distinto, operacion no soportada o
  ejecucion con reverso. No se convierte un timeout en un PASS.

La fuente la escribe el operador y se valida como texto administrativo; su
contenido no queda certificado por el software. `PASS` significa coincidencia
local, no aprobacion de Visa, SmartVista o Core. No se guardan veredictos en el
diario financiero ni se incluyen PAN, PIN, Track 2, F55 o tramas en el caso.

## Alcance y pendientes

Esta entrega compara resultado del host y, si se especifica, codigo de
respuesta para saldo/retiro QA soportados. No evalua los pasos de reverso ni
las respuestas de gestion de red. Las reglas de campo, temporizadores y
secuencias VTS3 requieren contratos propios del enlace Coonecta. Ver
`docs/INPUT_CHECKLIST.md`.
