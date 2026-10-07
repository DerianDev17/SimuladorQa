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
Mediator y muestra incompatibilidades sin truncar perfiles; no es un Observer conectado.
Diez PCAP inspeccionados aportan un codec offline de encapsulado BANRED y una
vista de evidencia. 218 mensajes se reconstruyen byte a byte; los campos de
negocio y otros enlaces requieren diccionario y validacion de casos.
La pantalla se ajusta al mockup con paneles compactos, conectores e inspector
tabular; documentacion y evidencia se muestran debajo del resumen de ejecucion.

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
