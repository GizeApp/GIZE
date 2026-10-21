#!/usr/bin/env python3
"""Firma de la app de iPhone para la App Store, en la Mac de GitHub (.github/workflows/ios.yml).

Por qué existe: la firma «en la nube» de Xcode dejaba la app sin sello de tiempo y App Store
Connect la rechazaba (error 90035 «Invalid Signature»). Acá se firma como siempre se firmó para
la App Store, con un certificado de distribución propio creado en cada ejecución:

  python3 scripts/ios-firma.py crear   → certificado + perfil de App Store, instalados en la Mac
  python3 scripts/ios-firma.py borrar  → al final, siempre: revoca los certificados de desarrollo que
                                         Xcode creó en esta ejecución y, SOLO si no se llegó a subir
                                         nada, también el de distribución y su perfil

El certificado de distribución NO se revoca después de subir: Apple revisa la firma de la versión
recién en la revisión de la App Store, y si el certificado ya está revocado la rechaza con el mismo
90035 «Invalid Signature» (pasó con 1.0.0 (59): se subió, se procesó en TestFlight y la rechazaron
en la revisión). El workflow deja $RUNNER_TEMP/ios-firma-subida justo antes de mandar la versión;
sin ese archivo (falló antes de subir) el certificado no firmó nada que tenga Apple y se revoca.

Apple pone un tope a los certificados de distribución de la cuenta (2 o 3). Si «crear» choca con el
tope, revoca el más viejo de los que creó CI (los que cuelgan de un perfil «GIZE App Store CI
<ejecución>») y borra sus perfiles, de a uno, siempre dejando el más nuevo de CI (firmó la última
versión, que puede estar en revisión). Los certificados que no creó CI no se tocan nunca.

La clave privada se genera en la Mac en cada ejecución y nunca sale de ahí. Usa la clave de la API
de App Store Connect (rol Admin) y no imprime datos de la cuenta (solo cantidades).

Variables de entorno: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (el .p8), BUNDLE_ID, RUN_ID,
RUNNER_TEMP, GITHUB_ENV.
"""
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error

API = "https://api.appstoreconnect.apple.com/v1"
TMP = os.environ["RUNNER_TEMP"]
STATE = os.path.join(TMP, "ios-firma.json")
KEYCHAIN = os.path.join(TMP, "firma.keychain-db")
# Lo crea el workflow justo antes de subir la versión a App Store Connect (ver «borrar»).
SUBIDA = os.path.join(TMP, "ios-firma-subida")


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def firma_cruda(der):
    # openssl da la firma ECDSA en DER (SEQUENCE con los enteros r y s); JWT pide r||s, 32 bytes cada uno.
    if der[0] != 0x30 or der[1] >= 0x80:
        sys.exit("openssl devolvió una firma con un formato inesperado")
    i, out = 2, b""
    for _ in range(2):
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b"\0").rjust(32, b"\0")
        i += 2 + n
    return out


