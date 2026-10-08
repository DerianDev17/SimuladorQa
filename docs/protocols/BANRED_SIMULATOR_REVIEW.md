# Revision del proyecto Simulador Banred

## Fuente y metodo

El usuario aporta la carpeta privada Tramas transacciones/Simulador Banred para
evaluar su utilidad en la simulacion cajero -> SmartVista -> Mediator -> Core
de CB Cooperativa 205. Se revisa el 2026-10-08, sin ejecutar el programa,
abrir listeners, conectar al Switch ni modificar configuracion del servidor.

Contiene 19 archivos: ejecutable .NET, PDB, configuracion de runtime,
ContextoISO.xml y 15 logs de marzo a mayo de 2026. No contiene archivos .cs,
.csproj o .sln. Se inspeccionan metadatos y cuerpos IL mediante PEReader; no se
carga ni invoca el ensamblado aportado. El runtime declarado es .NET Framework
4.7.2; el ensamblado se llama SimuladorISO_2022, version 1.0.0.0.

| Fuente | Bytes | SHA-256 |
| --- | --- | --- |
| ContextoISO.xml | 9284 | fe95ad27fe5a78ba6f12178a9efdea933ce50f57adbcec569b6c1d7fdd8bfd1b |
| SimuladorISO_2022.exe | 44032 | bb2f5184229b1437718e7b61a41d4fd7ec55b3ac00771700cf0b3c3e90b2a515 |
| SimuladorISO_2022.pdb | 65024 | 171f12230fdeddd97eec1a979c2d7f3097ab51b14e2411e4d2fd63f8f7077dc6 |
| SimuladorISO_2022.exe.config | 186 | 7921098e47e894412fdfd0cafe0f88cc68497740998eac17c68c00129069d803 |

Los originales quedan en la carpeta ignorada. Los reportes de metadatos e IL
protegido quedan bajo artifacts; no se versionan tramas ni valores de tarjeta.

## Rol de red comprobado

El nombre del proyecto no determina su papel en el recorrido. Program.Main
llama InicializarContextoISO. Esta lee el XML y llama TcpServer.Iniciar;
Iniciar ejecuta TcpListener.Create y Start, y SocketInit acepta clientes con
AcceptTcpClient. Este flujo espera conexiones y responde solicitudes entrantes.

El XML configura puerto 4946, TipoVLI=1 y LongitudCabecera=12. Los logs registran
Socket de servidor ha iniciado: [::]:4946. Los logs con sufijo de peer muestran
conexiones aceptadas desde 10.50.0.7 y, en abril/mayo, 10.60.0.11. Un arranque
anterior de marzo usa 1800; no se adopta como endpoint vigente.

Por tanto, esta entrega sirve como mock del extremo BANRED al que se conecta
el Switch. No contiene en su ruta activa un cliente que inicie la transaccion
ATM hacia 16100. No se cambia a ese rol solo editando el puerto del XML.

| Aspecto | Entrega BANRED | Prueba ATM CB solicitada |
| --- | --- | --- |
| Inicio TCP | El mock escucha; el Switch conecta al mock | El simulador inicia conexion a la entrada ATM del Switch |
| Puerto de la evidencia | 4946 local del mock | 16100 entrada SmartVista; sujeto a admision de la PC |
| Envolvente | Dos bytes VLI y cabecera ISO de 12 caracteres | Cuatro bytes observados en VCP Lite, cuerpo opaco VISA |
| Respuesta | Construida por el mock segun XML | Debe observarse en SmartVista / Mediator / Core CB |
| Perfil recibido | Diccionario del contexto BANRED | Correspondencia con perfil ATM del proveedor pendiente |

La respuesta NO AUTHORIZATION de nuestra PC tiene causa documentada en
tcpcomms01: direccion entrante invalida tras find_device_using_address. La
entrega BANRED no modifica esa tabla de dispositivos ni el destino CB confirmado
82052 / 49212. Ver [admision QA](QA_SWITCH_ADMISSION_REVIEW.md).

## Aporte concreto del diccionario

ContextoISO.xml tiene 58 definiciones en MensajeTransaccional y seis en
MensajeECHOTEXT, incluyendo posiciones de bitmap 0/1. Declara nombre, posicion,
tipo y longitud Fixed, LLVar o LLLVar, y reglas opcionales de respuesta.
Es una fuente recibida util para un perfil BANRED separado; no se interpreta
como especificacion ATM universal ni como certificacion del proveedor.

