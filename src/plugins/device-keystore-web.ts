import type { DeviceKeystorePlugin } from "./device-keystore";

// DEV-ONLY fallback so login can be exercised in `npm run dev` without a
// rebuilt APK. This is NOT hardware-backed - the "private key" is an
// ordinary WebCrypto key sitting in this browser's IndexedDB, extractable by
// any script with page access. It must never ship in the production build
// (see device-keystore.ts, which only wires this in when import.meta.env.DEV
// is true - Vite dead-code-eliminates this whole module out of `npm run build`).

const DB_NAME = "yokohama-device-keystore-dev";
const STORE_NAME = "keys";
const KEY_ID = "device-key";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKeyPair) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function storeKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(keyPair, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// WebCrypto's ECDSA signature is raw (r || s), 32 bytes each for P-256.
// Android's Signature class (and the server's verification, which defaults
// to dsaEncoding: "der") expects DER. Convert so the same server code works
// whether the signature came from a real device or this dev fallback.
function rawSignatureToDer(raw: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(raw);
  const r = bytes.slice(0, 32);
  const s = bytes.slice(32, 64);

  function encodeInt(value: Uint8Array): number[] {
    let i = 0;
    while (i < value.length - 1 && value[i] === 0) i++;
    let trimmed = Array.from(value.slice(i));
    if (trimmed[0] & 0x80) trimmed = [0, ...trimmed];
    return [0x02, trimmed.length, ...trimmed];
  }

  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const body = [...rEnc, ...sEnc];
  return new Uint8Array([0x30, body.length, ...body]);
}

export class DeviceKeystoreWeb implements DeviceKeystorePlugin {
  async hasKey(): Promise<{ hasKey: boolean }> {
    const existing = await getStoredKeyPair();
    return { hasKey: Boolean(existing) };
  }

  async generateKeyPair(): Promise<{ publicKey: string }> {
    let keyPair = await getStoredKeyPair();
    if (!keyPair) {
      keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      await storeKeyPair(keyPair);
    }
    const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    return { publicKey: toBase64(spki) };
  }

  async sign(options: { data: string }): Promise<{ signature: string }> {
    const keyPair = await getStoredKeyPair();
    if (!keyPair) {
      throw new Error("No device key exists - call generateKeyPair first");
    }
    const raw = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      new TextEncoder().encode(options.data)
    );
    const der = rawSignatureToDer(raw);
    return { signature: toBase64(der.buffer as ArrayBuffer) };
  }
}
