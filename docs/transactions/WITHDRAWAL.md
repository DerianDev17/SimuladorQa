# Retiro aprobado

## Objetivo
Simular retiro ATM exitoso.

## Montos personalizados en QA — 2026-10-27

Por solicitud explicita del usuario, el contrato de la plantilla ATM20521 permite
un monto personalizado en QA/LOCAL/ahorros/USD. En **Monto de prueba**, escribir
un valor positivo con punto y dos decimales, por ejemplo `30.00`, `75.25` o
`1234.56`. Sustituye la restriccion local anterior de USD 20/50; los ATM que
heredan esta plantilla reciben el mismo contrato.

`allowedAmounts` admite ahora el valor explicito `ANY_POSITIVE_AMOUNT`, ademas
de la lista exacta anterior. Las listas siguen restringiendo sus respectivos
perfiles. Main valida siempre la sintaxis y el limite representable de F4:
de `0.01` a `9999999999.99`, sin calculos en coma flotante. Es un limite tecnico,
no un limite financiero ni una regla de denominaciones. El host determina
la respuesta de cada prueba; TODO-DATA AMOUNT-RULES sigue pendiente para las
reglas de negocio generales.

La instruccion se registra como USER_QA_INSTRUCTION con referencia
USER-QA-20261027-CUSTOM-WITHDRAWAL-AMOUNTS. Se conserva BOUND_PROFILE/ZERO,
seguridad nueva por operacion, revalidacion del contrato antes de TCP y
comparacion exacta de F4 en la respuesta. Ver la ampliacion de ADR-016.

Pruebas: importes personalizados y extremos, entradas invalidas antes de PIN,
revocacion, errores y timeout; archivo de politicas; PIN/EMV sinteticos y TCP
loopback verifican F4 y diario con `75.25` y `1234.56`, tambien en un ATM derivado.
La E2E comprueba formulario, IPC e importe del resultado con `75.25`.

Validacion completada: 938 pruebas unitarias, 33 de integracion del modulo y
dos E2E correctas; lint, typecheck, formato, build y check:security correctos.
La prueba de dependencia ausente actualiza su expectativa al mensaje de la
plantilla ATM20521 introducida por ADR-024.

Contrato local instalado con respaldo y releido desde Electron nativo el
2026-10-27T18:25:52.224Z, UUID `8ff818aa-0f20-4bb1-9e46-b9a524ecefe7`.
El hash del perfil de saldo permanece igual, incluidas las reservas. Evidencias
locales: `artifacts/custom-withdrawal-activation-20261027.json` y
`artifacts/custom-withdrawal-native-verification.json`. Cero solicitudes PIN,
comandos al chip o transmisiones financieras durante la instalacion.

## Comprobante local e importes — 2026-10-19

El usuario confirma que Con impresion/Sin impresion corresponde a un comprobante
del simulador con vista previa. Es una preferencia de sesion: no modifica F48,
Impreso, montos, PIN/EMV ni comisiones del host. Sin impresion es el valor inicial;
Con impresion abre la vista previa una vez que el retiro se confirma aprobado.
El operador pulsa Imprimir comprobante para abrir el dialogo del sistema. Cancelar,
fallar, agotar el plazo o reimprimir nunca invoca una transaccion financiera.
Los retiros aprobados guardados tambien ofrecen Ver comprobante en el historial.
Los casos guardados no persisten esta preferencia; cargarlos vuelve a Sin impresion.

La respuesta F54 de retiro estaba descartada en codec, transporte y diario. Ahora
se conserva su lectura mecanica documentada (GetSaldos y frame 254), con tipos
01/02/91 neutrales, signo, moneda y cuenta. Solo se proyectan saldos en una
aprobacion completa 00 con F4 exacto. La ausencia de F54 permite aprobar retiro
con saldos vacios; F54 mal formado se trata como respuesta invalida. El parser de
saldo mantiene su exigencia de F54. Los registros anteriores se leen sin migracion;
sus saldos descartados no se reconstruyen ni se calculan con consultas anteriores.

La UI destaca Monto autorizado y muestra los saldos recibidos del mismo resultado.
Debito total permanece No confirmado: F4 autoriza el retiro, no es un asiento Core
ni incluye por si solo comisiones. Saldo restante muestra Sin identificar cuando
hay F54 y No informado si falta. No se resta el retiro a un saldo ni se confunde
un limite de credito con fondos disponibles.

