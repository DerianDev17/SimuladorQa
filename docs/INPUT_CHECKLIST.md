# Checklist de informacion por subir

## TODO-DATA activos de la primera entrega

Estado actual CB 205 (2026-10-08): recibida captura de consulta y retiro con
ambos enlaces 16100/49212 y pares XML. Consulta reconstruida y enviada una vez
desde la PC: 0210/F39 91; llegada a SmartVista y Mediator confirmada por el
usuario. TraceId 31580471 devuelve RetCode 8908, WS, PROCESADOR NO RESPONDE,
MappedRespCode 10096. No falta volver a demostrar apertura TCP ni aportar
otra muestra de consulta CB. El log adicional muestra una espera AUTHTD/AUTHTD
de 15.001 segundos (13:04:37.544-13:04:52.545), RC=8908.
Emisor identificado: PROXY205 en Mediator 172.60.60.156. AUTHTD registra la
transaccion vencida y EXTREMELOG un error de recepcion del WS a las 13:04:59.716.
TODO-DATA CB-PROCESSOR-ERROR: configuracion/ruta AUTHTD y evento WS completo
con StackTrace/InnerException/entidad para correlacionar con ADPCOREGEN/Core.
El adjunto ClearDeamonNet tiene cuatro claves ausentes, sin vinculo probado
con la consulta; no sustituye el stack del error WS.
Faltan UTRNNO nuevo y confirmacion de relojes, reglas de generacion de nuevos
mensajes, PIN/HSM/EMV y sesiones prolongadas/coexistencia. Ver
`docs/protocols/CB_205_BALANCE_SAMPLE.md`. Las notas de admision siguientes
corresponden a ventanas anteriores; esta actualizacion prevalece para consulta CB.

Actualizacion de gestion ATM QA (2026-10-08 17:12:32 UTC): la PC ya recibe
0800 / codigo 071 / STAN 481360, 60 bytes completos, sin transmitir. Las
capturas anteriores contienen 072 y no contienen 0810. La denegacion por
direccion registrada antes es historica; en esa revision faltaba sesion
financiera/coexistencia, no
demostrar otra vez apertura TCP. Ver `docs/protocols/VISA_NETWORK_MANAGEMENT.md`.

Los logs posteriores entregados por el usuario confirman autorizacion de la PC
y asociacion al PID 80131 en ese intento. El cierre fue observado como recv=0,
coherente con el probe que cierra tras el primer frame, antes del timer de 30 s.
El balanceador 172.60.60.171 es rechazado 713 veces en la ventana 12:00-12:26;
falta coexistencia/configuracion de prueba, no identificar nuevamente el PID.
Hasta esa revision no se habia enviado request financiero; sigue pendiente
una regla F39 para la respuesta de gestion 071.

- **TODO-DATA VISA-NETWORK-RESPONSE-POLICY / VISA-NETWORK-RESPONSE-WIRE**: construccion offline 0810 implementada con F39 obligatorio, sin default ni respuesta automatica. El modulo proveedor asigna NetResponse, no fija 00. Usuario no conoce la regla para 072; la solicitud actual es 071. Faltan significado/politica de ambos codigos, par real y criterio de sesion lista. Bloquea solo respuesta automatica y veredicto de sesion, sin impedir inspeccion ni diagnostico TCP.

Actualizacion de fuente ATM Coonecta (2026-10-08): SWATM01 en ADQCLONE
172.60.60.152 usa PKT_VISA / ISO8583MsgFormat y el archivo
E:\ExtremePCI\configfiles\ISOBASEI.BIN; inicia CALL a SmartVista 16100.
172.60.60.171 fue corregido por el usuario como balanceador. PROXY205 en
Mediator 172.60.60.156 muestra LISTEN con parametros 10.60.0.11 / 49212.
ISOBASEI.bin recibido e inspeccionado: 12 campos de cabecera, 128 posiciones,
27 MTI y encoding BCD/EBCDIC/BINARY contrastado con el modulo de formato.
Falta validar detalles wire y comprobar el camino de salida/coexistencia
antes de ejecutar desde ADQCLONE. Ver `docs/protocols/ISOBASEI_REVIEW.md` y
`docs/implementation/SWITCH_NETWORK_EVIDENCE.md`.

