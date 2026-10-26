# ADR-020: carga QA con una tarjeta física

Fecha: 2026-10-20. Estado: implementado; pendiente primera corrida contra QA.

## Decisión y autorización

El usuario solicita dejar ejecutable la prueba de carga de saldo, con techo local
de 5 TPS. Al consultar la modalidad de autenticación responde explícitamente
«PIN una vez por corrida». Se registra esta revisión conforme a
`agents/SECURITY_AGENT.md`: el PIN vive solo en memoria de Main durante la corrida,
nunca en Renderer, IPC público, disco, diario ni logs. Las copias por operación
se borran con el `finally` existente; la copia de sesión se borra al terminar,
cancelar, agotar duración, retirar tarjeta o fallar.

La fuente inicial es una tarjeta física leída. El inventario guardado ayuda a
seleccionarla; no contiene credenciales y no reemplaza al chip. Cada consulta
reabre/reselecciona la aplicación, genera primera AC y cifra PIN mediante el
proveedor ya validado para saldo. No se reutilizan tramas ni ARQC capturados.
Las reglas ISO, claves y asignación de STAN/RRN no cambian.

## Límites y ejecución

Worker de planificación separado del Renderer; una consulta a la vez, sin
acumulación de ticks ni recuperación de envíos atrasados. Techo de 5 TPS,
100 consultas y 300 segundos como límites locales de la implementación.
Valores iniciales: 10 consultas, 60 segundos, objetivo 5 TPS y concurrencia 1.
No representan una certificación de capacidad del switch ni alcanzabilidad
de 5 TPS con el lector. La entrada del PIN y la lectura consumen tiempo de corrida.

El usuario elige ATM/cantidad/tiempo y pulsa Iniciar. Main vuelve a comprobar
QA, destino, revisión ATM, tarjeta vigente, perfil de cifrado, cantidad de
secuencias y ausencia de operaciones financieras pendientes antes de abrir el worker.
La sesión excluye modificaciones de contexto y otras ejecuciones desde IPC.
Detener cancela generación y sockets; un envío sin respuesta queda incierto,
sin reintento automático. Se detiene al primer rechazo/error.

## Evidencia y recuperación

Cada operación conserva `requestId`, `transactionId`, STAN/RRN y el `runId`
común en el diario financiero. `qa-load-runs.sqlite` conserva las corridas
con parámetros inmutables y métricas públicas, sin borrar evidencia para hacer
espacio. Importa una vez el JSON anterior, conservándolo como respaldo. La base
impide reutilizar `requestId`. Un cierre inesperado marca la corrida interrumpida;
no se reanuda.
Las pruebas usan hardware sintético y TCP loopback. No se ejecutó carga real
como parte de esta implementación.

TODO-DATA LOAD-VIRTUAL-PROVIDER: contrato del pool financiero para concurrencia
mayor a uno, generación segura de PIN/EMV y distribución por ATM/tarjeta.
Solo ese alcance queda pendiente; el piloto físico secuencial usa la ruta actual.
