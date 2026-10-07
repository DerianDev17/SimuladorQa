# ADR-009: observador limitado de Mediator

- Fecha: 2026-10-07
- Estado: aceptado para implementacion local; acceso real pendiente

## Contexto

El usuario solicito implementar la consulta de transacciones y tramas que usa
en Mediator. Aporto relacion Journal/Message, filtros y orden. La inspeccion
anterior contiene el esquema, pero su excepcion TLS no autoriza acceso de negocio.

## Decision

Implementar un puerto de observacion independiente del motor de transacciones.
El adaptador SQL especifico vive fuera del Renderer y ejecuta solo SELECT
parametrizado/proyectado en PREPROD. Un proceso PowerShell/.NET aislado carga
la credencial Windows, consulta y redacta XML antes de entregar JSON a Main.
Main verifica la proyeccion y limita salida, concurrencia y duracion; la UI
invalida resultados al cambiar contexto. No se persisten mensajes.

Mantener Encrypt=true y TrustServerCertificate=false, sin bypass ni fallback.
Rechazar roles/permisos elevados visibles antes de leer Journal/Message.
Conservar NOLOCK del Journal e intervalo inclusivo del usuario, advirtiendo
su consistencia limitada. Bigint como string y hora SQL sin zona inferida.
La estructura XML conserva solo elementos/nombres documentados, sin valores.

## Consecuencias

No se agregan dependencias npm para SQL. El adaptador requiere Windows y los
tres scripts PS1 distribuidos junto a Main. Credencial protegida por DPAPI y
configuracion privada fuera de Git. El guard de permisos no reemplaza el grant
minimo administrado en SQL Server.

El servidor actual sigue fallando validacion TLS; el login previo era db_owner.
Se necesita resolver ambos puntos para consultas reales. No se inventan estados
de aprobacion, mapeos ISO o reglas de reverso; quedan documentados como TODO-DATA.

Referencias: [observador](../implementation/MEDIATOR_OBSERVER.md),
[excepcion anterior](ADR-006-MEDIATOR-INSPECTION-TLS.md),
[schema](../core/MEDIATOR_SCHEMA_REVIEW.md),
[SqlClient TLS](https://learn.microsoft.com/en-us/dotnet/api/system.data.sqlclient.sqlconnectionstringbuilder.trustservercertificate?view=netframework-4.8.1),
[XmlReader DTD](https://learn.microsoft.com/en-us/dotnet/api/system.xml.xmlreadersettings.dtdprocessing?view=netframework-4.8.1).
