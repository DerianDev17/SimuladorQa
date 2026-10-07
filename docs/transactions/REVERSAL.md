# Reverso

## Objetivo
Generar un reverso asociado a una transaccion original.

## Evidencia recibida: Extreme Mediator CMS v3.6

MsgType 2 identifica reverso en XML y Reverse es otro campo booleano (pp. 17, 19).
La tabla de p. 23 lista 0400/0410 y 0420/0421/0430, sin elegir una familia para
Coonecta. ValorParcial se describe como valor a restar del ValueTrn original para
un reverso parcial (p. 17); no es una regla de construccion F90.

Pendientes MsgType/Reverse, MTI por canal, campos originales, secuencias y
duplicados. La API de reverso Core no es un metodo de observacion read-only.
Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

Las capturas recibidas contienen 7 mensajes 0420 y 7 de 0430 en el enlace 4946.
Esta evidencia respalda esa familia solo en ese enlace. Aun faltan identificar
originales, F90, STAN/RRN, reglas por canal y motivo del reverso; no confirma
un timeout ni el flujo ATM/Core. Ver [revision PCAP](../protocols/PCAP_REVIEW.md).

## Requisitos
- conservar snapshot de datos originales;
- construir F90 segun especificacion real;
- conservar/cambiar F11 segun regla del canal;
- correlacionar original y reverso;
- validar respuesta de reverso;
- mostrar ambos mensajes en una sola vista.
