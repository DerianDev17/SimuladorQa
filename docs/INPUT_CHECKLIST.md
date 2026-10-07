# Checklist de informacion por subir

## TODO-DATA activos de la primera entrega

- **TODO-DATA ISO-SPEC**: faltan ContextoISO.xml y especificacion ATM aprobada. Bloquea construir/parsear campos de negocio ISO, PIN/HSM y reglas de negocio; la envolvente observada se verifica offline sin interpretar esos campos.
- **TODO-DATA CMS-ATM-MAPPING / CMS-XML-CONTRACT / CMS-RESULT-MAPPING**: recibido Extreme Mediator CMS v3.6 para XML/REST Mediator-Core. Falta validar su correspondencia con ATM, las diferencias tablas/ejemplos y los codigos por canal; no sustituye ISO-SPEC. Conflictos y solicitudes registrados en `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- **TODO-DATA CMS-REVERSAL / CMS-CORRELATION / CMS-TRANSPORT / CMS-POS-MAPPING**: el manual lista familias MTI y campos Core, pero faltan la seleccion del reverso, reglas de correlacion, contrato REST y resolucion de diferencias POS. Bloquean solo sus adaptadores/reglas dependientes.
- **TODO-DATA GOLDEN-SAMPLES / PCAP-CASE-MAPPING**: recibidos diez PCAP, con 218 envolventes BANRED reconstruidas byte a byte. Falta identificar/aprobar request/response de cada flujo MVP y correlacionar originales/reversos. Bloquea validacion de campos, codigos de respuesta y resultados de negocio. Ver `docs/protocols/PCAP_REVIEW.md`.
- **TODO-DATA PCAP-LINK-PROFILES**: BE16 inclusivo/header/bitmap confirmados solo para el enlace capturado 4946. Faltan ambiente, roles/diccionario de los otros enlaces y explicacion de solapamientos distintos. No se aplica este perfil automaticamente a todos los ATM.
- **TODO-DATA ENVIRONMENT**: faltan endpoints autorizados QA/PREPROD, framing, TLS y timeouts por escenario. Bloquea conectar/enviar TCP.
- **TODO-DATA PROFILES**: faltan ATM y tarjeta completos/validados. Bloquea configurar ejecuciones reales; el shell desktop y la seleccion de ambiente funcionan de forma independiente.
- **TODO-DATA AMOUNT-RULES**: faltan moneda, limites, monto minimo/maximo, denominaciones y reglas por cuenta/escenario para retirar. El borrador solo valida la sintaxis decimal del manual; no aprueba elegibilidad financiera.
- **TODO-DATA ENTITY-CLASSIFICATION**: ENTITY_MODEL propone red/membresia separadas y ENTITY_TEMPLATE mezcla FRONT/BACK/EXTERNA/BANRED como Tipo. Se solicito validacion; el CRUD usa los campos comunes y difiere membresia, BIN/Core y deteccion automatica de escenarios.
- **TODO-DATA HARDWARE**: falta prueba PC/SC en Windows con OMNIKEY 5422. Bloquea lectura fisica; no se presume lector conectado.
- **TODO-DATA OBSERVERS**: faltan SQL/API y reglas de correlacion aprobadas de SmartVista/Core. Consulta Journal/Message aportada por el usuario e implementada para Mediator; no completa validacion de resultados ni SmartVista.
- **TODO-DATA MEDIATOR-OBSERVER-ACCESS / MEDIATOR-JOURNAL-CORRELATION**: implementada consulta acotada PREPROD por TraceId a partir del SQL del usuario (2026-10-07). Falta cuenta de lectura, TLS con CA/nombre aprobado, mapeo entidad/canal y correlacion con ISO/runId/transactionId. La prueba segura actual devuelve TLS_ERROR, sin autenticar ni leer registros. Ver `docs/implementation/MEDIATOR_OBSERVER.md` y ADR-009; ADR-006 sigue limitado a metadatos.
- **TODO-DATA MEDIATOR-SQL-TIMEZONE / MEDIATOR-MESSAGE-PROJECTION**: confirmar zona de fechas SQL y aprobar allowlist de valores XML visibles. La consulta conserva hora SQL sin inferir UTC y protege todos los valores XML.
- **TODO-DATA LOAD-LIMITS**: faltan limites/ventanas autorizadas y gate funcional de los cinco flujos. Bloquea carga y estres.

La documentacion describe los flujos, pero no aporta evidencia suficiente para ejecutarlos.
El manual recibido aporta reglas parciales de Mediator/Core: no se considera trama ATM ni mock aprobado.
Ver `docs/implementation/BOOTSTRAP.md` para el alcance ya implementado.
El CRUD local de entidades/ATM funciona con configuracion en borrador; no completa ni valida automaticamente los items del checklist. Ver `docs/implementation/LOCAL_CATALOGS.md`.

## Checklist de desarrollo completado

Estos checks registran implementacion local. Los checks P0/P1 siguientes son
datos/evidencia externos y solo se marcaran al recibirlos y validarlos.

- [x] Shell Electron seguro, TypeScript strict y navegacion.
- [x] Seleccion QA/PREPROD persistida y auditoria de cambios; PROD bloqueado.
- [x] CRUD de entidades/ATM en SQLite mediante Worker, con version y auditoria.
- [x] Revision del mockup y matriz de evidencia CMS para las cinco transacciones.
- [x] Catalogo de saldo/retiro CMS por ahorros/corriente con fuente y pagina.
- [x] Pantalla de preparacion con los cuatro pasos y tres paneles del mockup.
- [x] Seleccion ATM del ambiente y revision en Main de version/estado/entidad.
- [x] Validacion de entradas y monto decimal de borrador, sin almacenar tarjeta.
- [x] Contexto invalidado al cambiar ambiente, editar o recargar perfiles.
- [x] Estados vacios y envio/RAW/HEX/reversos bloqueados por evidencia pendiente.
- [x] Plantillas documentales por cuenta y requisitos de monto/original visibles al seleccionar el flujo.
- [x] Feedback de monto en vivo y checklist de entradas locales separado de evidencia pendiente.
- [x] Resumen de revision desde Main con UUID/UTC; invalidado al editar contexto.
- [x] Borrador conservado al navegar en la sesion y boton Limpiar borrador.
- [x] Casos DRAFT persistentes QA/PREPROD, referencias documentales, carga con revalidacion ATM, borrado/auditoria y migracion SQLite v1 -> v2.
- [x] Conexion autenticada e inspeccion de metadatos de Mediator PREPROD, con excepcion TLS puntual autorizada.
- [x] Compatibilidad de Terminal ID/codigo en revision Main, sin truncado ni extrapolar el esquema a QA.
- [x] Credencial pass.txt y artefactos privados excluidos de Git; sin acceso desde Renderer.
- [x] Inventario de los diez PCAP, hashes y reporte sanitizado; originales excluidos de Git.
- [x] Framing incremental BE16 inclusivo y codec de envolvente BANRED con bitmap de 128 bits.
- [x] Reconstruccion offline byte a byte de 218 mensajes; errores de longitud/fuente incompleta controlados.
- [x] Vista de evidencia de capturas en transacciones sin exponer campos, RAW ni endpoints.
- [x] Composicion visual del mockup compactada: navegacion, cabecera, pasos/recorrido, inspector tabular e historial/metricas.
- [x] Requisitos/CMS/PCAP separados del area de operacion; estados reales y codigos del manual conservados.
- [x] Historial con filtros parametrizados Journal/Message PREPROD, bigint como string, limites, errores/timeout y estructura XML protegida fuera del Renderer; acceso real pendiente de TLS/cuenta.

Detalle y pruebas: `docs/implementation/TRANSACTION_PREPARATION.md`.

## P0 - Bloqueante para primer flujo real

- [ ] `ContextoISO.xml`.
- [ ] Especificacion ISO ATM Coonecta.
- [ ] Trama consulta saldo request/response aprobada.
- [ ] PCAP consulta saldo.
- [ ] Trama retiro aprobado request/response.
- [ ] PCAP retiro aprobado.
- [ ] Trama retiro rechazado request/response.
- [ ] Trama reverso request/response + original.
- [ ] PCAP reverso.
- [ ] Evidencia timeout + reverso.
- [ ] Host/puerto QA por escenario.
- [ ] Host/puerto PREPROD por escenario.
- [ ] Regla VLI/header/encoding.
- [ ] Timeout oficial por escenario.
- [ ] Moneda y reglas financieras del monto aprobadas por cuenta/escenario.
- [ ] Al menos un ATM QA completo.
- [ ] Al menos una tarjeta QA funcional.

## Fuentes recibidas y validacion pendiente

- [x] Mockup `mockup.png`, revisado: `docs/mockups/MOCKUP_REVIEW.md`.
- [x] Manual local Extreme Mediator CMS v3.6 (24 paginas, revision 13-04-2023).
- [x] Matriz de evidencia para los cinco flujos: `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- [x] Prioridad de 301000/302000 del documento sobre 310000 del mockup: usuario indico seguir el documento el 2026-10-06. No valida por si sola el formato de la trama ATM.
- [x] Diez PCAP recibidos e inspeccionados; matriz y metodo en `docs/protocols/PCAP_REVIEW.md`.
- [x] Encapsulado observado del enlace 4946 confirmado en 218 mensajes: BE16 inclusivo, header 12, MTI ASCII y bitmap ASCII hex de 128 bits.
- [ ] Validacion del ambiente, roles de enlaces y mapeo de capturas a cada caso MVP.
- [ ] Mapeo aprobado ATM ISO -> Mediator XML por escenario/cuenta/canal.
- [ ] Contrato XML aprobado o XSD y export request/response emparejado, sin errores de ejemplo.
- [ ] Mapeo de RetCode/CodigoProceso/MappedRespCode a RC ATM; tratamiento parcial.
- [ ] MTI de reverso, campos originales y flags; timeout, duplicados y late response.
- [ ] Generacion/eco de TraceId y TerminalSeq; relacion con STAN/RRN/UTRNNO.
- [ ] Contrato REST y mecanismo read-only de consulta Core autorizado.

