# Carga y estrés de saldo y retiro en QA

Guía vigente al 2026-11-03. La implementación usa `LoadRunService` para inicio,
estado y parada. Se retiró el preparador virtual legado sin consumidores y su IPC
`load:plan:prepare`. Reiniciar la app completa después de actualizar Main/preload.

## Preparar e iniciar

1. Abrir **Carga y estrés** en QA y seleccionar uno o varios ATM activos.
2. Elegir **Operación de carga**: consulta de saldo o retiro. Para retiro indicar
   **Monto por retiro (USD)**, con punto y dos decimales; se aplica a cada operación.
3. Elegir prueba rápida, 1/3/5 TPS o parámetros avanzados. Los TPS son un objetivo.
4. Leer y seleccionar la tarjeta física QA. Un perfil guardado puede ayudar a
   elegir AID, pero no sustituye el chip.
5. Pulsar **Iniciar prueba** e ingresar PIN en el diálogo protegido. Mantener la
   tarjeta insertada hasta terminar. El PIN se solicita una vez por corrida.

Las operaciones alternan entre los ATM en orden A → B → A. Cantidad, duración,
concurrencia y TPS son totales de la corrida. Main valida todos los perfiles y
las reservas suficientes antes de iniciar. La plantilla ATM20521 comparte su pool;
no se suma la disponibilidad por ATM ni se repone al clonar un perfil.

## Parámetros y límites

### Estrés y configuraciones reutilizables

En **Pruebas de estrés**, los presets **Estrés gradual · 3 TPS** y **5 TPS**
preparan STRESS con rampa de 20 s, duración máxima de 60 s y tope de 100 operaciones.
Se aplica el primer límite alcanzado. La función de rampa vigente parte de 1 TPS
y aumenta hacia el objetivo; no genera ráfagas para recuperar retrasos. Para
retiro conserva concurrencia 1. Elegir un preset borra la selección efímera de
tarjeta y abre los parámetros avanzados para revisión; no inicia envíos.

En **Configuraciones guardadas**:

1. Completar los parámetros y ATM del formulario, sin necesitar tarjeta/PIN.
2. Escribir un nombre sin datos sensibles y pulsar **Guardar como nueva**.
3. Seleccionar una configuración y pulsar **Cargar configuración** para preparar
   el formulario. Se exige una lectura nueva antes de iniciar.
4. Para editar, cargarla, modificar los parámetros y pulsar **Actualizar con el
   formulario**. El nombre también es editable.
5. **Eliminar configuración** pide confirmación y conserva las corridas históricas.

Se guardan hasta 50 configuraciones QA en `qa-load-configurations.sqlite`, con
UUID, revisión y timestamps UTC. Creación/edición/eliminación y auditoría se
confirman en una sola transacción. No se guardan tarjeta, PIN ni autorizaciones.
Los perfiles ATM deben seguir activos y conservar su revisión para cargar; si
cambian, seleccionar perfiles actuales en el formulario y actualizar la
configuración. El inicio vuelve a ejecutar el preflight financiero existente.

Durante una corrida no se cambian configuraciones. Una edición obsoleta se rechaza.
Después de un fallo o timeout de mutación, **Recargar configuraciones** comprueba
el estado persistido antes de repetir. Una base corrupta se conserva y bloquea
la biblioteca; no se reemplaza por una lista vacía. Ver [ADR-034](../adr/ADR-034-STRESS-CONFIGURATIONS.md).

### Límites comunes

| Parámetro | Valor admitido |
| --- | --- |
| Ambiente / escenario / cuenta | QA / LOCAL / ahorros |
| Operación | Saldo o retiro |
| Monto de retiro | `0.01` a `9999999999.99` USD, dos decimales; sujeto al contrato de cada ATM |
| TPS objetivo | 0,1–5 |
| Cantidad máxima | 1–100; al menos una operación posible por ATM seleccionado |
| Duración máxima | 1–300 segundos |
| Operaciones en curso de saldo | 1–5 |
| Operaciones en curso de retiro | 1, también al seleccionar presets de 3/5 TPS |
| Aumento gradual | Entero positivo menor que la duración, en modo estrés |

El límite de importe es la representación técnica existente de F4, no una regla
financiera ni de denominaciones. El host decide el resultado de cada retiro.
Los límites de carga son controles locales; no acreditan capacidad ni límites
aprobados del Switch/Core. TODO-DATA LOAD-LIMITS conserva esa validación pendiente.
Cantidad o duración, lo que ocurra primero, termina la planificación. La duración
incluye persistencia del inicio, arranque del worker, PIN y ejecución.

Main revalida configuración, ATM, lectura, contrato financiero, seguridad y
secuencias. Revisa ambos diarios antes del PIN: pendientes de saldo y retiros o
reversos activos/fallos de persistencia bloquean el inicio. Errores históricos
terminados conservan la regla de [ADR-025](../adr/ADR-025-QA-WITHDRAWAL-AFTER-ERROR.md).

## Ejecución, parada y recuperación

El worker agenda operaciones sin ráfagas de recuperación. El chip se prepara
exclusivamente; en saldo puede avanzar mientras responde el host. El enlace QA
mantiene **una conexión financiera activa**. Las demás esperan turno y pueden
cancelarse o vencer sin abrir conexión. Los plazos TCP empiezan al obtener turno;
el límite global TPS se aplica antes de cada escritura.

