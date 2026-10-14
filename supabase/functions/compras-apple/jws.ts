// Verificación de lo que firma el App Store (función compras-apple): las compras de StoreKit 2
// (Transaction.jwsRepresentation) y los avisos de App Store Server Notifications V2 vienen como
// JWS (texto «cabecera.datos.firma»). Está aparte de index.ts para probarlo sin Deno
// (tests/compras-apple.test.mjs). Usa solo WebCrypto (Deno y Node lo traen): nada de paquetes.
//
// Qué se controla, igual que la librería oficial de Apple (app-store-server-library):
//   · la cabecera dice alg ES256 y trae en x5c la cadena de tres certificados (hoja, intermedio y
//     raíz), y la raíz es EXACTAMENTE la de Apple que fijamos (raiz-apple.ts);
//   · cada certificado está firmado por el siguiente (ECDSA), el intermedio es una autoridad (CA) y
//     cada uno es de quien dice (el emisor de uno es el sujeto del siguiente);
//   · la hoja y el intermedio tienen las marcas de Apple para las compras (OID_HOJA, OID_INTERMEDIO):
//     otro certificado emitido por Apple (el de un desarrollador cualquiera) no sirve;
//   · los tres estaban vigentes en la fecha en que Apple firmó (signedDate);
//   · la firma ES256 de «cabecera.datos» es de la hoja.
// No se consulta la revocación en línea (OCSP) de los certificados de Apple: la librería de Apple
// también lo deja opcional.

export const OID_HOJA = "1.2.840.113635.100.6.11.1";
export const OID_INTERMEDIO = "1.2.840.113635.100.6.2.1";

const CURVAS: Record<string, { nombre: string; largo: number }> = {
  "1.2.840.10045.3.1.7": { nombre: "P-256", largo: 32 },
  "1.3.132.0.34": { nombre: "P-384", largo: 48 },
};
const HASHES: Record<string, string> = {
  "1.2.840.10045.4.3.2": "SHA-256", // ecdsa-with-SHA256
  "1.2.840.10045.4.3.3": "SHA-384", // ecdsa-with-SHA384
};
const OID_CLAVE_EC = "1.2.840.10045.2.1";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";

// Error de verificación: el motivo va a los registros (nunca el JWS entero).
export class JWSInvalido extends Error {}
const mal = (m: string): never => { throw new JWSInvalido(m); };

// ---- base64 ----
export function deBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function deBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) mal("base64url inválido");
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return deBase64(b + "===".slice((b.length + 3) % 4));
}
export function pemADer(pem: string): Uint8Array {
  const m = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(pem);
  if (!m) mal("PEM inválido");
  return deBase64(m![1].replace(/\s+/g, ""));
}
const texto = (b: Uint8Array) => new TextDecoder().decode(b);
export function iguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ---- DER (lo justo para leer un certificado X.509) ----
type Nodo = { tag: number; ini: number; val: number; fin: number };
function nodo(buf: Uint8Array, pos: number, hasta = buf.length): Nodo {
  if (pos + 2 > hasta) mal("DER cortado");
  const tag = buf[pos];
  if ((tag & 0x1f) === 0x1f) mal("DER con etiqueta larga");
  let len = buf[pos + 1], p = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 3) mal("DER con largo inválido");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  const fin = p + len;
  if (fin > hasta) mal("DER cortado");
  return { tag, ini: pos, val: p, fin };
}
function hijos(buf: Uint8Array, n: Nodo): Nodo[] {
  const out: Nodo[] = [];
  let p = n.val;
  while (p < n.fin) { const h = nodo(buf, p, n.fin); out.push(h); p = h.fin; }
  return out;
}
const valor = (buf: Uint8Array, n: Nodo) => buf.subarray(n.val, n.fin);
const entero = (buf: Uint8Array, n: Nodo) => buf.subarray(n.ini, n.fin);
function oid(v: Uint8Array): string {
  if (!v.length) mal("OID vacío");
  const partes = [Math.floor(v[0] / 40), v[0] % 40];
  let x = 0;
  for (let i = 1; i < v.length; i++) {
    x = x * 128 + (v[i] & 0x7f);
    if (!(v[i] & 0x80)) { partes.push(x); x = 0; }
  }
  return partes.join(".");
}
function fecha(buf: Uint8Array, n: Nodo): number {
  const s = texto(valor(buf, n));
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s)
    : n.tag === 0x18 ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : null;
  if (!m) mal("fecha del certificado inválida");
  let anio = Number(m![1]);
  if (n.tag === 0x17) anio += anio < 50 ? 2000 : 1900;
  return Date.UTC(anio, Number(m![2]) - 1, Number(m![3]), Number(m![4]), Number(m![5]), Number(m![6]));
}

