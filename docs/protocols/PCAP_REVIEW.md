# Revision de capturas transaccionales

Inspeccion local del 2026-10-06, completada a `2026-10-07T03:00:02.875Z` (UTC).
Reporte UUID `b8be8605-9ba2-497a-aa05-70bd476764ec`.
Se recibieron los diez archivos de `Tramas transacciones/`. Los originales son
privados y estan excluidos de Git; solo se versionan metadatos sin campos de tarjeta.
SHA-256 y UUID de cada fuente: `apps/desktop/src/main/adapters/pcap-evidence.json`.

## Resultado por archivo

Los conteos siguientes corresponden exclusivamente al encapsulado verificado del
enlace capturado 4946. Cero significa que el archivo tiene otros formatos, no que
no contenga transacciones.

| Archivo (todos .pcap) | Bytes | Mensajes verificados | MTI y conteo | Direcciones con solapamiento distinto fuera del perfil |
|---|---:|---:|---|---:|
| CertificacionMandatoVisa28092026 | 231798 | 0 | Formato pendiente | 2 |
| CertificacionMandatoVisa28092026RedExterna | 256467 | 0 | Formato pendiente | 1 |
| CertificacionMandatoVisa28092026_BanredAuth | 174937 | 112 | 0200:6, 0210:6, 0420:3, 0430:3, 0800:92, 0810:2 | 1 |
| CertificacionMandatoVisa28092026_Externas | 15209 | 0 | Formato pendiente | 2 |
| CertificacionMandatoVisa28092026_VisaLocal | 98343 | 0 | Formato pendiente | 1 |
| CertificacionMandatoVisa29092026_CRBanred | 24871 | 14 | 0200:5, 0210:5, 0420:2, 0430:2 | 0 |
| CertificacionMandatoVisa29092026_CRREverso | 22692 | 0 | Formato pendiente | 2 |
| CertificacionMandatoVisa29092026_CrReverso_2 | 153854 | 66 | 0200:28, 0210:28, 0420:2, 0430:2, 0800:3, 0810:3 | 1 |
| CertificacionMandatoVisa29092026_CrVisa | 52635 | 0 | Formato pendiente | 1 |
| CertificacionMandatoVisa29092026_FondoInsuficientes | 43064 | 26 | 0200:13, 0210:13 | 1 |

Totales: 140 direcciones TCP con payload, 102 dentro del perfil y 38 fuera.
218 mensajes: 52 de MTI 0200, 52 de 0210, 7 de 0420, 7 de 0430,
95 de 0800 y 5 de 0810. No hay huecos ni solapamientos distintos en el perfil
verificado. Se detectaron 12 direcciones con solapamientos distintos fuera de el;
no se interpretan esos bytes como mensajes de negocio. No se adjudica la causa
(por ejemplo, comportamiento de keepalive) sin documentacion del enlace.

## Encapsulado confirmado por estas capturas

| Parte | Offset desde el inicio del frame | Representacion |
|---|---:|---|
| VLI | 0 | Entero sin signo de 2 bytes, big endian |
| Cabecera | 2 | 12 bytes ASCII, valores observados `ISO` + 9 digitos |
| MTI | 14 | 4 bytes ASCII |
| Bitmap | 18 | 32 caracteres hex ASCII en mayusculas: 128 bits |
| Datos de campos | 50 | Bytes opacos; longitudes/encoding pendientes |

La longitud **incluye los dos bytes del VLI**. Ejemplo estructural: primer frame
del flujo 0 de BanredAuth declara 644 bytes; la siguiente cabecera empieza en 646,
tras el siguiente VLI ubicado en 644. El codec consume exactamente todos los
bytes de las 102 direcciones, con mensajes de 69 a 664 bytes (rango observado,
no limite operativo del banco). El limite mecanico BE16 es 65535 bytes por frame.

Cabeceras exactas observadas: ISO006000040, ISO006000047, ISO006000060,
ISO016000040, ISO016000044, ISO016000045, ISO016000046, ISO016000047 e ISO016000055.
Su variacion no se interpreta ni se reduce a una constante arbitraria.
Todos los bitmaps observados anuncian una segunda mitad; no se observa una tercera.
El codec enumera numeros de bits/campos, excluyendo el indicador F1, y conserva
los datos opacos en Main/herramienta local sin enviarlos al Renderer.

