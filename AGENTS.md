# AGENTS.md

Estas reglas aplican a Codex y a cualquier agente que modifique este repositorio.

## Antes de codificar

1. Leer `README.md`, `ARCHITECTURE.md` y el documento del modulo afectado.
2. Revisar `docs/INPUT_CHECKLIST.md` antes de asumir datos faltantes.
3. No inventar reglas ISO8583, procesamiento ATM, HSM, PIN, Core o SmartVista.
4. Si una regla no esta documentada, crear un `TODO-DATA` en la documentacion y bloquear solo la parte dependiente.

## Arquitectura

- TypeScript `strict` obligatorio.
- Separar UI, dominio, infraestructura y adaptadores.
- El Renderer de Electron no abre sockets TCP ni accede directamente a secretos.
- Comunicacion hardware, TCP, BD y workers se ejecuta fuera del Renderer.
- Toda dependencia externa debe estar detras de una interfaz/adaptador.
- No acoplar el dominio a SmartVista, un Core concreto o un modelo especifico de lector.

## Seguridad

- Nunca commitear `.env`, llaves, ZPK, credenciales, certificados privados o secretos.
- Nunca registrar PIN, CVV, PIN Block o PAN completo.
- Enmascarar PAN en UI y logs.
- Produccion permanece bloqueada salvo cambio formal de arquitectura y aprobacion.

## Calidad

Antes de cada commit ejecutar:

- lint
- typecheck
- unit tests
- integration tests del modulo afectado

No hacer commit si falla alguna validacion.

## Git

- Commits pequenos y atomicos.
- Un objetivo logico por commit.
- No mezclar refactor con nueva funcionalidad.
- Actualizar documentacion si cambia comportamiento.
- Working tree limpio al finalizar.

## Pruebas

Toda nueva funcionalidad debe incluir como minimo:

- happy path
- validacion de entradas
- error path
- timeout o dependencia no disponible cuando aplique

## Convenciones de datos

- IDs tecnicos: UUID.
- Correlacion transaccional: `runId`, `transactionId`, STAN/RRN/UTRNNO cuando esten disponibles.
- Timestamps: UTC en persistencia; conversion local solo en UI.

## Fuentes y prioridad

Cuando una implementacion dependa de comportamiento transaccional, usar las fuentes en este orden:
1. Especificacion oficial del proyecto/proveedor.
2. `ContextoISO.xml` y diccionarios aprobados.
3. PCAP/tramas reales de QA o PREPROD.
4. Mock oficial/validado.
5. Documentacion interna aprobada.

Si existen contradicciones entre fuentes, no escoger silenciosamente una version: documentar el conflicto y solicitar/registrar validacion.

## Agentes especializados

Antes de trabajar en un area, leer ademas el archivo correspondiente en `agents/`:
- arquitectura -> `agents/ARCHITECT_AGENT.md`
- ISO/TCP -> `agents/ISO8583_AGENT.md`
- Electron -> `agents/ELECTRON_AGENT.md`
- lector -> `agents/CARD_READER_AGENT.md`
- SmartVista/Core -> `agents/SWITCH_CORE_AGENT.md`
- carga/estres -> `agents/LOAD_TEST_AGENT.md`
- QA -> `agents/QA_AGENT.md`
- seguridad -> `agents/SECURITY_AGENT.md`
- monitoreo -> `agents/OBSERVABILITY_AGENT.md`
- revision -> `agents/REVIEW_AGENT.md`
