import { registerPlugin } from "@capacitor/core";

// Bridges to android/.../KioskLockPlugin.java, which forwards to
// KioskHelper (fullscreen + screen pinning + keep-screen-on). No web
// fallback - kiosk mode only makes sense on-device, so every call site
// must guard with Capacitor.isNativePlatform() (see use-kiosk-lock.ts).
export interface KioskLockPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

export const KioskLock = registerPlugin<KioskLockPlugin>("KioskLock");
