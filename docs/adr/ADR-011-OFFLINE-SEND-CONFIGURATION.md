# ADR-011 - Configuracion de envio y planes offline

Estado: aceptada para configuracion/preparacion, no para ejecucion financiera.
Fecha: 2026-10-11.

El usuario solicita dejar configurada la generacion desde el formulario y aplazar
las pruebas de envio. Existe evidencia QA y un transporte acotado de replay, pero
las reglas de campos dinamicos y seguridad de un request nuevo siguen pendientes.

Se agrega configuracion separada en userData y tres IPC sin payload financiero.
Main deriva el endpoint desde la evidencia y revalida ambiente/revision. La UI no
pide RAW/HEX ni almacena identidad de tarjeta en esta configuracion. Al revisar se
prepara un plan bloqueado con pendientes explicitos, sin sockets, bytes ni retries.

Se descarta conectar el replay historico a una operacion nueva porque conserva
identificadores, fechas y seguridad de otra ejecucion. Se descarta convertir el
catalogo CMS o la lectura de identidad en un builder ATM sin reglas aprobadas.
La generacion/ejecucion queda como dependencia independiente bajo
TODO-DATA AUTOMATIC-FRAME-GENERATOR. El modo previsto no equivale a un sistema armado.

La configuracion QA inicial usa solo la evidencia disponible, no sobrescribe un
perfil existente ni inventa plazos. Archivo corrupto o evidencia cambiada bloquean
el modulo dependiente, conservando la app. Verificacion exclusivamente offline;
no se ejecuta ninguna prueba de envio como parte de esta decision.
