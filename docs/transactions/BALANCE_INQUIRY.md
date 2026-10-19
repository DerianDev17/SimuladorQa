# Consulta de saldo

## Objetivo
Enviar una consulta de saldo desde un ATM configurado y recibir/validar la respuesta.

## Evidencia recibida: Extreme Mediator CMS v3.6

- TrnCode 301000 para ahorros y 302000 para corriente (p. 20).
- AccountId1: 10 ahorros, 20 corriente (p. 17).
- Respuesta con SaldoTotal y SaldoDisponible (p. 19).
- Consulta impresa: 311000/312000 (p. 21), variante distinta que requiere template.
- Consulta de cliente 310010/310020/310030 no es consulta de saldo (p. 21).

El usuario indico el 2026-10-06 seguir el documento: descartar 310000 del mockup.
Estos son codigos documentados del catalogo Mediator; no se define con ellos el
encoding de F3 ni la trama ATM. Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Evidencia ATM recibida y alcance

ISOBASEI.bin y el PCAP CB 205 de consulta/retiro ya fueron recibidos. La
consulta historica de ahorros tiene 0200/0210, F3 301000, F4 cero, F49 840 y
F39 00 en ambos tramos. El codec acotado reconstruye el request original byte
a byte; no valida generacion de otra transaccion ni cuenta corriente 302000.
Ver [muestra, intentos y fuentes](../protocols/CB_205_BALANCE_SAMPLE.md) y
[definicion ISOBASEI](../protocols/ISOBASEI_REVIEW.md).

Faltan reglas aprobadas de campos dinamicos, cuenta/tarjeta, PIN/HSM/EMV,
interpretacion de saldo y respuesta por perfil. No pedir nuevamente el PCAP o
ISOBASEI como si no existieran, ni convertir la captura recibida en un perfil
financiero aprobado.

## Motor implementado el 2026-10-12

La app incorpora IPC de disponibilidad/ejecucion, builder de consulta nueva,
transporte TCP fuera del Renderer, parser F54, correlacion y diario recuperable.
Enviar depende de capacidades revalidadas, sin disabled permanente. El pipeline
funciona en pruebas sinteticas; el runtime aun requiere un proveedor QA real de
perfil, secuencia y PIN/EMV antes de permitir la consulta fisica.

Ver [comportamiento actual, limites y dependencias](../implementation/BALANCE_EXECUTION.md).
Los errores historicos 91/96 del recorrido CB permanecen independientes de
esta implementacion. El PIN recibido no se persiste ni reemplaza esa seguridad.

## Diagnostico previo a esta implementacion, 2026-10-12

La app prepara un borrador y un plan local. Todavia no ejecuta consultas de
saldo desde el formulario. Hay dos problemas separados: el recorrido de envio
sin implementar y los errores observados en los envios historicos de las
herramientas QA. Esta revision no abre conexiones ni transmite mensajes.

### Por que no se puede enviar desde la pantalla

1. `apps/desktop/src/renderer/TransactionWorkspace.tsx` declara el boton
   Enviar transaccion con `disabled` literal y sin manejador de envio. Revisar
   llama exclusivamente a `reviewDraft` y `prepareSendPlan`.
2. `packages/shared/src/contracts.ts`, `apps/desktop/src/preload.ts` e
   `apps/desktop/src/main/index.ts` exponen configuracion, revision y preparacion.
   No existe una operacion IPC para ejecutar la transaccion. El contrato
   `PreparedSendPlan` admite solo `status: BLOCKED`, `frameGenerated: false` y
   `transmissionAttempted: false`; no es un resultado financiero.
3. `apps/desktop/src/main/application.ts` devuelve esos valores de forma
   incondicional. `SendConfigurationService` guarda ajustes/evidencia y no
   depende de un transporte. Elegir ON_CLICK o AFTER_REVIEW y completar los
   plazos no implementa el envio ni programa una transmision.
4. `DraftRequest` no contiene una referencia de tarjeta. La seleccion de chip
   de `transaction-card.ts` vive en el Renderer y solo lleva readId, lector,
   PAN enmascarado y etiqueta. La lectura de identidad no provee al generador
   una tarjeta/cuenta financiera ni PIN Block/EMV transaccional.
5. `CapturedVisaBalance.rebuildRequest` copia segmentos originales. Acepta
   el perfil observado 301000/840; no construye fechas, STAN/RRN nuevos,
   sustituye tarjeta, produce PIN/EMV ni implementa 302000.
6. `QaTcpReplay` existe separado como herramienta de un write. Su puerto
   devuelve cantidades/estado de transporte, no una respuesta ISO ni saldo.
   No esta inyectado en la app y no es un motor de sesiones ATM persistentes.

Ademas, `dataBlockers` y `draftBlockers` son requisitos estaticos: toda revision
conserva ISO_SPEC, GOLDEN_SAMPLES, ENVIRONMENT y PROFILES. No hay un evaluador
de capacidades que habilite solo el perfil/caso validado al recibir evidencia.
Algunos textos mencionan fuentes ya recibidas; los pendientes efectivos son
su alcance aprobado y las reglas para crear una transaccion nueva. Cambiar
esos textos o quitar `disabled` no completa el recorrido anterior.

### Que explican los envios historicos

| Intento del 2026-10-08 | Resultado comprobado | Limite del diagnostico |
| --- | --- | --- |
| STAN 007923, reproduccion identica | 0210/F39 91; llegada a SmartVista y Mediator confirmada; TraceId 31580471, RetCode 8908 | PROXY205 agota espera AUTHTD/AUTHTD de 15.001 s; falta ruta/configuracion y excepcion WS correlacionada para identificar causa Core |
| STAN 008101, 008102, 008103 | 0210/F39 96; solo cambio F11 | Fechas, RRN, PIN/EMV y tarjeta provienen de captura; no son requests nuevos validados; falta log del recorrido PID 80131/82052 |

