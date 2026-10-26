# Backlog inicial

## Epic 1 - Foundation
- [x] crear monorepo npm (desktop/domain/shared)
- [x] Electron shell seguro con IPC validado
- [x] TypeScript strict
- [x] React layout y navegacion inicial
- [x] seleccion de ambiente persistida y auditoria local
- [ ] configuracion completa de endpoints y limites (TODO-DATA ENVIRONMENT)
- [x] SQLite/Worker para catalogos de entidades y ATM, con auditoria atomica
- [x] SQLite para diarios financieros de saldo y retiro; migracion del JSON anterior, ver BALANCE_EXECUTION
- [ ] logging transaccional sanitizado y rotacion

La primera entrega tiene pruebas unitarias, integracion y E2E Electron. Ver `docs/implementation/BOOTSTRAP.md`.

Los items marcados corresponden a funcionalidad implementada y verificada. Las
fuentes/ambientes autorizados se siguen en `docs/INPUT_CHECKLIST.md`; configurar
un borrador no completa esos requisitos.

## Epic 2 - Hardware
- [x] listar readers PC/SC mediante adaptador Windows fuera del Renderer
- [x] detectar OMNIKEY 5422, verificado fisicamente el 2026-10-08
- [x] detectar presencia/retirada de tarjeta e invalidar identidad de sesion
- [x] leer identidad EMV de contacto y mostrar PAN enmascarado; otros perfiles pendientes
- [ ] resolver perfil

## Epic 3 - Profiles
- [x] entidades CRUD (campos comunes, en borrador)
- [x] ATM CRUD (ambientes independientes, en borrador)
- [ ] membresia/BIN/Core y validacion de catalogos aprobados
- [ ] tarjetas CRUD con almacenamiento cifrado
- [ ] import CSV tarjetas

## Epic 4 - ISO/TCP
- [x] inventario privado de los diez PCAP y reporte sanitizado con hashes/UUID/UTC
- [x] framing offline del enlace BANRED capturado: BE16 inclusivo, fragmentacion y concatenacion
- [x] codec de envolvente observada: cabecera/MTI/bitmap de 128 bits y cuerpo opaco
- [x] reconstruccion byte a byte de 218 mensajes, sin exportar campos sensibles
- [ ] field dictionary ATM aprobado
- [ ] parser de campos de negocio conforme al diccionario aprobado
- [ ] builder de campos de negocio/templates por flujo
- [ ] variantes de bitmap de otros perfiles aprobados
- [ ] perfiles de framing aprobados para todos los escenarios/ambientes
- [ ] persistent connection
- [ ] timeout/reconnect de transporte ATM

## Epic 5 - Transactions
- [x] revision del mockup y manual CMS v3.6 con matriz de los cinco flujos
- [x] catalogo documental por cuenta: saldo 301000/302000 y retiro 011000/012000
- [x] fuente/version/pagina y adaptador CMS separado del dominio
- [x] pantalla de transacciones con pasos, formulario, recorrido e inspector vacios
- [x] igualacion visual del mockup: barra superior/lateral, paneles compactos, conectores, tabla ISO y resumen inferior
- [x] referencia CMS, preparacion y capturas separadas del inspector; acceso al historial conserva el borrador
- [x] seleccion ATM/entidad activos por ambiente, conservando estado borrador
- [x] cuenta ahorros/corriente y validacion de sintaxis de monto sin floats
- [x] revision de borrador por IPC y revalidacion de ambiente/version ATM en Main
- [x] bloqueo explicito de reverso/original y requisitos de envio
- [x] invalidacion del contexto al editar, recargar o cambiar ambiente
- [x] plantillas documentales por operacion/cuenta que conservan ATM/escenario
- [x] feedback de monto y checklist local/requisitos de envio en vivo
- [x] resumen del contexto revisado por Main con UUID y timestamp UTC
- [x] borrador conservado al navegar durante la sesion y accion Limpiar borrador
- [x] guardar/cargar/eliminar casos DRAFT persistentes por ambiente con referencias documentales sanitizadas y revalidacion de ATM
- [x] expectativas opcionales por caso, migracion v3 y veredicto local para respuestas financieras correlacionadas sin modificar el envio
- [x] recorrido UI de datos, lectura/seleccion manual de tarjeta y resumen sin envio
- [x] configuracion rapida entidad/ATM con retorno al borrador y seleccion del perfil activo creado
- [x] busqueda local y filtros de operacion/vigencia en casos con recuperacion de errores
- [x] confirmacion de limpieza que conserva casos y bloqueo de ambiente durante operaciones
- [x] configuracion de envio por ambiente y plan automatico offline desde el formulario, sin RAW/HEX ni sockets
- [ ] generador de requests nuevos aprobado (AUTOMATIC-FRAME-GENERATOR / CB-DYNAMIC-REQUEST / CARD-TRANSACTION-SECURITY)
- [x] builder acotado CB/QA/ahorros con reglas de la imagen ATM y campos privados por proveedor, verificado con fixtures sinteticos
- [x] parser F54 exacto y etiquetas neutrales 01/02/91, sin mapeo supuesto total/disponible
- [ ] balance real (ISO-SPEC / GOLDEN-SAMPLES / ENVIRONMENT / PROFILES)
- [ ] contexto financiero de tarjeta/cuenta en Main mediante referencia opaca y sesion vigente
- [x] orquestador de saldo e IPC con revalidacion, referencia de tarjeta y proteccion de doble envio; proveedor real pendiente
- [x] recepcion ISO correlacionada y proyeccion F54; semantica/variantes BALANCE-RESPONSE-CONTRACT pendientes
- [x] diario de saldo persistente, idempotencia tras reinicio, recuperacion e historial QA; sin datos de seguridad
- [ ] withdrawal approved real
- [ ] withdrawal declined real
- [ ] reversal real
- [ ] timeout reversal real

