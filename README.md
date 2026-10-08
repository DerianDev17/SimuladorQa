# Coonecta ATM Transaction Simulator

Aplicacion desktop para QA orientada a simular transacciones ATM de la Red Coonecta, ejecutar pruebas funcionales, carga y estres, y correlacionar cada transaccion con SmartVista/SVFE y el Core correspondiente.

## Alcance inicial

- Desktop: Electron + TypeScript + React.
- Ambientes: QA y PREPROD. Produccion bloqueada por diseno.
- Escenarios: ATM Local, ATM RTC, BANRED y Externa.
- Hardware: HID OMNIKEY 5422 mediante PC/SC.
- Tarjetas: lectura fisica + perfiles de prueba configurables.
- MVP 1: consulta de saldo, retiro aprobado, retiro rechazado, reverso y reverso por timeout.
- Carga: mismo ATM o multiples ATM, una o multiples tarjetas, TPS configurable.
- Monitoreo: dashboard realtime de todas las instancias de la app.
- Correlacion: Switch Coonecta + Core mediante adaptadores.

## Principio rector

No inventar reglas transaccionales. Toda regla ISO8583, framing TCP, timeout, PIN/HSM, campos fijos/dinamicos y criterios de correlacion debe provenir de documentacion o evidencia real del proyecto.

## Desarrollo local

Base desktop implementada: dashboard, navegacion, seleccion persistida QA/PREPROD,
auditoria local, CRUD de entidades/ATM en SQLite mediante Worker y pantalla de
preparacion de transacciones con catalogo CMS por cuenta, seleccion ATM y revision
de requisitos. Las transacciones reales
siguen bloqueadas hasta disponer de evidencia aprobada.
La preparacion incluye plantillas documentales, validacion de monto, resumen de
revision y borrador conservado al navegar durante la sesion.
Permite guardar, recuperar y eliminar casos locales por ambiente, conservados
tras reiniciar, con referencias documentales y revision obligatoria del contexto.
La revision PREPROD compara Terminal ID/codigo con el esquema inspeccionado de
Mediator y muestra incompatibilidades sin truncar perfiles.
Historial incorpora una consulta parametrizada de Journal/Message PREPROD con
filtros y estructura XML protegida. La conexion real requiere TLS confiable y
una cuenta de lectura; el servidor actual sigue fallando validacion TLS.
Configuracion muestra la evidencia de red QA aportada para ATM/Switch/Mediator,
con puertos, PID y pendientes de acceso/framing. Se carga desde archivo privado
por ambiente al iniciar; no equivale a conexion comprobada ni habilita envio.
Una herramienta de prueba QA dispone de un emisor de captura con write unico,
plazos y metricas protegidas fuera del Renderer. Ver
`docs/implementation/QA_CAPTURE_REPLAY.md`; no construye nuevas tramas ISO ni
habilita el envio general de la app. El rechazo historico NO AUTHORIZATION
fue confirmado por el log; el 2026-10-08 la PC ya recibe gestion de red 0800.
La prueba actual identifica codigo 071, distinto del 072 de las capturas.
Los logs posteriores confirman la PC autorizada como PID 80131. El balanceador
172.60.60.171 fue rechazado en esa ventana; una captura posterior muestra
su conexion aceptada. Falta validar coexistencia de sesiones prolongadas.
Un codec acotado construye 0810 offline con codigo de respuesta obligatorio;
falta validar la politica del enlace antes de contestar. La herramienta
`tooling/probe-visa-network.mjs` comprueba recepcion sin transmitir.
Ver `docs/protocols/VISA_NETWORK_MANAGEMENT.md`.
La captura VCP Lite aporta un codec de envolvente VISA de cuatro bytes probado
offline en 262 frames y un caso privado de reproduccion exacta del retiro USD 20
STAN 001391. Conserva los campos originales; no crea una transaccion nueva con
otra tarjeta ni habilita el envio general. Ver el documento del emisor QA.
El 2026-10-08 el usuario confirma CB 205 como PID 82052 / 49212. La muestra
001391 ruteaba a 82032 y queda apartada del alcance exclusivo CB. Una nueva
captura aporta consulta y retiro de CB en ambos enlaces. El codec acotado
CapturedVisaBalance reconstruye la consulta original sin cambiar sus campos.
El intento unico desde la PC recibio 0210/F39 91; el usuario confirma llegada
a SmartVista y Mediator, cuyo TraceId 31580471 devuelve RetCode 8908 y
WS, PROCESADOR NO RESPONDE. Falta diagnosticar la llamada al procesador/Core.
Ver `docs/protocols/CB_205_BALANCE_SAMPLE.md`; no se envio un retiro.
Diez PCAP inspeccionados aportan un codec offline de encapsulado BANRED y una
vista de evidencia. 218 mensajes se reconstruyen byte a byte; los campos de
negocio y otros enlaces requieren diccionario y validacion de casos.
El proyecto legacy Simulador Banred aporta ContextoISO.xml y ejemplos de echo
y mensajes financieros de su mock servidor 4946. Se reviso sin ejecutarlo;
diccionario y reglas mock quedan separados del perfil cliente ATM y del Core
CB. Ver `docs/protocols/BANRED_SIMULATOR_REVIEW.md`.
ISOBASEI.bin de SWATM01 Coonecta fue recibido e inspeccionado. Un inspector
offline fuera del Renderer lee cabecera, posiciones ISO y tablas MTI sin
defaults ni datos de tarjeta. BCD/EBCDIC/BINARY contrastados con el formatter;
wire validado para la consulta capturada; generacion de nuevas transacciones
sigue pendiente. Ver `docs/protocols/ISOBASEI_REVIEW.md`.
La pantalla se ajusta al mockup con paneles compactos, conectores e inspector
tabular; documentacion y evidencia se muestran debajo del resumen de ejecucion.
Dashboard y Tarjetas consultan PC/SC en Windows para mostrar lectores, presencia
y ATR. El OMNIKEY 5422 conectado reporta tarjeta presente en ambas interfaces.
Tarjetas permite leer manualmente la identidad EMV por contacto: PAN enmascarado,
titular, vencimiento y aplicacion cuando el chip los expone. La tarjeta QA
terminada en 2267 fue leida fisicamente con pais de terminal Ecuador (218)
seleccionado por el usuario. Otros perfiles/PDOL, lectura contactless y generacion
PIN/EMV transaccional siguen pendientes. Ver `docs/hardware/EMV_IDENTITY_READING.md`
y `docs/implementation/CARD_READER_STATUS.md`.

