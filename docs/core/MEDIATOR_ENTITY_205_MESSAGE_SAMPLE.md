# Muestra XML aportada para entidad 205

## Fuente y alcance

El usuario aporto el 2026-10-07 dos documentos XML e indico que corresponden
al mensaje enviado y su respuesta. Confirmo que los obtuvo de
MDT_Message.msgRequest/msgResponse. Se conserva aqui una proyeccion documental
sin cuentas, identificacion, tokens, BIN, datos privados ni saldos del cliente.
No se ejecutaron estos XML ni se consultaron sus registros desde el simulador.
Esta muestra es distinta del PCAP/STAN 007803 identificado previamente.

La fuente confirma registros de Mediator; no es una captura HTTP ni identifica
por si sola en que etapa se graba cada campo. No se atribuye el cambio de
TraceId a un componente concreto ni se certifica el recorrido o debito
contable con solo estos documentos. El msgTraceId de la fila SQL no fue
aportado separado del XML; no se deduce del TraceId interno de la respuesta.

El formato es ExtremeMsg/Header/Data con HField/DField y atributos name,
value y type, consistente con la interfaz documental Mediator/Core. No define
el mensaje binario ATM ni permite enviar XML al listener TCP 16100.

## Valores operativos observados

| Campo | Request | Response |
| --- | --- | --- |
| Raiz XML | ExtremeMsg | ExtremeMsg |
| EntityId / EntityIdDest | 205 / 205 | 205 / 205 |
| ChannelId | 1 | 1 |
| TerminalId | ATM20301 | ATM20301 |
| TerminalSeq | 1368 | 1368 |
| TraceId | 1 | 31580405 |
| RealDate | 20261007 10:06:33.382 | 20261007 10:06:34.023 |
| BussDate | 20261007 | 20261007 |
| MsgType / Reverse | 1 / 0 | 1 / 0 |
| TrnCode / SubTrnCode | 011000 / 00 | 011000 / 00 |
| ValueTrn | 10, type=f | 10, type=f |
| AccountId1 | 10 | Ausente |
| RetCode | 999 | 0 |
| Data.Moneda | 840 | Ausente |
| Data.MTI | 200 | Ausente |
| Data.CodigoProceso | Ausente | 0 |
| Data.MappedRespCode | Ausente | 0 |
| Data.MensajeRetorno | Ausente | TRANSACCION OK |
| Data.MsgErr | Ausente | APROBADO |
| Data.FechaContable | Ausente | 20251021 |

El manual CMS identifica 011000 como retiro de ahorros, AccountId1=10 como
ahorros, Moneda=840 como dolares y RetCode=999 como solicitud. La respuesta
aportada reporta exito mediante sus codigos y mensajes. Esto no demuestra por
si solo debito contable ni entrega de efectivo; no se cuenta como una ejecucion
del simulador ni como un PASS de la prueba solicitada de USD 20.

## Diferencias que requieren validacion

- **CMS-CORRELATION**: el TraceId no se conserva en este par; TerminalId,
  TerminalSeq, entidad, canal, operacion y valor si coinciden. No crear una regla
  universal de eco o asignacion, ni deducir STAN/RRN/UTRNNO de TerminalSeq.
  No reutilizar TraceId=1 como generador para nuevas transacciones.
- **CMS-ACCOUNTING-DATE**: FechaContable=20251021 difiere de BussDate y de la
  fecha de RealDate, ambas de 2026. Conservar los valores exactos; confirmar
  calendario contable, origen de la respuesta o comportamiento del entorno QA
  sin asumir que es un mock ni corregir la fecha silenciosamente.
- **CMS-XML-CONTRACT**: la respuesta usa ExtremeMsg, no ExtremeMsgReply.
  La muestra contiene TerminalId, SubTrnCode=00 y MensajeRetorno. Mensaje y
  ValorDebitadoParcial, mandatorios en la tabla del manual, no aparecen.
  Estos datos acotan una variante observada; no validan todos los resultados.
- **CMS-AMOUNT-REPRESENTATION**: ValueTrn aparece como 10, mientras el manual
  describe importes con dos decimales. Registrar ambas fuentes y confirmar
  serializacion por campo; no reescribir la muestra como si hubiera usado 10.00.
- **CMS-TRANSPORT**: faltan verbo HTTP, operacion/envoltura, Content-Type,
  cabeceras, autenticacion, TLS y condiciones de timeout/duplicados para usar
  el servicio configurado. La presencia de XML no resuelve esos datos.

## Relacion con la prueba de USD 20

La muestra tiene importe 10 en request y response. No es la prueba de USD 20
solicitada. Cambiar solo ValueTrn no define la generacion de los identificadores,
campos dinamicos, datos de tarjeta/cuenta ni el contrato ATM del Switch.

El recorrido acordado sigue siendo simulador ATM -> SmartVista -> Mediator ->
Core -> respuesta. La solicitud ATM candidata del PCAP se conserva sin modificar
campos ni almacenar su payload separado. El diagnostico local observo SYN desde
la PC al puerto 16100 sin respuesta TCP y sin enviar datos transaccionales.
La captura del servidor confirma LISTEN y una conexion del equipo de cajeros;
falta observar el handshake de la PC en el servidor para localizar el bloqueo.
Solo el envio dependiente de esos datos permanece pendiente.

La evidencia XML aporta una referencia para comparar la llegada a Mediator y
la respuesta del servicio cuando se consiga enviar la prueba por SmartVista.
No se omite el Switch ni se ejecuta un debito directo al Core como alternativa.
