# Conexion visible al Switch en QA

## Continuidad despues de cada transaccion, 2026-10-19

La desconexion tras una consulta aprobada era local: Main llamaba
disconnect(TRANSACTION_STARTED) antes del transporte y nunca restauraba
la observacion. No era evidencia de rechazo del host ni un parametro de CMS.

QaSwitchConnection.withTransaction ahora espera el cierre del socket de
observacion, ejecuta una sola vez el transporte financiero y restaura una
sola conexion de observacion si el operador la tenia abierta para ese destino.
La restauracion respeta desconexion manual, cambio de ambiente y cierre de
app; tiene el plazo original y no inicia ciclos de reconexion. Su fallo no
reemplaza el resultado financiero. El indicador muestra Transaccion en curso
durante el uso financiero y TCP conectado solo tras conectar realmente.
No se reutiliza ni se reenvia una trama, ni se genera 0810 sin contrato.

Inspeccion de parametros SQL solicitada por el usuario: ATM20521/entidad 205,
moneda 840, configuraciones 1111/1111, TiempoNoTrans=0, ATMEnabled=true,
ATMForceChgKey=false, ATMNeedsUpdateConf=false, ATMIsWaitingComplete=false.
Lote abierto 31/2026-08-17, coincidente con el perfil local. ATMTCS corresponde
al canal del cajero fisico (TLSTCS03/6100); no se copia ese destino a la ruta
ISO del simulador. SysParametros/ATM devuelve CIERREAUTO=3, CORTEATM=0800 y
LIMITE_REVERSO=999; se registran literalmente, sin inferir su semantica ni
convertirlos en reglas de retiro. SysParametrosCMS no tiene filas para 205.
Mediator correlaciona 900113/301000 con jnlRetCode=0; 900112 figura con 8908,
sin asignarle significado o equivalencia F39 por suposicion.

Solo SELECT parametrizados/acotados, sin valores de PIN, llaves, tarjeta o
cuentas y sin cambios en SQL. La conexion estricta detecto el certificado
autofirmado conocido; se comprobo nuevamente su huella publica antes de la
excepcion TLS limitada a esta inspeccion del endpoint existente. No cambia
la confianza del equipo ni el TLS de la aplicacion. Evidencia sanitizada:
artifacts/atm-parameters-20261019.json y variantes -names/-values.

Pruebas: restauracion tras exito/error/timeout, cancelacion de restauracion,
destino distinto, concurrencia y socket ausente; integracion de dos saldos
y dos retiros consecutivos por contrato con PIN/AC nuevos y TCP local.

## Conexion de la app recuperada, 2026-10-15T21:06:39Z

El usuario confirma "conectado" tras recuperar la configuracion. Windows
verifica un socket Established del proceso Electron Main 58860:
10.10.10.21:59471 -> 10.60.0.11:16100, creado a las 21:05:51Z. Se conserva
abierto, sin controlar la interfaz ni enviar una nueva transaccion.

El texto exacto informado antes, "Revisa el destino y el plazo de conexion
en Configuracion", procedia de una validacion local anterior a abrir el
socket. No acreditaba ECONNREFUSED. El listener aportado por el usuario
mostraba 0.0.0.0:16100; una comprobacion pasiva con QaSwitchConnection a las
20:52:32Z conecto, recibio 0800/071 y permanecio estable diez segundos,
con cero bytes escritos por la aplicacion. Esa comprobacion se cerro
deliberadamente; no era la conexion de la ventana.

La causa local se comprobo dentro del Main de Electron: los archivos de
configuracion devolvian ENOENT, aunque las herramientas los veian en la
misma ruta logica de AppData. Windows redirigia los archivos del contexto
empaquetado de Codex a LocalCache/Roaming; la instancia Electron iniciada
fuera de ese paquete leia el AppData real. Ambos contextos informaban la
misma ruta logica, pero tenian contenidos distintos.

La recuperacion puntual se ejecuto desde Electron Main: se copiaron 16
archivos ausentes o identicos, se verifico SHA-256 de todos los destinos y
se conservaron los originales en migration-backup-31727264-eafc-41a5-a53a-9444587a8b16
dentro del directorio virtual de origen. Se verificaron tambien las copias
de respaldo y no quedaron copias virtuales activas de esos archivos.
Se preservaron historial, marcadores de ejecucion unica y credenciales
DPAPI sin descifrarlas; no se sobrescribieron catalogs.sqlite ni caches.
La migracion termino a las 21:04:09Z. Los hooks temporales de diagnostico
y migracion se retiraron; no hay migracion automatica en cada arranque.