TODO-DATA WITHDRAWAL-DEBIT-AND-REMAINING: confirmar por perfil la correspondencia
de F54 01/02 con total/disponible, que el disponible sea posterior al retiro y la
fuente del debito total efectivo con comisiones. Requiere especificacion aprobada
o evidencia correlacionada de host/Core. Se bloquean solo estas etiquetas e
importes derivados; retiro, saldos neutrales y comprobante local funcionan.

Impresion: IPC acepta solo environment QA y requestId UUID. Main recupera el
registro del diario y proyecta exclusivamente importes/referencias publicas, sin
tarjeta, PIN, RAW ni diagnosticos privados. Una interfaz ReceiptPrinter aisla
Electron; la ventana de impresion tiene sandbox, sin Node, preload, JavaScript
ni navegacion. El HTML escapa valores y bloquea recursos de red. El servicio limita
concurrencia y espera a 120 s, cancela recursos tardios y sanitiza fallos. SUBMITTED
significa envio a la cola del sistema, no confirma salida fisica del papel.

Pruebas: unidad de contratos/HTML/estados y F54; integracion TCP loopback -> diario
-> recuperacion -> impresion con puerto sintetico, sin bytes financieros nuevos;
E2E Electron con ambas preferencias, vista previa, cancelacion, fallo, reimpresion,
aislamiento de la ventana y ajuste a 1040 px. No se ejecuta un retiro real ni se
usa una impresora fisica durante esta verificacion.

Validacion local completada: lint, typecheck, build, formato de archivos afectados
y check:security correctos. Pasan 824 pruebas unitarias, 72 pruebas seleccionadas
de retiro/comprobante (incluidas en las suites), y cinco E2E de retiro/saldo; las
dos E2E de comprobante se repiten correctamente tras ajustar el modal a 1040x768.
En integracion pasan 163 de 164 en lote: la prueba existente de importacion PIN
Windows excede 20 s bajo carga y pasa al repetirla aislada, sin cambiar su timeout
ni codigo. Evidencia visual sintetica en artifacts/withdrawal-result-print.png,
withdrawal-receipt-preview.png y withdrawal-receipt-compact.png.

## Comparacion de trama solicitada, 2026-10-19

Se contrasta el builder actual, el perfil ATM20521, los frames 218/248/250 de
PruebaSimulador.pcap y los mensajes CMS persistidos de STAN900113, 900114 y
007927. No se transmite ni reconstruye para envio una operacion capturada.

- NewVisaWithdrawal reproduce exactamente el cuerpo aprobado del frame248
  cuando recibe sus campos originales y calendario/secuencia de referencia.
  Esto verifica el empaquetado; no prueba los bytes de seguridad de 900114.
- Los trece campos fijos del perfil coinciden con la captura, salvo F48: el
  retiro capturado lleva el segmento adicional `*S2C00000036` (12 bytes).
- La fuente ATMIso8583.CNegocio.ArmaMsgIso8583, IL3441-3594, lo agrega cuando
  ImprimeSaldo=S, desde CostoImpSaldo multiplicado por100 y completado a ocho
  digitos. Corresponde a impresion de saldo, no a un campo obligatorio demostrado
  para cualquier retiro. No se agrega silenciosamente esa comision al perfil.
- Mediator confirma que DatosPrivados del retiro900114 es identico al de la
  consulta aprobada900113 y al del retiro aprobado007927 al quitar exclusivamente
  dicho segmento. La comparacion se realiza en SQL sin exportar DatosPrivados.
- En el request CMS real900114 se reciben TrnCode/ProCode011000, ValueTrn20,
  AccountId1=10, la misma cuenta de debito que900113, EntityId/EntityIdDest205,
  ChannelId1, Moneda840, Pais218, PosEntryMode0510, PosConditionCode02, MTI200.
  Los identificadores privados se comparan sin publicarlos.
