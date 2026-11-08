# Revisión técnica — 2026-11-07

## Implementación posterior de las mejoras

Aplicadas por solicitud del usuario:

- Persistencia de carga en worker, cierre ordenado y fallo sin reenvío; migración
  transaccional a índices de estado, operación y fecha. Ver [ADR-039](../adr/ADR-039-LOAD-STORAGE-WORKER.md).
- Presentación separada en `CardReaderPanel`, `TransactionReferenceView` y
  `LoadResultsView`. Los componentes originales pasan de 926→583, 1.764→1.599 y
  916→655 líneas respectivamente. Los bloqueos financieros siguen en sus responsables
  originales; las extracciones no trasladan controles de ejecución a la presentación.
- Resultados de carga memoizados, métricas derivadas una vez y sondeo cada 5 s
  en reposo/corrida cerrada, manteniendo 1 s en actividad o incertidumbre. Los
  comandos fuerzan actualización inmediata y no se solapan consultas.
- Selector de ATM histórico por alias/terminal con alternativa UUID para eliminados;
  encabezados legibles de Mediator, ambiente y fecha de actualización explícitos;
  selector PREPROD sin recorte visual.
- ESLint/TypeScript-ESLint actualizados y override acotado de `minimatch` validado.
  Auditoría final: **cero vulnerabilidades**. Ver [detalle](LINT_DEPENDENCIES.md).

Validación final: formato, lint, tipos, seguridad y build correctos; **1.038
unitarias, 285 de integración y 40 recorridos Electron correctos**. La prueba nueva
de selección de ATM necesitó ajustar el locator al rol `combobox`; tras corregir
esa prueba, el recorrido completo pasó. Se verificaron también filtros inválidos,
ATM eliminado, timeout, exportación, reinicio, sondeo en reposo, saldo/retiro/reverso
y conservación del borrador. No se ejecutaron transacciones reales.

### Medición sintética de historial

`node tooling/benchmark-load-history.mjs`: 1.000/10.000/50.000 corridas sintéticas
sin items, 15 consultas por combinación, conexión caliente y filtros sin coincidencias.
Compara el mismo adaptador/validación sin índices, con índices y dentro del worker.
El caso sin índices no representa exactamente el ejecutable anterior: incluye la
comprobación nueva de JSON inválido. Datos completos en
[resultados JSON](LOAD_HISTORY_BENCHMARK_20261107.json).

En 50.000 corridas, p95 local:

| Consulta | Main sin índices | Worker con índices |
| --- | --- | --- |
| Estado | 142,75 ms | 1,78 ms |
| Operación | 130,92 ms | 1,53 ms |
| Fecha | 143,20 ms | 2,21 ms |

Para el filtro ATM, que aún recorre JSON, la demora p95 del temporizador de Main
baja de **133,26 ms** (adaptador indexado en Main) a **16,25 ms** (mismo adaptador
en worker), mientras la consulta tarda 125,98 ms. El RSS observado al final de esas
fases fue 55,5/64,2 MiB; incluye todo el proceso y no mide una asignación aislada.
Son observaciones exploratorias de esta estación, sensibles a caché y carga del SO;
no son SLA, medición de hardware ni TPS del Switch.

La carga diferida de vistas secundarias queda como optimización opcional posterior;
no se atribuye una mejora de arranque. El bundle resultante es 419,39 kB (121,65 kB
gzip). Tampoco se añade una tabla auxiliar de ATM: el worker ya retira ese recorrido
del hilo de Main y la evidencia no exige duplicar hoy ese dato.

Los apartados siguientes conservan el diagnóstico anterior a esta implementación.

## Alcance y resultado

Revisión de arquitectura, ciclo de vida de la UI, sondeos IPC, historial SQLite,
herramientas de validación y dependencias. Se inspeccionaron rutas representativas;
no constituye una auditoría exhaustiva de ISO/EMV ni una medición del host.
Los cuatro archivos que ya tenían cambios de exportación se conservaron intactos.

## Deuda corregida

