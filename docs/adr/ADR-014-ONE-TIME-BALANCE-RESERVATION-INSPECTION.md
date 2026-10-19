# ADR-014: inspeccion puntual para una reserva de saldo QA

Fecha: 2026-10-15. Estado: autorizacion puntual consumida.

## Contexto y autorizacion

El usuario solicita resolver los bloqueos y enviar una transaccion. El perfil
ATM20521 conserva la clave TEST validada, pero su pool de secuencias esta vacio.
La comprobacion SQL con TLS estricto falla antes de ejecutar consultas.
ADR-006 solo permitia catalogos del sistema; ADR-009 mantiene TLS estricto
en el observador de la app. Ninguno se interpreta como una excepcion general.

Tras presentar las tres consultas y el riesgo de no autenticar el certificado,
el usuario responde: "Autorizar solo esta consulta puntual". El alcance es
una conexion cifrada al endpoint PREPROD 172.60.60.172:55893 para consultar
el lote abierto, el serial actual y el uso de la secuencia 900104 de ATM20521.

## Ejecucion y limites

Se ejecutan una vez tres SELECT fijos, parametrizados, con plazos acotados:

- OCTOCLI_PCI.dbo.ATMDayClose: lote/fecha abierta del terminal.
- OCTOCLI_PCI.dbo.ATMTCS: serial y secuencia de mensaje actuales.
- Mediator.dbo.MDT_Journal: COUNT_BIG del candidato por entidad y terminal.

Encrypt=true y TrustServerCertificate=true solo en esa conexion. La cuenta
se carga mediante DPAPI y el script limita la salida a esas proyecciones.
ApplicationIntent=ReadOnly no sustituye permisos SQL. No se ejecutan SP,
DDL, DML ni consultas de PAN, PIN, tarjetas, cuentas o mensajes financieros.
No se modifica la confianza de Windows ni la configuracion TLS de la app.

Resultado a las 2026-10-15T21:19:20Z: tres SELECT completados; lote 31 abierto,
fecha contable 2026-08-17, ultimo serial 7973 y cero coincidencias para 900104.
Se cierra la conexion. La autorizacion queda consumida, sin reintentos ni
extension a otras consultas, terminales o endpoints.

Evidencia privada: artifacts/balance-reservation-2214ceb8-33e4-475e-8b20-700bc20de356.json.
El resultado permite preparar una reserva local para la estacion QA siguiendo
Param.Serial/GrabaAutoTran=N; no crea un bloqueo distribuido del cajero ni
demuestra aprobacion financiera. La ejecucion se registra por separado.

## Pendientes

SQL-TLS-SERVER-CERTIFICATE continua abierto. El observador conserva ADR-009:
certificado/nombre confiables y permisos de lectura adecuados. Esta excepcion
consumida no implementa ni autoriza un fallback automatico.
