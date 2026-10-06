# Core Adapters

## Objetivo
Soportar distintos Cores sin acoplar el Transaction Engine.

## Interfaz conceptual

`findTransaction(correlation): CoreTransactionResult`

`getBalance(accountRef): BalanceResult` cuando este permitido.

## Implementaciones
Una implementacion por tipo de Core o entidad cuando sea necesario.

## Principios
- acceso read-only para validacion;
- secretos fuera del repositorio;
- query parametrizada;
- timeout;
- no registrar datos sensibles;
- devolver un modelo normalizado.