Ver `docs/implementation/TRANSACTION_PREPARATION.md`. Revisar el borrador no
genera una transaccion ni se cuenta como un flujo MVP aprobado.
La biblioteca local se documenta en `docs/implementation/SAVED_CASES.md`; sus
referencias no son evidencia de una ejecucion ni habilitan envio.
La revision del 2026-10-12 separa el bloqueo de envio en codigo del 91/96
historico y prioriza el primer saldo nuevo CB 205/QA/ahorros. Ver
`docs/transactions/BALANCE_INQUIRY.md`; ISOBASEI y PCAP CB ya estan recibidos.

## Epic 6 - Observability
- [x] evidencia de las diez capturas visible en transacciones, con conteos MTI y limites del analisis
- [x] inspeccion autenticada de esquema Mediator PREPROD y matriz de evidencia
- [x] compatibilidad de destino en revision Main con esquema observado, sin truncado
- [x] consulta Journal/Message PREPROD por TraceId con filtros, limites, timeout y estructura XML protegida; acceso real pendiente
- [x] vista Configuracion de evidencia de red por ambiente, cargada/validada desde archivo privado en Main; destino/PID documentados sin activar sockets
- [ ] cuenta de solo lectura y TLS aprobado para Observer permanente
- [ ] vinculo entidad/canal/terminal y query de correlacion Mediator aprobada
- [x] estados vacios del inspector, recorrido, historial y metricas sin datos ficticios
- [ ] ISO inspector con evidencia sanitizada (Parsed / RAW / HEX)
- [ ] SmartVista observer
- [ ] Core adapter read-only
- [ ] evidence view con resultados reales

## Epic 7 - Load
- [x] worker secuencial para piloto fisico de saldo QA/LOCAL, una operacion en curso
- [x] ritmo objetivo con rampa opcional y limite local de 5 TPS; tasa real no garantizada
- [x] una tarjeta fisica y un ATM por corrida, con parada y recuperacion del estado
- [x] metricas de envios, respuestas, resultados, TPS, latencias y tiempos por etapa
- [ ] pool financiero virtual y concurrencia mayor a uno (TODO-DATA LOAD-VIRTUAL-PROVIDER)
- [ ] multiples tarjetas/ATM por corrida y pruebas en PREPROD u otros flujos

El piloto se verifica con pruebas unitarias, de integracion y Electron con fuente
sintetica; no acredita capacidad del Switch ni una corrida de carga real.
Ver `docs/implementation/LOAD_TEST.md` y los limites pendientes en
`docs/INPUT_CHECKLIST.md`.

## Epic 8 - Distributed
- [ ] Control Plane
- [ ] agent registration
- [ ] heartbeat
- [ ] realtime dashboard
- [ ] distributed runs
