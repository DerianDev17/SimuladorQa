# Primera entrega desktop

## Ejecutar

Requiere Windows y Node.js 22.20 o una versión LTS posterior compatible.

```powershell
npm ci
npm run dev
```

`dev` inicia Vite en http://127.0.0.1:5173 y abre Electron. React tiene HMR; cambios en Main/preload requieren reiniciar el comando. Cerrar Electron detiene Vite.

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

- Dashboard inspirado en docs/mockups/desktop_dashboard_concept.png, con valores vacíos reales.
- Navegación a transacciones, ATM, tarjetas, carga, monitor, historial y configuración.
- Selección QA/PREPROD, banner PREPROD y auditoría persistida desde Main.
- Revisión de requisitos de los cinco flujos MVP y los cuatro escenarios; respuesta BLOCKED sin generar ni enviar ISO, crear runs o fingir resultados.
- Errores seguros, reintento y límite de espera del servicio local.
- Estado explícito de lector, Switch y Control Plane sin configurar.

La segunda entrega añade CRUD de entidades y perfiles ATM en borrador mediante SQLite/Worker; ver `LOCAL_CATALOGS.md`. Las páginas de tarjetas, carga e historial mantienen los requisitos pendientes; aún no tienen cifrado ni ejecución. La pantalla de monitor describe solamente la estación actual; no inventa agentes ni heartbeats.

Las preferencias viven en `preferences.json` dentro de `app.getPath('userData')` de Electron, fuera del repo. Si el archivo es inválido, corregirlo o respaldarlo fuera de la app y restablecerlo manualmente; la app no lo sobrescribe silenciosamente.

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
