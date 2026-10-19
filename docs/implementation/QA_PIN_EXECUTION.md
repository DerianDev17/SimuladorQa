# Enviar una consulta nueva con PIN en QA

Actualizacion ARQC 2026-10-16: SRVPIN 900108 confirma PIN/tarjeta OK y
criptograma negado. QaEmvOperation ahora incluye 5F34 desde el chip en F55,
incluso si el perfil guardado lo omite; el host no recibe F23 en ese recorrido
y completaba 5F34 con 00. La captura aprobada incluye 5F34=01 y el request
NWINT 900107 tiene F23=001. No se fija 01 ni se reutiliza una AC. Pendiente
comprobar ARQC contra el host despues de este arreglo y explicar el 57 que
PROXY serializa como `5 `. Ver [evidencia](../protocols/QA_SWITCH_LOGS_20261016.md).

Actualizacion 2026-10-16: se corrige la conversion de tag 57 a F35. El
relleno F final del chip se elimina y, para longitud impar, se agrega 0 al
inicio del BCD ISO, conforme al frame 218 aprobado. SmartVista QA confirma
880/BAD_TRK2 para el rechazo 19 de STAN 900106; 900105 tambien registra
880/19. PIN, claves, versiones y capacidades EMV permanecen como estaban.
Se agregan regresiones sinteticas de unidad y de trama TCP local; la
aprobacion posterior del host sigue pendiente. Ver
[BALANCE_EXECUTION.md](BALANCE_EXECUTION.md).

Actualizacion 2026-10-15T22:41:47Z: ATM20521 dispone de 1000 reservas nuevas,
900105-901104, verificadas y asignadas exclusivamente a esta estacion con
autorizacion del usuario. Main confirma el pool cargado; no se envia una TRX.
Tras reiniciar se requiere una lectura manual de tarjeta nueva. La excepcion
SQL de esta comprobacion queda consumida; no cambia la configuracion TLS
de la app. Ver [ADR-015](../adr/ADR-015-QA-SEQUENCE-POOL-REPLENISHMENT.md).

Actualizacion 2026-10-15T21:23:31Z: se repone una sola reserva local, 900104,
tras la inspeccion SQL puntual autorizada en ADR-014. La consulta desde la
instancia Electron solicita PIN nuevo, genera primera AC y recibe 0210/19;
no aprobada. El pool vuelve a cero. Se conserva el perfil y la clave TEST
existentes. Detalle y correlacion en [BALANCE_EXECUTION.md](BALANCE_EXECUTION.md).

## Correccion de fallos previos al envio, 2026-10-14

La secuencia QA se consume despues de revalidar la tarjeta y completar el
cifrado del PIN, inmediatamente antes de preparar/generar EMV. Antes se
consumia incluso cuando fallaba la sesion, el perfil de tarjeta o el cifrado,
agotando innecesariamente el pool aprobado. Una vez reservada, no se recicla
si falla EMV. No se agregan secuencias ni se modifican reservas existentes.

El proveedor conserva exclusivamente codigos publicos de error y la etapa
del fallo. El resultado diferencia PIN, lector, tarjeta incompatible, reserva
y EMV; nunca copia mensajes originales, datos de chip ni material criptografico.
La UI permite otro intento explicito cuando Main confirma cero transmision.
Detalle de recuperacion e idempotencia en [BALANCE_EXECUTION.md](BALANCE_EXECUTION.md).

## Llave de enlace comprobada y perfil activado, 2026-10-14

La nueva evidencia del usuario aporta componentes y clave clara del enlace.
Se comprueban sus KCV y combinacion XOR en memoria. Ademas, cifrar el PIN
recibido de la misma tarjeta mediante EXTREME_ANSI_IL/TDEA produce exactamente
el F52 de la consulta historica aprobada (frame 218). Esta comprobacion resuelve
la vinculacion concreta y el formato para esta tarjeta/enlace; no interpreta
el codigo SmartVista 01 como una enumeracion ISO universal. El valor cifrado
historico se usa solo en la comparacion offline, nunca en el nuevo proveedor.

Se instala un perfil privado para ATM20521, el terminal de esa consulta,
y una nueva credencial con finalidad QA:TDEA_2KEY_ECB, protegida con DPAPI.
Se conserva separada la maestra CMS de ATM20524. El importador TEST permite
stdin privado con KCV obligatorio, rechaza errores/duplicados y nunca imprime
material. No se guardan valores de llaves, componentes o PIN en el repositorio.

