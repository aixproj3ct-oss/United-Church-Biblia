// Cifrado del bosquejo que viaja del teléfono a la tablet. La clave sale del código de enlace (UC-XXXX-XXXX):
// quien no tiene el código solo ve texto sin sentido en ntfy. Usa solo Web Crypto, sin librerías.
import { normalizarCodigo } from "../proyeccion/mensajes.js";

const SAL = "uc-bosquejo-v1";
const ITERACIONES = 150000;

const aBase64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const deBase64 = txt => Uint8Array.from(atob(txt), c => c.charCodeAt(0));

// Mismo formato que temaDe, con otro prefijo: el tema del teléfono no es el de la pantalla.
export const temaTelefono = codigo => "uc-bosq-" + codigo.replace(/^UC-/, "").replace(/-/g, "").toLowerCase();

// Clave AES-GCM de 256 bits derivada del código con PBKDF2 (SHA-256).
export async function claveDe(codigo) {
  const cod = normalizarCodigo(codigo);
  if (!cod) throw new Error("Código no válido");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(cod), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(SAL), iterations: ITERACIONES },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Texto en base64 de: iv (12 bytes) + cifrado del JSON del objeto.
export async function cifrar(clave, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, new TextEncoder().encode(JSON.stringify(obj))));
  const todo = new Uint8Array(12 + cifrado.length);
  todo.set(iv); todo.set(cifrado, 12);
  return aBase64(todo);
}

// El objeto original, o null si la clave es otra o el texto está dañado. Nunca lanza.
export async function descifrar(clave, texto) {
  try {
    const bytes = deBase64(texto);
    if (bytes.length < 12 + 16) return null; // iv + etiqueta de AES-GCM
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, clave, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(claro));
  } catch { return null; }
}
