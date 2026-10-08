# Definicion ATM Coonecta ISOBASEI

## Fuente recibida y alcance

El usuario aporta ISOBASEI.bin el 2026-10-08 desde
Y:/ExtremePCI/ConfigFiles/ISOBASEI.bin. La configuracion aportada de SWATM01
referencia este nombre mediante ISO8583MsgFormat / PKT_VISA; el archivo se
inspecciona en lectura, sin modificar el servidor, cargar DLL ni enviar tramas.
No se ejecutan instrucciones contenidas en archivos aportados.

La fuente tiene 23030 bytes y SHA-256
c9e90739f0e14109869304e469d4bab43eec4cbdf97c76320022097cf0a05d39.
Su firma es EXTISO y la descripcion AlexSoft VISA BASE I Ver 3.0.0. Dos textos
de fecha locales son 2023/04/25 08:27:02 y 2023/11/14 16:19:33; no se les
asigna zona horaria ni se convierten a timestamps UTC. La auditoria de la
inspeccion registra UUID y fecha UTC por separado.

Tambien se inspeccionan estaticamente los metadatos/IL de
Y:/ExtremePCI/DotNet/ISO8583MsgFormat.dll, SHA-256
c5e328c18061f1b94cd14c3ea475bfeadda0f5c5ef224edf05be5d75268ac673.
El modulo declara _ISOFIELD size=120, _ISODEFFILEHEADER size=262 y los
contenedores _ISOHEADERFIELDS, _ISOFIELDS, _ISOTRANNAMES, _ISOTRANDEFS y
_ISOTRANWAITS. Sus tipos nativos no exponen offsets de miembros; el layout
se contrasta con conteos repetidos, nombres/identificadores y consumo exacto
del archivo. Iso8583.GetStrType contiene un switch que permite verificar las
etiquetas de encoding: 1 ASCII, 2 EBCDIC, 3 BINARY, 4 BCD, 5 BINBITMAP,
6 VLENISO y 7 VLENHEAD, entre otras. No se llama a la DLL ni a sus servicios.

## Estructura comprobada

Numeros de estructura en little endian; esta propiedad corresponde al archivo
de definicion, no define byte order de VLI o prefijos del enlace TCP.

| Seccion | Offset inicial | Cantidad | Ancho de registro |
| --- | --- | --- | --- |
| Header del archivo, incluye definicion MTI | 0 | 1 | 262 |
| Campos de cabecera, precedidos por count u16 | 262 | 12 | 120 |
| Posiciones ISO, precedidas por count u16 | 1704 | 128 | 120 |
| Nombres MTI, precedidos por count u16 | 17066 | 27 | 82 |
| Pares de definicion MTI/campo, precedidos por count u16 | 19282 | 863 | 4 |
| Pares de espera MTI/campo, precedidos por count u16 | 22736 | 73 | 4 |

Los cinco conteos coinciden con los del header en offsets 128-136. Las secciones
terminan exactamente en 23030. Los registros de campo contienen identificador,
codigo de encoding, parametro de longitud, codigo de atributo, byte de padding
y nombre. Defaults y bytes adicionales del registro se excluyen de los reportes.
Dos palabras del header en offsets 138/140 se conservan como no interpretadas;
no se afirma que se haya validado un checksum del proveedor.

La posicion 0 describe BITMAP y la 1 esta vacia. Las posiciones 2-127 tienen
identificador y nombre concordantes. Los MTI se almacenan como enteros; por
ejemplo 200 se proyecta como 0200. Todos los pares referencian MTI presentes y
campos 2-127, sin duplicados. No se interpreta que cada par sea un campo
obligatorio ni que los pares de espera definan el timeout o una regla de eco.

## Campos utiles para el cliente ATM

| Elemento | Encoding verificado | Parametro de longitud | Codigo de atributo |
| --- | --- | --- | --- |
| MTI | BCD | 4 | 0 |
| F2 PAN | BCD | 19 | 1 |
| F3 procesamiento | BCD | 6 | 0 |
| F4 monto | BCD | 12 | 0 |
| F7 fecha/hora | BCD | 10 | 0 |
| F11 STAN | BCD | 6 | 0 |
| F35 Track 2 | BCD | 37 | 1 |
| F37 referencia | EBCDIC | 12 | 0 |
| F39 respuesta | EBCDIC | 2 | 0 |
| F41 terminal | EBCDIC | 8 | 0 |
| F49 moneda | BCD | 3 | 0 |
| F52 PIN | BINARY | 8 | 0 |
| F55 | BINARY | 255 | 1 |
| F70 gestion de red | BCD | 3 | 0 |
| F102 cuenta | EBCDIC | 28 | 1 |