Consulta SQL de solo lectura de las 19:02 UTC confirma un unico lote abierto
31 para ATM20521, fecha contable 2026-08-17. Se usa esa fecha del host y se
generan nuevas fechas transaccionales. El simulador reserva localmente seriales
900101-900103; Mediator no contiene registros de esos seriales para el terminal.
Esto sigue GrabaAutoTran=N/Param.Serial, sin ejecutar un SP ni modificar SQL.
La reserva local no constituye un bloqueo distribuido de un ATM fisico.

Los campos publicos fijos proceden del frame 218; las capacidades/TAC proceden
del Registro/INA recibido. F55 usa tags generados/soportados observados en la
captura; no copia PAN/Track2 duplicados, etiqueta comercial ni serial fisico
del F55 historico. PAN/Track2 se leen del chip para sus campos ISO propios.
La aplicacion seleccionada se incluye en 9F06 y se valida contra el perfil.

Se corrige un defecto de empaquetado: F55 requiere 01 00 y longitud TLV antes
del TLV, ademas del prefijo de longitud ISOBASEI. Lo confirma GetDataEMV y el
frame 218 (219 bytes = 3 + 216). El proveedor anterior enviaba solamente TLV;
las pruebas sinteticas no comprobaban esa envolvente. Ahora la integracion
TCP y un vector unitario la verifican, incluido el limite de 255 bytes.

La app se compila y reinicia con el perfil. No se afirma aprobacion financiera
a partir de estas comprobaciones: el resultado del intento se registra aparte.
Evidencia privada: artifacts/qa-network-key-activation-20261014.json y
artifacts/atm-image-review/active-balance-calendar.json.

Comprobacion de las 19:10 UTC: el adaptador de cifrado accede a la referencia
DPAPI y PC/SC detecta tarjeta presente en el lector por contacto. La ventana
de Windows esta bloqueada y no permite operar el formulario/PIN; se solicita
desbloqueo local. No se ha generado AC ni transmitido una consulta financiera
en este intento. Evidencia: artifacts/qa-activation-readiness-20261014.json.
Validacion: 35 pruebas unitarias/integracion de los seis archivos afectados,
incluido importador Windows real con clave sintetica; typecheck, lint, build
y check:security correctos. No se ejecuta un replay como sustituto.

## Ruta directa 16100 y carga de componentes, 2026-10-14

El usuario confirma que las direcciones/puertos de la captura CMS corresponden
a la comunicacion del ATM. El simulador conserva su ruta financiera directa
a 10.60.0.11:16100. Se corrige el proveedor documental: ya no exige implementar
TCS, disponer de la IP origen TCS ni finalizar ATMForceChgKey para esta ruta.
La evidencia TCS permanece conservada y no cambia el destino financiero.

Se implementa `tooling/enroll-qa-atm-components.ps1`. Recibe dos componentes
por stdin privado; comprueba sus digitos individuales, combina XOR y exige
coincidencia con el KCV maestro documentado. Rechaza PROD, entradas/campos
invalidos, duplicados y reemplazo de una credencial existente. Guarda solamente
la maestra combinada mediante PSCredential/DPAPI de Windows, fuera del repo,
en `qa-atm-master-keys/<UUID>.credential.xml`, con finalidad
`QA:ATM_MASTER:TDEA_2KEY_ECB:<terminal>`. No devuelve material ni KCV.
El adaptador de PIN rechaza esa finalidad aunque se le entregue su directorio.
No se confunde una coincidencia de KCV con autorizacion de uso criptografico.

Se ejecuta la importacion real de los componentes recibidos para ATM20524:
digitos individuales correctos, maestra coincidente con CMS, comprobacion
distinta de la llave del enlace 80131. El KCV del enlace se revisa de nuevo en
la pantalla Device keys de SmartVista, sin guardar cambios. Se vincula la
referencia protegida en `qa-cms-atm-evidence.json`, conservando copia anterior.
El campo opcional `masterKeyCustody` admite solo keyReference, networkCheckMatched
y protectedAt UTC. Los archivos anteriores sin ese campo siguen siendo validos.
Esta metadata nunca produce `ready=true` ni sustituye el perfil ejecutable.

