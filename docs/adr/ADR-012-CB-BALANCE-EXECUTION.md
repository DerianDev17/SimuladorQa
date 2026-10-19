# ADR 012 Ejecucion de consulta CB mediante puertos privados en Main

Fecha: 2026-10-12. Estado: aceptado para implementacion; proveedor QA externo pendiente.

## Contexto

El formulario solo revisaba un borrador. La imagen NCR aporta reglas mecanicas
de consulta y saldo, pero no completa seguridad PIN/EMV, secuencia ni aprobacion
del perfil activo. Conectar un replay al formulario presentaria una captura
historica como transaccion nueva.

## Decision

Separar el motor ejecutable de la preparacion documental. Main incorpora
BalanceInquiryService con puertos de contexto privado, transporte y diario.
El dominio contiene solicitudes/resultados; codecs/reglas del proveedor viven
en adaptadores de Main. Renderer transmite referencias y contexto tipado,
nunca bytes o secretos. El alcance inicial ejecutable es CB QA/ahorros.

BalanceContextProvider debe reservar secuencia y entregar perfil/cabecera,
campos privados y seguridad de TEST nuevos, vinculados a la sesion de tarjeta.
Electron no instala un proveedor ficticio. Su ausencia bloquea exclusivamente
esta ejecucion y se informa antes de abrir transporte.

El envio es manual y unico; no responde 0810 ni agrega politica de reconexion,
reintentos o reverso. Antes del write se persiste PENDING con UUID/UTC y clave
de idempotencia. Repetir esa clave recupera el resultado, incluso tras reinicio,
sin repetir la transaccion. Resultado incierto permanece incierto.

## Consecuencias y validacion

Se puede comprobar todo el pipeline con proveedores/servidores sinteticos sin
inferir reglas externas ni usar secretos de capturas. La prueba local no valida
la dependencia Core ni una consulta fisica aprobada. Los limites, privacidad,
configuracion pendiente y pruebas estan en
`docs/implementation/BALANCE_EXECUTION.md`.
