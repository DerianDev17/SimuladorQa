# Validaciones locales y CI

Fuente ejecutable: [package.json](../package.json) y
[workflow de CI](../.github/workflows/ci.yml).

## Comprobación local

`npm run check` ejecuta, en orden:

1. Formato (`format:check`).
2. ESLint (`lint`).
3. TypeScript (`typecheck`).
4. Unitarias e integración (`test`).
5. Detección heurística de secretos (`check:security`).
6. Compilación desktop (`build`).

`npm run test:e2e` prepara Electron, compila y ejecuta Playwright. No forma parte
de `check`. Antes de cada commit se requieren lint, tipos, unitarias e integración
del módulo afectado, conforme a [AGENTS.md](../AGENTS.md).

## CI vigente

El workflow se ejecuta en push y pull request, sobre Windows con Node 22.20.0 y
24.x. En ambas versiones instala con `npm ci`, ejecuta `check` y
`npm audit --audit-level=high`. La auditoría bloquea por severidad alta o crítica;
no es solo informativa.

La variante Node 22.20.0 añade cobertura y E2E. Si falla, se intenta adjuntar
`test-results/` cuando existe. El workflow no publica instaladores ni compila un
Control Plane: ese componente sigue propuesto.

La integración de configuración ausente de Mediator concede 30 s al arranque
en frío de Windows PowerShell y 35 s al caso, con cierre en `finally`. El caso
de timeout del adaptador se ejecuta separado con un plazo de 1 ms. Evita que el
timeout global del runner gane al del proceso y oculte el resultado del caso;
no cambia el plazo operativo de Mediator ni añade reintentos.

Los casos concurrentes de éxito de `physical-card-load-run.test.ts` conceden
5 s de respuesta al servidor TCP sintético, que demora hasta 1,5 s para comprobar
la cola de conexiones. Ese margen absorbe variaciones de planificación en Windows;
los casos de timeout conservan sus plazos cortos y un servidor sin respuesta.
Ante fallo se incluyen resultados y tiempos por operación, sin campos financieros.
No cambia la configuración TCP de la aplicación ni los límites de carga.

Las pruebas automatizadas no certifican hardware ni resultados financieros del
host/Core. Ver [estrategia de pruebas](testing/TEST_STRATEGY.md).
