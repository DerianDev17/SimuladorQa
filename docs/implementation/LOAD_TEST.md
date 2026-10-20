# Carga y estres

## Preparacion en modo bloqueado

La pantalla permite definir un borrador QA para consultas de saldo y un perfil
ATM. El operador indica cantidad, modo de carga sostenida o estres gradual, TPS
objetivo, concurrencia, rampa y duracion. Main vuelve a validar el contrato.
Retiros quedaron fuera del alcance inicial de esta pantalla.

El usuario reporta que el Switch soporta como maximo 5 TPS por el momento. La UI
y Main aplican 5 TPS como techo local: todo valor superior se rechaza. Este
techo es provisional y no representa una aprobacion formal ni una medicion del
Switch. El preparador genera un plan UUID en UTC con estado
`BLOCKED_EXECUTION`; la propuesta no se persiste ni se publica. No solicita PIN,
no consulta proveedores QA, no crea tramas y no abre sockets financieros. La
vista descarta el plan temporal al editar la propuesta o salir de la pagina.

## Requisitos para habilitar ejecucion

El primer alcance es exclusivamente consulta de saldo en QA. Aunque se reporto
un tope de 5 TPS, siguen pendientes una ventana autorizada, concurrencia,
cantidad maxima y duracion maxima. La pantalla todavia no tiene endpoint de
ejecucion de carga.

El flujo transaccional existente admite una sola operacion activa y requiere
tarjeta fisica leida, PIN y EMV nuevos por consulta. El catalogo no guarda
perfiles de tarjeta virtual y no existe un generador de PIN/EMV QA para carga.
Por eso no se puede producir 5 TPS con el lector actual, abrir varias consultas
contra la misma sesion ni repetir tramas/capturas; el Switch puede rechazar los
datos dinamicos repetidos o invalidos. No se reutilizan PAN, PIN Block, ARQC ni
tramas capturadas como estrategia de carga.

Antes de enviar debe existir una fuente de perfiles QA y un mecanismo aprobado
por el equipo del Switch/Core para producir datos de tarjeta y seguridad validos
para cada consulta. Tambien se deben confirmar concurrencia, cantidad/duracion,
ventana, politica de parada y suficientes secuencias QA no recicladas.

El futuro ejecutor requiere coordinador en Main y workers fuera del Renderer,
limitador de tasa que nunca exceda 5 TPS, rampa controlada, backpressure,
cancelacion inmediata, cierre ordenado y metricas de enviados/recibidos/
aprobados/rechazados/timeout/errores, TPS y percentiles. Cada envio debe
conservar perfil y destino vigentes, secuencia reservada, credenciales QA
aprobadas, idempotencia y resultado incierto sin reintento.

Produccion permanece bloqueada. PREPROD, retiros, multiples ATM, carga
distribuida y ejecuciones desde mas de una estacion no forman parte de este
preparador.
