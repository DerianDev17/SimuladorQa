# Revision del mockup de transacciones

Fuente: `mockup.png`, 1536 x 1024, revisada visualmente el 2026-10-06.
SHA-256: `EA79671B34C201C1D766E878F6F16D05BD54E45F3CDA7470D988AD4D38A1DFC3`.

El mockup define la composicion visual objetivo. Los mensajes, estados, codigos,
tarjeta, entidades y metricas de la imagen son ejemplos; no son evidencia QA.
La lectura del manual asociado se documenta en
[Extreme Mediator CMS v3.6](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Comparacion con la app actual

| Area del mockup | Estado actual | Siguiente trabajo |
| --- | --- | --- |
| Navegacion lateral, marca, ambiente permanente | Shell y QA/PREPROD implementados; catalogos separados | Ajustar navegacion y composicion al mockup, preservando estados reales |
| Datos Generales / Ejecutar / Resultado / Historial | Pasos implementados; solo Datos Generales activo, sin avance por revisar borrador | Conectar progreso a ejecucion e historial reales |
| Formulario de ATM, tarjeta, transaccion y cuenta | Seleccion ATM activo del ambiente, flujo MVP, ahorros/corriente y monto de borrador; catalogo CMS con fuente | Tarjeta y perfiles aprobados; reglas de elegibilidad/moneda pendientes |
| Lector fisico / tarjeta configurada | Lector y perfiles de tarjeta pendientes | Mostrar no disponible hasta obtener evidencia; PAN siempre enmascarado |
| Timeline ATM -> Switch -> Core -> respuesta | Panel implementado con estados pendientes y sin tiempos inventados | Eventos y tiempos reales; estado de observabilidad independiente del resultado transaccional |
| Inspector solicitud/respuesta, campos/RAW/HEX | Panel vacio y pestanas deshabilitadas; referencia CMS separada de ISO | Contrato de evidencia sanitizada fuera del Renderer; diccionario y tramas |
| Ultimas transacciones y metricas realtime | Sin historial transaccional/Control Plane | Estados vacios; agregados con ventana y origen identificados |
| Plantillas / Guardar como caso | Plantillas documentales saldo/retiro por cuenta implementadas, con fuente CMS; casos persistentes pendientes | Templates ISO aprobados y caso asociado a evidencia sanitizada |

## Correcciones necesarias al convertir el diseno en producto

- El saldo de ahorros aparece con processing code 310000. El manual lista 301000
  para consulta de ahorros y 302000 corriente (p. 20). El usuario indico el
  2026-10-06 seguir el documento: descartar 310000 de la imagen y usar el catalogo
  documentado en el formulario. El formato de F3 sigue pendiente de diccionario y
  tramas ATM: TODO-DATA CMS-ATM-MAPPING.
- El ejemplo F7 de la imagen no tiene su formato respaldado por este manual.
  El valor F70 002, monto cero y los demas campos tampoco prueban presencia,
  obligatoriedad ni encoding en una consulta. El inspector debe usar el diccionario
  ATM aprobado, sin completar automaticamente esos ejemplos.
- La tabla MTI del manual respalda la existencia de 0200/0210 (p. 23), pero no
  establece que todos los flujos utilicen esa pareja. Para reversos el inspector
  mostrara la familia aprobada y el original asociado.
- Los tiempos de las cuatro etapas de la imagen suman 618 ms, frente a 732 ms
  de total. Definir total como medicion real de extremo a extremo y medir etapas
  con sus propias fuentes; no presentar suma artificial ni tiempos de Core si
  el observador no los obtiene.
- Los contadores de la imagen suman 1236 resultados frente a 1248 transacciones.
  Definir si existen pendientes u otras categorias; no inventarlas para completar
  un total ni atribuir porcentajes a ventanas distintas.
- Conectado, tarjeta detectada, 5/5 online y aprobado requieren evidencia de su
  propia dependencia. Un cambio de ambiente debe invalidar el contexto de conexion
  y seleccion previo. Una respuesta ATM y evidencia Core son estados distintos.
- RAW y HEX deben recibir datos ya sanitizados: nunca ofrecer PIN Block, PIN,
  CVV, Track 2 ni PAN completo mediante una pestana alternativa o exportacion.
  Tokens, cuentas e identificaciones Core requieren minimizacion y control de
  acceso. Un lector disponible no prueba que se pueda generar el PIN Block.
- El boton de ejecucion mostrara el motivo de bloqueo. QA/PREPROD permanecen
  visibles; PROD no se habilita. No mostrar datos de ejemplo como resultados vivos.

## Criterios de aceptacion de la proxima pantalla

1. Mantener formulario, timeline e inspector como tres paneles en escritorio,
   con reorganizacion legible en ventanas pequenas.
2. Los cuatro pasos avanzan por eventos de una ejecucion; al inicio solo Datos
   Generales esta activo. Mostrar los requisitos pendientes sin cambiar su estado.
3. Mantener seleccion ATM dentro del ambiente y advertir si el perfil sigue en
   borrador. No convertirlo en perfil aprobado por haber guardado el formulario.
4. Mostrar inspector e historial vacios antes del primer resultado y errores
   cortos ante dependencia no disponible. Conservar originales/reversos asociados.
5. Verificar entradas, cambio de ambiente y estados de error en pruebas Electron.
   Probar ausencia de datos sensibles en campos, RAW, HEX e historial cuando esas
   funciones se implementen.

La preparacion visual/documental ya esta implementada, sin habilitar envios:
ver [alcance y pruebas](../implementation/TRANSACTION_PREPARATION.md).
La referencia visual sigue separada del contrato de red.
