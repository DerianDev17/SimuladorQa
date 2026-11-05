# Coonecta ATM Transaction Simulator

Aplicación desktop de QA para preparar y ejecutar transacciones ATM, realizar
carga controlada y consultar evidencia de Mediator. Electron, TypeScript strict
y React; hardware, secretos, TCP y persistencia se ejecutan fuera del Renderer.

Transacciones presenta Flujo, Mensajes y Evidencia para cada ejecución. Su
historial local combina saldos y retiros y permite seleccionar una operación
sin modificar el borrador. Ver [preparación](docs/implementation/TRANSACTION_PREPARATION.md)
y [ADR-036](docs/adr/ADR-036-TRANSACTION-INSPECTION.md).

Estado documentado: **2026-11-03**. Consultar el [backlog](docs/BACKLOG.md) para
distinguir desarrollo pendiente de validación con hardware, Switch y Core.

## Inicio rápido

Requiere Windows y Node.js `>=22.20.0 <23` o `>=24`, según `package.json`.

```powershell
npm ci
npm run dev
```

Estos comandos arrancan la aplicación; ejecutar operaciones reales requiere
lector PC/SC, tarjeta QA, perfil ATM y configuración privada válidos. Un perfil
de tarjeta guardado no sustituye al chip. La configuración de la estación se
describe en [perfiles ATM](docs/implementation/MULTI_ATM_PROFILES.md) y
[conexión Switch](docs/implementation/SWITCH_CONNECTION.md).

Para ejecutar la compilación local:

```powershell
npm run build
npm start
```

Main y preload deben corresponder a la misma compilación. El lanzador de desarrollo
coordina la recarga y espera las operaciones activas. Configuración, perfiles
privados y diarios viven fuera del repositorio, en el directorio de datos de
Electron. Ver [arranque y diagnóstico](docs/implementation/BOOTSTRAP.md).
La compilación genera `dist/` para ejecución local; no crea un instalador firmado.

## Funcionalidad actual

| Área | Disponible | Alcance y límites |
| --- | --- | --- |
| Operación | Consulta de saldo y retiro; mensajería protegida de solicitud/respuesta | Ejecución QA/LOCAL/ahorros, con perfil, lector y seguridad válidos |
| Retiro | Monto personalizado y comprobante local opcional | USD, contrato vigente del ATM; el host determina el resultado |
| Retiro + reverso | Reverso único después de aprobación completa y espera de 1–30 s | Flujo explícito; no confundir con reverso automático por timeout |
| Carga y estrés | Saldo y retiro, varios ATM alternados y una tarjeta física | Saldo 1–5 operaciones en curso; retiro secuencial; hasta 5 TPS objetivo |
| Historial de carga | Corridas paginadas, filtros, detalle y exportación CSV/JSON | Evidencia local QA de corridas cerradas; conserva resultados inciertos |
| Configuraciones de carga y estrés | Crear, editar, cargar y eliminar parámetros; presets de rampa a 3/5 TPS | Hasta 50 configuraciones QA, sin tarjeta/PIN; cargar no inicia la corrida |
| Perfiles | Entidades, ATM y referencias QA de tarjetas | Los ATM QA/205 heredan la plantilla ATM20521 y su pool compartido |
| Casos | Borradores guardados y expectativa local PASS/FAIL/INCONCLUSIVE | No certifica el resultado financiero en Switch/Core |
| Inicio e historial | Feed Mediator QA/PREPROD y consulta manual del historial PREPROD | No sustituye la correlación financiera ni garantiza captura completa |

Producción permanece bloqueada. PREPROD tiene configuración y consultas propias;
no implica que los flujos financieros QA estén habilitados allí. BANRED, RTC,
externas, pool virtual, carga distribuida y Control Plane conservan pendientes
según el [registro de datos faltantes](docs/TODO_DATA.md).
Tampoco están implementados la conciliación automática con SmartVista/Core ni
el reverso automático por timeout. El reverso explícito tiene su propio alcance.

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

Para recuperar evidencia: **Ver historial de carga → Ver detalle → Exportar CSV
o Exportar JSON**. El archivo se guarda mediante el diálogo nativo; ver
[formatos y alcance](docs/REPORTING.md).

**Pruebas de estrés** ofrece rampas de 20 segundos hacia 3 o 5 TPS, ajustables en
modo avanzado. **Configuraciones guardadas** permite reutilizar los parámetros
del formulario; después de cargar, leer la tarjeta y pulsar **Iniciar prueba**.

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

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desarrollo con recarga coordinada de React, Main y preload |
| `npm run build` / `npm start` | Compilar y ejecutar la app local |
| `npm run lint` / `npm run typecheck` | Revisar código y contratos TypeScript |
| `npm run test:unit` / `npm run test:integration` | Ejecutar suites por nivel |
| `npm run test:e2e` | Preparar Electron, compilar y probar recorridos de escritorio |
| `npm run test:coverage` | Obtener cobertura de unitarias e integración |

## Estructura del repositorio

- `apps/desktop/src/renderer`: interfaz React.
- `apps/desktop/src/main`: aplicación, motor financiero, carga y adaptadores.
- `apps/desktop/src/preload.ts`: puente IPC público.
- `packages/domain` y `packages/shared`: dominio y contratos compartidos.
- `tests` y `tooling`: pruebas y herramientas de desarrollo/compilación.
- `docs` y `agents`: guías, fuentes, decisiones y reglas de trabajo.

Las dependencias entre capas se explican en [ARCHITECTURE.md](ARCHITECTURE.md).
Control Plane y agentes remotos son propuestas; no hay un servicio central que
instalar o arrancar con los comandos de este repositorio.

## Documentación

- [Índice y convenciones documentales](docs/README.md).
- [Pendientes de implementación y validación](docs/BACKLOG.md).
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
