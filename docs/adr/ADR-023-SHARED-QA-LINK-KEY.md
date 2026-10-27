# ADR-023: referencia de clave de enlace compartida en QA

Fecha: 2026-10-27. Fuente de decisión: instrucción del usuario de implementar
el uso de las mismas claves con la información existente.

## Decisión

ATM20524 puede vincularse a la misma referencia protegida de clave de enlace
que ATM20521 para la ruta directa QA de la entidad 205. No se exige una clave
distinta por Terminal ID. Los perfiles ejecutables ya admitían `keyReference`
repetida: la restricción de unicidad corresponde a UUID, Terminal ID y reservas
STAN, no a las referencias de clave.

Se agrega `directPinKey` opcional a la evidencia CMS privada. Registra UUID del
perfil origen, referencia de clave, origen `USER_QA_INSTRUCTION` y fecha UTC.
`SharedQaPinKey` valida en Main que el origen sigue presente, que su referencia
coincide y que ambos usan el mismo host/puerto QA. Después comprueba la
disponibilidad local mediante `WindowsQaPinCipher`, con su plazo de cinco
segundos y custodia DPAPI. No hay copias de material criptográfico.

El diagnóstico deja de mostrar la clave como pendiente solo cuando esa
comprobación pasa. Un cambio/retiro del origen, otro destino o una credencial
inaccesible restaura el bloqueo. UUID y metadatos de la referencia no se
proyectan al Renderer. La maestra CMS se conserva separada y no se usa como
clave PIN de la ruta directa.

## Por qué compartir no produce una colisión por Terminal ID

En el adaptador implementado `LegacyQaPinEncryption`, el bloque se prepara con
PAN/PIN y se cifra mediante la referencia recibida. El Terminal ID no es una
entrada del cifrador. La secuencia y la correlación se gestionan por separado.
Dos perfiles pueden usar la misma credencial protegida, conservando nuevas
operaciones de PIN/EMV e identificadores propios en cada envío.

Esto no demuestra qué clave selecciona el host para ATM20524. Si su ruta
efectiva espera otra clave, finalidad o formato PIN, compartir la referencia
local no lo corrige: la aceptación debe comprobarse con una consulta nueva.
La exposición o rotación de una clave compartida afecta a todos sus perfiles.

## Alcance pendiente

La vinculación de clave no proporciona campos ISO, fecha contable ni reservas
para otro terminal. Esas dependencias de ATM20524 conservan su bloqueo. No se
duplican ni transfieren las reservas de ATM20521; no se inventa un perfil
financiero a partir del cambio de Terminal ID. Esta entrega tampoco modifica
retiros/reversos, el host, la política TLS ni la custodia de claves.

## Validación

Pruebas de referencia compartida, origen revocado, destino incompatible,
ausencia/timeout del cifrador, persistencia y recuperación desde disco. La
integración PIN/EMV/ISO/TCP local ejecuta ATM20521 → ATM20524 → ATM20521 con
la misma referencia de cifrado sintética y reservas distintas. Se verifica
generación de seguridad nueva y limpieza de PIN; no es una prueba financiera
contra QA.