Prueba real de red, 2026-10-14T17:35:54Z: origen 10.10.10.21 a
10.60.0.11:16100 recibe gestion 0800/071, 60 bytes; cero bytes transmitidos.
runId 0839e803-eb7e-466e-96e7-5e78091d1ea1. Las comprobaciones TCP a los
servicios documentados 10.10.30.6:4001 y 172.60.60.152:50200/51200 terminan
por timeout de 3 segundos, sin payload. PC/SC devuelve lista de lectores vacia.
No se genera PIN/ARQC ni se envia una consulta financiera nueva. Conexion
exitosa y custodia de la maestra no equivalen a aprobacion de una consulta.

Pendiente concreto de la ruta directa: cifrar el PIN nuevo con la llave que
usa el enlace SmartVista (la maestra CMS recien cargada es diferente), y
activar su perfil de ejecucion con formato/secuencia/calendario vinculados.
El ingreso nativo, cifrador local y primera AC ya estan implementados; no se
solicita crear de nuevo los componentes recibidos ni instalar SafeNet local.
La lectura CMS actual sigue mostrando lote abierto 4 de 2024-07-25; esa fecha
no se adopta silenciosamente para una operacion actual.

Evidencia privada sin secretos: `artifacts/qa-direct-16100-test-20261014.json`.
Validacion: 50 pruebas de los ocho archivos afectados/de regresion pasan;
incluyen custodia DPAPI real en Windows con componentes sinteticos, rechazo
de finalidad maestra para PIN, errores de almacenamiento, parser estricto,
aislamiento por ATM y dos consultas nuevas a un host TCP sintetico. Lint,
typecheck, build, formato de archivos modificados y check:security pasan.
La app compilada se reinicia; PC/SC y la pantalla Inicio confirman ausencia
de lectores. La prueba de red real y las consultas sinteticas son distintas.
Las observaciones TCS de los apartados siguientes son historicas; no son
requisitos activos del envio directo confirmado por el usuario.

## ATM20524 y componentes CMS, 2026-10-14

Actualizacion posterior tras el cambio del usuario en CMS: una nueva lectura
confirma origen 10.10.10.21:30964 y puerto host 6100. Se sincroniza ese origen
en el snapshot privado local conservando una copia anterior y la fecha de
comprobacion de la llave. Una prueba TCP con bind explicito a
10.10.10.21:30964 conecta a 172.60.60.152:6100 en 39 ms; en 8 segundos no
recibe datos y no envia payload. El proveedor cargado desde el archivo
actualizado ya no informa QA-CMS-SOURCE-ADDRESS. Conserva
QA-CMS-TCS-ADAPTER y QA-CMS-KEY-EXCHANGE; no hubo consulta financiera.
Evidencia: artifacts/cms-atm20524-origin-sync.json y
artifacts/atm-image-review/tcs-exact-origin-probe-20261014.json.
Los valores .244 que siguen describen la inspeccion anterior al cambio.

El usuario confirma que los componentes 2134 y 2135 fueron generados en
Extreme Web CMS. La consulta parametrizada de solo lectura a
ARGOS.KEYEncryption confirma ambos asociados a ATM20524. Se comprueban en
memoria los digitos individuales con TDEA sobre un bloque cero y el candidato
XOR de ambos: su KCV coincide con ATMKeys.ATMCheckMaster de ATM20524, pero no
con ATMCheckComm ni con el KCV del enlace SmartVista recibido anteriormente.
La coincidencia corresponde a la llave maestra de terminal; no permite usarla
como llave PIN de la conexion directa al Switch. No se persisten componentes,
llave combinada ni PIN. No se instala una credencial de cifrado con esa llave.

La lectura confirma imagen activa/principal 1054, entidad 205, origen TCS
10.10.10.244:30964, puerto local 6100, subsistema TCS01, ATMEnabled=true y
ATMForceChgKey=true. La fecha maestra es 2026-10-14 y la de comunicacion
2024-08-13. No se interpreta ATMState=-2 sin su diccionario. La PC usa
10.10.10.21, distinta de la IP origen registrada. El ultimo lote abierto
consultado es 4, fecha contable 2024-07-25; no se modifica ni se adopta para
una transaccion nueva sin confirmar el lote vigente.

