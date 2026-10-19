# ADR-013: PIN nativo y primera AC para la consulta de saldo QA

Estado: implementado como ruta acotada, activacion financiera pendiente del
perfil y contrato TEST aprobados. Fecha: 2026-10-13.

## Problema

El servicio de saldo tenia builder/transporte pero no proveedor concreto de
contexto. El usuario pide Enviar -> ingresar PIN -> consulta nueva y no puede
instalar SafeNet. Las capturas originales no proporcionan seguridad nueva.

## Decision

Main carga perfiles privados aprobados y registra QaBalanceExecutionProvider
por ATM en el Router existente. El PIN se captura en proceso WinForms nativo,
por pipe privado, fuera del Renderer. El cifrado local TEST usa un helper
Windows con claves protegidas por DPAPI y algoritmo TDEA_2KEY_ECB/encoding
EXTREME_ANSI_IL explicitamente declarados. No se sustituye la zona del host
por una clave adivinada ni se portan secretos del Registro.

PC/SC conserva datos de tarjeta privados en Main; adquiere una sesion exclusiva
para una primera AC nueva siguiendo CDOL1 y el perfil acotado. No expone APDU
arbitrarios por IPC. La lectura se consume al terminar. Las secuencias vienen
de un pool reservado persistente con lock exclusivo; no se infiere un SP del
host, contador compartido o regla de rollover.

## Consecuencias

Se implementa el flujo de PIN para la primera prueba fisica sin nuevas
dependencias de paquetes. Produccion permanece bloqueada. Perfil, clave y
secuencias no se crean con datos sinteticos al arrancar. Sin configuracion
aprobada se bloquea solo esa activacion, antes de pedir PIN o abrir TCP.

No es kernel ni PIN pad certificado. No incluye segunda AC, ARPC/scripts o
seguridad de tarjetas virtuales. La arquitectura mantiene la sustitucion del
proveedor sin acoplar los ATM a PC/SC. Las pruebas de CI simulan el chip/host
y verifican por separado el cifrado Windows con una credencial sintetica.
Detalle operacional y TODO-DATA: ../implementation/QA_PIN_EXECUTION.md.
