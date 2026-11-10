# UX Specification

## Navegación y ventanas compactas — 2026-11-10

Nombres accesibles en el menú de iconos, acceso por teclado al contenido,
foco y desplazamiento al cambiar de sección, aviso de edición y estados de
conexión precisos. Criterios y pruebas en
[correcciones de navegación](UI_SHELL_20261110.md).

## Configuración general — 2026-11-09

Configuración se divide en seis páginas internas: Ambiente y estación, Envío,
Dispositivos y perfiles, Evidencia de red, Requisitos y Auditoría. Solo la página
seleccionada es visible y accesible; las otras conservan su estado en la sesión.
El menú lateral marca la página actual y se adapta a una fila en ventanas menores.
La navegación por teclado enfoca el contenido sin cambiar la URL validada por IPC.
Los cambios de envío sin guardar o en proceso bloquean el cambio de página hasta
guardar o descartar. Qa es el único ambiente disponible. El acceso Configurar envío desde Transacciones abre directamente Envío.

El resumen muestra equipo, versión y estado documental de red del ambiente
Qa. La cabecera global y el resumen muestran Qa como indicador fijo, sin selector.
Desde 2026-11-10, Envío permite editar IPv4, puerto y plazos, validados y guardados
en Main. Muestra valores guardados y revisión. Guardar cierra el enlace anterior;
Conectar usa esos valores. El selector Modo previsto se retira por no tener efecto
operativo. No se requiere evidencia de red para guardar un destino explícito;
los perfiles financieros conservan su vinculación al destino autorizado (ADR-041).

Herramientas operativas:

- Conectar/Desconectar usa el estado y las acciones del Switch de la cabecera,
  sin otro sondeo ni conexión automática. Solo QA; errores visibles y estado TCP
  separado de disponibilidad financiera.
- Comprobar lector consulta el snapshot PC/SC por IPC bajo acción explícita.
  Presenta nombre, presencia y fecha de la última comprobación. No lee el chip
  ni muestra identidad, ATR, PAN o secretos. Una consulta fallida retira el estado
  anterior; timeout de 10 s libera el botón. Desmontar descarta
  resultados tardíos. No se presenta como monitoreo continuo.
- Perfiles cuenta ATM activos cuya entidad también está activa en el catálogo
  del ambiente. La cuenta no acredita disponibilidad transaccional. Permite
  recargar el catálogo y abrir ATM, entidades, tarjetas, carga, observación y
  transacciones. Un fallo se muestra como catálogo sin verificar, no como cero.
- Edición pendiente, operación activa o carga del catálogo bloquean los accesos operativos. Guardar o descartar recupera las acciones.

Envío distingue revisión persistida, cambios sin guardar, carga y ausencia de
configuración. Agrupa modo previsto y plazos, explica el rango 1–30000 ms y el
valor pendiente, y conserva Guardar, Descartar y Recargar. El modo después de
revisar no implica transmisión automática. El plan documental y la disponibilidad
financiera de cada operación se describen por separado.

Criterios de aceptación:

- Guardar confirma la persistencia sin conectar. Entradas inválidas muestran un
  error y conservan el borrador; un timeout exige descartar y recargar antes de
  repetir. La navegación global se bloquea durante la edición.
- Qa permanece fijo al editar y navegar. Las preferencias antiguas se respaldan
  y corrigen a QA. La auditoría muestra los últimos diez cambios en hora local.
- Ausencia o error de evidencia no se presentan como conexión comprobada; solo
  bloquean los ajustes que dependen de ella. Producción permanece bloqueada.
- Los botones de navegación enfocan su página, los campos tienen etiquetas y ayudas asociadas,
  y las tablas conservan encabezados y desplazamiento horizontal propio.

Verificación: `tests/e2e/settings.spec.ts`, suites unitarias y de integración
de configuración de envío, conexión, lector, catálogos y evidencia. Las pruebas usan datos sintéticos
y un directorio temporal de Electron.

## Inspección interactiva — disposición vigente, 2026-11-04

Preparación compacta a la izquierda, resultado a la derecha, historial local
debajo. Ocultar preparación amplía la inspección sin desmontar el lector.
Flujo, Mensajes y Evidencia son pestañas accesibles por teclado. Las etapas
abren el mensaje o la evidencia correspondiente; cada campo ISO tiene detalle
protegido. El historial permite búsqueda, filtros y selección de una operación
sin alterar ni ejecutar el formulario. Los fallos parciales se indican junto a
los últimos registros disponibles.

