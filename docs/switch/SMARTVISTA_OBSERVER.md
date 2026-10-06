# SmartVista Observer

## Proposito
Consultar evidencia transaccional sin modificar datos.

## Candidatos de correlacion
- STAN
- RRN
- UTRNNO
- Authorization
- F41
- timestamp
- PAN enmascarado/tokenizado

## Requisitos
- consultas read-only;
- timeout corto;
- retries limitados;
- no bloquear el resultado funcional si el Observer esta caido;
- indicar `TRANSACTION_OK / OBSERVABILITY_UNAVAILABLE` como estados separados.

## Pendiente
Recibir tablas, vistas y SQL permitidos por ambiente.
