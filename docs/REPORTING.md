# Evidencia y exportación de carga

## Disponible

En QA, abrir **Carga y estrés → Ver historial de carga → Ver detalle** y elegir
**Exportar CSV**, **Exportar JSON**, **Informe de negocio** o **Informe técnico**.
Los informes son archivos HTML independientes. El diálogo nativo permite elegir el destino
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
- HTML técnico UTF-8 autónomo e imprimible: resumen, configuración, latencias y detalle
  de todas las operaciones con UUID/STAN/RRN disponibles. No necesita conexión
  ni ejecuta scripts; usa estilos locales y una política que bloquea recursos
  externos. Abrir el archivo en un navegador y usar **Imprimir** para papel o PDF.
  Los estilos de impresión usan A4 horizontal y repiten la cabecera de la tabla.
  TPS y latencias del resumen se presentan con dos decimales; CSV/JSON conservan
  los valores sin ese redondeo. Un valor positivo menor que 0,01 se muestra como
  **<0.01**, para no confundirse con cero. Los montos conservan su texto decimal exacto.
  Los datos ausentes se muestran como **Sin dato**, sin convertirlos en cero.
- HTML de negocio: propósito y alcance, conclusión basada en hechos registrados,
  envíos/respuestas/aprobaciones, incertidumbre, velocidad en lenguaje común y
  próximos pasos sugeridos. No contiene tablas de operaciones ni sus UUID/STAN/RRN.
  Conserva la referencia común de corrida y la fecha de exportación para localizar
  el informe técnico correspondiente. No representa autorización ni certificación.
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

## Informes separados por audiencia

| Audiencia | Contenido para presentación | Archivo sugerido |
| --- | --- | --- |
| Negocio | Qué se probó, qué ocurrió, qué falta confirmar y próximos pasos; estado en español, límites de la prueba y mediciones explicadas | `carga-negocio-<runId>.html` |
| Técnica | Configuración, tasas y percentiles, tiempos por etapa con cobertura, fórmulas y límites de interpretación, detalle de cada operación | `carga-tecnico-<runId>.html` |

La narrativa se deriva de la evidencia pública: distingue ausencia de envíos,
rechazos/errores, resultados inciertos, cierre de corrida y rampa de estrés.
El máximo de operaciones es un límite, no una meta de cobertura ni un porcentaje
de avance. Comparar promedio con objetivo no determina capacidad sostenida.

Los tiempos por etapa muestran muestras / operaciones, promedio, mínimo, máximo
y suma, usando solo mediciones presentes. Una ausencia no cuenta como cero.
Las filas no se suman entre sí; concurrencia puede hacer que los tiempos acumulados
superen la duración de pared. Se explican TPS y percentiles sin inventar SLA.

El IPC admite `audience: BUSINESS | TECHNICAL` únicamente con `format: HTML`;
si falta, conserva compatibilidad generando el informe técnico. Main rechaza otras
audiencias o su combinación con CSV/JSON. Ambos informes utilizan el mismo
guardado, validación QA, exclusión de diálogos, cancelación y timeout.

**TODO-DATA LOAD-REPORT-ACCEPTANCE:** faltan criterios aprobados de aceptación
por escenario (objetivos sostenidos, latencia, tolerancia de errores, muestra y
evidencia financiera requerida). Solo queda bloqueado emitir un veredicto de
aceptación de negocio; la presentación de hechos y ambos informes están disponibles.

## Lectura visual del informe HTML

- Negocio se organiza en cuatro secciones numeradas: resumen para decisión,
  alcance y hallazgos, rendimiento y pendientes, y próximos pasos. La conclusión
  precede a los indicadores; los resultados inciertos se destacan sin asignar
  una calificación de aceptación. Las acciones conservan su carácter sugerido.
- Ambos informes incluyen un índice de enlaces internos, utilizable con teclado,
  que permite navegar sin scripts ni conexiones externas y se oculta al imprimir.
- Cabecera con identidad de la aplicación, estado registrado, correlación de la
  corrida y fechas UTC. El resumen prioriza envíos, respuestas, TPS observado y
  p95; los demás contadores se conservan en una franja secundaria compacta.
- Secciones numeradas, tipografía monoespaciada para identificadores y filas
  alternadas en el detalle. Los envíos sin respuesta se destacan también en su
  fila, manteniendo resultado y correlación originales. La versión de impresión
  usa cabecera clara para reducir consumo de tinta.
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
`load-report-business.html/.png` muestra la lectura de negocio independiente.

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
