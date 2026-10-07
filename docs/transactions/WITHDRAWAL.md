# Retiro aprobado

## Objetivo
Simular retiro ATM exitoso.

## Evidencia recibida: Extreme Mediator CMS v3.6

- TrnCode 011000 ahorros, 012000 corriente, 013000 avance credito y 014000 cuenta
  universal (p. 20); no habilitar automaticamente todas las variantes en MVP.
- ValueTrn mandatorio, AccountId1 y AccountNum1 para cuenta de debito (p. 17).
- RetCode 0 exito; RetCode 10 OK parcial y ValorDebitadoParcial mayor a cero
  indican autorizacion parcial (p. 19). No contabilizar parcial como retiro total.
- Impreso debe evaluarse junto a TrnCode 011000 para retiro con impresion de
  consulta (p. 18).

El manual no define PIN Block/HSM ni F55 para el enlace ATM. Los ejemplos POS no
son un template de retiro ATM. Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Datos configurables
- ATM
- tarjeta
- cuenta
- monto
- timeout

## Pendientes
- processing code exacto;
- PIN block;
- campos obligatorios;
- reglas F55 si aplica;
- criterio de debito Core;
- response esperado.
