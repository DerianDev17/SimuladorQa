# ADR-030: Proyección ISO visible y mensajería del reverso

Fecha: 2026-10-29. Estado: implementado; validación financiera del reverso en host pendiente.

## Solicitud y alcance

El usuario solicita datos ISO legibles y confirma el flujo **retiro aprobado
seguido de reverso**. Se conserva el contrato QA/LOCAL/ahorros del constructor
existente: 0200, aprobación completa 0210/00, espera configurada 1–30 segundos,
un 0420 y su 0430. No se cambia el wire, F90, la correlación ni la política de
comisiones. Las fuentes siguen siendo ISOBASEI, las DLL y los dos pares QA de
`docs/protocols/QA_REVERSAL_DLL_REVIEW_20261019.md`.

## Decisión

- El selector incorpora Retiro aprobado + reverso, respaldado por la misma
  solicitud WITHDRAWAL_APPROVED/reversalDelaySeconds ya validada por Main.
- El diario del hijo conserva opcionalmente la proyección 0420/0430. Guarda
  la solicitud antes de intentar el write y la respuesta solo tras correlación.
  Los registros anteriores siguen siendo válidos sin ese atributo.
- El cierre/cancelación durante espera o persistencia impide el 0420 posterior.
  La transmisión real se distingue de la intención durable antes del write.
  La exclusión del enlace no se libera hasta cerrar el socket.
- La pantalla mantiene resultados independientes y muestra el RC del reverso
  cuando corresponde, sin confundirlo con el RC 00 del retiro.

## Datos visibles y protección

F42/F43 muestran identificación/ubicación del comercio; F44 muestra texto de
respuesta sin asignarle significado financiero. Se decodifica exclusivamente
el subconjunto imprimible CP037 contrastado con Encoding.GetEncoding(37) de
Windows. Los números de 12–19 dígitos, también separados por espacios/guiones,
se enmascaran en esos textos antes de persistir o enviar por IPC.

F55 conserva la envolvente VISA y el parser TLV existentes. Se muestran únicamente
los valores de una lista cerrada de tags públicos generados por QaEmvOperation:
82, 95, 9A, 9C, 5F2A, 5F34, 9F02, 9F03, 9F09, 9F1A, 9F33, 9F34, 9F35 y 9F40,
con longitud exacta. Los demás tags figuran con máscara fija, incluidos IAD,
criptogramas, PAN y Track 2. Un TLV inválido no altera el resultado financiero;
permanece protegido. No se transforma su valor privado a texto.

F90/F95 del reverso se muestran según el codec ya documentado. F2 sigue
enmascarado; F14/F35/F48/F52/F53/F60/F62/F63 y los contenidos EMV restantes
siguen protegidos. No se habilita RAW/HEX de la trama ni se guarda material
de autenticación. La validación del diario impide inyectar contenidos privados
en tags protegidos o añadir atributos arbitrarios.

## Límites y validación

La ampliación aplica a nuevas ejecuciones. Los valores omitidos en registros
antiguos no se reconstruyen desde otra tarjeta, perfil o captura. TIMEOUT_REVERSAL
y reverso de un registro histórico permanecen fuera del alcance confirmado.

Pruebas: codec/proyección y validación de entradas, TCP loopback con aprobación,
rechazo, respuesta ajena, fragmentación, duplicados, timeout y cancelación,
persistencia/recuperación sin repetir, e interfaz de los cuatro mensajes. No se
ejecutan transacciones financieras QA ni se afirma restitución en Core.
