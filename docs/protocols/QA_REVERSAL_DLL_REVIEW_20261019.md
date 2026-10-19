# Revision estatica de DLLs de reverso QA — 2026-10-19

## Alcance y procedencia

Se inspeccionaron como metadatos e IL las DLL entregadas para esta revision; no
se cargaron ni ejecutaron. Solo se conserva la huella, el inventario de metodos
y las reglas de flujo necesarias para evaluar el simulador. No se copian bytes,
parametros privados ni campos de tarjeta.

| Assembly | Version de archivo | SHA-256 |
| --- | --- | --- |
| ATMIso8583 | 1.0.0.0 | `8baf6feeaefd2e59b298f7e44e8c47eb35f1a51f623d99cc05508b1753c17a80` |
| SetInitialTransactionCoonecta | 1.0.0.0 | `7ebe533e3574544eeeb9c6dabe3d9d46c010bbf39c5dcdfac836fa484b4b6c88` |

La ATMIso8583 recibida no es byte-identica a la version archivada en
`ISOBASEI_REVIEW.md`; por eso las conclusiones de esta nota se atribuyen a la
huella indicada aqui.

## Flujo observado en ATMIso8583

- `ProcesarTransaccion` llama a `GenerarReversoIso8583` como una etapa separada
  de la transaccion procesada.
- `ArmaMsgIso8583` llama a `GenerarReversoTimeOut` en una rama de error del
  armado/envio. El builder de timeout no equivale por si solo al reverso por
  retencion de tarjeta.
- Ambos builders crean una solicitud con MTI `0420`. El builder de timeout
  copia explicitamente de la solicitud anterior F2, F3, F4, F11-F15, F18-F19,
  F22, F25, F28, F32, F35, F37-F39, F41-F43, F48-F49, F55 y F60. F95 se
  construye con Dispensed/Surcharge, no se copia. Es una
  regla de esa ruta y no se aplica al flujo de retencion sin compararla con la
  muestra real.
- El builder general toma valores de `Param`, la solicitud/respuesta ISO y
  datos del contexto local; no es un transformador puro de un `0200` guardado.
  Usa contador/serial y fecha/hora al armar la solicitud. Su salida depende de
  componentes ATM, configuracion y estado que no existen en el simulador actual.

Esta inspeccion confirma que la aplicacion ATM tiene rutas de generacion de
reverso, pero no identifica en estas dos DLL el evento de captura/retencion de
tarjeta ni demuestra que esa sea la condicion que llama al builder general. El
disparador funcional de retencion sigue respaldado por la confirmacion del
usuario y las dos transacciones PCAP, no por un evento del lector local del
simulador.

## SetInitialTransactionCoonecta

El assembly contiene `Inicializa.Moneda`, `Inicializa.Idioma` y
`Inicializa.GetXmlField`, ademas de ciclo de vida. No contiene metodos de
reverso ni un manejador identificable de tarjeta retenida. No aporta el origen
del evento ATM ni completa el contrato de correlacion/idempotencia del
simulador.

## Ampliacion del analisis: prueba temporizada solicitada

El usuario identifica al Core como autorizador, estima 35–50 segundos sin
confirmar el valor y solicita que el simulador envie el reverso despues del
retiro. Esto define un disparador explicito de prueba; no acredita un evento
de retencion ni el timeout configurado en Core.

La inspeccion adicional de IL de `GenerarReversoIso8583` identifica:

- F28: signo C y surcharge en centavos. Se implementa solo surcharge cero.
- F38: NroAutoriza del retiro; F39: 00. Solo aplica tras aprobacion completa.
- F48: EO, A, BR, CO, F90, R, X, D opcional, TC, S2 opcional, DD, en ese
  orden. F90 privado contiene longitud 42 y los datos del original.
- F90: 0200 + STAN original + F7 original + adquirente a 11 digitos +
  forwarding a cero (11 digitos). ISOBASEI lo codifica en 21 bytes binarios.
- F60: un byte 22 hexadecimal. F95: Dispensed a 12 digitos, 12 ceros,
  surcharge a 9 digitos, 9 ceros; la prueba sin efectivo/comision produce 42 ceros.
- `GetDataEMVMastercardR` llama `CEmvTags.GetTagsByList` (MsgFormatDotNet) con
  la lista 9F10/95. El metodo selecciona estos tags del TLV recibido, sin
  generar una AC ni alterar su valor. `GetDataEMV` agrega envolvente 01/00/longitud.

El constructor de timeout usa **0100** en F90; el general y las dos capturas
usan **0200**. Se registra esta diferencia y no se aplica la ruta timeout al
nuevo flujo aprobado. Su validacion permanece pendiente para TIMEOUT_REVERSAL.

## Contraste offline con las dos capturas

El constructor del simulador se ejecuto offline sobre cada 0200/0210 recibido.
El conjunto de campos y todos los bytes de campos del 0420 coinciden salvo
F12 (hora de generacion) y F55 (IAD 9F10 del estado EMV original frente al
estado posterior del ATM). F28/F48/F60/F90/F95 coinciden en ambas muestras.
El filtro preserva los valores actuales de 9F10/95: no fabrica el cambio IAD
observado ni lo toma de otra tarjeta. La prueba temporizada no completa el
segundo GENERATE AC ni reproduce la retencion fisica del ATM.

Ambos 0430 tienen F90 con la hora desplazada +5 respecto al 0420. No son ecos
binarios exactos de F90. El codec valida original MTI/STAN e instituciones,
ademas de PAN/F3/STAN/RRN/terminal del mensaje; la hora de F90 no decide la
correlacion. Ambas respuestas reales se reconocen offline como 00. No se
generaliza una regla de zona horaria a partir de estos dos casos.

Los keepalives TCP de un byte con secuencia anterior se excluyeron del
reensamblado; los mensajes financieros se reconstruyeron completos, sin
solapamientos contradictorios. No se versionan PCAP, DLL, scripts de inspeccion
con datos privados ni payloads originales. Las pruebas automatizadas usan
fixtures sinteticos. Falta validar la nueva prueba temporizada contra el host
QA; la verificacion local no acredita restitucion de saldo en Core.
