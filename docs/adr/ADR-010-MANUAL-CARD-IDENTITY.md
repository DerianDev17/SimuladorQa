# ADR-010: Identidad de tarjeta mediante lectura manual EMV

## Contexto

El usuario solicita mostrar datos de la tarjeta detectada y solo dispone de la
tarjeta QA y el lector. El estado PC/SC/ATR no identifica PAN. La investigacion
de especificaciones y la prueba fisica identificaron un perfil EMV de contacto
con PSE y PDOL 9F1A/2 bytes. El usuario eligio pais Ecuador, 218.

## Decision

Agregar lectura manual acotada en Main mediante CardIdentityService y un
adaptador de sesion PC/SC, con proceso externo oculto. Mantener estado/polling
separados de APDU. El Renderer recibe una proyeccion permitida y protegida;
nunca comandos o respuestas brutas. No se guarda identidad en SQLite.

Los comandos provienen de EMVCo y los registros del directorio/AFL de la
tarjeta. El perfil soportado y sus fuentes se describen en
`docs/hardware/EMV_IDENTITY_READING.md`. Un parametro desconocido detiene solo
la lectura dependiente. La vigencia se comprueba con el handle PC/SC, sin
asumir que dos tarjetas con el mismo ATR son iguales.

## Consecuencias

La tarjeta actual puede mostrar PAN enmascarado, titular y vencimiento leidos.
Otros perfiles requieren evidencia adicional. GPO inicia procesamiento ICC;
la accion no se repite por polling y termina antes de autenticacion/PIN o
criptogramas. No habilita transacciones ATM, asociacion automatica a Core,
persistencia de tarjetas ni produccion. Sin dependencias nuevas.
