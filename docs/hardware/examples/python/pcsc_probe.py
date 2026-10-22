"""Diagnóstico PC/SC de nivel A: lectores y ATR; no transmite APDU."""

from __future__ import annotations

import sys

from smartcard.Exceptions import CardConnectionException
from smartcard.System import readers


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Uso: pcsc_probe.py [nombre exacto del lector]", file=sys.stderr)
        return 2

    try:
        available = {str(reader): reader for reader in readers()}
    except Exception:
        print("PC/SC no está disponible.", file=sys.stderr)
        return 1

    if len(argv) == 1:
        print("Lectores disponibles:")
        for name in available:
            print(f"- {name}")
        return 0

    name = argv[1]
    reader = available.get(name)
    if reader is None:
        print("El lector indicado no está disponible.", file=sys.stderr)
        return 1

    try:
        with reader.createConnection() as connection:
            connection.connect()
            atr = connection.getATR()
            print(f"Lector: {name}")
            print("ATR:", "".join(f"{byte:02X}" for byte in atr))
    except CardConnectionException:
        print("No se pudo conectar con una tarjeta presente.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
