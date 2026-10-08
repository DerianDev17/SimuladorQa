# Revision de Extreme Mediator CMS v3.6 para el simulador ATM

## Fuente y alcance

Fuente local: `Docs tecnicos/Extreme MediatorII Message Interface CMS v3.6 (1).pdf`.
Documento Tecnico Extreme Mediator Message Format Interfaces CMS, RTC Coonecta,
24 paginas. El historial de cambios identifica v3.6 con fecha 13-04-2023 (p. 3).
SHA-256: `C335C64DFA9CE10AAEEC72F5E29576846488602406589D08ED0F51E6386CFDC4`.

Adjunto adicional revisado el 2026-10-08:
`Extreme MediatorII Message Interface CMS v3.6.2 4 1 1.pdf`, 24 paginas,
SHA-256 `928466324816ced446af2b5b63e7b5f3196a496343b4c68168969b3ca66a74d5`.
Su historial interno tambien identifica version 3.6 / 13-04-2023. Las tablas
financieras de las pp. 16-19 fueron comprobadas visualmente; el nombre del
archivo no prueba una revision normativa 3.6.2.

Correccion implementada: el observador reconoce los campos completos y las
variantes de nombre de tablas/ejemplos, conserva tipos documentados observados
y muestra mandatorios ausentes sin publicar valores. Request: 13 mandatorios
Header + 13 Data, 5 opcionales Header + 23 Data. Response: 13 mandatorios
Header + 8 Data y MsgErr opcional. Implementacion y limites:
`docs/implementation/MEDIATOR_OBSERVER.md`.
El reconocimiento de variantes en la inspeccion no aprueba un nombre/tipo de
salida para un futuro emisor ni resuelve la discrepancia de las fuentes.

Revision realizada el 2026-10-06: texto de las 24 paginas y comprobacion visual de
las convenciones, formatos, interfaz financiera y tablas de las pp. 4-5 y 16-24.
La tabla de MTI de p. 23 es una imagen: la extraccion de texto sola no la recupera.
El original contiene una restriccion de confidencialidad (p. 1); se conserva local,
excluido de Git. Esta revision no copia cuentas, identificaciones, tokens ni las
tramas completas de ejemplo.

El objetivo del manual es integrar Extreme Mediator con los sistemas centrales
de las entidades (p. 4). Define XML de entrada/salida sobre API REST. Sus tablas
incluyen ATM/POS y CMS, pero no constituyen el contrato de transporte ISO/TCP
entre el simulador ATM y SmartVista.

Estado: **evidencia documental recibida para la interfaz Mediator/Core**.
No habilita envio ATM, debitos directos al Core, PIN/HSM ni golden samples.
Los adaptadores Core del MVP siguen siendo observadores de solo lectura.

Actualizacion 2026-10-07: el usuario aporto un par XML de retiro de USD 10
para entidad 205/canal 1, extraido de MDT_Message.msgRequest/msgResponse.
Aporta campos/resultados observados y diferencias
de TraceId, raiz de respuesta, importes y fecha contable. Ver
[revision de la muestra](../core/MEDIATOR_ENTITY_205_MESSAGE_SAMPLE.md).
Las etapas de registro y el contrato siguen pendientes; no habilita envio ATM
ni acredita la prueba solicitada de USD 20.

Decision del usuario el 2026-10-06: **seguir lo que dice el documento** ante la
diferencia de saldo con el mockup. El catalogo funcional tomara 301000 para ahorros
y 302000 para corriente; 310000 de la imagen queda descartado como referencia.
Esto resuelve la prioridad visual/documental. El formato ISO ATM y su mapeo de
campos siguen requiriendo diccionario y tramas aprobadas.

## Reglas documentadas y limites de uso

