# Dependencias de lint — 2026-11-07

Se actualizan ESLint a 10.14.0 y TypeScript-ESLint a 8.72.1. Ambas mantienen
compatibilidad declarada con TypeScript 5.9 y el Node requerido por el proyecto.
ESLint todavía declara `minimatch ^10.2.6`; actualizar solo los paquetes raíz no
retira [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Se fija un override acotado a `minimatch@>=7 <11.0.1` hacia `11.0.1`. No cambia
la API de la aplicación ni agrega dependencias de ejecución. El salto mayor se
valida contra los consumidores instalados de `Minimatch` y `minimatch`: lint de
todo el proyecto, patrones `.ts`/`.tsx`, exclusión de `dist`, restricciones de
imports y pruebas de arquitectura. No se deshabilitan reglas para pasar lint.

`npm install --ignore-scripts` actualizó el lockfile y reportó cero vulnerabilidades.
Los tests de `eslint-boundaries.test.ts` verifican que los patrones continúan
aplicando restricciones a Renderer, dominio y contratos. Retirar el override cuando
los consumidores declaren una versión corregida compatible y repetir esas pruebas.
