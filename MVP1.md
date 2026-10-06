# MVP 1

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

No se habilita carga hasta que cada transaccion MVP pase pruebas funcionales deterministas de una sola transaccion.
