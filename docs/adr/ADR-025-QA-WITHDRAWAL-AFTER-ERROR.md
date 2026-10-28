# ADR-025: nuevas transacciones QA después de un retiro con error

Fecha: 2026-10-28. Estado: implementado por instrucción explícita del usuario.

## Problema y decisión

El retiro ATM20521/STAN 900125 con RC 59 quedaba REQUIRES_REVIEW. Main bloqueaba
cualquier UUID nuevo y la UI volvía a cargarlo al seleccionar retiro. El usuario
solicita poder lanzar más transacciones aunque una anterior termine con error.

En QA, un retiro finalizado y guardado permite una solicitud nueva, también tras
timeout, respuesta inválida, resultado por revisar o reverso terminado sin
confirmación. La incertidumbre financiera sigue en el registro original; no se
reclasifica RC 59, no se afirma ausencia de débito y no se concilia ni reenvía.
Esta decisión sustituye el bloqueo general por resultados inciertos descrito
en WITHDRAWAL.md y REVERSAL.md. No introduce reglas ISO ni extiende ambientes.

## Comportamiento y límites

- «Nueva transacción» libera el formulario conservando sus datos y el historial.
  Exige nueva lectura de tarjeta; el envío vuelve a solicitar PIN y generar
  seguridad, UUID y secuencia mediante los proveedores existentes.
- Los errores históricos terminados no se restauran como operación activa al
  abrir el formulario. Permanecen consultables en el historial.
- El mismo requestId devuelve su resultado anterior; cambiar sus datos provoca
  conflicto. Se conserva la exclusión de operaciones simultáneas.
- PENDING, ejecución/reverso sin finalizar y STORAGE_ERROR mantienen recuperación
  obligatoria. No se habilita otro retiro sin registro durable de finalización.
  Un timeout de IPC sin resultado recuperado tampoco libera el formulario.
- No se borran ni migran registros históricos, perfiles, claves o reservas.

## Verificación

Regresión TCP local con RC 59, RC 96 y timeout: falla con el bloqueo anterior y
pasa con la nueva regla. Tras reabrir el diario, el ID antiguo no envía bytes y
una solicitud nueva consume su propio contexto y STAN; conserva ambos registros.
Pruebas de dominio cubren resultados inciertos, almacenamiento y reversos activos.
Electron verifica historial RC 59, error nuevo, limpieza explícita, lectura nueva
y retiro posterior con otro importe, usando datos y transporte sintéticos.

Validación: 987 pruebas unitarias/integración seleccionada y cuatro E2E Electron
correctas; lint, typecheck, formato de código, build y escaneo de secretos.
No se enviaron transacciones al switch durante el desarrollo.
