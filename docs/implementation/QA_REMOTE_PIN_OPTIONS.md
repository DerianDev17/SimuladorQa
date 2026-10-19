# Opciones QA sin instalar SafeNet en la estacion

Actualizacion posterior 2026-10-13: se implementa ademas un adaptador local
de cifrado TEST Windows con DPAPI y entrada PIN nativa. Requiere una clave y
vinculacion de algoritmo/encoding expresamente aprobadas para esa zona TEST;
no deriva claves del export de Registro. La opcion remota siguiente conserva
su validez cuando la custodia de claves exige el host. Ver QA_PIN_EXECUTION.md.

Propuesta del 2026-10-13 tras aclaracion del usuario: no puede instalar
SafeNet en su PC. No se instala/importa la configuracion criptografica del
host en la estacion. La integracion financiera completa sigue pendiente.

## Opcion recomendada: cifrado en el host existente

Mantener el mecanismo de cifrado y sus claves en el host QA donde ya estan
configurados. Un adaptador remoto autenticado entrega exclusivamente el
resultado de cifrado para una operacion QA al Main del simulador. Renderer
continua sin TCP, secretos o acceso al proveedor criptografico.

La DLL recibida MsgFormatDotNet contiene Des.EncrytPinToZone y su llamada a
CCrypto2.EncryptPinToZone. Es una base tecnica concreta para un puente;
no se afirma que ya exista un endpoint remoto que exponga esa funcion.
La zona/reference TEST debe resolverse con la configuracion efectiva del
host. No escoger 002/RTC, un indice o ATMZona por semejanza de nombres.

El contrato ICryptoService de WCFExtremeCrypto recibido expone validacion,
traduccion, intercambio y cambio de PIN. No incluye EncrytPinToZone.
ImportClearPIN llama PinChangeFromZone: no se usa como cifrado de consulta.
Si no hay otro endpoint aprobado, esta opcion requiere agregar un puente
acotado en el host, no instalar SafeNet en la PC.

El puente debe usar transporte protegido y autenticacion. Windows/WCF admite
seguridad de transporte con identidad del cliente/servidor; si se elige HTTP,
usar HTTPS con TLS validado. El contrato, certificados, host y puerto se
definen al implementar; no se inventa un endpoint en este documento.

Fuente: https://learn.microsoft.com/en-us/dotnet/framework/wcf/securing-services.

Esta opcion resuelve la dependencia de cifrado PIN remoto. Procesamiento
EMV y GENERATE AC pertenecen a la sesion local del chip; no se reemplazan
por el cifrador o por un F55 capturado. Fuente:
https://www.emvco.com/emv-technologies/emv-contact-chip/.

## Alternativa de prueba inmediata: cajero QA existente

Originar una consulta nueva en el ATM QA que ya funciona, usando su EPP/kernel
y configuracion actuales. El simulador/observadores se usan para correlacionar
la operacion en Switch/Mediator/Core por identificadores de esa nueva consulta.
Esto permite validar el recorrido real sin instalar SafeNet en la PC, pero
no certifica envio financiero originado por el simulador.

Si no hay acceso para agregar o invocar un mecanismo remoto ni utilizar el ATM,
solo pueden completarse pruebas offline/loopback y de comunicacion; no declarar
una transaccion financiera nueva a partir de un replay o PIN Block sintetico.

## Comprobaciones actuales

2026-10-13T17:54:51.845Z, tres endpoints QA documentados, solo conexion:

| Destino | Resultado | Limite |
| --- | --- | --- |
| 172.60.60.152:445 | Conexion TCP aceptada | No prueba permiso SMB, acceso a archivos o ejecucion remota |
| 172.60.60.152:50200 | Sin conectar en 2.5 segundos | Direccion documentada de HostCajerosWcfServices; no es un endpoint de cifrado confirmado |
| 172.60.60.156:49212 | Sin conectar en 2.5 segundos | Listener Mediator documentado del enlace Switch; no se usa para enviar directamente desde PC |

Cero bytes escritos, comandos criptograficos, ejecucion de binarios o cambios
remotos. Reporte privado artifacts/remote-pin-options-connectivity-20261013.json.
Estas observaciones desde PC no diagnostican conectividad Switch -> Mediator.

No se desplega el puente ni se afirma completar la integracion transaccional
durante esta evaluacion de opciones. El catalogo local no contiene perfiles
ATM; asignar una instancia al simulador tambien sigue pendiente.
