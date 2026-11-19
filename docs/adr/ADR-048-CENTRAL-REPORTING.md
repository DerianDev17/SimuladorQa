# ADR-048 — Reportería y auditoría central

Fecha: 2026-11-19. Estado: aceptado e implementado por solicitud del operador.

## Decisión

Reportería y auditoría reemplaza Observación. Centraliza consulta de operaciones,
corridas, exportaciones y cambios, con Mediator en una pestaña independiente.
Se retiran los paneles de historial/auditoría de las pantallas operativas.
Conserva el historial completo paginado y la recuperación de ADR-047, así como
los informes HTML de negocio y técnicos de ADR-033. Seleccionar de nuevo una
operación antigua mantiene su detalle aunque ya no esté entre las últimas 50.

Renderer compone DTO públicos mediante los puentes existentes. La actividad
pública de la sesión se comparte desde el formulario sin modificar su borrador;
solo una lectura coincidente del diario acredita una versión recuperada.
La nueva lectura `load:configurations:audit` usa el puerto de configuraciones y
el adaptador SQLite en Main; valida ambiente, payload y filas, proyectando hasta
100 eventos existentes sin migración ni cambios de retención.

## Consecuencias

Los resúmenes son acotados a las ventanas consultadas, con límites visibles;
no se presentan como totales de toda la estación. Fallos parciales conservan
la identidad de la fuente y no generan ceros ni confirmaciones financieras.
Los filtros de Mediator conservan su zona SQL pendiente de confirmar.
El detalle histórico nunca reconstruye datos no persistidos ni nombres actuales
como nombres históricos. No se cambian protocolos, transporte o reglas Core.
ADR-046 mantiene su excepción exclusivamente en Mensajes, incluso desde Reportes.

## Verificación

Unitarias de proyección/filtros y validación; integración de lectura, persistencia,
recursos eliminados, límites, corrupción y acceso; E2E de navegación, ausencia de
duplicados, detalle, exportación, mensajes protegidos y timeout/recuperación.
