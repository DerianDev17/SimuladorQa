# Retiro con reverso

## Prueba temporizada QA

Actualización 2026-10-29: se puede elegir directamente **Retiro aprobado +
reverso** en Operación. El inspector muestra Solicitud 0200, Respuesta 0210,
Reverso 0420 y Respuesta reverso 0430, incluidos F90/F95 y el desglose público
EMV. El diario conserva las proyecciones protegidas, no los bytes privados.
El resultado distingue RC retiro/RC reverso. Cancelar antes del write impide
el envío pendiente; el enlace se libera solo al cerrar TCP. Ver ADR-030.

En **Retiro aprobado**, elegir **Retiro + reverso** y una espera de 1, 3, 5,
10, 20 o 30 segundos (valor inicial 5). Solo aplica a ahorros, USD, ATM Local,
QA y al perfil de retiro ya autorizado. Solo retiro conserva su comportamiento.

Main valida primero la construccion del reverso y envia 0200. Una respuesta
0210/00 correlacionada y por el monto completo inicia la espera. Despues Main
envia un unico 0420 y espera 0430 en la misma conexion. No se espera que Core
genere el mensaje: el disparador es esta prueba elegida por el usuario. La
espera no es un timeout del host ni una deteccion de tarjeta retenida.

La conexion TCP de observacion se pausa durante todo el flujo y se restaura
al finalizar si el operador la mantenia abierta. Main usa `manageTransport`
para conservar la capacidad de reverso del adaptador al coordinar los sockets.
Un transporte que no admite reversos sigue rechazando esta prueba antes del
retiro; no se degrada a enviar solo el 0200.

El retiro y el reverso tienen UUID distintos, un mismo runId, y comparten
STAN/RRN/terminal del original. Se conservan como padre/hijo en el diario de
retiros. No se reservan otra secuencia ni otra tarjeta para el reverso. F90
vincula el original; F38 procede de su autorizacion. El transporte conserva
solo datos necesarios en memoria Main y los borra al terminar. Nunca guarda
tramas privadas, PAN completo, Track2, PIN ni criptogramas en el diario o Renderer.
Desde ADR-030 se conserva únicamente la proyección pública y sanitizada.

El perfil implementa reverso total, cero efectivo y surcharge cero. El armado
de F28/F48/F55/F60/F90/F95 procede del builder general de la DLL y del PCAP;
ver [reglas y contraste offline](../protocols/QA_REVERSAL_DLL_REVIEW_20261019.md).
F55 selecciona 9F10/95 de la operacion actual. No se simula un segundo GENERATE
AC ni se fabrica el estado IAD posterior de las capturas de tarjeta retenida.

## Persistencia y errores

- El diario registra la intencion antes del 0200 y del 0420. La cuenta regresiva
  se publica despues de guardar la aprobacion. Renderer solo consulta el progreso.
- Doble clic, consulta de resultado o reinicio no repiten mensajes. Si se cierra
  el proceso durante la espera/envio, el registro queda pendiente para revision;
  no se recuperan secretos ni se reanuda una operacion financiera automaticamente.
- Si el retiro no se aprueba por el monto completo, no se envia reverso en esta
  prueba. El resultado incierto se conserva; ADR-025 permite otra solicitud
  cuando la ejecución anterior ya terminó y quedó guardada.
- Si el reverso no se puede enviar o no recibe confirmacion, la aprobacion del
  retiro se conserva. Desde ADR-025, una vez finalizado y guardado todo el flujo,
  se permite una nueva transaccion QA; no se informa un exito global ni se
  resuelve el reverso anterior. Mientras siga activo, se bloquea otro retiro.
- Respuestas tardias/duplicadas no reinician el temporizador. No hay reintentos,
  reconexion, ni respuesta automatica a 0800. Cierre del socket cancela la espera.
- Error al guardar el progreso impide el siguiente envio; error de guardado
  final conserva la referencia y nunca invita a repetir.

UI e historial muestran los dos resultados. El comprobante identifica el
reverso y etiqueta los saldos como anteriores al reverso. 0430/00 confirma la
aceptacion del host; no demuestra el asiento final del Core. Una consulta
posterior puede comprobar los saldos devueltos por el host.

## Evidencia y limites pendientes

Las dos operaciones del cajero aportadas el 2026-10-19 (STAN 001582 y 007985)
muestran 0200/0210/00 y 0420/0430/00, con aproximadamente 34 y 44 segundos
entre solicitudes. El usuario confirma tarjeta retenida como causa de esos
casos. Ver [evidencia](../protocols/QA_REVERSAL_EVIDENCE_20261019.md).

TODO-DATA REVERSAL-CARD-RETAINED: falta el evento remoto de retencion y su
correlacion temporal. La presencia en PC/SC no lo sustituye. La opcion documental
Reverso conserva su bloqueo; la nueva prueba se elige dentro de Retiro aprobado.

TODO-DATA REVERSAL-EMV-COMPLETION: falta validar la finalizacion EMV y el IAD
posterior para reproducir el ciclo fisico completo del ATM. La prueba temporizada
usa el estado actual, no afirma reproducir esa finalizacion.

TODO-DATA REVERSAL-QA-ACCEPTANCE: validar retiro y reverso temporizado contra el
host y correlacionar con Core. El desarrollo se verifica con TCP loopback y
comparacion offline; no envia operaciones financieras durante las pruebas.

TIMEOUT_REVERSAL, parciales, comisiones distintas de cero, otros canales y
reversos REST de Core siguen fuera de este contrato. No se usa la familia
0400/0410 ni se interpreta el tiempo estimado 35–50 s como configuracion validada.
