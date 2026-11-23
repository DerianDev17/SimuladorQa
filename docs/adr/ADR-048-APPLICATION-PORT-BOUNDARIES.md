# ADR-048: Puertos de aplicación y controles compartidos de dependencias

Fecha: 2026-11-23. Estado: implementado.

## Contexto

DesktopApplication recibía la clase SendConfigurationService, incluyendo su
identidad de tipo ligada a miembros privados y su operación de inicialización,
aunque solo consumía lectura y guardado. La inspección ATM repetía un contrato
de lectura local. Los adaptadores de exportación importaban sus interfaces
desde el archivo del servicio, y el lector de historial se definía en su servicio.
Las listas de módulos protegidos por ESLint y las pruebas de arquitectura habían
divergido: historial y exportación tenían pruebas, pero carecían de la misma
cobertura en lint; configuración y recuperación no estaban incluidas.

## Decisión

- Definir SendConfigurationPort con read/save e implementarlo explícitamente en
  SendConfigurationService. DesktopApplication depende del puerto y la inspección
  ATM recibe Pick<SendConfigurationPort, 'read'>. El arranque conserva
  initializeDocumentedQa sobre el servicio concreto que compone.
- Separar TransactionHistoryReader en transaction-history-port.ts. El diario
  SQLite declara que implementa este puerto además de BalanceJournal; los
  consumidores de historial no adquieren permisos de escritura.
- Separar LoadExportSink y ExportSaveDialog en load-export-ports.ts. Servicio,
  adaptador de archivos y diálogo Electron importan contratos independientes.
- Compartir la lista de módulos Main protegidos y clases concretas prohibidas
  mediante tooling/architecture-boundaries.json, leído por ESLint y las pruebas
  AST. Agregar aplicación, configuración, inspección, historial, recuperación y
  sus puertos a la protección existente. Rechazar también imports nativos sin
  prefijo node: y clases concretas referenciadas con extensión explícita.
- Mantener las pruebas AST para imports de tipos, reexports, require e imports
  dinámicos, y comprobar que los adaptadores de exportación e historial no
  dependan de servicios de aplicación.

El diagrama vigente está en [ARCHITECTURE](../../ARCHITECTURE.md). Esta decisión
amplía ADR-032, ADR-033, ADR-041 y ADR-047; no sustituye sus contratos funcionales.

## Compatibilidad y alcance

No cambia IPC, validación, auditoría, plazos, serialización, clasificación de
errores, persistencia ni reglas financieras. No se añaden dependencias externas.
Los tipos internos de exportación e historial se importan ahora desde sus
archivos de puertos; no se mantienen reexports desde los servicios para evitar
reintroducir esa dirección de dependencia.

La lista de protección es explícita. Las fachadas financieras y proveedores QA
que componen adaptadores conservan su alcance actual; esta decisión no declara
que todos los archivos de Main sean servicios independientes de infraestructura.
No se requiere nueva evidencia ISO/ATM/Core para cambiar estos límites de código.
Los TODO-DATA existentes conservan sus bloqueos específicos.

## Validación

La prueba de aplicación inyecta un puerto con solo read/save, sin instancia ni
herencia del servicio. Verifica lectura/guardado, rechazo de entradas antes de
delegar, dependencia ausente, errores protegidos, TIMEOUT sin reintento y lectura
posterior a un fallo. La prueba de lint verifica cada módulo del registro con
imports prohibidos y acepta puertos, dominio y reloj monotónico.

La regresión del módulo reutiliza integración de configuración en archivo,
inspección ATM, historial SQLite, recuperación y exportación local con errores y
timeout. Se ejecutan lint, TypeScript strict, unitarias, integración, formato,
chequeo de secretos y build. Estas pruebas no certifican resultados en host QA.
