# ADR-019: Perfiles QA de chip y captura segura

- Estado: Aceptado
- Fecha: 2026-10-20

## Contexto

El equipo quiere reconocer tarjetas insertadas, guardar los datos útiles de la
lectura y volver a preparar consultas/retiros QA con menos selección manual.
La captura VTS/Variables Manager muestra campos EMV, valores propietarios y
datos dinámicos. El libro Card Groups no define un mapeo aprobado de esos
valores al contrato ISO de este simulador.

## Decisión

La versión 2 del perfil local QA persiste solo:

- alias y últimos cuatro del PAN;
- AID y etiqueta de aplicación leídos del chip;
- tags y longitudes CDOL1/CDOL2, sin valores de transacción;
- cuenta predeterminada opcional elegida por el operador;
- UUID, alcance QA y fecha UTC.

Alias y cuenta se pueden editar sin volver a insertar la tarjeta. En
Transacciones, el operador puede elegir un perfil para preseleccionar su AID y
su cuenta. Main sigue requiriendo la tarjeta física; la lectura comprueba AID
y últimos cuatro antes de seleccionar la referencia. El proveedor genera los
datos PIN/EMV nuevos conforme a su contrato vigente. Los perfiles no son una
fuente de datos para construir mensajes financieros.

Se migran perfiles v1 al formato v2 con etiqueta, requisitos CDOL y cuenta en
null. El inventario continúa en `userData` y bloqueado fuera de QA.

No se guardan PAN completo, titular, vencimiento, Track 2, PIN, PIN Block, CVV,
respuestas APDU, criptogramas ni valores de autenticación EMV. Ningún valor del
libro Card Groups se captura, edita o conecta al mensaje ISO hasta resolver
TODO-DATA CARD-GROUP-VARIABLE-MAP con origen, formato, sensibilidad, vigencia y
destino aprobados.

## Consecuencias

- Se reconoce y selecciona una aplicación física QA conocida sin copiar datos
  dinámicos de una operación anterior.
- La cuenta predeterminada es una conveniencia de UI elegida por el operador;
  la regla host/ATM continúa gobernada por el perfil transaccional validado.
- Las variables propietarias de VTS quedan como trabajo bloqueado por evidencia;
  el perfil no constituye una réplica de VTS ni un certificado de tarjeta.
