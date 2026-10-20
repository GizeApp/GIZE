// Ancho y alto de un JPEG, leídos de su cabecera (el marcador SOF), sin decodificar la imagen.
// Con eso se calcula cuánto puede costar antes de mandarla. Si no es un JPEG o la cabecera no se
// entiende, devuelve null (la función contesta «foto_invalida» y no llama a la API).
export function jpegTamano(b: Uint8Array): { ancho: number; alto: number } | null {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8 || b[2] !== 0xFF) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; } // relleno entre marcadores
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; } // marcadores sin largo
    if (m === 0xD9 || m === 0xDA) return null; // terminó o empezó la imagen sin decir el tamaño
    const largo = (b[i + 2] << 8) | b[i + 3];
    if (largo < 2 || i + 2 + largo > b.length) return null;
    // SOF0 a SOF15, salvo DHT (C4), JPG (C8) y DAC (CC), que no son de tamaño.
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      if (largo < 7) return null;
      const alto = (b[i + 5] << 8) | b[i + 6], ancho = (b[i + 7] << 8) | b[i + 8];
      return ancho > 0 && alto > 0 ? { ancho, alto } : null;
    }
    i += 2 + largo;
  }
  return null;
}