- **TODO-DATA ISO-SPEC**: recibidos ContextoISO.xml de BANRED e ISOBASEI.bin de SWATM01 Coonecta. Inspector offline lee todos los registros de ISOBASEI y excluye defaults; encoding contrastado con GetStrType del formatter. Consulta CB valida cabecera, bitmap y longitudes/prefijos de sus campos; faltan otros perfiles, reglas dinamicas, PIN/HSM y negocio. No falta recibir otra vez el diccionario ni la muestra de consulta. Ver `docs/protocols/ISOBASEI_REVIEW.md` y `docs/protocols/CB_205_BALANCE_SAMPLE.md`.
- **TODO-DATA CMS-ATM-MAPPING / CMS-XML-CONTRACT / CMS-RESULT-MAPPING**: recibido Extreme Mediator CMS v3.6 para XML/REST Mediator-Core. Falta validar su correspondencia con ATM, las diferencias tablas/ejemplos y los codigos por canal; no sustituye ISO-SPEC. Conflictos y solicitudes registrados en `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- **TODO-DATA CMS-REVERSAL / CMS-CORRELATION / CMS-TRANSPORT / CMS-POS-MAPPING**: el manual lista familias MTI y campos Core, pero faltan la seleccion del reverso, reglas de correlacion, contrato REST y resolucion de diferencias POS. Bloquean solo sus adaptadores/reglas dependientes.
- **TODO-DATA SWITCH-ATM-ACCESS / SWITCH-ATM-FRAMING / CMS-TRANSPORT**: entrada ATM y enlace Mediator recibidos; consulta desde PC confirmada hasta Mediator. Faltan sesiones prolongadas/coexistencia, perfiles ISO generales, TLS/timeouts/conexiones y contrato HTTP/XML/unidad del timeout Core 20000. RetCode 8908 requiere log del procesador para precisar su causa. Ver `docs/core/MEDIATOR_ENTITY_205_ROUTING.md`; el perfil SQL PREPROD existente no cambia.
- **TODO-DATA GOLDEN-SAMPLES / PCAP-CASE-MAPPING**: recibidos diez PCAP, con 218 envolventes BANRED reconstruidas byte a byte. Falta identificar/aprobar request/response de cada flujo MVP y correlacionar originales/reversos. Bloquea validacion de campos, codigos de respuesta y resultados de negocio. Ver `docs/protocols/PCAP_REVIEW.md`.
- **TODO-DATA PCAP-LINK-PROFILES**: BE16 inclusivo/header/bitmap confirmados solo para enlace capturado 4946. Usuario identifico roles/QA de enlaces actuales 16100 y 49212; no certifica el perfil de sus PCAP. Persisten framing/diccionario, validacion de capturas completas y explicacion de solapamientos. No se aplica 4946 automaticamente a ATM.
- **TODO-DATA ENVIRONMENT**: entrada ATM QA, autorizacion en PID 80131 y consulta desde PC confirmadas hasta Mediator. Faltan sesiones prolongadas/coexistencia, otros perfiles, TLS, limites y timeouts por escenario. PREPROD tiene configuracion independiente. Bloquea solo los transportes/envios dependientes.
- **TODO-DATA PROFILES**: faltan ATM y tarjeta completos/validados. Bloquea configurar ejecuciones reales; el shell desktop y la seleccion de ambiente funcionan de forma independiente.
- **TODO-DATA AMOUNT-RULES**: faltan moneda, limites, monto minimo/maximo, denominaciones y reglas por cuenta/escenario para retirar. El borrador solo valida la sintaxis decimal del manual; no aprueba elegibilidad financiera.
- **TODO-DATA ENTITY-CLASSIFICATION**: ENTITY_MODEL propone red/membresia separadas y ENTITY_TEMPLATE mezcla FRONT/BACK/EXTERNA/BANRED como Tipo. Se solicito validacion; el CRUD usa los campos comunes y difiere membresia, BIN/Core y deteccion automatica de escenarios.
- **TODO-DATA HARDWARE**: falta prueba PC/SC en Windows con OMNIKEY 5422. Bloquea lectura fisica; no se presume lector conectado.
- **TODO-DATA OBSERVERS**: faltan SQL/API y reglas de correlacion aprobadas de SmartVista/Core. Consulta Journal/Message aportada por el usuario e implementada para Mediator; no completa validacion de resultados ni SmartVista.
- **TODO-DATA MEDIATOR-OBSERVER-ACCESS / MEDIATOR-JOURNAL-CORRELATION**: implementada consulta acotada PREPROD por TraceId a partir del SQL del usuario (2026-10-07). Falta cuenta de lectura, TLS con CA/nombre aprobado, mapeo entidad/canal y correlacion con ISO/runId/transactionId. La prueba segura actual devuelve TLS_ERROR, sin autenticar ni leer registros. Ver `docs/implementation/MEDIATOR_OBSERVER.md` y ADR-009; ADR-006 sigue limitado a metadatos.
- **TODO-DATA MEDIATOR-SQL-TIMEZONE / MEDIATOR-MESSAGE-PROJECTION**: confirmar zona de fechas SQL y aprobar allowlist de valores XML visibles. La consulta conserva hora SQL sin inferir UTC y protege todos los valores XML.
- **TODO-DATA LOAD-LIMITS**: faltan limites/ventanas autorizadas y gate funcional de los cinco flujos. Bloquea carga y estres.

La documentacion describe los flujos, pero no aporta evidencia suficiente para ejecutarlos.

Actualizacion de acceso ATM QA (2026-10-07): TCP 16100 ya conecta desde la PC,
pero el extremo responde NO AUTHORIZATION y cierra incluso sin enviar trama.
En ese momento SWITCH-ATM-ACCESS quedo pendiente de autorizacion/asociacion al PID. El bloque
del servidor aportado el 2026-10-08 confirma origen 10.10.10.21 y cierre por
direccion invalida tras find_device_using_address; ya no falta identificar el
peer visto. No es un bloqueo de apertura TCP general. El usuario no encuentra
el intento de captura en los monitores. Ver `docs/implementation/QA_CAPTURE_REPLAY.md`.

Nueva evidencia VCP Lite 450 Diebold: PCAP y 39 logs de 11:00-12:00. El log VISA
lee cuatro bytes de cabecera e ignora la longitud configurada; 262 envolventes
de 16100 se reconstruyen sin residuo. Se localiza retiro USD 20, STAN 001391,
y dos reversos emparejados con sus originales. ISO-SPEC permanece pendiente.
Los logs enrutan al PID 82032; la asociacion inicial con Mediator 49212 fue
corregida el 2026-10-08: 82032 figura en 49276 y el usuario confirma CB 205 como
82052 / 49212. Ese PCAP no contiene payload financiero en 49212. El bloque
horario de nuestra denegacion ya fue recibido y confirma rechazo por direccion.
La muestra ATM propia de CB fue recibida despues; consulta probada desde PC
y error del procesador documentados en `docs/protocols/CB_205_BALANCE_SAMPLE.md`.
El retiro no se envio. Ver `docs/protocols/VCP_LITE_450_REVIEW.md` y
`docs/protocols/QA_SWITCH_ADMISSION_REVIEW.md`.
El manual recibido aporta reglas parciales de Mediator/Core: no se considera trama ATM ni mock aprobado.
Ver `docs/implementation/BOOTSTRAP.md` para el alcance ya implementado.
El CRUD local de entidades/ATM funciona con configuracion en borrador; no completa ni valida automaticamente los items del checklist. Ver `docs/implementation/LOCAL_CATALOGS.md`.

## Checklist de desarrollo completado

Estos checks registran implementacion local. Los checks P0/P1 siguientes son
datos/evidencia externos y solo se marcaran al recibirlos y validarlos.

- [x] Shell Electron seguro, TypeScript strict y navegacion.
- [x] Codec acotado de consulta VISA 301000 capturada, reconstruccion exacta, metadatos protegidos y pruebas TCP locales; intento unico QA confirmado hasta Mediator con error del procesador documentado. Generacion de nuevos mensajes pendiente.
- [x] Codec acotado de gestion VISA 071/072 y construccion offline 0810 con F39 explicito; probe QA solo lectura con UUID/UTC/STAN, limites y errores protegidos. Politica de respuesta/sesion real pendiente.
- [x] Seleccion QA/PREPROD persistida y auditoria de cambios; PROD bloqueado.
- [x] CRUD de entidades/ATM en SQLite mediante Worker, con version y auditoria.
- [x] Revision del mockup y matriz de evidencia CMS para las cinco transacciones.
- [x] Catalogo de saldo/retiro CMS por ahorros/corriente con fuente y pagina.
- [x] Pantalla de preparacion con los cuatro pasos y tres paneles del mockup.
- [x] Seleccion ATM del ambiente y revision en Main de version/estado/entidad.
- [x] Validacion de entradas y monto decimal de borrador, sin almacenar tarjeta.
- [x] Contexto invalidado al cambiar ambiente, editar o recargar perfiles.
- [x] Estados vacios y envio/RAW/HEX/reversos bloqueados por evidencia pendiente.
- [x] Plantillas documentales por cuenta y requisitos de monto/original visibles al seleccionar el flujo.
- [x] Feedback de monto en vivo y checklist de entradas locales separado de evidencia pendiente.
- [x] Resumen de revision desde Main con UUID/UTC; invalidado al editar contexto.
- [x] Borrador conservado al navegar en la sesion y boton Limpiar borrador.
- [x] Casos DRAFT persistentes QA/PREPROD, referencias documentales, carga con revalidacion ATM, borrado/auditoria y migracion SQLite v1 -> v2.
- [x] Conexion autenticada e inspeccion de metadatos de Mediator PREPROD, con excepcion TLS puntual autorizada.
- [x] Compatibilidad de Terminal ID/codigo en revision Main, sin truncado ni extrapolar el esquema a QA.
- [x] Credencial pass.txt y artefactos privados excluidos de Git; sin acceso desde Renderer.
- [x] Inventario de los diez PCAP, hashes y reporte sanitizado; originales excluidos de Git.
- [x] Framing incremental BE16 inclusivo y codec de envolvente BANRED con bitmap de 128 bits.
- [x] Reconstruccion offline byte a byte de 218 mensajes; errores de longitud/fuente incompleta controlados.
- [x] Vista de evidencia de capturas en transacciones sin exponer campos, RAW ni endpoints.
- [x] Composicion visual del mockup compactada: navegacion, cabecera, pasos/recorrido, inspector tabular e historial/metricas.
- [x] Requisitos/CMS/PCAP separados del area de operacion; estados reales y codigos del manual conservados.
- [x] Historial con filtros parametrizados Journal/Message PREPROD, bigint como string, limites, errores/timeout y estructura XML protegida fuera del Renderer; acceso real pendiente de TLS/cuenta.
- [x] Configuracion muestra evidencia privada de red por ambiente, con destino ATM/PID/peer y pendientes; Main valida archivo acotado, sin sockets ni habilitar envio.
- [x] Puerto/emisor de captura QA con un write tras conectar, validacion, deadlines, cierre y metricas sin contenido; pruebas TCP locales. No habilita envio general ni genera campos ISO. Ver `docs/implementation/QA_CAPTURE_REPLAY.md`.
- [x] Envolvente VISA VCP Lite implementada fuera del Renderer: cuatro bytes, cuerpo BE16, extension opaca, fragmentacion y fuente truncada; 262 frames reconstruidos identicos. Caso USD 20 / STAN 001391 preparado offline conservando campos originales; admision de PC y generacion ISO pendientes.

Detalle y pruebas: `docs/implementation/TRANSACTION_PREPARATION.md`.

## P0 - Bloqueante para primer flujo real

- [x] `ContextoISO.xml` recibido en Simulador Banred; alcance legacy BANRED. Correspondencia con ATM 16100 pendiente.
- [x] `ISOBASEI.bin` de SWATM01 Coonecta recibido y sus secciones/parametros inspeccionados offline; validacion wire/casos pendiente.
- [ ] Especificacion ISO ATM Coonecta.
- [ ] Trama consulta saldo request/response aprobada.
- [ ] PCAP consulta saldo.
- [ ] Trama retiro aprobado request/response.
- [ ] PCAP retiro aprobado.
- [ ] Trama retiro rechazado request/response.
- [ ] Trama reverso request/response + original.
- [ ] PCAP reverso.
- [ ] Evidencia timeout + reverso.
- [x] Host/puerto de entrada ATM QA aportado con PID/netstat; acceso desde PC y perfil/escenarios pendientes.
- [ ] Host/puerto PREPROD por escenario.
- [ ] Regla VLI/header/encoding.
- [ ] Timeout oficial por escenario.
- [ ] Moneda y reglas financieras del monto aprobadas por cuenta/escenario.
- [ ] Al menos un ATM QA completo.
- [ ] Al menos una tarjeta QA funcional.

## Fuentes recibidas y validacion pendiente

- [x] Proyecto Simulador Banred revisado estaticamente: EXE/PDB .NET, ContextoISO.xml y 15 logs. Rol servidor 4946 confirmado; 12 pares echo y un par financiero recorridos con el diccionario sin residuo, otros dos eventos no reconocidos. No es cliente ATM ni evidencia Core CB. Ver `docs/protocols/BANRED_SIMULATOR_REVIEW.md`.
- [x] Logs tcpcomms01.out / nwint00_22150.out del 8 de octubre y bloque contemporaneo de la PC: listener/cajero autorizados, origen PC 10.10.10.21 rechazado como direccion invalida tras busqueda de dispositivo. Usuario confirma CB 205 = PID 82052 / 49212 y alcance exclusivo CB. Muestra USD 20 de 82032 apartada; admision ATM QA para PC y request ATM propio de CB pendientes. Ver `docs/protocols/QA_SWITCH_ADMISSION_REVIEW.md`.
- [x] Mockup `mockup.png`, revisado: `docs/mockups/MOCKUP_REVIEW.md`.
- [x] Manual local Extreme Mediator CMS v3.6 (24 paginas, revision 13-04-2023).
- [x] Matriz de evidencia para los cinco flujos: `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- [x] Prioridad de 301000/302000 del documento sobre 310000 del mockup: usuario indico seguir el documento el 2026-10-06. No valida por si sola el formato de la trama ATM.
- [x] Filas/captura USR_RelationEntity de entidad 205 CB Cooperativa, canales 1/21, destino HTTPS QA y timeout observado 20000; entrada por Switch/SmartVista confirmada, contrato pendiente.
- [x] Par XML de MDT_Message.msgRequest/msgResponse aportado para retiro de USD 10, entidad 205/canal 1, con respuesta que reporta exito; etapas de registro, cambio de TraceId, fecha contable y contrato pendientes. Ver `docs/core/MEDIATOR_ENTITY_205_MESSAGE_SAMPLE.md`. No es fixture ATM aprobado ni la prueba de USD 20.
- [x] Diez PCAP recibidos e inspeccionados; matriz y metodo en `docs/protocols/PCAP_REVIEW.md`.
- [x] Encapsulado observado del enlace 4946 confirmado en 218 mensajes: BE16 inclusivo, header 12, MTI ASCII y bitmap ASCII hex de 128 bits.
- [ ] Validacion del ambiente, roles de enlaces y mapeo de capturas a cada caso MVP.
- [ ] Mapeo aprobado ATM ISO -> Mediator XML por escenario/cuenta/canal.
- [ ] Contrato XML aprobado o XSD y export request/response emparejado, sin errores de ejemplo.
- [ ] Mapeo de RetCode/CodigoProceso/MappedRespCode a RC ATM; tratamiento parcial.
- [ ] MTI de reverso, campos originales y flags; timeout, duplicados y late response.
- [ ] Generacion/eco de TraceId y TerminalSeq; relacion con STAN/RRN/UTRNNO.
- [ ] Contrato REST y mecanismo read-only de consulta Core autorizado.

