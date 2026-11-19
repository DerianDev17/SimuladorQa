# Depósito de prueba QA

## Fuente y alcance

La confirmación del operador del 2026-11-05 está registrada en
[INPUT_CHECKLIST](../INPUT_CHECKLIST.md) y [TODO_DATA](../TODO_DATA.md), incorporados
por el commit `322f272`. Esta página reconstruye el contrato documentado allí;
no sustituye una especificación del proveedor ni acredita aceptación del host.
El commit omitió los módulos y esta documentación, completados el 2026-11-08.
El 2026-11-19 se cotejó el stash original `8be869dd` con esa reconstrucción y
se recuperaron detalles documentales y pruebas que faltaban; ver
[ADR-038](../adr/ADR-038-QA-DEPOSIT.md). La transcripción privada no se incorpora
al repositorio ni se utiliza como material de seguridad para operaciones nuevas.

Resumen público de la referencia registrada, sin tarjeta ni campos privados:

| Dato | Contrato de la prueba |
| --- | --- |
| Ambiente y escenario | QA / LOCAL |
| Solicitud / respuesta | 0200 / 0210 |
| F3 | 211000 |
| Cuenta / moneda | Ahorros / USD (840) |
| F4 | Monto positivo, dos decimales, representable en 12 dígitos BCD |
| EMV | 9C=30; 9F02 igual al monto; PIN y AC nuevos por operación |
| Respuesta con F23 / F2 | Se admite F23 y PAN de 16 o 19 dígitos, enmascarado en la proyección pública |
| Respuesta de referencia | RC 12, no aprobada |

El límite técnico del importe es `0.01` a `9999999999.99`. No define límites
financieros ni denominaciones. Se reutiliza el codec ISOBASEI ya implementado,
la plantilla ATM vigente y su proveedor de seguridad; no se copian bytes privados
de una captura para generar operaciones nuevas. La referencia del catálogo es
esta instrucción interna, no el catálogo CMS del proveedor.

## Preparación

En **Transacciones**, seleccionar **Depósito**, **Ahorros**, **ATM Local** y QA.
Escribir el monto USD con punto y dos decimales, leer la tarjeta y ejecutar.
El PIN se solicita mediante el mecanismo protegido existente. El historial
conserva el tipo y monto ejecutados aunque luego cambie el borrador.

Se requiere un perfil ejecutable de la estación, ATM activo de entidad 205,
referencia de clave TEST, tarjeta física y secuencias disponibles. Se reutilizan
la plantilla ATM vigente, el enlace y el pool compartido; no hace falta añadir
un archivo privado de perfil para cada depósito.

La variante QA de servicios vincula `9F02/6` y `9C/1` en CDOL1 antes de
GENERATE AC. Si el chip no incluye esas entradas o no está habilitada la política
de monto de depósito, la generación se bloquea antes de enviar una APDU de AC.
F55 se construye con esos mismos valores; no se cambia el monto después de
generar el criptograma. Saldo y retiro conservan sus propias políticas.

## Ejecución y resultados

Main valida estrictamente ambiente, escenario, cuenta, importe, UUID y revisiones.
El contexto debe estar instalado y vigente, con tarjeta física, PIN y EMV nuevos.
La exclusión financiera se comparte con saldo/retiro; el diario de depósitos es
independiente. Se registra PENDING antes del único envío y cada requestId es
idempotente, también después de reiniciar. No hay carga de depósitos, comprobante
de retiro, reverso automático ni reintento.

El transporte existente exige correlación de STAN/RRN/terminal/código/moneda.
La correlación no depende de que el PAN de la respuesta sea igual al solicitado.
RC 12 se representa como NOT_APPROVED; RC 00 solo se representa como APPROVED
si F4 coincide exactamente. Esta clasificación de la respuesta no demuestra
abono ni conciliación en Core. Otros códigos, monto distinto, timeout y respuesta
inválida conservan su incertidumbre. No se calculan saldos ni abonos derivados.

Un depósito pendiente, un fallo de persistencia o una entrega incierta bloquean
otro depósito hasta su resolución documentada. No se aplica la excepción de
continuación de retiros de ADR-025. Un intento terminado sin transmisión o una
respuesta definitiva permiten una solicitud nueva, con otra lectura de tarjeta.
Nunca se retransmite el mismo requestId.

El historial público y el diario guardan mensajes sanitizados y PAN enmascarado.
Los campos completos capturados en QA se guardan solo en el archivo local
cifrado y se consultan en Mensajes, incluso tras reinicio, conforme a
[ADR-046](../adr/ADR-046-ENCRYPTED-QA-MESSAGE-HISTORY.md), que sustituyó la
retención temporal de ADR-037. Logs y exportaciones conservan las máscaras.
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
- **QA-DEPOSIT-PRIVATE-FIELDS:** validar variantes privadas del perfil de depósito,
  incluido el segmento F48 `*DD0001` mencionado en la documentación original y
  la cabecera/perfil del ATM reciclador frente a la plantilla vigente. No se
  agrega ni interpreta ese segmento por suposición.
- **QA-DEPOSIT-F55-ENVELOPE:** el documento original registra un conflicto entre
  los 255 bytes externos declarados en la transcripción, su prefijo `01 00 FE`
  (254 bytes internos declarados) y el codec vigente (tres bytes de prefijo,
  máximo interno de 252). Falta RAW/PCAP o regla del proveedor para validar esa
  variante. La prueba conserva el codec existente; no copia ni corrige esa
  transcripción como si fuera un criptograma nuevo.
- **QA-DEPOSIT-RESULT-RULES:** confirmar respuestas adicionales, parciales,
  conciliación y recuperación/reverso de entregas inciertas. Solo esas extensiones
  permanecen bloqueadas; no se inventan reglas para resolverlas.
- **AMOUNT-RULES:** límites y denominaciones de negocio; la validación actual
  acredita solamente la representación técnica del importe de prueba.

## Verificación

Pruebas sintéticas de dominio, builder y parser (incluidos F23 y PAN19),
generación EMV/CDOL1, servicio, TCP loopback, persistencia e IPC; E2E de importe,
canal propio, RC12, mensajes e historial. La integración con perfil/pool de archivo,
PIN/AC nuevos y SQLite reabierto comprueba que recuperar un requestId no consume
otra secuencia ni repite PIN o envío. Incluye entradas inválidas, dependencia
ausente, timeout, respuesta con RRN ajeno, monto discordante y bloqueo de una
operación nueva ante incertidumbre. No se transmite a QA real ni se certifica un
resultado financiero.
