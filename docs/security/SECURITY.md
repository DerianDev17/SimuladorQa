# Seguridad

## Datos de tarjeta

Excepción explícita de visualización QA del 2026-11-05: [ADR-037](../adr/ADR-037-QA-SESSION-MESSAGES.md)
permite campos completos solo en memoria durante la sesión (20 solicitudes/15 min),
con acceso IPC validado. No cambia persistencia, logs, exportaciones ni secretos.

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
