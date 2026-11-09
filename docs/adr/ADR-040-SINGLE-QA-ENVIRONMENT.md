# ADR-040: único ambiente Qa

Fecha: 2026-11-09. Estado: implementado.

## Contexto y fuente

El usuario corrige explícitamente el alcance: «solo hay un ambiente se llama Qa
no exite preprod». Esta confirmación sustituye las suposiciones previas sobre
QA/PREPROD en ADR-003 y la separación de acceso de ADR-009. No define nuevas
reglas financieras, endpoints ni permisos del proveedor.

## Decisión

- Qa es el único ambiente operativo, con identificador técnico `QA`.
- El shell y Configuración muestran un indicador fijo. Main rechaza otros
  ambientes antes de despachar las llamadas IPC.
- `QaPreferencesStore` adapta el formato anterior: serializa lecturas/escrituras,
  respalda una preferencia PREPROD, añade una auditoría UTC/UUID y persiste QA.
  Un fallo deja el original intacto. Se conservan hasta 100 eventos.
- El formato de dominio histórico y sus pruebas de aislamiento se conservan para
  leer registros existentes. No se migran ni fusionan catálogos o diarios.
- Observación se habilita en Qa y mantiene validación de filtros, límites,
  protección de datos, permisos y TLS. Los adaptadores SQL aceptan la etiqueta
  privada QA y la antigua PREPROD para la fuente existente.
- Una evaluación histórica del esquema no se promueve a certificación del
  contexto Qa. La falta de validación del proveedor sigue afectando únicamente
  a los flujos que dependen de ella.

## Validación

Pruebas unitarias del guard IPC; integración de preferencias (inicio, persistencia,
respaldo, concurrencia, entradas inválidas y fallo de respaldo) y observador
(consulta Qa, filtros, timeout/dependencia ausente); E2E de configuración por
páginas, migración/reinicio, rechazo IPC y consulta Qa sin credencial configurada.
Se usan directorios temporales y datos sintéticos; no se consulta el host real.
