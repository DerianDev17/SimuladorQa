# Carga y estrés de saldo en QA

## Varios perfiles en una corrida — 2026-10-28

En **Selecciona los ATM**, marcar ATM20521 y ATM20524 (o los perfiles QA
disponibles). Las consultas alternan en el orden seleccionado: A → B → A → B.
Usan una tarjeta física y una operación en curso. La cantidad, duración y TPS
son totales de la corrida, no por terminal. Si se completa una cantidad impar,
el primer perfil recibe una consulta más. La parada por error o duración puede
terminar antes de recorrer todos los perfiles.

Se validan todos los perfiles antes de pedir PIN o iniciar el worker. Cada
operación vuelve a comprobar el contexto del ATM mediante la ruta de saldo
existente. El pool de la plantilla es compartido: no se suma ni se duplica su
disponibilidad. Conservadoramente, cada perfil debe informar reservas para la
cantidad total; no se infiere independencia entre pools. El plan debe admitir
al menos tantas consultas como perfiles seleccionados.

Cada fila identifica el ATM ejecutado, también después de recuperar la corrida.
El contrato conserva los registros antiguos de un solo ATM. La ejecución
concurrente y las tarjetas virtuales siguen fuera de esta entrega. ADR-026.

## Revisión adicional: cierre y presupuesto de tiempo (2026-10-27)

Se reprodujeron tres defectos con regresiones que fallaban antes del cambio:
una parada durante la escritura final dejaba el estado en `STOPPING`; consultar
una corrida terminada durante la preparación de la siguiente alteraba su tiempo
y admitía una parada tardía; un callback atrasado del worker iniciaba una
operación después de vencer el plazo. Los tres recorridos quedan corregidos.

- Estado y métricas finales se congelan antes de persistir. Una parada tardía
  no cambia el resultado anterior, ni oculta un fallo confirmado del worker.
- La preparación previa verifica dependencias sin iniciar el cronómetro. Al
  aceptar la corrida, Main y worker comparten un origen monotónico: guardar el
  inicio, arrancar el worker, ingresar el PIN y ejecutar consumen el mismo
  presupuesto. Ya no se añade otra duración completa al arrancar el worker.
- Se comprueba el vencimiento tanto en el callback del worker como al recibir
  el tick en Main. No empieza otra operación fuera de plazo; se mantiene la
  espera acotada de la operación que sí empezó a tiempo.
- Las confirmaciones duplicadas recibidas antes del siguiente tick no acumulan
  temporizadores. Main devuelve el instante real en que inició la operación:
  el intervalo siguiente se calcula desde ahí, no desde la emisión del tick.
  Una regresión con entrega retrasada reprodujo dos inicios separados por
  unos 64 ms a un objetivo de 5 TPS; ahora respeta el intervalo de 200 ms,
  incluso si la entrega anterior se retrasó, sin ráfagas de recuperación.
- Cada resultado nuevo conserva `finishedElapsedMs` además del timestamp UTC.
  La gráfica usa ese tiempo transcurrido, independiente de ajustes del reloj
  de Windows. Los registros antiguos siguen usando sus fechas disponibles.
  El objetivo dibujado termina al vencer el plazo, aunque siga llegando una
  respuesta durante el cierre.

Regresiones con worker real, retraso intencional del event loop, almacenamiento
lento, paradas tardías y SQLite reabierto. No se cambian tramas ISO, claves,
contadores financieros, límites de TPS ni se envía carga al switch.

## Lectura del historial existente

Inspección de solo lectura el 2026-10-27: la última corrida guardada, iniciada
el 2026-10-20T20:23:20.307Z, pidió 3 TPS/100 consultas/60 s. Completó cinco
envíos y cinco respuestas aprobadas en 68,194 s: **0,0733 TPS**. El transporte
y espera de respuesta sumaron 6,224 s, con promedio 1244,8 ms y p95 1395 ms.
Los 61,970 s restantes no tienen desglose histórico; no pueden atribuirse a
lector, PIN, cifrado, diario o espera programada a partir de ese registro.
La duración incluye cierre de operaciones. No acredita estrés del switch a
3 TPS ni permite inferir su capacidad máxima. Informe local sin datos privados:
`artifacts/load-history-review-20261027.json`.

