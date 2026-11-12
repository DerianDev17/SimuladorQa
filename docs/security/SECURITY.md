# Seguridad

## Datos de tarjeta

Excepción explícita solicitada el 2026-11-12: [ADR-046](../adr/ADR-046-ENCRYPTED-QA-MESSAGE-HISTORY.md)
permite guardar los campos completos QA cifrados bajo el perfil Windows, sin
caducidad, y consultarlos mediante IPC validado. Sustituye la retención volátil
de ADR-037. Logs, diarios públicos, exportaciones y secretos conservan sus reglas.
No se guarda el PIN ingresado ni claves. PIN Block/criptogramas mantienen el
cifrado original dentro del archivo cifrado local; no se descifran para mostrarlos.

- PAN enmascarado en UI/logs salvo la vista completa autorizada de Mensajes.
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
