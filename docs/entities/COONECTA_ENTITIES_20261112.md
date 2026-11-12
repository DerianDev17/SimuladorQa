# Entidades Coonecta: fuente del 2026-11-12

Listado suministrado por el usuario: **88 filas y 74 entidades**. Las filas ADQ/EMI
se agrupan por código; la clasificación conserva todos los valores de la fuente.
Confirmación del usuario: mantener códigos como **205** (8205 → 205) y asignar
**312 a CACECH**. La red administrativa es COONECTA, independiente de la clasificación.

Correspondencias: FRONTEND AUT → FRONT; BACKEND → BACK; SWITCH EXTERNO → EXTERNA;
HIBRIDA → HÍBRIDA. El usuario solicita conservar las clasificaciones múltiples
con **Validación pendiente**: Tulcán (200), Mushuc Runa (207) y Pablo Muñoz Vega (232).

Hay **64 entidades con FRONT, 4 con BACK, 8 con EXTERNA y 1 con HÍBRIDA**.
Los grupos se superponen: tres entidades tienen dos clasificaciones.
Códigos/nombres distintos del listado no se fusionan por semejanza.

Fuente: archivo adjunto del usuario, Texto pegado.txt.
SHA-256: `0ba42ba6391087d9945dec476c9fdcbb66c2fedb169021ed4581ba11d142bd41`.
Las líneas permiten contrastar con el adjunto. Esta transcripción omite PID,
IP y puerto; no modifica conexiones, rutas financieras ni asociaciones ATM.
La importación es explícita: ver [guía](../implementation/LOCAL_CATALOGS.md#importación-explícita-de-entidades)
y [ADR-043](../adr/ADR-043-COONECTA-ENTITY-CLASSIFICATION.md).

## Aplicación local

Carga aplicada el 2026-11-12 a las 19:40 UTC: **73 altas y una actualización**,
sin eliminaciones. La entidad 205 conserva su UUID y las asociaciones de
ATM20521 y ATM20524; ambas filas ATM quedaron intactas. CACECH se guardó como
312/EXTERNA. Lectura independiente desde Electron: 74 entidades, esquema 4,
integridad SQLite correcta y ninguna violación de claves foráneas.

Antes de la carga se creó un respaldo SQLite junto a la base del usuario.
El reporte local `artifacts/coonecta-entities-20261112-applied.json` registra
su ubicación y los cambios confirmados; la inspección está en
`artifacts/entities-electron-inspection.json`. No hubo operaciones financieras.

## Listado

| Código | Entidad | Clasificación del listado | Estado | Líneas fuente |
| --- | --- | --- | --- | --- |
| 200 | Cooperativa Tulcán | FRONT + EXTERNA | Validación pendiente | 2, 3, 81 |
| 201 | Cooperativa Cooprogreso | EXTERNA | Según listado | 4, 5 |
| 203 | Cooperativa Riobamba | FRONT | Según listado | 25 |
| 204 | Cooperativa San José de Chimbo | FRONT | Según listado | 26 |
| 205 | Cooperativa Cacpe Biblian | FRONT | Según listado | 27 |
| 207 | Cooperativa Mushuc Runa | FRONT + HÍBRIDA | Validación pendiente | 6, 82 |
| 208 | Cooperativa Cacpe Pastaza | FRONT | Según listado | 28 |
| 209 | Cooperativa Cacpeco | BACK | Según listado | 7, 8 |
| 212 | Cooperativa Coopad | FRONT | Según listado | 29 |
| 217 | Cooperativa Cacpe Gualaquiza | FRONT | Según listado | 30 |
| 218 | Cooperativa San Miguel de los Bancos | FRONT | Según listado | 31 |
| 219 | Cooperativa La Benefica | FRONT | Según listado | 32 |
| 220 | Cooperativa Calceta | FRONT | Según listado | 33 |
| 221 | Cooperativa Zamora | FRONT | Según listado | 34 |
| 226 | Cooperativa La Merced | BACK | Según listado | 9, 10 |
| 227 | Cooperativa Guaranda | FRONT | Según listado | 35 |
| 229 | Cooperativa 9 de Octubre | FRONT | Según listado | 36 |
| 231 | Cooperativa Once de Junio | FRONT | Según listado | 37 |
| 232 | Cooperativa Pablo Muñoz Vega | FRONT + EXTERNA | Validación pendiente | 1, 38 |
| 233 | Cooperativa Santa Ana | FRONT | Según listado | 39 |
| 234 | Cooperativa San Antonio de los Rios | FRONT | Según listado | 40 |
| 235 | Cooperativa Yantzaza | FRONT | Según listado | 41 |
| 236 | Cooperativa Cacmu | FRONT | Según listado | 42 |
| 239 | Cooperativa 4 de Octubre | FRONT | Según listado | 43 |
| 242 | Cooperativa 15 de Abril | BACK | Según listado | 11, 12 |
| 243 | Cooperativa Pedro Moncayo | FRONT | Según listado | 44 |
| 244 | Cooperativa Crea | BACK | Según listado | 13, 14 |
| 245 | Cooperativa Fortuna | FRONT | Según listado | 45 |
| 251 | Cooperativa Coopac Austro | FRONT | Según listado | 46 |
| 254 | Cooperativa Futuro Lamanense | FRONT | Según listado | 47 |
| 255 | Cooperativa Nueva Huancavilca | FRONT | Según listado | 48 |
| 256 | Cooperativa Padre Julian Lorente | FRONT | Según listado | 49 |
| 257 | Cooperativa San Francisco | FRONT | Según listado | 50 |
| 260 | Cooperativa Erco | FRONT | Según listado | 51 |
| 261 | Cooperativa Lucha Campesina | FRONT | Según listado | 52 |
| 263 | Cooperativa Chibuleo | EXTERNA | Según listado | 15, 16 |
| 267 | Cooperativa Alfonso Jaramillo | FRONT | Según listado | 53 |
| 273 | Cooperativa Antorcha | FRONT | Según listado | 54 |
| 275 | Cooperativa Sierra Centro | FRONT | Según listado | 55 |
| 277 | Cooperativa Educadores de Zamora | FRONT | Según listado | 56 |
| 278 | Cooperativa Cacpe Loja | FRONT | Según listado | 57 |
| 279 | Cooperativa Multiempresarial | FRONT | Según listado | 58 |
| 282 | Cooperativa Kullki Wasi | FRONT | Según listado | 59 |
| 283 | Mutualista Ambato | FRONT | Según listado | 60 |
| 286 | Cooperativa San Isidro | FRONT | Según listado | 61 |
| 287 | Cooperativa Tena | EXTERNA | Según listado | 17, 18 |
| 288 | Cooperativa Maquita Cushunchic | FRONT | Según listado | 62 |
| 289 | Cooperativa Santa Isabel | FRONT | Según listado | 63 |
| 290 | Mutualista Azuay | EXTERNA | Según listado | 19, 20 |
| 291 | Cooperativa Coca | FRONT | Según listado | 64 |
| 292 | Cooperativa Andina | FRONT | Según listado | 65 |
| 293 | Cooperativa Luz del Valle | FRONT | Según listado | 66 |
| 294 | Cooperativa Virgen del Cisne | FRONT | Según listado | 67 |
| 295 | Banco D-Miro | FRONT | Según listado | 68 |
| 296 | Cooperativa San Francisco de Asis | FRONT | Según listado | 69 |
| 297 | Cooperativa San Antonio de Ibarra | FRONT | Según listado | 70 |
| 299 | Cooperativa Salinas de Guaranda | FRONT | Según listado | 71 |
| 301 | Banco Vision Fund | FRONT | Según listado | 72 |
| 302 | Banco del Litoral | FRONT | Según listado | 73 |
| 303 | Cooperativa Provida | FRONT | Según listado | 74 |
| 304 | Banco Capital | FRONT | Según listado | 75 |
| 305 | Banco Finca | FRONT | Según listado | 76 |
| 306 | Mutualista Imbabura | FRONT | Según listado | 77 |
| 307 | Cooperativa Corporación Centro | FRONT | Según listado | 78 |
| 308 | Cooperativa Chone | FRONT | Según listado | 79 |
| 309 | Cooperativa Caspmeg | EXTERNA | Según listado | 21, 22 |
| 311 | Cooperativa Comercio | FRONT | Según listado | 80 |
| 312 | CACECH | EXTERNA | Según listado | 23, 24 |
| 313 | Cooperativa Yuyay | FRONT | Según listado | 83 |
| 314 | COACMES | FRONT | Según listado | 84 |
| 315 | COOP JPM | FRONT | Según listado | 85 |
| 316 | COOP MAQUITA CUSHUN | FRONT | Según listado | 86 |
| 317 | COOP SANTA ROSA | FRONT | Según listado | 87 |
| 318 | COOP LA DOLOROSA | FRONT | Según listado | 88 |
