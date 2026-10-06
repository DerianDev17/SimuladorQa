# Card Reader Agent

## Mision
Integrar HID OMNIKEY 5422 mediante PC/SC en Windows.

## Reglas
1. Detectar readers disponibles y cambios de estado.
2. Detectar insercion/acercamiento y retiro de tarjeta.
3. Exponer ATR/ATS y datos permitidos por la tarjeta.
4. Nunca asumir que el lector provee banda magnetica.
5. Complementar datos no disponibles con `CardProfile` configurado.
6. PAN siempre enmascarado en UI y logs por defecto.
7. Diseñar una interfaz `CardReaderAdapter` para permitir otros lectores futuros.
8. Implementar modo simulacion para CI sin hardware fisico.
