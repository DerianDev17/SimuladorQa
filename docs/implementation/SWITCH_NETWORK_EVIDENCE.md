# Evidencia de red del Switch en Configuracion

## Fuente recibida y alcance

El usuario identifico el 2026-10-07 las IP de SmartVista, Mediator y cajeros,
el puerto ATM 16100 y el enlace CB 49212. Aporto cuatro capturas de SmartVista
y netstat. Confirmo que **todos esos enlaces corresponden a QA**, aunque el
hostname conserve preprod, y que el simulador se ejecutara **desde su PC**.
No cambia el perfil SQL previamente inspeccionado: su host es otro y su
ambiente PREPROD fue confirmado en una inspeccion anterior.

Las cuatro fuentes originales se conservan como artefactos privados, con UUID,
UTC de recepcion y SHA-256 en `artifacts/switch-network-sources.json`. No se
versionan capturas de transacciones ni direcciones operativas en codigo.

| Observacion | Evidencia | Limite de la conclusion |
| --- | --- | --- |
| SmartVista escucha en 16100 y tiene un socket con 172.60.60.171, identificado despues como balanceador | netstat LISTEN y ESTABLISHED, PID 80131; correccion del usuario | Estado de esa captura; no es health check de esta PC |
| Cajeros inician el enlace ATM | PID: puerto local 16100, remoto ANY, iniciador REMOTE; roles confirmados por usuario | Acceso del simulador desde otra PC por validar |
| SmartVista/Mediator tienen socket por 49212 en ambos extremos | netstat ESTABLISHED | No prueba que el simulador deba abrir ese enlace ni quien lo inicio |
| PID 80131, instituto 8013 EF ATMRTC, formateador 58, TCP01, VISA, indicador 28 Visa SMS network | pantalla de interfaz | Identificadores del servidor; no definen campos ISO, F22 o plantilla por entidad |
| Longitud de encabezado configurada 2 y keep alive 1 | pantalla de interfaz | No define byte order, VLI inclusivo/exclusivo, cabecera de negocio o intervalo |
| Remoto configurado: balanceador del enlace de cajeros | pantalla de interfaz y correccion del usuario | No permite asumir que acepta la IP/VPN/NAT del simulador desde la PC |

La captura transaccional contiene operaciones y varios estados internos/history.
No se importa a los contadores de la app ni se deduce un mapeo universal entre
codigos internos SmartVista, response code ATM y aprobacion Core.

## Implementacion

### Topologia precisada por el usuario, 2026-10-08

El usuario corrige el rol de 172.60.60.171: es el balanceador, no el nodo que
ejecuta el proceso ATM. Aporta configuracion de SWATM01 y dos pantallas de
Echelon. La primera identifica ADQCLONE / 172.60.60.152; la segunda,
MEDIATORCLONE / 172.60.60.156. Son evidencia de configuracion, no instrucciones
para ejecutar procesos o cambiar el servidor.

| Componente | Configuracion aportada | Alcance |
| --- | --- | --- |
| SWATM01 en ADQCLONE | TCPIPLINK.EXE, SWATM01 GenCommSubsystem CALL 10.60.0.11 16100 | El proceso ATM inicia la conexion hacia SmartVista |
| Formato SWATM01 | PacketDrv=PKT_VISA; MsgFormat=ISO8583MsgFormat; MsgFormatParam=E:\ExtremePCI\configfiles\ISOBASEI.BIN | Identifica el driver y el archivo de formato reales de Coonecta; no describe todavia su estructura binaria |
| Adaptador SWATM01 | Extreme.Switch2013PCI.dll; Extreme.Switch2013PCI.SwitchIso | Identificadores aportados; no se deducen reglas de negocio por el nombre |
| Balanceador | 172.60.60.171, confirmado por usuario | Es tambien el peer que registra SmartVista; el mecanismo de traduccion/balanceo no esta documentado |
| PROXY205 en MEDIATORCLONE | TCPIPLINK.exe, PROXY205 GenCommSubsystem LISTEN 10.60.0.11 49212 | Complementa el WE_CALL de SmartVista para CB 82052; no se interpreta el argumento de IP como un bind local sin especificacion TCPIPLINK |

