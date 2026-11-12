# Inicio: últimas transacciones de Mediator

Corrección de navegación (2026-11-12): al volver a Inicio se inicia una consulta
IPC nueva aunque la visita anterior tenga otra pendiente. Preload no las agrupa;
Main mantiene la exclusión de consultas y la UI reconsulta ante `CONFLICT`.
Las respuestas tardías de la visita abandonada no se reutilizan ni se muestran
en la vista nueva. Los filtros, pausa y filas se reinician al salir y volver.

Inicio usa la configuración privada de Mediator en Qa, el único ambiente
operativo. Consulta `MDT_Journal` y `MDT_Message` por TraceId para
entidad 205/canal 1, ordena por `msgTraceId` descendente y muestra 50 filas.
No usa el rango fijo del SQL de investigación: siempre solicita las últimas.
El polling es de cinco segundos, solo mientras Inicio está abierto y sin consultas
solapadas. Un proceso lector reutiliza una conexión y se cierra tras 12 segundos
sin solicitudes. Pausar detiene las lecturas; ante error se conserva la última ventana
y el siguiente intento espera 15 segundos. Filtro y búsqueda operan en memoria
sobre la ventana recibida. No hay persistencia local ni envío financiero.

Al salir y volver a Inicio se reinicia la vista completa: filas, filtros,
pausa, error y hora de actualización. Mientras llega la nueva consulta se muestra
el estado de carga; un fallo no conserva filas de la visita anterior. Las respuestas
tardías de la vista abandonada se descartan. La conservación de la última ventana
ante errores aplica únicamente dentro de la misma visita.

La búsqueda se calcula cuando cambian filas o filtros, sin repetirla por cada
actualización del indicador TCP. La tabla admite foco y desplazamiento con teclado;
el botón Pausar/Reanudar expone su estado mediante `aria-pressed`.
La tabla presenta Operación, Retorno e Identificador con sus nombres técnicos
secundarios; no interpreta su resultado financiero. El pie identifica el ambiente
y la fecha/hora local de la última consulta; la hora del origen SQL sigue literal.
Durante cada consulta se indica carga y el área de filas expone `aria-busy`.

La consulta usa `TOP 51`, parámetros tipados, timeout y una proyección cerrada.
No lee XML, cuentas ni PAN al proceso/Renderer. SQL convierte un PAN numérico
de 12–19 dígitos en `**** 1234`. Para el formato hexadecimal de 32 caracteres
observado en `jnlCardNumber`, calcula `REF-` y 12 dígitos hexadecimales de
SHA-256. Esa referencia permite agrupar filas iguales, pero **no revela los
últimos cuatro dígitos reales de la tarjeta**. Main valida el formato y elimina
propiedades inesperadas. Valores fuera de esos formatos se muestran como `—`.

TrnCode, RetCode y valor registrado se muestran sin interpretar aprobación,
moneda o reverso. La hora SQL se muestra literalmente porque su zona no está
confirmada. `NOLOCK` puede mostrar datos sin confirmar. Si entran más de 50
filas entre sondeos, alguna puede no verse.

El usuario autorizó el 2026-10-26 una excepción para Inicio: conexión cifrada
sin validar el certificado y consulta `SELECT` fija con la credencial existente,
que tiene permisos elevados. Historial mantiene TLS validado y guard de cuenta
de solo lectura. Ver [ADR-009](../adr/ADR-009-MEDIATOR-OBSERVER.md).

## Verificación y pendientes

La consulta real devolvió 50 filas en QA con 50 referencias protegidas; no se
extrajeron valores originales. Pruebas cubren validación, proyección, error,
timeout, cambio de ambiente, pausa y filtros.

TODO-DATA DASHBOARD-SWITCH-LIVE-FEED: confirmar cobertura de todos los ATM/POS,
si la referencia es estable entre sesiones, zona SQL y mapeo de códigos.
Sustituir la excepción por certificado confiable y credencial de solo lectura.
