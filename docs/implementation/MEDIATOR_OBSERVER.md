# Consulta de Mediator PREPROD

Historial permite consultar transacciones externas y la estructura protegida de
sus mensajes. No son ejecuciones del simulador ni resultados PASS/FAIL.

## Fuente y comportamiento

El usuario aporto el 2026-10-07 la consulta usada en QA: `MDT_Journal` unido a
`MDT_Message` por `jnlTraceId = msgTraceId`, con entidad 205, canal 1, fechas
inclusivas y orden descendente por TraceId. El esquema inspeccionado confirma
`msgRequest` y `msgResponse` de tipo XML y ambas claves bigint como PK.
Los filtros comentados no se interpretan como reglas obligatorias.

La pantalla inicia con entidad 205, canal 1 y la ventana exacta aportada:
`2026-09-29 00:00:07.803` a `2026-09-29 23:00:07.803`. Permite cambiar entidad,
canal, fechas y limite (1 a 100); terminal exacto, TrnCode de seis digitos,
secuencia bigint y RetCode son opcionales. No se consulta por cuenta ni PAN.
Una ventana de hasta 24 horas es un limite tecnico de esta entrega, no una regla
financiera del proveedor. No hay polling automatico.

SQL usa proyeccion explicita, parametros tipados y TOP limite + 1 para indicar
si hay mas resultados. `jnlRealDate` ya es datetime; el filtro no aplica CONVERT
a la columna. Conserva BETWEEN inclusivo y NOLOCK solamente en Journal, como
la consulta del usuario. La vista advierte sobre lecturas sin confirmar.
Los IDs externos cruzan JSON como strings. Terminal se presenta sin espacios
finales y vacio como ausente. Los timestamps SQL se conservan sin convertir zona;
solo queryId y queriedAt locales usan UUID y UTC.

## Conexion local

Windows: Electron Main inicia un proceso PowerShell oculto con .NET SqlClient.
El Renderer recibe solo resultados proyectados y protegidos. No recibe servidor,
usuario, credencial, SQL ni XML crudo. La configuracion no se solicita por IPC.

Archivo privado `mediator-observer.json` en el directorio userData de Electron:

```json
{
  "environment": "PREPROD",
  "server": "tcp:servidor-preprod,puerto",
  "database": "Mediator",
  "credentialFile": "C:\\ruta-privada\\sqlserver.credential.xml"
}
```

La credencial es un PSCredential protegido por Windows con Export-Clixml e
Import-Clixml bajo el mismo usuario/equipo. No incluir password en JSON ni Git.
Solo se admite PREPROD y la base Mediator. Un administrador debe proporcionar
una cuenta con SELECT sobre ambas tablas y un endpoint PREPROD autorizado.
El guard rechaza db_owner/sysadmin y permisos de escritura/administracion
visibles en la base o tablas observadas. ApplicationIntent=ReadOnly es solo
una pista de enrutamiento, no una restriccion de permisos.

Encrypt=true y TrustServerCertificate=false son obligatorios. No hay fallback
ni opcion de omitir validacion en la configuracion. La excepcion de ADR-006
continua limitada a la inspeccion anterior de metadatos.

La prueba segura del 2026-10-07 con la credencial local existente recibio
TLS_ERROR. El servidor respondio, pero no se autentico ni se leyeron registros.
La inspeccion anterior identifico db_owner: falta reemplazar esa credencial por
una cuenta de lectura antes de utilizar este observador.

## Proteccion y disponibilidad

Se omiten PAN, cuentas y otros datos sensibles del Journal. XML se limita en SQL
y se procesa fuera de Electron. Se conserva solo la estructura documentada
ExtremeMsg/ExtremeMsgReply, Header/Data/FxTable y HField/DField, con nombres
de campos de la revision CMS. Todos los valores se sustituyen por PROTEGIDO;
elementos desconocidos se convierten a Campo. No se publican atributos libres,
namespaces, comentarios, instrucciones de procesamiento ni CDATA original.
DTD prohibido, resolver externo deshabilitado y limites de caracteres, nodos,
profundidad y salida. Main verifica una gramatica cerrada antes de devolverla.
No es una copia completa de la trama ni un parser ISO.

Conexion y comandos tienen timeout de cinco segundos y locks de tres;
el proceso completo tiene limite de quince segundos y salida maxima de 4 MB.
Solo una consulta simultanea. Cerrar Electron termina el proceso. Los errores
del driver no se muestran ni registran. Un cambio de ambiente invalida incluso
una respuesta tardia despues de PREPROD -> QA -> PREPROD. Editar filtros o salir
de Historial descarta datos; no se persisten mensajes.

## TODO-DATA

- MEDIATOR-OBSERVER-ACCESS: cuenta de lectura y TLS con CA/nombre confiables.
- MEDIATOR-SQL-TIMEZONE: confirmar zona/formato antes de correlacion temporal UTC.
- MEDIATOR-MESSAGE-PROJECTION: aprobar allowlist de valores XML visibles;
  actualmente todos los valores estan protegidos.
- MEDIATOR-JOURNAL-CORRELATION: falta relacion con STAN/RRN/UTRNNO, runId y
  transactionId, clasificacion de resultados y originales/reversos.
- MEDIATOR-ENTITY-CHANNEL: entidad 205/canal 1 son filtros aportados, no un mapeo
  aprobado para todos los ATM o ambientes.

## Verificacion

Unit: filtros, calendario, limites, bigint, inyeccion y contrato protegido.
Integration: ambiente real persistido, proveedor ausente/error/timeout,
concurrencia, respuestas tardias; PowerShell/.NET reales para redaccion adversarial,
SQL parametrizado sin ejecutar y proceso indisponible/timeout/cierre.
E2E: acceso QA bloqueado, filtros PREPROD, validacion, error de configuracion y
limpieza de contexto. No se fabrica una conexion exitosa ni se certifica el
SELECT con datos reales mientras TLS/cuenta permanezcan pendientes.