Estos items no modifican el estado de las tramas ATM/PCAP pendientes del P0.

## P1 - Necesario para completar MVP

- [ ] Listado de entidades Coonecta.
- [ ] FRONT/BACK/EXTERNAS.
- [ ] BIN ranges.
- [ ] Catalogo ATM QA.
- [ ] Catalogo tarjetas QA.
- [ ] Response codes.
- [ ] Reglas PIN Block/HSM de TEST.
- [ ] SQL/vistas SmartVista de consulta read-only.
- [ ] Ejemplo de transaccion localizada en SmartVista.
- [ ] Core de cada entidad.
- [ ] Metodo de acceso Core.
- [ ] Query/API de correlacion Core.

## P1 - Hardware

- [ ] OMNIKEY 5422 conectado.
- [ ] Nombre PC/SC del reader.
- [ ] Driver/version.
- [ ] ATR/ATS de tarjeta de prueba.
- [ ] Evidencia de lectura disponible.

## P2 - Carga/estres

- [ ] TPS permitido QA.
- [ ] TPS permitido PREPROD.
- [ ] Max conexiones.
- [ ] Ventanas autorizadas.
- [ ] Limites de Switch.
- [ ] Limites de Core.
- [ ] Politica de parada por error.

## Mock BANRED

Subir preferentemente como ZIP o archivos sueltos:
- [ ] Manual_Mock_BANRED_SVFE_BASE24.docx
- [ ] mock_banred_tcp.py
- [ ] mock_banred_tcp_V1.0_4946.py
- [ ] mock_banred_tcp_8007_falla.py