1. **Filas de otro ambiente en Inicio.** Al pasar de QA a PREPROD solo se limpiaban
   error y pausa. Las filas, filtros y fecha anterior seguían visibles hasta una
   consulta exitosa, incluso indefinidamente ante fallos. `App` identifica ahora
   `DashboardView` por ambiente, igual que las otras vistas operativas. React
   reinicia todo su estado y ejecuta la limpieza del sondeo anterior. Se retira el
   efecto de reinicio parcial. Fuente técnica:
   [identidad y reinicio de estado en React](https://react.dev/learn/preserving-and-resetting-state).
2. **Error de conexión obsoleto.** Un sondeo exitoso actualizaba la conexión pero
   conservaba su error previo. Se separan errores de consulta y de acción manual:
   recuperar el estado limpia el primero sin esconder un Conectar/Desconectar fallido.
3. **Trabajo redundante en Inicio.** Los cambios del indicador TCP volvían a filtrar
   hasta 50 filas. La proyección depende ahora solo de filas, terminal y búsqueda;
   normaliza el término una vez por cálculo. Es una reducción local de trabajo,
   sin atribuirle una mejora medida de latencia o TPS.
4. **Acceso a la tabla.** El área desplazable tiene nombre y foco de teclado; la
   pausa expone su estado a tecnologías de asistencia.

Las reglas de transporte, exclusión financiera, PIN/EMV, persistencia y bloqueo de
producción no cambian. No se ejecutaron operaciones contra QA/PREPROD reales.

## Mejoras propuestas, por prioridad

| Prioridad | Evidencia en el código | Cambio propuesto | Criterio para validar |
| --- | --- | --- | --- |
| Alta | `SqliteLoadRunStore` usa `DatabaseSync` desde Main; filtros de fecha/estado/operación recorren JSON sin índices dedicados. | Medir consultas con historiales sintéticos de 1.000, 10.000 y 50.000 corridas. Si bloquean Main, mover el adaptador a un worker detrás de sus puertos, usando el catálogo como precedente. Evaluar columnas/indexación de metadatos y una tabla de ATM por corrida en una migración aparte. | Comparar p50/p95, demora del event loop y memoria; conservar orden, paginación, recuperación y durabilidad. La paginación actual ya limita la respuesta a 20 corridas. |
| Alta | `TransactionWorkspace.tsx`: 1.764 líneas; `CardReaderView.tsx`: 926; `LoadTestView.tsx`: 916. | Extraer por responsabilidad: selección/vigencia de tarjeta, recuperación de ejecución, configuración de carga y presentación de resultados. Mantener los bloqueos financieros bajo un único responsable. | Los recorridos de timeout, respuesta tardía, cambio de ambiente y doble clic deben conservar comportamiento. Hacer un módulo por commit. |
| Alta | `npm audit` reporta 10 entradas moderadas en herramientas ESLint/TypeScript-ESLint, con raíz en `minimatch`. | Actualizar la cadena a versiones compatibles con la corrección en un cambio independiente. El arreglo automático propone degradaciones/cambios mayores; requiere comprobar compatibilidad antes de aplicarlo. | Auditoría y validaciones completas; ninguna regresión en límites de arquitectura de ESLint. |
| Media | `LoadTestView` solicita un snapshot completo cada segundo y vuelve a calcular métricas/series, incluso tras finalizar una corrida. | Medir bytes IPC y tiempo de render; considerar revisión de snapshot o eventos para omitir resultados idénticos. Derivar métricas una vez por snapshot. | Contadores y último resultado correctos, recuperación tras IPC perdido, sin consultas solapadas ni reintentos de operaciones. Con el límite actual de 100 operaciones no se justifica virtualizar por defecto. |
| Media | La tabla de Inicio usa nombres técnicos (`TrnCode`, `RetCode`, `TraceId`) y la selección de ATM histórico requiere UUID. | Mostrar etiquetas comprensibles con código técnico secundario; ofrecer alias + Terminal ID para ATM conocidos y mantener búsqueda por UUID para eliminados. Mostrar claramente ambiente, consulta en curso y antigüedad de datos. | Operador identifica contexto y estado con teclado y a 200 % de zoom, sin interpretar códigos no documentados. Mantener la hora SQL literal hasta resolver su zona. |
| Baja | Build local: un JS de aproximadamente 418 kB (121 kB gzip); `App` importa todas las vistas. | Medir arranque en la estación objetivo y evaluar carga diferida de vistas secundarias. | Comparar tiempo hasta interacción y navegación posterior; no desmontar el formulario transaccional cuando debe conservar su estado. Gzip no representa el tamaño que Electron lee localmente. |

La prioridad es una propuesta de ingeniería, no un resultado de benchmark. No se
recomienda aumentar concurrencia TCP ni reutilizar sockets para buscar más TPS:
los contratos pendientes siguen en `TODO_DATA.md` y ADR-029.

## Dependencias

Auditoría del lockfile en esta revisión: 10 entradas moderadas, cero altas y cero
críticas. Corresponden a una cadena transitiva de desarrollo, no a diez causas
independientes. El aviso declara afectadas versiones `>=7.0.0 <11.0.1` de
`minimatch`, con corrección en `11.0.1`:
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
No se modificó el lockfile ni se aplicaron overrides de versiones mayores.

## Validación

- Formato, lint, TypeScript strict, chequeo de secretos y build: correctos.
- Suite unitaria completa: 1.034 pruebas en 65 archivos.
- Suite de integración completa: 280 pruebas en 44 archivos.
- Selección de recorridos Electron: 10 pruebas correctas; incluye tres regresiones
  nuevas para aislamiento de ambiente con timeout, respuesta tardía y recuperación
  del sondeo sin ocultar errores manuales. También recorre pausa/filtros, catálogos,
  recuperación de inicio de carga y conexión TCP local.
- Inspección visual de Inicio con datos sintéticos: composición conservada. El
  selector superior recorta visualmente PREPROD a «PREPRO» en la captura; conviene
  ampliar su ancho mínimo y verificarlo junto al diseño estrecho en un cambio UI.

No se ejecutó toda la suite E2E ni se midió rendimiento con hardware/host reales.
Las cifras del bundle describen esta compilación; no son una medición de arranque.