El BAT recibido compila la imagen 1054; se lee, no se ejecuta. El TXT tiene
SHA256 6679142d54f31e8085e1bb02d61d90cbe750a4598393929d5a3ba48bba38ff04.
Su TRAN saldo/ahorros espanol usa CBAB__IB, transaccion 30, cuenta 10 y
ATMIso8583.IBanco.procesaTransaccion en el host. Sus TAC VISA activos son
denial 0000000000 y online/default C800000000; no se mezclan con ATM20521.
EXTBASE.config configura listener 6100 y TCSCommSubsystem2018 mediante
Bin32/TLSGrouplink2.exe, con otra conexion SWATM01 al Switch 16100.
La prueba TCP a 172.60.60.152:6100 conecta en 65 ms sin escribir payload.
Esto no confirma admision ATM, intercambio de llaves ni saldo.

Se agrega el perfil administrativo local ATM20524 y un snapshot de evidencia
CMS por UUID/revision. El Acquirer ID administrativo procede de VisaACQID
de COONECTA_ATM.XML; no equivale a construir F32. Se conserva ATM20521 y una
copia previa del catalogo. Main carga qa-cms-atm-evidence.json; la UI distingue
la comprobacion maestra positiva, el adaptador TCS ausente, el origen de red
y el cambio de llave pendiente. El archivo no contiene llaves ni KCV y nunca
habilita PIN, GENERATE AC o envio. Las pruebas cubren entradas invalidas,
secretos extra, persistencia/reinicio, dependencia local no disponible y
aislamiento de terminal/revision/destino.

TODO-DATA QA-TCS-WIRE-KEY-EXCHANGE: falta contrato/captura validada del cliente
TCP y descarga de llave de comunicacion TCS. Los archivos incluyen Bin,
Dotnet y DotNet32, pero no Bin32. TcsNdcMsg expone una interfaz interna del
host, no una especificacion del cliente TCP. El usuario confirma no disponer
de Bin32 ni manual. Se necesita esa fuente para implementar el adaptador;
no se ensayan formatos arbitrarios con la tarjeta ni se reutiliza PIN capturado.
No hubo consulta financiera ni cambios de configuracion remota.

Evidencia privada: artifacts/atm-image-review/atm20524-metadata.json,
atm20524-key-comparison.json, tcs-connectivity-20261014.json y
artifacts/cms-atm20524-link.json. Estos resultados no certifican TCS operativo.

Validacion de esta entrega: lint, typecheck, build y check:security correctos;
38 pruebas de evidencia CMS/SmartVista y Router pasan (6 archivos). La app
actualizada muestra ATM20524 junto a ATM20521 y se deja seleccionado saldo/
ahorros para ATM20524. En esa revision no hay lector conectado; no se solicita
PIN ni se genera AC. La vista de dependencias financieras requiere identidad
de tarjeta seleccionada; la validacion del proveedor se cubre en las pruebas,
sin afirmar que se haya ejecutado una consulta real.

## Entrega del 2026-10-13

Decision posterior del usuario (2026-10-13): mantener ingreso y cifrado de PIN
nuevo. Se descarta expresamente la alternativa de reutilizar el PIN cifrado
de una captura con EMV nuevo. No implementar esa alternativa ni confundirla
con la ruta de PIN solicitada.

Revision adicional de fuentes y acceso: los ZIP anidados en Bin.rar contienen
ejecutables Crypto/CryptoServer; no aportan otro export de Registro. La sesion
SmartVista accesible confirma PID 80131, direccion remota de esta PC,
puerto local 16100 y comunicacion habilitada. Module Attributes, filtrado por
HSM Communications Interface (49), muestra un atributo de cambio de PIN
ERACOM_USE_EE2021_FOR_PINCHANGE; no proporciona endpoint ni operacion para
originar PIN cifrado. No se utiliza cambio de PIN para una consulta de saldo.
Las opciones revisadas no permiten completar el cifrado desde esa sesion;
esto no prueba ausencia de otras interfaces del servidor. No se modifican
SmartVista, llaves ni permisos, ni se transmite una consulta financiera.