El XML configura start=1 y timeout=15000 en execute, ademas de parametros de
colas y workers. No se convierte ese timeout en plazo de respuesta financiera
ni se adopta su unidad sin documentacion del ejecutor.

La evidencia distingue dos enlaces: SWATM01 -> SmartVista y
SmartVista -> PROXY205/Mediator -> servicio Core. Una respuesta de vuelta no
prueba una segunda conexion TCP iniciada en sentido inverso. Para replicar la
entrada ATM hace falta recibir ISOBASEI.BIN o su definicion/exportacion aprobada,
y una muestra CB correlacionada. No se sustituye por ContextoISO.xml de BANRED.
En una primera busqueda el archivo no estaba en el workspace. Posteriormente
el usuario aporta Y:/ExtremePCI/ConfigFiles/ISOBASEI.bin y se inspecciona su
estructura completa: [revision ISOBASEI](../protocols/ISOBASEI_REVIEW.md).
El diccionario deja de ser una fuente ausente; faltan las verificaciones wire
y las reglas por escenario que no se deducen de una tabla de campos.

El rechazo de la PC por direccion sigue confirmado: SmartVista ve 10.10.10.21,
mientras su dispositivo activo admite al peer del balanceador 172.60.60.171.
Ejecutar desde ADQCLONE no garantiza que una nueva conexion salga por esa misma
direccion ni que el PID permita conexiones simultaneas. Antes de elegir ese
camino, verificar la configuracion de salida del balanceador y las reglas de
coexistencia del enlace; no se modifica ni interrumpe la sesion activa.

Configuracion muestra **Destino ATM documentado** para el ambiente correspondiente:
entrada del Switch, enlace observado con Mediator, remoto del PID, origen del
simulador e identificadores/labels de la interfaz. Se distingue evidencia
documental de una conexion comprobada. Mantiene connection=NOT_CONFIGURED y
todos los envios BLOCKED. No hay nuevos canales de envio ni pruebas de socket.

La fuente es `network-evidence.json` privado bajo userData de Electron,
preparado localmente a partir de los datos del usuario. Main lo lee una vez al
iniciar, con limite de 8192 bytes. Reiniciar la app carga cambios en esa evidencia.
El puerto NetworkEvidenceCatalog mantiene dominio/UI independientes de archivos,
del proveedor y de comunicaciones. El adaptador valida schema exacto, UUID,
UTC de recepcion, ambiente QA/PREPROD, IP IPv4, puertos, valores de interfaz y
claves extra. No acepta credenciales, PAN ni una configuracion PROD.

La evidencia se proyecta/copia antes de entregarla y se oculta al cambiar a otro
ambiente. Un archivo ausente produce NOT_CONFIGURED; corrupcion, exceso, claves
extra o fallo de lectura producen UNAVAILABLE sin filtrar contenido/rutas ni
bloquear el shell. No se inventa un ambiente a partir del hostname.

El archivo contiene version, id, recordedAt, environment, ingress(host/port),
downstream(host/localPort/remotePort), observedPeer, simulatorOrigin, entityId
y networkInterface(id/protocolLabel/formatLabel/configuredHeaderLength/initiator/
keepAliveEnabled). Estos valores documentales no se usan para abrir conexiones.

## Revision preliminar de PCAP

Se reexaminaron localmente los diez PCAP existentes buscando los enlaces 16100
y 49212. RAW permanece solo en memoria de una herramienta privada. Se compararon
cuatro perfiles de longitud de dos bytes (BE/LE, inclusivo/exclusivo) sobre
direcciones sin huecos ni solapamientos distintos, sin interpretar campos.

- 16100: ocho direcciones, cuatro con solapamientos distintos. Ninguna de las
  cuatro restantes se consume por completo con los perfiles de longitud probados.