- El retiro aprobado007927 tiene Impreso=S y DobleSurcharge0.36; 900114 lleva
  Impreso=N y DobleSurcharge0. ComSwitch0.35 y ComEntidad0 coinciden. Ambos
  contienen EsIncremental=Y. No se transforma un dato de impresion en causa
  demostrada del timeout. Los retiros aprobados007925/007927 tardaron377/347ms;
  el original900114 termina con RetCode0 tras19973ms.
- La diferencia EMV historica (9C80 capturado frente al perfil de saldo30
  autorizado para esta prueba) permanece documentada. No se cambian tags
  posteriores a GENERATE AC ni se reutilizan PIN/ARQC capturados.

Los logs disponibles del16/10 no contienen el wire de900114 del19/10. La base
conserva el XML transformado, no permite comprobar retrospectivamente cada byte
del request ISO original. TODO-DATA QA-WITHDRAWAL-900114-WIRE: revisar NWINT y
PROXY205 de11:59:16-11:59:38 para localizar cualquier diferencia adicional y
correlacionarla con la demora. No afirmar que toda la trama es correcta ni que
el timeout prueba que no llego al Core. No hay cambio funcional basado en una
causa aun no demostrada.

Evidencia privada sanitizada: artifacts/withdrawal-wire-comparison-20261019.json,
artifacts/withdrawal-900114-request-comparison-20261019.json y
artifacts/withdrawal-field48-il-20261019.json. Verificacion:52 pruebas unitarias
e integracion de retiro correctas; cero transmisiones financieras durante la
revision, cero escrituras SQL y ninguna modificacion de los perfiles privados.

## Resultado del envio y conciliacion separados, 2026-10-19

Correccion del usuario: conciliacion es otro proceso. Se retira Nueva prueba QA
y su IPC; no se requiere una decision adicional para terminar un envio con
respuesta 91 y preparar la siguiente solicitud. El transporte clasifica un
0210/91 valido y correlacionado como NOT_APPROVED, mostrado como Retiro no
aprobado. Se libera el formulario y se requiere nueva lectura/PIN/AC/STAN.
El mismo requestId devuelve el registro anterior sin retransmitirlo.

La etiqueta anterior REQUIRES_REVIEW/91 fue una decision del simulador, no
un estado de conciliacion enviado por el host. Los registros historicos con
esa forma se presentan como no aprobados por el host sin reescribirlos.
Se conserva compatibilidad de lectura con la auditoria qaContinuation previa,
pero no se exige ni se crean nuevas auditorias de ese tipo.

La consulta SQL de solo lectura para ATM20521/STAN900114/RRN629200900114 confirma:

- MDT_StandardRetCode: 91 = Issuer or switch inoperative; 10 = Partial approval.
- MDT_RetCode: 76 = NO EXISTE TRANSACCION ORIGINAL; CATMMAP lo transforma a21.
- Trace31580667, MsgType1: respuesta CMS RetCode/CodigoProceso/MappedRespCode=0.
  Registro iniciado 11:59:17.150 y finalizado 11:59:37.123 (hora del servidor).
- Trace31580668/31580669, MsgType2: respuestas CMS 76/76/21. Sus registros inician
  11:59:25.700 y 11:59:34.730. MsgType2 es reverso en el manual CMS, pero los
  flags jnlReverse son false; no inferir reverso efectivo ni ausencia de debito.
- El simulador recibio 91 antes del fin del registro original, a 11:59:25.689.
  SmartVista QA confirma timeout de la institucion autorizadora (detalle abajo);
  falta correlacion de logs para atribuir la demora a un componente o parametro.

Inspeccion posterior de SmartVista QA, 2026-10-19:

- Busqueda de solo lectura por STAN900114 y ventana 11:58-12:01, sin usar PAN.
- Original de 11:59:16, PID80131, ATM20521, tipo700/CASH WITHDRAWAL,
  USD20, mensaje1035: codigo interno801, "Timeout - authorizing institution
  did not respond", respuesta de red91.
- La interfaz muestra tambien mensaje1043 con indicador de reverso y codigos
  939/7. Eso no demuestra un reverso aplicado en Core. No se acciono Reversar.
- La respuesta CMS del original Trace31580667 contiene APROBADO / TRANSACCION OK;
  su registro tarda 19973 ms. La consulta aprobada STAN900113 tardo 190 ms.
