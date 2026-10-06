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

Primera base desktop implementada: dashboard, navegacion, seleccion persistida QA/PREPROD,
auditoria local y revision de requisitos de los cinco flujos MVP. Las transacciones reales
siguen bloqueadas hasta disponer de evidencia aprobada.

Requiere Windows y Node.js 22.20 o una LTS posterior compatible.

```powershell
npm ci
npm run dev
```

Compilacion local: `npm run build` y `npm start`.
Validacion completa: `npm run check` y `npm run test:e2e`.

Ver `docs/implementation/BOOTSTRAP.md` para el comportamiento entregado y sus limites.

## Documentos principales

- `AGENTS.md`: reglas para Codex.
- `ARCHITECTURE.md`: arquitectura de alto nivel.
- `docs/product/PRODUCT_SPEC.md`: especificacion funcional.
- `docs/product/MVP1.md`: alcance MVP 1.
- `docs/INPUT_CHECKLIST.md`: informacion que falta subir.
- `docs/BACKLOG.md`: backlog inicial.
- `docs/testing/TEST_STRATEGY.md`: estrategia QA.
- `docs/security/SECURITY.md`: controles de seguridad.
