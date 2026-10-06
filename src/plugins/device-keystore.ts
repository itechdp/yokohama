import { registerPlugin } from "@capacitor/core";

// Bridges to android/.../DeviceKeystorePlugin.java. The private key lives in
// the AndroidKeyStore and never crosses this bridge - only the public key and
// signatures over server-issued challenges do.
export interface DeviceKeystorePlugin {
  hasKey(): Promise<{ hasKey: boolean }>;
  // Idempotent: creates the key pair only if missing, always returns the public key.
  generateKeyPair(): Promise<{ publicKey: string }>;
  sign(options: { data: string }): Promise<{ signature: string }>;
}

// The web fallback is wired in only for local dev (`npm run dev`), so login
// can be exercised without a rebuilt APK. import.meta.env.DEV is statically
// false in `npm run build`, so Vite dead-code-eliminates the dynamic import
// (and all of device-keystore-web.ts) out of the production bundle entirely -
// the live site keeps requiring a real hardware-backed device, same as before.
export const DeviceKeystore = registerPlugin<DeviceKeystorePlugin>(
  "DeviceKeystore",
  import.meta.env.DEV
    ? { web: () => import("./device-keystore-web").then((m) => new m.DeviceKeystoreWeb()) }
    : {}
);
