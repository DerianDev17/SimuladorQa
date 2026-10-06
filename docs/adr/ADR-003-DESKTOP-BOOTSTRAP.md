# ADR-003: base desktop y configuración local inicial

## Decisión

Implementar primero Electron, React y TypeScript strict en un monorepo npm con `apps/desktop`, `packages/domain` y `packages/shared`. No habilitar conexiones, hardware, ISO ni carga hasta contar con fuentes aprobadas.

La UI invoca tres operaciones mediante preload: snapshot, selección de ambiente y revisión de requisitos. Main valida payloads y la identidad de ventana, frame principal y URL exacta. No se expone ipcRenderer, Node, filesystem, sockets ni secretos. Se habilitan sandbox y contextIsolation; se rechazan nuevas ventanas, navegación externa y permisos.

En la compilación de entrega la CSP bloquea conexiones del Renderer y scripts/estilos inline. Solo desarrollo permite el preámbulo React Refresh, estilos de Vite y su WebSocket loopback.

## Persistencia provisional

Un adaptador de archivo JSON guarda únicamente QA/PREPROD y los últimos 100 cambios de ambiente, con UUID, timestamp UTC, usuario y equipo. No guarda perfiles de tarjeta, tramas, endpoints ni secretos. La escritura reemplaza el archivo mediante rename y las operaciones se serializan. La auditoría local no es resistente a modificaciones externas y no constituye evidencia certificada.

Un archivo ausente inicia en QA; uno corrupto o que habilite PROD provoca error y se conserva. El Renderer limita la espera IPC a cinco segundos; ese timeout de UI no define un timeout transaccional y no cancela escrituras iniciadas. Después de un timeout de cambio de ambiente se vuelve a consultar Main.

SQLite permanece pendiente para catálogos e historial; su contrato debe sustituir o complementar el adaptador, sin dar acceso directo al Renderer.

## Dependencias y alternativas

| Dependencia | Motivo | Riesgo | Alternativa |
| --- | --- | --- | --- |
| Electron | Shell desktop y APIs privilegiadas en Main | Superficie Chromium/Node y actualizaciones | Aplicación nativa; no sigue el stack acordado |
| React / React DOM | UI del stack aprobado | Dependencias y ciclo de componentes | DOM directo con mayor mantenimiento |
| Vite / plugin React | Desarrollo y build del Renderer | CSP de HMR distinta de entrega | Build manual con esbuild |
| TypeScript | Contratos strict de todas las capas | No sustituye validación en runtime | JavaScript con validadores, fuera de lo solicitado |
| esbuild | Bundles CommonJS Main/preload compatibles con sandbox | Revisar APIs externas y source maps | tsc y empaquetado adicional |
| ESLint / typescript-eslint / Prettier | Calidad e imports restringidos | Actualizaciones de configuración | Revisión manual |
| Vitest | Pruebas unitarias e integración TypeScript | No prueba hardware real | node:test más transpiling |
| Playwright Test | Arranque y pruebas de la app Electron compilada | Soporte Electron experimental | Automatización manual o herramienta nativa |
| tipos Node / React | Tipado de APIs | Desfase con runtime | Tipos locales mantenidos manualmente |

Se fija TypeScript 5.9.3 por compatibilidad publicada de typescript-eslint; las otras versiones se fijan en package-lock.json. No se instala todavía una dependencia PC/SC, SQLite, HSM ni SmartVista.

## Referencias técnicas

- [Seguridad Electron](https://www.electronjs.org/docs/latest/tutorial/security/)
- [IPC Electron](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Vite](https://vite.dev/guide/)
- [Pruebas Electron en Playwright](https://playwright.dev/docs/api/class-electron)
