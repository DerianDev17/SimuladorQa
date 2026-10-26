# Inicio: actividad de transacciones

Inicio muestra una tabla compacta de las ejecuciones QA de esta estación. Lee los
diarios existentes de consulta de saldo y retiro cada dos segundos mientras Inicio
está visible. La lectura SQLite se limita a los 50 registros recientes por
diario. No abre un socket adicional ni envía mensajes financieros. Al
pausar se conservan las filas visibles y se detienen las consultas; reanudar
vuelve a cargar los diarios. El filtro ATM y la búsqueda operan sobre la ventana
local de hasta 50 filas más recientes.

La tabla distingue una ejecución en preparación de una transmisión confirmada.
Los intentos bloqueados antes del envío no aparecen como transacciones cursadas.
Un reverso solo obtiene fila propia cuando el diario indica que se intentó
transmitir. La aprobación de un retiro se etiqueta como autorización del host,
sin afirmar dispensación ni débito Core. Respuesta, tiempo y STAN se muestran
solo cuando los conserva el diario. El PAN no está en estos registros y no se
reconstruye a partir de la lectura actual de tarjeta.

Errores y timeouts de lectura se muestran junto a la tabla. Se conserva la
última ventana disponible y se reintenta la consulta; cambiar de ambiente
limpia las filas. PREPROD no usa estos diarios QA.

En PREPROD, Inicio consulta cada tres segundos la configuración privada existente
de Mediator, con entidad 205 y canal 1. Lee como máximo 51 filas de
`MDT_Journal` unido a `MDT_Message` por TraceId, orden descendente, y muestra
las 50 más recientes. `hasMore` indica si había otra fila. No usa el rango fijo
de 2026-10-08 porque es una vista continua. Pausar detiene nuevas consultas.
El filtro de terminal y la búsqueda actúan solo sobre la ventana recibida.
La consulta no se mezcla ni se correlaciona con las ejecuciones QA locales.

SQL proyecta únicamente hora, terminal, secuencia, código de transacción,
RetCode, TraceId, valor registrado como texto y los últimos cuatro dígitos de
`jnlCardNumber` cuando es un PAN numérico de 12 a 19 dígitos. El PAN completo,
cuentas y XML no salen del servidor SQL en esta consulta. Main valida el formato
enmascarado y descarta propiedades inesperadas. Si la tarjeta no cumple esa
forma, la celda muestra `—`. RetCode, TrnCode y valor se muestran tal como están;
no se les asigna significado financiero no aprobado. La hora SQL se muestra
literal porque su zona no está confirmada. `NOLOCK` puede incluir lecturas sin
confirmar. Las filas no se persisten en el simulador.

El observador exige TLS validado y una cuenta SQL de solo lectura. La última
configuración conocida no pasó la validación TLS y la cuenta previamente
inspeccionada tenía db_owner; la pantalla muestra el error y reintenta, pero no
relaja esos controles.

## Criterios de aceptación

- Una ejecución QA transmitida aparece en Inicio sin recargar la vista, con
  operación, ATM, resultado y referencias conservadas por el diario.
- Pausar detiene las lecturas y reanudar recupera las entradas recientes.
- ATM y búsqueda filtran la ventana visible sin alterar el diario.
- Un bloqueo anterior al envío no aparece como transacción cursada; ante error
  o timeout se conservan las filas previas y se muestra la causa.
- La UI no muestra PAN, PIN ni datos de tarjeta derivados de otra sesión.
- En PREPROD, una fila de Mediator muestra solo `**** 1234` cuando el campo de
  tarjeta supera la validación; pausa, búsqueda y error conservan la ventana.

## Límites y TODO-DATA

TODO-DATA DASHBOARD-SWITCH-LIVE-FEED: la consulta aportada cubre filas de Mediator
PREPROD para entidad 205/canal 1. Falta validar si incluye todos los ATM/POS
del Switch, el significado del campo de tarjeta y el mapeo de códigos. Esta
vista es polling de últimas 50 filas, no un flujo de eventos garantizado;
transacciones que entren y salgan de esa ventana entre consultas pueden perderse.
Se requieren cuenta de lectura, TLS confiable, zona SQL y reglas de correlación
para ampliar su cobertura o unirla con otros orígenes.