Estas son propiedades del archivo; no se convierten parametros a bytes del
wire ni atributo 1 a LLVar/LLLVar sin validar el contrato del formatter.
La tabla no autoriza crear PIN Block, escoger cuenta, actualizar EMV o inferir
que cambiar un BIN dirigira la operacion a CB 205. Los defaults no se publican.

La cabecera incluye VHLEN (VLENHEAD), VHFORMAT, VHTEXTFORMAT, VHTOTLEN
(VLENISO), VHDESID, VHSRCID, VHROUNDTRIP, VHBASEIFLAGS, VHMSGSTSFLAGS,
VHBATCHNUMBER, VHRESERVED y VHUSERINFO. BITMAP declara BINBITMAP con parametro
24; esto no implica que todos los mensajes del wire tengan bitmap de 24 bytes.

## Diferencias con BANRED y validacion pendiente

ContextoISO.xml de BANRED tiene MTI/bitmap textual y F41 de longitud 16;
ISOBASEI declara BCD/BINBITMAP y F41 EBCDIC de parametro 8. Ademas F52 declara
16 en el XML y 8/BINARY en ISOBASEI, y F102 tiene limites 99 y 28 respectivamente.
Las representaciones y perfiles se mantienen separados. No se corrige uno
copiando reglas del otro ni se mezcla el mock servidor 4946 con PKT_VISA/16100.

Actualizacion 2026-10-08: la nueva captura CB aporta consulta y retiro con
request/response tanto en 16100 como en 49212. Cabecera, bitmap primario,
prefijos y longitudes se verificaron para la consulta. CapturedVisaBalance
reconstruye el request y proyecta solo metadatos seguros. La prueba desde PC
obtuvo 0210/F39 91 y llegada confirmada por el usuario hasta Mediator.
Ver [alcance exacto y error del procesador](CB_205_BALANCE_SAMPLE.md).

TODO-DATA acotados:

- ISOBASEI-WIRE: confirmar unidades, padding de nibbles, prefijos de campos
  variables, tabla EBCDIC y cabecera/bitmap mediante formatter o capturas
  pareadas. Ya se recibio y leyo el diccionario binario; no se pide de nuevo.
- CB-DYNAMIC-REQUEST: muestra CB 205 / PID 82052 recibida; faltan reglas
  dinamicas para crear un request nuevo. La muestra USD 20 de PID 82032 sigue
  fuera del alcance CB. No se trasladan defaults de una muestra a otra entidad.
- SWITCH-ATM-ACCESS: rechazo historico de 10.10.10.21 confirmado; el 2026-10-08
  la PC ya recibe 0800 / codigo 071 y los logs confirman PID 80131 autorizado.
  Consulta desde PC comprobada hasta Mediator; falta coexistencia con el
  balanceador en sesiones prolongadas. Ver `VISA_NETWORK_MANAGEMENT.md` para el
  layout acotado observado y la politica de respuesta pendiente.

## Implementacion y verificacion

ExtisoDefinitionInspector es un inspector puro fuera del Renderer. Comprueba
firma/version recibida, limites, conteos, identidades, referencias y ausencia
de bytes residuales. Devuelve solo nombres/parametros y pares, sin defaults,
mensajes transaccionales, socket o generacion ISO. Los errores son codigos
estables que no incluyen contenido de la fuente.

Herramienta offline:

```powershell
node tooling/inspect-extiso.mjs source.bin artifacts/isobasei-definition-review.json
```

La herramienta lee de forma acotada, no sobrescribe la fuente, restringe reportes
a artifacts y limpia el buffer al finalizar. Produce UUID, UTC y SHA-256.
La ejecucion sobre el archivo recibido consume sus 23030 bytes y registra
12/128/27/863/73 elementos. Originales y reportes quedan privados/ignorados;
no se commitea el BIN, la DLL o un volcado de sus defaults.

Pruebas con fuente sintetica: lectura valida, privacidad de defaults,
truncamiento, exceso/residuo, version no soportada, conteos inconsistentes,
encoding/identidad/referencias invalidas y nombres no permitidos. Integracion
del CLI con archivo local, dependencia no disponible y destino fuera de
artifacts. Esto verifica inspeccion; no demuestra comunicacion o aprobacion.
