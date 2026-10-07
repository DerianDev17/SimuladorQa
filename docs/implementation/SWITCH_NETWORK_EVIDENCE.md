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
| SmartVista escucha en 16100 y tiene un socket con el equipo de cajeros | netstat LISTEN y ESTABLISHED, PID 80131 | Estado de esa captura; no es health check de esta PC |
| Cajeros inician el enlace ATM | PID: puerto local 16100, remoto ANY, iniciador REMOTE; roles confirmados por usuario | Acceso del simulador desde otra PC por validar |
| SmartVista/Mediator tienen socket por 49212 en ambos extremos | netstat ESTABLISHED | No prueba que el simulador deba abrir ese enlace ni quien lo inicio |
| PID 80131, instituto 8013 EF ATMRTC, formateador 58, TCP01, VISA, indicador 28 Visa SMS network | pantalla de interfaz | Identificadores del servidor; no definen campos ISO, F22 o plantilla por entidad |
| Longitud de encabezado configurada 2 y keep alive 1 | pantalla de interfaz | No define byte order, VLI inclusivo/exclusivo, cabecera de negocio o intervalo |
| Remoto configurado: equipo de cajeros | pantalla de interfaz | No permite asumir que acepta la IP/VPN/NAT del simulador desde la PC |

La captura transaccional contiene operaciones y varios estados internos/history.
No se importa a los contadores de la app ni se deduce un mapeo universal entre
codigos internos SmartVista, response code ATM y aprobacion Core.

## Implementacion

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

- SWITCH-ATM-ACCESS: IP vista por SmartVista desde la PC/VPN/NAT, vinculacion
  a PID/configuracion autorizada, limites de conexiones y convivencia con cajeros.
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
