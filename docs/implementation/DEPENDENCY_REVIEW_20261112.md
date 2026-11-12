# Revisión de dependencias — 2026-11-12

Se revisaron los cuatro `package.json`, los imports del código y pruebas, la
compilación, la configuración de TypeScript/lint y los scripts de CI.
No se encontraron dependencias directas sin uso. `npm prune --dry-run
--ignore-scripts --json` tampoco encontró paquetes extraneous por eliminar.
Se conserva lo necesario; no se eliminan tipos o proveedores cargados por CLI
solo porque no aparezcan como imports de ejecución.

| Dependencia | Uso comprobado |
| --- | --- |
| `react`, `react-dom` | Renderer, `main.tsx`, componentes y pruebas de presentación |
| `@types/react`, `@types/react-dom`, `@types/node` | JSX, React DOM, APIs Node/Electron y TypeScript strict |
| `electron` | Aplicación desktop, lanzadores y pruebas E2E |
| `vite`, `@vitejs/plugin-react` | Desarrollo y build de Renderer en `vite.config.ts` y `tooling/` |
| `esbuild` | Bundles de Main/preload/workers y herramientas de diagnóstico |
| `typescript` | `typecheck` e inspección AST de límites de arquitectura |
| `eslint`, `@eslint/js`, `typescript-eslint` | Configuración ESLint y comando `lint` |
| `prettier` | Formato y `format:check` dentro de `check` |
| `vitest` | Unitarias e integración |
| `@vitest/coverage-v8` | `test:coverage`, requerido por CI |
| `@playwright/test` | E2E Electron, configuración y reportes |
| `@redis/client` | Nueva caché Redis detrás de `ReadCachePort`; versión fijada 6.3.1 |

El override de `minimatch` sigue aplicándose a ESLint y typescript-eslint;
`npm explain minimatch` confirma que no es una entrada huérfana. Los paquetes
de workspace son parte del código de dominio, contratos y desktop.

Se añadió únicamente el cliente básico Redis, que no incorpora dependencias
de ejecución adicionales en esta versión. No se instalaron los módulos del
paquete agregado `redis` ni herramientas nuevas de auditoría.
