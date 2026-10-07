# Core Adapters

## Objetivo
Soportar distintos Cores sin acoplar el Transaction Engine.

## Interfaz conceptual

`findTransaction(correlation): CoreTransactionResult`

`getBalance(accountRef): BalanceResult` cuando este permitido.

## Implementaciones
Una implementacion por tipo de Core o entidad cuando sea necesario.

## Evidencia recibida

Extreme Mediator CMS v3.6 documenta mensajes XML/REST para consulta, debito y
credito (pp. 4, 16-19). Ver [revision de la fuente](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).
La API financiera no es por si sola un observador read-only: no llamar a debito,
credito o reverso para validar una ejecucion ATM. Falta el mecanismo de consulta
autorizado y la relacion TraceId/TerminalSeq con STAN/RRN/UTRNNO.

## Principios

Se inspecciono el esquema SQL Server Mediator PREPROD con SELECT de metadatos y
excepcion TLS puntual autorizada. Ver [revision del esquema](MEDIATOR_SCHEMA_REVIEW.md).
La revision de borrador compara longitudes observadas; la app no conecta a SQL
ni hereda la excepcion. El Observer de registros permanece pendiente de acceso
con minimo privilegio y correlacion aprobada.

- acceso read-only para validacion;
- secretos fuera del repositorio;
- query parametrizada;
- timeout;
- no registrar datos sensibles;
- devolver un modelo normalizado.
