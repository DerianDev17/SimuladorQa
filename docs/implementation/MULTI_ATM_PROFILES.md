# Perfiles ATM múltiples: estado comprobado

## Revisión del 2026-10-27

Inspección local de solo lectura en el AppData de Coonecta ATM Simulator:
ambos ATM están activos, revisión 1. ATM20521 tiene perfil válido coincidente
con el catálogo, credencial protegida de enlace presente y 959 secuencias
restantes. ATM20524 conserva evidencia CMS; no aparece en el archivo de
perfiles ejecutables y no tiene una reserva propia ni vínculo de cifrado
directo configurados. Se conserva un informe sin secretos en
`artifacts/atm-readiness-20261027.json`.

El flujo de envío es reutilizable por perfil. La regresión integrada ejecuta
ATM20521 → ATM20524 → ATM20521 en un servidor TCP local, con perfiles y
tarjeta sintéticos, proveedor PIN/EMV real del simulador y cifrador sintético.
Comprueba seguridad nueva, correlación por terminal, identificadores distintos
y consumo separado de las reservas. Esto verifica que volver a usar ATM20521
no exige recrear el servicio. No acredita la admisión financiera de ATM20524
en QA ni instala esos perfiles sintéticos en la estación.

Carga y estrés permite elegir cualquiera de los perfiles, uno por corrida, y
muestra juntas las dependencias que impiden iniciar. La habilitación real de
ATM20524 mantiene los TODO-DATA de perfil, vínculo de clave y secuencias
enumerados abajo. La llave de enlace de ATM20521 ya está localizada; su
existencia no documenta por sí sola la vinculación del segundo terminal.

## Referencia ATM20521

El catálogo QA local contiene ATM20521 y ATM20524. La inspección de metadatos
privados (sin imprimir claves, campos ISO ni secuencias) confirmó que ATM20521
tiene un perfil ejecutable vinculado a su UUID, revisión y Terminal ID, con
reservas STAN propias. ATM20524 tiene evidencia CMS documental, pero no un perfil
ejecutable ni una clave de enlace autorizada para cifrar el PIN de la ruta directa.
Su aparición en el catálogo no constituye una prueba transaccional.

El flujo ejecutable de ATM20521 está limitado a CB 205, QA, LOCAL, ahorros y
consulta de saldo. Construye 0200 con F3=301000 y F4=0, F11 reservado, F37
derivado de fecha y secuencia, F41 del Terminal ID, F52 cifrado y F55 generado
para cada operación desde la tarjeta. Usa cabecera VISA de 22 bytes y envolvente
de cuatro bytes (longitud BE16 del cuerpo más extensión opaca de dos bytes).
Correlaciona la respuesta 0210 con STAN, RRN, terminal, código de procesamiento
y moneda; F39 determina el resultado y el diario guarda duración y referencias
sanitizadas. Fuentes: `CB_205_BALANCE_SAMPLE.md`, `ISOBASEI_REVIEW.md`,
`BALANCE_EXECUTION.md` y el perfil privado aprobado de esta estación.

La propuesta de F3=702, VLI de dos bytes y cabecera de doce bytes no coincide
con este flujo ATM comprobado. `ContextoISO.xml` pertenece al mock BANRED 4946
y no autoriza cambiar el codec del enlace ATM 16100. Se conserva ATM20521.

## Entregado

- El catálogo permite clonar la parte administrativa de cualquier ATM; exige
  alias, Terminal ID y Acquirer ID nuevos. Cada guardado recibe UUID, revisión,
  ambiente y auditoría propios. La unicidad de Terminal ID por ambiente ya se
  verifica en SQLite.
- La clonación no copia clave, perfil ISO ejecutable, datos de tarjeta ni
  reservas STAN. Los perfiles QA ejecutables se rechazan si dos ATM comparten
  secuencias aún reservadas.
- Transacciones permite seleccionar un ATM y filtrar por ATM el historial QA
  disponible. La ruta de ejecución verifica UUID, revisión, Terminal ID,
  destino, tarjeta, perfil y seguridad antes de transmitir.
- Una conexión TCP sin payload a la entrada QA respondió en la estación el
  2026-10-20. Esto acredita solo apertura de socket, no admisión ni respuesta
  financiera de ATM20524.

## Datos pendientes para habilitar ATM20524 u otros ATM

- **TODO-DATA MULTI-ATM-EXECUTION-PROFILE:** por cada ATM nuevo, aportar y
  validar la imagen activa, cabecera, campos fijos ISO, aplicación y parámetros
  EMV, endpoint autorizado, fecha contable, Acquirer/Terminal ID y fuente de
  cada valor. Los campos comunes de ATM20521 solo se podrán heredar tras
  confirmar que aplican al nuevo modelo/enlace. El CRUD permanece disponible.
- **TODO-DATA MULTI-ATM-PIN-KEY:** vincular por terminal una clave de enlace
  TEST aprobada, bajo custodia DPAPI, y comprobar su finalidad y formato PIN.
  La maestra CMS de ATM20524 no cumple esta función.
- **TODO-DATA MULTI-ATM-STAN-ALLOCATION:** confirmar una reserva exclusiva
  entre estaciones y cajeros físicos, incluido el historial de STAN ya usados.
  La validación local evita solapamiento entre reservas vigentes en un archivo;
  no constituye coordinación distribuida ni certificado de unicidad histórica.
- **TODO-DATA MULTI-ATM-QA-RESULT:** obtener una consulta nueva 0200/0210 por
  ATM con PIN/EMV frescos y observar su correlación en Switch/Core. Hasta ese
  resultado, distinguir perfil administrativo, TCP abierto y transacción
  aprobada.
- **TODO-DATA MULTI-ATM-CONCURRENCY:** faltan límites de sesiones, pool de
  tarjetas autorizado y secuencias por estación para ejecutar varios ATM en
  paralelo. La ejecución interactiva actual serializa las operaciones.

Retiros y reversos tienen contratos separados; no se habilitan para un nuevo
ATM mediante la clonación administrativa.
