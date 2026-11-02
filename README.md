# Coonecta ATM Transaction Simulator

Aplicación desktop de QA para preparar y ejecutar transacciones ATM, realizar
carga controlada y consultar evidencia de Mediator. Electron, TypeScript strict
y React; hardware, secretos, TCP y persistencia se ejecutan fuera del Renderer.

## Inicio rápido

Requiere Windows y Node.js `>=22.20.0 <23` o `>=24`, según `package.json`.

```powershell
npm ci
npm run dev
```

Para ejecutar la compilación local:

```powershell
npm run build
npm start
```

Main y preload deben corresponder a la misma compilación. El lanzador de desarrollo
coordina la recarga y espera las operaciones activas. Configuración, perfiles
privados y diarios viven fuera del repositorio, en el directorio de datos de
Electron. Ver [arranque y diagnóstico](docs/implementation/BOOTSTRAP.md).

## Funcionalidad actual

| Área | Disponible | Alcance y límites |
| --- | --- | --- |
| Operación | Consulta de saldo y retiro; mensajería protegida de solicitud/respuesta | Ejecución QA/LOCAL/ahorros, con perfil, lector y seguridad válidos |
| Retiro | Monto personalizado y comprobante local opcional | USD, contrato vigente del ATM; el host determina el resultado |
| Retiro + reverso | Reverso único después de aprobación completa y espera de 1–30 s | Flujo explícito; no confundir con reverso automático por timeout |
| Carga y estrés | Saldo y retiro, varios ATM alternados y una tarjeta física | Saldo 1–5 operaciones en curso; retiro secuencial; hasta 5 TPS objetivo |
| Perfiles | Entidades, ATM y referencias QA de tarjetas | Los ATM QA/205 heredan la plantilla ATM20521 y su pool compartido |
| Casos | Borradores guardados y expectativa local PASS/FAIL/INCONCLUSIVE | No certifica el resultado financiero en Switch/Core |
| Inicio e historial | Feed Mediator QA/PREPROD y consulta manual del historial PREPROD | No sustituye la correlación financiera ni garantiza captura completa |

Producción permanece bloqueada. PREPROD tiene configuración y consultas propias;
no implica que los flujos financieros QA estén habilitados allí. BANRED, RTC,
externas, pool virtual, carga distribuida y Control Plane conservan pendientes
según el [registro de datos faltantes](docs/TODO_DATA.md).

## Ejecutar una operación

1. Seleccionar QA y un perfil ATM activo con configuración de envío disponible.
2. En Operación, elegir transacción, cuenta, escenario y monto cuando aplica.
3. Insertar la tarjeta por contacto y pulsar **Leer tarjeta**.
4. Pulsar **Ejecutar Transacción** e ingresar el PIN en el diálogo protegido.
5. Revisar resultado, correlación y mensajería; consultar el historial ante
   incertidumbre. La misma solicitud no se reenvía automáticamente.

Para carga, abrir **Carga y estrés**, seleccionar ATM, operación, límites y tarjeta.
En retiro, indicar el monto **por operación**. La corrida se detiene al primer
rechazo/error y solicita PIN una vez. Detalles en la [guía de carga](docs/implementation/LOAD_TEST.md).

La consulta de saldo tiene evidencia QA aprobada documentada. Las pruebas locales
no acreditan por sí mismas aceptación de nuevos flujos ni capacidad del host.
No se inventan reglas ISO8583, PIN/EMV, resultados Core o límites financieros.

## Validar cambios

```powershell
npm run check
npm run test:e2e
```

`check` ejecuta formato, lint, tipos, unitarias, integración, chequeo de secretos y
build. CI añade auditoría de dependencias y cobertura; ver la
[estrategia de pruebas](docs/testing/TEST_STRATEGY.md). Las pruebas automatizadas
usan dependencias sintéticas, TCP local y directorios temporales cuando aplica.

## Documentación

- [Índice y convenciones documentales](docs/README.md).
- [Arquitectura implementada](ARCHITECTURE.md) y [decisiones ADR](docs/adr/README.md).
- [Saldo QA](docs/implementation/BALANCE_EXECUTION.md), [retiro](docs/transactions/WITHDRAWAL.md)
  y [reversos](docs/transactions/REVERSAL.md).
- [Preparación y mensajería](docs/implementation/TRANSACTION_PREPARATION.md),
  [perfiles ATM](docs/implementation/MULTI_ATM_PROFILES.md) y [casos](docs/implementation/SAVED_CASES.md).
- [Feed de Inicio](docs/implementation/DASHBOARD_LIVE_FEED.md) y
  [observador Mediator](docs/implementation/MEDIATOR_OBSERVER.md).
- [TODO-DATA](docs/TODO_DATA.md), [checklist de fuentes](docs/INPUT_CHECKLIST.md)
  y [seguridad](docs/security/SECURITY.md).
- [Historial de cambios](CHANGELOG.md) y [reglas del repositorio](AGENTS.md).
