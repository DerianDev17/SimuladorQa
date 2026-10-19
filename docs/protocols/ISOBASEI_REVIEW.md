# Definicion ATM Coonecta ISOBASEI

## Fuente recibida y alcance

El usuario aporta ISOBASEI.bin el 2026-10-08 desde
Y:/ExtremePCI/ConfigFiles/ISOBASEI.bin. La configuracion aportada de SWATM01
referencia este nombre mediante ISO8583MsgFormat / PKT_VISA; el archivo se
inspecciona en lectura, sin modificar el servidor, cargar DLL ni enviar tramas.
No se ejecutan instrucciones contenidas en archivos aportados.

La fuente tiene 23030 bytes y SHA-256
c9e90739f0e14109869304e469d4bab43eec4cbdf97c76320022097cf0a05d39.
Su firma es EXTISO y la descripcion AlexSoft VISA BASE I Ver 3.0.0. Dos textos
de fecha locales son 2023/04/25 08:27:02 y 2023/11/14 16:19:33; no se les
asigna zona horaria ni se convierten a timestamps UTC. La auditoria de la
inspeccion registra UUID y fecha UTC por separado.

Tambien se inspeccionan estaticamente los metadatos/IL de
Y:/ExtremePCI/DotNet/ISO8583MsgFormat.dll, SHA-256
c5e328c18061f1b94cd14c3ea475bfeadda0f5c5ef224edf05be5d75268ac673.
El modulo declara _ISOFIELD size=120, _ISODEFFILEHEADER size=262 y los
contenedores _ISOHEADERFIELDS, _ISOFIELDS, _ISOTRANNAMES, _ISOTRANDEFS y
_ISOTRANWAITS. Sus tipos nativos no exponen offsets de miembros; el layout
se contrasta con conteos repetidos, nombres/identificadores y consumo exacto
del archivo. Iso8583.GetStrType contiene un switch que permite verificar las
etiquetas de encoding: 1 ASCII, 2 EBCDIC, 3 BINARY, 4 BCD, 5 BINBITMAP,
6 VLENISO y 7 VLENHEAD, entre otras. No se llama a la DLL ni a sus servicios.

## Estructura comprobada

Numeros de estructura en little endian; esta propiedad corresponde al archivo
de definicion, no define byte order de VLI o prefijos del enlace TCP.

| Seccion | Offset inicial | Cantidad | Ancho de registro |
| --- | --- | --- | --- |
| Header del archivo, incluye definicion MTI | 0 | 1 | 262 |
| Campos de cabecera, precedidos por count u16 | 262 | 12 | 120 |
| Posiciones ISO, precedidas por count u16 | 1704 | 128 | 120 |
| Nombres MTI, precedidos por count u16 | 17066 | 27 | 82 |
| Pares de definicion MTI/campo, precedidos por count u16 | 19282 | 863 | 4 |
| Pares de espera MTI/campo, precedidos por count u16 | 22736 | 73 | 4 |

Los cinco conteos coinciden con los del header en offsets 128-136. Las secciones
terminan exactamente en 23030. Los registros de campo contienen identificador,
codigo de encoding, parametro de longitud, codigo de atributo, byte de padding
y nombre. Defaults y bytes adicionales del registro se excluyen de los reportes.
Dos palabras del header en offsets 138/140 se conservan como no interpretadas;
no se afirma que se haya validado un checksum del proveedor.

La posicion 0 describe BITMAP y la 1 esta vacia. Las posiciones 2-127 tienen
identificador y nombre concordantes. Los MTI se almacenan como enteros; por
ejemplo 200 se proyecta como 0200. Todos los pares referencian MTI presentes y
campos 2-127, sin duplicados. No se interpreta que cada par sea un campo
obligatorio ni que los pares de espera definan el timeout o una regla de eco.

## Campos utiles para el cliente ATM

| Elemento | Encoding verificado | Parametro de longitud | Codigo de atributo |
| --- | --- | --- | --- |
| MTI | BCD | 4 | 0 |
| F2 PAN | BCD | 19 | 1 |
| F3 procesamiento | BCD | 6 | 0 |
| F4 monto | BCD | 12 | 0 |
| F7 fecha/hora | BCD | 10 | 0 |
| F11 STAN | BCD | 6 | 0 |
| F35 Track 2 | BCD | 37 | 1 |
| F37 referencia | EBCDIC | 12 | 0 |
| F39 respuesta | EBCDIC | 2 | 0 |
| F41 terminal | EBCDIC | 8 | 0 |
| F44 datos adicionales de respuesta | EBCDIC | 25 | 1 |
| F49 moneda | BCD | 3 | 0 |
| F52 PIN | BINARY | 8 | 0 |
| F55 | BINARY | 255 | 1 |
| F70 gestion de red | BCD | 3 | 0 |
| F102 cuenta | EBCDIC | 28 | 1 |

