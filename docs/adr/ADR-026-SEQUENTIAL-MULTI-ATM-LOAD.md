# ADR-026: varios perfiles ATM en una corrida de carga física

Fecha: 2026-10-28. Estado: implementado por solicitud del usuario.

## Problema y decisión

El selector sustituía un ATM por otro y el driver fijaba un único contexto.
El usuario solicita una prueba de carga con los dos perfiles. La tarjeta física
admite una operación en curso; se alternan perfiles en orden A/B/A/B dentro
de una sola corrida, manteniendo los límites y política de parada existentes.
No se necesita proveedor virtual para alternar perfiles secuencialmente.

## Contrato y comportamiento

- LoadTestDraft conserva atmId/atmRevision para compatibilidad y admite
  additionalAtms con pares UUID/revisión, sin duplicados ni campos privados.
  La cantidad debe cubrir al menos el número de perfiles, con máximo de 100
  consultas, 300 segundos, 5 TPS totales y concurrencia uno.
- PhysicalCardLoadDriver prepara todos los contextos antes de iniciar el PIN
  de sesión. No suma reservas compartidas; exige conservadoramente a cada
  perfil disponibilidad para la cantidad total. Cada envío usa la ruta de
  DesktopApplication y su revalidación de revisión, entidad y configuración.
- Cada consulta genera nueva seguridad y secuencia; comparten runId y PIN de
  sesión, pero conservan requestId/transactionId/STAN/RRN propios. La selección
  es inmutable durante la corrida. Un error detiene toda la corrida sin pasar
  silenciosamente al siguiente perfil ni reintentar el anterior.
- LoadRunItem agrega atmId opcional para leer registros antiguos. Las filas
  muestran el terminal de la correlación recibida o el perfil del intento;
  no atribuyen todas las respuestas al primer perfil. SQLite conserva el plan
  completo y la identidad de cada resultado, sin migrar registros anteriores.
- PREPROD, carga de retiros, múltiples tarjetas y operaciones concurrentes
  mantienen sus pendientes. Crear un perfil no acredita admisión en el host.

## Validación

Pruebas de entradas duplicadas/inválidas, presupuesto total, preflight de ambos
perfiles y reservas compartidas. El recorrido con driver, worker, TCP loopback y
SQLite reales comprueba A/B/A, IDs distintos, un solo PIN y ausencia de
solapamientos; cubre timeout y parada. Electron comprueba selección múltiple,
límites, ejecución sintética y recuperación de las filas de ambos terminales.
No se ejecuta carga contra el switch durante el desarrollo.

Resultado local: 986 pruebas unitarias y de integración relevantes aprobadas;
lint, typecheck, formato, revisión de seguridad y build aprobados. Los cuatro
casos Electron pasan, incluido selección de ambos ATM y recuperación persistida.
El caso de recuperación LATE_REJECTION necesitó una repetición: el primer intento
agotó el plazo del catálogo local durante la preparación, antes de iniciar carga.
