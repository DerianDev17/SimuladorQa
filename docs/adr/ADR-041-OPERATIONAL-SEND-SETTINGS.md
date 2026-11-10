# ADR-041 — Configuración operativa del destino Qa

Fecha: 2026-11-10. Estado: implementado.

## Contexto y decisión

El usuario solicita que las configuraciones sean operativas. Los plazos ya
alimentaban el transporte, pero el destino solo podía obtenerse de evidencia
documental y el selector de modo no modificaba la ejecución.

Configuración → Envío permite editar IPv4, puerto y plazos técnicos. Main valida
y guarda el destino explícito para Qa con `evidenceId: null`. Esa marca distingue
una elección del operador de una fuente documental; no se modifica ni fabrica
evidencia. Se conserva la lectura de configuraciones anteriores y su detección
de cambios de fuente hasta que el operador guarda los ajustes desde el formulario.

La petición de guardado añade `endpoint` al contrato existente. Solo se admite
con ambiente QA, `evidenceId: null` y `trigger: ON_CLICK`. Se rechazan claves
adicionales, IPv4/puertos inválidos y revisiones obsoletas. Los plazos mantienen
el rango técnico de 1 a 30000 ms o null. El selector de intención documental
desaparece; los valores históricos se conservan hasta el siguiente guardado.

Un guardado exitoso cierra el enlace de observación anterior con motivo
`CONFIGURATION_CHANGED`. La próxima acción Conectar toma el destino/plazo
persistidos. Guardar o reiniciar no abre sockets. Los guardados fallidos no
desconectan; los errores o timeouts de IPC requieren recargar para reconciliar.
Persistencia atómica, revisión y auditoría UUID/UTC se mantienen.

## Revisión de límites

Se sustituye la restricción documental de ADR-011 para la configuración de
conexión, por solicitud explícita del usuario. El Renderer propone parámetros
y Main los valida antes de persistir y antes de conectar. El canal Conectar
sigue sin aceptar un endpoint arbitrario en su petición.

El ambiente operativo sigue siendo Qa y PROD continúa rechazado. La edición no
habilita perfiles financieros para otro destino: router, plantilla y proveedor
PIN/EMV conservan su vinculación al endpoint autorizado. Las operaciones manuales
y de carga usan la configuración guardada y sus validaciones vigentes. Cambiarla
durante una transacción o una corrida permanece bloqueado. No se modifican reglas
ISO, secretos ni configuración privada de los perfiles.

## Verificación

Pruebas de contrato para IP, puerto, ambiente y origen; persistencia/reinicio y
errores de almacenamiento; Main para revisión obsoleta, plazos y desconexión;
Electron con servidor TCP loopback para guardar sin evidencia, reiniciar,
conectar al puerto elegido y cerrar al guardar. La prueba comprueba cero bytes
financieros y ausencia de conexiones al guardar/reiniciar. El timeout de guardado
conserva su prueba E2E de reconciliación. No se conecta al Switch QA real.
