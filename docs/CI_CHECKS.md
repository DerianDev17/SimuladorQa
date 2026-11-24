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

### Ciclo local durante la edición

| Necesidad | Comando |
| --- | --- |
| Comprobar cambios sin commit | `npm run test:changed` |
| Comparar con el commit anterior | `npm run test:changed -- HEAD~1` |
| Probar un archivo concreto | `npm run test:file -- tests/unit/desktop-client.test.ts` |
| Repetir al guardar cambios | `npm run test:watch -- tests/unit/desktop-client.test.ts` |
| Comprobar la interfaz afectada | `npm run test:e2e -- tests/e2e/ui-shell.spec.ts` |

`test:watch` mantiene Vitest abierto y reutiliza las transformaciones entre
ejecuciones; admite filtros de archivo o carpeta. Sin filtro inicia toda la suite
de unitarias e integración. Salir con `q` o Ctrl+C. `test:file` también admite
archivos de integración; sin filtros ejecuta toda la suite.

`test:changed` utiliza Git y el grafo de imports estáticos de Vitest. No garantiza
detectar lecturas de archivos mediante `fs`, imports con rutas calculadas, scripts
PowerShell ni los recorridos de Electron. Ante esos cambios, elegir explícitamente
las pruebas afectadas o ejecutar la suite completa. Cambiar configuración o
`package.json` puede seleccionar todas las pruebas. Si no encuentra pruebas,
conserva el aviso y código de salida de Vitest: no acredita una suite completa.

No añadir un filtro a `test:unit` para intentar aislar un archivo: su filtro de
carpeta ya incluye todas las unitarias. Usar `test:file` para esa selección.
Estos comandos agilizan la edición; antes del commit siguen siendo obligatorios
lint, tipos, todas las unitarias e integración del módulo afectado.

`test:unit` usa dos workers con aislamiento entre archivos. Integración y cobertura
conservan un worker en Windows, y Electron conserva uno por escritorio. Medición
local orientativa: las mismas 1.451 unitarias pasaron de 26,46 s con un worker a
12,94 s con dos. Una selección de cinco casos de `desktop-client.test.ts` tardó
1,38 s. Son tiempos de esa ejecución, no garantías para otros equipos ni para la
suite completa. Se conservan plazos, casos y umbrales de cobertura.

### Automatización local

- **Al guardar:** mantener `npm run test:watch -- tests/unit/desktop-client.test.ts`
  en una terminal. El archivo es un ejemplo: usar la prueba o carpeta del módulo
  que se está editando. No inicia procesos ocultos ni queda instalado como servicio.
- **Antes de cada commit:** `.githooks/pre-commit` ejecuta `npm run check:commit`
  y bloquea el commit si falla. Este comando reúne formato, lint, tipos, seguridad,
  todas las unitarias e integración completa. No vuelve a compilar ni ejecuta E2E.
- **En GitHub:** cada push/PR mantiene las validaciones completas descritas abajo.

El hook se activa por clon, explícitamente, después de comprobar que no exista
otro gestor en `git config --show-origin --get core.hooksPath` ni un hook propio en
`.git/hooks/pre-commit`. Si existe, integrar ambos en ese gestor; no sustituirlo.
Sin hooks previos: `git config --local core.hooksPath .githooks`. Git no instala
esta configuración al clonar y `npm install` tampoco la modifica.

El hook valida el árbol de trabajo, como los comandos manuales: revisar los
archivos staged antes del commit, especialmente si se prepararon cambios parciales.
No se almacenan marcas de "validación aprobada" ni se omiten pruebas por un resultado
anterior. La selección rápida es para iterar; el commit ejecuta el control completo.
Las pruebas de integración del hook comprueban su invocación por Git y los caminos
de éxito, fallo y dependencia no disponible, con un comando sintético y repositorios
temporales para evitar recursión de la suite.

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

La limpieza de directorios temporales admite cinco reintentos de `fs.rm`, con
espera incremental de 50 ms, para bloqueos transitorios de archivos en Windows
tras cerrar PowerShell o SQLite. Conserva la validación de ruta/prefijo y propaga
el error si el archivo sigue bloqueado; no reejecuta casos ni oculta aserciones.

Las pruebas automatizadas no certifican hardware ni resultados financieros del
host/Core. Ver [estrategia de pruebas](testing/TEST_STRATEGY.md).
