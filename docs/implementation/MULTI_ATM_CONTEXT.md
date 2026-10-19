# Contexto transaccional para varios ATM virtuales

## Reintento con certificado aportado, 2026-10-15

El usuario solicita volver a probar ambos perfiles y aporta
Y:/ATM_Imagenes_certificado/Certificado/root.cer. El certificado publico es
una CA autofirmada de asextreme.com, con vencimiento
2026-04-17T14:49:35Z. La comprobacion local devuelve UntrustedRoot y
NotTimeValid. No se modifica el almacen de confianza. La nueva consulta
SQL sigue fallando por CERTIFICATE_CHAIN_UNTRUSTED; este archivo no
resuelve la validacion del servidor SQL.

Se leen la tarjeta por contacto y los parametros AID/pais ya documentados,
y se invoca DesktopApplication.executeBalance una vez para cada ATM,
con requestId/lectura propios y los proveedores actuales. Resultado:

| ATM | Fin UTC | Resultado del motor | Trama / intento de transmision / bytes |
| --- | --- | --- | --- |
| ATM20521 | 2026-10-15T19:10:23.644Z | BLOCKED: QA-SEQUENCE-POOL | no / no / 0 |
| ATM20524 | 2026-10-15T19:10:33.146Z | BLOCKED: QA-DIRECT-PIN-KEY-BINDING y QA-EXECUTION-PROFILE-BINDING | no / no / 0 |

La tarjeta se lee correctamente en ambos intentos. El motor bloquea antes
de pedir PIN, generar AC o abrir el transporte financiero. No hay respuesta
del host ni STAN nuevo. Los bloqueos previos al envio no se agregan al diario
financiero por el comportamiento actual del servicio; el resultado completo
queda en artifacts/retry-two-profiles-20261015-country-result.json.

Continuan pendientes la reserva de secuencias y la vinculacion ISO directa
de ATM20524. Para consultar los metadatos actuales se necesita una cadena
de confianza vigente y correspondiente al servidor SQL. No se sustituye
la maestra CMS por la llave del enlace ni se inventan campos de ejecucion.

## Comparacion de los dos perfiles locales, 2026-10-15

Solicitud del usuario: comparar y probar ATM20521 y ATM20524. El catalogo
contiene exactamente esos dos ATM QA activos, ambos de la entidad 205 y
revision 1. La inspeccion actual no envia ninguna consulta financiera.

| Dato | ATM20521 QA | ATM20524 - TCS CMS - imagen 1054 |
| --- | --- | --- |
| Adquirente del catalogo | 60486901205 | 604869 |
| Destino ISO directo guardado | 10.60.0.11:16100 | 10.60.0.11:16100 |
| Perfil de ejecucion ISO | Configurado | Aun no vinculado; hay evidencia CMS |
| Secuencias reservadas disponibles | 0 | Sin pool de ejecucion |
| Ultima fecha/lote abierto observados en host el 14 de octubre | 2026-08-17 / 31 | 2024-07-25 / 4 |
| Custodia local | Llave TEST del enlace validada, DPAPI | Maestra CMS validada, DPAPI; distinta de la llave del enlace |
| Ultimo resultado financiero local | 0210/19, STAN 900103 | Ningun envio financiero registrado |

El adquirente de catalogo no es prueba de lo que debe codificarse en F32;
se conserva la discrepancia para validar su mapeo. La ruta directa comparte
endpoint y ya dispone de una llave de enlace comprobada para ATM20521. No
se solicita otra llave como si faltara material; falta validar y vincular
el perfil ISO de ATM20524, incluidos sus campos, secuencia y fecha contable.
No se sustituye ese trabajo copiando el perfil de ATM20521 y cambiando F41.

La consulta SQL parametrizada de solo lectura para contrastar ambos ATM,
lotes y candidatos de secuencia falla en validacion TLS del servidor el
2026-10-15T18:57:12.415Z. No se deshabilita esa validacion, no se confirma
disponibilidad de los candidatos, ni se modifica el pool local o la BD.
Las fechas de la tabla son evidencia anterior, no una lectura actual.

El usuario confirma que no dispone de la reserva ni de los valores aprobados.
Una inspeccion adicional identifica CERTIFICATE_CHAIN_UNTRUSTED en SQL.
Los CER recibidos corresponden a ASExtremeCA/Extreme y asextreme.com; no
establecen la identidad o cadena del servidor SQL consultado. No se instalan
certificados ni se debilita la verificacion. La comparacion termina sin
escrituras financieras; las dos nuevas consultas siguen pendientes.

TODO-DATA QA-TWO-PROFILE-EXECUTION: obtener reserva nueva para las dos
ejecuciones, confirmar los campos ISO/fecha contable de ATM20524 y recuperar
acceso verificable a CMS/Mediator o recibir esos valores aprobados.
Esta parte bloquea los nuevos envios; la comparacion queda en
artifacts/compare-atm-profiles-20261015.json, sin claves ni datos de tarjeta.

