# Primera entrega desktop

## Ejecutar

Requiere Windows y Node.js 22.20 o una versión LTS posterior compatible.

```powershell
npm ci
npm run dev
```

`dev` inicia Vite en http://127.0.0.1:5173 y abre Electron. React tiene HMR.
Desde 2026-10-16, Main desactiva la cache HTTP en disco solo en modo `--dev`
mediante `disable-http-cache`, antes de `ready`, para evitar reutilizar entradas
danadas de Chromium al cargar Vite. El aviso reportado `Critical error found -8`
y `No file for a1010052` corresponde a esa cache. No se eliminan archivos de
AppData. La compilacion normal conserva la politica de cache predeterminada.
Fuente: [opcion oficial de Electron](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-http-cache).

Los cambios en Main/preload, helpers, dominio y contratos compartidos recompilan
Main y solicitan reiniciar Electron por IPC privado del lanzador. El reinicio
espera a que termine una lectura o consulta en curso; durante esa espera Main
rechaza nuevos inicios. No reenvia operaciones. Un fallo de compilacion conserva
la instancia actual y se informa en consola. Cerrar Electron normalmente detiene
Vite. Cambios en el propio lanzador requieren reiniciar el comando.

Actualizacion 2026-10-15: typecheck y build correctos; no se ejecutan suites
automatizadas por instruccion del usuario. La recuperacion posterior de
configuracion utilizo la recarga del lanzador de desarrollo. Tras retirar
los hooks temporales, el usuario conecta la app y Windows confirma su socket
Established a las 21:06:39Z. Se conserva esa conexion abierta.

El comando permanece activo mientras la app esta abierta. La ventana deberia
aparecer en pocos segundos. El lanzador inicia Electron con windowsHide=false:
en Windows, SW_HIDE tambien ocultaba la ventana de la app aunque Vite y el
Renderer estuvieran activos. Una prueba E2E ejecuta el lanzador real y comprueba
la ventana nativa visible; las pruebas de Renderer por si solas no detectaban
ese fallo. Para aislar los datos del test, el lanzador admite el argumento
--user-data-dir de Electron, ya soportado por Main.

Para ejecutar la compilación local:

```powershell
npm run build
npm start
```

Es una compilación ejecutable con las dependencias instaladas; aún no es un instalador Windows firmado.

## Comportamiento entregado

- Dashboard inicial con valores vacíos reales; Inicio vigente se describe en `DASHBOARD_LIVE_FEED.md`.
- Navegación a transacciones, ATM, tarjetas, carga, monitor, historial y configuración.
- Selección QA/PREPROD, banner PREPROD y auditoría persistida desde Main.
- Revisión de requisitos de los cinco flujos MVP y los cuatro escenarios; respuesta BLOCKED sin generar ni enviar ISO, crear runs o fingir resultados.
- Errores seguros, reintento y límite de espera del servicio local.
- Estado explícito de lector, Switch y Control Plane sin configurar.

La segunda entrega añade CRUD de entidades y perfiles ATM en borrador mediante SQLite/Worker; ver `LOCAL_CATALOGS.md`. Las páginas de tarjetas, carga e historial mantienen los requisitos pendientes; aún no tienen cifrado ni ejecución. La pantalla de monitor describe solamente la estación actual; no inventa agentes ni heartbeats.

Las preferencias viven en `preferences.json` dentro de `app.getPath('userData')` de Electron, fuera del repo. Si el archivo es inválido, corregirlo o respaldarlo fuera de la app y restablecerlo manualmente; la app no lo sobrescribe silenciosamente.

En Windows, una herramienta empaquetada puede ver archivos de AppData
redirigidos a su LocalCache mientras Electron iniciado fuera del paquete
lee el directorio real, aunque ambas rutas logicas sean iguales. Para
diagnosticar configuracion ausente, comprobar la lectura desde el proceso
Main afectado. El 2026-10-15 se recuperaron 16 archivos mediante una
migracion puntual verificada y con respaldo; no es una funcion automatica
del arranque. Ver [conexion al Switch](SWITCH_CONNECTION.md).

La provision de 900104 a las 21:21Z confirma que una escritura posterior
desde la herramienta empaquetada puede volver a crear la copia virtual.
La reserva se provisiona y verifica desde Main a las 21:23Z; la copia virtual
queda respaldada y sin uso activo. Para datos de la instancia abierta,
efectuar escrituras desde sus servicios y comprobar el resultado desde el
mismo contexto; no basta con que las rutas logicas o hashes vistos desde
la herramienta coincidan. No se cambian preferencias de virtualizacion de Windows.

## Verificar

```powershell
npm run check
npm run test:e2e
npm audit
```

Los tests de integración y Electron usan directorios temporales independientes. E2E guarda una captura del dashboard en `artifacts/dashboard.png`. El scan local es heurístico y complementa la revisión; no equivale a un detector completo de secretos.

La primera ejecución necesita acceso a la descarga oficial del runtime Electron.
`test:e2e` prepara ese runtime antes de iniciar los timeouts de las pruebas.

## Criterios de aceptación

- Electron abre el dashboard con Renderer aislado y sin Node.
- QA/PREPROD sobreviven al reinicio, con UUID y UTC en auditoría.
- PROD y payloads extra se rechazan por IPC y al leer disco.
- Toda preparación permanece bloqueada y especifica sus dependencias.
- Almacenamiento corrupto/no disponible produce un error corto sin contenido sensible.
- UI sin preload, fallos y timeout del servicio tienen una respuesta segura.
- El comando de desarrollo funciona con Vite/React Refresh y el mismo puente IPC validado.
- La barra lateral conserva sus estados y pie dentro de ventanas bajas; la navegación puede desplazarse.

## Siguiente incremento

Implementados catálogos de entidades/ATM y SQLite; quedan tarjetas con almacenamiento seguro y flujos ISO, condicionados por TODO-DATA de docs/INPUT_CHECKLIST.md. La clasificación de membresía de entidades espera reconciliar los documentos del proyecto.
