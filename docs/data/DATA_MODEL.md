# Modelo de datos

## Local SQLite

Implementados `entities`, `atm_profiles` y `catalog_audit` en schema v1 de `catalogs.sqlite`.
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
