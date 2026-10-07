# Casos locales de preparacion

## Uso

1. En Transacciones, selecciona un ATM activo del ambiente y captura el contexto.
   Para retiro, introduce un monto con punto y dos decimales.
2. Pulsa **Guardar como caso**, escribe un nombre sin datos sensibles y guarda.
3. Abre **Casos guardados** para listar los borradores QA o PREPROD. Sus
   referencias documentales se pueden expandir en el dialogo.
4. Pulsa **Cargar**. Se recuperan operacion, cuenta, escenario, monto y ATM;
   solicita **Revisar requisitos** para obtener una revision nueva desde Main.
5. **Eliminar** pide confirmacion en el dialogo y audita la eliminacion.

Los casos sobreviven al cierre/reinicio. La biblioteca consulta el catalogo al
abrirse y al cargar; un caso editado/eliminado por otro cliente se debe
seleccionar de nuevo. Un ATM obsoleto/inactivo/eliminado exige elegir un perfil
actual, conservando el resto del borrador. Cambiar ambiente muestra su lista
independiente. Escape cierra el dialogo mientras no haya una operacion pendiente.

La UI requiere ATM y entradas validas para guardar. El contrato interno admite
tambien contextos documentales sin ATM y actualizar casos por revision; la UI
guarda nuevas copias y permite eliminar, sin editor de casos en esta entrega.

## Datos y limites

SQLite schema v2 migra v1 conservando entidades, ATM y auditoria. Guarda solo
nombre, DraftRequest, UUID/revision/UTC y referencias generadas por dominio.
No guarda el resumen ReviewedDraft, tarjeta, RAW/HEX, resultados ni campos ISO.
Las referencias no fijan una version del contenido de los documentos.

Crear/eliminar y su auditoria se confirman juntos. La auditoria no incluye el
nombre, monto ni valores. El caso permanece DRAFT y no cuenta como transaccion
ejecutada. Todas las reglas y bloqueos TODO-DATA siguen aplicando.

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

`tests/unit/saved-cases.test.ts`: validacion, cinco flujos, referencias y estados
del ATM. `tests/integration/saved-cases.test.ts`: Main/Worker/SQLite reales,
reinicio, revision concurrente, ambientes, rollback, migracion, contenido
externo invalido y timeout. `tests/e2e/desktop.spec.ts`: recorrido Electron,
validacion de nombre, reinicio, recuperacion del contexto, ATM editado y borrado.
Captura sintetica ignorada: `artifacts/saved-cases-library.png`.

Decision: [ADR-008](../adr/ADR-008-LOCAL-SAVED-CASES.md).
