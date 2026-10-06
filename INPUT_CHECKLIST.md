# Checklist de informacion por subir

## P0 - Bloqueante para primer flujo real

- [ ] `ContextoISO.xml`.
- [ ] Especificacion ISO ATM Coonecta.
- [ ] Trama consulta saldo request/response aprobada.
- [ ] PCAP consulta saldo.
- [ ] Trama retiro aprobado request/response.
- [ ] PCAP retiro aprobado.
- [ ] Trama retiro rechazado request/response.
- [ ] Trama reverso request/response + original.
- [ ] PCAP reverso.
- [ ] Evidencia timeout + reverso.
- [ ] Host/puerto QA por escenario.
- [ ] Host/puerto PREPROD por escenario.
- [ ] Regla VLI/header/encoding.
- [ ] Timeout oficial por escenario.
- [ ] Al menos un ATM QA completo.
- [ ] Al menos una tarjeta QA funcional.

## P1 - Necesario para completar MVP

- [ ] Listado de entidades Coonecta.
- [ ] FRONT/BACK/EXTERNAS.
- [ ] BIN ranges.
- [ ] Catalogo ATM QA.
- [ ] Catalogo tarjetas QA.
- [ ] Response codes.
- [ ] Reglas PIN Block/HSM de TEST.
- [ ] SQL/vistas SmartVista de consulta read-only.
- [ ] Ejemplo de transaccion localizada en SmartVista.
- [ ] Core de cada entidad.
- [ ] Metodo de acceso Core.
- [ ] Query/API de correlacion Core.

## P1 - Hardware

- [ ] OMNIKEY 5422 conectado.
- [ ] Nombre PC/SC del reader.
- [ ] Driver/version.
- [ ] ATR/ATS de tarjeta de prueba.
- [ ] Evidencia de lectura disponible.

## P2 - Carga/estres

- [ ] TPS permitido QA.
- [ ] TPS permitido PREPROD.
- [ ] Max conexiones.
- [ ] Ventanas autorizadas.
- [ ] Limites de Switch.
- [ ] Limites de Core.
- [ ] Politica de parada por error.

## Mock BANRED

Subir preferentemente como ZIP o archivos sueltos:
- [ ] Manual_Mock_BANRED_SVFE_BASE24.docx
- [ ] mock_banred_tcp.py
- [ ] mock_banred_tcp_V1.0_4946.py
- [ ] mock_banred_tcp_8007_falla.py
