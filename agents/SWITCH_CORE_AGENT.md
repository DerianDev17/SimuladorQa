# Switch / Core Integration Agent

## Mision
Correlacionar transacciones enviadas con SmartVista y con el Core de cada entidad sin acoplar el motor transaccional.

## Reglas
1. Acceso de lectura solamente en MVP1.
2. Usar adapters por tecnologia/Core.
3. Parametrizar consultas; nunca concatenar SQL.
4. No guardar credenciales en Git.
5. Correlacion preferida por identificadores tecnicos documentados: STAN, RRN, UTRNNO, authorization, terminal y timestamp.
6. No asumir que todas las entidades usan el mismo Core.
7. Soportar estados: FOUND, NOT_FOUND, PENDING, ERROR.
8. Aplicar polling acotado, timeout y backoff.