## Correcciones verificables del 2026-10-27

- Retirar la tarjeta o perder el lector detiene la corrida y libera la sesión
  PIN. Tras una nueva lectura se puede iniciar otra corrida explícita, sin
  reiniciar la aplicación. El cierre definitivo se reserva para salir de la app.
- Detener durante la persistencia del inicio termina sin activar el worker;
  ya no deja una corrida en `STOPPING` esperando su límite de duración.
- Main y el worker admiten objetivos desde 0,1 hasta 5 TPS. El mínimo evita
  desbordar el temporizador con tasas casi nulas. El lector de registros
  anteriores conserva compatibilidad con los valores históricos.
- Ante un timeout de IPC, la UI conserva el identificador de la solicitud y
  recupera su estado confirmado o respuesta tardía. No crea otra corrida ni
  deja un bloqueo permanente después de confirmar el resultado. Una respuesta
  de polling anterior al inicio/parada no sobrescribe el estado nuevo.
- La gráfica usa respuestas recibidas, omite el tramo futuro y representa el
  objetivo gradual con la misma función del worker. Se muestran operaciones
  en curso, p90 y latencia máxima además de las métricas existentes.
- La selección única de esta revisión queda sustituida por la selección múltiple
  secuencial del 2026-10-28. Se conservan validación de dependencias y eliminación
  de la etiqueta ambigua «702» del flujo de saldo.

Las regresiones usan worker real, almacenamiento temporal, TCP loopback y
Electron con fuente sintética. No se ejecuta carga contra el switch QA.

## Ejecutar el piloto con tarjeta física

1. Abrir **Carga y estrés** en QA y marcar uno o varios ATM configurados para saldo.
2. Elegir **Prueba rápida**, **1 TPS**, **3 TPS** o **5 TPS**. Los presets
   completan cantidad y duración dentro de los límites locales; son objetivos,
   no tasas garantizadas. **Modo avanzado** permite ajustar esos valores.
3. Seleccionar la tarjeta QA en el lector. Un perfil guardado puede preseleccionar
   el AID, pero hay que leer el chip físico antes de iniciar.
4. Pulsar **Iniciar prueba** e ingresar el PIN en el diálogo nativo.
   El PIN se pide una vez por corrida, según autorización del usuario.

El panel muestra enviados, respuestas, aprobaciones, rechazos, errores, TPS
reales y percentiles. **Detener prueba** cancela el trabajo y cierra el socket.

La interfaz reemplaza el planificador bloqueado por un ejecutor físico
secuencial. El límite es lo primero que ocurra: cantidad o tiempo. Se detiene
ante el primer rechazo/error o retiro de tarjeta. No hay reintentos automáticos.
No hace falta mantener la página abierta: al volver se recupera la corrida.

## Requisitos comprobados por Main

Solo QA/LOCAL/ahorros/consulta de saldo. El destino y los plazos provienen de
Configuración; no se inventan desde la pantalla de carga. Se comprueban revisión
ATM, lectura vigente, perfil financiero, cifrado, secuencias suficientes y
ausencia de operaciones `PENDING` en el diario de saldo.
Si falla una comprobación se muestra su causa sin arrancar el worker.

El intervalo permitido es 0,1–5 TPS. Los máximos locales son una operación simultánea, 100 consultas y
300 segundos. El lector, las operaciones EMV, el cifrado y la respuesta del host
pueden impedir alcanzar 5 TPS. El tiempo incluye la entrada inicial del PIN.
Esta prueba no certifica la capacidad máxima del switch.
La pantalla explica cuando la cantidad ingresada supera las 100 consultas y
mantiene deshabilitado el inicio hasta corregirla.
El selector muestra los ATM disponibles y permite elegir varios por corrida.
Las consultas alternan entre los seleccionados. Main resuelve la plantilla reutilizable ATM20521 para los
ATM QA/205 y comprueba las reservas del pool compartido de la estación. Crear
otro ATM no duplica ni repone las reservas. Ver [plantilla](MULTI_ATM_PROFILES.md).
Los perfiles QA guardados son referencias de lectura y no credenciales virtuales.
Las comprobaciones de perfil financiero y secuencias ocurren al iniciar en Main.

