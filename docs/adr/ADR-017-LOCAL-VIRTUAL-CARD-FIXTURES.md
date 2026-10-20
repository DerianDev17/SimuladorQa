# ADR-017: Referencias virtuales locales sin credenciales de pago

- Estado: Aceptado
- Fecha: 2026-10-20

## Contexto

El usuario confirma que existe un pool virtual QA autorizado, pero todavia no
se conoce su API, SDK o servicio. La aplicacion actual obtiene PIN y EMV desde
una tarjeta fisica y no puede crear credenciales transaccionales virtuales sin
el contrato y la seguridad aprobados para ese pool.

## Decision

La pantalla **Tarjetas** puede generar referencias opacas `QA-VISA-*` para
probar la interfaz local. Main limita la operacion al ambiente QA y a 1-20
referencias por solicitud. Las referencias son efimeras y no contienen PAN,
vencimiento, CVV, PIN, PIN Block, APDU ni criptogramas. No se conectan a los
servicios financieros ni se guardan como perfiles de tarjeta.

La carga real solo podra usar un adaptador separado para el pool QA aprobado,
con datos y seguridad dinamicos nuevos por consulta. Las referencias locales
no sustituyen ese adaptador ni habilitan mensajes hacia Switch/Core.

## Consecuencias

- Se pueden ensayar elementos de interfaz sin usar tarjetas reales.
- Las referencias locales no son datos de sandbox emitidos por Visa ni una
  afirmacion de que el Core las acepte.
- La prueba de carga permanece bloqueada hasta integrar el pool autorizado y
  definir los limites de corrida pendientes.
