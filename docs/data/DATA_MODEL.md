# Modelo de datos

## Local SQLite

Implementados `entities`, `atm_profiles`, `saved_cases` y `catalog_audit` en schema v2 de `catalogs.sqlite` (migracion atomica desde v1).
Los catalogos son DRAFT, con revision y timestamps UTC. Mutacion/auditoria son atomicas;
ATM usa FK restringida hacia entidades y ambiente QA/PREPROD. `environment_config` permanece
provisionalmente en preferences.json; las tablas transaccionales siguientes siguen planificadas.

### environment_config
Configuracion no secreta por ambiente.

### entities
Catalogo de entidades.

### atm_profiles
Perfiles ATM.

### card_profiles
Perfiles de tarjeta con campos sensibles cifrados.

### transaction_templates
Templates versionados.

### saved_cases
Contextos documentales DRAFT por ambiente: nombre, DraftRequest, referencias de
documentacion publica, UUID/revision y UTC. No guardan ReviewedDraft ni ejecuciones.
La referencia ATM sin FK conserva casos aunque el perfil se elimine; cargar exige
comprobar disponibilidad y revision. Ver ADR-008.

### runs
Ejecuciones locales.

### transactions
Resumen transaccional sanitizado.

## Central PostgreSQL

### agents
Instancias registradas.

### agent_heartbeats
Estado historico acotado.

### runs
Runs centralizados/distribuidos.

### run_agents
Relacion run/agente.

### metrics_samples
Series de metricas agregadas.

### transaction_summaries
Resumen opcional; evitar almacenar payload sensible bruto centralmente.