Estas son propiedades del archivo; no se convierten parametros a bytes del
wire ni atributo 1 a LLVar/LLLVar sin validar el contrato del formatter.
La tabla no autoriza crear PIN Block, escoger cuenta, actualizar EMV o inferir
que cambiar un BIN dirigira la operacion a CB 205. Los defaults no se publican.

Actualizacion 2026-10-16: NWINT confirma para F44 en 0210 un prefijo binario
de un byte y cinco bytes EBCDIC. Se habilita su lectura opcional y acotada en
la respuesta de saldo, sin interpretar su contenido como resultado financiero.
Ver [evidencia de STAN 900107](QA_SWITCH_LOGS_20261016.md).

La cabecera incluye VHLEN (VLENHEAD), VHFORMAT, VHTEXTFORMAT, VHTOTLEN
(VLENISO), VHDESID, VHSRCID, VHROUNDTRIP, VHBASEIFLAGS, VHMSGSTSFLAGS,
VHBATCHNUMBER, VHRESERVED y VHUSERINFO. BITMAP declara BINBITMAP con parametro
24; esto no implica que todos los mensajes del wire tengan bitmap de 24 bytes.

## Diferencias con BANRED y validacion pendiente

ContextoISO.xml de BANRED tiene MTI/bitmap textual y F41 de longitud 16;
ISOBASEI declara BCD/BINBITMAP y F41 EBCDIC de parametro 8. Ademas F52 declara
16 en el XML y 8/BINARY en ISOBASEI, y F102 tiene limites 99 y 28 respectivamente.
Las representaciones y perfiles se mantienen separados. No se corrige uno
copiando reglas del otro ni se mezcla el mock servidor 4946 con PKT_VISA/16100.

Actualizacion 2026-10-08: la nueva captura CB aporta consulta y retiro con
request/response tanto en 16100 como en 49212. Cabecera, bitmap primario,
prefijos y longitudes se verificaron para la consulta. CapturedVisaBalance
reconstruye el request y proyecta solo metadatos seguros. La prueba desde PC
obtuvo 0210/F39 91 y llegada confirmada por el usuario hasta Mediator.
Ver [alcance exacto y error del procesador](CB_205_BALANCE_SAMPLE.md).

TODO-DATA acotados:

- ISOBASEI-WIRE: confirmar unidades, padding de nibbles, prefijos de campos
  variables, tabla EBCDIC y cabecera/bitmap mediante formatter o capturas
  pareadas. Ya se recibio y leyo el diccionario binario; no se pide de nuevo.
- CB-DYNAMIC-REQUEST: muestra CB 205 / PID 82052 recibida; faltan reglas
  dinamicas para crear un request nuevo. La muestra USD 20 de PID 82032 sigue
  fuera del alcance CB. No se trasladan defaults de una muestra a otra entidad.
- SWITCH-ATM-ACCESS: rechazo historico de 10.10.10.21 confirmado; el 2026-10-08
  la PC ya recibe 0800 / codigo 071 y los logs confirman PID 80131 autorizado.
  Consulta desde PC comprobada hasta Mediator; falta coexistencia con el
  balanceador en sesiones prolongadas. Ver `VISA_NETWORK_MANAGEMENT.md` para el
  layout acotado observado y la politica de respuesta pendiente.

## Implementacion y verificacion

ExtisoDefinitionInspector es un inspector puro fuera del Renderer. Comprueba
firma/version recibida, limites, conteos, identidades, referencias y ausencia
de bytes residuales. Devuelve solo nombres/parametros y pares, sin defaults,
mensajes transaccionales, socket o generacion ISO. Los errores son codigos
estables que no incluyen contenido de la fuente.

Herramienta offline:

```powershell
node tooling/inspect-extiso.mjs source.bin artifacts/isobasei-definition-review.json
```

La herramienta lee de forma acotada, no sobrescribe la fuente, restringe reportes
a artifacts y limpia el buffer al finalizar. Produce UUID, UTC y SHA-256.
La ejecucion sobre el archivo recibido consume sus 23030 bytes y registra
12/128/27/863/73 elementos. Originales y reportes quedan privados/ignorados;
no se commitea el BIN, la DLL o un volcado de sus defaults.