La revision offline de EXTREME_ATMS_2017.AccesoBase.ConsultoFechaContable
identifica ATMDayClose por ATMCajero y NroBATCH. Inicializa la fecha con Today,
usa FechaContable cuando encuentra fila y conserva Today ante falta de fila
o excepcion SQL (IL 0-18, 30, 136-173, 174-224). Es evidencia de la politica
del componente recibido, no una consulta del lote vigente ni una licencia
para cambiar silenciosamente la fecha del perfil. La vinculacion del lote y
la rama efectiva quedan pendientes; no volver a describir la fecha como una
regla completamente desconocida. Evidencia privada:
artifacts/atm-image-review/accounting-calendar-il.json.

Se implementa la ruta concreta para la primera prueba con la tarjeta por
contacto: Enviar abre una ventana nativa de Windows para ingresar el PIN,
lo cifra con una referencia TEST protegida, obtiene una primera AC del chip,
construye una consulta CB/ahorros y delega al transporte TCP existente.
Main registra un proveedor por perfil ATM aprobado al iniciar.
No hace falta instalar SafeNet para el adaptador local de TEST implementado.

El adaptador local exige declaracion explicita TDEA de dos claves/ECB y
EXTREME_ANSI_IL; no deduce esa vinculacion de la DLL, un nombre de zona,
una captura o el Registro cifrado del host. El empaquetado del PIN conserva
la mecanica revisada de ExtremeTools.CryptoTool.AnsiPinEncrypt, incluida
su longitud decimal D2. Esto no certifica que cualquier zona del host use
ese formato/algoritmo. Se requiere una vinculacion aprobada de TEST para usarlo.

La eleccion de ATM sigue siendo un perfil de software. Esta entrega utiliza
PC/SC como fuente de la tarjeta; aun no entrega un generador criptografico de
tarjetas virtuales sin chip. El Router admite otro proveedor sin acoplarlo
al hardware, pero las claves EMV y reglas de un perfil virtual no se inventan.

## Recorrido y limites

1. Validar ATM/revision/destino, perfil, secuencia disponible, acceso DPAPI a
   la clave y lectura vigente del AID elegido. Sin esas dependencias no se pide PIN.
2. Pedir PIN en una ventana WinForms independiente, con caracteres ocultos,
   Cancelar y deadline de 60 segundos. No hay PIN en IPC del Renderer.
3. Volver a validar el contexto tras el dialogo y reservar una secuencia.
4. Adquirir la sesion exclusiva de la tarjeta y confirmar presencia. Reseleccionar
   el mismo AID y repetir GPO/lectura de registros bajo esa sesion, verificando
   identidad para impedir usar estado alterado por otro cliente PC/SC. Los
   campos privados de la lectura solo permanecen en Main para esta operacion.
5. Validar PAN/BIN, Track2, vencimiento y numero de secuencia; cifrar el bloque
   con el helper privado, con timeout y salida acotada.
6. Procesar el perfil acotado de CVM online PIN, fechas, version, AUC e IAC/TAC.
   Construir CDOL1 desde la lista del chip con valores nuevos, TVR calculado
   y numero impredecible aleatorio. Ejecutar GENERATE AC solicitando ARQC;
   un AAC/TC o un perfil incompatible bloquea el envio.
7. Construir F55 con la respuesta del chip y el orden del perfil aprobado.
   El builder genera los campos dinamicos usando las fuentes CB ya revisadas.
   El diario guarda PENDING antes del write y el transporte no reintenta.
8. Liberar la lectura y limpiar buffers privados al terminar o cancelar.
   Otra operacion requiere leer nuevamente la tarjeta.

El procesador soporta el caso acotado online-only tipo 14/capacidades 604020,
saldo cero, moneda 840, pais 218, tipo 30 y uso SERVICES declarado por el
perfil aprobado. CVM, CDOL, datos del chip o perfil fuera de ese alcance se
rechazan; no se rellenan con ceros para simular compatibilidad.
No es un kernel EMV certificado: no implementa segunda AC, autenticacion
ARPC, scripts del emisor ni finalizacion completa del chip. El resultado
registrado es la respuesta del host. La ventana nativa tampoco es un PIN
pad certificado; se usa exclusivamente con datos y claves de TEST.
Se limpian los buffers propios y se termina cada helper; .NET/JavaScript
pueden crear cadenas temporales que no permiten garantizar borrado total
de la memoria administrada.

## Configuracion privada