- En la base, 011000 y 301000 estan habilitados y usan ADPROUTER. Entidad205,
  canales1/21, enruta por ADPCOREGEN/CBCOOPERAT con entEndPointTimeOut=20000.
  No se cambia ese dato: falta verificar su unidad efectiva y los plazos de
  cada salto; aumentar solo la espera del simulador no cambia un 91 recibido.

La causa observable es el vencimiento de la autorizacion antes de la respuesta
CMS. Todavia no esta reparada la demora: la ruta de configuraciones/logs de
Mediator no es accesible en esta sesion y la lectura del historial detallado
del navegador se interrumpio. Las copias historicas de EXTBASE no se despliegan
sobre el servidor. Se requiere correlacion de PROXY205/AUTHTD/ADPCOREGEN y
Switch del intervalo 11:59:16-11:59:38 antes de elegir el cambio de parametros.
La seleccion Retiro aprobado/Retiro rechazado conserva el mismo envio ISO y
expresa el caso esperado; no cambia la respuesta real ni convierte un timeout
tecnico en un rechazo de negocio esperado. No se envio otra operacion.

Evidencias sanitizadas: artifacts/withdrawal-900114-response-codes-20261019.json
y artifacts/withdrawal-900114-message-codes-20261019.json. No se cambia SQL ni
se aumenta el timeout del cliente para ocultar una respuesta 91 ya recibida.
TODO-DATA QA-WITHDRAWAL-900114-CORE conserva la investigacion del resultado
final en Core y la causa del desfase. NOT_APPROVED describe la respuesta al
simulador, no garantiza ausencia de debito ni sustituye conciliacion/reverso.

00 con F4 exacto sigue siendo autorizacion del host. Parcial, 00 con importe
ausente/distinto, PENDING, STORAGE_ERROR o timeout sin respuesta conservan
su tratamiento de resultado incompleto; la UI no los llama conciliacion.
El cambio no altera PIN, EMV, importes permitidos ni crea reintentos automaticos.

## Correccion del formulario y monto, 2026-10-19

Correccion posterior de instalacion: el contrato inicialmente quedo en
AppData virtualizado bajo Codex. La instancia del usuario devolvia
QA_WITHDRAWAL_POLICY_MISSING antes de PIN/TCP. Se instala desde su Main real,
se comprueba con el router activo y se archiva la copia virtual; ahora el
archivo real contiene el contrato USD 20/50. Ver correccion de ADR-016.
La observacion TCP se restaura despues de cada envio si estaba conectada;
esa conexion es independiente de la disponibilidad del contrato de retiro.

El perfil local ATM20521 permite ahora USD 20.00 y USD 50.00 en QA/LOCAL/ahorros,
segun la solicitud del usuario. Ambos usan el mismo proveedor PIN/EMV de saldo
del ADR-016, con PIN nuevo por operacion. Un monto fuera de la lista se valida
antes de solicitar PIN; no es un rechazo del host.

La captura recibida muestra un resultado anterior de saldo mientras el
borrador ya dice retiro. El diario de saldo identifica STAN 900111,
RRN 629200900111, 2026-10-19T16:16:12.260Z, outcome PEER_CLOSED, 451 bytes
encolados y transporte de 248 ms, sin codigo de respuesta. No existe diario
de retiros en esta inspeccion: no hay evidencia de un retiro transmitido.
El motivo del cierre requiere correlacion con Switch; no se atribuye a PIN
ni se presenta como rechazo financiero.

La UI identifica la operacion del resultado y permite Nueva transaccion
tras una consulta terminada sin respuesta. Conserva el registro anterior,
exige leer nuevamente la tarjeta y genera requestId/PIN/AC/STAN nuevos.
Un retiro sin respuesta confirmada conserva su referencia. Un 91 correlacionado
es una respuesta recibida no aprobada y permite otra solicitud QA.

## Estado comprobado, 2026-10-16

Implementado el flujo de retiro de ahorros, ATM Local, QA: validacion de
monto, IPC propio, servicio de ejecucion, armado ISO, transporte, resultado
y diario separado. El caso WITHDRAWAL_DECLINED usa el mismo envio y no
fuerza la respuesta del host. Las otras cuentas/escenarios siguen fuera de
este perfil ejecutable.

