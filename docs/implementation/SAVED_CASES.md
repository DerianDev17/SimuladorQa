# Casos locales de preparacion

## Uso

1. En Transacciones, selecciona un ATM activo del ambiente y captura el contexto.
   Para retiro, introduce un monto con punto y dos decimales.
2. Pulsa **Guardar como caso**, escribe un nombre sin datos sensibles y guarda.
   Opcionalmente declara Aprobado/No aprobado, un codigo de respuesta de dos
   caracteres y la fuente de esa expectativa. No hay valor predeterminado.
3. Abre **Casos guardados** para listar los borradores QA o PREPROD. Sus
   referencias documentales se pueden expandir en el dialogo. Busca por nombre,
   alias ATM, escenario, operacion, cuenta o monto; la busqueda ignora acentos y
   mayusculas. Combina filtros de operacion y perfil vigente/pendiente de actualizar.
4. Pulsa **Cargar**. Se recuperan operacion, cuenta, escenario, monto y ATM;
   solicita **Revisar transaccion** para obtener una revision nueva desde Main.
5. **Expectativa** permite editar o retirar el resultado esperado de un caso
   existente con control de revision. **Eliminar** pide confirmacion y audita.

Los casos sobreviven al cierre/reinicio. La biblioteca consulta el catalogo al
abrirse y al cargar; un caso editado/eliminado por otro cliente se debe
seleccionar de nuevo. Un ATM obsoleto/inactivo/eliminado exige elegir un perfil
actual, conservando el resto del borrador. Cambiar ambiente muestra su lista
independiente. Escape cierra el dialogo mientras no haya una operacion pendiente.

La UI requiere ATM y entradas validas para guardar. El contrato interno admite
tambien contextos documentales sin ATM y actualizar casos por revision; la UI
guarda nuevas copias y permite editar solo la expectativa, sin editor del
contexto transaccional en esta entrega.

## Datos y limites

SQLite schema v3 migra v1/v2 conservando entidades, ATM, casos y auditoria.
Guarda nombre, DraftRequest, expectativa opcional, UUID/revision/UTC y referencias
generadas por dominio. No guarda el resumen ReviewedDraft, tarjeta, RAW/HEX,
resultados ni campos ISO.
Cargar un caso limpia la referencia de tarjeta de la UI y exige elegirla de nuevo.
Las referencias no fijan una version del contenido de los documentos.

Crear/eliminar y su auditoria se confirman juntos. La auditoria no incluye el
nombre, monto ni valores. El caso permanece DRAFT y no cuenta como transaccion
ejecutada. Todas las reglas y bloqueos TODO-DATA siguen aplicando.

Al cargar un caso con expectativa y ejecutar una transaccion nueva con el mismo
contexto, Resultado presenta un veredicto local separado del resultado del host.
PASS/FAIL solo se asigna a respuestas financieras terminadas, transmitidas y
correlacionadas. Bloqueos, timeouts, ausencia de respuesta, cambios de contexto y
reversos quedan INCONCLUSIVE. El veredicto no se persiste ni certifica
Switch/Core. Editar el formulario antes de enviar impide asociar esa corrida al
caso. La ejecucion e idempotencia existentes no cambian. Ver ADR-022.

Una escritura fallida bloquea reintentar hasta recargar. Desde Guardar caso se
ofrece **Revisar casos guardados** para comprobar si un timeout dejo un caso
persistido antes de crear otra copia. No se recrea una base corrupta ni se
devuelve contenido de casos manipulados externamente que no pase la validacion.

Toda recarga de casos invalida temporalmente la disponibilidad de la lista.
Si falla por bloqueo de SQLite, timeout o servicio no disponible, los casos
anteriores pueden seguir visibles pero Cargar/Eliminar permanecen deshabilitados.
Solo una consulta exitosa habilita esas acciones; cerrar y reabrir Guardar caso
no evita la recarga necesaria. La regresion Electron usa un bloqueo exclusivo
real de SQLite y comprueba recuperacion al liberar la base y pulsar Recargar casos.

## Verificacion

`tests/unit/saved-cases.test.ts` y `case-verdict.test.ts`: validacion, cinco flujos,
referencias, estados del ATM y veredictos PASS/FAIL/INCONCLUSIVE.
`tests/integration/saved-cases.test.ts`: Main/Worker/SQLite reales,
reinicio, revision concurrente, ambientes, rollback, migracion, contenido
externo invalido y timeout. `tests/e2e/desktop.spec.ts`: recorrido Electron,
validacion de nombre, reinicio, recuperacion del contexto, ATM editado y borrado.
Captura sintetica ignorada: `artifacts/saved-cases-library.png`.

Decision: [ADR-008](../adr/ADR-008-LOCAL-SAVED-CASES.md).

Los filtros son locales, conservan el orden del catalogo y no modifican casos ni
revisiones. Limpiar filtros o Mostrar todos los casos recupera la lista. Se
reinician al abrir y se conservan al recargar. El contador expresa resultados
visibles del ambiente. Una busqueda sensible se elimina con un aviso; el filtro
no borra errores de recarga ni habilita Cargar/Eliminar tras un fallo.

Regresion: `tests/unit/transaction-ui-tools.test.ts` y pruebas Electron de
busqueda, filtros combinados, vigencia, datos sensibles y recarga fallida.
Captura sintetica: `artifacts/filtered-cases.png`.