Los detalles secundarios se despliegan: aplicación/expiración de tarjeta,
comprobante/reverso e importes/correlaciones del resultado. Código CMS vive en
Evidencia. Core permanece sin verificar, sin tiempos por etapa inventados.
Consultar referencia identifica fuente/versión/página y explica que el original
no está adjunto. Observación conserva el visor remoto de Mediator.

Esta disposición sustituye las descripciones históricas de tres columnas y
documentación estática siguientes. Criterios y límites en
[preparación](../implementation/TRANSACTION_PREPARATION.md) y
[ADR-036](../adr/ADR-036-TRANSACTION-INSPECTION.md).

## Datos de la transacción — panel compacto

Cajero con entidad, modos Lector físico/Tarjeta configurada, resumen protegido de
tarjeta, tipo de transacción, cuenta y acción Ejecutar Transacción con engranaje.
Los selectores tienen icono y subtítulo cuando existe información documentada.
La tarjeta muestra aplicación y expiración reales, o su ausencia. Las opciones
avanzadas se despliegan desde el engranaje; conservan escenario y administración.
La tarjeta configurada selecciona un perfil QA y continúa requiriendo lectura física.
Ver criterios en docs/implementation/TRANSACTION_PREPARATION.md.

## Mensajería de transacciones — 2026-10-29

Después del envío, Resultado tiene al lado un panel Mensaje ISO8583 con pestañas
Solicitud (0200)/Respuesta (0210), tabla Campo/Descripción/Valor y STAN/RRN de
esa ejecución. Se selecciona inicialmente la respuesta si está disponible.
Todos los campos presentes se listan; PAN enmascarado y contenidos sensibles,
privados o sin proyección aprobada protegidos con una máscara fija. No hay RAW
ni HEX financiero. Timeout no inventa respuesta; registros antiguos explican
la ausencia de mensajería. El formulario puede cambiar sin alterar esos datos.
En escritorio hay tres columnas; en ventanas intermedias formulario arriba y
resultado/mensajería juntos debajo; en ventanas estrechas se apilan. El inspector
documental anterior queda oculto mientras se muestra una ejecución real.

El selector ofrece Retiro aprobado + reverso. Su mensajería incluye las cuatro
pestañas 0200/0210/0420/0430 y el resultado conserva RC retiro/RC reverso por
separado. La pestaña inicial sigue el mensaje más reciente hasta la selección
manual. F42/F43/F44 muestran texto sanitizado y F55 ofrece tags públicos; los
contenidos sensibles mantienen máscara. La tabla puede expandirse para ver
todos sus campos. El contenido se centra en el ancho disponible y el resultado
no tiene padding interior duplicado. El foco de resultado conserva visible el
inicio de los paneles.
Detalles y criterios: docs/implementation/TRANSACTION_PREPARATION.md.

## Retiro y comprobante local — 2026-10-19

- Monto con prefijo USD, opciones accesibles Sin impresion/Con impresion y ayuda
  que identifica la impresion local. Sin impresion por defecto y al limpiar/cargar caso.
- Con impresion abre vista previa al aprobar; imprimir es una accion explicita
  posterior. Cancelar o fallar deja el resultado intacto y permite reimprimir.
- Resultado con estado destacado, monto autorizado, debito total, saldo restante,
  saldos recibidos y STAN/RRN visibles. Los detalles tecnicos se despliegan debajo.
- Debito total y saldo restante no se inventan: estados No confirmado/Sin identificar/
  No informado segun la evidencia disponible; los saldos F54 conservan sus tipos.
- El resultado identifica la operacion ejecutada, incluso si cambia el borrador.
  Ver comprobante usa esa misma ejecucion y funciona desde el historial aprobado.
- Vista previa modal con foco contenido, Escape/Cerrar, error de impresion y estado
  de cola. Mientras imprime se evita otra accion concurrente y se conserva el modal.
- Panel de resultado ajustado a su contenido; formulario y resultado se apilan en
  ventanas pequenas. La navegacion es mas compacta en pantallas de poca altura.

Fuente, limites financieros y pendientes: docs/transactions/WITHDRAWAL.md.

