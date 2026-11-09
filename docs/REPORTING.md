# Evidencia y exportación de carga

## Disponible

En QA, abrir **Carga y estrés → Ver historial de carga → Ver detalle** y elegir
**Exportar CSV** o **Exportar JSON**. El diálogo nativo permite elegir el destino
y confirmar la sustitución de un archivo. Cancelar no escribe nada.

Solo se exportan corridas cerradas: completadas, detenidas, fallidas o interrumpidas.
Una corrida activa requiere terminar y actualizar el detalle. Main vuelve a leer
el registro guardado, valida UUID/formato y genera el archivo; Renderer no aporta
rutas, contenidos ni datos transaccionales para la exportación.

## Contrato de evidencia v1

- JSON UTF-8: `schemaVersion: 1`, `evidence: LOCAL_LOAD_RUN`, fecha de exportación
  UTC, aviso de alcance y objeto `run` con plan, métricas y operaciones.
- CSV UTF-8 con BOM, separador coma, cabecera y CRLF. Una fila por operación repite
  el resumen de la corrida. Si no hay operaciones, se conserva una fila de tipo
  `RUN`; las demás tienen tipo `TRANSACTION`. No sumar métricas repetidas por fila.
- El plan conserva operación, monto por retiro como texto decimal, moneda USD
  cuando aplica, ATM/revisión (JSON), límites, rampa y concurrencia.
- UUID de corrida/solicitud/transacción, STAN, RRN y terminal se incluyen cuando
  están registrados. No se inventan UTRNNO ni identidad de ATM ausente en una
  operación antigua con varios perfiles. Importar STAN/RRN como texto en Excel
  para conservar ceros iniciales.
- Fechas UTC en ambos formatos; conversión local solo en la UI. JSON incluye
  tiempos por etapa cuando existen; CSV incluye duración de transporte por operación.

TPS usa envíos sobre tiempo total. Percentiles usan respuestas recibidas; sin
respuestas permanecen nulos/vacíos. Errores incluye timeouts, y los contadores no
son categorías excluyentes. Se preservan resultados inciertos: el archivo no
certifica débito, saldo final ni conciliación en Core.

## Seguridad y errores

La proyección usa una lista explícita de campos; excluye mensajes libres, PIN,
PIN Block, PAN, Track 2, EMV, claves, credenciales y tramas. Las celdas CSV se
escapan y neutralizan frente a fórmulas. Los secretos no llegan al diálogo.

El archivo se escribe en un temporal junto al destino y se reemplaza al terminar.
Se impide escribir en el directorio de datos de la aplicación o usar otra
extensión. El nombre debe conservar `.csv` o `.json`: no se añade una extensión
después de confirmar el destino en el diálogo. Los errores no exponen rutas
privadas. Una sola exportación puede mantener diálogo abierto; el plazo es de
dos minutos. Tras un timeout, cerrar el
diálogo y revisar el destino antes de repetir. Una selección tardía no inicia una
escritura; un guardado que ya estaba terminando requiere comprobar el destino.

## Pendiente

HTML, comparación de corridas y exportación general de los diarios financieros
no forman parte de esta entrega. No se implementa envío automático de archivos.

Diseño: [ADR-033](adr/ADR-033-LOAD-HISTORY-EXPORT.md).
Uso del historial: [guía de carga](implementation/LOAD_TEST.md).
