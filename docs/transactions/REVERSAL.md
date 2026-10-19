# Reverso

## Objetivo
Generar un reverso asociado a una transaccion original.

## Retencion de tarjeta despues de un retiro

El disparador funcional solicitado es que el cliente no retire la tarjeta y el
ATM de destino la retenga. La lectura PC/SC de esta estacion solo informa sobre
el lector local usado para preparar una prueba; no confirma que el ATM remoto
haya retenido la tarjeta. La presencia sostenida en el lector local no debe
originar un mensaje financiero.

El usuario confirma que estos dos casos del cajero ocurrieron porque la tarjeta
quedo retenida. El PCAP y los logs recibidos el 2026-10-19 muestran los pares
correlacionados completos: STAN `001582`, USD 20, ATM20301, y STAN `007985`,
USD 30, ATM20521. En ambos, el ATM envia `0200`, recibe `0210` con F39 `00`,
despues envia `0420` conservando monto, STAN, RRN y terminal, y recibe `0430`
con F39 `00`. El tiempo entre el `0200` y el `0420` fue de aproximadamente
34 y 44 segundos; las dos muestras no establecen un temporizador fijo.

El PCAP confirma que el mensaje de reverso sale del ATM hacia el Switch. No
contiene un mensaje separado que describa la retencion; la causa se vincula a
estos casos por la confirmacion del usuario. La respuesta `0430/00` confirma la
respuesta observada en el enlace, pero no acredita el asiento o saldo final
del Core.

## Diferencias observadas en el request del ATM

En ambos pares el `0420` conserva F3, F4, F11, F13-F15, F18-F19, F22, F25,
F32, F35, F37, F41-F43 y F49. F12 cambia; F7, F23, F52, F53 y F62 se omiten;
se agregan F38, F39, F90 y F95. F28, F48, F55 y F60 cambian. Solo se guardan
estos numeros de campo y estados de comparacion; no se guardan bytes de tarjeta,
PIN, EMV ni valores de campos privados.

Esto confirma el par de MTI `0420/0430` en estos dos retiros QA y reemplaza la
dependencia de encontrar una captura original/reverso correlacionada. No define
como construir campos variables/privados. El request actual del simulador no
conserva un snapshot de wire seguro para ese flujo y su transporte solo acepta
`0200/0210`. No se debe cambiar el MTI ni reutilizar el request de retiro como
reverso: F48 y F55 cambian, F38/F39 vienen de la respuesta original y faltan
las reglas aprobadas de F28, F48, F55, F60, F90 y F95.

El flujo debe conservar el retiro original y registrar el reverso como una
ejecucion separada, vinculada a ese retiro. Para estos dos casos del enlace ATM
16100 queda observado `0420/0430`; no se generaliza a otros canales. Antes de
habilitar su transporte se deben validar el origen del evento de retencion y su
confirmacion temporal, la composicion de F90/otros campos dinamicos, duplicados y
respuestas tardias. No reutilizar los bytes de la solicitud original como si
fueran un reverso.

## Evidencia recibida: Extreme Mediator CMS v3.6

MsgType 2 identifica reverso en XML y Reverse es otro campo booleano (pp. 17, 19).
La tabla de p. 23 lista 0400/0410 y 0420/0421/0430, sin elegir una familia para
Coonecta. ValorParcial se describe como valor a restar del ValueTrn original para
un reverso parcial (p. 17); no es una regla de construccion F90.

Pendientes MsgType/Reverse, MTI por canal, campos originales, secuencias y
duplicados. La API de reverso Core no es un metodo de observacion read-only.
Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

Capturas anteriores contienen 0420/0430 en el enlace 4946. La captura del
2026-10-19 confirma por separado dos pares del ATM por 16100, con sus originales
y respuestas. Ver [evidencia de reversos QA](../protocols/QA_REVERSAL_EVIDENCE_20261019.md)
y [revision PCAP](../protocols/PCAP_REVIEW.md).

## Requisitos
- conservar snapshot de datos originales;
- vincular el intento de reverso al evento de tarjeta retenida del ATM;
- especificar y validar el origen/correlacion del evento de retencion;
- definir F28, F48, F55, F60, F90 y F95 para este perfil ATM;
- definir si F11/RRN y otros elementos se conservan dinamicamente en todos los casos;
- correlacionar original y reverso;
- validar respuesta de reverso;
- mostrar ambos mensajes en una sola vista.
