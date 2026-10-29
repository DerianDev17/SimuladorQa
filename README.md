# Coonecta ATM Transaction Simulator

Transacciones muestra, después de cada nuevo envío, el resultado junto a los
campos ISO8583 de la solicitud y respuesta correlacionada. Conserva la mensajería
protegida en el diario; los registros antiguos sin campos se identifican como
tales. Ver [mensajería de transacciones](docs/implementation/TRANSACTION_PREPARATION.md).

**Retiro aprobado + reverso** está disponible en Operación: aprobación completa,
espera de 1–30 segundos y reverso único. El inspector muestra también 0420/0430,
datos del comercio y tags EMV públicos. Ver [reversos](docs/transactions/REVERSAL.md)
y [proyección y protección](docs/adr/ADR-030-ISO-DISPLAY-AND-REVERSAL-MESSAGES.md).

Aplicacion desktop para QA orientada a simular transacciones ATM de la Red Coonecta, ejecutar pruebas funcionales, carga y estres, y correlacionar cada transaccion con SmartVista/SVFE y el Core correspondiente.

ATM20521 es la plantilla de envío para los ATM QA de la entidad 205. Crear o
clonar hereda la configuración ISO/EMV, clave y operaciones existentes; no
requiere otro perfil privado ni fecha contable por terminal. Los nuevos ATM
están disponibles sin reiniciar y consumen el pool persistente compartido.
Ver [uso de la plantilla](docs/implementation/MULTI_ATM_PROFILES.md).

Inicio muestra en QA y PREPROD las últimas 50 transacciones de Mediator para
entidad 205/canal 1. Consulta cada cinco segundos mientras la vista está abierta,
con pausa y filtros. La referencia de tarjeta se deriva en SQL sin entregar su
valor protegido al Renderer. Ver
[actividad de Inicio](docs/implementation/DASHBOARD_LIVE_FEED.md).

Los casos guardados admiten una expectativa opcional de resultado del host,
codigo de respuesta y fuente declarada. Al cargar un caso y ejecutar una nueva
transaccion con el mismo contexto, Resultado muestra PASS/FAIL/INCONCLUSIVE
como comparacion local separada de la respuesta financiera. No cambia el envio
ni certifica el resultado en Visa, Switch o Core. Ver
[casos locales](docs/implementation/SAVED_CASES.md) y
[ADR-022](docs/adr/ADR-022-LOCAL-CASE-VERDICTS.md).

La pantalla **Carga y estrés** ofrece escenarios rápida/1/3/5 TPS y ejecuta consultas
de saldo QA con una tarjeta física, PIN una vez por corrida y seguridad nueva por
operación. Permite seleccionar varios perfiles ATM y de 1 a 5 operaciones
en preparación y envío por corrida. La preparación del chip es exclusiva y
puede avanzar mientras responde el host. El enlace QA usa una sola conexión
financiera activa: el log TCPComms confirma que una conexión nueva desplaza la
anterior (ADR-029). Se aplica el límite TPS antes de cada write y se muestran
por separado espera del enlace, errores, cancelaciones y envíos sin respuesta.
La corrida reutiliza los procesos del lector y cifrado, manteniendo lectura,
validación DPAPI y seguridad nuevas por operación (ADR-028). Muestra TPS reales,
tiempos por etapa, aviso si el promedio no alcanza el objetivo y permite detener. El pool virtual sigue
pendiente de proveedor validado; la tarjeta física puede limitar el ritmo.
Ver [guía de ejecución](docs/implementation/LOAD_TEST.md).

## Alcance inicial

- Desktop: Electron + TypeScript + React.
- Ambientes: QA y PREPROD. Produccion bloqueada por diseno.
- Escenarios: ATM Local, ATM RTC, BANRED y Externa.
- Hardware: HID OMNIKEY 5422 mediante PC/SC.
- Tarjetas: lectura fisica + perfiles de prueba configurables.
- MVP 1: consulta de saldo, retiro aprobado, retiro rechazado, reverso y reverso por timeout.
- Carga: piloto QA/LOCAL de saldo con una tarjeta fisica y uno o varios ATM por
  corrida, con concurrencia y TPS objetivo totales configurables.
  Multiples tarjetas y pool virtual pendientes.
- Monitoreo: dashboard realtime de todas las instancias de la app.
- Correlacion: Switch Coonecta + Core mediante adaptadores.

Plantilla reutilizable, clonación, historial por ATM y alcance de la validación
en host: [perfiles ATM múltiples](docs/implementation/MULTI_ATM_PROFILES.md).

## Principio rector

No inventar reglas transaccionales. Toda regla ISO8583, framing TCP, timeout, PIN/HSM, campos fijos/dinamicos y criterios de correlacion debe provenir de documentacion o evidencia real del proyecto.

## Desarrollo local

El historial cronologico de entregas y validaciones vive en [CHANGELOG.md](CHANGELOG.md).

Requiere Windows y Node.js 22.20 o una LTS posterior compatible.

```powershell
npm ci
npm run dev
```

