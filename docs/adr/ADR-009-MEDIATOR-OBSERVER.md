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

## Addendum: Inicio compartido QA/PREPROD (2026-10-26)

El usuario autorizo explicitamente consumir la configuracion SQL existente en
Inicio para QA y PREPROD, sin instalar certificado y con la cuenta actual aun
elevada. La excepcion se limita al modo `live`: `Encrypt=true`,
`TrustServerCertificate=true`, SELECT fijo con entidad 205/canal 1, TOP 51,
campos proyectados y referencia de tarjeta derivada dentro de SQL. El Renderer
no recibe credencial, SQL, XML, PAN ni valor protegido de tarjeta. Un proceso
PowerShell conserva una sola conexión entre sondeos, atiende un SELECT a la vez
y se cierra tras 12 segundos de inactividad o al salir de la app. El sondeo se
repite cada cinco segundos mientras Inicio esta visible, con espera mayor ante
error. Historial conserva
validacion TLS y rechazo de credenciales elevadas. Esta excepcion no cambia PROD
ni autoriza otras consultas. El riesgo residual es una conexion cifrada sin
autenticacion del servidor y una cuenta SQL con mas permisos de los necesarios;
se debe sustituir por CA/nombre confiables y cuenta de solo lectura.
