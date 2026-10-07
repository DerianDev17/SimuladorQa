# ADR-004: catálogos locales en SQLite

## Decisión

Implementar CRUD de entidades y perfiles ATM como configuración en borrador. Mantener entidades globales y ATM separados por QA/PREPROD. No cargar nombres ni valores de una entidad/ATM real, ni resolver clasificación transaccional o campos ISO a partir del catálogo.

Usar `node:sqlite` detrás de un puerto y un Worker de Node. SQLite se ejecuta fuera de Main y Renderer; Main valida IPC y serializa operaciones junto con cambios de ambiente. El Worker usa queries parametrizadas, foreign keys, schema versionado, transacciones y busy timeout de 500 ms. Las respuestas tienen un timeout de servicio local de 3 s, independiente de los timeouts transaccionales pendientes.

El módulo SQLite viene con los runtimes Node/Electron instalados: no se añade una dependencia npm nativa ni reconstrucción ABI. Riesgo: API experimental en Node 22 y disponibilidad según runtime Electron; se verifica por integración real y E2E. Alternativas: better-sqlite3 con rebuild nativo, o JSON sin integridad referencial. No se silencian advertencias del runtime.

Referencia técnica: [API SQLite de Node](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

## Contratos y límites administrativos

- IDs y auditoría: UUID generados fuera del Renderer; timestamps UTC.
- Entidad: código, nombre, red COONECTA/BANRED/EXTERNAL y active.
- ATM: alias, entidad, ambiente, terminalId, acquirerId y active.
- Estado constante DRAFT: guardar no certifica el perfil ni desbloquea ISO.
- Límites de almacenamiento/UI: código 64 caracteres, nombres/alias/identificadores 128, sin controles ni secuencias numéricas de 12 o más dígitos que puedan contener PAN. No son restricciones ISO ni se rellenan, convierten o formatean identificadores del proveedor.
- Código de entidad único exacto; terminalId único exacto dentro del ambiente. Son claves administrativas del catálogo, pendientes de revisión si los datos oficiales exigen otra organización.
- No se elimina una entidad referenciada por ATM. No se crea ni activa un ATM bajo una entidad inactiva. Desactivar una entidad conserva sus perfiles, pero los excluye de selección funcional.
- Revisión entera creciente para rechazar edición/eliminación obsoleta; el cliente debe recargar después de conflicto/timeout antes de reintentar.
- Mutación y auditoría se confirman en una única transacción SQLite. La auditoría registra acción, UUID, usuario/equipo/fecha y ambiente; no registra valores de los formularios ni tramas.

## Datos pendientes

**TODO-DATA ENTITY-CLASSIFICATION**: `docs/entities/ENTITY_MODEL.md` propone networkType y memberType separados; `templates/ENTITY_TEMPLATE.md` mezcla FRONT/BACK/EXTERNA/BANRED en Tipo. Se ha solicitado validación. Este incremento usa solo la red documentada y difiere membresía y resolución de escenario; no transforma BANRED en una membresía ni asume equivalencia EXTERNA/EXTERNAL.

BIN/rangos, Core, fixedFields, red ATM, framing, endpoints, timeout y evidencia de validación permanecen pendientes. No se habilita almacenamiento de tarjetas ni secretos.

## Ciclo de vida

La base se crea bajo userData al abrir el catálogo. Un fallo del Worker/base devuelve un error seguro sin impedir el shell o sus preferencias JSON. No se recrea una base corrupta ni se abre un schema futuro. El Worker se cierra antes de salir; después de fallo/timeout, termina el Worker y la siguiente consulta reabre la base. Un timeout no garantiza que una mutación no se haya confirmado: se exige reconciliar consultando el catálogo.
