# ADR-029: una conexión financiera activa en el enlace QA

Fecha: 2026-10-29. Fuente: `tcpcomms01.out` aportado por el usuario y
correlación con la corrida `982fba95-0f9a-4414-b512-ed257410e6d7`.
Sustituye la apertura de sockets financieros simultáneos de ADR-027 para
el enlace QA actual. No cambia reglas ISO, PIN/EMV ni habilita producción.

## Evidencia y causa

El log de TCPComms, líneas 144917–144970, registra esta secuencia (hora del
servidor, coincidente con Ecuador en la evidencia del operador):

- 11:25:20.971956: nueva llamada de la estación autorizada como dispositivo 80131.
- 11:25:20.972005: el dispositivo ya está conectado en fd 86;
  TCPComms cierra fd 86 y adopta fd 87.
- 11:25:20.972120: emite COMMS_RESTART para el mismo dispositivo.
- 11:25:21.143706–11:25:21.143816: el segundo socket se desconecta y emite
  COMMS_SHUTDOWN después de la cancelación local.

El diario local registra primero PEER_CLOSED para STAN 900228, tres operaciones
sin envío y TRANSPORT_ERROR para 900229. La captura del switch incluye ambos
STAN. El código anterior abría un socket por consulta concurrente: seleccionar
otro Terminal ID no crea otro dispositivo de comunicaciones. La segunda
conexión desplazó a la primera; la parada por error canceló las restantes.
No es evidencia de rechazo financiero ni de capacidad máxima del host.

Solo se conservan estos metadatos en Git. El log original contiene datos
transaccionales privados y no se copia al repositorio ni a fixtures.

## Decisión

- QaSwitchConnection admite hasta cinco operaciones del mismo runId y destino,
  pero entrega el transporte a una sola a la vez, en orden de llegada.
  La preparación exclusiva del chip puede avanzar mientras el host responde.
  Se mantiene la exclusión de operaciones manuales, otro runId y otro destino.
- Una operación cancelada o vencida en la cola no abre socket ni escribe.
  El vencimiento usa el mismo plazo monotónico de la corrida. Cancelar un
  elemento de la cola no permite adelantar al socket todavía activo.
- BalanceTcpTransport completa el cierre TCP antes de devolver el resultado.
  En carga, tras una respuesta válida inicia cierre ordenado; el plazo de conexión
  configurado acota la limpieza si el peer no completa el cierre. Conserva
  la respuesta recibida y su latencia, sin incluir ese cierre en latencia host.
- Un resultado no aprobado o una excepción impide que la cola pendiente abra
  otra conexión antes de que LoadRunService reciba el fallo y cancele el trabajo.
  Se conserva la política de parada al primer rechazo/error y cero reintentos.
- La observación se restaura una sola vez al terminar todo el grupo y respeta
  desconexión manual, cambio de ambiente y cierre de aplicación.
- Se mide `connectionWaitMs` aparte de host, lector y límite TPS. Las operaciones
  siguen revalidando contexto, vigencia y permiso TPS inmediatamente antes del write.
- Las cancelaciones explícitas se anotan en la corrida sin cambiar el outcome
  financiero original. UI separa errores, canceladas y envíos sin respuesta.
  El primer error y su STAN permanecen visibles aunque terminen otras operaciones.
  Los registros anteriores no se reclasifican retrospectivamente.

## Alcance y pendientes

El objetivo TPS es un límite, no una promesa de caudal. Una respuesta de alrededor
de 1,3 s limita el envío secuencial de este enlace, incluso con preparación
adelantada. No se ofrecen sockets paralelos como solución para este PID.

TODO-DATA LOAD-PERSISTENT-TCP: falta contrato aprobado de persistencia,
multiplexación, gestión y respuestas tardías para varios mensajes en una sesión.
El log prueba el reemplazo de conexiones, no aprueba multiplexación. Otra
alternativa requiere dispositivos de comunicaciones independientes autorizados.
Solo esos cambios dependen de nueva evidencia; esta corrección funciona con
el contrato de envío único existente.

## Validación

Pruebas TCP loopback reproducen un host que sustituye la conexión anterior:
dos ATM y hasta cinco operaciones en curso terminan sin reemplazos ni reenvíos. Se cubren
timeout, cancelación, plazo de cola, orden de admisión, aislamiento de scope,
restauración de observación, errores y persistencia de resultados. No se envía
carga al host QA durante el desarrollo. La aceptación real requiere una nueva
corrida explícita del operador con la versión corregida.

Resultado local: 980 pruebas unitarias y 249 de integración aprobadas; lint,
typecheck, seguridad y build aprobados. La selección E2E amplia pasó diez casos
y no pudo iniciar el caso adicional de arranque de Vite porque el puerto 5173
ya estaba ocupado por la instancia de desarrollo. No se detuvo esa instancia
para liberar el puerto ni se alteró el test para ocultar el conflicto.
La selección específica de las cuatro pruebas E2E de carga pasó completa,
incluida la presentación separada de errores, cancelaciones e incertidumbre.