Ejemplos documentados: F3 fixed 6, F4 fixed 12, F11 fixed 6, F37 fixed 12,
F39 fixed 2, F41 fixed 16, F49 fixed 3 y F102 LLVar hasta 99.
El codigo procesa MTI y bitmaps como texto ASCII/hex; el nombre Binario del
bitmap en XML no significa por si solo bitmap de ocho bytes binarios.

Las reglas transaccionales configuradas copian F2 del requerimiento si esta
presente, generan F17 con fecha local MMdd y fijan F39=00. Las de echo generan
F7 local MMddHHmmss, copian F11/F70 y fijan F39=00. El programa observa el MTI
entrante y tiene ramas para responder 0200 -> 0210, 0420 -> 0430 y 0800 -> 0810,
entre otras. Las fechas se toman de DateTime.Now del equipo del mock.

El 00 de estas respuestas se produce por configuracion del mock; no acredita
autorizacion real del Core, vinculacion de tarjeta/cuenta ni un retiro CB.
El mock no aporta un generador nuevo de requerimientos ATM ni reglas de PIN/HSM.

## Verificacion de los logs

Los archivos usan separadores CR y contienen relleno NUL y cuerpos registrados
con distinta presencia de cabecera. Se separan eventos por marcador de hora y
etiqueta. Se retira solo cabecera ISO reconocida y relleno terminal del registro;
este procedimiento analiza texto del log, no reconstruye paquetes TCP.

Se localizan 28 eventos de entrada/salida. El diccionario permite consumir sin
residuo 26 cuerpos: doce pares 0800/0810 y un par 0200/0210. Los otros dos
eventos de marzo no tienen MTI reconocido en esta proyeccion y se conservan como
UNRECOGNIZED_MTI, sin atribuirles una operacion o repararlos silenciosamente.

El par financiero del 5 de marzo a las 17:19:58 tiene cuerpo de 600 caracteres
en 0200 y 602 en 0210, que incluye F39. Se preservan solo posiciones y longitudes
en el reporte; los campos sensibles permanecen en memoria. Los pares echo del
peer SmartVista tienen cuerpos 55/57 y corresponden a marzo-mayo, no a nuestra
prueba de octubre. No prueban que la PC actual este admitida como cajero.

## Problemas que no se deben trasladar al simulador

- En MoveNext del manejador TCP, offsets IL 385-475, cada byte del VLI se
  convierte a hexadecimal sin ancho fijo y se concatenan los textos. Ejemplo
  sintetico: bytes 01 04 producen texto 14, decimal 20, en vez de BE16 260;
  bytes 02 0A producen 42 en vez de 522. Con 00 45 el error queda oculto.
- El mismo manejador comprueba ISO usando como indice el valor numerico VLI
  (offsets 513-565), no la cantidad de bytes del prefijo. Son conceptos distintos.
- Usa un ReadAsync sobre buffer de 4096 y procesa esa lectura como mensaje.
  La ruta inspeccionada no mantiene un reensamblado incremental que consuma
  todos los frames completos y conserve el resto. La fragmentacion o varias
  tramas por lectura requieren el framing que ya implementa la app.
- Console.WriteLine y los registros de entrada/salida muestran cuerpo y campos
  sin proyeccion protegida. No se adopta ese logging en el proyecto actual.

Son hallazgos de lectura estatica y reproduccion matematica del VLI; no se
ejecuta el EXE contra una dependencia real para verificarlos. La envolvente
InclusiveBe16Framing existente usa lectura BE16 directa y fragmentacion; no
necesita copiar la implementacion legacy defectuosa.

## Uso propuesto y TODO-DATA

Reutilizar las definiciones y muestras para un perfil BANRED con parser/packer
separado del transporte y del dominio. Las reglas de respuesta pueden servir
para pruebas locales etiquetadas como mock. Mantener datos de entrada privados
y metadatos protegidos. Esta revision no instala un servicio ni habilita envio.

- ISO-SPEC-ATM: recibido ContextoISO.xml de BANRED; validar el diccionario y
  encoding del perfil ATM 16100 antes de usar estas definiciones en un cliente
  cajero o alterar PAN/cuenta/monto de una captura VISA.
- CB-ATM-GOLDEN-SAMPLE: el par financiero del mock no identifica entidad 205
  ni PID CB 82052. Obtener muestra ATM propia de CB para el retiro solicitado.
- SWITCH-ATM-ACCESS: definir dispositivo/interfaz de prueba que admita el origen
  de la PC. El rechazo por direccion ya esta confirmado; no se vuelve a pedir
  evidencia de ruta/IP para explicar ese intento.

Reportes privados: banred-context-review.json, banred-il-review.json y
banred-project-review.json bajo artifacts. Se usan para trazabilidad, sin RAW.
