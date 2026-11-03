# Flujo transaccional implementado

Alcance: ejecución QA/LOCAL/ahorros. Las capas y sus contratos están en
[ARCHITECTURE.md](../../ARCHITECTURE.md); los detalles de saldo, retiro y reverso
se consultan desde el [índice documental](../README.md).

1. El operador selecciona ATM, operación y monto cuando aplica, lee la tarjeta
   y solicita la ejecución mediante la interfaz.
2. Preload envía la solicitud tipada a Main. Main valida ambiente, perfil,
   revisión, tarjeta vigente, entradas y exclusión con otras operaciones.
3. El motor comprueba idempotencia y obtiene contexto financiero y seguridad
   nuevos mediante los puertos y adaptadores del perfil.
4. El builder compone el mensaje del flujo. El diario registra la intención
   antes del envío, con UUID y correlación disponible.
5. El transporte adquiere el enlace QA exclusivo, aplica framing y plazos,
   envía y espera la respuesta. En carga también respeta el límite global TPS.
6. La respuesta se decodifica y correlaciona. El motor persiste resultado o
   incertidumbre sin reintentar automáticamente la solicitud.
7. Renderer recibe resultados públicos y mensajería protegida. Los recursos y
   el contexto de seguridad se liberan al cerrar la operación.

La prueba explícita de [retiro + reverso](../transactions/REVERSAL.md) conserva
su ciclo específico: aprobación completa, espera local y un reverso en la misma
conexión. No es una respuesta automática al timeout del host.

## Observación y diseño futuro

El feed/historial Mediator es una consulta independiente. No hay etapas
obligatorias de conciliación automática SmartVista/Core ni envío de métricas a
un Control Plane implementado. Esos pasos del diseño inicial son pendientes del
[backlog](../BACKLOG.md).

El [diagrama inicial](transaction_flow.png) se conserva como referencia de diseño;
no representa todas las etapas disponibles hoy.