Main ahora vincula QaWithdrawalExecutionProvider por ATM a su router de
retiro. El proveedor comparte infraestructura PIN/PCSC y el pool atomico de
secuencias, con un contrato independiente que selecciona la preparacion EMV.
La implementacion no contiene un bloqueo permanente por proveedor ausente.
El envio depende del contrato explicito descrito abajo; su ausencia/errores
bloquean antes de PIN, reserva, AC o TCP.
El perfil y diario existentes de saldo conservan su comportamiento.

El usuario autoriza despues usar la preparacion PIN/EMV "tal cual la consulta".
Se configura ATM20521/QA/LOCAL/ahorros/USD 20 con BOUND_PROFILE/ZERO: 9C y
analisis del perfil de saldo (vigente 30/SERVICES), 9F02 cero, PIN/AC nuevos;
F3=011000 y F4=USD 20. La fuente es USER_QA_INSTRUCTION, no una certificacion
del proveedor. Ver [ADR-016](../adr/ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md).
Esta instruccion permite la prueba acotada sin cerrar la discrepancia
historica de la captura ni aprobar reglas generales de retiro.

La consulta real posterior al arreglo 5F34 se aprueba: ATM20521, STAN 900110,
RRN 628900900110, respuesta 00, 2026-10-16T21:07:27.983Z. Esa aprobacion
confirma saldo y no habilita automaticamente otro tipo de operacion.

Se reanaliza PruebaSimulador.pcap, SHA-256
a59148b665715284d1c673cc9137338386088f31b3922c3f2d77bb42449154ab:
frame 248 contiene retiro 0200/011000, USD 20 (F4=000000002000);
frame 254 responde 0210/00 con el mismo importe y campos 38/54.
El request usa los mismos numeros de campos del perfil de saldo, pero su
contenido y la respuesta requieren un contrato propio. No basta habilitar
el boton ni cambiar F3 en una consulta.

Conflicto pendiente de validacion: F55 del retiro observado contiene
9F02=000000000000 y 9C=80, a pesar del importe F4 de USD 20. El formatter
GetDataEMV inspeccionado consume el contexto EMV; no define como generar
una AC nueva para ese retiro. No copiar silenciosamente esos valores ni
sustituirlos por otros sin la regla aprobada del proveedor.

TODO-DATA QA-WITHDRAWAL-EMV-GENERATION: confirmar contrato de 9F02/9C y
su vinculacion con el monto de la solicitud y CDOL1 para una nueva AC de
retiro. En su respuesta del 2026-10-16, el usuario confirma que hace falta
validacion del proveedor y que la aprobacion de la captura no demuestra una
regla general. La alternativa propuesta, 9F02=000000002000 y 9C=01 para
USD 20, queda como candidata sin validar para este enlace; no se incorpora
al perfil ni se presenta como confirmacion del proveedor.
AMOUNT-RULES y criterios generales de resultado parcial/reverso mantienen
su alcance propio. La instruccion posterior permite la prueba acotada de
USD 20 con preparacion de saldo y resultado conservador del ADR-016.

Evidencia local sanitizada: artifacts/qa-withdrawal-readiness-20261016.json.

## Motor implementado

- `parseWithdrawalContextRequest` / `parseWithdrawalExecutionRequest` aceptan
  referencias UUID y borrador estricto. Rechazan secretos, bytes, PROD/PREPROD,
  otras cuentas/escenarios y montos cero/negativos. El limite de 10 enteros y
  dos decimales corresponde a F4 (12 digitos), no a un limite financiero.
- Los cuatro IPC `transaction:withdrawal:*` separan disponibilidad, ejecucion,
  recuperacion e historial. Main comparte la exclusion de operaciones con
  saldo, bloqueando cambios de entorno/perfil/destino durante una ejecucion.
- WithdrawalService comparte el motor de escritura unica e idempotencia de
  BalanceInquiryService. Monto y tipo de caso se guardan en `withdrawal` y se
  comparan al recuperar el mismo requestId. Un lease sin el monto exacto se
  rechaza antes del armado. El proveedor concreto queda vinculado en Main.
- NewVisaWithdrawal construye F3=011000 y F4 desde el monto decimal sin
  flotantes, con los campos y framing documentados. Los campos privados
  deben proceder de un proveedor nuevo; el motor no lee PCAP ni pide datos
  criptograficos al Renderer. F38 se admite con longitud 6 EBCDIC segun ISOBASEI.
