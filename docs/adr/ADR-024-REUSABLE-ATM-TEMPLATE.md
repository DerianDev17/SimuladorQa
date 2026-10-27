# ADR-024: ATM20521 como plantilla de envío reutilizable

Fecha: 2026-10-27.

## Decisión y fuente

El usuario indica que ATM20521 es la plantilla funcional y que crear otro ATM
debe permitir enviarlo sin implementar otro perfil ISO ni aportar una fecha
contable por terminal, porque la contabilidad se administra en el switch.
Esta instrucción sustituye la exigencia anterior de aprovisionamiento manual
individual descrita en ADR-023 y MULTI_ATM_PROFILES para la misma entidad/ruta QA.

Main resuelve en cada operación el catálogo activo y el perfil privado existente.
Un ATM QA de la entidad 205 sin perfil específico hereda ATM20521. Un perfil
específico existente conserva prioridad. No se crean archivos privados por ATM,
no se copian claves y no se requiere reiniciar para usar un registro recién creado.

## Configuración heredada e identidad

Se heredan endpoint, cabecera, extensión, formato PIN, referencia DPAPI, AID/BIN,
parámetros EMV y campos ISO comunes. UUID/revisión/Terminal ID se toman del
registro seleccionado. F41 continúa usando el codec existente. F32 usa el
Acquirer ID del catálogo con la codificación ISOBASEI ya implementada: longitud
binaria y BCD, con cero inicial para número impar de dígitos. Crear preselecciona
entidad/adquirente de ATM20521; clonar conserva entidad y adquirente y deja alias
y Terminal ID vacíos. La validación de ejecución exige identidad compatible.

Los derivados consumen el mismo pool persistente de la estación, por la referencia
del perfil origen y bajo el bloqueo de archivo existente. No duplican reservas
ni necesitan rangos nuevos por ATM. El agotamiento detiene el envío; no se inventa
un rollover ni se reutilizan secuencias. Esto no añade coordinación distribuida.

El contrato de retiro también se hereda: montos y política PIN/EMV permanecen
iguales. Su huella se verifica contra el origen antes de proyectarla al derivado.
Revocación, cambio de clave/perfil, cambio de destino o catálogo durante una
operación impiden el envío pendiente. El contexto se revalida antes de TCP.
Cada operación sigue generando PIN/EMV nuevos; no se heredan criptogramas.

## Fecha del mensaje y contabilidad

No hay formulario ni consulta SQL de fecha contable por ATM. Se mantiene F15
con el valor de la plantilla funcional, sin sustituirlo por la fecha del PC ni
suprimirlo del bitmap. La nueva instrucción no especifica un cambio de wire y
no se inventa uno. La UI lo identifica como «Fecha ISO enviada (F15)», no como
la fecha contable efectiva del switch. F7/F12/F13 y fecha EMV siguen generándose
por operación conforme a la zona de la plantilla. La contabilidad y admisión
del Terminal ID siguen correspondiendo al switch.

## Límites y validación

Alcance heredado: QA, entidad 205, enlace de la plantilla, LOCAL/ahorros y
operaciones ya soportadas. PREPROD, otras entidades y concurrencia entre
tarjetas no se habilitan por esta decisión. La creación local no registra
automáticamente un cajero en el switch ni demuestra su aprobación financiera.

Pruebas unitarias de entrada inválida, cambios/revocación, cancelación y fallo
de dependencias; integración con SQLite real, consumo persistente y reinicio;
saldo/retiro por TCP local alternando ATM20521 → ATM20524 → ATM20521, creando
el segundo después del arranque sin otro perfil privado. E2E verifica crear
con adquirente heredado y que Main resuelva la plantilla sin reiniciar. Usa
datos sintéticos; no transmite transacciones al entorno QA.