| ID | Regla en la fuente | Pagina | Uso permitido en el proyecto |
| --- | --- | --- | --- |
| CMS-01 | Mensajeria XML por API REST; un String de entrada y otro de salida | 4 | Disenar un adaptador especifico; faltan endpoint, verbo HTTP, envoltura, autenticacion y TLS |
| CMS-02 | Header, Data y FxTable; ejemplos financieros con ExtremeMsg/ExtremeMsgReply, HField/DField y atributos name/value/type | 5, 16, 18-19 | Describir estructura XML; no tratarla como bitmap ni framing ISO |
| CMS-03 | Tipos b/i8/i16/i32/i64/f/d/t; M mandatorio, O opcional | 4 | Referenciar tipos del proveedor, separados del dominio |
| CMS-04 | Importes/saldos con dos decimales y punto | 4 | Regla de representacion CMS; faltan redondeo y limites. No usar floats JS para contabilidad |
| CMS-05 | Request con RetCode 999; respuesta 0 exitosa | 5 | Interpretar RetCode dentro del contrato CMS; no convertir automaticamente a F39 |
| CMS-06 | MsgType 1 normal, 2 reverso; Reverse booleano | 17, 19 | Dos campos distintos; no inferir su combinacion, eco ni equivalencia con MTI |
| CMS-07 | TraceId Long unico; TerminalSeq long unico por terminal | 16-17, 19 | Identificadores externos separados de runId/transactionId UUID; generacion y relacion con STAN pendientes |
| CMS-08 | AccountId1/2: 10 ahorros, 20 corriente, 30 credito; AccountNum1 debitos, AccountNum2 creditos/depositos | 17 | Catalogo de cuenta CMS; las reglas por operacion y correspondencia ISO quedan pendientes |
| CMS-09 | Canal ATM 1, BNRD 12, CMS 21 | 20 | Catalogo ChannelId; no confundirlo con RedOrigen ni seleccionar BNRD automaticamente por escenario |
| CMS-10 | RedOrigen: 00 ATM local, 01 Maestro, 02 BANRED, 03 Visa, 04 intra-entidades, 05 chequera, 21 CMS | 17 | Catalogo del proveedor; mapeo LOCAL/RTC/BANRED/EXTERNAL pendiente de aprobacion |
| CMS-11 | Moneda 840 dolares; Pais 218 Ecuador; TipoComercio 6011 ejemplo ATM | 17 | Datos documentados, no valores fijos para todas las redes/ambientes |
| CMS-12 | Valor de reverso parcial descrito como ValueTrn original menos ValorParcial | 17 | Evidencia de reverso parcial Core; no define F90, MTI, idempotencia ni caso de timeout |
| CMS-13 | RetCode 10: OK con autorizacion parcial; ValorDebitadoParcial mayor a cero indica parcial | 19 | Mostrar resultado parcial separado; no asumir retiro completamente aprobado ni dispensacion |
| CMS-14 | Request financiero obligatorio: identificacion/origen/canal/moneda/pais/lugar/EsPos/TipoComercio, ReferenceNumber e Impreso | 17-18 | No replicar datos personales en UI/logs. Los campos y su obligatoriedad por escenario requieren contrato aprobado |

El Header financiero obligatorio de las pp. 16-17 comprende TraceId, EntityId,
EntityIdDest, ChannelId, RealDate, TerminalID, TerminalSeq, MsgType, TrnCode,
ValueTrn, BussDate, RetCode y Reverse. AccountId1/2, AccountNum1/2 y SubTrnCode
figuran como opcionales en la tabla: eso no prueba que un retiro sin cuenta sea
valido. Los IDs numericos EntityId/EntityIdDest del proveedor no son los UUID del
catalogo local ni una conversion automatica de su campo code.

La respuesta financiera enumera CodigoProceso, Mensaje, FechaContable, SaldoTotal,
SaldoDisponible, ValorDebitadoParcial, Mensaje de Retorno y MappedRespCode como
mandatorios, y MsgErr opcional (p. 19). Faltan las condiciones de presencia ante
rechazo, reverso y error tecnico. Conservar codigos separados y representar dato
ausente como ausente; nunca inventar saldo cero ni exito para completar una tabla.

## Matriz de los cinco flujos MVP

Los siguientes son **codigos de la tabla del manual**, no templates ATM aprobados.
No se trasladan a F3 hasta validar el mapeo con la especificacion ATM y tramas QA.

