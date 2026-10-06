# Seguridad

## Datos de tarjeta
- PAN enmascarado en UI/logs.
- PAN completo solo cifrado si es indispensable.
- PIN nunca persistido en claro.
- CVV nunca logueado.
- PIN Block tratado como dato sensible.
- Track 2 restringido y cifrado si se almacena.

## Secretos
- `.env` ignorado.
- secretos preferentemente en Windows Credential Manager/secret store corporativo.
- certificados privados fuera del repo.
- ninguna llave productiva.

## Ambientes
- PROD no configurable desde UI en MVP.
- allowlist de endpoints QA/PREPROD.
- banner visual de ambiente.

## Auditoria
Registrar:
- usuario
- equipo
- fecha
- ambiente
- runId
- transaccion
- ATM
- tarjeta enmascarada
- resultado

## Red
Solo conexiones a endpoints autorizados.
