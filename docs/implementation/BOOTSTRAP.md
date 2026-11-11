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

## Foco y minimización (2026-11-10)

La ventana se muestra sin activación automática (`showInactive`). Lanzar otra
instancia sobre los mismos datos mantiene el bloqueo de instancia única, pero
no restaura ni enfoca la ventana existente. El usuario la recupera desde la
barra de tareas o Alt+Tab.
Si el usuario minimiza durante el arranque, el evento tardío `ready-to-show`
respeta esa decisión y no vuelve a mostrar la ventana.

Antes de un reinicio de desarrollo, Main envía al lanzador su estado de ventana
por el IPC privado del proceso padre, después de esperar las operaciones activas.
El lanzador conserva minimizada/oculta; una ventana visible reaparece sin pedir
foco. El estado es efímero y no cambia preferencias ni datos financieros.
No se agrega IPC al Renderer. Los cambios del lanzador requieren reiniciar
`npm run dev` para activar la conservación de estado.

La regresión Electron comprueba segunda instancia sobre ventana minimizada,
actualizaciones IPC/recarga de Renderer en segundo plano y arranque de desarrollo
con estado minimizado. El diálogo PIN interactivo conserva su comportamiento
independiente; este cambio corresponde a la ventana principal.

Los lanzadores `dev` y `start` muestran stdout/stderr de Electron directamente
en la consola y eliminan `ELECTRON_RUN_AS_NODE` del entorno del proceso hijo.
No dependen de un filtro de logs externo. `start` ejecuta la compilación existente
en `dist/main.cjs`; requiere ejecutar `npm run build` previamente.

Vite usa un puerto libre de loopback por sesión; el lanzador lo entrega a Main
automáticamente. No hace falta conocer ni configurar un número de puerto. Ver
[ADR-035](../adr/ADR-035-ISOLATED-DEVELOPMENT-PORT.md).

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
