# Modelo de datos

## Local SQLite

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
