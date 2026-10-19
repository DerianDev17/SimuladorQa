# ADR-016: retiro QA con la preparacion PIN/EMV de saldo

Estado: autorizado por el usuario para la prueba QA ATM20521/USD 20; ampliado a USD 50 el 2026-10-19.
Fecha: 2026-10-16.

## Decision y fuente

Tras presentar el contrato y solicitar la validacion pendiente, el usuario
indica: "si ya esta implemntado debes permitir y si se debe de usar tal cual
la consulta". Se registra esa instruccion como USER_QA_INSTRUCTION; no se
atribuye una certificacion al proveedor ni se declara resuelta la discrepancia
de la captura (retiro con F55 9F02=0/9C=80).

Para esta prueba se utiliza el mismo procedimiento PIN/EMV del perfil de
consulta aprobado: PIN nativo nuevo, cifrado TEST con su referencia protegida,
lectura exclusiva del chip, analisis SERVICES y primera AC nueva con los
valores del perfil de saldo. En el perfil vigente, 9F02 es cero y 9C es 30.
No se reproduce una trama, un PIN Block ni un criptograma anterior.

La operacion ISO es retiro de ahorros 011000 y F4 contiene USD 20.00.
La diferencia entre importe ISO y EMV es explicita en el contrato
BOUND_PROFILE/ZERO; no se modifica F55 despues de calcular la AC.
No es una regla EMV general ni se aplica a otros perfiles por defecto.

## Alcance y controles

- Solo QA, ATM20521 vinculado por UUID/huella, LOCAL, ahorros y USD 20.00.
- Comparte el pool atomico de reservas de saldo, sin clonar ni reiniciar STAN.
- El contrato privado tiene UUID, fuente de instruccion y referencia de
  autorizacion; se revalida con plazo antes de PIN/AC/transmision.
- Solo respuesta 00 correlacionada con F4 exacto indica autorizacion del
  host. No se afirma dispensacion ni debito confirmado por Core.
- Otros resultados quedan pendientes de conciliacion, sin reenvio ni
  reverso automatico. Produccion permanece bloqueada.
- Saldo conserva su perfil, algoritmo, secuencias y diario.

La alternativa CASH/01 con 9F02=monto tambien esta implementada, pero no se
selecciona para este contrato. Una futura validacion del proveedor puede
reemplazar la regla de compatibilidad mediante un nuevo contrato explicito.

## Verificacion

Pruebas sinteticas de ambas reglas comprueban F4, CDOL1, F55, CVM y respuesta
ISO, con dos operaciones consecutivas que tienen ATC/UN/STAN nuevos. Se
comprueban monto no permitido, contrato cambiado, cancelacion, timeout y
ausencia de dependencias. La activacion privada no envia una transaccion ni
consume una reserva; el usuario inicia el retiro desde la aplicacion.

Instalado el contrato 3d47c116-bc72-4f33-aee9-78d35d325cf7 y verificado desde
Electron nativo a las 2026-10-16T22:32:06.286Z: contrato y clave TEST
disponibles, 994 reservas intactas, unico pendiente QA-CARD-SESSION por
lectura manual ausente en la comprobacion. Perfil de saldo sin cambios.
Evidencia sanitizada: artifacts/qa-withdrawal-activation-20261016.json.

## Ampliacion solicitada el 2026-10-19

El usuario reporta que no puede iniciar otra transaccion y que el retiro de
USD 50 mostrado en su captura no solicita PIN. Se agrega USD 50.00 a la lista
explicita, conservando USD 20.00 y BOUND_PROFILE/ZERO con la misma preparacion
PIN/EMV de saldo. No se infieren denominaciones ni limites generales.

Se reemplaza el contrato por a6ec1d4b-6648-481b-accd-7b337811bbf7, con fuente
USER_QA_INSTRUCTION y referencia USER-QA-20261019-BALANCE-COMPATIBILITY-20-50.
Verificacion desde Electron nativo: ambos importes alcanzan la validacion de
lectura de tarjeta; USD 30 sigue bloqueado. Perfil de saldo sin cambios y
993 reservas intactas. No se solicita PIN, lee el chip ni transmite durante
esta comprobacion. Evidencia: artifacts/qa-withdrawal-activation-20261019.json.

## Correccion de la instalacion efectiva, 2026-10-19T16:42:04Z

Las comprobaciones anteriores usaron procesos Electron hijos de Codex y
leyeron una copia virtual de AppData. No acreditaban que la instancia abierta
por npm run dev tuviera el contrato. El mensaje QA_WITHDRAWAL_POLICY_MISSING
del usuario revelo esa diferencia; Main confirma nativePolicyExisted=false.

Se instala el mismo contrato autorizado a6ec1d4b-6648-481b-accd-7b337811bbf7
desde la instancia real (PID 17368). Su router activo valida USD 20/50 y
solo requiere lectura de tarjeta; USD 30 sigue bloqueado. Perfil sin cambios,
991 reservas intactas. Se retira la entrada temporal de mantenimiento y se
archiva la copia virtual para evitar que oculte futuras lecturas. El archivo
real persiste tras reiniciar; no queda instalacion automatica al arrancar.
No se envia una transaccion, solicita PIN ni toca el chip.
Evidencia: artifacts/qa-withdrawal-live-main-20261019.json.

## Continuacion manual QA tras respuesta 91, 2026-10-19

Decision sustituida por la correccion posterior del usuario descrita abajo.

Ante la solicitud del usuario de continuar despues de ATM20521/STAN 900114,
se agrega Nueva prueba QA para un retiro terminado, transmitido, correlacionado
y REQUIRES_REVIEW/91. La decision se audita atomicamente en el diario antes
de permitir otra solicitud; no cambia el resultado financiero ni significa
conciliacion. La nueva operacion exige tarjeta/PIN/AC/STAN nuevos. El mismo
requestId sigue devolviendo el original sin transporte. No hay reintento ni
reverso automatico, ni ampliacion a otras respuestas o a PROD/PREPROD.

El SQL de solo lectura devuelve retCode CMS 0/76/76 para 900114, sin prueba
de cierre financiero en Core. Se conserva TODO-DATA QA-WITHDRAWAL-900114-CORE.
Ver el alcance, recuperacion y controles en transactions/WITHDRAWAL.md.

## Correccion: conciliacion como proceso separado, 2026-10-19

El usuario rechaza condicionar la siguiente operacion a conciliacion. Se retira
Nueva prueba QA y su IPC. Un 0210/91 correlacionado termina como NOT_APPROVED,
libera el formulario y conserva su respuesta; la siguiente solicitud obtiene
lectura/PIN/AC/STAN nuevos. El diario historico se conserva y su representacion
REQUIRES_REVIEW/91 se reconoce sin requerir la auditoria manual anterior.

Fuente: instruccion del usuario y catalogo vivo MDT_StandardRetCode (91: Issuer
or switch inoperative). No implica ausencia de debito: la respuesta CMS de
31580667 contiene 0/0/0 y su registro termina despues del 91 recibido por el
simulador. 31580668/31580669 contienen 76/76/21; el catalogo define 76 como
NO EXISTE TRANSACCION ORIGINAL. El desfase requiere logs Switch/Core para
confirmar la causa; no se modifica un timeout por inferencia.

La nueva regla sustituye la clasificacion anterior de todo no-00 como revision
para este codigo documentado. La configuracion privada conserva el nombre
historico EXACT_AMOUNT_OR_REVIEW y la exigencia de importe exacto para aprobar.
No cambia el contrato EMV ni los limites. Parciales y respuestas incompletas
conservan su tratamiento propio; conciliacion y reversos permanecen separados.
