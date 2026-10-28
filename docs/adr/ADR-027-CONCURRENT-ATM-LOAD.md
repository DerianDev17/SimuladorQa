# ADR-027: solicitudes concurrentes de varios ATM en carga QA

Fecha: 2026-10-28. Fuente: aclaración explícita del usuario de ejecutar ambos
ATM simultáneamente y aplicar mejoras para un objetivo de 3 TPS.
Sustituye la restricción secuencial de ADR-026. Alcance: consultas de saldo QA.

## Decisión

- Concurrencia configurable de 1 a 5 operaciones por corrida; el escenario
  de 3 TPS propone cuatro slots. Un worker agenda inicios sin esperar cada
  respuesta, con tickets y confirmaciones independientes para evitar liberar
  dos veces un slot. Cantidad, duración, rampa y TPS son globales.
- Una vía exclusiva prepara tarjeta, PIN/EMV, secuencia y validación. Se libera
  después de la persistencia PENDING y de entregar el mensaje al transporte,
  antes de recibir la respuesta. Los mensajes no comparten buffers ni AC.
  Las operaciones esperando el lector cuentan contra el límite; no hay cola
  ilimitada ni preparación anticipada de toda la corrida.
- Cada socket conectado espera permiso de un limitador compartido antes de
  escribir. Usa reloj monotónico, no acumula créditos, comprueba cancelación
  y duración; la vigencia del contexto se comprueba otra vez al obtener turno.
  El plazo de respuesta empieza al escribir, no al esperar permiso TPS.
- Main y BalanceInquiryService admiten operaciones simultáneas solamente en
  un scope interno con runId y límite coincidentes. Renderer no puede aportar
  ese scope al canal financiero. Operaciones manuales, retiros, cambios de
  ambiente y edición de configuración/perfiles conservan exclusión.
- Diario con read-modify-write serializado: respuestas fuera de orden no
  eliminan registros ni restauran PENDING antiguo. Idempotencia por requestId,
  seguridad y secuencia nueva por operación; correlación STAN/RRN/terminal
  por socket. Cada resultado conserva ATM, aunque no termine en orden.
- Observación TCP se libera antes de abrir el grupo financiero y se restaura
  solo cuando termina su último socket, respetando desconexión/cambio de entorno.
  No hay reenvío, reconexión automática ni multiplexación financiera inferida.
- Primer error cancela slots pendientes y sockets activos. Todos los resultados
  se guardan antes del cierre. Lo ya transmitido conserva incertidumbre. Al
  vencer duración no se inicia ni escribe otro mensaje; las respuestas ya en
  vuelo tienen cierre acotado. Los slots vencidos sin envío no se cuentan como
  transacciones ejecutadas; cualquier registro financiero ya creado conserva
  su resultado sin bytes transmitidos. Reiniciar no reanuda la corrida.
- Métricas existentes se conservan y se separan espera del lector y espera TPS
  del tiempo de transporte. Registros históricos sin esos campos siguen legibles.
  La latencia y sus percentiles excluyen el tiempo del permiso TPS/validación
  previo al write; ese tiempo se conserva en el desglose de la operación.

## Límites de la evidencia

Simultaneidad significa solicitudes en vuelo superpuestas, no writes en el
mismo milisegundo. A 3 TPS, el intervalo mínimo global es aproximadamente
333 ms. La cantidad de slots no garantiza 3 TPS: un chip que prepare más lento
no alimenta el motor a ese ritmo. No se reutilizan criptogramas para compensarlo.

TODO-DATA LOAD-3TPS-PHYSICAL: medir etapas con el hardware real y, si no alcanza,
integrar el proveedor virtual QA aprobado o varias fuentes físicas independientes.
TODO-DATA LOAD-PERSISTENT-TCP: obtener contrato de persistencia/multiplexación y
correlación de respuestas tardías antes de reutilizar conexiones financieras.
Admisión remota de conexiones simultáneas y TPS sostenidos quedan por validar.

## Pruebas

Worker real a 3 TPS con cuatro slots y respuestas de más de un segundo; TCP
loopback con ambos terminales en vuelo, respuestas fuera de orden, PIN una vez,
lectura exclusiva, STAN/UUID distintos y diario SQLite reabierto. Casos de
timeout, parada, límites, scope ajeno, exclusión manual e idempotencia. E2E
verifica el control de concurrencia, operaciones activas y recuperación.
No se ejecuta carga contra el switch durante el desarrollo.

Validación local final: 1201 pruebas unitarias/de integración (99 archivos) y
4 casos E2E aprobados. Lint, TypeScript strict, formato, revisión de seguridad
y build aprobados. La prueba de ritmo mide inicios y writes del emisor, no
intervalos entre callbacks de recepción que Windows puede entregar agrupados.