Pruebas con fuente sintetica: lectura valida, privacidad de defaults,
truncamiento, exceso/residuo, version no soportada, conteos inconsistentes,
encoding/identidad/referencias invalidas y nombres no permitidos. Integracion
del CLI con archivo local, dependencia no disponible y destino fuera de
artifacts. Esto verifica inspeccion; no demuestra comunicacion o aprobacion.

## Imagen NCR y modulos del host recibidos el 2026-10-12

La carpeta privada `Docs tecnicos/imagen cajero` aporta siete fuentes: guion
NCR/NDC+, BAT de compilacion y cinco RAR. Se inspeccionan archivos, XML,
metadatos PE e IL como datos, sin cargar las DLL del proveedor, ejecutar BAT/EXE,
importar certificados o abrir conexiones. Originales y extracciones quedan
excluidos de Git; los reportes privados estan en `artifacts/atm-image-review`.

### Inventario y utilidad

| Fuente | Contenido comprobado | Utilidad para el simulador |
| --- | --- | --- |
| 205_NCR6848_Multi_Dip.txt | 6291 lineas; 407 declaraciones SCR, 306 STATE, 106 TRAN y tablas FIT/EMV | Flujo NCR, pantallas/estados, consultas local/Coonecta/externa y enlace con el procesador ATM; los conteos incluyen variantes y duplicados |
| 205_NCR6848_Multi_Dip.bat | Invoca ndccomp sobre el TXT, argumento 2051 y salidaNDC_2051.txt | Explica el paso de compilacion; no es un emisor ISO ni identifica por si solo el terminal ATM20521 |
| ConfigFiles.rar | 81 archivos y un directorio; EXTBASE, NdcConfig, COONECTA_ATM y varios diccionarios/versiones | Rutas, componentes y parametros del host; distinguir configuracion presente de configuracion activa |
| Dotnet.rar | 274 archivos y tres directorios; se inspeccionan 13 DLL seleccionadas | ATMIso8583 implementa builder, lectura de F54 y reversos; SetInitialTransactionCoonecta inicializa parametros; contiene respaldos de versiones distintas |
| DotNet32.rar | 33 archivos y un directorio; seis DLL seleccionadas | Variantes de 32 bits y formatos NDC/TCS; no son intercambiables automaticamente con Dotnet/Bin |
| Bin.rar | 108 archivos y siete directorios; cinco DLL seleccionadas | PKT_VISA y formatter; programas de transporte/servicios del proveedor; dos ZIP internos contienen solo tres ejecutables de Crypto |
| Certificados.rar | 15 archivos y un directorio; tres CER publicos inspeccionados | Referencia de CA/cliente/servidor; tambien contiene PFX/PVK y herramientas, sin extraccion ni uso de claves privadas |

El TXT referencia al menos 255 nombres de PNG/GIF/BMP bajo BCOO20200625;
esas imagenes no estan en los archivos entregados. Tampoco aparece ndccomp
en el inventario, incluidos los ZIP internos. Sirve para reconstruir el flujo
documental, no para reproducir toda la apariencia o compilar la imagen recibida.
El encabezado indica version inicial 2020 y una modificacion 20240528;
nombre/fecha de copia no prueban que sea la imagen activa de QA.

### Coincidencias de fuente

ISOBASEI.bin tiene los mismos 23030 bytes y SHA-256
`c9e90739f0e14109869304e469d4bab43eec4cbdf97c76320022097cf0a05d39`
que la fuente ya inspeccionada. El inspector existente vuelve a validar
12 campos de cabecera, 128 posiciones, 27 MTI, 863 pares y 73 pares de espera.
Dotnet y Bin contienen el mismo ISO8583MsgFormat.dll, hash
`c5e328c18061f1b94cd14c3ea475bfeadda0f5c5ef224edf05be5d75268ac673`.
Extreme.Switch2013PCI.dll tambien coincide con la fuente anterior, hash
`2baf38d1f0a3dd2e61f857d9525f14fa741e6237af44bb0e5f65117c730fda96`.
Confirma continuidad del diccionario/formatter; no aporta una politica nueva
de F70 071/072 o F39 para 0810.

### Mapeo de consultas del guion NCR

El propio TXT declara en linea 4805 que las definiciones TRAN van a la base
de datos y no forman parte de la imagen. Las consultas siguientes llaman
`ATMIso8583.IBanco.procesaTransaccion` en `GRP:SRVATM`, sin dispensar efectivo:

| Linea inicial | Variante | Transaction Code | Account From | Account To |
| --- | --- | --- | --- | --- |
| 4901 | Ahorro local, TRAN-005 | 30 | 10 | 00 |
| 4940 | Corriente local, TRAN-005 | 30 | 20 | 00 |
| 5398 | Corriente red Coonecta, TRAN-021 | 30 | 20 | 00 |
| 5437 | Ahorro red Coonecta, TRAN-022 | 30 | 10 | 00 |
| 5476 | Ahorro red externa, TRAN-023 | 30 | 10 | 00 |
| 5515 | Corriente red externa, TRAN-024 | 30 | 20 | 00 |

Los Operation Key Buffer son selectores NDC, no codigos ISO. Las letras de
cuenta explicadas en comentarios 4815/4816 no se corresponden literalmente
con todos los buffers y Account From de las tablas. Conservar la contradiccion
y validar el mapeo activo; no deducir cuenta usando solo esa leyenda.
El tipo LOCAL de esta fuente no se equipara automaticamente al Scenario LOCAL
del dominio actual.

### Reglas visibles en ATMIso8583

La DLL principal tiene SHA-256
`9be87f1afcd400c6985a5d7389cd2b19227ba7a8b5d39656838fa4571eae1808`,
assembly ATMIso8583 version 2017.0.0.1. Esa version no ordena cronologicamente
sus respaldos. Se inspeccionan `ArmaMsgIso8583`, `GenerarTransaccion`,
`GetSaldos`, `GetSecuenciaExtreme` y ambos metodos de reverso, entre otros.

En `CNegocio.ArmaMsgIso8583`, offsets IL de esa DLL:

- 1509-1601: una rama concatena TranType de dos digitos, AccountFrom de dos
  digitos y 00 para F3. Es compatible con 30/10 -> 301000 y 30/20 -> 302000.
  Tiene otras ramas; no extenderla a todas las operaciones.
- 1610-1635: F7 usa fechaTrasmision con MMddHHmmss.
- 1641-1678: F11 usa secuencialNet, convertido y rellenado a seis caracteres.
- 1684-1712: F12 usa los primeros seis caracteres de Param.Hora.
- 1718-1746: F13 usa DateTime.Now con MMdd.
- 1752-1797: F15 usa Param.FechaContable con MMdd.
- 2224-2358: F37 concatena ultimo digito de anio, dia del anio de tres
  posiciones y secuencialNet rellenado a ocho posiciones.

La formula de F37 coincide con la referencia ATM de la consulta historica
STAN 007923; no demuestra el origen de F37 del tramo Mediator ni politica
de duplicados. `CDataBase.GetSecuenciaExtreme` llama `sp_DebGetNextSeq` y
guarda el resultado en secuencialNet; tambien hay una seleccion por tarjeta
en GetSecuenciaXTipoTarjeta. No se ejecuta ese procedimiento ni se asume
que un contador local sin contrato sea equivalente. Quedan pendientes
asignacion/unicidad/reinicio de STAN y zona/reloj de fechas para el cliente nuevo.

El modulo usa datos de tarjeta/Track y llamadas criptograficas de cambio de
zona/formato, ademas de contexto XML y BD. Estas dependencias explican por que
la lectura de identidad del chip no sustituye una transaccion financiera.
No se copian claves, parametros PIN o datos privados al simulador.

### Lectura de saldo contrastada con el PCAP CB

ArmaMsgIso8583 pasa la respuesta F54 a GetSaldos en IL 10603-10636. GetSaldos
recorre bloques de 20 caracteres: tipo de saldo en posiciones 2-3, moneda en
4-6, signo en 7 e importe de doce digitos en 8-19, con indices desde cero.
El importe se divide entre 100; C se trata como positivo y la otra rama como
negativo. Distingue tipos 01, 02 y 91 en argumentos dblSaldo01, dblSaldo02 y
dbcreditLimite. No convertir la rama residual en aceptacion de cualquier signo.

Se vuelve a leer offline el frame 224 de PruebaSimulador.pcap, con hash
aprobado de fuente y payload contrastado contra el reporte anterior. F54
tiene 40 bytes EBCDIC: dos registros de 20, cuenta 10, tipos 02/01, moneda
840 y signo C. No se publican importes ni otros campos privados.
Esto aporta un layout y escala respaldados por codigo y muestra real, no
por un estandar generico. La asignacion formal de 01/02 a total/disponible,
variantes, repetidos, ausencia, moneda y errores sigue en
BALANCE-RESPONSE-CONTRACT hasta validacion de perfil.

