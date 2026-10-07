# Catálogos de entidades y ATM

## Uso

1. Iniciar con `npm run dev` o `npm run build` y `npm start`.
2. Abrir **Entidades**, crear código/nombre y seleccionar explícitamente una red.
3. Abrir **Perfiles ATM**, seleccionar una entidad activa y capturar alias, Terminal ID y Acquirer ID.
4. Guardar como borrador. Buscar, filtrar activos/inactivos, editar o eliminar desde la tabla.
5. Cerrar cualquier editor/diálogo para cambiar entre QA y PREPROD.

Las entidades son compartidas; los ATM se consultan y modifican solo en el ambiente activo.
Los filtros son locales y la tabla muestra 15 filas por página. El catálogo inicia vacío.

Los datos usados en tests/capturas son sintéticos y viven en directorios temporales. No son fixtures ISO aprobados ni se agregan al catálogo del usuario.

## Persistencia y seguridad

`catalogs.sqlite` vive bajo `app.getPath('userData')`, junto a las preferencias JSON existentes.
Su esquema actual es versión 2, con migración atómica desde versión 1, foreign keys y restricciones QA/PREPROD. Incluye casos documentales DRAFT y su auditoría; ver `SAVED_CASES.md`. El Worker
usa queries parametrizadas; la UI nunca abre SQLite ni recibe el objeto DatabaseSync.

Guardar/eliminar y su evento de auditoría se confirman juntos. Se conservan los últimos
1000 eventos y se devuelven hasta 100; la UI muestra los últimos diez. Es auditoría local
operativa, editable externamente, sin garantía de evidencia certificada. Registra UUID,
fecha UTC, usuario, equipo, recurso, acción y ambiente, sin los valores de los formularios.

Las entidades referenciadas no se pueden eliminar. Entidades inactivas conservan sus ATM;
no permiten crear/activar nuevos perfiles. Los registros tienen una revisión creciente;
un editor obsoleto no puede sobrescribir ni eliminar la versión actual.

Ante conflicto o timeout, pulsar **Recargar** antes de volver a editar. El refresco cierra
el editor y muestra lo que efectivamente quedó guardado; un timeout no cancela una mutación
que ya se haya confirmado. Una base corrupta se conserva y produce un error seguro; el shell
y las preferencias siguen funcionando. Cerrar la app termina el Worker y libera la base.

La validación rechaza secuencias de 12 o más dígitos también cuando están separadas
por espacios (incluidos espacios no separables) o guiones. Se aplica a entidades,
ATM y casos en UI, IPC y lectura de SQLite. No cambia los formatos ISO pendientes.
Una entrada rechazada deja vacío el campo editado y requiere completarlo de nuevo;
no conserva silenciosamente el valor anterior para guardarlo. Escape no cierra el
diálogo de eliminación mientras hay una operación pendiente; vuelve a estar
disponible cuando llega su respuesta, incluso si termina en timeout.

## Alcance pendiente

Guardar un perfil **DRAFT** no valida los campos ISO ni habilita envío. El panel transaccional
solo informa la cantidad de borradores del ambiente; la selección funcional queda pendiente
de enlazar el motor y los perfiles validados. Todos los flujos ISO permanecen bloqueados.

Membresía, BIN/rangos, Core, fixedFields/red ATM, endpoints, framing, timeouts y tarjetas
permanecen pendientes de fuentes aprobadas. El conflicto de clasificación está registrado
como **TODO-DATA ENTITY-CLASSIFICATION** y se solicitó validación al usuario.

## Criterios de aceptación

- CRUD de entidades y ATM sobre SQLite real, persistente al reiniciar Electron.
- UUID técnicos, UTC en almacenamiento y conversión local en UI.
- Unicidad administrativa de código y Terminal ID por ambiente, sin formatear campos ISO.
- Rechazo de datos sensibles, claves extra, referencias inexistentes y PROD por IPC.
- Borrado protegido y rechazo de revisiones obsoletas, sin auditoría de cambios fallidos.
- Rollback completo si falla auditoría, queries parametrizadas y schema futuro/corrupto conservado.
- Error de arranque/bloqueo/timeout del Worker sin filtrar contenido; recuperación al reconsultar.
- E2E Electron comprueba formularios, ambientes, reinicio, conflicto concurrente y corrupción.
- Regresión de secuencias sensibles con separadores, edición rechazada sin guardar
  el valor anterior y Escape durante eliminación bajo bloqueo SQLite real.

Diseño y límites: `docs/adr/ADR-004-LOCAL-CATALOGS.md`.
