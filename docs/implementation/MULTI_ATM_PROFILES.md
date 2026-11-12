# ATM20521 como plantilla funcional

## Entidades en el asistente (2026-11-12)

**Perfiles ATM → Crear ATM Qa** permite buscar una entidad por código/nombre y
seleccionarla del catálogo. Muestra FRONT, BACK, EXTERNA e HÍBRIDA, red, estado
y revisión durante todo el recorrido. Las entidades inactivas no permiten alta;
las clasificaciones múltiples conservan **Validación pendiente**.

- **205:** sigue seleccionada inicialmente y hereda entidad/adquirente de
  ATM20521 activa. Conserva el Terminal ID QA de ocho caracteres y el pool común.
- **Otras entidades:** requiere Terminal ID y Acquirer ID explícitos. Guarda la
  identidad administrativa con su UUID, revisión y auditoría; no deriva el
  adquirente del código de entidad ni asigna la plantilla 205. El formato
  administrativo no acredita un contrato ISO de esa entidad.

**Crear y verificar** comprueba automáticamente entidad activa, clasificación
única, alcance operativo, revisión ATM, destino, plazos y, cuando corresponde,
perfil, seguridad TEST y reservas. **Verificar y probar** está disponible también
en ATM de otras entidades para mostrar sus pendientes. La falta de un requisito
mantiene bloqueado **Continuar a prueba de saldo**, conservando el ATM guardado.

Al pulsar **Probar consulta de saldo**, Main vuelve a verificar la configuración
y compara la entidad/revisión mostrada con el catálogo actual. Revalida esa
identidad antes del envío, junto con los controles existentes del motor. Un
timeout, un cambio de entidad, una clasificación pendiente o una configuración
incompatible impiden el envío. **Volver a verificación** permite corregir y revisar.

El alcance financiero disponible sigue siendo **QA/205/LOCAL/ahorros**. Para las
demás entidades falta el perfil de saldo validado: adquirente, destino,
campos/diccionario, seguridad y reglas de respuesta. **TODO-DATA
ATM-ENTITY-BALANCE-PROFILES** bloquea solo sus pruebas financieras, no la creación
del perfil ni la consulta del diagnóstico. Ver [ADR-044](../adr/ADR-044-ATM-ENTITY-ONBOARDING.md).

## Asistente de alta y prueba (2026-11-11)

El recorrido QA/205 siguiente se mantiene dentro del asistente **Crear ATM Qa**.

1. En **Perfiles ATM**, pulsar **Crear ATM Qa** y seleccionar la entidad 205.
2. Introducir el Terminal ID autorizado de ocho caracteres en mayúsculas y un
   alias opcional. Entidad y adquirente se heredan de ATM20521 activa.
3. Pulsar **Crear y verificar**. El perfil se guarda una sola vez y se comprueban
   automáticamente configuración, destino, plazos, seguridad TEST y reservas.
4. Corregir los requisitos indicados; **Revisar configuración de envío** conserva
   el alta y al regresar se vuelve a verificar. Un fallo no elimina el perfil.
5. Pulsar **Continuar a prueba de saldo**, leer la tarjeta QA y pulsar
   **Probar consulta de saldo**. El PIN se solicita por el diálogo protegido
   existente. Consultar el resultado y su correlación en el asistente/historial.

**Verificar y probar** permite retomar un ATM existente; saldo requiere los
controles vigentes descritos arriba y el alcance QA/205.
La prueba usa saldo/LOCAL/ahorros y conserva el borrador de Transacciones.
La inspección local no consume secuencias ni conecta; la consulta explícita
sí consume una reserva. Un timeout del alta conserva su UUID para **Recuperar
alta** sin duplicar registros. No se reenvían consultas automáticamente.

El resultado distingue requisitos locales de aceptación del host. Una respuesta
aprobada acredita esa consulta y configuración, no el retiro ni la admisión
permanente. Un terminal nuevo debe estar habilitado en el switch; el asistente
no realiza esa alta remota. Detalles y criterios: [ADR-042](../adr/ADR-042-QA-ATM-ONBOARDING.md).

## Mejoras de catálogo (2026-11-10)

Perfiles ATM muestra totales de perfiles activos e inactivos y cuántos tienen
una entidad no disponible. Este último contador puede incluir perfiles activos
o inactivos: no es una tercera categoría excluyente ni un diagnóstico financiero.
La tabla identifica esas entidades y permite filtrarlas. Un perfil activo solo
es seleccionable cuando su entidad también está activa.

La búsqueda combina palabras de alias, Terminal ID, Acquirer ID, código y nombre
de entidad; ignora acentos, mayúsculas y espacios exteriores. Se combina con
filtros de entidad y estado. Cambiar filtros vuelve a la primera página;
**Limpiar filtros** recupera el catálogo completo. Los totales no se restringen
a los resultados filtrados. La tabla conserva paginación de 15 filas.

El editor indica un Terminal ID duplicado antes de guardar, incluidos registros
inactivos. Excluye el propio registro editado y conserva la unicidad existente
de SQLite (comparación exacta tras quitar espacios exteriores). Main mantiene
la validación definitiva frente a cambios concurrentes. Errores y timeouts
conservan el formulario y requieren recargar antes de reintentar.