### Configuracion del host y diferencias por validar

EXTBASE.config contiene SWATM01 CALL a SmartVista 16100, con PKT_VISA,
ISO8583MsgFormat e ISOBASEI; coincide con el recorrido documentado. Tambien
configura entrada NCR en 7100 y subsistemas ATM/seguridad/otros enlaces.
NdcConfig.XML dirige sus definiciones a COONECTA_ATM.XML y a
SetInitialTransactionCoonecta.Inicializa.Moneda. La interpretacion y destino
usan contexto/BD, incluida la referencia sp_AtmGetDestino; no es un perfil
ATM/tarjeta autocontenido para el Renderer.

EXTBASEATM.config muestra otros endpoints, pais 240 y Extreme_ATMS_2012.dll;
EXTBASE.config muestra pais 218 y Extreme_ATMS_2017.dll. Hay backups con
otros hashes y variantes DotNet32. No escoger una version por el nombre
de archivo ni heredar sus endpoints a QA/PREPROD. COONECTA_ATM.XML contiene
TiempoEspera=35000 y EXTBASE.config TimerSwitch=20000, ademas de execute
timeout=15000; unidades, consumidor y alcance de cada parametro requieren
validacion antes de fijar timeouts del simulador.

NdcConfig/TCSConfig declaran LogPin=S. El simulador mantiene la prohibicion
de registrar PIN/PIN Block; no replica ese ajuste. Los CER publicos tienen
vigencia declarada hasta 2030/2039, pero no prueban confianza, identidad del
endpoint o autorizacion QA. No resuelven por si solos el error WS de AUTHTD.
No se encontraron configuracion AUTHTD/PROXY205, log correlacionado del 96
ni stack del fallo de Core en el inventario de esta carpeta.

### Pendientes acotados de esta fuente

- TODO-DATA ATM-IMAGE-ACTIVE-PROFILE: validar imagen NCR desplegada,
  configuracion EXTBASE/EXTBASEATM activa, hashes de DLL cargadas, entradas
  TRAN de BD y mapeo cuenta/buffer/escenario. Bloquea solo promover sus
  valores a un perfil ejecutable, no inspeccion ni pruebas offline.
- CB-DYNAMIC-REQUEST pasa de reglas sin fuente a reglas parcialmente
  documentadas en IL y contrastadas con una consulta; faltan secuencias,
  fechas/zona, cabecera completa, ramas/campos privados y seguridad nueva.
- BALANCE-RESPONSE-CONTRACT tiene layout/escala F54 respaldados para una
  muestra. Falta aprobar semantica y variantes antes de mostrar resultado.
- VISA-NETWORK-RESPONSE-POLICY y CB-PROCESSOR-ERROR/CB-96-SWITCH-LOG
  permanecen abiertos: estos archivos no contienen la evidencia necesaria
  para cerrarlos.

Implementacion posterior del 2026-10-12: reglas mecanicas CB y parser F54
entregados junto con orquestador/IPC/recepcion/diario, ver
`../implementation/BALANCE_EXECUTION.md`. El runtime todavia requiere el
proveedor QA de perfil activo, secuencia y PIN/EMV; recibir los archivos o
conectar la tarjeta no habilita automaticamente ese envio.

### Inspeccion adicional del origen PIN/EMV

Se extraen selectivamente bibliotecas de Dotnet.rar y se inspeccionan tablas de
metadatos e IL mediante PEReader, sin cargar ni ejecutar codigo del proveedor,
abrir conexiones o consultar datos/claves. La revision se conserva en artefactos
privados security-contract-metadata.json, pin-validation-il.json y pin-origin-il.json.

- Extreme.ISeguridad.dll (SHA256
  `72c595f3c08194628344424f9ac40bfa3dc865ba49a6d34d8acf74b8cda0708c`)
  declara ISeguridad/ISeguridadWcf con Login, ConsultarUsuario, permisos, grupos
  y otras operaciones administrativas. Seguridad.dll y ExtremeWeb.CBusSeguridad.dll
  exponen la misma familia. La referencia de HostCMS no identifica un metodo
  financiero de generacion de PIN Block; se corrige esa pista del checklist.
