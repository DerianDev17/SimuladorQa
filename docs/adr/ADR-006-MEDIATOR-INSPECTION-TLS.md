# ADR-006: inspeccion de Mediator en SQL Server PREPROD

Estado: autorizada por el usuario el 2026-10-06 para la inspeccion puntual.

## Contexto

El usuario solicito conectar e inspeccionar SQL Server para mejorar la app,
identifico la base Mediator y confirmo PREPROD el 2026-10-06. La credencial
se obtiene del archivo local pass.txt indicado por el usuario, excluido de Git;
no forma parte del Renderer, contratos IPC, logs ni documentos versionados.

El puerto responde. El intento con Encrypt=true y TrustServerCertificate=false
falla durante el handshake TLS con SqlException -2146893019, antes de autenticar.
Tras autorizar la excepcion, la conexion autenticada a Mediator funciono y se
obtuvo el esquema. Ver `docs/core/MEDIATOR_SCHEMA_REVIEW.md` y su evidencia/hash.

## Decision

Preferir el certificado de CA aprobado y mantener validacion TLS. Como alternativa,
el usuario autorizo explicitamente permitir TrustServerCertificate=true para una
inspeccion puntual de metadatos de Mediator en el endpoint PREPROD proporcionado.
La excepcion no desactiva Encrypt=true ni cambia los defaults de la aplicacion.
No se aplica a QA, PROD, otros endpoints o acceso transaccional.

La inspeccion solo ejecuta SELECT fijos de catalogos del sistema: nombres de
bases visibles, tablas/vistas, columnas, claves e indices. No ejecuta procedures,
DDL, DML ni SELECT de registros de clientes/tarjetas. Tiene timeouts de conexion
y consulta, dispone conexiones y evita mostrar mensajes crudos del proveedor.
ApplicationIntent=ReadOnly es una indicacion de routing, no una garantia de
permisos SQL; las consultas fijas limitan lo que ejecuta esta herramienta.

## Riesgo y alternativa

Con la excepcion la conexion permanece cifrada, pero no autentica el certificado
del servidor. La alternativa es usar una CA confiable y nombre de servidor que
coincida con el certificado. No se instala ninguna CA ni se activa la excepcion
automaticamente al recibir un error. PROD sigue bloqueado.

## Evidencia y seguimiento

- Endpoint y base recibidos del usuario; PREPROD confirmado.
- Password local excluido de Git; credencial temporal DPAPI en artifacts ignorado.
- TCP accesible; certificado no confiable; inspeccion autenticada completada.
- Excepcion puntual autorizada explicitamente; sigue pendiente CA/nombre TLS
  aprobado para una conexion permanente.
- TODO-DATA OBSERVERS permanece abierto: esquema revisado, pero faltan cuenta
  de solo lectura y reglas/queries de correlacion aprobadas.

Fuentes: [error de CA no confiable](https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/connect/error-message-when-you-connect),
[TrustServerCertificate](https://learn.microsoft.com/dotnet/api/system.data.sqlclient.sqlconnectionstringbuilder.trustservercertificate),
[credenciales DPAPI](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml).