El formulario distingue registro administrativo, herencia QA/205 y aceptación
del host. No interpreta los contadores como disponibilidad del perfil privado,
clave o pool. La propuesta de diagnóstico completo está en
[análisis de la feature](ATM_PROFILE_DIAGNOSTICS_PROPOSAL.md).

## Uso vigente (2026-10-27)

En QA, los ATM activos de la entidad 205 usan automáticamente la plantilla
de envío ATM20521 cuando no tienen un perfil específico. Aplica también a
ATM20524 ya existente. No hace falta aportar otro perfil ISO, importar una
clave, asignar una fecha contable o repartir reservas por cada alta.

1. Abrir **Perfiles ATM → Nuevo perfil ATM**, o **Clonar**.
2. Completar alias y Terminal ID nuevo de ocho caracteres alfanuméricos en
   mayúsculas. Crear preselecciona entidad y Acquirer ID de ATM20521; clonar
   conserva los del origen.
3. Guardar activo y seleccionarlo en **Transacciones** o **Carga y estrés**.
   No se requiere reiniciar entre altas.

El cajero debe existir y estar habilitado en el switch para que este lo acepte.
La plantilla conserva el alcance de ATM20521: QA/205/LOCAL/ahorros, consulta y
retiro con sus montos/políticas existentes. Desde ADR-027, Carga permite varios
ATM y de 1 a 5 operaciones en curso por corrida. La preparación del chip es
exclusiva y las esperas TCP son concurrentes, con un límite TPS global.
La admisión remota se distingue de la preparación
local; no se promete una aprobación financiera al crear el registro.

## Comportamiento

Main resuelve la plantilla y el catálogo en cada operación. Hereda campos ISO,
EMV, endpoint y referencia protegida de enlace. Usa UUID, revisión, Terminal ID
y adquirente del ATM seleccionado. No exporta secretos al Renderer ni duplica
claves o datos de tarjeta. Un perfil privado específico tiene prioridad.

Todos los derivados consumen **un único pool persistente** del origen. El
bloqueo de archivo evita reutilizar STAN; no se copian rangos ni se consulta el
serial de un cajero físico. El pool es finito y al agotarse conserva el bloqueo
existente de la estación. Reiniciar o crear otro ATM no lo repone.

El contrato de retiro se hereda comprobando la huella de la plantilla. Los
cambios/revocaciones durante una operación se verifican antes de TCP. Una
nueva selección resuelve la versión actual, sin una vinculación obsoleta de
arranque. Desactivar/eliminar un ATM o la entidad impide su uso.

No se solicita fecha contable por ATM ni se depende de SQL para crear/enviar.
F15 conserva el valor de la plantilla funcional, identificado en UI como fecha
ISO enviada. No se interpreta como fecha contable efectiva del switch ni se
cambia el bitmap por suposición. Las fechas transaccionales y EMV se generan
de nuevo según la zona configurada. Ver [ADR-024](../adr/ADR-024-REUSABLE-ATM-TEMPLATE.md).

## Evidencia y pendientes externos

Configuración real verificada el 2026-10-27T17:37:53Z: ATM20521 y ATM20524
resuelven desde un único perfil privado, con la misma clave DPAPI disponible,
contrato de retiro y 959 secuencias compartidas. ATM20524 tenía el adquirente
abreviado; se alineó al de la plantilla mediante el catálogo con auditoría y
respaldo SQLite, quedando revisión 2. ATM20521 y su archivo privado se mantienen
intactos. Cero solicitudes PIN, secuencias consumidas, consultas SQL al host o
envíos financieros. Informe local: `artifacts/atm-template-20261027-result.json`.

Las pruebas integradas ejecutan ATM20521 → ATM20524 → ATM20521 por TCP local
para saldo y retiro, con seguridad nueva y una sola referencia/pool. SQLite
real verifica alta posterior al arranque, recuperación tras reinicio y
agotamiento. E2E verifica herencia del adquirente y resolución real en Main.

- **TODO-DATA MULTI-ATM-QA-RESULT:** comprobar respuesta del host para nuevos
  Terminal ID, incluido ATM20524. Las pruebas locales no certifican Switch/Core.
- **TODO-DATA MULTI-ATM-CONCURRENCY:** la ejecución actual es serial; múltiples
  tarjetas, estaciones y rangos distribuidos requieren coordinación separada.

Las exigencias previas MULTI-ATM-EXECUTION-PROFILE, MULTI-ATM-PIN-KEY y reserva
individual MULTI-ATM-STAN-ALLOCATION quedan sustituidas, dentro de este alcance,
por la instrucción de reutilizar ATM20521. La historia de clave compartida está
en [ADR-023](../adr/ADR-023-SHARED-QA-LINK-KEY.md). La fecha histórica de la
plantilla no se obtuvo de una nueva consulta SQL; el intento anterior falló TLS
y dejó de ser una dependencia del alta por la instrucción posterior del usuario.
