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

Las pruebas automatizadas no certifican hardware ni resultados financieros del
host/Core. Ver [estrategia de pruebas](testing/TEST_STRATEGY.md).