- El transporte verifica el wire y su metadata antes de conectar. Correlaciona
  STAN/RRN/terminal/F3/moneda; solo 00 con F4 igual al solicitado se presenta
  como autorizacion del host. No afirma dispensacion ni debito Core.
- F4 ausente/distinto con 00 o un codigo aun sin clasificacion queda REQUIRES_REVIEW.
  91 se clasifica NOT_APPROVED conforme a la correccion de resultado descrita arriba.
  A falta del contrato ISO de rechazos/parciales, no se convierte el RetCode
  de CMS en F39 ni se considera un rechazo definitivo. No hay reverso automatico.
- El diario `withdrawal-executions.sqlite` persiste PENDING antes de transmitir,
  sin bytes privados. Saldo usa otra base SQLite; ambos importan su JSON anterior
  una sola vez y rechazan operaciones del otro tipo. Un retiro incierto impide
  enviar otro retiro, incluso con UUID nuevo o tras reiniciar. Un 91 confirmado
  no activa ese bloqueo; el registro original se conserva sin retransmitirlo.
- La UI recupera por el canal de la operacion original aunque se edite el
  formulario. Muestra monto, referencia, resultado e historial de ambos flujos.
- Un retiro terminado con respuesta aun sin clasificar (por ejemplo, RC 59 del
  intento ATM20521/STAN 900125) conserva su referencia y bloquea otros retiros.
  Si el operador elige Consulta de saldo, puede iniciar una nueva consulta con
  otra lectura de tarjeta y PIN; el retiro original permanece en el diario y
  puede consultarse en el historial. Esto no clasifica RC 59 ni confirma el
  resultado financiero del retiro.

Pruebas sinteticas de unidad, TCP loopback, archivo e IPC cubren aprobacion,
entrada invalida, proveedor ausente, timeout, respuesta no correlacionada,
monto cambiado, conciliacion e idempotencia. No validan el contrato EMV pendiente.

Validacion completada 2026-10-16: 722 pruebas unitarias y 158 de integracion
correctas; tres E2E seleccionadas correctas (retiro y recuperacion al cambiar
formulario, saldo, timeout IPC sin reenvio). Typecheck, lint, formato de los
archivos afectados, check:security y build correctos. Las pruebas de pantalla
usan userData temporal y lector/IPC sinteticos. Se ajusto su fixture para
restaurar el lector tras el evento real de finalizacion de Main.

El codec se verifica ademas offline contra frames 218/224/248/254 de la
captura original: saldo y retiro aprobados se interpretan con sus propios
campos, sin transmitir ni reutilizar seguridad. Reporte sin datos privados:
`artifacts/withdrawal-codec-verification-20261016.json`. No se han modificado
perfiles privados ni se ha enviado un retiro real.

TODO-DATA QA-WITHDRAWAL-RESULT-RULES: contrato de rechazos/parciales, criterio
de debito y conciliacion de resultados inciertos, incluido el cierre validado
del pendiente antes de permitir otro retiro. No agregar una accion de reenvio
o borrar el diario para resolver esa falta de informacion.

## Proveedor implementado y contrato cargable

`QaWithdrawalExecutionProvider` utiliza el PIN nativo, cifrador TEST y sesion
PC/SC existentes. Se vincula por perfil/revision/terminal/destino en el router
de retiro. El contrato se lee desde `qa-withdrawal-policies.json` en el
directorio userData de Electron, separado de `qa-execution-profiles.json`.
No se modifica el archivo de saldo ni se duplica su pool STAN.

El contrato alternativo de generacion CASH/01 usa
9F02 igual al monto solicitado, 9F03 cero y moneda 840. Es una implementacion
de la alternativa propuesta, **no una aprobacion del proveedor para ATM20521**.
El perfil cargado debe declarar esa regla expresamente y documentar que el
PIN TEST y los campos fijos del perfil vinculado son aplicables a retiro.
No se admite 9C=80 ni transformaciones de F55 posteriores a AC. El contrato
BOUND_PROFILE/ZERO autorizado por el usuario reutiliza explicitamente la
preparacion de saldo, incluido su monto EMV cero; siempre genera seguridad nueva.
Si el proveedor requiere otro contrato, esa parte necesita una implementacion
basada en su especificacion; cambiar una etiqueta de aprobacion no basta.