- ArmaMsgIso8583 de ATMIso8583 carga Param.PinTrasladado en IL 4421, antes de
  incorporar la seguridad al mensaje. En IL 4957 llama GetDataEMV. Esto muestra
  entradas previas al builder, no una generacion desde un PIN digitado y la
  lectura de identidad PC/SC.
- ValidacionPinLocal2018.dll (SHA256
  `7cc1f9bf438d1240419a0e0709b8b02b5168355284cd48d20185460fa0ff1b8c`):
  ValidarPinDesdeSwitch llama Des.PinTestFromNetwork (IL 164), y
  ValidarPinDesdeCajeroDirecta llama Des.LocalPintestGeneric (IL 164).
  CIEMVClass.ProcTrn llama ValidaTagEMV.ValidaARQC (IL 450).
  GetPinForATM recorre caracteres, usa Convert.ToInt32 base 16 y
  Char.ConvertFromUtf32; no llama un cifrador ni genera un PIN Block.
- Extreme.CryptoDotNet.dll contiene utilidades AES/TripleDES/RSA. Su presencia
  no documenta formato PIN, zona/clave TEST, distribucion de claves ni el perfil
  financiero aplicable; no se adopta un algoritmo por disponibilidad.

Esta evidencia distingue consumidores/validadores de seguridad de su origen.
No prueba ausencia de un generador en todos los componentes o despliegues.
HSM-QA-PROVIDER permanece abierto para el contrato de EPP/servicio TEST que
produce seguridad nueva y para el perfil EMV transaccional. No se construye
un adaptador WCF a partir de una interfaz administrativa ni se invocan metodos
de validacion como si fueran generadores. Secuencia/perfil activo conservan
sus pendientes independientes; no se realizo envio financiero en esta revision.

### Seguimiento adicional: preparacion PIN y cliente Crypto

Se inspeccionan selectivamente ExtremeTools, AuthParamGenDotNet, ComunATM,
Extreme.Comun, EXTREME_ATMS_2017, AuthParamNDC/TCS, MsgFormatDotNet,
WCFExtremeCrypto y WCFCryptoServer; ningun binario del proveedor se ejecuta.
Los artefactos privados origin-metadata.json, crypto-tool-il.json,
emv-sequence-il.json, wcf-crypto-il.json y key-read-il.json conservan el recorrido.

ExtremeTools.dll (SHA256
`ebe68a817e93c01a805c4f3fcdd9a5c171aecd16087ce7ab2a47849b3783c9a2`)
contiene CryptoTool.EncryptPin/EncryptPinAsHexa/AnsiPinEncrypt. Este ultimo
rellena PAN a 13 posiciones, toma los 12 digitos anteriores al final y rellena
a 16; forma longitud PIN con D2 decimal seguida del PIN rellenado a 14 con F;
convierte hexadecimal y aplica XOR de los dos buffers de ocho bytes antes de
llamar Des.Des_Encript. Se conserva D2 incluso para longitudes >=10; no se
reemplaza por una regla supuesta ni se certifica como formato ISO aprobado.
ReadKey lee el Registro mediante WinRegistry.ReadRegistryStringValue y llama
GetInternalKey/Des_Decript. No se leen esas entradas del Registro ni se extrae
una clave interna del binario. La preparacion mecanica se implementa en
LegacyQaPinEncryption; el cifrador y su perfil/clave TEST siguen pendientes.

MsgFormatDotNet.Des declara EncrytPinToZone, NetworkChangeZoneEx,
NetworkChangeZoneFromCryptogram y Des_Encript. WCFExtremeCrypto.CryptoService
usa ese componente. ImportClearPIN llama Des.EncrytPinToZone y despues
PinChangeFromZone (IL 118): tiene efecto de cambio de PIN, por lo que no se
adopta como generador para consulta. ValidateClearPIN cifra temporalmente y
llama PinTestFromZone; valida, no devuelve un PIN Block para F52.
WCFCryptoServer construye endpoints WCF a partir de argumentos de inicio;
su configuracion de servicio activa/zonas y contrato TEST no quedan resueltos
por disponer del EXE. No se inventa un archivo .config que no este identificado.

ATMIso8583 referencia ExtremeICryptoCMS.CCryptoService en su metadata.
ExtremeICryptoCMS.dll no figura en los inventarios Dotnet.rar/DotNet32.rar/Bin.rar.
Su contrato cliente y configuracion son un entregable concreto si la rama esta
activa en QA. GetDataEMV obtiene datos del contexto AuthParamGenDotNet y procesa
tags; no realiza PC/SC ni GENERATE AC sobre la tarjeta. Las bibliotecas de
parametros NDC/TCS transportan propiedades EMV, no cierran el perfil del kernel.