export type Certificado = {
  der: Uint8Array;
  tbs: Uint8Array;          // la parte firmada
  algFirma: string;         // OID del algoritmo con que lo firmó su emisor
  firma: Uint8Array;        // firma ECDSA (DER)
  emisor: Uint8Array;       // nombre del emisor (DER)
  sujeto: Uint8Array;       // nombre del sujeto (DER)
  desde: number;
  hasta: number;
  spki: Uint8Array;         // clave pública (SubjectPublicKeyInfo, DER)
  curva: string;            // OID de la curva de su clave
  extensiones: Set<string>; // OIDs de sus extensiones
  esCA: boolean;
};

export function leerCertificado(der: Uint8Array): Certificado {
  const raiz = nodo(der, 0);
  if (raiz.tag !== 0x30 || raiz.fin !== der.length) mal("no es un certificado");
  const [tbsN, algN, firmaN] = hijos(der, raiz);
  if (!tbsN || !algN || !firmaN || tbsN.tag !== 0x30 || firmaN.tag !== 0x03) mal("certificado incompleto");
  const t = hijos(der, tbsN);
  let i = t[0] && t[0].tag === 0xa0 ? 1 : 0; // versión
  i += 2; // número de serie y algoritmo
  const [emisorN, validezN, sujetoN, spkiN] = [t[i], t[i + 1], t[i + 2], t[i + 3]];
  if (!spkiN) mal("certificado incompleto");
  const [desdeN, hastaN] = hijos(der, validezN);
  const [algClaveN] = hijos(der, spkiN);
  const algClave = hijos(der, algClaveN);
  if (oid(valor(der, algClave[0])) !== OID_CLAVE_EC || !algClave[1]) mal("la clave no es de curva elíptica");
  const extensiones = new Set<string>();
  let esCA = false;
  for (const n of t.slice(i + 4)) {
    if (n.tag !== 0xa3) continue;
    for (const e of hijos(der, hijos(der, n)[0])) {
      const p = hijos(der, e);
      const id = oid(valor(der, p[0]));
      extensiones.add(id);
      if (id === OID_BASIC_CONSTRAINTS) {
        const v = valor(der, p[p.length - 1]);
        const bc = hijos(v, nodo(v, 0));
        esCA = !!bc[0] && bc[0].tag === 0x01 && v[bc[0].val] !== 0;
      }
    }
  }
  const bits = valor(der, firmaN);
  if (bits[0] !== 0) mal("firma con bits sueltos");
  return {
    der, tbs: entero(der, tbsN), algFirma: oid(valor(der, hijos(der, algN)[0])), firma: bits.subarray(1),
    emisor: entero(der, emisorN), sujeto: entero(der, sujetoN),
    desde: fecha(der, desdeN), hasta: fecha(der, hastaN),
    spki: entero(der, spkiN), curva: oid(valor(der, algClave[1])), extensiones, esCA,
  };
}

