# ADR-046: Historial completo QA cifrado y sin caducidad

Fecha: 2026-11-12. Estado: implementado por solicitud explícita del operador.

## Solicitud y precedencia

El operador solicita: «Quiero que las nuevas transacciones se guarden completas
para verlas en claro en el historial, incluso después de cerrar la app, sin el
límite de 15 minutos». Esta instrucción sustituye la retención exclusivamente
volátil de ADR-037 y autoriza la persistencia cifrada de los campos completos
capturados en QA. Los registros antiguos que contienen máscaras no se reconstruyen.

## Decisión

- El mismo puerto de diagnóstico recibe los campos completos de 0200/0210 y
  0420/0430 de saldo, retiro y depósito. Se reutilizan los codecs y criterios de
  correlación existentes; no cambian ISO, TCP ni reglas financieras.
- `EncryptedMessageArchive` guarda cada mensaje en un archivo independiente
  dentro de `userData/qa-message-archive/<requestId>/<MTI>.iso.enc`. La envolvente
  cifrada incluye versión, QA, UUID y mensaje; se verifican nuevamente al leer.
  Así se rechaza sustituir un archivo por el de otra operación o MTI.
- `ElectronMessageEncryption` implementa el puerto de cifrado con la API asíncrona
  `safeStorage` de Electron, respaldada por Windows. No hay clave en el repositorio
  ni fallback a texto claro. Otras plataformas no habilitan este archivo.
- Archivo temporal, sincronización y reemplazo atómico contienen exclusivamente
  bytes cifrados. La cola serializa escrituras de cada UUID sin bloquear la lectura
  de otras operaciones; el cierre normal espera su drenaje
  después de las operaciones financieras. Se admite un máximo de 128 escrituras
  pendientes y 256 KiB de contenido por mensaje; son límites de recursos en curso,
  no límites de retención. El cifrado/descifrado tiene un plazo local de 5 segundos.
- No hay caducidad automática ni expulsión a las 20 solicitudes. Cambiar ambiente
  o cerrar no borra el archivo. Se descifra únicamente el UUID solicitado en Main,
  sin caché de mensajes completos ni almacenamiento del Renderer.
- IPC conserva su nombre técnico para compatibilidad, validación de emisor,
  ambiente QA activo, UUID y claves exactas. `expiresAt: null` identifica contenido
  persistente; fechas de la vista temporal anterior siguen siendo compatibles.
- **Mostrar valores completos**, activado por defecto, funciona en Texto legible
  y Campos. Indica cuándo los valores están guardados sin caducidad. Desactivar la
  opción o salir de Mensajes retira los valores de la vista; reabrir los recupera.
- PIN Block y criptogramas se muestran como bytes cifrados originales, en HEX;
  no se descifran. No se incorpora el PIN ingresado ni llaves/credenciales. El
  archivo conserva todos los campos ya capturados, incluidos PAN, Track 2 y EMV.
  No es una captura RAW del framing TCP ni interpreta subcampos privados nuevos.
- Diarios públicos, logs, exportaciones y demás pantallas conservan máscaras.
  El validador público sigue rechazando el DTO completo. Solo el archivo privado
  cifrado incorpora la excepción de persistencia autorizada.

## Errores y recuperación

Una captura fallida nunca modifica el resultado financiero ni causa un reenvío.
La lectura espera escrituras pendientes; un fallo de guardado conocido en el
proceso, un archivo inválido o un descifrado fallido produce un error sanitizado
en Mensajes. No se muestra «guardado» para esa lectura. Actualizar solo consulta.
Un mensaje ausente conserva la proyección protegida con una explicación: no se
rellena desde otra operación, tarjeta o perfil. Timeout financiero conserva solo
los mensajes realmente capturados y correlacionados.

No se promete persistencia si el disco/cifrado falla ni frente a un cierre forzado
antes de terminar la escritura. Tras reinicio, un archivo que no llegó a existir
se presenta como original no disponible. No hay reintentos financieros automáticos.

## Revisión explícita de seguridad

- Autorización: solicitud del operador citada arriba; excepción limitada a QA y
  al archivo cifrado local. Producción sigue bloqueada.
- Confidencialidad en disco: ningún valor completo pasa por archivos temporales
  en claro, SQLite público, logs, exportaciones o argumentos de procesos.
- Acceso: se requiere el perfil Windows que puede descifrar el archivo. El cifrado
  de Windows no aísla de otras aplicaciones del mismo usuario. No se promete
  portabilidad a otro equipo/usuario ni recuperación tras perder ese perfil.
- Integridad: descifrado, esquema cerrado, tamaños y correspondencia UUID/MTI/QA
  se validan antes de entregar datos al Renderer. Errores no incluyen contenido
  del archivo ni mensajes originales de las dependencias.
- Retención: los mensajes completos permanecen en disco cifrados sin eliminación
  automática. Las referencias de memoria administrada se liberan; no se promete
  borrado físico de todas las copias del runtime.
- Dependencia: se usa Electron ya instalado, sin bibliotecas nuevas. Referencia
  técnica: [safeStorage de Electron](https://www.electronjs.org/docs/latest/api/safe-storage).

## Validación

Pruebas con datos sintéticos: recuperación de cuatro MTI tras reapertura, ausencia
de TTL/expulsión, archivos sin contenido legible, mensajes parciales, UUID/DTO
inválidos, sustitución de archivos, corrupción, almacenamiento/cifrado ausentes y
timeout. Electron verifica cifrado real de Windows, cierre/reinicio, consulta desde
el historial por IPC real, texto/campos, ocultación y recuperación tras error.
No se ejecutan operaciones contra el host QA ni se acredita aceptación financiera.