## Objetivo confirmado por el usuario

El simulador debe crear y operar varios cajeros mediante perfiles de software,
sin necesitar un ATM fisico por perfil. El cajero real disponible es una fuente
de configuracion/evidencia para validar inicialmente el recorrido; no una
dependencia permanente ni una alternativa al objetivo del producto.
Esto coincide con PRODUCT_SPEC.md y CARD_PROFILES.md.

Separar tres identidades: perfil del terminal ATM, contexto de tarjeta QA y
proveedor de seguridad. Un Terminal ID no identifica un lector fisico. Una
tarjeta leida por PC/SC es una fuente posible de contexto, no el modelo universal
de todos los cajeros. Un perfil virtual tampoco acredita seguridad financiera
si solo contiene UUID y datos administrativos.

## Implementacion 2026-10-13

Avance posterior: Main ya registra QaBalanceExecutionProvider para los perfiles
privados aprobados que existan al iniciar. Este backend concreto usa lectura
PC/SC, dialogo PIN nativo, cifrado TEST local protegido y primera AC nueva.
El backend de tarjeta virtual sin chip sigue dependiendo del contrato/llaves
EMV de TEST; no se sustituye con capturas. Ver QA_PIN_EXECUTION.md. Las
observaciones de backend pendiente mas abajo corresponden a la entrega inicial
del Router, previa a esta implementacion.

QaBalanceContextRouter implementa BalanceContextProvider e inicializa Main
con un proveedor concreto de seleccion por ATM, en lugar de omitir el parametro
del servicio de saldo. Los bindings son internos de Main y fijan UUID/revision
ATM, Terminal ID, destino QA y proveedor. No consultan PC/SC ni exigen un
ATM fisico. Cada perfil puede utilizar un proveedor independiente.

El Router solo enruta QA/consulta/ahorros. Exige coincidencia exacta de perfil,
revision, terminal y endpoint; PREPROD, destino cambiado o tarjeta/contexto
de otra operacion no se delegan como si pertenecieran a la instancia.
Una entrega tras cancelacion o con contexto incompatible se borra/libera.
No registra ni entrega tramas al Renderer.

Main crea el Router, pero todavia no registra un backend financiero real.
El bloqueo ahora identifica QA-ATM-PROVIDER-NOT-BOUND del perfil concreto.
Esto no declara que fuentes, cifrado del host o parametros EMV no se recibieron.

## Prueba realizada

Integracion del Router con BalanceInquiryService, NewVisaBalance y
BalanceTcpTransport en un servidor TCP 127.0.0.1 de puerto temporal:

| Perfil sintetico | STAN sintetico | Resultado local |
| --- | --- | --- |
| ATM20521 | 650101 | 0210/00, correlacion terminal/STAN/RRN |
| ATM20522 | 650102 | 0210/00, correlacion terminal/STAN/RRN |

Se generan dos requests con referencias distintas y diario separado, sin
lector o cajero. Datos de tarjeta/PIN/EMV y servidor son sinteticos. Los nombres
de terminal pertenecen a la prueba y no prueban alta de esos terminales reales
en el Switch. Escrituras financieras QA: cero. No es una certificacion de
tarjeta virtual ni una consulta real aprobada por SmartVista/Core.

Unitarios adicionales: seleccion por ATM, proveedor ausente, aislamiento de
revision/terminal/destino/ambiente, duplicados, cancelacion tardia y respuesta
de otro contexto. Se conserva la validacion del motor y el transporte existente.

## Primera prueba financiera real pendiente

TODO-IMPLEMENTATION QA-ATM-PROVIDER-BINDING: integrar y registrar el backend
real del primer perfil. No reemplazarlo por el proveedor sintetico de tests.
Debe producir PIN/EMV nuevos y adquirir contexto/serial de la instancia.
La configuracion recibida constituye la fuente para esa implementacion.

TODO-IMPLEMENTATION QA-CARD-PROFILE-SOURCE: completar seleccion y almacenamiento
protegido de perfiles de tarjeta QA, ademas de la lectura fisica opcional.
La UI actual de saldo todavia selecciona identidad mediante lector. Esta
entrega del Router no agrega un catalogo de tarjetas virtuales ni certifica
su seguridad; esa limitacion se mantiene explicita.

La opcion remota de cifrado permite conservar SafeNet en el host existente;
no requiere instalarlo en la PC o un ATM fisico por instancia virtual. Su
puente no esta implementado/desplegado, y no sustituye generacion EMV.
Ver QA_REMOTE_PIN_OPTIONS.md y PROVIDED_CONFIGURATION_AUDIT.md.

El catalogo local inspeccionado anteriormente no contenia perfiles ATM. No
se crean perfiles activos del usuario con datos sinteticos ni se elige el
terminal de una captura para enviar sin validar su vinculacion a la instancia.