## Navegacion principal

Inicio prioriza Nueva transacción y una tabla de las últimas 50 filas de Mediator
para entidad 205/canal 1, en Qa. Consulta cada cinco segundos
solo mientras la vista está abierta. Permite pausar, filtrar por terminal y buscar
por referencia de tarjeta, código o TraceId. No muestra métricas fijas ni controles
de lectura de chip; el lector se resume con su disponibilidad y la lectura
permanece en Tarjetas/Transacciones. La tabla omite PAN y no atribuye significado
financiero a TrnCode/RetCode. Alcance y límites:
[actividad de Inicio](../implementation/DASHBOARD_LIVE_FEED.md).

Los casos guardados admiten una expectativa opcional declarada por el operador:
resultado del host, codigo de respuesta y fuente. La biblioteca permite editarla
sin crear otra transaccion. Una nueva ejecucion de un caso cargado muestra
PASS/FAIL/INCONCLUSIVE aparte de Aprobado/No aprobado del host. El veredicto
local no aparece para ejecuciones previas ni se asocia a un formulario modificado.

- Inicio
- Transacciones
- ATM Profiles
- Tarjetas
- Load Test
- Monitor
- Historial
- Configuracion

## Pantalla Transacciones — diseño aprobado 2026-10-14

- Navegación lateral azul oscuro, área de trabajo clara y indicador Qa permanente.
- Una sola composición: Datos de la transacción y Tarjeta a la izquierda; Resultado a la derecha; Actividad de esta sesión debajo.
- ATM, escenario, operación y cuenta se completan en el mismo formulario. Cuenta usa radios Ahorros/Corriente accesibles con teclado. El monto solo aparece cuando aplica.
- Leer tarjeta selecciona el resultado válido de esa lectura manual. El polling nunca selecciona una tarjeta por sí mismo. Cambiar tarjeta retira la selección; una identidad existente puede seleccionarse expresamente sin otra lectura.
- No hay pasos Continuar ni confirmación adicional Usar esta tarjeta después de leer. Enviar transacción es la única acción principal.
- Revisar transacción, plantillas, resumen documental y pendientes se consultan dentro de Opciones y detalles técnicos. La revisión manual es opcional.
- El Renderer comprueba los datos necesarios para formar la solicitud. El formato del terminal, la configuración de transporte, perfil y dependencias financieras se validan en Main; no se duplican como bloqueos silenciosos de la UI.
- El alcance ejecutable existente sigue siendo consulta de saldo QA/local/ahorros. Las demás selecciones conservan su preparación documental y explican su disponibilidad junto al botón.
- Retiro de ahorros/LOCAL/QA valida monto positivo y utiliza su propio canal de ejecucion. Si falta el proveedor validado, Enviar devuelve Retiro bloqueado con las dependencias concretas antes del PIN o transporte. Resultado e historial conservan el monto; una respuesta incierta mantiene su referencia y se recupera por el canal original aunque cambie el formulario. No confundir autorizacion del host con dispensacion.
- Resultado muestra el estado real devuelto por Main. Antes del primer intento presenta un estado vacío; ante timeout IPC conserva la referencia y permite recuperarla, sin habilitar reenvíos por editar el formulario.
- Actividad de esta sesión muestra los últimos 20 intentos devueltos/recuperados por Main, actualizados por requestId. Incluye intentos bloqueados con su etiqueta; no los presenta como transmisiones. Se limpia al cambiar ambiente y no sustituye el historial persistido.
- Conectar/Desconectar está disponible en la cabecera y usa el control TCP existente. No conecta ni envía automáticamente.
- En escritorio, formulario y resultado se alinean en dos columnas; en ventanas pequeñas se apilan sin desbordamiento horizontal.

## Pantalla Load Test

- Ambos modos permiten elegir saldo o retiro. Retiro muestra monto USD por
  operación (inicial `20.00`, decimal positivo exacto), QA/local/ahorros.
- Básico aplica todos los límites del preset, incluida concurrencia; avanzado
  permite personalizarlos. Volver a básico desde valores personalizados restaura
  Prueba rápida sin rampa. El resumen siempre muestra los límites efectivos.
- Una corrida activa bloquea cambios de modo, operación y monto. Los resultados
  muestran operación y monto guardados, independientes del siguiente borrador.

