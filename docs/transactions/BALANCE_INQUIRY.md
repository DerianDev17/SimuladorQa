# Consulta de saldo

## Objetivo
Enviar una consulta de saldo desde un ATM configurado y recibir/validar la respuesta.

## Evidencia recibida: Extreme Mediator CMS v3.6

- TrnCode 301000 para ahorros y 302000 para corriente (p. 20).
- AccountId1: 10 ahorros, 20 corriente (p. 17).
- Respuesta con SaldoTotal y SaldoDisponible (p. 19).
- Consulta impresa: 311000/312000 (p. 21), variante distinta que requiere template.
- Consulta de cliente 310010/310020/310030 no es consulta de saldo (p. 21).

El usuario indico el 2026-10-06 seguir el documento: descartar 310000 del mockup.
Estos son codigos documentados del catalogo Mediator; no se define con ellos el
encoding de F3 ni la trama ATM. Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Evidencia requerida antes de implementar
- request real aprobado;
- response real aprobado;
- PCAP;
- processing code;
- campos obligatorios;
- reglas de cuenta;
- codigos de respuesta esperados.

## Criterios de aceptacion
- request serializado byte a byte conforme a referencia;
- STAN unico;
- respuesta correlacionada;
- RC interpretado;
- latencia registrada;
- evidencia en Switch/Core cuando aplique.
