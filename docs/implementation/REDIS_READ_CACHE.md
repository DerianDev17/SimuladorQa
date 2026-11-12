# Caché Redis local de consultas

Implementado el 2026-11-12 por solicitud del usuario. Redis es opcional:
la aplicación consulta las fuentes habituales si Redis está ausente, falla
o no responde. Decisión y límites en [ADR-045](../adr/ADR-045-OPTIONAL-REDIS-READ-CACHE.md).

## Datos y vigencia

| Consulta | TTL | Invalidación |
| --- | --- | --- |
| Catálogo administrativo para UI: entidades, ATM, casos y auditoría pública | 30 s | Antes y después de cualquier comando de catálogo; cambio de ambiente |
| Feed público de Mediator: entidad 205/canal 1 y límite solicitado | 2 s | Caducidad, cambio de ambiente y comandos de catálogo |

La elección se basa en los consumidores del catálogo y el polling del feed,
no en estadísticas de uso medidas. Inicio conserva su polling de cinco segundos;
el TTL reutiliza consultas próximas sin saltarse el siguiente sondeo normal.
`queriedAt` conserva el instante de consulta al origen, incluso en un acierto.
Una modificación externa directa de SQLite puede tardar hasta 30 segundos en
aparecer en las lecturas de presentación.

Las revisiones de perfiles, diagnóstico ATM y autorizaciones financieras siguen
leyendo el catálogo original. Quedan fuera los mensajes completos de sesión,
historiales financieros, estado del lector/TCP, secretos, PIN/EMV y planes de
envío. Las proyecciones públicas mantienen sus máscaras existentes.

## Ejecución local opcional

Main intenta conectarse a `127.0.0.1:6379` cuando se consulta por primera vez uno
de estos datos. No se instala ni inicia un servidor con `npm start`.
Si Docker Desktop está disponible, desde la raíz del proyecto:

```powershell
docker compose -f compose.redis.yaml up -d
npm run build
npm start
```

El contenedor publica únicamente loopback, desactiva persistencia en disco y
limita la caché a 32 MB con expulsión de entradas. Para detenerlo:

```powershell
docker compose -f compose.redis.yaml down
```

También se puede usar un Redis local existente. Para un puerto diferente:

```powershell
$env:SIMULATOR_REDIS_PORT = '6380'
npm start
```

Para desactivar la conexión por completo en esa sesión de PowerShell:

```powershell
$env:SIMULATOR_REDIS_CACHE = 'off'
npm start
```

Solo se acepta un puerto entero entre 1 y 65535; un valor inválido desactiva
la caché. No hay configuración de host remoto ni se entregan parámetros Redis
al Renderer. Las opciones requieren reiniciar Main.

## Fallos y aislamiento

Cada acceso Redis tiene un plazo total de 150 ms, incluida la conexión si hace
falta. Tras un fallo se cierra el cliente y se omite Redis durante 30 segundos;
la siguiente consulta permite recuperar la conexión. No hay cola offline ni
temporizadores de reconexión. La espera de la fuente original no se modifica.
Los fallos del origen se devuelven con sus errores habituales y no se cachean.

Las consultas idénticas en curso comparten carga. Una escritura o cambio de
ambiente cambia la generación de claves; una lectura antigua no puede repoblar
la nueva generación. Las entradas anteriores caducan por TTL: no se ejecuta
`FLUSHDB`, `FLUSHALL` ni eliminación de datos de otras aplicaciones.

Cada instancia utiliza un UUID independiente y verifica integridad/expiración
de las entradas con HMAC y una clave efímera de Main. Contenido alterado,
intercambiado entre consultas, inválido o mayor a 1 MiB se trata como ausencia.
Cerrar la aplicación destruye la conexión y borra esa clave. No se registran
contenidos, errores privados ni credenciales del servicio.

## Verificación

Las pruebas cubren caducidad, concurrencia, invalidación, errores, conexión
ausente/lenta, cierre y entradas corruptas. La integración usa SQLite real,
Mediator sintético y el cliente oficial Redis conectado a una fixture RESP
por TCP loopback; no representa una prueba con un servidor Redis desplegado.
En esta estación Docker estaba detenido y WSL devolvió `0x80070569`, por lo
que no se pudo verificar un servicio Redis real durante la implementación.

```powershell
npx vitest run tests/unit/redis-read-cache.test.ts tests/integration/cached-desktop-queries.test.ts tests/integration/redis-read-cache.test.ts
```