- El modo básico presenta ATM, escenarios rápida/1/3/5 TPS, tarjeta física o
  perfil QA asociado a esa lectura e **Iniciar prueba**. Main valida perfil,
  seguridad, secuencias y diario al iniciar; los límites locales se explican
  junto a los controles.
- El modo avanzado muestra cantidad, objetivo TPS, duración y rampa. Se pueden
  seleccionar varios ATM y de 1 a 5 operaciones en preparación y envío. El chip
  prepara una operación a la vez, solapada con la espera host. El enlace QA usa
  una sola conexión financiera activa (ADR-029); no se prometen envíos paralelos.
- El panel derecho distingue objetivo de TPS real, muestra latencias de host,
  desglose numérico por etapa cuando existe y las últimas 20 transacciones.
  Las corridas históricas sin tiempos por etapa no presentan cifras inventadas.
- Se separan espera del lector, espera del enlace y tiempo host. Errores excluye
  cancelaciones explícitas nuevas; Canceladas y Enviadas sin respuesta muestran
  por separado sus efectos. La tabla conserva estados financieros y distingue
  cancelación sin envío de cancelación posterior al envío. El primer fallo y su
  STAN permanecen visibles; los registros históricos no se reclasifican.

## Realtime
El dashboard debe permanecer util incluso con miles de transacciones; mostrar agregados y solo una ventana de eventos recientes.

## Presentacion minimalista (2026-10-11)

- Fondos neutros y paneles blancos, navegación azul oscuro, bordes discretos y azul para la acción principal.
- Cabeceras con titulo, sin descripciones genericas; campos y acciones con etiquetas visibles.
- Inicio muestra un titulo simple y el resumen de la estacion, sin accesos numerados ni indicador de configuracion inicial. Las acciones de configuracion se acceden desde la navegacion lateral.
- Transacciones prioriza el formulario y la preparacion local. Una ayuda breve indica el siguiente dato pendiente; no certifica que el envio este habilitado.
- Requisitos de envio con titulos visibles y explicacion desplegable por requisito.
- Flujo/inspector, historial persistido y documentacion/capturas se abren bajo demanda con controles nativos details/summary, accesibles con teclado. La actividad de sesion permanece visible.
- La revision local y su resumen se consultan dentro de las opciones. Los errores permanecen visibles. El borrador se conserva al navegar y se reinicia al cambiar ambiente.
- Qa es fijo; estado del lector, bloqueo de envío y producción conservan sus controles.

- Inicio ofrece Nueva transaccion hacia el formulario unico, sin acciones numeradas.
- Seleccion de tarjeta solo en la sesion, con PAN enmascarado y vigencia comprobada
  mediante el snapshot de Main. La cuenta no se deduce del chip.

- Configuracion rapida de entidad/ATM desde el formulario: abrir editor, guardar
  y volver con el perfil activo seleccionado, conservando el borrador. Cancelar
  vuelve al mismo contexto. La navegacion se bloquea durante la edicion.
- Limpiar borrador pide confirmacion cuando contiene datos. Conservar y Escape
  cancelan; confirmar limpia la sesion y conserva los casos guardados.
- Biblioteca con busqueda, filtros combinables de operacion/vigencia y contador
  de resultados. Estado vacio con accion para quitar filtros; errores de servicio
  siguen visibles y bloquean carga/eliminacion hasta recargar correctamente.

- Edicion de catalogos concentrada en campos y acciones; filtros, tabla y auditoria
  quedan ocultos hasta terminar. Recargar pide confirmar los cambios sin guardar
  y permite conservarlos con Seguir editando o Escape.
- Selector de tarjeta con estados explicitos de consulta, lectura, ausencia y error.
  Opciones del chip asociadas a la interfaz seleccionada; consulta automatica pausada
  durante la lectura manual, sin solapar operaciones de la vista.
- Tarjetas reúne lector y guardado en dos columnas dentro de un panel blanco,
  apiladas en ventanas estrechas. La tarjeta detectada ocupa un resumen compacto;
  AID, ATR, CDOL y país se muestran bajo demanda. Un único botón Guardar tarjeta
  persiste el perfil y confirma el resultado junto al inventario visible.
  El alias sugerido debe poder guardarse sin edición y comparte validador con Main.