La aplicacion ahora distingue configuracion ausente, destino documentado
ausente, destino diferente y plazo sin definir. Se conservan las mismas
validaciones de ambiente y destino. Typecheck, lint y formato de los dos
archivos Main revisados pasan; no se ejecutaron suites automatizadas.

El diario conserva cuatro entradas y ATM20521 conserva cero secuencias
reservadas. No se invoca executeBalance ni se solicita PIN. La conexion
resuelta no elimina QA-SEQUENCE-POOL ni el problema TLS separado de SQL.
QA-16100-REFUSED-20261015 deja de ser un bloqueo de conectividad actual;
el origen del rechazo TCP historico de las 20:11:26Z no esta determinado.

Evidencias privadas: artifacts/app-data-migration-20261015-result.json,
artifacts/app-data-migration-20261015.json,
artifacts/electron-connection-startup-20261015.json,
artifacts/diagnose-after-listen-20261015-result.json y
artifacts/app-live-connection-after-storage-repair-20261015.json.

## Observacion previa desde la app, 2026-10-15T20:49:56Z

El usuario responde a la solicitud de pulsar Conectar al Switch con
"Conexion rechazada". Se conserva como observacion del usuario, no como
captura directa del reason interno ni como una nueva traza TCP.
La configuracion local revision 2 sigue apuntando a QA 10.60.0.11:16100,
connectDeadlineMs=5000, y Windows no muestra sockets a ese puerto al
registrar la observacion a las 20:49:56Z.

Revision estatica: QaSwitchConnection traduce ECONNREFUSED a REFUSED;
ADMISSION_DENIED es un estado distinto, posterior a recibir un rechazo
de acceso del Switch. La respuesta abreviada del usuario no permite
atribuirle ninguno de esos motivos. El texto completo obtenido despues
identifica una validacion local; ver la recuperacion al inicio del documento.

Una consulta SSH de solo lectura al host del usuario no llega a ejecutar
ss: OpenSSH no tiene una huella ED25519 verificada y StrictHostKeyChecking
rechaza el acceso antes de autenticar. No se modifica known_hosts ni se
deshabilita esa verificacion. Se pide la salida de
`ss -ltnp 'sport = :16100'` desde la consola que el usuario ya utiliza.
En ese momento faltaba evidencia del listener; el usuario la aporta despues
y la conexion queda comprobada como se documenta arriba. No se controla la
interfaz ni se envia una transaccion.

Evidencia privada: artifacts/app-user-reported-refused-20261015.json.

## Certificado SQL identificado, 2026-10-15T20:33:18Z

El usuario solicita buscar el certificado en la base, revisar la conexion de
la app y enviar una nueva consulta. Se inspeccionan exclusivamente metadatos
del endpoint PREPROD autorizado, con Encrypt=true y la excepcion puntual de
ADR-006. La conexion estricta primero confirma CERTIFICATE_CHAIN_UNTRUSTED.
No se cambia la configuracion TLS de la app ni se extiende la excepcion a
registros de negocio, calendarios, reservas o transacciones.

Las 15 bases accesibles no muestran los certificados aportados en
sys.certificates. Solo master devuelve siete certificados internos de firma
de SQL Server. La busqueda de nombres de columnas relacionados con certificados
no devuelve coincidencias; no descarta almacenamiento en campos genericos.
La consulta filtrada de sys.dm_server_registry no devuelve un binding visible.
Estos catalogos no acreditan por si solos que el servidor carezca de certificado.

Una negociacion PRELOGIN/TLS acotada, sin LOGIN7 ni credenciales, identifica
el certificado publico que presenta 172.60.60.172:55893:

- Sujeto/emisor: CN=SSL_Self_Signed_Fallback.
- Huella SHA-1: BEF8E272C0E0F9A793C2897142988BBAA7BCDC0B.
- Vigencia observada: 2026-08-16T15:09:02Z a 2056-08-16T15:09:02Z.
- Validacion: RemoteCertificateNameMismatch y RemoteCertificateChainErrors;
  cadena UntrustedRoot.
