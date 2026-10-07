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
credito o reverso para validar una ejecucion ATM. El usuario aporto una consulta
SQL de Journal/Message por TraceId el 2026-10-07; falta la relacion
TraceId/TerminalSeq con STAN/RRN/UTRNNO y clasificacion del resultado.

Tambien aporto dos filas/captura de USR_RelationEntity para CB Cooperativa,
entidad 205 y canales 1/21, con el mismo servicio HTTPS y timeout observado
20000. Confirmo **QA** y el recorrido cajero -> Switch/SmartVista -> Core ->
respuesta: el simulador debe entrar por el Switch. Ver
[evidencia de destino](MEDIATOR_ENTITY_205_ROUTING.md). Entrada ATM del Switch y
enlace Mediator aportados despues: [evidencia de red](../implementation/SWITCH_NETWORK_EVIDENCE.md).
Faltan acceso desde la PC al PID, contrato ISO/framing y HTTP/XML/unidad del timeout Core;
no se llama al servicio ni se altera la configuracion del servidor.

## Principios

Se inspecciono el esquema SQL Server Mediator PREPROD con SELECT de metadatos y
excepcion TLS puntual autorizada. Ver [revision del esquema](MEDIATOR_SCHEMA_REVIEW.md).
La revision de borrador compara longitudes observadas. Historial incorpora un
observador SQL PREPROD mediante un puerto independiente y proceso externo al
Renderer, con filtros parametrizados, limites y estructura XML protegida.
No hereda la excepcion TLS. El acceso real sigue pendiente de certificado
confiable/cuenta de lectura y la correlacion transaccional no esta aprobada.
Ver [implementacion](../implementation/MEDIATOR_OBSERVER.md) y ADR-009.

- acceso read-only para validacion;
- secretos fuera del repositorio;
- query parametrizada;
- timeout;
- no registrar datos sensibles;
- devolver un modelo normalizado.