## Motor, seguridad y métricas

Un worker agenda cada operación sin ráfagas de recuperación; espera la respuesta
antes de agendar la siguiente. Main coordina hardware y transporte existentes.
El intervalo objetivo se mide desde el inicio de la consulta anterior: cuando
la lectura del chip, la preparación y el host ya consumieron ese intervalo,
la siguiente consulta empieza sin una espera adicional. La concurrencia física
sigue siendo uno y el objetivo de TPS no garantiza que se alcance.
Al alcanzar el límite de duración, no inicia otra consulta y espera hasta 35
segundos para cerrar la operación que ya estaba en curso y registrar su
respuesta. Si sigue sin terminar, cancela la dependencia, marca la corrida como
fallida y deja la correlación disponible para revisión; no reintenta el envío.
Cada consulta vuelve a leer el chip, genera seguridad y reserva una secuencia
nueva. La misma tarjeta debe permanecer insertada. El PIN de sesión permanece
solo en memoria y se borra al terminar o detenerse, sin pasar por Renderer.
Ver [ADR-020](../adr/ADR-020-PHYSICAL-CARD-LOAD.md).

Las transacciones comparten `runId`, conservando `transactionId`, `requestId`
y STAN/RRN propios. Se persisten parámetros inmutables y resultados públicos en
`qa-load-runs.sqlite`, sin límite de 100 corridas ni borrado automático. Al primer
acceso se importa el JSON anterior dentro de una transacción; el archivo original
permanece como respaldo. Si está corrupto, el inicio se bloquea hasta revisarlo.
Cada `requestId` queda como clave única, incluso después de reiniciar.
TPS = envíos con bytes encolados / tiempo total. Los percentiles usan únicamente
respuestas recibidas y su tiempo de transporte, sin contar como respuesta una
lectura o preparación local. La UI distingue operaciones en curso de envíos.
Cada resultado nuevo registra únicamente duraciones numéricas de lectura,
revisión, preparación de contexto, validación, diario, transporte y resto.
No se guardan PIN, PAN, tramas ni campos EMV en estas mediciones. Los resultados
anteriores carecen de desglose: por ejemplo, la corrida local de 5 respuestas
completadas en 68,2 s consumió 6,2 s en transporte; los ~62 s restantes no
pueden asignarse retrospectivamente a una etapa concreta. La próxima corrida
permitirá medirlos sin inferir que el host causó toda la demora.

Un envío cancelado después de transmitir conserva estado incierto y bloquea
continuaciones automáticas. Al reiniciar, una corrida activa se marca
interrumpida; no se retoma ni se repite. Debe revisarse el diario antes de otra
prueba. Los servicios reales siguen protegiendo solicitudes duplicadas.
Una operación `PENDING` impide iniciar. Los errores históricos ya finalizados
se conservan y no impiden iniciar explícitamente nuevas consultas de saldo
con identificadores nuevos; nunca se repite la consulta anterior.

## Alcance pendiente

TODO-DATA LOAD-VIRTUAL-PROVIDER: falta el contrato de un proveedor financiero QA
para un pool virtual y concurrencia mayor a uno. Las referencias VISA ficticias
y las tarjetas guardadas no contienen PIN/EMV reutilizable. Ese alcance queda
separado del piloto ejecutable con tarjeta física. PREPROD, retiros, varios
ATM simultáneos y carga distribuida no se habilitan aquí.

Validación del cambio: pruebas de dominio, sesión PIN, worker real, persistencia,
cancelación TCP loopback, reutilización del flujo de saldo y UI Electron con
fuente sintética. La primera corrida real debe iniciarla el operador; no se ha
enviado carga al switch durante el desarrollo.
