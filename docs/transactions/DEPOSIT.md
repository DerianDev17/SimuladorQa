# Depósito de prueba QA

## Fuente y alcance

La confirmación del operador del 2026-11-05 está registrada en
[INPUT_CHECKLIST](../INPUT_CHECKLIST.md) y [TODO_DATA](../TODO_DATA.md), incorporados
por el commit `322f272`. Esta página reconstruye el contrato documentado allí;
no sustituye una especificación del proveedor ni acredita aceptación del host.
El commit omitió los módulos y esta documentación, completados el 2026-11-08.

Resumen público de la referencia registrada, sin tarjeta ni campos privados:

| Dato | Contrato de la prueba |
| --- | --- |
| Ambiente y escenario | QA / LOCAL |
| Solicitud / respuesta | 0200 / 0210 |
| F3 | 211000 |
| Cuenta / moneda | Ahorros / USD (840) |
| F4 | Monto positivo, dos decimales, representable en 12 dígitos BCD |
| EMV | 9C=30; 9F02 igual al monto; PIN y AC nuevos por operación |
| Respuesta de referencia | RC 12, no aprobada |

El límite técnico del importe es `0.01` a `9999999999.99`. No define límites
financieros ni denominaciones. Se reutiliza el codec ISOBASEI ya implementado,
la plantilla ATM vigente y su proveedor de seguridad; no se copian bytes privados
de una captura para generar operaciones nuevas. La referencia del catálogo es
esta instrucción interna, no el catálogo CMS del proveedor.

## Ejecución y resultados

Main valida estrictamente ambiente, escenario, cuenta, importe, UUID y revisiones.
El contexto debe estar instalado y vigente, con tarjeta física, PIN y EMV nuevos.
La exclusión financiera se comparte con saldo/retiro; el diario de depósitos es
independiente. Se registra PENDING antes del único envío y cada requestId es
idempotente, también después de reiniciar. No hay carga de depósitos, comprobante
de retiro, reverso automático ni reintento.

El transporte existente exige correlación de STAN/RRN/terminal/código/moneda.
RC 12 se representa como NOT_APPROVED; RC 00 solo se representa como APPROVED
si F4 coincide exactamente. Esta clasificación de la respuesta no demuestra
abono ni conciliación en Core. Otros códigos, monto distinto, timeout y respuesta
inválida conservan su incertidumbre. No se calculan saldos ni abonos derivados.

Un depósito pendiente, un fallo de persistencia o una entrega incierta bloquean
otro depósito hasta su resolución documentada. No se aplica la excepción de
continuación de retiros de ADR-025. Un intento terminado sin transmisión o una
respuesta definitiva permiten una solicitud nueva, con otra lectura de tarjeta.
Nunca se retransmite el mismo requestId.

El historial y el diario guardan mensajes sanitizados y PAN enmascarado.
La vista temporal de mensajes QA mantiene el alcance ya definido por ADR-037.
PROD y ejecución de depósitos en PREPROD permanecen bloqueados.

La preparación muestra el alcance fijo de la prueba junto al importe. El resultado
distingue una autorización del host de un abono en Core: solo el primero puede
afirmarse con la respuesta actual; la acreditación se presenta como pendiente de
verificación. Si el resultado queda incierto, la pantalla pide recuperar esa
referencia antes de preparar otro depósito.

La UI ofrece atajos editables de USD 10, 20, 50 y 100, además del campo manual.
Son ejemplos para acelerar la captura: no limitan el importe y no representan
denominaciones, límites ni aceptación comercial aprobados por el host.

## TODO-DATA abiertos

- **QA-DEPOSIT-HOST-ACCEPTANCE:** confirmar aceptación y correlación host/Core.
- **QA-DEPOSIT-PRIVATE-FIELDS:** validar variantes privadas del perfil de depósito.
- **QA-DEPOSIT-F55-ENVELOPE:** validar la envoltura F55 con el proveedor/host.
- **QA-DEPOSIT-RESULT-RULES:** confirmar respuestas adicionales, parciales,
  conciliación y recuperación/reverso de entregas inciertas. Solo esas extensiones
  permanecen bloqueadas; no se inventan reglas para resolverlas.

## Verificación

Pruebas sintéticas de dominio, builder, generación EMV, servicio, TCP loopback,
persistencia e IPC; E2E de importe, canal propio, RC12, mensajes e historial.
Incluyen entradas inválidas, dependencia ausente, timeout, correlación e
idempotencia. No se transmite a QA real ni se certifica un resultado financiero.