- La cadena observada contiene solo ese certificado. Ninguno de los dos CER
  aportados coincide con el certificado ni aparece en esa cadena.

El callback rechaza siempre el certificado para terminar antes de autenticar.
No se exporta material privado ni se instala confianza. El nombre coincide
con el certificado autogenerado de respaldo descrito por Microsoft:
https://learn.microsoft.com/es-es/troubleshoot/sql/database-engine/connect/certificate-validation-failure
La correccion permanente requiere configurar un certificado de servidor
con nombre y cadena validos para el endpoint de SQL. Instalar los CER
aportados no establece confianza en este certificado autofirmado distinto.
Esto no explica el rechazo TCP de la ruta ISO sin TLS en 16100.

Inspeccion Windows de 2026-10-15T20:34:59Z: la instancia Electron Main 50328
esta abierta y no hay sockets al puerto remoto 16100. No se pulsa ningun
control ni se simula un estado de la ventana. Se solicita al usuario pulsar
Conectar al Switch para comprobar esa instancia respetando su restriccion
previa de no controlar la interfaz; el resultado posterior esta al inicio
de este documento.

ATM20521 conserva cero secuencias reservadas. No se invoca executeBalance
ni se pide PIN al conocer ese bloqueo previo; no se crea una nueva trama.
El diario financiero conserva cuatro registros, ultima modificacion
2026-10-15T18:52:05.8214071Z. No se comunica un intento previo BLOCKED ni
la respuesta anterior 0210/19 como una nueva transaccion.

Evidencias privadas: artifacts/certificate-metadata-20261015.json,
artifacts/sql-presented-certificate-20261015.json y
artifacts/app-connection-and-trx-readiness-20261015.json.
TODO-DATA SQL-TLS-SERVER-CERTIFICATE: certificado/CA y nombre del servidor
SQL aprobados que sustituyan el fallback observado. QA-SEQUENCE-POOL sigue
pendiente; el resultado informado posteriormente desde la ventana aparece
al inicio de este documento.

## Diagnostico historico del 2026-10-15T20:11:26Z

La nueva captura del usuario muestra PID 80131 habilitado, remoto
10.10.10.21:ANY, listener local 16100 e iniciador REMOTE. La captura de
netstat muestra LISTEN en 0.0.0.0:16100 y conexiones de 172.60.60.171 en
TIME_WAIT/FIN_WAIT1. Esas filas corresponden a cierres, no acreditan una
sesion ESTABLISHED de la PC. La diferencia de IP puede corresponder a otro
cliente o traduccion de red; no se atribuye a NAT sin correlacion adicional.

Comprobacion real 2026-10-15T20:11:23Z a 20:11:26Z mediante
QaSwitchConnection, usando el destino guardado QA 10.60.0.11:16100:
CONNECTING -> DISCONNECTED/REFUSED, sin llegar a CONNECTED, cero bytes
recibidos y cero writes de aplicacion. La PC conserva IP 10.10.10.21 por
Wi-Fi, ruta via 10.10.10.1. Se observan sesiones SSH Established al mismo
host en 22; ninguna sesion 16100 de la app durante la inspeccion.

El fallo de ese intento es rechazo al establecimiento TCP (ECONNREFUSED), anterior
al parsing VISA, PIN, EMV o una respuesta financiera. La captura de LISTEN
no demuestra el estado del listener durante este intento. Falta correlacion
en el servidor/intermediarios para distinguir listener ausente/reiniciando
de un rechazo activo de red. No se cambia el PID ni una IP del servidor.

ATMPublicKeyProd.cer aportado por el usuario es publico, autofirmado, con
sujeto U1APADQ01.coonectafront.int y vigencia 2024-07-18 a 2027-07-18.
La validacion local encuentra UntrustedRoot, sin error de vigencia. No se
instala en el almacen de confianza ni se cambia de ambiente por su nombre.
El adaptador 16100 usa node:net/TCP sin TLS, por lo que este certificado
no interviene en el rechazo observado. SQL CMS/Mediator en 55893 es otra
conexion y mantiene pendiente una cadena de confianza validada para su host;
no se demuestra que este certificado corresponda a SQL.

