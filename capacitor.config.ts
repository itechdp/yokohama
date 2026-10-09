import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.itechdp.yokohama',
  appName: 'Crown Pvt. Ltd.',
  webDir: 'dist',
  server: {
    url: 'https://yokohama-rho.vercel.app',
    cleartext: false
  },
  plugins: {
    // use-kiosk-lock.ts's backButton listener fully owns all back-button
    // behavior (including the normal admin/login default), so Capacitor's
    // own native default handler is disabled to avoid double-firing.
    App: {
      disableBackButtonHandler: true
    }
  }
};

export default config;
