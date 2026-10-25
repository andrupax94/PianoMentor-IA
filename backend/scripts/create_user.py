# description: Alta manual de usuarios con contraseña (U-005): hash PBKDF2 y color de burbuja.
# context: El registro simple queda para después; este script es el único camino
# hoy para crear cuentas con contraseña (por ejemplo, la cuenta admin). Se
# ejecuta desde la raíz: python backend/scripts/create_user.py --email ... --password ...

"""Crea o actualiza un usuario manual con contraseña y color de burbuja (U-005).

Uso:
    python backend/scripts/create_user.py --email yo@gmail.com --password XXX --name Nombre

La contraseña se guarda con hash unidireccional (PBKDF2-SHA256 + sal;
`piano_mentor.passwords.hash_password`); nunca en claro. Si ya existe una
cuenta con ese correo (por ejemplo por Google), solo le fija la contraseña y
el nombre; si no existe, crea la fila con `google_sub = manual:<email>` y un
`bubble_color` aleatorio. Es idempotente: repetirlo solo rota la contraseña.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ejecutable desde la raíz sin PYTHONPATH: el paquete vive en backend/src.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from piano_mentor.database import open_db, upsert_manual_user
from piano_mentor.passwords import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Correo del usuario (cuenta admin, por ejemplo)")
    parser.add_argument("--password", required=True, help="Contraseña en claro; se guarda solo su hash")
    parser.add_argument("--name", default=None, help="Nombre visible; opcional")
    args = parser.parse_args()

    with open_db() as conn:
        row = upsert_manual_user(
            conn,
            {
                "email": args.email,
                "name": args.name,
                "password_hash": hash_password(args.password),
            },
        )

    name = row["name"] or "(sin nombre)"
    anonymous_password = "sí" if row["password_hash"] else "no"
    print(f"Usuario dado de alta: {row['email']} ({name})")
    print(f"  google_sub: {row['google_sub']}")
    print(f"  color de burbuja: {row['bubble_color'] or '(sin asignar)'}")
    print(f"  contraseña: {anonymous_password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