Revision directa del recurso Y:/ExtremePCI el 2026-10-12: busqueda exacta
recursiva de ExtremeICryptoCMS.dll sin coincidencias ni errores de lectura.
ATMIso8583.dll conserva el hash de la fuente revisada. ValidaPinConCedula
instancia CCryptoService en IL 70 y llama ValidaPinCard en IL 268;
el resultado se procesa como RetCode. No es evidencia de generacion F52.
La DLL es un pendiente condicional de esa validacion, no un requisito
general para crear un PIN Block. EXTBASE.config canonico de igual hash
configura SRVPIN/SRVPIN01 con ValidacionPinLocal2018.CIEMVAll_PADSS,
mediante SharedMemLink.exe. SRVPIN.XML es de log/excepciones y mantiene
Debug"S" mal formado; no se modifica el archivo compartido. No se infiere
un proveedor de generacion ni se invoca validacion/cambio de PIN para obtenerlo.

GetSecuenciaExtreme usa CnOctocli y sp_DebGetNextSeq, rellena un DataTable y
toma la primera columna de la primera fila como Int64 para secuencialNet.
No hay definicion del SP ni garantia de concurrencia/rollover en estos binarios;
solicitar su export y dependencias, sin invocarlo por una firma incompleta.
Los entregables minimos se detallan en BALANCE_EXECUTION.md. Esta revision
incluye pruebas sinteticas de preparacion PIN; sigue sin envio financiero QA.

### Confirmacion de copias activas y revision SQL

El usuario confirma los archivos canonicos sin fecha como activos, y los
archivos/directorios con fecha como backups, para todo el conjunto recibido.
tooling/review-active-atm-sources.mjs aplica la seleccion sin promocion de
respaldos. Identificadores de modulo 2013PCI/2017 se conservan como versiones.
Manifiesto UUID f29c25df-afe2-48f3-a47a-5085a51de48d; no se ejecutan binarios.
EXTBASE.config y EXTBASEATM.config siguen como perfiles distintos, no se mezclan.

Extremedata.xml activo confirma OCTOCLI, OCTOCLI2 y OCTOCLI3 en OCTOCLI_PCI
del servidor SQL configurado. El usuario confirma servidor compartido QA/PREPROD.
Inspeccion autenticada a47ade23-b56f-4489-a6b1-7b4065fd0f00 y busqueda ampliada
c9ad6452-6394-4bea-ae57-ea969899a512: SELECT de catalogos/metadatos, cero SP
ejecutados y cero escrituras financieras. sp_AtmGetDestino es visible en ambas
bases OCTOCLI; sp_DebGetNextSeq no aparece en las 14 bases de aplicacion visibles.
Los procedimientos con otros nombres de secuencia no se adoptan como equivalentes.

Se corrige el analisis anterior de secuencia: GenerarTransaccion IL 28/34 asigna
Param.Serial a secuencialNet. GetSecuenciaXTipoTarjeta IL 3..24 retorna si
GrabaAutoTran=N; si no, consulta ATMBIN y tambien retorna cuando encuentra una
fila (IL 209..230). Solo en la rama restante llama GetSecuenciaExtreme (IL 236).
COONECTA_ATM.XML canonico tiene GrabaAutoTran=N, por lo que no depende del SP
ausente para esta decision. selectCoonectaSequence implementa la seleccion sin
asignar seriales, cambiar la regla de rango del wire ni inventar politica de
concurrencia/reinicio. La reserva del serial ATM y fechas siguen pendientes.

La inspeccion local de catalogos no encontro perfiles ATM guardados; se requiere
configurar la instancia de prueba con un perfil real. PIN/EMV nuevos continúan
sin proveedor real. Las dos pruebas del emisor se limitan a loopback sintetico
separado por 30 s, no se declara una consulta financiera en QA.

### DebitoConecta_999999.cfg recibido el 2026-10-12

Fuente Y:/ExtremePCI/SwitchConfig/DebitoConecta_999999.cfg, 6578 bytes,
SHA-256 1329723ae3622588e82ca0b2c6e7182fdcb2895d837aa2c25646c10535f3455c.
El nombre no contiene fecha; se inspecciona la copia canonica aportada sin
inferir su uso runtime, entidad ni relacion con PID 999 por el sufijo 999999.
Es Base64 de XML bien formado, no cifrado ni programa ejecutable. Se
decodifica en memoria con DTD prohibido y resolucion externa deshabilitada;
no se ejecutan sus pasos ni se modifica el archivo compartido.

