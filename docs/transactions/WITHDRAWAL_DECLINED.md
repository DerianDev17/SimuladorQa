# Retiro rechazado

## MVP
Debe existir al menos un caso determinista de rechazo.

## Evidencia recibida: Extreme Mediator CMS v3.6

CodigoProceso 51 indica fondos insuficientes; 15 cuenta cerrada, 16 bloqueada y
17 inexistente en respuesta financiera (p. 19). El catalogo de pp. 23-24 se
condiciona a ChannelId 21; para ATM/POS 1 falta el perfil Coonecta de codigos.
Retiro aprobado y rechazado comparten la operacion solicitada: el manual no
define un TrnCode especial para forzar rechazo.

Fondos insuficientes es candidato documental, aun sin tarjeta/condicion QA
reproducible. No forzar rechazos alterando respuestas ni presumir la equivalencia
con F39. Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Casos candidatos
- fondos insuficientes;
- PIN incorrecto;
- limite excedido;
- tarjeta bloqueada.

El primer caso se seleccionara segun disponibilidad de tarjeta/condicion QA reproducible.