Actualizacion 2026-10-13, capturas Device keys: se vincula la evidencia de
ATM20521 a su UUID/revision local, enlace ATM PID 80131 y CB PID 82052,
destinos QA ya documentados, Key Length 32, Pin Block Format 01, PPK Index 1
y KCV conservado solo en la configuracion privada. El usuario reporta el mismo bloque de llave para ambos enlaces.
Se conserva solo metadata documental; no se copia el bloque de llave, PIN ni
seguridad capturada a codigo, logs o JSON. Un KCV reportado no equivale a
una comprobacion criptografica realizada por el simulador.

Main lee `qa-atm-evidence-bindings.json` privado, version 1 / bindings, con
UUID, ambiente QA, entidad 205, ATM/revision/terminal, endpoint, atmPid,
corePid/coreEndpoint, pinBlockFormatCode, keyCheckValue, keyLengthSetting,
ppkIndex, sameReportedKeyBlock, sourceReference y recordedAt UTC. Parser
estricto (64 KiB, 50 registros) rechaza secretos/campos adicionales, PROD,
duplicados y datos invalidos. No agrega reglas ISO ni cambia la revision
administrativa. Los proveedores ejecutables aprobados conservan prioridad.

Esta vinculacion documental informa tres pendientes concretos en la revision:
QA-PIN-HSM-BINDING, QA-PIN-FORMAT-MAPPING y QA-SEQUENCE-CALENDAR-BINDING.
`ready` permanece false y adquirir contexto falla antes de PIN, GENERATE AC
o transporte. No confundir vincular evidencia con activar cifrado/envio.

El valor recibido no es una clave clara de 32 digitos hexadecimales compatible
con WindowsQaPinCipher. Su forma parece un bloque protegido del HSM; se
mantiene como evidencia opaca, sin interpretar su cabecera ni extraer material.
Thales documenta que las claves almacenadas como Key Block requieren la LMK
correspondiente en el HSM; la coincidencia de texto/KCV entre enlaces no
demuestra que este PC pueda usarlas. Fuente primaria:
https://cpl.thalesgroup.com/sites/default/files/content/brochures/field_document/2020-10/payShield-9K-10K-compatibility-guide-br.pdf.
TODO-DATA QA-PIN-FORMAT-MAPPING: validar el significado del codigo SmartVista
01 y su correspondencia con el formato originador; no asumir ISO formato 1
ni sustituirlo automaticamente por EXTREME_ANSI_IL. TODO-DATA
QA-PIN-HSM-BINDING: identificar interfaz disponible/autenticada del HSM o
servicio QA capaz de originar el bloque PIN con la llave reportada. No se
solicita reinstalar SafeNet ni exportar LMK/llave clara del host.

Verificacion de esta vinculacion: archivo privado validado y guardado para
ATM20521/revision 1; Main reiniciado con la compilacion actual. La tarjeta
fisica se lee y selecciona nuevamente, y Revisar transaccion devuelve los
tres pendientes concretos anteriores desde el IPC real. Enviar sigue
deshabilitado, sin solicitud de PIN, GENERATE AC ni write financiero. El
usuario confirma acceso solo a SmartVista, sin interfaz HSM identificada;
no se afirma que haya un endpoint disponible desde esta PC.
Lint, typecheck, seguridad y build pasan; 589 unitarias y 7 integraciones
afectadas pasan, ademas de la comprobacion nativa de Main/PCSC descrita.
Evidencia privada: artifacts/qa-profile-binding-20261013.json.

En el userData de Electron, por defecto
`%APPDATA%/Coonecta ATM Simulator`, Main lee `qa-execution-profiles.json`.
La app carga el archivo al iniciar; cambiarlo requiere reiniciar.
El parser es estricto, limita el archivo a 64 KiB y admite hasta 50 perfiles.
No se instala automaticamente un perfil sintetico ni seguridad de un PCAP.

Formato raiz: `version: 1`, `profiles: [...]`. Cada perfil contiene:

