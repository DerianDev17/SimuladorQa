# Requisitos no funcionales

## Rendimiento
La UI no debe bloquearse durante carga.

## Resiliencia
Una caida del Control Plane no debe detener pruebas locales ya iniciadas, salvo que una politica explicita lo indique.

## Seguridad
Principio de minimo privilegio, secretos fuera de Git y sanitizacion obligatoria.

## Usabilidad
Un tester debe poder ejecutar una transaccion funcional sin editar una trama cruda.

## Diagnostico
Cada transaccion debe tener `transactionId` y cada ejecucion `runId`.

## Escalabilidad
La arquitectura debe admitir mas de cinco agentes sin cambios de modelo.