// Firma ECDSA de un certificado (DER: SEQUENCE { r INTEGER, s INTEGER }) al formato de WebCrypto
// (r y s seguidos, cada uno del largo de la curva).
function derACrudo(firma: Uint8Array, largo: number): Uint8Array {
  const s = nodo(firma, 0);
  if (s.tag !== 0x30 || s.fin !== firma.length) mal("firma del certificado inválida");
  const [r, ss] = hijos(firma, s);
  const out = new Uint8Array(largo * 2);
  [r, ss].forEach((n, k) => {
    if (!n || n.tag !== 0x02) mal("firma del certificado inválida");
    let v = valor(firma, n);
    while (v.length > largo && v[0] === 0) v = v.subarray(1);
    if (v.length > largo) mal("firma del certificado inválida");
    out.set(v, k * largo + largo - v.length);
  });
  return out;
}

async function clave(c: Certificado): Promise<CryptoKey> {
  const curva = CURVAS[c.curva] || mal("curva no admitida");
  return await crypto.subtle.importKey("spki", c.spki, { name: "ECDSA", namedCurve: curva.nombre }, false, ["verify"]);
}

// ¿El certificado c lo firmó emisor?
export async function firmadoPor(c: Certificado, emisor: Certificado): Promise<boolean> {
  const hash = HASHES[c.algFirma];
  const curva = CURVAS[emisor.curva];
  if (!hash || !curva || !iguales(c.emisor, emisor.sujeto)) return false;
  try {
    return await crypto.subtle.verify({ name: "ECDSA", hash }, await clave(emisor), derACrudo(c.firma, curva.largo), c.tbs);
  } catch {
    return false;
  }
}

// Verifica un JWS del App Store contra la raíz `raiz` (DER) y devuelve sus datos. Si algo no
// cierra, tira JWSInvalido.
export async function verificarJWS(jws: unknown, raiz: Uint8Array): Promise<Record<string, any>> {
  if (typeof jws !== "string" || jws.length > 16000) mal("no es un JWS");
  const partes = (jws as string).split(".");
  if (partes.length !== 3) mal("no es un JWS");
  let cab: any, datos: any;
  try {
    cab = JSON.parse(texto(deBase64Url(partes[0])));
    datos = JSON.parse(texto(deBase64Url(partes[1])));
  } catch (e) {
    if (e instanceof JWSInvalido) throw e;
    mal("JWS ilegible");
  }
  if (!cab || cab.alg !== "ES256") mal("algoritmo no admitido");
  if (!Array.isArray(cab.x5c) || cab.x5c.length !== 3 || !cab.x5c.every((c: unknown) => typeof c === "string")) mal("sin la cadena de certificados");
  if (!datos || typeof datos !== "object") mal("JWS sin datos");
  let cadena: Certificado[] = [];
  try {
    cadena = cab.x5c.map((c: string) => leerCertificado(deBase64(c)));
  } catch (e) {
    if (e instanceof JWSInvalido) throw e;
    mal("certificado ilegible");
  }
  const [hoja, intermedio, cima] = cadena;
  if (!iguales(cima.der, raiz)) mal("la cadena no termina en la raíz de Apple");
  if (!intermedio.esCA) mal("el intermedio no es una autoridad");
  if (!hoja.extensiones.has(OID_HOJA) || !intermedio.extensiones.has(OID_INTERMEDIO)) mal("no son certificados de compras de Apple");
  if (!(await firmadoPor(intermedio, cima))) mal("el intermedio no lo firmó la raíz");
  if (!(await firmadoPor(hoja, intermedio))) mal("la hoja no la firmó el intermedio");
  // Vigentes cuando Apple firmó (como la librería de Apple sin consultas en línea).
  const cuando = Number(datos.signedDate) || Date.now();
  for (const c of cadena) if (cuando < c.desde || cuando > c.hasta) mal("certificado fuera de fecha");
  if (CURVAS[hoja.curva]?.nombre !== "P-256") mal("la hoja no es P-256");
  const firma = deBase64Url(partes[2]);
  if (firma.length !== 64) mal("firma de largo inválido");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await clave(hoja), firma,
    new TextEncoder().encode(partes[0] + "." + partes[1]));
  if (!ok) mal("firma inválida");
  return datos;
}
