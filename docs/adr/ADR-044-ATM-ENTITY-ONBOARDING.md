# ADR-044: entidades y validación en el asistente ATM

Fecha: 2026-11-12. Fuente: solicitud del usuario de integrar las entidades
configuradas, mostrar su clasificación y validar antes de la prueba de saldo.

## Decisión

El asistente **Crear ATM Qa** permite buscar/seleccionar las entidades del
catálogo y conserva visibles nombre, código, FRONT/BACK/EXTERNA/HÍBRIDA, red,
estado y revisión. La clasificación sigue siendo administrativa; no determina
un destino, adquirente, Core o escenario financiero. Los valores múltiples
se muestran con validación pendiente, conforme a ADR-043.

El comando `createQaAtm` mantiene el contrato de plantilla QA/205 y admite un
segundo contrato administrativo con UUID/revisión de entidad y Acquirer ID
explícito. La base valida entidad activa y revisión dentro de la transacción.
La modalidad explícita no sustituye la herencia de 205. Usa UUID de solicitud
como UUID ATM y conserva recuperación idempotente, unicidad y auditoría.
No cambia el esquema SQLite ni importa otras configuraciones al arrancar.

Solo 205 hereda ATM20521 y su formato de terminal/adquirente. Para otras
entidades se aplica la validación administrativa del catálogo: no se inventan
formatos ISO. Cambiar la entidad limpia el adquirente introducido. Un alta
con clasificación pendiente se conserva, pero no habilita saldo.

`AtmInspectionService` recibe el catálogo mediante una dependencia de lectura,
comprueba entidad, clasificación, alcance y ATM, y consulta perfil/seguridad/pool
únicamente si los requisitos previos son válidos. Devuelve un resumen público
de entidad y relee catálogo/configuración para descartar cambios concurrentes.
Un resultado anterior se invalida en UI al cambiar entidad/ATM, recargar o
navegar. **Verificar y probar** admite todos los ATM para mostrar pendientes.
La inspección usa una invocación IPC nueva en cada intento explícito: no comparte
una consulta cuyo plazo de espera ya agotó el Renderer. Esto conserva la
recuperación ante una respuesta perdida sin reutilizar un diagnóstico pendiente.

El nuevo IPC `testQaAtmBalance` valida el contexto estricto de saldo y la entidad
con su revisión. En Main adquiere la misma exclusión financiera y repite la
inspección antes de preparar la transacción; exige configuración y entidad
vigentes. La autorización previa al envío vuelve a comprobar estado, revisión,
clasificación y alcance de la entidad junto con los controles existentes.
No modifica el contrato ni el comportamiento de saldo manual/carga. Se reutilizan
el motor, PIN protegido, diario, idempotencia e incertidumbre existentes.
El preload conserva el control de emisor y el bloqueo durante carga/reinicio.

## Datos pendientes y alcance

**TODO-DATA ATM-ENTITY-BALANCE-PROFILES:** falta una fuente aprobada para la
configuración financiera de cada entidad distinta de 205: adquirente, destino,
campos/diccionario, seguridad y respuestas. El listado de clasificación no la
proporciona. Hasta resolverlo, se guarda el ATM y se presenta el pendiente,
manteniendo bloqueada su prueba financiera. **ENTITY-CLASSIFICATION-MULTIPLE**
continúa para 200/207/232; no se resuelve eligiendo un rol automáticamente.

La configuración local aprobada no acredita admisión remota del Terminal ID.
La prueba requiere tarjeta QA, acción explícita del operador y aceptación del
host. No se aprovisiona el switch ni se habilita producción.

## Validación

- Unitarias: contratos de alta/prueba, clasificaciones, alcance, cambios de
  entidad, errores sanitizados y timeout de inspección.
- Integración: alta explícita, recuperación y auditoría, duplicados, revisión
  obsoleta/entidad inactiva, bloqueo previo a saldo y cambio durante preparación.
- Electron: selección y búsqueda, etiquetas, adquirente vacío al cambiar entidad,
  alta/diagnóstico fuera de 205, roles múltiples, herencia 205 y prueba guiada.
- Pruebas con fuentes sintéticas; no consumen reservas ni envían saldo al host QA.
