#!/usr/bin/env python3
"""Actualiza los registros A de Vercel con la IP pública actual del portátil.

Configuración en /etc/pm-ddns.env (root, 0600):

    VERCEL_TOKEN=...
    VERCEL_DOMAIN=pianomentoria.com
    VERCEL_RECORDS=@,www,api
    VERCEL_TTL=60

Solo usa la biblioteca estándar: no hace falta instalar nada.
"""

import json
import sys
import urllib.error
import urllib.request

API = "https://api.vercel.com"
ENV_PATH = "/etc/pm-ddns.env"


def load_env(path: str) -> dict[str, str]:
    cfg: dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                cfg[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        sys.exit(f"No existe {path}")
    return cfg


def public_ip() -> str:
    for url in ("https://api.ipify.org", "https://ifconfig.me/ip"):
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                ip = resp.read().decode().strip()
            if ip:
                return ip
        except Exception:
            continue
    raise RuntimeError("No se pudo obtener la IP pública")


def api(method: str, path: str, token: str, body: dict | None = None, team: str = "") -> dict:
    if team:
        sep = "&" if "?" in path else "?"
        path = f"{path}{sep}teamId={team}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw else {}


def label_of(name: str, domain: str) -> str:
    """Normaliza el nombre de un registro: el apex puede llegar vacío, con @,
    con el dominio completo o con el dominio y un punto final."""
    name = (name or "").strip().rstrip(".")
    if name in ("", "@", domain):
        return "@"
    suffix = "." + domain
    if name.endswith(suffix):
        return name[: -len(suffix)]
    return name


def main() -> int:
    cfg = load_env(ENV_PATH)
    token = cfg.get("VERCEL_TOKEN", "")
    domain = cfg.get("VERCEL_DOMAIN", "")
    if not token or not domain:
        sys.exit("Faltan VERCEL_TOKEN o VERCEL_DOMAIN en /etc/pm-ddns.env")

    wanted = {x.strip() for x in cfg.get("VERCEL_RECORDS", "@,www,api").split(",") if x.strip()}
    ttl = int(cfg.get("VERCEL_TTL", "60"))

    ip = public_ip()
    team = cfg.get("VERCEL_TEAM_ID", "").strip()
    payload = api("GET", f"/v5/domains/{domain}/records?limit=100", token, team=team)
    records = payload.get("records", [])

    changed = 0
    matched = 0
    seen: list[str] = []
    for rec in records:
        rtype = rec.get("recordType") or rec.get("type")
        if rtype != "A":
            continue
        label = label_of(rec.get("name", ""), domain)
        seen.append(label)
        if label not in wanted:
            continue
        matched += 1
        if rec.get("value") == ip:
            continue
        api("PATCH", f"/v1/domains/records/{rec['id']}", token, {"value": ip, "ttl": ttl}, team=team)
        print(f"actualizado {label} -> {ip}")
        changed += 1

    if matched == 0:
        print(f"AVISO: ningun registro A coincide con {','.join(sorted(wanted))}")
        print(f"Registros A vistos: {','.join(sorted(seen)) or '(ninguno)'}")
        return 1

    if changed == 0:
        print(f"sin cambios ({ip})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode(errors="replace")[:300]
        sys.exit(f"Error HTTP {exc.code} de Vercel: {detalle}")
    except Exception as exc:  # noqa: BLE001 - el log de systemd debe ver el motivo
        sys.exit(f"Error: {exc}")
