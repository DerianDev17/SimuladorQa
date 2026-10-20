# UX Specification

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
- Inicio
- Transacciones
- ATM Profiles
- Tarjetas
- Load Test
- Monitor
- Historial
- Configuracion

## Pantalla Transacciones — diseño aprobado 2026-10-14

- Navegación lateral azul oscuro, área de trabajo clara y selector QA/PREPROD permanente.
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

- El modo básico presenta ATM, escenarios rápida/1/3/5 TPS, tarjeta física o
  perfil QA asociado a esa lectura e **Iniciar prueba**. Main valida perfil,
  seguridad, secuencias y diario al iniciar; los límites locales se explican
  junto a los controles.
- El modo avanzado muestra cantidad, objetivo TPS, duración y rampa. La
  concurrencia física queda en uno. Seleccionar varios ATM muestra el bloqueo
  correspondiente hasta disponer del proveedor financiero independiente.
- El panel derecho distingue objetivo de TPS real, muestra latencias de host,
  desglose numérico por etapa cuando existe y las últimas 20 transacciones.
  Las corridas históricas sin tiempos por etapa no presentan cifras inventadas.

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
- Ambiente, PREPROD, estado del lector, bloqueo de envio y produccion conservan sus controles existentes.

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
