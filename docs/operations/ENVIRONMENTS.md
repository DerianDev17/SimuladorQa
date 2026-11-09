# Ambiente Qa

La aplicación tiene un único ambiente, **Qa**, confirmado por el usuario el
2026-11-09. No existe PREPROD como ambiente operativo. Producción sigue bloqueada.

La interfaz muestra Qa como indicador fijo. Configuración mantiene páginas
separadas para estación, envío, dispositivos y perfiles, evidencia, requisitos y
auditoría; no permite seleccionar ni crear otros ambientes.

El identificador persistido sigue siendo `QA` para conservar los ajustes y
catálogos existentes. Main rechaza por IPC solicitudes de otros ambientes,
incluso si el contexto viene dentro de un borrador.

Al encontrar una preferencia antigua `PREPROD`, Main respalda el archivo como
`preferences.json.<UUID>.backup.json`, registra la corrección a QA con fecha UTC
y guarda de forma atómica. Un error de respaldo bloquea esa migración sin
sobrescribir el original. Los archivos inválidos también se conservan.
Los catálogos, diarios y ajustes históricos no se borran ni se mezclan con QA.
El lector del formato histórico sigue aceptando sus etiquetas para poder
conservarlos; esto no habilita otro ambiente en la aplicación.

Inicio y Observación consultan Mediator desde Qa. El archivo privado nuevo usa
`environment: "QA"`; se admite la etiqueta antigua `PREPROD` para la misma fuente
ya configurada, sin cambiar servidor, credenciales, SQL, TLS ni permisos.
Las evidencias históricas no se reinterpretan automáticamente como certificación
vigente del destino. Ver [ADR-040](../adr/ADR-040-SINGLE-QA-ENVIRONMENT.md).
