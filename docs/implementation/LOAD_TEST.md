# Carga y estrés de saldo en QA

## Ejecutar el piloto con tarjeta física

1. Abrir **Carga y estrés** en QA y seleccionar el ATM configurado para saldo.
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

Los máximos locales son 5 TPS, una operación simultánea, 100 consultas y
300 segundos. El lector, las operaciones EMV, el cifrado y la respuesta del host
pueden impedir alcanzar 5 TPS. El tiempo incluye la entrada inicial del PIN.
Esta prueba no certifica la capacidad máxima del switch.
La pantalla explica cuando la cantidad ingresada supera las 100 consultas y
mantiene deshabilitado el inicio hasta corregirla.
El selector permite ver varios ATM, pero Main ejecuta solo uno por corrida;
seleccionar varios muestra la dependencia pendiente y deshabilita el inicio.
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
`qa-load-runs.json`, hasta 100 corridas; no se borra historia automáticamente.
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
separado del piloto ejecutable con tarjeta física. PREPROD, retiros, múltiples
ATM y carga distribuida no se habilitan aquí.

Validación del cambio: pruebas de dominio, sesión PIN, worker real, persistencia,
cancelación TCP loopback, reutilización del flujo de saldo y UI Electron con
fuente sintética. La primera corrida real debe iniciarla el operador; no se ha
enviado carga al switch durante el desarrollo.
