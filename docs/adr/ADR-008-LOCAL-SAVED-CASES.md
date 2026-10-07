# ADR-008: casos documentales persistentes por ambiente

## Decision

Guardar contextos de preparacion como casos DRAFT en `catalogs.sqlite`, mediante
el puerto CatalogStore y el Worker existentes. La UI ofrece guardar, listar,
cargar y eliminar; el contrato permite actualizar por revision. No se agregan
dependencias, envio TCP ni acceso a SQLite desde Renderer.

Un caso contiene UUID, nombre administrativo de hasta 80 caracteres, ambiente,
revision, UTC de creacion/actualizacion y el DraftRequest validado. Conserva
referencia y revision del ATM, operacion, escenario, cuenta y monto decimal como
string. No contiene tarjeta, identificadores bancarios de correlacion, trama,
respuesta, revision aprobada, PASS/FAIL ni resultados de una ejecucion.

Las referencias documentales de la operacion, checklist, CMS cuando corresponde
y revision PCAP se generan desde el dominio y se guardan con el caso. No se
aceptan rutas o evidencia aportadas por IPC. Son enlaces a documentos internos,
no una copia versionada del contenido ni evidencia de certificacion.

## Persistencia e integridad

Migracion atomica v1 -> v2: agrega `saved_cases` y admite CASE en catalog_audit,
conservando entidades, perfiles, revisiones y eventos anteriores. Los schemas
futuros y bases corruptas se conservan y devuelven errores seguros.

Crear/actualizar/eliminar y auditar comparten transaccion. Main valida claves
exactas y ambiente activo; SQLite vuelve a validar contexto y disponibilidad/
revision de ATM bajo el bloqueo de escritura. Actualizar/eliminar un caso exige
su revision actual. QA y PREPROD se consultan independientemente.

No hay FK del caso al ATM: borrar un perfil conserva el contexto documental.
Al cargar se consulta nuevamente Main; si el caso cambio, se rechaza esa
seleccion. Un ATM editado, eliminado o inactivo, o una entidad inactiva, limpia
la seleccion ATM y exige elegir un perfil actual. Cuenta, escenario, monto y
operacion se conservan. La revision anterior no se restaura; el usuario debe
solicitar una nueva revision por Main. El envio permanece bloqueado.

Se rechazan claves desconocidas, nombres con controles, secuencias largas de
digitos incluso separadas por espacios/guiones e identificadores sensibles
explicitos. Al leer SQLite se revalidan nombre, contexto y referencias antes de
devolverlos a Renderer. La auditoria guarda accion e IDs, sin nombre o valores.

## Recuperacion

Timeout de Worker y puente Renderer acotados por los contratos existentes. Una
mutacion puede haberse confirmado aunque no llegue su respuesta. Tras fallo de
escritura, la UI bloquea reintento hasta recargar los casos; ofrece inspeccionar
la lista antes de guardar otra copia. Una consulta fallida no carga el contexto
antiguo. No se generan casos de ejemplo en el catalogo del usuario.

## Aceptacion

- Roundtrip tras reinicio, referencias documentales y auditoria atomica.
- Validacion de entradas/ambientes, revision obsoleta y perfiles no disponibles.
- Migracion de datos v1; rollback ante fallo de auditoria; errores sanitizados.
- Timeout/dependencia ausente y recuperacion; recorrido Electron de guardar,
  cargar, separar ambientes, tratar ATM editado y eliminar.

Fuentes: backlog Epic 5, ADR-004 y contrato de preparacion ADR-005. Todos los
TODO-DATA transaccionales del checklist siguen pendientes.
