# Revision del esquema SQL Server Mediator PREPROD

Inspeccion autorizada por el usuario el 2026-10-06 (America/Guayaquil), limitada
a metadatos. La conexion autenticada a Mediator funciono con la excepcion TLS
puntual de [ADR-006](../adr/ADR-006-MEDIATOR-INSPECTION-TLS.md).
No se ejecutaron procedures, DDL/DML ni consultas de registros de negocio.

Actualizacion 2026-10-07: el usuario aporto la consulta Journal/Message por TraceId.
Se implemento un observador acotado con filtros y estructura XML protegida
([ADR-009](../adr/ADR-009-MEDIATOR-OBSERVER.md)). La prueba actual con TLS validado
devuelve TLS_ERROR sin autenticar ni leer transacciones; falta cuenta de lectura
y certificado confiable. La inspeccion y evidencia siguientes siguen siendo
exclusivamente de metadatos.

Evidencia local ignorada: `artifacts/mediator-schema.json`.
Inspeccion UUID: `2bd7c692-6fec-49af-ba15-7f0fb88c0440`.
Timestamp original UTC: `2026-10-07T01:15:14.7199883Z` (6 de octubre en Ecuador).
SHA-256: `9EEA045A686F904897D0457724AD96257237D5EDC6B98E73D373965D76884C95`.
La aplicacion representa ese timestamp con precision de milisegundos.

## Inventario observado

SQL Server reporto version 13.0.6300.2. Los catalogos visibles muestran 33 tablas,
246 columnas, 33 indices y 101 procedimientos (solo nombres y parametros).
No se encontraron claves foraneas declaradas visibles. Las consultas TOP(10000)
no alcanzaron ese limite. La ausencia de FK no demuestra ausencia de relaciones.

El login usado tiene VIEW DEFINITION y pertenencia a db_owner. Eso no es una
cuenta de solo lectura: esta inspeccion restringio sus consultas a SELECT fijos
de catalogos. El Observer permanente requiere una cuenta con permisos minimos.

## Hallazgos relevantes para la app

| Area | Evidencia observada | Consecuencia |
| --- | --- | --- |
| Terminal | MDT_Terminal.trmTerminalId y MDT_Journal.jnlTerminalId son varchar(10) | Comparar longitud ASCII en PREPROD; no truncar ni imponer ese formato a la interfaz ISO pendiente |
| Registro de terminal | PK MDT_Terminal: trmEntityId, trmChannelId, trmTerminalId | El UUID local no identifica una combinacion habilitada en Mediator; requiere vinculo explicito |
| Operacion | MDT_Transaction.trnTrnCode y MDT_Journal.jnlTrnCode varchar(6) | El codigo documental cabe en el esquema; falta revisar registros habilitados, canal y programa |
| Suboperacion | MDT_SubTransaction tiene PK strTrnCode/strSubTrnCode; ambos varchar(6) | No confirma padding, longitud efectiva ni resuelve 00 vs 0000 del manual |
| Correlacion | MDT_Journal.jnlTraceId bigint es PK; jnlTerminalSeq bigint; msgTraceId bigint en MDT_Message | Preservar IDs externos como strings al cruzar JSON; no convertirlos a Number ni tratarlos como UUID locales |
| Busqueda | IX_JOURNAL: terminalId, terminalSeq, BussDate, MsgType | Candidato de consulta parametrizada; falta validar correlacion y semantica de fecha antes de usarlo |
| Original | jnlParentTraceId bigint, jnlReverse/jnlReversed bit; MDT_Reversal contiene estado e intentos | Hay campos para relacionar reversos, pero no se infieren estados, politica de retries ni MTI |
| Respuesta | jnlRetCode int, MDT_RetCode y mapas por nombre; rmdRespCode varchar(6) | Mantener codigos separados; no asumir equivalencia con RC ATM |
| Tiempo | jnlRealDate/jnlReplyDate/jnlEndDate son datetime; BussDate date | No contienen zona horaria. No convertirlos automaticamente a UTC sin fuente aprobada |
| Monto | jnlValueTrn float; USR_AutJournal usa money | El tipo SQL no define reglas contables; el borrador conserva string decimal |
| Datos sensibles | MDT_Journal contiene PAN/cuentas y MDT_Message XML de request/response | No usar SELECT *, no cargar mensajes crudos ni cuentas/PAN a Renderer/logs |

MDT_Entity, MDT_Channel, MDT_EntityChannel y MDT_Terminal contienen enabled y
configuracion por entidad/canal. Sus nombres de campo permiten planear un adaptador,
pero no se consultaron sus valores ni se importaron perfiles automaticamente.
USR_AutJournal usa tipos distintos para TraceId y secuencial; no asumir una
equivalencia con el Journal central por nombre parecido.

## Mejora implementada

Main agrega a la revision de borrador una evaluacion por un puerto generico
DestinationInspector, implementado por MediatorSchemaInspector. La evidencia
se aplica solo a PREPROD; QA no hereda restricciones de una base no inspeccionada.

Compara Terminal ID y codigo con longitudes varchar observadas solo para ASCII,
donde caracteres y bytes coinciden. Caracteres no ASCII quedan NOT_CHECKED hasta
validar codificacion/collation. Un Terminal ID largo produce MISMATCH en la revision,
sin cambiar el perfil ni truncar el valor; los limites administrativos del catalogo
siguen separados. MATCH no certifica un registro habilitado ni autorizacion.

La pantalla presenta compatibilidad del destino, origen y fecha de la evidencia,
y mapeo entidad/canal/terminal pendiente. Es una comparacion con esquema guardado,
no un health check ni un Observer conectado. Editar contexto/catalogo invalida
el resultado como las otras revisiones. Todos los envios permanecen BLOCKED.
Esta revision documental no consulta SQL. El observador agregado posteriormente
usa .NET SqlClient fuera del Renderer con credencial privada y sin excepcion TLS;
ver ADR-009 y MEDIATOR_OBSERVER.

## TODO-DATA pendientes

- MEDIATOR-OBSERVER-ACCESS: cuenta de solo lectura y TLS con CA/nombre aprobado
  para un Observer permanente. La excepcion puntual no autoriza consultas continuas.
- MEDIATOR-ENTITY-CHANNEL: vinculo de entidad/canal/terminal con configuracion habilitada.
- MEDIATOR-JOURNAL-CORRELATION: consulta Journal/Message por TraceId aportada e
  implementada; faltan semantica de TraceId,
  terminalSeq, parentTraceId, fechas/zona, duplicados y relacion STAN/RRN/UTRNNO.
- MEDIATOR-STATUS-MAPPING: estados/codigos de respuesta/reverso con su significado.
- Los requisitos ISO-SPEC, muestras QA y reglas financieras siguen abiertos.

Validacion: tests unitarios de limites, ausencia, codificacion y aislamiento de
ambientes; integracion Main/SQLite de perfil incompatible, dependencia ausente/error
y no mutacion; regresion Electron de advertencia, edicion y reinicio de contexto.
