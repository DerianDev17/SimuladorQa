# Configuración operativa de envío

Desde 2026-11-10, Configuración → Envío permite editar el destino IPv4, puerto,
espera de conexión y ventana de respuesta usados por el simulador en Qa.
Ver [ADR-041](../adr/ADR-041-OPERATIONAL-SEND-SETTINGS.md).

## Uso

1. Introducir IP y puerto del Switch Qa, y plazos de 1 a 30000 ms.
2. Guardar. La pantalla muestra el destino, plazos y revisión persistidos.
3. Abrir Dispositivos y perfiles → Conectar para comprobar la conexión TCP.
4. Ejecutar una operación desde Transacciones o Carga con un perfil compatible.

Los plazos son controles técnicos del intento, no timeouts ISO del proveedor.
Se pueden guardar pendientes; Conectar requiere el plazo de conexión y el
motor financiero requiere ambos. El selector Modo previsto se retira porque
no modificaba la ejecución. El inicio de operaciones sigue siendo explícito.

Guardar cierra la conexión anterior. No conecta automáticamente, no genera una
trama ni inicia una operación. El arranque tampoco conecta. La configuración
queda bloqueada durante una operación o corrida activa. Una revisión obsoleta,
fallo de almacenamiento o timeout IPC exige reconciliar mediante recarga.

La edición no depende de evidencia de red. Los perfiles financieros conservan
su vinculación al destino autorizado; cambiar IP/puerto no habilita un perfil
en otro host. La disponibilidad se comprueba por operación con su perfil,
tarjeta y seguridad vigentes. Producción permanece bloqueada.

## Persistencia y contratos

`send-configuration.json` vive en userData, fuera del repositorio. Mantiene
formato versión 1, UUID, revisión, timestamps UTC y hasta 100 eventos de auditoría
con usuario/equipo. `evidenceId` admite null para un destino explícito del operador.
Los eventos nuevos incluyen `settings` con copia de IP, puerto y ambos plazos
de esa revisión. El campo es opcional al leer eventos anteriores; nunca se
reconstruyen sus valores a partir de la configuración actual. La respuesta IPC
incluye hasta 100 eventos del ambiente solicitado, recientes primero.
Los archivos históricos con UUID de evidencia conservan su validación de fuente;
al guardar desde el formulario pasan a configuración explícita. Lectura acotada
a 256 KiB, escritura temporal y reemplazo atómico. Archivos corruptos se conservan.

- `transaction:send:configuration`: lee la configuración del ambiente Qa activo.
- `transaction:send:configure`: valida ambiente, revisión y valores. Para edición
  operativa incluye `endpoint: {host, port}`, `evidenceId: null` y `trigger: ON_CLICK`.
  IP debe ser IPv4 canónica y puerto entero entre 1 y 65535. Claves extra se rechazan.
- `switch:connection:connect`: usa exclusivamente el destino persistido en Main.
- `transaction:send:prepare`: recorrido histórico de revisión que devuelve
  metadatos y pendientes, sin bytes ni transmisión. No habilita ejecución financiera.

El Renderer no abre sockets ni accede a archivos o secretos. No se guardan datos
de tarjeta, tramas, PIN o claves. La evidencia de red original permanece separada.

## Compatibilidad y verificación

Main puede inicializar una primera configuración desde evidencia existente, con
plazos null; también se puede crear desde el formulario sin esa evidencia.
Se mantiene `CONFIGURED_BLOCKED` en el contrato histórico de snapshot para indicar
destino vigente, sin afirmar disponibilidad financiera. La pantalla presenta los
valores efectivos y revisión, y la operación comprueba sus propios requisitos.

Unitarias validan contrato, revisión y fallos; integración verifica persistencia,
reinicio y parámetros de Main; E2E prueba un destino TCP loopback real desde el
formulario, cierre al guardar y timeout de guardado. Las pruebas usan datos
sintéticos y no acreditan aceptación financiera del host.

Los TODO-DATA de generación general, otros perfiles y reglas financieras están
en [el registro de pendientes](../TODO_DATA.md). No bloquean editar la configuración
de conexión ni reemplazan las implementaciones vigentes de saldo/retiro/depósito.

## Comprobaciones y auditoría en Configuración

Requisitos consulta la configuración persistida y muestra destino, ambos plazos,
cantidad de ATM activos con entidad activa y estado TCP para ese mismo destino.
Actualizar comprobaciones vuelve a leer configuración y catálogo. Los accesos
abren Envío, perfiles ATM o dispositivos para corregir los datos. Un fallo retira
los valores de configuración anteriores y los marca sin verificar. No se usa la
lista estática de pendientes documentales como estado operativo.

Auditoría muestra las revisiones guardadas con fecha local, valores, usuario y
equipo. Los registros antiguos sin detalles se identifican explícitamente. Los
cambios históricos de ambiente se conservan en un desplegable separado. Error o
timeout de lectura retira la tabla de envío; no se presenta como un historial vacío.
Al salir se descartan respuestas tardías. Ninguna consulta abre conexiones o lee el chip.