| Flujo | Evidencia del manual | Falta para ejecutar ATM |
| --- | --- | --- |
| Consulta de saldo | TrnCode 301000 ahorros, 302000 corriente (p. 20), priorizados por el usuario sobre el mockup; 311000/312000 consulta impresa (p. 21); saldos en respuesta (p. 19) | Confirmar representacion en F3 por red, campos ISO, regla de monto y respuesta/PCAP QA |
| Retiro aprobado | TrnCode 011000 ahorros, 012000 corriente, 013000 avance credito, 014000 cuenta universal (p. 20); ValueTrn mandatorio (p. 17) | Seleccionar variantes MVP, solicitud ATM, PIN/F55, aprobacion total/parcial y evidencia del debito |
| Retiro rechazado | Mismo catalogo de retiro; CodigoProceso 51 fondos insuficientes, 15/16/17 problemas de cuenta (p. 19) | Condicion QA reproducible, catalogo ATM y mapeo de RetCode/CodigoProceso/MappedRespCode a F39; no existe un processing code especial de rechazo documentado |
| Reverso | MsgType 2 (p. 17); ValorParcial (p. 17); tabla MTI con 0400/0410 y 0420/0421/0430 (p. 23) | Elegir familia por canal; F90, snapshot original, STAN/RRN/TraceId, flags y politica de duplicados |
| Reverso por timeout | No hay timeout, retries ni politica de respuesta tardia definidos | Tiempo por ambiente, disparador, reverso unico, late response, evidencia original/reverso y resultado Core |

La p. 23 lista tambien 0100/0110 autorizacion, 0120/0121/0130 avisos de
autorizacion, 0200/0210 financieros, 0220/0221/0230 avisos financieros y
0800/0810 gestion de red. Es una clasificacion; no indica el MTI requerido para
cada uno de nuestros flujos. El ejemplo XML usa MTI 200 (p. 16); no permite decidir
si el adaptador debe emitir 200 o 0200, ni el encoding en el enlace ATM.

Consulta de clientes por cuenta, nombre o identificacion (pp. 6-15 y p. 21,
310010/310020/310030) es otra operacion. No reemplaza la consulta de saldo y no
amplia automaticamente el alcance MVP. Debito por CMS 310040 tampoco es un retiro
ATM (p. 21).

## Codigos de resultado: namespaces separados

| Campo/contexto | Evidencia | Regla de revision |
| --- | --- | --- |
| Header.RetCode | 999 request; 0 exito (p. 5), 10 parcial (p. 19) | No igualar al RC ISO de dos caracteres |
| Data.CodigoProceso | 00 OK, 15 cuenta cerrada, 16 bloqueada, 17 inexistente, 51 fondos insuficientes (p. 19) | Solo semantica documentada de este campo; no catalogo ATM completo |
| Data.MappedRespCode | Codigo mapeado (p. 19); ejemplo valor 0 | Falta origen, destino y tabla de mapeo; no normalizar 0 a 00 sin regla |
| ChannelId 21 | 0, 15, 16, 17, 51, 96, 9080, 82 (pp. 23-24) | Catalogo condicionado a CMS: no aplicarlo indiscriminadamente a ATM |
| ChannelId 1 | Referencia a codigos del estandar ISO8583 para ATM/POS (p. 24) | Falta catalogo/version/perfil Coonecta aprobado; no importar una tabla generica |

Los codigos 9080 y 82 pertenecen a busquedas de clientes. El 96 se describe como
error de sistema/proceso Core. Este manual no confirma el 91 como timeout ATM ni
que un timeout local de transporte deba producir un RC determinado.

## Conflictos y TODO-DATA registrados

La prioridad del documento sobre 310000 del mockup fue **resuelta por el usuario**.
Los contratos y mapeos tecnicos de la tabla siguen **pendientes de validacion**.

