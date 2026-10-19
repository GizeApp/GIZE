// Raíz de los certificados de Apple con los que el App Store firma las compras (StoreKit 2) y los
// avisos de App Store Server Notifications V2: «Apple Root CA - G3». Es un certificado PÚBLICO (no
// es un secreto): lo publica Apple para que cualquiera pueda verificar sus firmas.
//
//   Bajado de:     https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
//   Huella SHA-256 (la que publica Apple en su lista de raíces de confianza,
//   https://support.apple.com/en-us/102666, fila «Apple Root CA - G3»):
//     63 34 3A BF B8 9A 6A 03 EB B5 7E 9B 3F 5F A7 BE 7C 4F 5C 75 6F 30 17 B3 A8 C4 88 C3 65 3E 91 79
//   Vence el 30 de abril de 2039.
//
// La función compras-apple solo acepta firmas cuya cadena termine exactamente en este certificado,
// y antes de usarlo controla que su huella sea la de arriba (si alguien lo cambia por error, no
// acepta ninguna compra). No se puede cambiar con un secret ni con una variable de entorno: las
// pruebas (tests/compras-apple.test.mjs) usan una raíz de prueba reemplazando este archivo al
// cargar la función en Node, sin tocar el código que se publica.

export const RAIZ_APPLE_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

export const RAIZ_APPLE_G3 = `
-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;