Evidencia: artifacts/diagnose-16100-20261015-result.json.
La causa historica de QA-16100-REFUSED-20261015 requeriria correlacionar el
listener y los rechazos del servidor/red con la hora de ese intento. La
conexion posterior comprobada al inicio resuelve el bloqueo actual. No hubo
transaccion financiera ni control de interfaz. Los resultados del 14 de
octubre siguientes tambien son historicos.

## Causa comprobada, 2026-10-14

El endpoint guardado permanece 10.60.0.11:16100. La PC usa origen 10.10.10.21.
La app devolvia connection=NOT_CONFIGURED y mostraba textos fijos de enlace
sin comprobar. No existia un controlador de conexion persistente en Main.
QaNetworkProbe, utilizado desde CLI, destruye deliberadamente el socket al
recibir el primer frame. Sus resultados anteriores acreditaban acceso en ese
instante, pero no dejaban la app conectada ni actualizaban su indicador.
El ultimo reinicio tampoco restauraba una sesion de observacion.

## Correccion

- Inicio permite Conectar al Switch y Desconectar. Cabecera, lateral y tarjeta
  de conexion muestran DISCONNECTED/CONNECTING/CONNECTED a partir de Main.
- Main deriva el endpoint/plazo de la configuracion QA guardada y valida que
  siga coincidiendo con la evidencia. IPC acepta solo environment=QA. No recibe
  IP, puerto, tramas, llaves o tarjeta desde Renderer.
- El socket permanece abierto tras recibir 0800/071 o 0800/072. El deadline de
  conexion se cancela al conectar; no se usa como plazo de vida de la sesion.
- Se muestran origen TCP, gestion y hora recibidas, y motivo de desconexion.
  Un error del servicio invalida el estado visible anterior. No se informa
  conectado despues de cierre, rechazo de acceso o timeout.
- Conexion independiente del lector, PIN y perfil financiero. Una conexion
  TCP abierta no declara autorizacion financiera ni habilita Enviar.
- Sin reconexion automatica. Al salir, cambiar ambiente o iniciar el transporte
  financiero se cierra la observacion. El emisor financiero conserva su propia
  sesion; se evita mantener dos sockets de la app compitiendo por el mismo PID.
- Observacion pasiva: cero writes de aplicacion. Se mantiene pendiente la
  politica de respuesta 0810 recibida parcialmente; no se inventa F39.
- Recepcion acotada a 1 MiB por sesion; mensajes desconocidos cierran con motivo
  explicito. Solo se publica metadata; buffers recibidos se limpian.

No cambia el protocolo ni la direccion del cajero configurado en CMS. La prueba
puntual original del CLI conserva su comportamiento, para usos de diagnostico
que requieren terminar tras observar un frame.

## Verificacion

Prueba de red real 2026-10-14T18:06:01Z: conexion desde 10.10.10.21:55249 a
10.60.0.11:16100. Llega 0800/071 y luego 0800/072 unos 30 segundos despues.
A los 45 segundos TCP sigue conectado; el diagnostico cierra explicitamente
al terminar. connectionId 0763e832-0da0-4bbe-a4fc-f3bba583db5c. Cero writes
de aplicacion y cero operaciones financieras. Evidencia privada:
`artifacts/qa-switch-session-20261014.json`.

Pruebas unitarias: entradas invalidas/PROD, deadline, eventos tardios y errores
sanitizados. Integracion: TCP fragmentado, persistencia despues del primer
0800, connect idempotente, reconexion manual, cierre remoto, rechazo de acceso,
mensajes no soportados, aislamiento de ambiente/destino y servicio no disponible.
E2E Electron con servidor local sintetico comprueba los botones, IPC real,
indicadores, gestion recibida, cierre remoto y cierre al cambiar ambiente.
Las pruebas no envian mensajes financieros ni registran contenido privado.

Validaciones completadas: 44 pruebas unitarias/integracion en ocho archivos,
una prueba E2E Electron, lint, typecheck, build, formato de archivos afectados
y check:security. Se reinicia la app real y se pulsa Conectar al Switch.
Windows confirma ESTABLISHED del proceso Electron 61932:
10.10.10.21:59338 -> 10.60.0.11:16100, creada 2026-10-14T18:10:44Z.
La pantalla muestra TCP conectado y 0800/072 a las 13:11:14 de Ecuador.
Se deja esa sesion abierta; no se ejecuta una consulta de saldo.
Evidencia: `artifacts/qa-app-connection-live-20261014.json`.