Los metadatos privados de `artifacts/cb-capture-versus-simulator-comparison.json`
confirman cuatro envios y tres preparaciones sin envio, con hashes coincidentes.
El nwint disponible no contiene esos STAN ni los PID del recorrido. No permite
atribuir el 96 a fechas, duplicados, RRN, PIN o EMV.

La consulta local del dia en `artifacts/cb-008103-mediator-day-diagnostic.json`
esta etiquetada PREPROD y registra tres filas: secuencias 7923/7921, incluyendo
el TraceId 31580471 con 8908 y dos historicas con retorno 0. Los diagnosticos
acotados por secuencia 8103 y Journal no tienen filas. Esto no identifica el
origen del 96 ni valida ausencia en todos los ambientes; zona de SQL no
confirmada. La revision solo lee proyecciones existentes, sin consultar la BD.

La PC fue autorizada como PID 80131 y ya envio consulta hasta Mediator. La
denegacion inicial NO AUTHORIZATION es historica. Faltan politica 071/072,
0810 real y coexistencia de sesiones prolongadas, pero no corresponde afirmar
que el 91/96 se deba a no contestar 0810: el intento financiero llego a Mediator
sin esa respuesta. Tampoco esta demostrada una causa TLS para el error WS.

### Implementacion que falta para una consulta nueva

| Prioridad | Pieza | Implementacion y evidencia necesarias |
| --- | --- | --- |
| P0 | Capacidad por perfil/ambiente | Distinguir evidencia recibida, perfil aprobado y dependencia pendiente; empezar por CB 205/QA/ahorros y no habilitar otros escenarios por extrapolacion |
| P0 | Contexto financiero en Main | Referencia opaca de tarjeta/perfil, vigencia de sesion, cuenta/entidad y revision ATM; nunca enviar PAN completo o secretos desde Renderer; TODO-DATA PROFILES y CARD-TRANSACTION-SECURITY |
| P0 | Builder de consulta nueva | Inputs aprobados, campos fijos/dinamicos, framing VISA, STAN unico y reglas F7/F11/F12/F13/F37; seguridad PIN/EMV por interfaz; TODO-DATA AUTOMATIC-FRAME-GENERATOR y CB-DYNAMIC-REQUEST |
| P0 | Orquestador y contrato de ejecucion | IPC tipado y validado, revalidacion al ejecutar, runId/transactionId UUID, estados de ejecucion, proteccion de doble envio y plazos; conservar plan/revision como operaciones distintas |
| P0 | Transporte ATM y recepcion | Puerto/adaptador fuera del Renderer, framing incremental, limites, correlacion de 0210 y separacion de 0800/0810; politica de cierre, persistencia y reconexion aprobada, sin reintentos financieros implicitos |
| P0 | Resultado de saldo | Decodificacion aprobada de respuesta, RC, total/disponible, cuenta y moneda; actualmente F54 se recorre como bytes, sin extraer saldos; TODO-DATA BALANCE-RESPONSE-CONTRACT |
| P0 | Diagnostico del recorrido CB | Resolver en paralelo CB-PROCESSOR-ERROR y CB-96-SWITCH-LOG; UTRNNO y relojes confirmados; una correccion local no garantiza aprobacion de la dependencia Core |
| P1 | Evidencia de ejecucion | Historial transaccional persistente, tiempos/latencia, inspector sanitizado y correlacion Switch/Mediator/Core; los casos DRAFT y sus IDs no sustituyen ejecuciones |

Se pueden implementar contratos, estados, persistencia y pruebas sinteticas
offline con interfaces separadas. Bloquear solo builder/seguridad/politicas
dependientes de evidencia, sin inventar los valores para completar el flujo.
Las pruebas sinteticas validan codigo; la aceptacion financiera exige un caso
QA autorizado y evidencia correlacionada del recorrido.

Para completar la simulacion ATM del MVP tambien faltan retiro aprobado y
rechazado, reglas de monto/denominaciones, reverso asociado al original,
reverso por timeout, duplicados y respuesta tardia. Carga, workers, limites,
Control Plane y observadores distribuidos son posteriores al flujo funcional;
no bloquean la construccion offline del primer caso de saldo.

### Verificacion de esta revision

Actualizacion de fuentes del 2026-10-12: la carpeta imagen cajero aporta
ATMIso8583 con reglas mecanicas de F3, fechas, STAN/RRN y GetSaldos. Layout
y escala F54 contrastados contra el PCAP CB; el codec del simulador sigue
sin implementarlos. Los pendientes de generacion y respuesta se acotan a
perfil activo, secuencia/fechas, seguridad, semantica/variantes y su integracion.
Ver [imagen NCR y modulos del host](../protocols/ISOBASEI_REVIEW.md#imagen-ncr-y-modulos-del-host-recibidos-el-2026-10-12).

Lint y TypeScript pasan. Pasan 218 pruebas en 12 archivos: diez unitarios de
configuracion, borrador/UI/tarjeta, codecs VISA, evidencia y seguridad; dos
integraciones de preparacion Main y configuracion en archivo/Worker SQLite.
Todas las pruebas elegidas usan datos sinteticos y no envian mensajes TCP.
No se ejecutan replay, probe, suites de transporte, consultas BD, lectura
fisica ni una prueba financiera. Los resultados 91/96 son del 2026-10-08.

## Criterios de aceptacion
- request serializado byte a byte conforme a referencia;
- STAN unico;
- respuesta correlacionada;
- RC interpretado;
- latencia registrada;
- evidencia en Switch/Core cuando aplique.
