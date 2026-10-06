# Flujo transaccional

1. Usuario selecciona ambiente.
2. Selecciona perfil ATM.
3. Selecciona/lee tarjeta.
4. Transaction Engine valida compatibilidad del escenario.
5. Builder genera campos dinamicos.
6. ISO8583 Engine serializa trama.
7. TCP Engine aplica VLI/header/framing.
8. Se envia al endpoint configurado.
9. TCP Engine recibe respuesta.
10. Parser decodifica ISO8583.
11. Validator compara request/response.
12. Switch Observer intenta correlacionar en SmartVista.
13. Core Adapter intenta correlacionar en Core.
14. Metrics Engine publica resultado.
15. Realtime Agent envia metricas al Control Plane.
16. Se persiste evidencia sanitizada.

Ver `transaction_flow.png`.