Estos items no modifican el estado de las tramas ATM/PCAP pendientes del P0.

## P1 - Necesario para completar MVP

- [ ] Listado de entidades Coonecta.
- [ ] FRONT/BACK/EXTERNAS.
- [ ] BIN ranges.
- [ ] Catalogo ATM QA.
- [ ] Catalogo tarjetas QA.
- [ ] Response codes.
- [ ] Reglas PIN Block/HSM de TEST.
- [ ] SQL/vistas SmartVista de consulta read-only.
- [ ] Ejemplo de transaccion localizada en SmartVista.
- [ ] Core de cada entidad.
- [ ] Metodo de acceso Core.
- [ ] Query/API de correlacion Core.

## P1 - Hardware

- [ ] OMNIKEY 5422 conectado.
- [ ] Nombre PC/SC del reader.
- [ ] Driver/version.
- [ ] ATR/ATS de tarjeta de prueba.
- [ ] Evidencia de lectura disponible.

## P2 - Carga/estres

- [ ] TPS permitido QA.
- [ ] TPS permitido PREPROD.
- [ ] Max conexiones.
- [ ] Ventanas autorizadas.
- [ ] Limites de Switch.
- [ ] Limites de Core.
- [ ] Politica de parada por error.

## Mock BANRED

Subir preferentemente como ZIP o archivos sueltos:
- [ ] Manual_Mock_BANRED_SVFE_BASE24.docx
- [ ] mock_banred_tcp.py
- [ ] mock_banred_tcp_V1.0_4946.py
- [ ] mock_banred_tcp_8007_falla.py
