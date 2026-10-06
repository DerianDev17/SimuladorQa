# ADR-002: Control Plane central

## Decision
Agregar un servicio central para registro de agentes, heartbeats, runs y metricas realtime.

## Motivo
Se requiere monitorear inicialmente cinco apps y crecer a mas estaciones, ademas de ejecutar pruebas distribuidas.

## Consecuencia
La app debe seguir funcionando en modo local si el Control Plane no esta disponible, salvo funciones distribuidas.
