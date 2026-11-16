# Evidencia y exportación de carga

## Disponible

En QA, abrir **Carga y estrés → Ver historial de carga → Ver detalle** y elegir
**Exportar CSV**, **Exportar JSON** o **Exportar HTML**. El diálogo nativo permite elegir el destino
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
- HTML UTF-8 autónomo e imprimible: resumen, configuración, latencias y detalle
  de todas las operaciones con UUID/STAN/RRN disponibles. No necesita conexión
  ni ejecuta scripts; usa estilos locales y una política que bloquea recursos
  externos. Abrir el archivo en un navegador y usar **Imprimir** para papel o PDF.
  Los estilos de impresión usan A4 horizontal y repiten la cabecera de la tabla.
  TPS y latencias del resumen se presentan con dos decimales; CSV/JSON conservan
  los valores sin ese redondeo. Un valor positivo menor que 0,01 se muestra como
  **<0.01**, para no confundirse con cero. Los montos conservan su texto decimal exacto.
  Los datos ausentes se muestran como **Sin dato**, sin convertirlos en cero.
- El plan conserva operación, monto por retiro como texto decimal, moneda USD
  cuando aplica, ATM/revisión (JSON/HTML), límites, rampa y concurrencia.
- UUID de corrida/solicitud/transacción, STAN, RRN y terminal se incluyen cuando
  están registrados. No se inventan UTRNNO ni identidad de ATM ausente en una
  operación antigua con varios perfiles. Importar STAN/RRN como texto en Excel
  para conservar ceros iniciales.
- Fechas UTC en los tres formatos; conversión local solo en la UI. JSON incluye
  tiempos por etapa cuando existen; CSV incluye duración de transporte por operación.

TPS usa envíos sobre tiempo total. Percentiles usan respuestas recibidas; sin
respuestas permanecen nulos/vacíos. Errores incluye timeouts, y los contadores no
son categorías excluyentes. Se preservan resultados inciertos: el archivo no
certifica débito, saldo final ni conciliación en Core.

## Lectura visual del informe HTML

- Barras de TPS observado frente a objetivo, con origen cero y una escala común
  calculada con el mayor valor; el observado puede superar al objetivo sin recorte.
  En estrés, el objetivo se identifica como pico de rampa, no promedio esperado.
- Barras de p50/p90/p95/p99 con origen cero y escala común en milisegundos.
  Se calculan solo con respuestas recibidas; no hay barras de latencia cuando
  faltan muestras. El texto conserva los valores y el número de muestras.
- Un aviso visible destaca la cantidad de envíos sin respuesta registrada y
  mantiene su incertidumbre financiera. No equipara timeout con ausencia de débito.
- Las gráficas funcionan sin JavaScript, tienen etiquetas de texto y se adaptan
  a pantalla estrecha e impresión. El color no es la única forma de leerlas.

La prueba E2E de `load-history.spec.ts` genera ejemplos HTML y PNG en `artifacts/`
(`load-report-completed` y `load-report-uncertain`). Están marcados como datos
sintéticos y no provienen de operaciones reales ni validan capacidad del host.

## Seguridad y errores

La proyección usa una lista explícita de campos; excluye mensajes libres, PIN,
PIN Block, PAN, Track 2, EMV, claves, credenciales y tramas. Las celdas CSV se
escapan y neutralizan frente a fórmulas. Los secretos no llegan al diálogo.
HTML escapa el contenido dinámico como texto y conserva la misma proyección
pública. Ningún formato consulta el archivo cifrado de Mensajes de ADR-046.

El archivo se escribe en un temporal junto al destino y se reemplaza al terminar.
Se impide escribir en el directorio de datos de la aplicación o usar otra
extensión. El nombre debe conservar `.csv`, `.json` o `.html`: no se añade una extensión
después de confirmar el destino en el diálogo. Los errores no exponen rutas
privadas. Una sola exportación puede mantener diálogo abierto; el plazo es de
dos minutos. Tras un timeout, cerrar el
diálogo y revisar el destino antes de repetir. Una selección tardía no inicia una
escritura; un guardado que ya estaba terminando requiere comprobar el destino.

## Pendiente

Comparación de corridas y exportación general de los diarios financieros
no forman parte de esta entrega. No se implementa envío automático de archivos.

Diseño: [ADR-033](adr/ADR-033-LOAD-HISTORY-EXPORT.md).
Uso del historial: [guía de carga](implementation/LOAD_TEST.md).