- 49212: trece direcciones, seis con solapamientos distintos. Cuatro direcciones
  permiten consumir 196 frames BE16 con longitud exclusiva, incluidos frames
  de cuerpo vacio; las demas no validan un stream completo con esos candidatos.

Este analisis preliminar no constituye un codec aprobado: puede haber capturas
que comienzan a mitad de frame, otra envoltura o problemas de reensamblado.
No se elige una causa ni se omiten solapamientos silenciosamente. No se transfiere
el perfil 4946 de BANRED al puerto ATM 16100 ni se llama mensajes ISO a los
frames vacios. El reporte privado es `artifacts/tcp-transport-probe.json`.

## TODO-DATA dependientes

Actualizacion 2026-10-07: TCP 16100 acepta conexion desde la PC. Un intento de
captura completa la escritura local, recibe 17 bytes y termina PEER_CLOSED;
el usuario no encuentra la transaccion en sus monitores. Una conexion posterior
sin enviar bytes recibe NO AUTHORIZATION y cierra. El acceso TCP no acredita
autorizacion de la interfaz ni procesamiento ISO. Validar origen visto por el
Switch, log de denegacion y asociacion al PID QA antes de repetir la transaccion.
No se ha modificado la configuracion del servidor. Detalle y UUID en
[prueba de captura](QA_CAPTURE_REPLAY.md).

Actualizacion 2026-10-08: el log de startup confirma listener 16100 y admision
del cajero como dispositivo 80131 por direccion. La prueba local de 10:00:49
(Ecuador) conecta desde la PC y vuelve a recibir NO AUTHORIZATION sin write.
Los logs recibidos terminan antes de ese intento. Tambien muestran 82032 en
49276 y 82052 en 49212, contrario a la asociacion aportada previamente. El usuario
confirma que CB 205 corresponde a 82052 y limita la prueba a esa entidad.
El destino documental 49212 ya coincide; se registra el PID en un reporte privado
sin cambiar el schema. La muestra USD 20 de 82032 queda apartada para CB.
Ver [analisis de admision](../protocols/QA_SWITCH_ADMISSION_REVIEW.md).

El bloque posterior aportado del log activo confirma: tcpcomms01 acepta el
socket de 10.10.10.21:52922, ejecuta la busqueda de dispositivo por direccion y
lo cierra como address (...) is invalid, fd 87. SWITCH-ATM-ACCESS ya tiene
origen y decision identificados; queda pendiente configurar una interfaz ATM
QA admitida para la PC, con endpoint/perfil aprobados y destino CB 82052.

- SWITCH-ATM-ACCESS: IP 10.10.10.21 vista por SmartVista y rechazo por direccion
  confirmados. Pendiente vinculacion a dispositivo/interfaz ATM QA autorizado
  con endpoint/perfil aprobados y convivencia con el cajero activo.
- SWITCH-ATM-FRAMING: significado de longitud de encabezado 2, prefijo/orden de
  bytes, cabecera, keepalive y muestra completa pareada del enlace ATM 16100.
- ISO-SPEC/GOLDEN-SAMPLES: diccionario ATM y request/response de saldo/retiro,
  campos dinamicos, rechazo, originales/reversos y sanitizacion.
- ENVIRONMENT: TLS, timeout, reconexion y max inflight del PID ATM en QA.
- CMS-TRANSPORT: contrato/unidad del timeout del Core 205 ya documentado.

## Verificacion

Unit: validacion positiva, IP/puerto/UTC/UUID, PROD, claves/etiquetas sensibles y
copia sin mutacion. Integration: archivo UTF8/BOM real, ausencia, corrupcion,
error I/O, limites, aislamiento de ambientes y bloqueo transaccional.
E2E: Configuracion Electron lee evidencia real de archivo sintetico, la oculta
en PREPROD y vuelve a mostrarla en QA; error seguro no impide usar el shell.
No se fabrica una conexion de red exitosa.