| Propiedad | Contenido requerido |
| --- | --- |
| id, atmId, keyReference | UUID tecnicos; atmId coincide con el catalogo local |
| environment, entityCode | QA, 205 |
| atmRevision, terminalId, endpoint | Revision y destino exactos de la instancia; terminal de ocho caracteres |
| applicationId, cardBin | AID y BIN aprobados de la tarjeta; no PAN completo |
| pinAlgorithm, pinEncoding | TDEA_2KEY_ECB, EXTREME_ANSI_IL, explicitamente validados para la zona TEST |
| timeZone, accountingDate | Zona del host y fecha contable efectiva; no se deduce del reloj de la PC |
| header, extension | Bytes hexadecimales aprobados, 22 y dos bytes respectivamente |
| fixedFields | Campos codificados 18,19,22,25,28,32,42,43,48,49,53,60,62; incluye prefijos variables |
| reservedSequences | Pool reservado de STAN 1..999999, sin duplicados; no se incrementa el serial del cajero fisico |
| approvalReference | Referencia documental de validacion del perfil |
| emv | parameters, countryCode, transactionType, applicationVersion, issuerUsage, extraTags, field55Tags |

`emv.parameters` utiliza el parser de parametros EMV ya existente:
environment, terminalCapabilities, terminalType, additionalTerminalCapabilities,
tacDenial, tacOnline, tacDefault. `tacDenial: null` representa la ausencia
documentada. `extraTags` admite solo 9F1E,84,9F1D,9F53,9F39 cuando el perfil
los define. `field55Tags` fija el orden de los tags aprobados y exige los
datos esenciales del criptograma. 5F34 se lee exclusivamente del chip y se
agrega al final si la lista antigua no lo incluye; la lista puede ordenar
el tag pero extraTags no puede asignarle un valor fijo. Una configuracion
contradictoria se rechaza.

Las claves nunca van en ese JSON. El helper busca
`qa-test-keys/<keyReference>.credential.xml`: PSCredential protegido por
DPAPI del usuario de Windows, con etiqueta `QA:TDEA_2KEY_ECB`. No admite
archivos del Registro cifrados del host como sustituto de ese contrato.
Los perfiles privados y credenciales estan excluidos de Git.

Para registrar una clave TEST que el responsable QA haya aprobado para ese
perfil, hay un helper manual con entrada nativa oculta y confirmacion doble:

```powershell
powershell.exe -NoProfile -STA -File tooling/enroll-qa-test-key.ps1 -ProfileId <UUID-del-perfil-aprobado>
```

No pasa la clave por argumentos ni por la conversacion. Exige el perfil QA
existente, rechaza claves debiles, protege para el usuario actual y no
sobrescribe una credencial existente. `-UserDataDirectory` permite usar el
directorio configurado expresamente para otra instancia.

La reserva de STAN usa lock exclusivo y reemplazo atomico del archivo.
Una secuencia consumida no se reutiliza si falla el chip/cifrado/transporte.
Un lock abandonado por cierre abrupto exige revisar que no exista un escritor
activo antes de recuperarlo; el programa no lo elimina automaticamente.
No coordina secuencias entre PCs: cada estacion necesita un pool separado.

## Evidencia y pendientes delimitados

Correccion de privacidad posterior 2026-10-13: se elimina el KCV de la
respuesta de disponibilidad que cruza el IPC y de la pantalla de transacciones.
Se conserva solo la referencia documental y el estado de integracion. La
prueba de regresion comprueba que el resultado no contiene KCV ni su propiedad.

Revision adicional del recurso recibido: el .reg original estaba en
Y:/llavesCajeros.reg, equivalente al recurso e$ del host ATM. Actualmente su
lectura UNC falla con Win32 1326 (autenticacion); la busqueda en proyecto,
Downloads, Documents y Desktop no encuentra otra copia .reg. El puerto SMB
del host acepta conexion, lo que no acredita permiso para leer el archivo.
El destino criptografico Par_ip/Par_Port ya documentado, 10.10.30.6:4001,
no conecta en 2.5 segundos desde esta PC. El servicio del host ATM en 50200
tampoco conecta y no se lo presume un cifrador. No se transmiten comandos HSM.

Se revisa la guia local Generar las llaves para ATM para que funcione en Qa.docx:
describe AR01/AR02/AR05/AR25 para alta/activacion/eliminacion de llaves de usuarios
CMS; no identifica un cifrador PIN ni una clave para este perfil. La nota
llaves VTS.md identifica VSDC_MDK; no se adopta esa clave de otra funcion como
llave PIN del cajero. No se muestran sus valores ni se modifica SmartVista.
Reporte privado: artifacts/received-crypto-access-20261013.json.

