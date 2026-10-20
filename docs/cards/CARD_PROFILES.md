# Perfiles QA de tarjeta

## Uso

El operador inserta la tarjeta por contacto, elige el lector y pulsa **Leer
tarjeta**. El simulador obtiene de la tarjeta la identidad disponible y la lista
CDOL1/CDOL2 que indica qué datos solicitará el chip durante una operación.
Después puede guardar un perfil QA con alias y una cuenta predeterminada
opcional.

En Transacciones, un perfil guardado preselecciona el AID y, si se configuró,
la cuenta. Antes de usarlo el simulador vuelve a leer la tarjeta presente y
comprueba AID y últimos cuatro dígitos. El perfil no reemplaza la tarjeta, no
contiene credenciales para enviar una operación y no permite ejecutar una
transacción sin lector.

## Datos capturados y persistidos

| Fuente | Datos | Uso |
| --- | --- | --- |
| Lectura EMV | PAN enmascarado (solo últimos cuatro), AID y etiqueta de aplicación | Reconocer la referencia y seleccionar la aplicación actual |
| Lectura EMV | CDOL1/CDOL2: tags y longitudes | Mostrar los campos que solicita el chip, sin guardar sus valores |
| Operador | Alias y cuenta predeterminada opcional (Ahorros/Corriente) | Identificar el perfil y preparar la cuenta en Transacciones |

El inventario local QA guarda estos datos en `qa-card-profiles.json` dentro de
`userData`. La versión 2 migra perfiles antiguos que solo tenían alias, últimos
cuatro, AID y fecha. PREPROD no puede listar ni cambiar perfiles.

## Datos que no se guardan ni se editan como valores de tarjeta

No se persisten PAN completo, titular, vencimiento, Track 2, PIN, PIN Block,
CVV, respuestas APDU ni valores de autenticación EMV. Los tags que contienen
criptogramas o contadores transaccionales se deben obtener de nuevo desde el
chip en cada operación; nunca se rellenan desde un perfil guardado. PCI SSC
prohíbe almacenar datos de autenticación sensibles después de autorizar una
operación, incluso cifrados ([FAQ 1533](https://www.pcisecuritystandards.org/faqs/1533/),
[FAQ 1318](https://www.pcisecuritystandards.org/faqs/1318/)).

El perfil solo permite cambiar su alias y cuenta predeterminada. Los valores
editables de campos propietarios del libro **Card Groups** no se conectan al
constructor ISO: hace falta un mapeo validado que indique origen, formato,
clasificación de seguridad y destino de cada campo. Hasta contar con ese
contrato, editar esos valores podría producir una trama inválida o reutilizar
datos de autenticación antiguos.

## Alcance transaccional

El OMNIKEY transporta APDU; no genera por sí solo PIN ni una autorización. La
operación necesita la tarjeta física y el proveedor QA que prepara PIN/EMV
nuevos para la transacción. El perfil guardado facilita reconocer la tarjeta,
seleccionar el AID y elegir la cuenta, pero no habilita por sí mismo el envío.
Ver [lectura de identidad EMV](../hardware/EMV_IDENTITY_READING.md) y
[ejecución de saldo](../implementation/BALANCE_EXECUTION.md).
