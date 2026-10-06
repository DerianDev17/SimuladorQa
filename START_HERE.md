# START HERE

## Para desarrollar con Codex
1. Abrir este directorio como repositorio.
2. Leer `AGENTS.md`.
3. Leer `docs/INPUT_CHECKLIST.md`.
4. Subir primero las evidencias P0: ContextoISO.xml, tramas/PCAP de consulta de saldo, retiro, reverso y timeout/reverso.
5. Completar las plantillas de `templates/`.
6. Ejecutar las tareas de `codex-prompts/` en orden cuando exista informacion suficiente.

## Regla clave
No desarrollar reglas ISO8583 ni de negocio a partir de supuestos. Toda regla debe apuntar a una especificacion, trama, PCAP o validacion QA.

## MVP1
- Consulta de saldo
- Retiro aprobado
- Retiro rechazado
- Reverso
- Reverso por timeout

## Ambientes
- QA: habilitado
- PREPROD: habilitado
- PROD: bloqueado
