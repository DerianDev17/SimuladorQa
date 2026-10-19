# Configuracion y preparacion de envio desde la app

Actualizacion 2026-10-12: el motor de consulta CB QA esta implementado por un
recorrido IPC independiente, con disponibilidad, builder, transporte y diario.
Ver `BALANCE_EXECUTION.md`. Este plan documental sigue sin generar bytes;
el runtime financiero exige un proveedor QA real de perfil/secuencia/PIN/EMV.
AFTER_REVIEW sigue expresando intencion; no inicia un envio automatico.

Solicitud del 2026-10-11: configurar el recorrido para preparar tramas desde los
campos de la UI, sin pedir al operador que pegue bytes, y no ejecutar envios ni
pruebas de envio durante esta implementacion.

## Comportamiento entregado

Al iniciar Electron, Main inicializa una configuracion QA solo si hay evidencia
QA documentada y no existe una configuracion previa. Toma exclusivamente el host,
puerto e ID de esa fuente; no hereda datos a PREPROD ni cambia el ambiente activo.
El modo inicial previsto es al pulsar Enviar. Los plazos quedan null hasta que se
definan explicitamente; no se convierten observaciones historicas en defaults.

Configuracion -> Envio de tramas permite guardar modo previsto, espera de conexion
y ventana de respuesta. Son controles tecnicos del emisor existente, entre 1 y
30000 ms, no timeouts ISO del proveedor. Los valores pendientes pueden guardarse
sin declarar el envio listo. Despues de revisar una transaccion, la app prepara
automaticamente un plan si existe configuracion; no requiere una entrada HEX.

El modo Despues de revisar expresa la intencion para la futura ejecucion. No arma
una conexion ni un timer de transmision. Preparar devuelve metadatos y pendientes,
no bytes ISO: frameGenerated=false y transmissionAttempted=false. Enviar permanece
bloqueado porque el generador de una transaccion nueva todavia no esta aprobado.
El plan es efimero, con planId UUID, plannedAt UTC y una revision nueva de Main;
no constituye runId, transactionId, STAN, resultado financiero ni ejecucion.

## Persistencia y contratos

send-configuration.json vive en userData, independiente de preferencias/casos.
Guarda hasta dos configuraciones por ambiente y 100 eventos de auditoria, con
UUID, revision, UTC, usuario y equipo. No guarda tarjetas, monto, tramas, PAN, PIN,
CVV o secretos. Lectura acotada a 256 KiB; escritura temporal y rename atomico.
Un archivo corrupto/futuro/excesivo se conserva y bloquea solo esta configuracion.
Las operaciones se serializan en Main; la auditoria local no es certificada ni
ofrece bloqueo entre procesos Electron independientes.

IPC protegido por la validacion de origen existente:

- transaction:send:configuration: environment QA/PREPROD.
- transaction:send:configure: environment, revision, values; el endpoint no se
  acepta del Renderer, se deriva de la evidencia vigente de Main.
- transaction:send:prepare: draft y configurationRevision. Main revalida el
  borrador, ambiente, revision y fuente antes de devolver el plan bloqueado.

Claves extra, PROD, bytes o datos de tarjeta se rechazan. Un destino modificado o
una revision obsoleta exige recargar. Un fallo de guardado exige revisar el estado
persistido antes de reintentar; un timeout IPC no cancela una escritura iniciada.
Los cambios de configuracion invalidan el plan de la UI. Cambiar ambiente reinicia
el contexto. El Renderer no abre sockets ni tiene acceso al archivo.

## Parte dependiente bloqueada

TODO-DATA AUTOMATIC-FRAME-GENERATOR: aprobar por perfil/operacion la correspondencia
entre el formulario y los campos ISO, reglas dinamicas F7/F11/F12/F13/F37/F90,
cabecera/framing y golden samples nuevos. La lectura de ISOBASEI y reconstruccion
de la consulta CB capturada estan disponibles; no falta pedir de nuevo esas fuentes.
Faltan reglas para un request nuevo, asociacion cuenta/tarjeta y seguridad PIN/EMV.
Mantiene CB-DYNAMIC-REQUEST, CARD-TRANSACTION-SECURITY y PROFILES existentes.
Reversos/monto mantienen sus dependencias originales. La configuracion no completa
estas validaciones ni habilita carga, retiros o produccion.

No se usa la captura historica como plantilla editable de una nueva transaccion:
conservar sus fechas/RRN/seguridad no valida otra tarjeta o cuenta. QaTcpReplay
continua separado y no se invoca al iniciar, guardar, revisar o preparar. Los
nuevos canales no aceptan ni transmiten un payload financiero.

## Verificacion de la entrega offline del 2026-10-11

Solo lint, TypeScript, compilacion y pruebas offline de configuracion, archivos y
planes bloqueados. tests/unit/send-configuration.test.ts cubre happy path,
entradas invalidas, aislamiento, revision, privacidad y dependencia no disponible.
tests/integration/send-configuration.test.ts usa archivos reales y Main en proceso,
sin sockets, PC/SC ni adaptador de envio. Incluye reinicio, corrupcion, limite de
lectura, ambiente obsoleto y rechazo de bytes adicionales.
Esa solicitud se verifico sin replay/probe ni suites TCP. La implementacion
posterior de saldo solicitada por el usuario si incluye pruebas TCP locales
sinteticas; no ejecuta pruebas financieras reales sin el proveedor necesario.

La prueba Electron individual de configuracion utiliza evidencia sintetica y
un userData temporal. Solo guarda ajustes y solicita el plan bloqueado; comprueba
que Enviar esta deshabilitado y no existe API de transmision. No pulsa ni invoca
envio, no conecta destinos y no ejecuta la suite general E2E/transporte.
