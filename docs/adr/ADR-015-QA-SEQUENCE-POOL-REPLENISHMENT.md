# ADR-015: reposicion puntual del pool QA de ATM20521

Fecha: 2026-10-15. Estado: ejecutado; excepcion SQL consumida.

## Autorizacion y alcance

El intento aa348124-ebe0-45e3-a086-f7089b300e46 se bloquea antes del envio
porque ATM20521 no conserva secuencias reservadas. Tras explicar el riesgo de
no autenticar la identidad del servidor SQL, se propone verificar y reservar
1000 secuencias, 900105-901104, exclusivamente para esta estacion. El usuario
responde "si". Esta autorizacion es independiente de ADR-014, ya consumido.

Se permite una conexion cifrada a 172.60.60.172:55893 con
TrustServerCertificate=true, limitada a tres SELECT parametrizados:

- ATMDayClose: lote abierto y fecha contable de ATM20521.
- ATMTCS: serial y secuencia de mensaje actuales de ATM20521.
- MDT_Journal: COUNT_BIG por entidad 205, terminal ATM20521 y rango autorizado.

Cada consulta y la conexion tienen un plazo de ocho segundos. La credencial
se obtiene del almacenamiento DPAPI existente. No se ejecutan escrituras SQL,
SP ni consultas de datos de tarjeta o mensajes financieros. La excepcion no
modifica TLS del observador ni la confianza de Windows.

## Resultado y reposicion

Inspeccion b0eec02a-0a0e-47a5-8aff-764e962997e3 a las
2026-10-15T22:39:57.1638671Z: lote 31 abierto, fecha 2026-08-17, serial actual
7973 y cero registros del rango. Se cierra la conexion; no hay reintentos.

Operacion local 60604ff8-40bf-4d01-878b-7e26c470ab9e a las
2026-10-15T22:41:47.500Z: Electron Main valida el perfil, la evidencia reciente
y el diario; adquiere un lock exclusivo, conserva un respaldo con SHA-256 y
reemplaza atomicamente el archivo privado con las 1000 reservas. El parser
y el proveedor activo confirman sequencesRemaining=1000 y ausencia de
QA-SEQUENCE-POOL. El unico bloqueo de disponibilidad es QA-CARD-SESSION,
esperable al reiniciar sin una lectura manual vigente.

El diario conserva sus cinco entradas y su hash. No se solicita PIN, no se
genera EMV ni se envia una transaccion. La entrada temporal de mantenimiento
se retira y index.ts recupera exactamente su SHA-256 anterior. No queda un
gancho de reposicion o envio al iniciar. Tampoco se crea una copia virtual
activa de AppData ni se modifica el serial del cajero fisico.

El rango pertenece exclusivamente a esta estacion por autorizacion del
usuario; esta reserva local no implementa un bloqueo distribuido en el host.
La comprobacion de ausencia de registros no garantiza aprobacion financiera.
Al consumir las 1000 reservas se necesitara una nueva asignacion autorizada.

Evidencias privadas: artifacts/sequence-pool-inspection-b0eec02a-0a0e-47a5-8aff-764e962997e3.json
y artifacts/sequence-pool-provision-20261015.json. Respaldo en el userData real
de Electron, qa-execution-profiles.before-pool-60604ff8-40bf-4d01-878b-7e26c470ab9e.json.

SQL-TLS-SERVER-CERTIFICATE y la investigacion de los rechazos financieros
anteriores siguen pendientes; no afectan la disponibilidad del pool cargado.

Validacion local: typecheck y 30 pruebas unitarias/de integracion de perfiles,
proveedor y persistencia pasan. El bundle final no contiene la entrada de
mantenimiento. Archivo activo verificado con 1000 reservas, sin lock ni copia
virtual activa; SHA-256 ee75aa255250f0fea4a6a85bcc9f9b475011d71f828e0763616f487316983e80.
