# Arranque y desarrollo desktop

Guía vigente. El alcance funcional está en el [README](../../README.md);
la evolución de entregas se conserva en [CHANGELOG](../../CHANGELOG.md) y los ADR.

## Ejecutar

Windows y Node.js `>=22.20.0 <23` o `>=24`, conforme a `package.json`.

```powershell
npm ci
npm run dev
```

`dev` inicia Vite y Electron. React dispone de HMR. Los cambios en Main/preload,
helpers, dominio y contratos recompilan Main y solicitan reiniciar Electron por
el IPC privado del lanzador. El reinicio espera las operaciones activas; mientras
espera rechaza nuevos inicios. Un fallo de compilación conserva la instancia actual
y se informa en consola. Cambios en el lanzador requieren reiniciar el comando.
Cerrar Electron normalmente detiene Vite.

Main desactiva la caché HTTP en disco solo con `--dev`. La compilación normal
conserva su política predeterminada. El lanzador usa `windowsHide=false` para
mostrar la ventana nativa en Windows. No borrar AppData para resolver un aviso
de caché: revisar primero la salida del proceso y si está ejecutando la versión actual.

Para ejecutar la compilación local:

```powershell
npm run build
npm start
```

Esto no genera un instalador Windows firmado. Main y preload deben cargarse
juntos después de cambios de contratos IPC.

## Datos y diagnóstico

Preferencias, perfiles privados y diarios se guardan bajo `app.getPath('userData')`,
fuera del repositorio. Un archivo corrupto no debe reemplazarse silenciosamente;
conservar respaldo y revisar su integridad. Los diarios financieros no son caché.

Una herramienta empaquetada de Windows puede ver una copia redirigida en LocalCache,
mientras Electron usa otra ubicación real. Para diagnosticar configuración ausente,
verificar el directorio y la lectura desde el proceso Main afectado. Las migraciones
puntuales antiguas no son una función automática de arranque. Detalles históricos
en [conexión Switch](SWITCH_CONNECTION.md).

El lanzador admite `--user-data-dir` para aislar pruebas. Los tests de integración
y Electron usan directorios temporales; no apuntarlos a los diarios de la estación.

## Validación

```powershell
npm run check
npm run test:e2e
npm audit --audit-level=high
```

`test:e2e` prepara el runtime Electron antes de los timeouts; la primera ejecución
requiere acceso a su descarga. El chequeo local de secretos es heurístico y
complementa la revisión. CI también ejecuta cobertura y una matriz Node 22/24.

Recorridos cubiertos: Renderer aislado, IPC validado, persistencia QA/PREPROD,
producción bloqueada, errores de almacenamiento y recarga durante operaciones.
Las reglas y pendientes financieros corresponden a cada módulo, no al arranque.