def token():
    # JWT ES256 firmado con openssl, sin paquetes de PyPI: así no corre código bajado en el
    # momento al lado de la clave de App Store Connect.
    now = int(time.time())
    head = {"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}
    body = {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}
    msg = ".".join(b64url(json.dumps(x, separators=(",", ":")).encode()) for x in (head, body))
    der = sh("openssl", "dgst", "-sha256", "-sign", os.environ["ASC_KEY_PATH"], input=msg.encode(), capture_output=True).stdout
    return msg + "." + b64url(firma_cruda(der))


def api(method, path, body=None, tolerar=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code == tolerar:
            return None
        # Solo el código y el detalle del error de Apple (no trae datos de la cuenta).
        try:
            errs = json.loads(e.read()).get("errors", [])
            detail = "; ".join(x.get("detail") or x.get("title", "") for x in errs)
        except Exception:
            detail = ""
        sys.exit(f"App Store Connect respondió {e.code} en {method} {path.split('?')[0]}: {detail}")


def sh(*args, **kw):
    # Si algo falla se muestra solo qué herramienta fue, sin los argumentos (llevan contraseñas
    # de un solo uso y rutas de la clave).
    try:
        return subprocess.run(args, check=True, **kw)
    except subprocess.CalledProcessError as e:
        sys.exit(f"Falló «{' '.join(args[:2])}» (código {e.returncode})")


DEV_TYPES = ("DEVELOPMENT", "IOS_DEVELOPMENT")
DIST_TYPES = ("DISTRIBUTION", "IOS_DISTRIBUTION")
PERFIL_CI = "GIZE App Store CI "


def dev_certs():
    # Certificados de desarrollo de la cuenta (solo los ids).
    data = api("GET", "/certificates?limit=200&fields[certificates]=certificateType")["data"]
    return [c["id"] for c in data if c["attributes"].get("certificateType") in DEV_TYPES]


def certs_ci():
    # Certificados de distribución que creó CI, del más viejo al más nuevo: [(id, [perfiles])].
    # Se reconocen por el perfil que les arma «crear» («GIZE App Store CI <ejecución>», con ese
    # único certificado). Un certificado sin un perfil así no es de CI y no se toca.
    certs = api("GET", "/certificates?limit=200&fields[certificates]=certificateType,expirationDate")["data"]
    dist = {c["id"]: c["attributes"].get("expirationDate") or "" for c in certs
            if c["attributes"].get("certificateType") in DIST_TYPES}
    perfiles = api("GET", "/profiles?filter[profileType]=IOS_APP_STORE&limit=200"
                          "&fields[profiles]=name,certificates&include=certificates")["data"]
    ci = {}
    for p in perfiles:
        ligados = ((p.get("relationships") or {}).get("certificates") or {}).get("data") or []
        m = re.fullmatch(re.escape(PERFIL_CI) + r"(\d+)", p["attributes"].get("name") or "")
        if m and len(ligados) == 1 and ligados[0]["id"] in dist:
            run = int(m.group(1))
            prev = ci.get(ligados[0]["id"], (run, []))
            ci[ligados[0]["id"]] = (max(prev[0], run), prev[1] + [p["id"]])
    # Apple les pone vencimiento a un año de creados: el que vence antes es el más viejo.
    return [(c, ci[c][1]) for c in sorted(ci, key=lambda c: (dist[c], ci[c][0]))]


def pedir_certificado(csr_txt):
    body = {"data": {"type": "certificates", "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_txt}}}
    revocados = 0
    while True:
        cert = api("POST", "/certificates", body, tolerar=409)
        if cert:
            break
        # Apple no deja crear otro (tope de certificados de distribución de la cuenta): se revoca el
        # más viejo de CI y se prueba de nuevo. Nunca el más nuevo de CI (firmó la última versión,
        # que puede estar en revisión: revocarlo la invalida) ni uno que no sea de CI.
        ci = certs_ci()
        if len(ci) < 2:
            sys.exit("Apple no deja crear otro certificado de distribución (tope de la cuenta) y no queda "
                     "ninguno viejo de CI para revocar: hay que revocar uno a mano en developer.apple.com")
        viejo, perfiles = ci[0]
        for p in perfiles:
            api("DELETE", "/profiles/" + p)
        api("DELETE", "/certificates/" + viejo)
        revocados += 1
    if revocados:
        print(f"Tope de certificados de distribución: se revocaron {revocados} viejo(s) de CI (y sus perfiles).")
    return cert["data"]


def crear():
    run = os.environ.get("RUN_ID", str(int(time.time())))
    # El archivo se arma con firma automática y Xcode crea un certificado de desarrollo nuevo en
    # cada Mac de GitHub que nunca se borraba: la cuenta llegaba al máximo de Apple y la firma
    # fallaba. Se anotan los que ya había para que «borrar» revoque solo los creados acá.
    # 1) Clave privada y pedido de certificado, generados acá.
    key, csr = os.path.join(TMP, "dist.key"), os.path.join(TMP, "dist.csr")
    sh("openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", csr,
       "-subj", "/CN=GIZE CI/O=GIZE/C=AR", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(csr) as f:
        csr_txt = f.read()
    cert = pedir_certificado(csr_txt)
    state = {"cert": cert["id"], "dev_before": dev_certs()}
    with open(STATE, "w") as f:
        json.dump(state, f)
    der = os.path.join(TMP, "dist.cer")
    with open(der, "wb") as f:
        f.write(base64.b64decode(cert["attributes"]["certificateContent"]))

    # 2) Llavero propio con la clave y el certificado.
    pem, p12 = os.path.join(TMP, "dist.pem"), os.path.join(TMP, "dist.p12")
    sh("openssl", "x509", "-inform", "DER", "-in", der, "-out", pem)
    pw = base64.b16encode(os.urandom(12)).decode()
    # Cifrado y MAC «clásicos» (3DES/SHA-1): el llavero de macOS no lee los .p12 que OpenSSL 3
    # arma por defecto (AES/SHA-256) y responde «MAC verification failed».
    sh("openssl", "pkcs12", "-export", "-inkey", key, "-in", pem, "-out", p12, "-passout", "pass:" + pw,
       "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1",
       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    kpw = base64.b16encode(os.urandom(12)).decode()
    sh("security", "create-keychain", "-p", kpw, KEYCHAIN)
    sh("security", "set-keychain-settings", "-lut", "21600", KEYCHAIN)
    sh("security", "unlock-keychain", "-p", kpw, KEYCHAIN)
    sh("security", "import", p12, "-k", KEYCHAIN, "-P", pw, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security",
       stdout=subprocess.DEVNULL)
    sh("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", kpw, KEYCHAIN,
       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    current = subprocess.run(["security", "list-keychains", "-d", "user"], capture_output=True, text=True).stdout.split()
    sh("security", "list-keychains", "-d", "user", "-s", KEYCHAIN, *[c.strip('"') for c in current])
    for p in (key, p12, pem):
        os.remove(p)

    # 3) Perfil de App Store para el bundle (no necesita iPhones registrados).
    bid = os.environ["BUNDLE_ID"]
    found = api("GET", f"/bundleIds?filter[identifier]={bid}&filter[platform]=IOS&limit=5")["data"]
    found = [b for b in found if b["attributes"]["identifier"] == bid]
    if not found:
        sys.exit(f"No está registrado el Bundle ID {bid} en developer.apple.com")
    name = f"GIZE App Store CI {run}"
    prof = api("POST", "/profiles", {"data": {"type": "profiles", "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": found[0]["id"]}},
                          "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]}}}})["data"]
    state["profile"] = prof["id"]
    with open(STATE, "w") as f:
        json.dump(state, f)
    content = base64.b64decode(prof["attributes"]["profileContent"])
    uuid = prof["attributes"]["uuid"]
    for d in ("~/Library/MobileDevice/Provisioning Profiles", "~/Library/Developer/Xcode/UserData/Provisioning Profiles"):
        d = os.path.expanduser(d)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, uuid + ".mobileprovision"), "wb") as f:
            f.write(content)
    with open(os.environ["GITHUB_ENV"], "a") as f:
        f.write(f"IOS_PROFILE_NAME={name}\n")
    print("Certificado de distribución y perfil de App Store listos.")


def borrar():
    if not os.path.exists(STATE):
        return
    with open(STATE) as f:
        state = json.load(f)
    if os.path.exists(SUBIDA):
        # La versión ya salió para Apple firmada con este certificado: revocarlo hace que la
        # rechacen en la revisión (90035 «Invalid Signature»). Queda, con su perfil; el próximo
        # «crear» revoca los viejos de CI si se llega al tope.
        if state.get("cert"):
            print("Se subió la versión: el certificado de distribución y su perfil quedan (revocarlos invalida la versión en revisión).")
    else:
        # Falló antes de subir: el certificado no firmó nada que tenga Apple.
        if state.get("profile"):
            api("DELETE", "/profiles/" + state["profile"])
        if state.get("cert"):
            api("DELETE", "/certificates/" + state["cert"])
            print("No se subió nada: certificado de distribución revocado y perfil borrado.")
    # Certificados de desarrollo que creó Xcode durante esta ejecución (no los que ya estaban).
    if "dev_before" in state:
        nuevos = [c for c in dev_certs() if c not in set(state["dev_before"])]
        for c in nuevos:
            api("DELETE", "/certificates/" + c)
        if nuevos:
            print(f"Certificados de desarrollo de esta ejecución revocados: {len(nuevos)}.")
    subprocess.run(["security", "delete-keychain", KEYCHAIN], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    {"crear": crear, "borrar": borrar}[sys.argv[1]]()
