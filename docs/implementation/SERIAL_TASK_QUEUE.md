# Serialización de operaciones locales

Actualización: 2026-11-23. Reducción de deuda técnica solicitada por el usuario.

## Contrato

`SerialTaskQueue`, en Main, reemplaza seis implementaciones repetidas de cadenas
de promesas. `run` recibe una operación asíncrona y devuelve su resultado tipado.
Las operaciones comienzan en orden de aceptación, después de que termine la
anterior. Una excepción síncrona o un rechazo se entrega al llamador original;
la cola interna continúa con la siguiente tarea y no reintenta ninguna operación.
La promesa interna termina en `void`, sin conservar como valor el último resultado.

Cada instancia pertenece a un único propietario. No hay una cola global ni se
serializan entre sí almacenes distintos. El componente no importa infraestructura,
Node, Electron ni reglas financieras; está incluido en los controles de arquitectura.

## Consumidores

| Propietario | Operaciones que conservan su orden |
| --- | --- |
| DesktopApplication | Consultas y comandos locales previamente serializados; las consultas remotas conservan su coordinación existente |
| QaPreferencesStore | Lectura, respaldo/migración histórica y escritura |
| FileBalanceJournal | Lectura y reemplazo atómico; evita un lector abierto durante rename en Windows |
| SqliteBalanceJournal | Lectura, guardado y cierre del diario financiero |
| SqliteLoadRunStore | Lectura, guardado y cierre de corridas dentro de su proceso propietario |
| FinancialExecutionService | Escrituras del diario y secuencia read/write del adaptador histórico |

El cierre SQLite sigue siendo una tarea de la cola, detrás de las operaciones ya
aceptadas. La política de reapertura del adaptador se conserva. La cola no modifica
validación, snapshots, transacciones SQLite, idempotencia ni conservación de datos.

## Límites

- No es reentrante: una tarea no debe esperar otra tarea que ella misma encole
  en esa instancia. Los métodos internos de persistencia siguen evitando esa
  recursión, como antes del refactor.
- No aplica timeout ni cancelación. Un timeout del consumidor no permite que
  otra tarea adelante a una operación que todavía mantiene el recurso. Los
  plazos y el cierre de dependencias pertenecen al servicio/adaptador existente.
- Una dependencia que no termina mantiene ocupada su cola. Esto conserva la
  exclusión; no se inicia otra escritura para compensar una respuesta ausente.
- Las colas de transporte, cifrado, archivo cifrado y coordinación de carga
  conservan sus políticas específicas. No se sustituyen mecanismos de parada,
  cancelación o seguimiento de errores por una abstracción genérica.

## Validación

Unitarias deterministas verifican FIFO sin solapamiento, resultados, excepciones
y rechazos, continuidad sin reintentos, aislamiento entre instancias y timeout
del consumidor mientras la dependencia sigue activa. Integración usa SQLite real:
encola escrituras, una operación inválida, otra escritura, lectura y cierre;
comprueba el fallo individual y los registros al reabrir ambos almacenes.

La regresión existente verifica además migración QA concurrente, resultados
financieros fuera de orden, exclusión, idempotencia y recuperación. Las pruebas
usan archivos temporales y dependencias sintéticas, sin nuevas reglas ISO/ATM ni
envíos al host. No requiere dependencias nuevas ni migración de esquemas.