La observacion de 0420/0430 aporta evidencia para ese enlace. El manual CMS
enumera tambien 0400/0410 y 0421; no hay contradiccion resuelta ni seleccion
universal de familia: faltan reglas por canal y la correspondencia ATM/Core.
La presencia de 0800/0810 no define una frecuencia, temporizador ni politica
de reconexion. Su conteo desigual no prueba timeout financiero.

## Metodo y verificacion reproducible

`node tooling/inspect-pcaps.mjs` usa el tshark ya instalado. Admite como argumentos
la carpeta de fuentes y la ruta de tshark. No instala dependencias.
Lee payload TCP en memoria, agrupa por stream/direccion, ordena por secuencia
absoluta y detecta huecos y retransmisiones/solapamientos distintos.
Rechaza ventanas mayores de 10 MB o secuencias que no pueda ordenar; no soporta
wrap TCP de 32 bits ni inventa bytes faltantes. Los demas enlaces se inventarian
sin intentar aplicarles este perfil. Ante fallos, solo muestra codigos fijos,
nunca stderr/payload de tshark.

Sobre cada direccion del perfil: framing incremental con chunks de 37 bytes,
decode de cabecera/MTI/bitmap, encode conservando el cuerpo opaco y comparacion
byte a byte del frame completo. **218/218 identicos**, fin de stream sin residuo.
La salida `artifacts/pcap-evidence.json` contiene solo metadatos, UUID/UTC y hashes.
Actualizar la evidencia de la app requiere revisar y copiar esa salida sanitizada;
abrir la app no lee PCAPs ni depende de tshark.

Pruebas versionadas con datos sinteticos: prefijo partido, cuerpo fragmentado,
mensajes concatenados, limite/desbordamiento BE16, longitud invalida, fin de
fuente incompleto, cabecera/MTI/bitmap no soportado y bytes no ASCII. Las fixtures
sinteticas prueban estructura; no son golden samples de saldo/retiro/reverso.

## TODO-DATA y validaciones solicitadas/registradas

Los roles actuales de SmartVista, Mediator y cajeros, puertos 16100/49212 y
ambiente QA fueron confirmados despues por el usuario. Esto no valida el
encapsulado de esos PCAP. La revision preliminar de sus streams, incluidos los
solapamientos y perfiles incompletos, queda registrada en
[evidencia de red](../implementation/SWITCH_NETWORK_EVIDENCE.md).

- **PCAP-LINK-PROFILES**: ambiente QA/PREPROD, roles de cada endpoint, perfil y
  diccionario para los enlaces binarios/otros formatos (entre ellos puertos 16100,
  49212, 10200, 16214 y 49206/49208). El nombre Visa/Externa de un archivo no
  identifica su contrato. Falta explicacion de los solapamientos distintos.
- **PCAP-CASE-MAPPING**: identificar por captura los casos de saldo/retiro,
  originales/reversos, resultado esperado y STAN/RRN/UTRNNO aprobados. No se
  presume rechazo por el nombre FondoInsuficientes ni se empareja por posicion.
- **ISO-SPEC**: ContextoISO.xml/diccionario ATM con longitudes, variantes LLVAR,
  encoding, campos obligatorios y reglas dinamicas. Bloquea construir/modificar
  campos, leer F3/F39/F90/PAN/PIN/Track2 y sanitizar RAW/HEX para mostrarlo.
- **ENVIRONMENT**: autorizacion y TLS/timeout por endpoint. Una direccion
  observada en PCAP no autoriza envio ni hereda el ambiente PREPROD de la BD.
- **GOLDEN-SAMPLES / CMS-ATM-MAPPING / CMS-REVERSAL**: fixtures por flujo,
  mapeo a CMS, eco/cambio de identificadores, duplicados, timeout y late response.

El encapsulado offline queda implementado. Los cinco flujos MVP y el envio real
permanecen BLOCKED; no se cambia el catalogo CMS 301000/302000 por deducciones
del nombre de archivo ni por datos opacos.
