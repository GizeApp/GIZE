#!/usr/bin/env python3
# Chequeo de invariantes de seguridad de GIZE. Lo corre .github/workflows/seguridad.yml en
# cada PR y una vez por semana. Es estático y de solo lectura (no toca la base ni necesita
# secrets). Si algo falla, sale con código 1 y el check de GitHub queda en rojo.
#
# Qué verifica (lo que la auditoría de octubre 2026 dejó como invariante):
#   1. Toda función SECURITY DEFINER en supabase/*.sql fija search_path (anti-secuestro).
#   2. No hay claves service_role, claves "secret" ni private keys commiteadas (la anon es pública y se permite).
#   3. Ninguna política RLS usa `using (true)` / `with check (true)`.
#   4. Todas las acciones de GitHub (`uses:`) están pineadas a un commit SHA.
#   5. Ningún workflow usa el trigger peligroso `pull_request_target`.
#   6. Los tres puntos de entrada (index.html, app/index.html, admin/index.html) tienen CSP.
#
# Correr a mano:  python3 scripts/chequeo-seguridad.py

import base64
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

fallos = []
def fallo(check, detalle):
    fallos.append((check, detalle))

SKIP_DIRS = ("node_modules/", "vendor/", ".git/", "www/")
def archivos(patron):
    for f in glob.glob(patron, recursive=True):
        if not any(s in f.replace("\\", "/") for s in SKIP_DIRS):
            yield f

# ---- 1) SECURITY DEFINER sin search_path ----
def check_security_definer():
    # Se captura el ENCABEZADO completo (desde "create ... function" hasta "as $...$", donde
    # arranca el cuerpo): todos los modificadores (returns, language, security definer,
    # set search_path) van ahí, en cualquier orden. Cortar en "language" dejaba afuera un
    # "security definer" escrito después y no verificaba nada.
    malas = []
    hdr_re = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+(?P<hdr>.*?)\bas\s*\$", re.I | re.S)
    for f in archivos("supabase/**/*.sql"):
        s = open(f, encoding="utf-8", errors="replace").read()
        for m in hdr_re.finditer(s):
            hdr = m.group("hdr")
            nm = re.match(r"\s*([^\s(]+)", hdr)
            if re.search(r"security\s+definer", hdr, re.I) and not re.search(r"set\s+search_path", hdr, re.I):
                malas.append(f + " :: " + (nm.group(1) if nm else "?"))
    if malas:
        fallo("SECURITY DEFINER sin search_path", "\n   ".join(malas))

# ---- 2) Secretos commiteados ----
def jwt_role(tok):
    try:
        payload = tok.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        return data.get("role")
    except Exception:
        return None

def check_secretos():
    encontrados = []
    pem = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")
    sb_secret = re.compile(r"\bsb_secret_[A-Za-z0-9_-]{20,}")
    sk_live = re.compile(r"\bsk_live_[0-9A-Za-z]{10,}")
    jwt = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
    for f in archivos("**/*"):
        if os.path.isdir(f):
            continue
        if f.replace("\\", "/").endswith("scripts/chequeo-seguridad.py"):
            continue  # este archivo nombra los patrones a propósito
        try:
            s = open(f, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        if pem.search(s):
            encontrados.append(f + " :: private key")
        if sb_secret.search(s):
            encontrados.append(f + " :: clave sb_secret_")
        if sk_live.search(s):
            encontrados.append(f + " :: clave sk_live_")
        for tok in jwt.findall(s):
            if jwt_role(tok) == "service_role":
                encontrados.append(f + " :: JWT service_role")
    if encontrados:
        fallo("Secretos commiteados", "\n   ".join(sorted(set(encontrados))))

# ---- 3) RLS abierta ----
def check_rls_abierta():
    malas = []
    for f in archivos("supabase/**/*.sql"):
        for i, ln in enumerate(open(f, encoding="utf-8", errors="replace"), 1):
            if re.search(r"(using|with\s+check)\s*\(\s*true\s*\)", ln, re.I):
                malas.append("%s:%d" % (f, i))
    if malas:
        fallo("Política RLS abierta (using/with check (true))", "\n   ".join(malas))

# ---- 4) Acciones no pineadas a SHA ----
def check_acciones_pineadas():
    malas = []
    for f in archivos(".github/workflows/*.yml"):
        for i, ln in enumerate(open(f, encoding="utf-8", errors="replace"), 1):
            m = re.search(r"\buses:\s*([^\s#]+)", ln)
            if not m:
                continue
            ref = m.group(1)
            if ref.startswith("./") or ref.startswith("docker://"):
                continue
            if "@" not in ref or not re.fullmatch(r"[0-9a-f]{40}", ref.split("@", 1)[1]):
                malas.append("%s:%d  %s" % (f, i, ref))
    if malas:
        fallo("Accion de GitHub sin pinear a SHA", "\n   ".join(malas))

# ---- 5) pull_request_target ----
def check_pr_target():
    # Solo el trigger real (clave YAML), no la palabra en un comentario: se saca lo que va
    # después de un '#' en cada línea antes de buscar.
    malas = []
    for f in archivos(".github/workflows/*.yml"):
        for ln in open(f, encoding="utf-8", errors="replace"):
            sin_comentario = ln.split("#", 1)[0]
            if re.match(r"\s*pull_request_target\s*:", sin_comentario):
                malas.append(f)
                break
    if malas:
        fallo("Trigger pull_request_target (riesgo de pwn request)", "\n   ".join(malas))

# ---- 6) CSP en los puntos de entrada ----
def check_csp():
    faltan = []
    for f in ("index.html", "app/index.html", "admin/index.html"):
        if not os.path.exists(f):
            continue
        if "Content-Security-Policy" not in open(f, encoding="utf-8", errors="replace").read():
            faltan.append(f)
    if faltan:
        fallo("Falta Content-Security-Policy", "\n   ".join(faltan))

for fn in (check_security_definer, check_secretos, check_rls_abierta,
           check_acciones_pineadas, check_pr_target, check_csp):
    fn()

if fallos:
    print("CHEQUEO DE SEGURIDAD: FALLÓ\n")
    for check, detalle in fallos:
        print("✗ " + check + "\n   " + detalle + "\n")
    sys.exit(1)

print("CHEQUEO DE SEGURIDAD: OK — todas las invariantes se cumplen.")