La propiedad privada `allowedAmounts` contiene importes exactos aprobados para
pruebas (1 a 100 strings decimales positivos, sin duplicados), o el valor explicito
`ANY_POSITIVE_AMOUNT` para montos personalizados representables en F4. No se infieren
minimos, maximos, denominaciones ni disponibilidad de billetes. No hay
dispensador en este flujo. El contrato confirma `EXACT_AMOUNT_OR_REVIEW`:
solo 00 con F4 exacto se considera autorizacion; los otros resultados
requieren conciliacion y bloquean nuevos retiros. No se implementa ni
declara un reverso automatico. Las reglas generales de rechazo, parcial,
dispensacion y reverso siguen pendientes fuera de ese alcance acotado.

Campos obligatorios de cada fila de `policies` (archivo con `version: 1`):

| Campo | Contenido |
| --- | --- |
| id | UUID nuevo del contrato |
| profileId | UUID del perfil de ejecucion QA vinculado |
| profileFingerprint | SHA-256 de qaExecutionProfileIdentity, calculado en Main; excluye reservas consumibles |
| approvalReference | Referencia real de validacion/instruccion, sin secretos; no admite null |
| validationSource | PROVIDER o USER_QA_INSTRUCTION; no atribuir al proveedor instrucciones del usuario |
| environment / account / currency | QA / SAVINGS / 840 |
| transactionType / authorisedAmount | 01 / REQUESTED_AMOUNT, o BOUND_PROFILE / ZERO; otras combinaciones se rechazan |
| field55Source | CDOL1_VALUES |
| pinAndFixedFields | BOUND_PROFILE |
| allowedAmounts | Lista de montos de prueba o ANY_POSITIVE_AMOUNT por instruccion explicita |
| responsePolicy | EXACT_AMOUNT_OR_REVIEW |

El lector admite hasta 64 KiB, rechaza propiedades extras, duplicados y
contratos incompletos. Ausencia o invalidez del archivo solo impide retiro.
La huella invalida el contrato si cambia el perfil base, incluido destino,
clave referenciada, campos o parametros EMV. Se revalida antes/despues del
PIN, antes de reservar, despues de AC y antes de transmitir; los cambios
cancelan el envio y destruyen los buffers. La revalidacion tiene plazo y
se comprueba nuevamente la vigencia antes del write TCP.