El flujo de 18 pasos referencia ExtremeAuthDebitoPCI, ExtremeAuthConectaPCI,
ExtremeCuposDebitoPCI y ExtremeSendDebitoPCI. Paso 004:
ExtremeAuthConectaPCI.CAuth.ValidarCryptoGrafia, Validate=ALL,
Skip=False, OnError=011. Paso 010:
ExtremeSendDebitoPCI.CSendCore.SendMediator, Validate=1, Skip=False,
OnError=011. Tipo 30 figura con Validate=1; MtiResponse incluye
200 -> 210. Esto documenta validacion/envio del autorizador, no el
generador de PIN Block/EMV del simulador. SendMsg=False se conserva
sin concluir que impida el llamado SendMediator: falta el contrato del
controlador del flujo. Tampoco se copian mapeos de MTI de este tramo al wire
ATM ni se ejecutan pasos de cambios de tarjeta, cupos, bloqueo o PIN.

Busqueda recursiva de los cuatro nombres exactos en Y:/ExtremePCI: ninguno
encontrado, cero errores de lectura. EXTBASE.config aportado no referencia
este cfg ni ExtremeAuthConectaPCI/ExtremeSendDebitoPCI en sus atributos.
No demuestra ausencia en otros servidores ni que el archivo sea obsoleto;
TODO-DATA DEBITO-CONFIG-RUNTIME: ruta/proceso que carga este flujo y sus
modulos, con log de paso/resultado y correlacion UTRNNO. No se adoptan DLL
de otro perfil ni se deshabilita el paso de criptografia.

Reporte privado artifacts/atm-image-review/debito-conecta-config-review.json,
UUID 2e9be7d9-4e25-417e-a82b-eed974a6f822. La prueba solicitada al Switch
es una reproduccion real QA de la consulta capturada, recibida con F39=96;
generacion nueva desde el chip sigue dependiente del proveedor TEST.
Correlacion y ventana en CB_205_BALANCE_SAMPLE.md.

### Actualizacion con fuentes Mediator y Registro

ConfigFiles.rar de Mediator (225b4056f23faa5d35ba7697494c8eb5342f6a0b5957ba07e2431d7019bff0b3)
y DotNet.rar (0029d9ee90310977fd3719cad7e9b7b3d7a333368b29ac3520f8edaeeab0513b)
resuelven la recepcion de las cuatro DLL del flujo, antes ausentes en Y.
Las copias canonicas se inspeccionan estaticamente y los backups fechados
se excluyen. Los nombres iguales de host ATM y Mediator no implican igual
version: se conserva cada hash y perfil por separado.

ExtremeSendDebitoPCI.dll, SHA-256
8c329a2632d466b8bd12dd043eac27c7e5ad5eb4be73bc29590c479af79f9f69,
expone CSendCore.SendTransaccion, no CSendCore.SendMediator; base System.Object.
El metodo SendMediator existe en ExtremeAuthConectaPCI.CAuth, otra clase;
no se cambia la clase del cfg por coincidencia de nombre.
Se verifica la incompatibilidad del paso 010 y prepara candidato que lo
apunta a SendTransaccion, sin desplegarlo ni declarar equivalente su
comportamiento. TODO-DATA MEDIATOR-FLOW-VERSION conserva la validacion
runtime y el conflicto. ObjectLibrary.ExecuteAsembly usa GetMethod/Invoke.

ExtremeSwitchDebitoPCI.config y ExtremeAuthCMSByBin.config relacionan el
fallback 999999 con DebitoConecta_999999.cfg. GetFileCFGByBin consulta primero
CodigoEmisor9, luego CodigoEmisor y luego 999999 (IL 27/60/106). No se
identifica el sufijo como PID 999. PROXY205.CallSubSystem=AUTHTD queda
documentado en el EXTBASE.config de Mediator, no inferido del timeout previo.

llavesCajeros.reg aporta 122 secciones SafeNet y una seccion 428150205.
Se inspeccionan nombres/tipos y solo parametros HSM no secretos; valores de
llaves no se usan, copian o registran. No se importa el .reg, extraen claves
internas de DLL ni invocan validacion/cambio de PIN para generar F52. La
referencia de clave TEST y perfil EMV de una operacion nueva siguen pendientes.
Ver BALANCE_EXECUTION.md para los hallazgos/candidato y sus limites.
