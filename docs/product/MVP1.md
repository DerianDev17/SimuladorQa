# MVP 1

Alcance objetivo inicial, aún no certificado como conjunto. Para funcionalidades
vigentes consultar el [README](../../README.md); para aceptación externa pendiente,
el [backlog](../BACKLOG.md). Seleccionar un perfil guardado no sustituye la tarjeta
física que requieren los flujos actuales.

## Transacciones obligatorias

1. Consulta de saldo.
2. Retiro aprobado.
3. Retiro rechazado.
4. Reverso.
5. Reverso por timeout.

## Definition of MVP 1

MVP 1 esta completo cuando un tester puede:

1. Iniciar la app.
2. Seleccionar QA o PREPROD.
3. Seleccionar perfil ATM.
4. Leer una tarjeta fisica o seleccionar un perfil de tarjeta.
5. Ejecutar una de las cinco transacciones.
6. Ver request ISO y response ISO.
7. Ver codigo de respuesta interpretado.
8. Ver latencia end-to-end.
9. Ver correlacion en SmartVista cuando exista acceso.
10. Ver correlacion en Core cuando exista adaptador.
11. Guardar evidencia de la ejecucion.

## Gate tecnico previo a carga

El requisito inicial de completar los cinco flujos antes de habilitar cualquier
carga fue sustituido para el piloto QA por [ADR-020](../adr/ADR-020-PHYSICAL-CARD-LOAD.md)
y para retiros por [ADR-031](../adr/ADR-031-WITHDRAWAL-LOAD.md).
La carga disponible reutiliza saldo/retiro y sus pruebas; no habilita reversos
en carga ni acredita la aceptación de los cinco flujos en host/Core.
