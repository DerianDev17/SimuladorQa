# ADR-034: presets de estrés y configuraciones reutilizables

Fecha: 2026-11-03. Estado: implementado.

## Solicitud y alcance

El usuario pide terminar historial/exportación e implementar pruebas de estrés y
configuraciones. Se conserva el scheduler STRESS existente y se añaden presets
visibles de rampa y una biblioteca de planes. No se ejecutan operaciones reales
contra QA durante el desarrollo ni se elevan límites financieros o de carga.

## Decisión

- Presets a 3/5 TPS: rampa de 20 s, duración de 60 s y máximo 100 operaciones,
  conservando el primer límite alcanzado y retiro secuencial. Son parámetros
  locales editables; no certifican TPS sostenidos ni autorizan una ventana remota.
- Compartir `parseLoadRunDraft` entre ejecución y configuración para aplicar los
  mismos límites, sin persistir UUID de tarjeta ni solicitudes efímeras.
- Guardar un máximo técnico de 50 planes en una SQLite independiente, por medio
  de `LoadConfigurationStore`. ID UUID, revisión optimista y fechas UTC.
- Cada mutación confirma su auditoría en la misma transacción. La auditoría
  registra actor/equipo/acción/recurso/revisión; no los parámetros ni el nombre.
- Main comprueba QA y entradas y rechaza mutaciones durante la corrida. Renderer
  nunca accede a la base. Cargar requiere perfiles ATM activos de igual revisión;
  el inicio mantiene todas las validaciones financieras vigentes de Main.
- Una selección o preset solo prepara el formulario y limpia tarjeta. No inicia
  carga, no obtiene PIN ni repone reservas. Los nombres usan la protección de
  texto administrativo ya aplicada a casos.
- Después de un error/timeout de mutación se bloquean nuevas acciones hasta
  recargar. La base corrupta permanece intacta. Eliminar un plan no borra corridas.

## Validación

Unitarias para presets, progreso de rampa, límites y payloads. Integración SQLite
para CRUD, reinicio, revisión, límite, auditoría, bloqueo y corrupción. Electron
para edición/carga, ejecución STRESS sintética, persistencia, eliminación y
recuperación de timeout. Los recorridos de saldo/retiro actuales se conservan.
