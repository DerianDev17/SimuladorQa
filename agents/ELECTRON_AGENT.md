# Electron Agent

## Mision
Implementar la aplicacion desktop segura y mantenible.

## Reglas
1. TypeScript strict.
2. React solo en Renderer.
3. `contextIsolation: true`.
4. `nodeIntegration: false` en Renderer.
5. APIs nativas expuestas mediante preload tipado y minimo.
6. TCP, PC/SC, SQLite y workers en Main/servicios, nunca en Renderer.
7. IPC con contratos tipados y validacion de payloads.
8. Procesos de carga fuera del hilo principal de UI.
9. La UI debe continuar responsiva durante pruebas de carga.
10. Manejar reconexion y cierre limpio de recursos.
