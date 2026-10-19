# Revision de configuracion proporcionada

Revision 2026-10-13 motivada por la correccion del usuario: la configuracion
ya fue proporcionada. El estado del simulador no acredita ausencia o
desconfiguracion del host, HSM o cajero. No solicitar de nuevo las fuentes
recibidas por un bloqueo de implementacion local.

## Resultado comprobado

Electron instancia BalanceInquiryService en index.ts sin su cuarto argumento
BalanceContextProvider. El servicio devuelve missingBalanceContext cuando
ese argumento no existe. Este es un pendiente de integracion del simulador,
no una prueba de que no se configuraron las dependencias externas.

Los mensajes de bloqueo se corrigen para indicar integracion, asignacion por
operacion y vinculacion del perfil. Se conservan los controles de generacion
y transporte: no se habilita un envio solo por cambiar el texto.

## Fuentes contrastadas

| Area | Informacion ya recibida y verificada | Uso actual en el simulador |
| --- | --- | --- |
| Enlace QA | SWATM01 en EXTBASE.config apunta a 10.60.0.11:16100; evidencia Main QA/entidad 205. Probe 12:38 Ecuador recibe 0800/071 | Transporte y framing implementados; la recepcion de gestion no certifica una consulta nueva |
| ISO | ISOBASEI.bin canonico, formatter y captura CB 301000/840 | Builder/codec de saldo implementados; el builder exige campos privados del proveedor |
| Parametros EMV | INA/BAT Diebold 91x, 9F33=604020, 9F35=14, 9F40=EF80B05010, TAC-Online/Default y ausencia TAC-Denial | Parser y analisis previo implementados; perfil privado conserva parametros. No calcula TVR/CVM ni ejecuta GENERATE AC |
| Tarjeta | Lector OMNIKEY y tarjeta terminada en 2267; AID, CDOL1/CDOL2 e IAC leidos | SELECT/GPO/READ RECORD implementados; lectura de identidad y requisitos, sin criptograma de una nueva operacion |
| Cifrado PIN | ExtremeTools.EncryptPinAsHexa/AnsiPinEncrypt y MsgFormatDotNet.Des.EncrytPinToZone presentes | Preparacion mecanica LegacyQaPinEncryption disponible, sin QaPinCipher real ni llamada al mecanismo recibido |
| HSM/Registro | Revision previa de llavesCajeros.reg: 122 secciones, referencias SafeNet y BIN/entidad 428150205; datos de conexion ya inspeccionados | Fuente recibida; no hay cliente/adaptador local conectado a ella. No se vuelve a pedir export general ni valores de claves |
| Secuencia | COONECTA_ATM.XML canonico usa GrabaAutoTran=N; fuente ATMIso8583 conserva Param.Serial | selectCoonectaSequence implementa la decision; falta vincular asignacion por operacion/instancia al contexto. No exigir sp_DebGetNextSeq para esta rama |
| Mediator/Core | ConfigFiles.rar y DotNet.rar recibidos; flujo CB, fuentes de validacion, consultas y resultados previos | Observacion y evidencia recibidas; no equivalen a generacion de seguridad en la estacion |

Se recalculan hashes de cuatro archivos RAR del host y diecisiete copias
canonicas seleccionadas: 21/21 coinciden con el manifiesto previo. No se
adoptan backups fechados. Los dos RAR de Mediator tambien coinciden con su
inventario recibido; esta comparacion no acredita configuracion remota actual.
Las unidades W/Y no estan disponibles en esta estacion durante la revision;
se usan fuentes locales y reportes previos sin afirmar nueva inspeccion remota.

## Mecanismo de cifrado recibido

Inspeccion nueva del IL de MsgFormatDotNet.dll canonico, sin cargar ni ejecutar
el binario: Des.EncrytPinToZone recibe Pan, ClearPin, Zone y EnryptedPin, con
un parametro adicional de retorno en metadatos. En offset IL 130 llama a
CCrypto2.EncryptPinToZone; devuelve salida nativa mediante PtrToStringAnsi.
Hay por tanto una funcion de cifrado originador recibida, no solo validadores.
No afirmar que falta proporcionar un generador por ausencia del adaptador local.

ImportClearPIN en WCFExtremeCrypto llama tambien a PinChangeFromZone, por lo
que no se elige ese flujo para una consulta. La inspeccion de la funcion
EncrytPinToZone no prueba por si sola zona aplicable, disponibilidad TEST,
aislamiento de secretos o compatibilidad del runtime local. Esas asociaciones
deben trazarse en las fuentes/instancia existentes, sin inventar sus valores
ni ejecutar operaciones de cambio de PIN para construir F52.

Reporte privado: artifacts/atm-image-review/pin-zone-encryption-review-20261013.json.

## Limites de la comprobacion anterior

check-fresh-balance-readiness.mjs crea un servicio sin proveedor, igual al
wiring de index.ts. No consulta HSM, DLL del host, configuracion completa
del ambiente ni el servicio Main de una instancia Electron en ejecucion.
Su cardReadReport referencia una lectura anterior fija. ready=false permite
confirmar el comportamiento de esa construccion local; no diagnostica
desconfiguracion externa ni demuestra una sesion financiera actual.

Las dos consultas de two-local-balance-probes.json son SYNTHETIC_LOOPBACK,
con cero escrituras financieras QA. Las consultas anteriores realmente
enviadas desde la herramienta fueron capturas preservadas. No constituyen
implementacion terminada de seguridad nueva del chip.

## Trabajo local pendiente y datos dependientes

TODO-IMPLEMENTATION BALANCE-CONTEXT-INTEGRATION: implementar e inyectar
el proveedor usando las fuentes ya recibidas. Debe vincular perfil/serial,
calendario y sesion de tarjeta, originar PIN/EMV nuevos y limpiar buffers.

TODO-IMPLEMENTATION CARD-TRANSACTION-PROCESSING: completar procesamiento
TVR/CVM, accion del terminal y GENERATE AC con CDOL del chip. Parametros,
listas CDOL e IAC recibidos no se vuelven a solicitar como configuracion faltante.

TODO-IMPLEMENTATION QA-PIN-ADAPTER: encapsular el mecanismo recibido de cifrado
tras una interfaz fuera del Renderer, con contexto TEST y referencias seguras.
No sustituir su salida por F52 capturado ni obtener llaves internas de la DLL.

TODO-DATA QA-PIN-INSTANCE-BINDING: si las fuentes no permiten identificar la
zona/referencia y runtime TEST para esta instancia, registrar esa ausencia
concreta. No tratarla como ausencia de todos los archivos/configuraciones.
TODO-DATA CB-SEQUENCE-INSTANCE: si no existe asignacion para la instancia
del simulador, validar solo serial reservado y calendario; no inventar rollover
ni usar secuencia de un cajero activo o un SP de otra rama.

Esta revision no ejecuta binarios de proveedor, aplica Registro, modifica
configuracion remota o genera/envia una transaccion financiera.
