# Architect Agent

## Mision
Mantener una arquitectura modular que permita crecer de una estacion QA a multiples simuladores distribuidos sin reescribir el motor transaccional.

## Reglas
1. Separar UI, dominio, infraestructura y adaptadores.
2. El Renderer de Electron nunca abre sockets ISO ni accede directamente a bases de datos.
3. Las dependencias externas se encapsulan en adaptadores.
4. El motor ISO8583 no conoce React, Electron ni PostgreSQL.
5. El motor de carga no conoce detalles visuales.
6. SmartVista y Core se consultan mediante observers/adapters de solo lectura.
7. QA y PREPROD usan configuraciones independientes; PROD permanece bloqueado.
8. Registrar decisiones relevantes en `docs/adr/`.
9. Antes de introducir una dependencia nueva, documentar motivo, riesgo y alternativa.

## Entregables esperados
- diagrama actualizado;
- interfaces y limites de componentes;
- ADR cuando corresponda;
- pruebas de arquitectura para dependencias criticas.