Cada operación tiene lectura y seguridad nuevas, UUID y secuencia propios,
con `runId` común. Se reutilizan procesos PC/SC/cifrado, no mensajes ni claves
descifradas. La sesión PIN solo vive en Main y se borra al cerrar.

**Detener prueba**, retirar la tarjeta, el primer rechazo o error detienen la
corrida. No hay reintentos, reversos automáticos ni impresión durante carga.
Un envío sin respuesta mantiene incertidumbre y su correlación para revisión.
Al vencer la duración no se inicia ni escribe otra operación; el cierre espera
hasta 35 segundos las operaciones en curso y después cancela si no terminaron.

La corrida puede continuar al navegar fuera de la pantalla. Al volver se consulta
su estado. Un timeout de IPC conserva el identificador para recuperar el resultado,
sin crear otra corrida. Tras reiniciar, una corrida activa se marca interrumpida;
no se reanuda ni repite. Revisar el diario antes de una nueva solicitud explícita.

## Resultados y persistencia

Se guardan plan inmutable y resultados públicos en `qa-load-runs.sqlite`, sin
borrado automático ni límite de 100 corridas históricas. La importación del JSON
anterior es transaccional y conserva el original. Corrupción bloquea el inicio.
La clave `requestId` impide repetir una solicitud, también después de reiniciar.

El resultado recuperado conserva operación, monto, ATM y correlación. Los detalles
financieros y mensajería protegida permanecen en el diario de saldo o retiro.

- **TPS promedio:** envíos con bytes encolados / tiempo total, incluida preparación
  y cierre. Completar cantidad/duración no prueba haber alcanzado el objetivo.
- **Latencias:** min/promedio/max y p50/p90/p95/p99 de respuestas recibidas, usando
  tiempo de transporte. La gráfica representa respuestas, no preparaciones locales.
- **Estados:** enviados, respuestas, aprobados, rechazados, timeout, errores,
  cancelados, en curso y enviados sin respuesta. Se conserva la primera causa de error.
- **Etapas:** espera del lector/enlace/límite TPS, lectura, contexto PIN/EMV,
  validación, diario, transporte y otras. Sumas concurrentes pueden superar el
  tiempo de pared. No asignar tiempos faltantes a una etapa por inferencia.

Las mediciones no almacenan PIN, PAN completo, tramas ni campos EMV. Registros
antiguos sin desglose o tiempo monotónico conservan su información disponible.

## Consultar corridas anteriores

Desde **Carga y estrés → Ver historial de carga** se consultan las corridas QA
guardadas, en páginas de 20 y por orden de registro descendente. Se puede filtrar
por inicio (desde inclusive, hasta exclusivo), operación, estado y UUID de ATM,
incluidos ATM secundarios. El selector sugiere perfiles actuales; un UUID antiguo
permite buscar un perfil eliminado. Las fechas se introducen y muestran en hora
local y se consultan en UTC.

**Ver detalle** muestra parámetros, monto por retiro, métricas y todas las
operaciones guardadas con UUID/STAN/RRN disponibles. **Actualizar detalle** vuelve
a leer el registro; no es un seguimiento en vivo. Los contadores de errores
incluyen timeouts y no son categorías excluyentes.

Consultar el historial no sustituye la corrida activa ni repite envíos. Antes de
consultar se aplica la recuperación existente de la última corrida interrumpida.
Una página fallida se invalida y permite **Actualizar historial**; los registros
corruptos no se omiten silenciosamente. La paginación por cursor evita duplicar
corridas cuando se insertan nuevas; actualizar vuelve a la primera página.

El detalle de una corrida cerrada permite **Exportar CSV** o **Exportar JSON**.
Main recupera el registro y genera evidencia sanitizada; el operador elige el
destino en el diálogo nativo. Cancelar no escribe. Se conserva incertidumbre y no
se confirma resultado Core. Formatos, límites y errores en [REPORTING](../REPORTING.md).

## Pendientes y fuentes

No están habilitados PREPROD financiero, reversos en carga, múltiples tarjetas,
pool virtual o carga distribuida. Las referencias ficticias no son credenciales.

- TODO-DATA LOAD-VIRTUAL-PROVIDER: contrato aprobado para seguridad virtual nueva.
- TODO-DATA LOAD-PERSISTENT-TCP: contrato para reutilizar sesiones financieras.
- TODO-DATA LOAD-3TPS-PHYSICAL: medir caudal sostenido con hardware y host reales.
- TODO-DATA LOAD-WITHDRAWAL-QA-ACCEPTANCE: validar carga de retiros y correlación
  financiera real. Las pruebas sintéticas no confirman débito Core.

Decisiones: [sesión física](../adr/ADR-020-PHYSICAL-CARD-LOAD.md),
[preparación reutilizable](../adr/ADR-028-LOAD-PREPARATION-REUSE.md),
[enlace exclusivo](../adr/ADR-029-QA-SINGLE-FINANCIAL-CONNECTION.md),
[retiros](../adr/ADR-031-WITHDRAWAL-LOAD.md) y
[contratos del motor](../adr/ADR-032-FINANCIAL-EXECUTION-PORTS.md).
La evolución y las mediciones anteriores permanecen en los ADR, el
[registro de fuentes](../INPUT_CHECKLIST.md), el historial Git y la
[revisión técnica fechada](TECHNICAL_REVIEW_20261102.md).
