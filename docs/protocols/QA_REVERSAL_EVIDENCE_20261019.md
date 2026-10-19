# Evidencia de reversos ATM en QA — 2026-10-19

## Alcance y fuente

Revision local de la captura y logs aportados por el usuario para los UTRNNO
`262922105204384350` y `262922108102169690`. Los originales permanecen en
Downloads y fuera del repositorio. El PCAP se reensamblo por flujo y se proyecto
con ISOBASEI; esta nota conserva solo campos publicos de correlacion, MTI,
respuesta y presencia/diferencia de campos. No conserva payload, PAN, Track 2,
PIN, EMV, hashes de payload ni lineas originales de log.

## Flujo observado

| Caso | Hora local del PCAP | Mensaje | Terminal | STAN | Importe | F39 de respuesta |
|---|---|---|---|---|---:|---|
| 1 | 16:05:20 | `0200 → 0210` | ATM20301 | 001582 | USD 20 | 00 |
| 1 | 16:05:54 | `0420 → 0430` | ATM20301 | 001582 | USD 20 | 00 |
| 2 | 16:08:10 | `0200 → 0210` | ATM20521 | 007985 | USD 30 | 00 |
| 2 | 16:08:54 | `0420 → 0430` | ATM20521 | 007985 | USD 30 | 00 |

Los valores de MTI, importe, STAN, terminal y respuesta se comparan con la
captura; las horas son el reloj local Ecuador. En ambos reversos el ATM conserva
F3, F4, F11, F13-F15, F18-F19, F22, F25, F32, F35, F37, F41-F43 y F49. F12
cambia; F7, F23, F52, F53 y F62 se omiten; F38, F39, F90 y F95 se agregan;
F28, F48, F55 y F60 cambian. La respuesta 0430 incluye F39 `00`.

Los tiempos entre solicitud original y reverso son aproximadamente 34 y 44
segundos. No se adopta un temporizador a partir de dos ejemplos. El usuario
confirma que en ambos casos el disparador fue que el ATM retuvo la tarjeta. No
hay un mensaje separado de retencion en el PCAP; el evento fisico debe provenir
del ATM. Una lectura del lector PC/SC conectado a la PC del simulador no detecta
la retencion en un ATM remoto.

La respuesta 0430/00 es el resultado observado del protocolo; no demuestra por
si sola que el Core restituyo el debito. La evidencia valida la familia 0420/0430
para estos dos retiros y este enlace QA, no una regla universal por canal.

## Implementacion pendiente

El transporte actual del simulador acepta solamente `0200/0210`; todavia no
genera ni envia reversos. Las diferencias en F48 y F55, junto con F28, F60,
F90 y F95, requieren las reglas de ISOBASEI/ATM para construir el mensaje con el
snapshot original y la respuesta aprobada. No se interpretan ni fabrican estos
campos a partir de longitudes. Tampoco se persiste el wire original, que contiene
datos sensibles. El envio del reverso queda bloqueado hasta definir el snapshot
minimo protegido en memoria, la transformacion de campos, el evento confirmado
por el ATM, la idempotencia y la respuesta tardia.

La captura y los logs no se agregan a Git. Para cerrar la construccion del wire
se necesita la regla aprobada de los campos listados arriba y el evento de ATM
que confirma retencion. No se requiere volver a entregar esta misma ventana de
PCAP/logs.