| TODO-DATA | Conflicto o vacio | Evidencia | Bloqueo acotado |
| --- | --- | --- | --- |
| CMS-ATM-MAPPING | Mockup: saldo 310000; manual: 301000/302000. Usuario instruye seguir el documento el 2026-10-06; prioridad resuelta. Falta contrato de campos ATM | mockup.png, p. 20, respuesta expresa del usuario | Usar catalogo del manual; confirmar serializacion F3 y template ATM con diccionario y fixture |
| CMS-XML-CONTRACT | TerminalId en ejemplos frente a TerminalID en tablas; Pais frente a Pais con tilde; ComEntidad frente a ComEmisor | pp. 16-19 | Nombres exactos y tratamiento de variantes; XML distingue mayusculas y caracteres |
| CMS-XML-CONTRACT | SubTrnCode 00 en ejemplo financiero frente a 0000 default en tabla; secciones de clientes usan SubtrnCode y 00 | pp. 7, 16-17 | Valor/nombre por operacion; no rellenar ni renombrar silenciosamente |
| CMS-XML-CONTRACT | TieneCosto sin type en ejemplo pero Double en tabla; EsPos b en ejemplo y String en tabla; Mensaje Short pese a descripcion textual | pp. 16-19 | Tipos y serializacion exacta |
| CMS-XML-CONTRACT | Ejemplo usa MensajeRetorno, tabla dice Mensaje de Retorno y exige Mensaje ausente del ejemplo | p. 19 | Campos de respuesta y obligatorios por resultado |
| CMS-XML-CONTRACT | Atributo ChannelId del ejemplo de respuesta no tiene comilla inicial en value | p. 18, comprobado visualmente | Ejemplo no es fixture XML valido; pedir export real, sin reparar el original |
| CMS-XML-CONTRACT | Fechas AAAAMMDD, ejemplos con fecha/hora/milisegundos y FechaContable con barras; no hay zona horaria | pp. 4, 16, 18-19 | Formato por campo y conversion a UTC; no asumir zona ni copiar fechas del ejemplo |
| CMS-RESULT-MAPPING | RetCode/CodigoProceso/MappedRespCode y RC ATM no tienen regla conjunta; existe aprobacion parcial | pp. 5, 19, 23-24 | Clasificar resultados de retiro, rechazo y parcial |
| CMS-REVERSAL | Dos familias MTI de reverso, flags y resta parcial sin relacion con F90 ni timeout | pp. 17, 19, 23 | Construccion, correlacion e idempotencia del reverso |
| CMS-CORRELATION | TraceId y TerminalSeq definidos, pero ejemplos request/response muestran distinta transaccion; no hay regla de eco ni vinculo a STAN/RRN/UTRNNO | pp. 16, 18-19 | Correlacion con Switch/Core; no usar PAN completo |
| CMS-TRANSPORT | URL Core QA de entidad 205/canales 1/21 y entrada ATM SmartVista 16100 aportadas. Timeout Core 20000 sin unidad confirmada. Faltan acceso desde PC al PID, framing ISO ATM, metodo HTTP Core, envoltura/cabeceras, charset, autenticacion y TLS | p. 4, `docs/core/MEDIATOR_ENTITY_205_ROUTING.md` y `docs/implementation/SWITCH_NETWORK_EVIDENCE.md` | Acceso dependiente del contrato; no usar la URL Core como endpoint ATM ni aplicar el framing 4946 al enlace 16100 |
| CMS-POS-MAPPING | Resumen de PosEntryMode 90 y 10 no coincide con la tabla detallada; contiene reglas Visa/Plus que no definen el perfil ATM Coonecta | pp. 18, 21-22 | F22/POS y capacidad PIN; no escoger una definicion sin validacion |

Las diferencias de ejemplos de pais/red/operacion no se resuelven copiando sus
valores: el ejemplo request es POS y la respuesta ilustra otra consulta. Los
ejemplos no forman una pareja transaccional validada ni fixtures de QA.

## Orden de implementacion y evidencia de cierre

1. Adaptar la pantalla a [la revision del mockup](../mockups/MOCKUP_REVIEW.md):
   formulario, pasos, timeline, inspector y estados vacios/bloqueados.
2. Recibir diccionario ATM, framing, request/response QA y mapeo ISO/CMS aprobado.
   Cada regla debe enlazar fuente/pagina, escenario, campo y prueba.
3. Implementar saldo como primer flujo mediante puertos/adaptadores fuera del
   Renderer; luego retiro aprobado/rechazado. Los fixtures deben estar sanitizados
   y tener autorizacion de uso. El PDF de ejemplo no es un mock validado.
4. Implementar reversos tras validar familia MTI, campos originales y politica de
   timeout/late response. Consultar Switch/Core solo por mecanismos aprobados de
   lectura; no llamar a la API de debito para validar.

Para cada flujo: happy path, entradas invalidas, rechazo/error y timeout o
dependencia no disponible; comparacion byte a byte con fixture ATM aprobado,
correlacion sin PAN y evidencia Switch/Core cuando aplique. Una autorizacion
parcial necesita su propia prueba y representacion, no el estado de aprobacion
total. Produccion permanece bloqueada.
