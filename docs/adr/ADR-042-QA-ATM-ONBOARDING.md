# ADR-042: asistente de alta y verificación ATM QA/205

Fecha: 2026-11-11. Fuente: solicitud del usuario de implementar el asistente
con ATM20521 como plantilla, validación automática y prueba guiada de saldo.

## Decisión

Perfiles ATM ofrece **Crear ATM QA/205** y **Verificar y probar**. El asistente
solicita Terminal ID autorizado y alias opcional (por defecto, el terminal).
La entidad y el adquirente se obtienen de ATM20521 dentro de la transacción
SQLite, verificando revisión, ambiente QA, entidad 205 y estados activos.
No se asignan identificadores remotos ni se registra el terminal en el switch.

El nuevo comando `createQaAtm` utiliza un UUID de solicitud como UUID del ATM.
Un reintento con la misma identidad y contenido recupera un alta ya confirmada
sin otra fila, revisión ni evento de auditoría. Si el registro cambió o la
plantilla quedó obsoleta, devuelve conflicto. Una respuesta perdida conserva
la solicitud en el asistente y permite **Recuperar alta**; no hay reintento
automático. Después de cerrar el asistente se recupera desde el catálogo.
La eliminación explícita no forma parte de la recuperación de un alta.

`AtmInspectionPort` separa la verificación de los transportes y del lector.
`AtmInspectionService` comprueba destino y plazos y consume una inspección
local de `QaAtmTemplate`. Esta comparte la resolución de identidad, origen
específico/heredado y destino con la ejecución; verifica disponibilidad de la
referencia protegida y cuenta las reservas del origen. No reserva STAN, solicita
PIN, lee el chip ni abre TCP. No copia perfiles privados ni claves. Revalida
configuración/perfil durante la consulta y tiene un plazo acotado.

El IPC valida emisor, QA, UUID y revisión. El resultado público contiene
comprobaciones, acciones, origen, cantidad de reservas, revisión y fecha UTC;
no contiene rutas privadas, referencias de claves ni campos ISO. La UI
descarta respuestas tardías y retira el resultado al recargar o navegar a
Configuración. La inspección es informativa y no reemplaza las validaciones
previas al envío.

## Prueba guiada

La prueba mantiene su propio borrador de saldo/LOCAL/ahorros, preservando el
borrador de Transacciones. Reutiliza `useTransactionPreparation`, la lectura
de tarjeta, el diálogo PIN, el motor financiero y su diario existentes.
La consulta se ejecuta únicamente al pulsar **Probar consulta de saldo**;
usa seguridad nueva y consume una reserva de la estación. No se añade otro
constructor ISO ni un mecanismo de reenvío.

El resultado identifica la consulta, su fecha y correlación. **Consulta de
saldo aprobada** describe esa respuesta, no otras operaciones ni la aceptación
permanente del terminal. La consulta anterior se recupera del diario; una
pendiente bloquea otra prueba, y una terminada con incertidumbre requiere una
decisión explícita para preparar un nuevo intento. Los errores IPC conservan
la referencia hasta consultar el resultado. Las pruebas previas se muestran
como evidencia histórica de su revisión, no como autorización actual.

## Validación y límites

- Unitarias: entradas inválidas, herencia, seguridad ausente, agotamiento,
  configuración incompatible, cambios concurrentes, timeout y sanitización.
- Integración SQLite/archivos: alta, idempotencia después de reinicio, conflictos,
  auditoría y pool sin cambios durante la inspección.
- E2E Electron: formulario, duplicados, verificación real con clave ausente,
  corrección en Configuración, prueba sintética explícita y borrador conservado.
- No se habilitan operaciones nuevas, nuevas entidades ni aprovisionamiento
  del switch. `MULTI-ATM-QA-RESULT` continúa requiriendo evidencia remota para
  cada terminal. Las pruebas automatizadas no certifican el host/Core.

No cambia el esquema SQLite. Continúan vigentes ADR-024 y las comprobaciones
de identidad/configuración justo antes del envío.
