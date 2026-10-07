# Checklist de informacion por subir

## TODO-DATA activos de la primera entrega

- **TODO-DATA ISO-SPEC**: faltan ContextoISO.xml y especificacion ATM aprobada. Bloquea construir/parsear ISO, PIN/HSM y reglas de negocio.
- **TODO-DATA CMS-ATM-MAPPING / CMS-XML-CONTRACT / CMS-RESULT-MAPPING**: recibido Extreme Mediator CMS v3.6 para XML/REST Mediator-Core. Falta validar su correspondencia con ATM, las diferencias tablas/ejemplos y los codigos por canal; no sustituye ISO-SPEC. Conflictos y solicitudes registrados en `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- **TODO-DATA CMS-REVERSAL / CMS-CORRELATION / CMS-TRANSPORT / CMS-POS-MAPPING**: el manual lista familias MTI y campos Core, pero faltan la seleccion del reverso, reglas de correlacion, contrato REST y resolucion de diferencias POS. Bloquean solo sus adaptadores/reglas dependientes.
- **TODO-DATA GOLDEN-SAMPLES**: faltan request/response y PCAP validados de cada flujo MVP. Bloquea validaciones byte a byte, codigos de respuesta y reversos.
- **TODO-DATA ENVIRONMENT**: faltan endpoints autorizados QA/PREPROD, framing, TLS y timeouts por escenario. Bloquea conectar/enviar TCP.
- **TODO-DATA PROFILES**: faltan ATM y tarjeta completos/validados. Bloquea configurar ejecuciones reales; el shell desktop y la seleccion de ambiente funcionan de forma independiente.
- **TODO-DATA ENTITY-CLASSIFICATION**: ENTITY_MODEL propone red/membresia separadas y ENTITY_TEMPLATE mezcla FRONT/BACK/EXTERNA/BANRED como Tipo. Se solicito validacion; el CRUD usa los campos comunes y difiere membresia, BIN/Core y deteccion automatica de escenarios.
- **TODO-DATA HARDWARE**: falta prueba PC/SC en Windows con OMNIKEY 5422. Bloquea lectura fisica; no se presume lector conectado.
- **TODO-DATA OBSERVERS**: faltan SQL/API y reglas de correlacion aprobadas de SmartVista/Core. Bloquea observabilidad remota sin alterar el estado transaccional.
- **TODO-DATA LOAD-LIMITS**: faltan limites/ventanas autorizadas y gate funcional de los cinco flujos. Bloquea carga y estres.

La documentacion describe los flujos, pero no aporta evidencia suficiente para ejecutarlos.
El manual recibido aporta reglas parciales de Mediator/Core: no se considera trama ATM ni mock aprobado.
Ver `docs/implementation/BOOTSTRAP.md` para el alcance ya implementado.
El CRUD local de entidades/ATM funciona con configuracion en borrador; no completa ni valida automaticamente los items del checklist. Ver `docs/implementation/LOCAL_CATALOGS.md`.

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
- [ ] Al menos un ATM QA completo.
- [ ] Al menos una tarjeta QA funcional.

## Fuentes recibidas y validacion pendiente

- [x] Mockup `mockup.png`, revisado: `docs/mockups/MOCKUP_REVIEW.md`.
- [x] Manual local Extreme Mediator CMS v3.6 (24 paginas, revision 13-04-2023).
- [x] Matriz de evidencia para los cinco flujos: `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- [x] Prioridad de 301000/302000 del documento sobre 310000 del mockup: usuario indico seguir el documento el 2026-10-06. No valida por si sola el formato de la trama ATM.
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
