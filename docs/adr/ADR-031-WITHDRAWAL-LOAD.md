# ADR-031: Retiros en carga física QA

Fecha: 2026-11-04. Estado: implementado; aceptación de carga en host pendiente.

## Contexto y fuente

El usuario solicita incorporar retiros a las pruebas de carga y configurar los
modos básico y avanzado. Se reutiliza el retiro QA/LOCAL/ahorros/USD existente,
incluido su contrato de montos y seguridad (ADR-016), sin añadir reglas ISO,
resultados esperados ni reversos automáticos.

## Decisión

Cada corrida elige saldo o retiro. Retiro requiere un monto decimal positivo
exacto por operación; Main aplica el mismo contrato financiero que en Operación.
El plan inmutable conserva operación y monto en SQLite; los registros previos
de saldo siguen siendo legibles sin migración.

PhysicalCardLoadDriver selecciona la ruta financiera y valida todos los ATM,
reservas y ambos diarios antes de abrir la sesión PIN. Reutiliza PIN por corrida
y procesos de preparación, con lectura/seguridad nueva e IDs nuevos por retiro.
No imprime comprobantes ni solicita reversos.

Se amplía ADR-027 a retiros ordinarios: 1–5 operaciones en preparación y envío
del mismo runId, tipo de operación y límite interno. La UI no puede suministrar
ese contexto de ejecución interno. Main mantiene excluidas las operaciones
manuales, otras corridas, mezclas saldo/retiro y retiros con reverso.
Un PENDING de retiro solo permite continuar la preparación cuando pertenece a
una ejecución activa del mismo grupo en memoria, sin reverso. PENDING recuperado,
fallo de almacenamiento y reverso pendiente siguen bloqueando (ADR-025).
La conexión sigue siendo única y en cola (ADR-029), con límite TPS antes del write,
vencimiento, cancelación y parada ante el primer resultado no aprobado/error.

Modo básico usa presets de carga sostenida: rápida (1 TPS/30 s/30 operaciones/2
en curso), 1 TPS (60 s/60/2), 3 TPS y 5 TPS (60 s/100/5). El modo avanzado permite
personalizar cantidad, TPS, duración, concurrencia y aumento gradual. Volver al
básico desde parámetros personalizados aplica Prueba rápida y elimina la rampa;
conserva operación, monto, ATM y tarjeta. Los límites efectivos están visibles.

## Validación y límites

Pruebas de entradas, contrato no disponible, diarios pendientes, exclusión en
Main, TCP loopback con dos ATM, PIN único, F3/F4, IDs nuevos, cola, timeout,
parada y recuperación SQLite. E2E sintéticas cubren ambos modos y operaciones.
Estas pruebas no acreditan TPS reales, débito Core ni aceptación en el host QA.
Se mantienen 5 TPS objetivo, 100 operaciones y 300 s como límites locales.
TODO-DATA LOAD-WITHDRAWAL-QA: medir una corrida iniciada por el operador y
correlacionar retiros/respuestas en host/Core; no bloquea la implementación local.