En CASH/01, la evaluacion de efectivo usa AUC domestico/internacional y condiciones CVM
de efectivo no atendido; las comparaciones X/Y usan el monto en centavos.
En CASH/01, CDOL1 debe incluir una sola vez 9F02 de 6 bytes y 9C de 1 byte, ademas de
tener todos sus datos disponibles con longitud exacta. Los mismos valores
se usan en la primera AC y F55. Se mantiene el alcance de PDOL del lector
(vacio o 9F1A); otras tarjetas no se completan con ceros inventados.
Fuente de AUC/CVM: EMVCo, [Book 3 v4.3, secciones 10.4/10.5 y anexo C2/C3,
reproduccion del documento original](https://studylib.net/doc/28022968/emv-v4.3-book-3-application-specification-20120607062110791).
Esto documenta el procesamiento EMV; no resuelve el conflicto del enlace QA.

Se prepara `artifacts/qa-withdrawal-contract.pending.json` con referencias
del perfil ATM20521 actual y USD 20.00 como propuesta solicitada. Su estado
es PENDING_PROVIDER_VALIDATION y approvalReference=null, por lo que no es
cargable. Se comprobaron 994 reservas sin consumirlas ni cambiar el perfil.
Ese borrador CASH/01 se conserva como evidencia previa. La instruccion
posterior del usuario activa un contrato distinto BOUND_PROFILE/ZERO; no
se envia una operacion real durante la configuracion.

Para activar el perfil compatible, registrar la referencia y alcance de
validacion, ajustar los importes aprobados y guardar solo el objeto
`configuration` del borrador como `qa-withdrawal-policies.json` junto al
perfil privado. No copiar el contenedor pendiente ni inventar una referencia.
El archivo se relee en cada preparacion: no requiere otro cambio de codigo.

Activacion verificada desde Electron nativo, 2026-10-16T22:32:06.286Z:
contrato 3d47c116-bc72-4f33-aee9-78d35d325cf7, fuente USER_QA_INSTRUCTION,
referencia USER-QA-20261016-BALANCE-COMPATIBILITY, ATM20521/ahorros/USD 20.
Carga contrato y clave TEST correctamente; disponibilidad solo requiere
QA-CARD-SESSION porque la comprobacion no toma una lectura de tarjeta.
Conserva 994 reservas y el hash del perfil de saldo. Sin PIN, APDU ni TCP.
Reporte: `artifacts/qa-withdrawal-activation-20261016.json`.

Verificacion de la modalidad final: 136 pruebas del modulo correctas,
incluido recorrido con tarjeta sintetica, PIN, AC, ISO y host TCP local;
typecheck, lint, formato, check:security y build correctos. Antes de agregar
la modalidad de compatibilidad tambien pasaron 768 pruebas unitarias,
160 de integracion y tres E2E de saldo/retiro/recuperacion.

## Consulta documental previa sobre CASH/01

Para implementar retiros nuevos en QA por el enlace de ATM20521, confirmar:

1. Los valores y la regla de calculo de 9F02 y 9C que deben suministrarse al
   chip cuando CDOL1 los solicite, y los que deben transmitirse en F55.
   Para USD 20, F4 es 000000002000; la captura aprobada contiene
   9F02=000000000000 y 9C=80. Aclarar esa diferencia y cualquier
   transformacion realizada por el adaptador o Mediator, indicando la etapa.
2. La fuente aprobada, version de perfil y alcance por operacion/cuenta para
   esa regla. La propuesta 9F02=000000002000 / 9C=01 no esta validada aun
   para este enlace.
3. Un caso de referencia validado que relacione monto, entrada CDOL1 y F55
   de la misma operacion con la respuesta y su correlacion STAN/RRN/UTRNNO.
   Entregar solo evidencia sanitizada, sin PIN, PIN Block, llaves, PAN completo
   ni Track 2.

Este texto queda preparado en el repositorio; no se ha enviado al proveedor.
La respuesta permitiria resolver la discrepancia y revisar el contrato
general del proveedor. La prueba BOUND_PROFILE/ZERO tiene autorizacion
independiente del usuario (ADR-016). Limites de monto y tratamiento de parcial/reverso se validan aparte;
la confirmacion de estos dos tags no completa por si sola el motor de retiro.

## Evidencia recibida: Extreme Mediator CMS v3.6

- TrnCode 011000 ahorros, 012000 corriente, 013000 avance credito y 014000 cuenta
  universal (p. 20); no habilitar automaticamente todas las variantes en MVP.
- ValueTrn mandatorio, AccountId1 y AccountNum1 para cuenta de debito (p. 17).
- RetCode 0 exito; RetCode 10 OK parcial y ValorDebitadoParcial mayor a cero
  indican autorizacion parcial (p. 19). No contabilizar parcial como retiro total.
- Impreso debe evaluarse junto a TrnCode 011000 para retiro con impresion de
  consulta (p. 18).

El manual no define PIN Block/HSM ni F55 para el enlace ATM. Los ejemplos POS no
son un template de retiro ATM. Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Datos configurables
- ATM
- tarjeta
- cuenta
- monto
- timeout

## Pendientes
- 011000 confirmado para ahorros en la captura; validar las otras variantes;
- moneda, limites, monto minimo/maximo y denominaciones por cuenta/escenario (TODO-DATA AMOUNT-RULES);
- validacion general del proveedor para PIN/EMV de retiro, mas alla de la
  instruccion QA acotada del ADR-016;
- contrato completo de respuestas de retiro, incluido parcial/reverso;
- reglas generales F55/CDOL1 de retiro (QA-WITHDRAWAL-EMV-GENERATION);
- criterio de debito Core;
- response esperado.

La vista de preparacion de casos conserva el catalogo documental 011000/012000
y monto con punto/dos decimales. El envio directo descrito arriba usa el
proveedor ejecutable solo para ahorros y el alcance del contrato cargado.
Ver `docs/implementation/TRANSACTION_PREPARATION.md`.
