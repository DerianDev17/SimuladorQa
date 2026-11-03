# Estrategia de pruebas

Esta guía distingue validación automatizada local de aceptación en hardware y
ambientes reales. Los comandos y la matriz CI están en [CI_CHECKS](../CI_CHECKS.md).

## Suites implementadas

| Nivel | Comando | Cobertura principal |
| --- | --- | --- |
| Unitarias | `npm run test:unit` | Validadores, codecs, builders, métricas, límites de arquitectura y reglas locales |
| Integración | `npm run test:integration` | Orquestación, IPC a nivel de aplicación, TCP loopback, SQLite, workers y adaptadores con dependencias controladas |
| Escritorio | `npm run test:e2e` | Electron/Renderer, catálogos, transacciones, carga, errores y recuperación con fuentes sintéticas |
| Cobertura | `npm run test:coverage` | Unitarias e integración; no mide aceptación financiera |

Las suites usan datos de prueba y directorios temporales. No necesitan ejecutar
transacciones contra el host QA ni reemplazan una prueba de lector físico.
La preparación de Electron y el build están incluidos en `test:e2e`.

## Criterios de regresión

Cada función nueva incluye camino correcto, entradas inválidas, errores y
timeout/dependencia no disponible cuando aplica. Para defectos transaccionales,
añadir un caso reproducible o fixture sanitizado que detecte la regresión.

Las pruebas del motor financiero deben comprobar correlación, idempotencia,
registro previo al envío, tratamiento de incertidumbre, cancelación y errores de
persistencia. En carga también se comprueban inmutabilidad del plan, ritmo,
exclusión del lector/enlace, parada y recuperación sin repetir operaciones.
No generar pruebas que den por aprobada una regla externa ausente.

## Contratos y evidencia

Los fixtures de protocolos deben tener fuente identificada. La comparación
byte a byte solo acredita el perfil/muestra correspondiente; no generaliza a
otros escenarios. No guardar PAN completo, PIN, PIN Block, CVV ni claves en
fixtures, logs o capturas de resultados.

## Aceptación externa pendiente

Las pruebas físicas y de ambiente se realizan por separado, con configuración y
alcance autorizados. Deben conservar correlación y evidencia sanitizada de
lector, host y Core cuando corresponda. Un mock correcto no confirma un débito,
un reverso conciliado ni capacidad del Switch.

Antes de release debe verificarse la regresión de los cinco flujos MVP conforme
a [QA_AGENT](../../agents/QA_AGENT.md). El reverso por timeout y otros contratos
siguen pendientes; las suites locales no cierran ese requisito de release.
Consultar [BACKLOG](../BACKLOG.md), [TODO-DATA](../TODO_DATA.md) y
[INPUT_CHECKLIST](../INPUT_CHECKLIST.md).

Para rendimiento, medir preparación física, transporte, TPS sostenidos y recursos
del simulador por separado. Los objetivos de 3/5 TPS no son resultados medidos;
ver [carga](../implementation/LOAD_TEST.md).
