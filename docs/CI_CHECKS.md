# Validaciones locales y CI

Fuente ejecutable: [package.json](../package.json) y
[workflow de CI](../.github/workflows/ci.yml).

## Comprobación local

`npm run check:static` ejecuta formato, ESLint, TypeScript y detección heurística
de secretos. `npm run check` añade unitarias, integración y compilación desktop:

1. Formato (`format:check`).
2. ESLint (`lint`).
3. TypeScript (`typecheck`).
4. Detección heurística de secretos (`check:security`).
5. Unitarias e integración (`test`).
6. Compilación desktop (`build`).

`npm run test:e2e` prepara Electron, compila y ejecuta Playwright. No forma parte
de `check`. Antes de cada commit se requieren lint, tipos, unitarias e integración
del módulo afectado, conforme a [AGENTS.md](../AGENTS.md).

## CI vigente

El workflow se ejecuta en push y pull request, sobre Windows. Un nuevo commit
cancela la ejecución anterior de la misma rama o PR para evitar trabajo obsoleto.
Todos los trabajos deben terminar correctamente para aprobar el workflow:

| Trabajo | Validación |
| --- | --- |
| `desktop (22.20.0)` | `check:static`, unitarias e integración **una vez con cobertura**, build y auditoría |
| `desktop (24.x)` | `check:static`, unitarias e integración, build y auditoría |
| `e2e (1)`, `e2e (2)`, `e2e (3)` | Suite completa de Electron repartida entre tres máquinas Node 22.20.0 |

La cobertura ejecuta las mismas unitarias e integración que `npm test`; no se
vuelven a ejecutar sin cobertura en Node 22. Se conservan los umbrales existentes.
`npm audit --audit-level=high` bloquea por severidad alta o crítica en ambos Node.

Los tres shards E2E comienzan en paralelo con los chequeos de Node, sin esperar
su finalización. `--fully-parallel` permite repartir casos de un mismo archivo
(especialmente `desktop.spec.ts`); `--workers=1` conserva una única prueba activa
por máquina. Cada caso mantiene su aplicación y directorio temporal independientes.
El comando local `npm run test:e2e` sigue ejecutando todos los casos en serie.
Reproducir un shard: `npm run test:e2e -- --fully-parallel --workers=1 --shard=1/3`.

Cada shard adjunta `test-results/results.json` con resultados y duraciones, incluso
si pasa; ante fallos también conserva trazas y capturas disponibles. Los artefactos
caducan a los siete días. La división reduce la espera a cambio de usar hasta
cinco runners simultáneos; no elimina pruebas ni introduce reintentos.

Referencia antes de optimizar: ejecución `45303653992`, 13 min 16 s en Node 22,
con 136 E2E en 7,2 min y 1.829 pruebas de Vitest repetidas para cobertura. Comparar
con el trabajo más lento de las nuevas ejecuciones, incluyendo instalación/build
y cualquier espera por disponibilidad de runners; no sumar los tiempos paralelos.

El workflow no publica instaladores ni compila un Control Plane: ese componente
sigue propuesto.

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