Actualizacion posterior de la instancia real 2026-10-13: se reinicia con la
compilacion actual conservando userData y el perfil administrativo recuperado
ATM20521. Se guardan en la app destino documentado QA y plazos tecnicos de
conexion/respuesta 5000/30000 ms, sin modificar timeouts de proveedor/ISO.
Estos ajustes eliminan pendientes administrativos del emisor, pero no son
la vinculacion criptografica del perfil. El PIN de tarjeta aportado por el
usuario no se guarda ni convierte en clave TEST. La clave de cifrado y el
perfil financiero aprobados siguen siendo dependencias distintas.

Despues de corregir la lectura en cola, la app real obtiene identidad del
chip, selecciona la tarjeta y revisa saldo/ahorros/ATM20521. El IPC de
disponibilidad devuelve QA-ATM-PROVIDER-NOT-BOUND y Enviar permanece bloqueado:
no existe qa-execution-profiles.json ni credencial de clave TEST en userData.
Esta comprobacion usa Main de la instancia actual, sin mocks de IPC. No hubo
GENERATE AC, solicitud de PIN ni bytes financieros al Switch. La prueba de
enlace posterior recibe nuevamente 0800/071. No guardar el PIN aportado en
codigo, configuracion, fixture o evidencia; no se usa para fabricar una llave.

Verificacion posterior con la PC real, 2026-10-13: el Switch responde
0800/071 y PC/SC vuelve a leer la tarjeta terminada en 2267. La carpeta
userData usada por la instancia abierta contiene red/replay, pero su SQLite
tiene cero entidades/ATM y falta el archivo de ejecucion nueva. La pantalla
confirma Sin ATM activos; el proceso Main seguia iniciado el 2026-10-12.
Se corrige el texto fijo Switch sin configurar por Estado del enlace sin
comprobar: el shell no prueba el enlace y no debe diagnosticar configuracion
ausente mediante un texto literal. Estos resultados no son una consulta
financiera aprobada. Evidencia: artifacts/qa-consulta-current-status-20261013.json.

Pruebas unitarias cubren configuracion invalida/PROD, CVM/CDOL ausentes,
denial/AAC, cancelacion, perdida del lector, salida malformada, clave ausente,
cambios de perfil durante el dialogo y limpieza del PIN.
Integracion consume secuencias persistentemente sin duplicar ante concurrencia,
ejecuta cifrado TDEA real de Windows con credencial DPAPI sintetica y recorre
lectura simulada -> PIN simulado -> ARQC simulado -> ISO -> TCP local -> 0210/00.
Dos operaciones utilizan STAN 650101/650102, ATC 0001/0002 y nonces distintos.
Las claves, tarjetas, ARQC y servidor de esas pruebas son sinteticos.
No prueban autorizacion del Switch/Core real y no se instalan en userData.

La inspeccion de esta PC en esta entrega no encuentra el archivo de perfiles
de ejecucion ni el directorio de claves TEST protegidas. Las configuraciones
y exportes del host recibidos siguen siendo evidencia disponible; eso no
convierte automaticamente una clave cifrada del host en una clave usable por
DPAPI en esta PC. No se genero ni envio una consulta financiera QA en esta entrega.

TODO-DATA QA-LOCAL-TEST-BINDING: validar clave/referencia, algoritmo y encoding
de la zona TEST que el host aceptara. El export de Registro no demuestra ese
contrato local y no se extraen claves mediante secretos internos de una DLL.
TODO-DATA QA-EXECUTION-ACTIVATION: vincular UUID/revision de catalogo y perfil
aprobado, con pool reservado y fecha contable efectiva para el primer intento.
No se vuelven a pedir las fuentes ISO ni los parametros EMV ya recibidos.
TODO-DATA QA-VIRTUAL-CARD-SECURITY: contrato/llaves de tarjeta de TEST y reglas
aprobadas para seguridad EMV sin chip. Es independiente de crear varios ATM.

Fuentes: ContextoISO.xml y fuentes CB revisadas en
PROVIDED_CONFIGURATION_AUDIT.md/CB_205_BALANCE_SAMPLE.md, IL revisado de
AnsiPinEncrypt y los parametros efectivos documentados en
EMV_TERMINAL_PARAMETERS.md. El procesamiento acotado sigue EMV Book 3
6.5.5,10.4,10.5,10.7 y anexo C, de la especificacion original reproducida en
https://www.pciwatch.org/emvco/13285/book-3-application-specification/.
Custodia local: https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection.
