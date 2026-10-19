# Reverso

## Objetivo
Generar un reverso asociado a una transaccion original.

## Retencion de tarjeta despues de un retiro

El disparador funcional solicitado es que el cliente no retire la tarjeta y el
ATM de destino la retenga. La lectura PC/SC de esta estacion solo informa sobre
el lector local usado para preparar una prueba; no confirma que el ATM remoto
haya retenido la tarjeta. La presencia sostenida en el lector local no debe
originar un mensaje financiero.

Las capturas disponibles muestran reversos 0420/0430 en otros flujos, pero no
identifican la retencion de una tarjeta como causa ni aportan una pareja de
tramas del retiro QA ejecutable. Por eso, el disparador esta acordado como
objetivo funcional, pero el evento del ATM, su vinculacion con el retiro
aprobado y el mensaje que debe enviarse siguen pendientes de validar.

El flujo objetivo debe conservar el retiro original y registrar el reverso como
una ejecucion separada, vinculada a ese retiro. Antes de habilitar transporte se
deben validar el origen del evento de retencion, la regla temporal que confirma
que el ATM capturo la tarjeta, la familia MTI para el canal, F90 y los campos de
correlacion, y el tratamiento de duplicados y respuestas tardias. No reutilizar
los bytes de la solicitud original como si fueran un reverso.

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
- vincular el intento de reverso al evento de tarjeta retenida del ATM destino;
- construir F90 segun especificacion real;
- conservar/cambiar F11 segun regla del canal;
- correlacionar original y reverso;
- validar respuesta de reverso;
- mostrar ambos mensajes en una sola vista.
