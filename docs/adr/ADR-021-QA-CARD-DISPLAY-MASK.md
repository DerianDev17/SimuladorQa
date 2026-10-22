# ADR-021: mostrar primeros seis y últimos cuatro dígitos del PAN

Fecha: 2026-10-22. Estado: implementado.

## Solicitud y revisión de seguridad

El operador solicitó explícitamente ver los primeros seis y los últimos cuatro
dígitos de la tarjeta leída. Esto amplía la porción visible respecto de la
proyección anterior, que mostraba solo los últimos cuatro. Se revisó el alcance
conforme a `agents/SECURITY_AGENT.md`: la lectura sigue ocurriendo en Main, la
interfaz recibe solo `panMasked`, y ninguna ruta de guardado, log o comprobante
recibe el PAN completo por este cambio. PCI SSC describe el enmascarado en
pantallas como hasta BIN y últimos cuatro dígitos; las reglas más estrictas que
apliquen a un despliegue deben comprobarse por separado
([FAQ 1492](https://www.pcisecuritystandards.org/faqs/1492/)).

## Decisión

La proyección de identidad EMV usa la función de dominio `maskPan`: seis
dígitos iniciales, asteriscos en todas las posiciones intermedias y cuatro
dígitos finales. Inicio, Tarjetas y el resumen de Transacciones presentan esa
misma referencia durante la sesión. Un campo PAN ausente sigue como no
disponible. La lectura de presencia no crea una referencia PAN.

El inventario QA persiste solo los últimos cuatro, AID y metadatos permitidos;
no se migran perfiles ni se añade el prefijo al almacenamiento. El PAN completo
y las respuestas APDU siguen restringidos a Main/helper durante la operación.

## Comprobación

Pruebas sintéticas unitarias, de integración y de interfaz verifican el patrón
6 + máscara + 4, la ausencia del PAN completo en la proyección y la vista de
la tarjeta. Ninguna prueba financiera QA se ejecuta para este cambio visual.
