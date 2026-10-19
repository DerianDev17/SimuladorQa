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
  F22, F25, F28, F32, F35, F37-F39, F41-F43, F48-F49, F55, F60 y F95. Es una
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

## Efecto en el alcance del simulador

La evidencia ya disponible establece `0420/0430` para los dos ejemplos del
enlace ATM y esta DLL respalda que la aplicacion ATM prepara `0420`. Aun falta
un snapshot transaccional original seguro y correlacionado para reconstruir el
reverso en el simulador; tambien falta la fuente del evento remoto de tarjeta
retenida. La DLL confirma rutas y dependencias, pero no sustituye golden
samples de campos privados ni contrato aprobado para producirlas.

Mantener deshabilitado el envio de reversos hasta que exista la correlacion
original, la fuente del evento de retencion y validacion de la solicitud
generada contra muestras QA sanitizadas. No reutilizar la rutina de timeout
como reverso por retencion.
