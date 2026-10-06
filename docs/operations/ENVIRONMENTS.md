# Ambientes

## QA
Uso diario de desarrollo/certificacion.

## PREPROD
Validacion previa a produccion. Requiere configuracion y limites independientes.

## PROD
No habilitado en MVP.

## Configuracion por ambiente
- label
- endpoint host/port
- TLS
- timeout
- maxTPS
- maxConnections
- SmartVista observer config
- Core adapter config
- allowed transaction types

Los endpoints sensibles se inyectan por configuracion segura y no se hardcodean.