Requiere Windows y Node.js 22.20 o una LTS posterior compatible.

```powershell
npm ci
npm run dev
```

Compilacion local: `npm run build` y `npm start`.
Validacion completa: `npm run check` y `npm run test:e2e`.

Ver `docs/implementation/BOOTSTRAP.md` para el comportamiento entregado y sus limites.
Ver `docs/implementation/LOCAL_CATALOGS.md` para los catalogos locales y la configuracion en borrador.
Ver `docs/implementation/TRANSACTION_PREPARATION.md` para la pantalla y el catalogo documental.
Ver `docs/implementation/SAVED_CASES.md` para los casos locales persistentes.
Ver `docs/implementation/MEDIATOR_OBSERVER.md` para consultar transacciones y mensajes.
Ver `docs/implementation/SWITCH_NETWORK_EVIDENCE.md` para la evidencia de red recibida.
El progreso implementado se marca en `docs/BACKLOG.md` y en la seccion de desarrollo
de `docs/INPUT_CHECKLIST.md`; la evidencia QA pendiente permanece sin marcar.

## Documentos principales

- `AGENTS.md`: reglas para Codex.
- `ARCHITECTURE.md`: arquitectura de alto nivel.
- `docs/product/PRODUCT_SPEC.md`: especificacion funcional.
- `docs/product/MVP1.md`: alcance MVP 1.
- `docs/INPUT_CHECKLIST.md`: informacion que falta subir.
- `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`: reglas CMS recibidas, matriz MVP y diferencias pendientes con ATM.
- `docs/protocols/PCAP_REVIEW.md`: inventario de capturas, encapsulado confirmado, verificacion y pendientes.
- `docs/mockups/MOCKUP_REVIEW.md`: revision del mockup y criterios para la pantalla de transacciones.
- `docs/BACKLOG.md`: backlog inicial.
- `docs/testing/TEST_STRATEGY.md`: estrategia QA.
- `docs/security/SECURITY.md`: controles de seguridad.