Compilacion local: `npm run build` y `npm start`.
Validacion completa: `npm run check` y `npm run test:e2e`.

Ver `docs/implementation/BOOTSTRAP.md` para el comportamiento entregado y sus limites.
Ver `docs/implementation/LOCAL_CATALOGS.md` para los catalogos locales y la configuracion en borrador.
Ver `docs/implementation/TRANSACTION_PREPARATION.md` para la pantalla y el catalogo documental.
Ver `docs/implementation/SAVED_CASES.md` para los casos locales persistentes.
Ver `docs/implementation/MEDIATOR_OBSERVER.md` para consultar transacciones y mensajes.
Ver `docs/implementation/SWITCH_NETWORK_EVIDENCE.md` para la evidencia de red recibida.
El progreso implementado se marca en `docs/BACKLOG.md` y en la seccion de desarrollo
de `docs/INPUT_CHECKLIST.md`; la evidencia QA pendiente permanece sin marcar.

## Preparar una transaccion desde la UI

1. En Inicio, pulsa **Nueva transaccion**.
2. Selecciona un ATM. Si no hay perfiles, pulsa **Crear entidad/Crear ATM**;
   al guardar los perfiles activos vuelves al mismo borrador con el ATM seleccionado.
3. Completa operacion, cuenta, escenario y monto cuando aplica, sin pasos intermedios.
4. Inserta la tarjeta por contacto y pulsa **Leer tarjeta**; una lectura valida queda seleccionada.
5. **Enviar transaccion** inicia la consulta soportada (QA/local/ahorros) y solicita el
   PIN mediante la ventana protegida. El resultado aparece a la derecha. La revision
   documental es opcional, en **Opciones y detalles tecnicos**.

**Guardar como caso** conserva el contexto para otra sesion. **Casos guardados**
permite buscar y filtrar por operacion y vigencia del ATM. **Limpiar borrador** pide
confirmacion cuando contiene datos y conserva los casos guardados.

La configuracion de envio se prepara al iniciar desde la evidencia QA existente.
En Configuracion -> Envio de tramas se guardan modo previsto y plazos, sin pegar
RAW/HEX ni abrir conexiones. Revisar transaccion prepara un plan local; generacion
de requests nuevos y transmision permanecen bloqueadas por reglas dinamicas y
seguridad pendientes. Esta entrega se verifica solo offline, sin pruebas de envio.
Ver `docs/implementation/SEND_CONFIGURATION.md`.

El motor de consulta CB/QA/ahorros incorpora builder, recepcion correlacionada,
lectura de F54, ejecucion IPC y diario recuperable. El boton depende de la
disponibilidad del proveedor QA de perfil, STAN y PIN/EMV; ese proveedor real
sigue pendiente. La lectura del chip o un PIN indicado no lo sustituyen.
El recorrido funciona con dependencias sinteticas en pruebas locales y no
declara una consulta fisica aprobada. En Transacciones, Historial de consultas
de saldo QA permite recuperar resultados; los tipos de saldo se conservan
sin asignar total/disponible por suposicion. Ver
`docs/implementation/BALANCE_EXECUTION.md` y ADR-012.

La preparacion mecanica PIN de ExtremeTools esta implementada fuera del Renderer
con un puerto de cifrado TEST, limpieza de buffers y pruebas sinteticas. El
cifrador real, perfil EMV y secuencia QA siguen pendientes. El mismo documento
incluye los archivos/export concretos necesarios para terminar esa configuracion.

La seleccion de copias activas usa la regla confirmada por el usuario: archivos
canonicos sin fecha; los fechados son backups. `node tooling/review-active-atm-sources.mjs`
produce un manifiesto privado sin ejecutar binarios. La politica de secuencia
conserva el serial ATM con GrabaAutoTran=N, segun el modulo/archivo activos;
sp_DebGetNextSeq solo corresponde a otra rama. SQL compartido QA/PREPROD fue
inspeccionado con la configuracion existente, sin ejecutar procedimientos.

## Documentos principales

- `AGENTS.md`: reglas para Codex.
- `ARCHITECTURE.md`: arquitectura de alto nivel.
- `CHANGELOG.md`: historial cronologico de entregas y validaciones.
- `docs/adr/README.md`: indice de decisiones y su vigencia.
- `docs/TODO_DATA.md`: datos pendientes de fuente aprobada.
- `docs/product/PRODUCT_SPEC.md`: especificacion funcional.
- `docs/product/MVP1.md`: alcance MVP 1.
- `docs/INPUT_CHECKLIST.md`: informacion que falta subir.
- `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`: reglas CMS recibidas, matriz MVP y diferencias pendientes con ATM.
- `docs/protocols/PCAP_REVIEW.md`: inventario de capturas, encapsulado confirmado, verificacion y pendientes.
- `docs/ux/UX_SPEC.md`: interfaz vigente y criterios de interacción.
- `docs/BACKLOG.md`: backlog inicial.
- `docs/testing/TEST_STRATEGY.md`: estrategia QA.
- `docs/security/SECURITY.md`: controles de seguridad.
